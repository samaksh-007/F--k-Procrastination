# F**k Procrastination

A browser extension that locks you out of the rest of the internet until
you've solved at least one LeetCode problem for the day.

<img width="440" height="845" alt="image" src="https://github.com/user-attachments/assets/48eb27d3-b48c-4c77-86ff-cfc092e44b20" />


## What this extension does

- **Blocks the rest of the web** until you solve a problem. Try to open
  anything that isn't allowed, and you get redirected straight back to
  `leetcode.com`.
- **Detects a solved problem automatically.** The moment a submission comes
  back "Accepted," you're unlocked — no button to click, no marking it
  yourself.
- **Works for any problem.** Easy, medium, hard, any topic — it doesn't
  matter which one you solve.
- **Resets every day at midnight**, your local time, so it's a real daily
  habit and not a one-time gate.
- **Whitelist** — sites that are always allowed, even before you've solved
  anything (e.g. Gmail, Google Docs).
- **Blacklist** — sites that are always blocked until you've solved
  something, even if you try (e.g. YouTube, Twitter).
- **Pause toggle** — an honest off-switch in the popup for days you genuinely
  need full access, instead of something hidden or hard to find.
- **Instant confirmation when you're unlocked** — a green banner pops up
  right on the LeetCode page, plus a desktop notification, the moment your
  solve is detected.

## Why use this instead of one of the many LeetCode extensions already out there

There's no shortage of LeetCode streak or focus extensions already. Two
things are usually wrong with them:

1. **They're too forgiving.** Easy to dismiss, snooze, or click past, so the
   "discipline" part doesn't really hold.
2. **They only count one specific problem.** Most only track the official
   *LeetCode Daily Challenge* — solve anything else, and it doesn't count
   toward your streak.

This extension doesn't discriminate between problems. It doesn't care which
one you pick. The moment **any** submission comes back Accepted, you're
unlocked for the day — because real practice means working through whatever
problems you're actually trying to learn from, not just whichever one
LeetCode happened to pick as today's official challenge.

## How to install it (Chrome or Edge)

1. downlaod or clone this repo in an folder
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**, and select the unzipped
   `leetcode-discipline-extension` folder.
5. Click the puzzle-piece icon in your toolbar and **pin** the extension, so
   its popup is one click away.

That's it — discipline mode is now active. Whenever you edit any of the
extension's files later, just come back to the extensions page and hit the
refresh icon on its card to load the changes.
