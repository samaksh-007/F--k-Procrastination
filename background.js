// =============================================================================
// background.js
// =============================================================================
// This file runs in the background as a "service worker". It has no visible
// window of its own — think of it as the extension's brain, always quietly
// watching and making decisions. It is responsible for four jobs:
//
//   1. Remembering whether today's LeetCode problem has been solved.
//   2. Resetting that "solved" status every day at local midnight.
//   3. Watching every tab navigation and redirecting back to LeetCode if the
//      destination isn't allowed yet.
//   4. Listening for a message from content.js that says "Accepted!" and
//      marking the day as solved.
// =============================================================================

// ---------------------------------------------------------------------------
// Default whitelist / blacklist used the very first time the extension runs.
// The user can change these later from the popup.
// ---------------------------------------------------------------------------
const DEFAULT_WHITELIST = [
  "leetcode.com",
  "mail.google.com",
  "docs.google.com",
  "accounts.google.com",
  "calendar.google.com",
];

const DEFAULT_BLACKLIST = [
  "youtube.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "reddit.com",
  "netflix.com",
  "tiktok.com",
];

const LEETCODE_PROBLEMSET_URL = "https://leetcode.com/problemset/all/";

// ---------------------------------------------------------------------------
// Small helper functions
// ---------------------------------------------------------------------------

// Returns "today" as a "YYYY-MM-DD" string using the LOCAL timezone.
// Using local time (instead of UTC) is what makes "reset at local midnight"
// actually mean midnight where the user lives.
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Pulls just the hostname out of a full URL.
// "https://www.youtube.com/watch?v=123" -> "www.youtube.com"
function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (e) {
    return ""; // not a real URL (e.g. "chrome://newtab") — nothing to check
  }
}

// Does `hostname` match an entry in `list`?
// A hostname matches if it IS the entry, or is a sub-domain of it.
// e.g. "www.youtube.com" matches the list entry "youtube.com".
function hostMatchesList(hostname, list) {
  if (!hostname || !Array.isArray(list)) return false;
  return list.some((entry) => {
    const clean = String(entry).trim().toLowerCase();
    if (!clean) return false;
    return hostname === clean || hostname.endsWith("." + clean);
  });
}

// ---------------------------------------------------------------------------
// Storage setup & daily reset logic
// ---------------------------------------------------------------------------

