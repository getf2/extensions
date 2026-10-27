// @ts-check
/// <reference path="../../types/f2.d.ts" />

// PyPI: Python's packages found by name as you type. PyPI has no search to
// ask (its search page is shut behind a check for browsers), so part of a
// name is looked for among the 15,000 most downloaded (hugovk.dev's list,
// of PyPI's own figures, kept a week), and a whole name asked of PyPI
// itself. What each is comes from PyPI's JSON API, kept a day.

const HEADERS = { "User-Agent": "F2-pypi/1 (https://getf2.com)" }
const TOP = "https://hugovk.dev/top-pypi-packages/top-pypi-packages.min.json"
const BLUE = "#006dad"
const DAY = 86_400_000
const MOST = 10

/**
 * @typedef {{ name: string, summary: string, version: string, license: string, homepage?: string, repository?: string, released?: string, python?: string }} Project
 * @typedef {{ at: number, project: Project | null }} Kept
 */

/** A name as PyPI compares them (PEP 503): "Typing_Extensions" is "typing-extensions". @param {string} name */
const normal = (name) => name.toLowerCase().replace(/[-_.\s]+/g, "-")
const compact = (/** @type {number} */ n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
const site = (/** @type {string} */ url) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")

/** The most downloaded projects' names, most first, with their downloads in 30 days. @returns {Promise<[string, number][]>} */
async function top() {
  /** @type {{ at: number, rows: [string, number][] } | null} */
  const kept = await f2.storage.get("top")
  if (kept && Date.now() - kept.at < 7 * DAY) return kept.rows
  const response = await fetch(TOP).catch(() => null)
  if (!response?.ok) return kept?.rows ?? []
  /** @type {[string, number][]} */
  const rows = (await response.json()).rows.map((/** @type {any} */ r) => [normal(r.project), r.download_count])
  await f2.storage.set("top", { at: Date.now(), rows })
  return rows
}

/** Its license, short: its SPDX expression, a license that's a name, or its classifier's. @param {any} info */
function license(info) {
  if (info.license_expression) return String(info.license_expression)
  const said = String(info.license ?? "").trim()
  if (said && said.length <= 40 && !said.includes("\n")) return said
  const classifier = (info.classifiers ?? []).find((/** @type {string} */ c) => c.startsWith("License :: "))
  return classifier ? classifier.split(" :: ").pop() : ""
}

/** What PyPI says of a project: null if there's none of that name. @param {string} name @returns {Promise<Project | null>} */
async function project(name) {
  const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { headers: HEADERS })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`PyPI said ${response.status}.`)
  const { info, urls } = await response.json()
  /** @type {[string, string][]} */
  const links = Object.entries(info.project_urls ?? {})
  const link = (/** @type {RegExp} */ label) => links.find(([k]) => label.test(k.trim()))?.[1]
  const repository = link(/^(source|source code|repository|code|github|gitlab)$/i) ?? links.find(([, u]) => /^https:\/\/(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org)\//.test(u))?.[1]
  return {
    name: info.name,
    summary: String(info.summary ?? "").replace(/\s+/g, " ").trim(),
    version: info.version,
    license: license(info),
    homepage: info.home_page || link(/^(home ?page|home)$/i),
    repository,
    released: urls?.[0]?.upload_time_iso_8601,
    python: info.requires_python || undefined,
  }
}

/**
 * Each project's details, kept a day: null for a name PyPI hasn't,
 * undefined for one it didn't answer for.
 * @param {string[]} names @returns {Promise<(Project | null | undefined)[]>}
 */
async function details(names) {
  /** @type {Record<string, Kept>} */
  const kept = (await f2.storage.get("projects")) ?? {}
  const now = Date.now()
  let asked = false
  const found = await Promise.all(
    names.map(async (n) => {
      if (kept[n] && now - kept[n].at < DAY) return kept[n].project
      asked = true
      const p = await project(n).catch((e) => void console.log(`${n}: ${e}`))
      if (p !== undefined) kept[n] = { at: now, project: p }
      return p
    }),
  )
  const fresh = Object.entries(kept).filter(([, k]) => now - k.at < DAY).sort((a, b) => b[1].at - a[1].at)
  if (asked) await f2.storage.set("projects", Object.fromEntries(fresh.slice(0, 2000)))
  return found
}

