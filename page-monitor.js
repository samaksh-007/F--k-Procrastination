// =============================================================================
// page-monitor.js
// =============================================================================
// IMPORTANT: this file runs in the "MAIN world" — the same JavaScript
// context as the actual LeetCode page (not the usual isolated sandbox that
// content scripts normally get). That's on purpose: it's the only way to
// see the same window.fetch / XMLHttpRequest calls that LeetCode's own
// React code is making, so we can notice a submission result as it happens.
//
// This script does NOT have access to chrome.* APIs (the main world never
// does). So whenever it detects an "Accepted" result, it just shouts about
// it using a CustomEvent. content.js (a normal, isolated content script)
// is listening for that event and relays it to the background service
// worker, which is the only place chrome.storage / chrome.runtime live.
//
// v1.1 update: the first version only inspected responses whose URL matched
// a guessed pattern (e.g. "/submissions/detail/"). LeetCode's real submission
// flow may use a different path (it leans heavily on a single "/graphql"
// endpoint with many different operation names), so a narrow URL filter can
// quietly miss the result entirely. This version instead inspects EVERY
// JSON network response and searches it recursively for an accepted signal,
// which is slightly slower per-request but negligibly so, and far less
// likely to miss a real result.
// =============================================================================

(function () {
  const EVENT_NAME = "leetcode-discipline:accepted";

  // Flip this to false once you've confirmed everything works, if you'd
  // rather not see these lines in the DevTools console. Open the console
  // on a LeetCode problem page (F12 → Console) and look for "[LCD]" lines —
  // if you submit a solution and never see "ACCEPTED DETECTED", that tells
  // us the network shape still doesn't match and we need to adjust further.
  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log("[LCD]", ...args);
  }

  // Fires the custom event that content.js listens for.
  function announceAccepted(source, evidence) {
    log("✅ ACCEPTED DETECTED via", source, evidence);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { source } }));
  }

  // ---------------------------------------------------------------------
  // Recursively walks a parsed JSON body (objects + arrays, to a bounded
  // depth) looking for any field that signals a fully-accepted submission.
  // LeetCode's GraphQL responses nest data several levels deep depending
  // on the query, e.g. { data: { submissionDetail: { statusDisplay: ... }}}
  // — rather than guess the exact shape, we just search every key.
  //
  // Returns the matching sub-object (for debug logging) or null.
  // ---------------------------------------------------------------------
  function findAcceptedSignal(value, depth = 0) {
    if (depth > 6 || value === null || typeof value !== "object") return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findAcceptedSignal(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    // Direct signals, in the various shapes LeetCode has used over time:
    //   status_msg: "Accepted"        (classic REST "check" endpoint)
    //   statusDisplay: "Accepted"     (GraphQL, human-readable display)
    //   status_code: 10               (LeetCode's numeric code for Accepted)
    if (
      value.status_msg === "Accepted" ||
      value.statusDisplay === "Accepted" ||
      (value.status_code === 10 && ("status_msg" in value || "statusDisplay" in value))
    ) {
      return value;
    }

    for (const key of Object.keys(value)) {
      const found = findAcceptedSignal(value[key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  function inspectJsonBody(json, source, url) {
    const match = findAcceptedSignal(json);
    if (match) {
      announceAccepted(source, { url, match });
    }
  }

  // ---- Patch window.fetch --------------------------------------------------
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      const contentType = response.headers.get("content-type") || "";

      // Only bother parsing things that are plausibly JSON — skips images,
      // scripts, HTML, etc. without needing to guess the exact API path.
      if (contentType.includes("json")) {
        response
          .clone()
          .json()
          .then((json) => {
            log("inspecting fetch response from", url);
            inspectJsonBody(json, "fetch", url);
          })
          .catch(() => {
            /* body wasn't valid JSON despite the content-type — ignore */
          });
      }
    } catch (e) {
      /* never let our monitoring break the real page */
    }

    return response;
  };

  // ---- Patch XMLHttpRequest -------------------------------------------------
  // LeetCode has used plain XHR for some calls historically, so this path is
  // covered too in case fetch isn't used everywhere.
  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    const originalOpen = xhr.open;

    xhr.open = function (method, url, ...rest) {
      xhr.__lcdUrl = url;
      return originalOpen.call(xhr, method, url, ...rest);
    };

    xhr.addEventListener("load", function () {
      try {
        const contentType = xhr.getResponseHeader("content-type") || "";
        if (contentType.includes("json") && xhr.responseText) {
          log("inspecting XHR response from", xhr.__lcdUrl);
          const json = JSON.parse(xhr.responseText);
          inspectJsonBody(json, "xhr", xhr.__lcdUrl);
        }
      } catch (e) {
        /* not JSON, or some other shape — ignore */
      }
    });

    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;

  log("page-monitor.js active — watching network traffic for an Accepted result.");
})();
