# F2 Extensions

The extensions in [F2](https://getf2.com)'s store ([F2's own code](https://github.com/getf2/f2) is open source too): commands for its Quick
Open, in JavaScript, each in a folder of its own here. F2 lists them in
Settings › Extensions › Browse, and installs and updates them for you.

Each runs in F2's sandbox: it can show things, keep its settings, and
reach only the websites its manifest names. It can't read your files or
run anything else. What F2 installs is what's merged here: the store's
list of them is signed, and each file's checked against it.

## In the store

[`extensions/`](extensions): Wikipedia, Hacker News, MDN, Can I Use,
Tailwind CSS, Homebrew, crates.io, PyPI, npm, Lorem Ipsum and Kaomoji
need no account. GitHub, Linear, Jira, Notion, Todoist, Vercel, Railway
and Cloudflare work with a token of yours, kept in your Mac's keychain.

## Writing one

In F2, **New Extension…** (Settings › Extensions, or "New Extension" in
Quick Open) makes one, ready to run: change it, save, and its page in
Quick Open runs again. [docs/EXTENSIONS.md](docs/EXTENSIONS.md) says
everything F2 understands; [types/f2.d.ts](types/f2.d.ts) is F2's API, for
your editor.

To try one here, without F2 (as F2 runs it, with only what its sandbox
has):

```sh
bun install
bun tools/run.js extensions/f2.wikipedia search "alan turing"
bun tools/run.js extensions/f2.hacker-news comments --args '{"id": 8863}'
```

## Adding yours

1. Fork this, and put yours in `extensions/<your GitHub name>.<its name>/`,
   with `"id"` the same in its `f2.json`: `extensions/jane.linear/`.
2. It's JavaScript (`"runtime": "javascript"`, or TypeScript built to it:
   see `f2.npm`), with a `"version"`, `"1.0.0"` to start. Each change
   raises it: that's how F2 knows to update it.
3. Check it: `bun tools/check.mjs <its id>`.
4. Open a pull request. The same check runs on it, and then someone
   reads it, all of it, before it's merged.

What's looked for:

- **It does what it says,** and asks for only what it needs: the fewest
  hosts in `permissions.network`, read-only tokens where a service has
  them.
- **Nothing about you goes anywhere** but to the service it's for: no
  analytics, no tracking, no other servers.
- **Passwords and tokens are preferences** (`"type": "password"`): F2
  keeps them in the keychain. It never asks for them any other way.
- **Its code can be read:** no minified or obfuscated code, nothing
  fetched to run. A TypeScript one's `index.js` is its `index.ts` built
  (the check builds it again to see).
- Yours, by your GitHub name; F2's are `f2.`. You change only your own.

## How it's published

Each merge publishes to [getf2.github.io/extensions](https://getf2.github.io/extensions/)
([`tools/build.mjs`](tools/build.mjs)): `v1/index.json`, every extension
and each of its files' SHA-256, signed (Ed25519) in `v1/index.json.sig`,
and the files themselves. F2 checks the signature with the key it has,
and each file it downloads against the list.

## License

MIT (see [LICENSE](LICENSE)), each extension's too, unless its folder says
otherwise.
