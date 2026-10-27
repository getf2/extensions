// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Homebrew: its formulae and casks found as you type, in a list of them all
// kept here a day (from formulae.brew.sh: what brew itself downloads, with
// the last 30 days' installs), so a search asks nothing of the internet.

const API = "https://formulae.brew.sh/api"
// Every formula and cask in one list, as brew itself gets them (its
// "internal" one, 16 MB, for one kind of Mac: what's said of each is the
// same for any; the next if one's gone). The documented formula.json is
// too big to fetch (32 MB), and cask.json nearly (19 MB).
const TAGS = ["arm64_tahoe", "arm64_sequoia"]
const DAY = 86_400_000
const MOST = 30
const PLACEHOLDER = "Search formulae and casks…"

/**
 * One formula or cask, as kept.
 * @typedef {{ name: string, cask?: boolean, title?: string, desc: string, version: string, homepage: string, installs: number, app?: string, license?: string, aliases?: string[], state?: string }} Package
 * @typedef {{ at: number, packages: Package[] }} Index
 */

/** @param {string} path */
async function get(path) {
  const response = await fetch(`${API}/${path}`)
  if (!response.ok) throw new Error(`formulae.brew.sh said ${response.status}: try again in a while (⌘R).`)
  return response.json()
}

/** "41.2k". @param {number} n */
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))

/** Each one's installs in 30 days, all its ways ("wget", "wget --HEAD") together. @param {any} analytics */
function installs(analytics) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const [name, ways] of Object.entries(analytics.formulae ?? {})) {
    counts[name] = /** @type {{ count: string }[]} */ (ways).reduce((n, w) => n + (Number(String(w.count).replace(/,/g, "")) || 0), 0)
  }
  return counts
}

/**
 * "Deprecated: unmaintained", "Disabled: …", if it is, as brew says: from
 * its dates (a disable date to come, without a deprecation, is one).
 * @param {any} p
 */
function state(p) {
  const today = new Date().toISOString().slice(0, 10)
  const due = (/** @type {any} */ a) => a && (!a[":date"] || a[":date"] <= today)
  const why = (/** @type {any} */ a) => String(a?.[":because"] ?? "").replace(/^:/, "").replace(/_/g, " ")
  if (due(p.disable_args)) return `Disabled${why(p.disable_args) && `: ${why(p.disable_args)}`}`
  const old = p.deprecate_args ? due(p.deprecate_args) && p.deprecate_args : p.disable_args
  return old ? `Deprecated${why(old) && `: ${why(old)}`}` : undefined
}

/** A license as SPDX says it ("MIT OR Apache-2.0"), from brew's ({ ":any_of": […] }). @param {any} l @returns {string} */
function license(l) {
  if (typeof l === "string") return l
  const [key, value] = Object.entries(l ?? {})[0] ?? ["", null]
  const nested = (/** @type {any} */ x) => typeof x === "object" && Array.isArray(Object.values(x ?? {})[0])
  if (Array.isArray(value)) return value.map((x) => (nested(x) ? `(${license(x)})` : license(x))).join(key === ":all_of" ? " AND " : " OR ")
  return value?.[":with"] ? `${key} WITH ${value[":with"]}` : key
}

/** A cask's app, as it's put in Applications. @param {any[]} artifacts */
function app(artifacts) {
  const args = artifacts.find((a) => a[0] === ":app")?.[1] ?? []
  const to = args.find((/** @type {any} */ a) => typeof a === "object")?.[":target"] ?? args[0]
  return typeof to === "string" ? to.split("/").pop() : undefined
}

/** Every formula and cask, with what's shown of each. @returns {Promise<Index>} */
async function fetchIndex() {
  const [all, formulae, casks] = await Promise.all([
    (async () => {
      for (const tag of TAGS) {
        const response = await fetch(`${API}/internal/packages.${tag}.jws.json`)
        if (response.ok) return JSON.parse((await response.json()).payload)
        if (response.status !== 404) throw new Error(`formulae.brew.sh said ${response.status}: try again in a while (⌘R).`)
      }
      throw new Error("Homebrew's list of formulae and casks isn't where it was on formulae.brew.sh: this extension needs updating.")
    })(),
    get("analytics/install/homebrew-core/30d.json").then(installs),
    get("analytics/cask-install/homebrew-cask/30d.json").then(installs),
  ])
  /** @type {Record<string, string[]>} */
  const aliases = {}
  for (const [alias, name] of Object.entries(all.formula_aliases ?? {})) (aliases[name] ??= []).push(alias)
  /** @type {Package[]} */
  const packages = []
  for (const [name, f] of Object.entries(all.formulae ?? {})) {
    const also = [...new Set([...(f.aliases ?? []), ...(aliases[name] ?? [])])]
    packages.push({ name, desc: f.desc ?? "", version: f.stable_version ?? "", homepage: f.homepage ?? "", installs: formulae[name] ?? 0, license: license(f.license) || undefined, aliases: also.length ? also : undefined, state: state(f) })
  }
  for (const [name, c] of Object.entries(all.casks ?? {})) {
    packages.push({ name, cask: true, title: c.names?.[0], desc: c.desc ?? "", version: c.version ?? "", homepage: c.homepage ?? "", installs: casks[name] ?? 0, app: app(c.raw_artifacts ?? []), state: state(c) })
  }
  return { at: Date.now(), packages }
}