// Fills in any missing storage values with sensible defaults.
// Safe to call every time the extension starts — it never overwrites
// values the user already has.
async function initializeDefaults() {
  const stored = await chrome.storage.local.get([
    "whitelist",
    "blacklist",
    "disabled",
    "solvedDate",
    "lastCheckedDate",
  ]);

  const updates = {};
  if (!stored.whitelist) updates.whitelist = DEFAULT_WHITELIST;
  if (!stored.blacklist) updates.blacklist = DEFAULT_BLACKLIST;
  if (stored.disabled === undefined) updates.disabled = false;
  if (stored.solvedDate === undefined) updates.solvedDate = null; // null = not solved yet
  if (!stored.lastCheckedDate) updates.lastCheckedDate = getLocalDateString();

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

// Returns true only if `solvedDate` in storage matches TODAY's date.
// This is the key trick that makes the daily reset "automatic": we never
// have to manually clear anything — a new day means solvedDate no longer
// equals today, so this just naturally returns false again.
async function isSolvedToday() {
  const { solvedDate } = await chrome.storage.local.get("solvedDate");
  return solvedDate === getLocalDateString();
}

// Keeps `lastCheckedDate` up to date. Mostly used so the popup UI can show
// an accurate "today" without recalculating it itself.
async function refreshDailyState() {
  const today = getLocalDateString();
  const { lastCheckedDate } = await chrome.storage.local.get("lastCheckedDate");
  if (lastCheckedDate !== today) {
    await chrome.storage.local.set({ lastCheckedDate: today });
  }
}

// ---------------------------------------------------------------------------
// The core decision: is this hostname allowed right now?
// ---------------------------------------------------------------------------
async function isHostAllowed(hostname) {
  const { disabled, whitelist, blacklist } = await chrome.storage.local.get([
    "disabled",
    "whitelist",
    "blacklist",
  ]);

  // Extension paused by the user? Allow everything.
  if (disabled) return true;

  // Already solved today's problem? Allow everything — discipline mode
  // only restricts browsing UNTIL you've solved one problem.
  if (await isSolvedToday()) return true;

  // LeetCode itself must always be reachable — otherwise the user could
  // never get to a problem to solve it!
  if (hostMatchesList(hostname, ["leetcode.com"])) return true;

  // Blacklisted sites are blocked even if they accidentally also appear in
  // the whitelist — the blacklist always wins, as an extra safety net.
  if (hostMatchesList(hostname, blacklist)) return false;

  // Explicitly whitelisted sites (Gmail, Docs, etc.) are always fine.
  if (hostMatchesList(hostname, whitelist)) return true;

  // Everything else: not solved yet + not whitelisted = blocked.
  return false;
}

// ---------------------------------------------------------------------------
// Navigation guarding — this is what actually redirects the tab.
// ---------------------------------------------------------------------------
async function guardNavigation(tabId, url) {
  // Only look at real web pages. Skips chrome://, about:blank, file://,
  // extension pages, etc., since those aren't useful (or safe) to redirect.
  if (!url || !/^https?:\/\//i.test(url)) return;

  await refreshDailyState();

  const hostname = getHostname(url);
  if (!hostname) return;

  const allowed = await isHostAllowed(hostname);
  if (!allowed) {
    chrome.tabs.update(tabId, { url: LEETCODE_PROBLEMSET_URL });
  }
}

// Fires just BEFORE a navigation happens, so we can redirect before the
// blocked page even starts loading (almost no visible flash).
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // ignore iframes/ads, only the main page
  guardNavigation(details.tabId, details.url);
});

// A safety-net listener in case some navigations slip past the one above
// (e.g. certain client-side redirects). Only acts when the URL changed.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    guardNavigation(tabId, changeInfo.url);
  }
});

// ---------------------------------------------------------------------------
// Daily reset alarm
// ---------------------------------------------------------------------------
// We don't need to "clear" the solved flag at midnight — isSolvedToday()
// already does that automatically, since solvedDate stops matching today's
// date. This alarm just nudges refreshDailyState() so the popup's
// lastCheckedDate stays fresh even if the popup isn't open at midnight.
function scheduleMidnightAlarm() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // tomorrow at 00:00:00
    0,
    0,
    0,
    0
  );
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  chrome.alarms.create("dailyReset", {
    delayInMinutes: msUntilMidnight / 60000,
    periodInMinutes: 24 * 60, // keep firing once every 24 hours after that
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyReset") {
    refreshDailyState();
  }
});

// ---------------------------------------------------------------------------
// Messages from content.js (running on leetcode.com)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "LEETCODE_ACCEPTED") {
    (async () => {
      const today = getLocalDateString();
      const { solvedDate } = await chrome.storage.local.get("solvedDate");
      const isNewSolveToday = solvedDate !== today;

      await chrome.storage.local.set({ solvedDate: today });

      // Only fire the desktop notification the FIRST time today flips to
      // "solved" — re-submitting an already-accepted solution later in the
      // day shouldn't spam the user with repeat notifications.
      if (isNewSolveToday) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: "✅ Problem Solved!",
          message: "Nice work — you've unlocked the rest of the web for today.",
        });
      }

      sendResponse({ ok: true });
    })();
    return true; // tells Chrome we'll call sendResponse asynchronously
  }
});

// ---------------------------------------------------------------------------
// Startup hooks
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  initializeDefaults();
  scheduleMidnightAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  refreshDailyState();
  scheduleMidnightAlarm();
});

// Service workers can be unloaded by Chrome when idle, so also run the
// setup once right away when this file is first evaluated.
initializeDefaults();
scheduleMidnightAlarm();
