// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Can I Use: every feature caniuse.com has a table of, and how the main
// browsers support it in their latest versions, from the data the site is
// made from (its GitHub repo's: about 5 MB, CC BY 4.0), got once a day.

const DATA = "https://raw.githubusercontent.com/Fyrd/caniuse/main/fulldata-json/data-2.0.json"
// The browsers shown: caniuse's name for each, what it's called, and that in a tag.
const BROWSERS = [
  ["chrome", "Chrome", "Chrome"],
  ["edge", "Edge", "Edge"],
  ["safari", "Safari", "Safari"],
  ["firefox", "Firefox", "Firefox"],
  ["ios_saf", "Safari on iOS", "iOS Safari"],
  ["and_chr", "Chrome for Android", "Android Chrome"],
]
/** @type {Record<string, string>} */
const ICONS = {
  CSS: "paintbrush",
  CSS2: "paintbrush",
  CSS3: "paintbrush",
  HTML5: "chevron.left.forwardslash.chevron.right",
  Canvas: "paintpalette",
  JS: "curlybraces",
  "JS API": "puzzlepiece",
  DOM: "list.bullet.indent",
  SVG: "scribble.variable",
  Security: "lock.shield",
  PNG: "photo",
}
/** @type {Record<string, string>} */
const COLORS = { yes: "green", partly: "yellow", no: "red" }

/**
 * @typedef {{ version: string, release_date: number | null }} Version
 * @typedef {{
 *   title: string, description: string, spec: string, status: string, categories: string[], keywords: string,
 *   stats: Record<string, Record<string, string>>, notes: string, notes_by_num: Record<string, string>,
 *   usage_perc_y: number, usage_perc_a: number
 * }} Feature
 * @typedef {{ agents: Record<string, { version_list: Version[] }>, statuses: Record<string, string>, data: Record<string, Feature> }} Data
 */

f2.command("features", async () => {
  f2.loading("Getting caniuse's tables…")
  const response = await fetch(DATA)
  if (!response.ok) throw new Error(`GitHub said ${response.status} for caniuse's data: try again in a while.`)
  /** @type {Data} */
  const data = await response.json()
  const items = Object.entries(data.data).map(([id, f]) => row(id, f, data))
  // (By name, ":has()" under H.)
  const name = (/** @type {{ title: string }} */ r) => r.title.replace(/^\W+/, "")
  items.sort((a, b) => name(a).localeCompare(name(b), "en", { sensitivity: "base" }))
  f2.show({ items, loading: false })
})

/**
 * How a browser supports a feature in its latest version, in caniuse's
 * letters ("y" yes, "a" partly, "n" no, "p" by a polyfill, "u" unknown;
 * "x" prefixed, "d" behind a flag); since which version it has; its
 * notes' numbers; and a version to come that will have it.
 * @param {Record<string, string>} stats @param {Version[]} versions
 */
