#!/usr/bin/env bun
// What's published (GitHub Pages: https://getf2.github.io/extensions/),
// built into `out`:
//
// - v1/index.json: every extension, its version, what it does and may do,
//   and each of its files, by its address and SHA-256;
// - v1/index.json.sig: index.json's Ed25519 signature, by the key in
//   INDEX_SIGNING_KEY (PEM), which F2 checks against the public key it
//   has: what F2 installs is what was merged here, whoever serves it;
// - v1/<id>/<version>/<file>: each of their files (not TypeScript sources
//   or editors' settings: what F2 runs);
// - index.html: a page listing them.
//
//   bun tools/build.mjs _site

import { spawnSync } from 'node:child_process'
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const out = process.argv[2] ?? '_site'
const kept = (f) => !f.endsWith('.ts') && f !== 'jsconfig.json' && f !== 'tsconfig.json'
const html = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const extensions = []
for (const id of readdirSync(join(root, 'extensions')).sort()) {
  const dir = join(root, 'extensions', id)
  if (!statSync(dir).isDirectory()) continue
  const m = JSON.parse(readFileSync(join(dir, 'f2.json'), 'utf8'))
  const path = `v1/${id}/${m.version}/`
  mkdirSync(join(out, path), { recursive: true })
  const files = readdirSync(dir)
    .filter(kept)
    .sort()
    .map((name) => {
      const bytes = readFileSync(join(dir, name))
      copyFileSync(join(dir, name), join(out, path, name))
      return { name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    })
  // (When it last changed: its last commit's, if it has one yet.)
  const updated = spawnSync('git', ['log', '-1', '--format=%cI', '--', `extensions/${id}`], { cwd: root, encoding: 'utf8' }).stdout?.trim()
  extensions.push({
    id,
    version: m.version,
    api: m.api,
    name: m.name,
    description: m.description ?? '',
    icon: m.icon ?? null,
    color: m.color ?? null,
    author: id.split('.')[0],
    network: m.permissions?.network ?? [],
    commands: (m.commands ?? []).filter((c) => !c.hidden).map((c) => ({ title: c.title, subtitle: c.subtitle ?? null, keyword: c.keyword ?? null })),
    preferences: (m.preferences ?? []).map((p) => ({ title: p.title, type: p.type ?? 'text', required: !!p.required })),
    updated: updated || null,
    path,
    files,
  })
}

const index = Buffer.from(`${JSON.stringify({ api: 1, store: 'getf2/extensions', generated: new Date().toISOString(), extensions }, null, 1)}\n`)
mkdirSync(join(out, 'v1'), { recursive: true })
writeFileSync(join(out, 'v1/index.json'), index)
if (process.env.INDEX_SIGNING_KEY) {
  const key = createPrivateKey(process.env.INDEX_SIGNING_KEY)
  writeFileSync(join(out, 'v1/index.json.sig'), `${sign(null, index, key).toString('base64')}\n`)
} else {
  console.warn('No INDEX_SIGNING_KEY: index.json left unsigned (F2 won\'t take it).')
}

const rows = extensions.map((e) => `<li><b>${html(e.name)}</b> <code>${html(e.id)}</code> ${html(e.version)}<br>${html(e.description)}</li>`).join('\n')
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>F2 Extensions</title><style>body{font:15px/1.5 -apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 20px}li{margin:10px 0}code{color:#666}</style>
<h1>F2 Extensions</h1><p>For <a href="https://getf2.com">F2</a>: install them in F2, Settings › Extensions › Browse. Their source, and how to add yours: <a href="https://github.com/getf2/extensions">github.com/getf2/extensions</a>.</p>
<ul>${rows}</ul>\n`,
)
writeFileSync(join(out, '.nojekyll'), '')
console.log(`${extensions.length} extensions, into ${out}/`)
