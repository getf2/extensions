#!/usr/bin/env bun
// Checks the store's extensions, all of them or those a pull request
// changes, before they're merged and before each publish:
//
//   bun tools/check.mjs                         all of them
//   bun tools/check.mjs f2.wikipedia            one
//   bun tools/check.mjs --changed origin/main --author jane --association NONE
//   bun tools/check.mjs --offline               nothing run (no network)
//
// Each extension:
// - its folder is named by its id, whose first part is its author's GitHub
//   name ("jane.linear"), or "f2" (F2's own, by the getf2 organization);
// - its manifest is as types/f2.schema.json says, with a version, raised
//   whenever it changes;
// - it's JavaScript, which F2 runs in its sandbox (a program can't be in the
//   store), its index.js its index.ts built if it's TypeScript;
// - its files are few and small, and its types check;
// - its icons are SF Symbols (on a Mac);
// - and its commands run (as F2 runs them: tools/run.js) without a mistake
//   in what they show.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv from 'ajv'

const root = new URL('..', import.meta.url).pathname
const flags = { changed: null, author: null, association: null, offline: false, only: [] }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--changed') flags.changed = argv[++i]
  else if (argv[i] === '--author') flags.author = argv[++i]
  else if (argv[i] === '--association') flags.association = argv[++i]
  else if (argv[i] === '--offline') flags.offline = true
  else flags.only.push(argv[i])
}
// (Its maintainers: they may change any of it.)
const maintainer = ['OWNER', 'MEMBER'].includes(flags.association ?? 'OWNER')

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const schema = JSON.parse(readFileSync(join(root, 'types/f2.schema.json'), 'utf8'))
const valid = new Ajv({ allErrors: true, strict: false }).compile(schema)

// The files an extension may have, and how big.
const KINDS = /\.(js|ts|json|md|png)$/
const MOST_FILE = 1 << 20
const MOST_ALL = 2 << 20

const problems = new Map()
const notes = new Map()
const say = (map, id, what) => map.set(id, [...(map.get(id) ?? []), what])

// Which to check.
let ids = readdirSync(join(root, 'extensions')).filter((d) => statSync(join(root, 'extensions', d)).isDirectory()).sort()
if (flags.changed) {
  const files = git('diff', '--name-only', `${flags.changed}...HEAD`).split('\n').filter(Boolean)
  const touched = new Set(files.filter((f) => f.startsWith('extensions/')).map((f) => f.split('/')[1]))
  const outside = files.filter((f) => !f.startsWith('extensions/'))
  if (outside.length && !maintainer) say(problems, 'the store', `Only its maintainers change files outside extensions/: ${outside.join(', ')}.`)
  for (const id of touched) {
    if (!ids.includes(id) && !maintainer) say(problems, id, 'Only its maintainers take an extension out of the store.')
  }
  ids = ids.filter((id) => touched.has(id))
}
if (flags.only.length) ids = ids.filter((id) => flags.only.includes(id))

// (macOS's SF Symbols, to check icons' names by: on a Mac.)
let symbols = null
if (process.platform === 'darwin') {
  const tool = join(mkdtempSync(join(tmpdir(), 'f2-check-')), 'sfsym')
  execFileSync('clang', ['-fobjc-arc', '-framework', 'AppKit', join(root, 'tools/sfsym.m'), '-o', tool])
  symbols = tool
}

/** "1.10.0" after "1.9.2". */
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