/** A project's row; with only its name till PyPI's said what it is. @param {string} n @param {number | undefined} downloads @param {Project} [p] */
function row(n, downloads, p) {
  const name = p?.name ?? n
  /** @type {F2.Action[]} */
  const actions = [{ title: "Open on PyPI", open: `https://pypi.org/project/${name}/`, icon: "safari" }]
  if (p?.repository) actions.push({ title: "Open Repository", open: p.repository, icon: "chevron.left.forwardslash.chevron.right" })
  if (p?.homepage && p.homepage !== p.repository) actions.push({ title: "Open Homepage", open: p.homepage, icon: "house" })
  actions.push({ title: "Copy pip install", copy: `pip install ${name}`, icon: "terminal" }, { title: "Copy uv add", copy: `uv add ${name}`, icon: "doc.on.doc" })
  return {
    title: name,
    subtitle: p?.summary ?? "",
    icon: "cube.fill",
    color: BLUE,
    accessory: p ? `v${p.version}` : undefined,
    tags: downloads ? [{ text: `${compact(downloads)}/30d`, color: "gray" }] : [],
    detail: p && {
      markdown: `## ${name}\n\n${p.summary}\n\n\`\`\`\npip install ${name}\n\`\`\``,
      metadata: [
        { label: "Version", text: p.version },
        ...(downloads ? [{ label: "Downloads (30 days)", text: downloads.toLocaleString("en-US") }] : []),
        ...(p.released ? [{ label: "Released", text: new Date(p.released).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) }] : []),
        { label: "License", text: p.license || "–" },
        ...(p.python ? [{ label: "Python", text: p.python }] : []),
        ...(p.repository ? [{ label: "Repository", text: site(p.repository) }] : []),
        ...(p.homepage && p.homepage !== p.repository ? [{ label: "Homepage", text: site(p.homepage) }] : []),
      ],
    },
    actions,
  }
}

f2.command("search", async ({ query }) => {
  const typed = query.trim()
  const q = normal(typed)
  if (!q) {
    f2.show({ items: [], placeholder: "Search PyPI by name…", loading: false })
    return
  }
  f2.loading(`Searching PyPI for “${typed}”…`)
  // (What's on pypi.org's own search, a browser gets past its check.)
  const more = { title: `Search pypi.org for “${typed}”`, icon: "magnifyingglass", actions: [{ title: "Search on pypi.org", open: `https://pypi.org/search/?${new URLSearchParams({ q: typed })}`, icon: "safari" }] }
  const listed = await top()
  const downloads = new Map(listed)
  // Its name first, then names that start with it, then those with it as a word, then any with it (most downloaded first).
  const rank = (/** @type {string} */ n) => (n === q ? 0 : n.startsWith(q) ? 1 : n.includes(`-${q}`) ? 2 : n.includes(q) ? 3 : -1)
  const names = listed.map(([n]) => ({ n, r: rank(n) })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r).slice(0, MOST).map((x) => x.n)
  if (names.length) f2.show({ items: [...names.map((n) => row(n, downloads.get(n))), more] })
  // (A whole name's asked of PyPI too: most of its projects aren't among the most downloaded.)
  if (!names.includes(q)) names.unshift(q)
  const found = await details(names)
  if (!listed.length && found.every((p) => p === undefined)) throw new Error("PyPI can't be reached: check the connection, and try again (⌘R).")
  const items = names.flatMap((n, i) => (found[i] ? [row(n, downloads.get(n), found[i])] : found[i] === undefined && downloads.has(n) ? [row(n, downloads.get(n))] : []))
  f2.show({ items: [...items, more], loading: false })
})
