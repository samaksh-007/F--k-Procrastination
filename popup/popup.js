// =============================================================================
// popup.js
// =============================================================================
// Drives everything the user sees in the popup:
//   - Shows whether today's problem is solved (and recolors the lock icon).
//   - Lets the user pause/resume the extension.
//   - Lets the user edit the whitelist and blacklist, and save them.
//   - Switches between the "Status" and "Lists" tabs.
//
// All real data lives in chrome.storage.local — this file just reads it on
// open and writes back whenever the user changes something. background.js
// (and content.js / page-monitor.js on leetcode.com) do the actual
// enforcing and detecting; the popup is "just" a window into that state.
// =============================================================================

// ---- Two small inline SVGs used for the lock icon --------------------------
// Both use stroke="currentColor" so popup.css can recolor them per state
// just by changing a CSS `color` value — no need to swap colors in JS.

const ICON_LOCKED = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="11" width="16" height="9" rx="2"></rect>
    <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
  </svg>
`;

const ICON_UNLOCKED = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="11" width="16" height="9" rx="2"></rect>
    <path d="M8 11V7a4 4 0 0 1 7.5-2"></path>
    <path d="M9.5 15.5l1.8 1.8L14.5 14"></path>
  </svg>
`;

const ICON_PAUSED = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="11" width="16" height="9" rx="2"></rect>
    <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
    <path d="M10.5 14.5v3M13.5 14.5v3"></path>
  </svg>
`;

// Same date logic as background.js — kept in sync deliberately, since this
// file runs in a separate context and can't just import the other one.
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const statusCard = document.getElementById("statusCard");
const lockIcon = document.getElementById("lockIcon");
const statusLabel = document.getElementById("statusLabel");
const statusSub = document.getElementById("statusSub");
const disableToggle = document.getElementById("disableToggle");
const whitelistInput = document.getElementById("whitelistInput");
const blacklistInput = document.getElementById("blacklistInput");
const saveBtn = document.getElementById("saveBtn");
const saveConfirm = document.getElementById("saveConfirm");

// ---- Rendering the status card ---------------------------------------------

function renderStatus({ disabled, solvedDate }) {
  const solvedToday = solvedDate === getLocalDateString();

  statusCard.classList.remove("is-locked", "is-unlocked", "is-paused");

  if (disabled) {
    statusCard.classList.add("is-paused");
    lockIcon.innerHTML = ICON_PAUSED;
    statusLabel.textContent = "PAUSED";
    statusSub.textContent = "Discipline mode is off. Browse freely until you turn it back on.";
  } else if (solvedToday) {
    statusCard.classList.add("is-unlocked");
    lockIcon.innerHTML = ICON_UNLOCKED;
    statusLabel.textContent = "UNLOCKED";
    statusSub.textContent = "Nice work — today's problem is solved. Browse freely.";
  } else {
    statusCard.classList.add("is-locked");
    lockIcon.innerHTML = ICON_LOCKED;
    statusLabel.textContent = "LOCKED";
    statusSub.textContent = "Solve one LeetCode problem to unlock the rest of the web.";
  }
}

// ---- Loading current state from storage ------------------------------------

async function loadAndRender() {
  const { disabled, solvedDate, whitelist, blacklist } = await chrome.storage.local.get([
    "disabled",
    "solvedDate",
    "whitelist",
    "blacklist",
  ]);

  renderStatus({ disabled: !!disabled, solvedDate });
  disableToggle.checked = !!disabled;

  whitelistInput.value = (whitelist || []).join("\n");
  blacklistInput.value = (blacklist || []).join("\n");
}

loadAndRender();

// Keep the popup live: if solvedDate or disabled change while the popup is
// open (e.g. the background worker just detected an Accepted submission in
// another tab), reflect that immediately without needing to reopen.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.solvedDate || changes.disabled) {
    loadAndRender();
  }
});

// ---- Pause / resume toggle ---------------------------------------------------

disableToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ disabled: disableToggle.checked });
  // renderStatus() will also run via the onChanged listener above, but we
  // update right away too so the icon reacts instantly, with no flicker.
  const { solvedDate } = await chrome.storage.local.get("solvedDate");
  renderStatus({ disabled: disableToggle.checked, solvedDate });
});

// ---- Tabs --------------------------------------------------------------------

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tab-panel");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      t.classList.toggle("tab--active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    });
  });
});

// ---- Whitelist / blacklist saving --------------------------------------------

// Turns textarea content into a clean array of lowercase hostnames:
// splits on newlines AND commas, trims whitespace, drops empty lines.
function parseHostList(rawText) {
  return rawText
    .split(/[\n,]/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
}

saveBtn.addEventListener("click", async () => {
  const whitelist = parseHostList(whitelistInput.value);
  const blacklist = parseHostList(blacklistInput.value);

  await chrome.storage.local.set({ whitelist, blacklist });

  // Re-fill the textareas with the cleaned-up version, so the user sees
  // exactly what was saved (e.g. stray spaces or blank lines removed).
  whitelistInput.value = whitelist.join("\n");
  blacklistInput.value = blacklist.join("\n");

  saveConfirm.hidden = false;
  clearTimeout(saveBtn.__confirmTimeout);
  saveBtn.__confirmTimeout = setTimeout(() => {
    saveConfirm.hidden = true;
  }, 2000);
});