/** How well `p` matches `q` (lowercase): 0 its name, 1 its name's start, 2 in its name, 3 every word somewhere; else -1. @param {Package} p @param {string} q @param {string[]} words */
function score(p, q, words) {
  if (p.name === q || p.aliases?.includes(q)) return 0
  if (p.name.startsWith(q)) return 1
  if (p.name.includes(q) || p.title?.toLowerCase().includes(q)) return 2
  const text = `${p.name} ${p.aliases?.join(" ") ?? ""} ${p.title ?? ""} ${p.desc}`.toLowerCase()
  return words.every((w) => text.includes(w)) ? 3 : -1
}

/** @param {Package} p */
function row(p) {
  const page = `https://formulae.brew.sh/${p.cask ? "cask" : "formula"}/${p.name}`
  const install = `brew install ${p.cask ? "--cask " : ""}${p.name}`
  const status = p.state?.split(":")[0]
  const subtitle = p.cask && p.title ? [p.title, p.desc].filter(Boolean).join(" · ") : p.desc
  return {
    title: p.name,
    subtitle,
    icon: p.cask ? "macwindow" : "terminal",
    // (A cask's version can have its build after a comma: "6.0,9001".)
    accessory: p.version.split(",")[0],
    tags: [
      ...(p.installs ? [{ text: `${compact(p.installs)}/30d`, color: "gray" }] : []),
      ...(status ? [{ text: status, color: status === "Disabled" ? "red" : "orange" }] : []),
    ],
    detail: {
      markdown: `## ${p.cask && p.title ? p.title : p.name}\n\n${p.desc}\n\n\`\`\`\n${install}\n\`\`\``,
      metadata: [
        { label: p.cask ? "Cask" : "Formula", text: p.name },
        { label: "Version", text: p.version || "–" },
        { label: "Installs (30 days)", text: p.installs.toLocaleString("en-US") },
        ...(p.app ? [{ label: "App", text: p.app }] : []),
        ...(p.license ? [{ label: "License", text: p.license }] : []),
        ...(p.aliases?.length ? [{ label: "Also", text: p.aliases.join(", ") }] : []),
        ...(p.state ? [{ label: "Status", text: p.state, color: status === "Disabled" ? "red" : "orange" }] : []),
        { label: "Homepage", text: p.homepage.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || "–" },
      ],
    },
    actions: [
      { title: "Copy Install Command", copy: install, icon: "doc.on.doc" },
      { title: "Open on formulae.brew.sh", open: page, icon: "safari" },
      ...(p.homepage ? [{ title: "Open Homepage", open: p.homepage, icon: "house" }] : []),
    ],
  }
}

f2.command("search", async ({ query }) => {
  const q = query.trim().toLowerCase()
  const words = q.split(/\s+/)
  /** @param {Index} index */
  const show = (index) => {
    if (!q) return f2.show({ items: [], placeholder: PLACEHOLDER, loading: false })
    const found = index.packages.map((p) => ({ p, s: score(p, q, words) })).filter((f) => f.s >= 0)
    found.sort((a, b) => a.s - b.s || b.p.installs - a.p.installs)
    f2.show({ items: found.slice(0, MOST).map((f) => row(f.p)), placeholder: PLACEHOLDER, loading: false })
  }
  /** @type {Index | null} */
  const kept = await f2.storage.get("index")
  if (kept) show(kept)
  if (kept && Date.now() - kept.at < DAY) return
  // (A day old, it's got again, at most every few minutes: a run stopped
  // by more typing mustn't have the next start over.)
  if (kept && Date.now() - Number((await f2.storage.get("asked")) ?? 0) < 5 * 60_000) return
  if (!kept) f2.show({ items: [], placeholder: PLACEHOLDER, loading: "Getting Homebrew's formulae and casks…" })
  await f2.storage.set("asked", Date.now())
  try {
    const index = await fetchIndex()
    await f2.storage.set("index", index)
    show(index)
  } catch (e) {
    // (What it had is still shown.)
    if (kept) return console.log(`Homebrew's list wasn't got again: ${e}`)
    throw e
  }
})