function support(stats, versions) {
  const out = versions.filter((v) => v.release_date)
  if (!out.length) return { now: "u", since: "", notes: [], soon: undefined }
  const kind = (/** @type {Version} */ v) => (stats[v.version] ?? "u").replace(/\s*#\d+/g, "")
  const last = out[out.length - 1]
  const now = kind(last)
  let first = out.length - 1
  while (first > 0 && kind(out[first - 1]) === now) first--
  return {
    now,
    // (A browser caniuse has only its latest version of, as Chrome for Android, has no "since".)
    since: out.length > 1 ? out[first].version.split("-")[0] : "",
    notes: [...(stats[last.version] ?? "").matchAll(/#(\d+)/g)].map((m) => m[1]),
    soon: /^[ya]/.test(now) ? undefined : versions.slice(out.length).find((v) => /^[ya]/.test(stats[v.version] ?? ""))?.version,
  }
}

/** What a browser's support says, and how much it is. @param {ReturnType<typeof support>} s */
function said(s) {
  const prefixed = s.now.includes("x") ? ", prefixed" : ""
  const notes = s.notes.length ? ` (note ${s.notes.join(", ")})` : ""
  const soon = s.soon ? (s.soon === "TP" ? ", in Technology Preview" : `, coming in ${s.soon}`) : ""
  if (s.now[0] === "y") return { level: prefixed ? "partly" : "yes", text: `${s.since ? `Since ${s.since}` : "Yes"}${prefixed}${notes}` }
  if (s.now[0] === "a") return { level: "partly", text: `Partly${s.since ? `, since ${s.since}` : ""}${prefixed}${notes}` }
  if (s.now[0] === "u") return { level: "no", text: `Unknown${soon}`, color: "gray" }
  if (s.now.includes("d")) return { level: "no", text: `Behind a flag${soon}${notes}`, color: "orange" }
  return { level: "no", text: `${s.now[0] === "p" ? "No (a polyfill can do it)" : "No"}${soon}${notes}` }
}

/** @param {string} id @param {Feature} f @param {Data} data */
function row(id, f, data) {
  const url = `https://caniuse.com/${id}`
  const shown = BROWSERS.map(([key, name, short]) => {
    const s = support(f.stats[key] ?? {}, data.agents[key]?.version_list ?? [])
    return { name, short, notes: s.notes, ...said(s) }
  })
  const no = shown.filter((b) => b.level === "no")
  const partly = shown.filter((b) => b.level === "partly")
  // (Its notes about these browsers now, and which.)
  /** @type {Record<string, string[]>} */
  const about = {}
  for (const b of shown) for (const n of b.notes) (about[n] ??= []).push(b.name)
  const notes = Object.entries(about)
    .filter(([n]) => f.notes_by_num[n])
    .map(([n, names]) => `- **${n}.** ${md(f.notes_by_num[n])} *(${names.join(", ")})*`)
  const y = f.usage_perc_y
  const a = f.usage_perc_a
  return {
    title: f.title,
    subtitle: text(f.description),
    icon: ICONS[f.categories[0]] ?? "globe",
    color: no.length === shown.length ? "red" : no.length ? "orange" : partly.length ? "yellow" : "green",
    accessory: `${(y + a).toFixed(1)}%`,
    tags: no.length
      ? [{ text: no.length === shown.length ? "Not supported" : `Not in ${no.map((b) => b.short).join(", ")}`, color: "red" }]
      : partly.length
        ? [{ text: `Partly in ${partly.map((b) => b.short).join(", ")}`, color: "yellow" }]
        : [],
    keywords: [id, ...f.keywords.split(","), ...f.categories].map((k) => k.trim()).filter(Boolean),
    detail: {
      markdown: [`## ${plain(f.title)}`, md(f.description), md(f.notes), notes.length ? `### Notes\n\n${notes.join("\n")}` : ""].filter(Boolean).join("\n\n"),
      metadata: [
        ...shown.map((b) => ({ label: b.name, text: b.text, color: b.color ?? COLORS[b.level] })),
        { label: "Global usage", text: `${(y + a).toFixed(2)}%${a ? ` (${a.toFixed(2)}% partly)` : ""}` },
        ...(data.statuses[f.status] ? [{ label: "Specification", text: data.statuses[f.status] }] : []),
      ],
    },
    actions: [
      { title: "Open on caniuse.com", open: url, icon: "safari" },
      { title: "Copy Link", copy: url, icon: "link" },
      ...(f.spec ? [{ title: "Open Specification", open: f.spec, icon: "doc.text" }] : []),
    ],
  }
}

/** caniuse's markdown, its links to its own pages made whole, and a "<" outside code not taken for HTML. @param {string} s */
const md = (s) =>
  s
    .replace(/\]\(\//g, "](https://caniuse.com/")
    .split(/(`[^`]*`)/)
    .map((p, i) => (i % 2 ? p : p.replace(/</g, "\\<")))
    .join("")
/** As plain text: its links as their text, without its marks. @param {string} s */
const text = (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim()
/** Text that's not to be read as markdown. @param {string} s */
const plain = (s) => s.replace(/[\\`*_[\]<]/g, "\\$&")
