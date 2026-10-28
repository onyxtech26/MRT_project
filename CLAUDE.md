# Working rules for this project

- **Never assume what the shop's existing data means. Ask the owner first.** Before changing how existing
  numbers are treated (e.g. whether a KEEP / RP already on the sheet was taken off SHOP), or adding any rule
  about the meaning of the data, ask and wait for the answer. An earlier guess about existing KEEP / RP numbers
  caused wrong SHOP figures.
- **A number changes SHOP when it is keyed in, once, never again.** See "Golden rule" in `docs/DEVELOPER.md`.
- After any change: run `npm test` and the full audit `xvfb-run node test/e2e/audit.js` (see `docs/DEVELOPER.md`).
