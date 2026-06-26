// =============================================================================
// content.js
// =============================================================================
// This script runs in the normal, isolated content-script world (unlike
// page-monitor.js). It can't see the page's own fetch calls directly, but
// it CAN talk to chrome.runtime — which page-monitor.js cannot do. So its
// job is simple: listen for the signal from page-monitor.js, and pass it
// along to the background service worker.
//
// As a second line of defense, it also watches the page's visible text for
// the word "Accepted" showing up the way LeetCode shows it after a
// successful run. This DOM fallback exists in case LeetCode changes its
// network API shape before this extension gets updated to match — the
// word "Accepted" appearing as the headline result is a much more
// stable, human-visible signal that's less likely to vanish in a redesign.
//
// It also injects a small green "Problem Solved!" toast directly into the
// LeetCode page the moment a solve is detected, as immediate visual
// feedback (separate from the desktop notification background.js fires).
// =============================================================================

(function () {
  // Same debug switch as page-monitor.js — flip to false once things are
  // confirmed working. Look for "[LCD]" lines in the DevTools console.
  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log("[LCD]", ...args);
  }

  // Make sure we only ever report "solved" once per page load, even if the
  // signal fires multiple times (e.g. re-submitting after already passing).
  let alreadyReported = false;

  function reportAccepted(source) {
    if (alreadyReported) return;
    alreadyReported = true;
    log("reportAccepted() firing — source:", source);
    showSolvedToast();
    chrome.runtime.sendMessage({ type: "LEETCODE_ACCEPTED", source }, () => {
      // No response handling needed — background.js just stores the date.
      // Reading chrome.runtime.lastError here avoids an "unchecked error"
      // warning in the console if the background worker was asleep.
      void chrome.runtime.lastError;
    });
  }

  // ---------------------------------------------------------------------
  // The celebratory green toast, injected directly into the LeetCode page.
  // It's built entirely with inline styles (rather than a linked
  // stylesheet) so it can't be affected by — or accidentally affect —
  // LeetCode's own CSS. A unique class prefix ("lcd-") keeps it safely
  // out of the way of the page's existing class names too.
  // ---------------------------------------------------------------------
  function showSolvedToast() {
    // Inject the toast's own tiny stylesheet once.
    if (!document.getElementById("lcd-toast-style")) {
      const style = document.createElement("style");
      style.id = "lcd-toast-style";
      style.textContent = `
        @keyframes lcd-toast-in {
          from { transform: translateY(-16px); opacity: 0; }
          to   { transform: translateY(0);      opacity: 1; }
        }
        @keyframes lcd-toast-out {
          from { transform: translateY(0);      opacity: 1; }
          to   { transform: translateY(-16px); opacity: 0; }
        }
        .lcd-toast {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 2147483647; /* sit above absolutely everything on the page */
          display: flex;
          align-items: flex-start;
          gap: 12px;
          max-width: 320px;
          padding: 14px 16px;
          background: #0a1628;
          border: 1px solid rgba(34, 197, 94, 0.45);
          border-radius: 14px;
          box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.15), 0 12px 28px rgba(0, 0, 0, 0.45);
          font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          animation: lcd-toast-in 0.25s ease-out;
        }
        .lcd-toast__icon {
          flex: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.16);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lcd-toast__title {
          margin: 0;
          font-size: 13.5px;
          font-weight: 700;
          color: #22c55e;
        }
        .lcd-toast__sub {
          margin: 3px 0 0;
          font-size: 12px;
          line-height: 1.4;
          color: #9fb4c4;
        }
        .lcd-toast__close {
          flex: none;
          margin-left: auto;
          background: none;
          border: none;
          color: #5d7a8c;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          padding: 2px;
        }
        .lcd-toast__close:hover { color: #9fb4c4; }
      `;
      document.head.appendChild(style);
    }

    const toast = document.createElement("div");
    toast.className = "lcd-toast";
    toast.innerHTML = `
      <span class="lcd-toast__icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 13l4 4L19 7"></path>
        </svg>
      </span>
      <div>
        <p class="lcd-toast__title">Problem Solved!</p>
        <p class="lcd-toast__sub">You've unlocked the rest of the web for today.</p>
      </div>
      <button class="lcd-toast__close" aria-label="Dismiss">✕</button>
    `;

    document.body.appendChild(toast);

    function dismiss() {
      toast.style.animation = "lcd-toast-out 0.2s ease-in forwards";
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    }

    toast.querySelector(".lcd-toast__close").addEventListener("click", dismiss);
    setTimeout(dismiss, 5000); // auto-dismiss after 5 seconds
  }

  // ---- Primary signal: network detection from page-monitor.js -----------
  window.addEventListener("leetcode-discipline:accepted", (event) => {
    reportAccepted(event.detail?.source || "network");
  });

  // ---- Fallback signal: watch the visible page text ----------------------
  // LeetCode shows the word "Accepted" as a short, prominent status after a
  // successful submission (commonly in green, near the top of the result
  // panel), sometimes combined with runtime/memory stats in the same text
  // node (e.g. "Accepted Runtime: 52 ms"). We match text that STARTS WITH
  // "Accepted" and is reasonably short, rather than requiring an exact
  // match — short-and-prefixed keeps false positives low (a forum post or
  // long sentence mentioning "accepted" elsewhere won't match) while still
  // catching minor formatting differences.
  function looksLikeAcceptedText(text) {
    return text.length > 0 && text.length < 60 && text.startsWith("Accepted");
  }

  function scanForAcceptedText(root) {
    if (alreadyReported) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (looksLikeAcceptedText(text)) {
        log('DOM fallback matched text node:', JSON.stringify(text));
        reportAccepted("dom-text");
        return;
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (alreadyReported) {
      observer.disconnect();
      return;
    }
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanForAcceptedText(node);
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (looksLikeAcceptedText(text)) {
            log('DOM fallback matched text node:', JSON.stringify(text));
            reportAccepted("dom-text");
          }
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  log("content.js active — listening for network signal + watching DOM text.");
})();
