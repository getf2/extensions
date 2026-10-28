<!--
Thanks for making one. Each pull request is read, all of it, before it's
merged: README.md's "What's looked for" is what's looked for. Delete the
notes (and any section that doesn't apply) as you go.
-->

**Extension:** `yourname.its-name` · **Version:** 1.0.0

## What it does

<!-- New: what it shows, its commands, who it's for. A change: what's
different, and why. -->

## What it reaches

<!-- Each host in permissions.network, and what's asked there. If it needs a
token: which kind, and why that one (read-only, where the service has
them). -->

## Tested

- [ ] `bun tools/check.mjs <its id>` passes
- [ ] Run in F2 (or with `bun tools/run.js`), with a real account if it needs one: …
- [ ] A change to one in the store: its `version` is raised

## Screenshots

<!-- Its pages in Quick Open. -->

## What's looked for

- [ ] It asks for only what it needs: the fewest hosts, read-only tokens where there are some
- [ ] Nothing about its user goes anywhere but to the service it's for
- [ ] Tokens and passwords are preferences (`"type": "password"`), asked for no other way
- [ ] Its code can be read: nothing minified, obfuscated or fetched to run