for (const id of ids) {
  const dir = join(root, 'extensions', id)
  const problem = (what) => say(problems, id, what)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'f2.json'), 'utf8'))
  } catch (e) {
    problem(`f2.json: ${e.message}`)
    continue
  }
  if (!valid(manifest)) for (const e of valid.errors) problem(`f2.json${e.instancePath}: ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`)
  if (manifest.id !== id) problem(`Its folder is named by its id: extensions/${manifest.id}, not extensions/${id}.`)
  if (!manifest.version) problem('It needs a "version" ("1.0.0"), raised whenever it changes.')
  if (manifest.runtime !== 'javascript' || manifest.run) problem('The store has only JavaScript ones ("runtime": "javascript"): a program runs as you, outside F2\'s sandbox.')

  // Whose it is.
  const author = String(manifest.id ?? '').split('.')[0]
  if (flags.author && !maintainer) {
    if (author === 'f2') problem('"f2." is F2\'s own: yours starts with your GitHub name.')
    else if (author !== flags.author.toLowerCase()) problem(`Its id starts with its author's GitHub name: "${flags.author.toLowerCase()}.", not "${author}.".`)
  }

  // Its files.
  let all = 0
  for (const f of readdirSync(dir)) {
    const s = statSync(join(dir, f))
    if (s.isDirectory()) problem(`${f}/: an extension's files are in its folder, not in folders of their own.`)
    else if (!KINDS.test(f)) problem(`${f}: only .js, .ts, .json, .md and .png files.`)
    else if (s.size > MOST_FILE) problem(`${f}: ${(s.size / 1e6).toFixed(1)} MB; a file's 1 MB at most.`)
    all += s.size
  }
  if (all > MOST_ALL) problem(`${(all / 1e6).toFixed(1)} MB in all; an extension's 2 MB at most.`)
  const main = manifest.main ?? 'index.js'
  if (!existsSync(join(dir, main))) problem(`Its "main" (${main}) isn't in its folder.`)

  // Raised, if it changed.
  if (flags.changed && manifest.version) {
    const before = spawnSync('git', ['show', `${flags.changed}:extensions/${id}/f2.json`], { cwd: root, encoding: 'utf8' })
    if (before.status === 0) {
      const was = JSON.parse(before.stdout).version
      if (was && !newer(manifest.version, was)) problem(`It changed, so its version goes up from ${was} (to ${was.replace(/\d+$/, (n) => Number(n) + 1)}, say).`)
    }
  }

  // Built as it says, and its types.
  if (existsSync(join(dir, 'index.ts'))) {
    const out = join(mkdtempSync(join(tmpdir(), 'f2-build-')), 'index.js')
    const built = spawnSync('bun', ['build', `${id}/index.ts`, '--target=browser', '--format=iife', '--outfile', out], { cwd: join(root, 'extensions'), encoding: 'utf8' })
    if (built.status !== 0) problem(`index.ts doesn't build: ${built.stderr.trim()}`)
    else if (readFileSync(out, 'utf8') !== readFileSync(join(dir, main), 'utf8')) problem(`${main} isn't index.ts as it's built now: cd extensions && bun build ${id}/index.ts --target=browser --format=iife --outfile ${id}/${main}`)
  }
  const config = ['jsconfig.json', 'tsconfig.json'].find((c) => existsSync(join(dir, c)))
  if (!config) problem('It needs a jsconfig.json (or a tsconfig.json, for TypeScript): see the others.')
  else {
    const tsc = spawnSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(dir, config)], { cwd: root, encoding: 'utf8' })
    if (tsc.status !== 0) problem(`Its types: ${(tsc.stdout + tsc.stderr).trim()}`)
  }

  // Its icons.
  if (symbols) {
    const named = [manifest.icon, ...(manifest.commands ?? []).map((c) => c.icon)]
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.js') && f === main)) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/icon: *"([^"]+)"/g)) named.push(m[1])
    }
    const names = [...new Set(named.filter((n) => n && /^[a-z0-9.]+$/.test(n) && !/\.(png|jpe?g)$/.test(n)))]
    const checked = spawnSync(symbols, names, { encoding: 'utf8' })
    for (const line of checked.stdout.split('\n').filter((l) => l.startsWith('not a symbol'))) problem(`${line}: an SF Symbol's name (see Apple's SF Symbols app).`)
  } else say(notes, id, "Its icons' names weren't checked (not on a Mac).")

  // Its commands, run.
  if (!flags.offline) {
    for (const c of (manifest.commands ?? []).filter((c) => !c.hidden)) {
      const run = spawnSync('bun', [join(root, 'tools/run.js'), dir, c.id], { cwd: root, encoding: 'utf8', timeout: 60_000 })
      const out = `${run.stdout ?? ''}`
      for (const line of out.split('\n').filter((l) => l.includes('⚠'))) problem(`${c.id}: ${line.trim()}`)
      const failed = /✗ (.*)/.exec(out)?.[1]
      if (run.status === 2) say(notes, id, `${c.id}: not run (${(run.stderr || out).trim().split('\n')[0]})`)
      else if (failed && /^(TypeError|ReferenceError|SyntaxError|RangeError|EvalError)/.test(failed)) problem(`${c.id}: ${failed}`)
      else if (failed) say(notes, id, `${c.id}: said “${failed}”`)
      else if (run.status !== 0) problem(`${c.id}: it didn't finish (${run.signal ?? run.status}).`)
    }
  }
}

for (const id of [...new Set([...ids, ...problems.keys()])]) {
  const bad = problems.get(id) ?? []
  console.log(`${bad.length ? '✗' : '✓'} ${id}`)
  for (const p of bad) console.log(`    ${p}`)
  for (const n of notes.get(id) ?? []) console.log(`    · ${n}`)
}
if (!ids.length && !problems.size) console.log('No extensions changed.')
process.exit(problems.size ? 1 : 0)
