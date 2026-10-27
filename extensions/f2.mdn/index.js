// @ts-check
/// <reference path="../../types/f2.d.ts" />

// MDN Web Docs: its docs found by MDN's own site search, and a doc read
// right here, from the JSON MDN builds each page from (its index.json) made
// into markdown: its prose and its examples' code, with its tables of
// browser support and its live examples left to the website.

const MDN = "https://developer.mozilla.org"
// The most of a doc shown: the rest is a click away.
const MOST = 60_000
// Where in MDN a doc is, by the part of its address after /docs/ (or /docs/Web/).
/** @type {Record<string, string>} */
const AREAS = { API: "Web API", Learn_web_development: "Learn", MDN: "About MDN" }
/** @type {Record<string, string>} */
const ICONS = {
  "Web API": "puzzlepiece",
  JavaScript: "curlybraces",
  CSS: "paintbrush",
  HTML: "chevron.left.forwardslash.chevron.right",
  HTTP: "network",
  Glossary: "character.book.closed",
  Learn: "graduationcap",
}

/** The MDN its settings say: "en-US", "fr"… */
const locale = () => String(f2.preferences.locale ?? "en-US")

/** MDN's JSON, or null if there's none there. @param {string} url */
async function get(url) {
  const response = await fetch(url)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`MDN said ${response.status}: try again in a moment.`)
  return response.json()
}

/** Where in MDN a doc is: "CSS", "Web API"… @param {string} path "/en-US/docs/Web/CSS/…" */
function area(path) {
  const [top = "", next = ""] = path.split("/docs/")[1]?.split("/") ?? []
  const name = top === "Web" ? next : top === "Mozilla" && next === "Add-ons" ? "WebExtensions" : top
  return AREAS[name] ?? name.replace(/_/g, " ")
}

/**
 * @typedef {{ mdn_url: string, title: string, summary: string, highlight?: { body?: string[] } }} Found
 * @param {Found} d @param {string} [section]
 */
function row(d, section) {
  const url = MDN + d.mdn_url
  const where = area(d.mdn_url)
  // (What it matched in the doc, MDN's <mark> as bold.)
  const matches = (d.highlight?.body ?? []).map((h) => `> …${h.split(/<\/?mark>/).map((s, i) => (i % 2 ? `**${plain(s)}**` : plain(s))).join("").replace(/\s+/g, " ")}…`)
  return {
    title: d.title,
    subtitle: d.summary.replace(/\s+/g, " "),
    icon: ICONS[where] ?? "doc.text",
    accessory: where,
    section,
    detail: {
      markdown: [`## ${plain(d.title)}`, plain(d.summary), ...matches].join("\n\n"),
      metadata: [{ label: "Where", text: d.mdn_url.split("/docs/")[1]?.split("/").slice(0, -1).join(" › ").replace(/_/g, " ") || where }],
    },
    actions: [
      { title: "Read", push: { command: "doc", args: { path: d.mdn_url } }, icon: "book" },
      { title: "Open on MDN", open: url, icon: "safari" },
      { title: "Copy Link", copy: url, icon: "link" },
    ],
  }
}

f2.command("search", async ({ query }) => {
  const q = query.trim()
  if (!q) {
    f2.show({ items: [], placeholder: "Search MDN…", loading: false })
    return
  }
  f2.loading(`Searching MDN for “${q}”…`)
  const search = (/** @type {string} */ q) => get(`${MDN}/api/v1/search?${new URLSearchParams({ q, locale: locale() })}`)
  let found = await search(q)
  // (Nothing for a typo: what MDN thinks was meant.)
  const meant = !found?.documents?.length && found?.suggestions?.[0]?.text
  if (meant) found = await search(meant)
  /** @type {Found[]} */
  const docs = found?.documents ?? []
  f2.show({ items: docs.map((d) => row(d, meant ? `Results for “${meant}”` : undefined)), loading: false })
})

f2.command("doc", async ({ args }) => {
  f2.loading("Reading the doc…")
  const doc = (await get(`${MDN}${args.path}/index.json`))?.doc
  if (!doc) throw new Error(`MDN has no doc at ${args.path} now: search for it again.`)
  const url = MDN + doc.mdn_url
  const { markdown, cut } = read(doc, url)
  /** @type {{ title: string }[]} */
  const parents = doc.parents ?? []
  f2.show({
    title: doc.title,
    detail: {
      markdown: cut ? `${markdown}\n\n*…the rest is on MDN (⌘K › Open on MDN).*` : markdown,
      metadata: [
        ...(parents.length > 1 ? [{ label: "Where", text: parents.slice(0, -1).map((p) => p.title).join(" › ") }] : []),
        ...(doc.modified ? [{ label: "Updated", text: new Date(doc.modified).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) }] : []),
      ],
      actions: [
        { title: "Open on MDN", open: url, icon: "safari" },
        { title: "Copy Link", copy: url, icon: "link" },
      ],
    },
    loading: false,
  })
})

/**
 * A doc's sections as markdown: its prose, its specifications as links,
 * its tables of browser support as a link to them; without "See also" (a
 * list of links), or a heading with nothing under it, nor under its own
 * subheadings.
 * @param {{ title: string, body: { type: string, value: any }[] }} doc @param {string} url
 */
function read(doc, url) {
  /** @type {{ heading: string, level: number, text: string }[]} */
  const sections = [{ heading: "", level: 2, text: "" }]
  let anchor = ""
  for (const { type, value: v } of doc.body) {
    if (v.id === "see_also") continue
    // (A heading, but not a table of browser support's own name: "api.fetch".)
    if (v.title && !(type === "browser_compatibility" && v.title === v.query)) {
      sections.push({ heading: tidy(parse(v.title).kids.map((k) => inline(k, url)).join("")), level: v.isH3 ? 3 : 2, text: "" })
      anchor = v.id ?? ""
    }
    const s = sections[sections.length - 1]
    /** @type {{ title: string, bcdSpecificationURL: string }[]} */
    const specs = type === "specifications" ? v.specifications ?? [] : []
    const text =
      type === "prose"
        ? markdown(v.content ?? "", url)
        : type === "specifications"
          ? [...new Set(specs.map((spec) => `- [${plain(spec.title)}](${spec.bcdSpecificationURL})`))].join("\n")
          : type === "browser_compatibility" && !s.text
            ? `*It's a table of browsers and their versions: [see it on MDN](${url}${anchor ? `#${anchor}` : ""}).*`
            : ""
    s.text = [s.text, text].filter(Boolean).join("\n\n")
  }
  let out = `# ${plain(doc.title)}`
  let cut = false
  for (const [i, s] of sections.entries()) {
    const next = sections.slice(i + 1).findIndex((t) => t.level <= s.level)
    const under = sections.slice(i, next < 0 ? undefined : i + 1 + next)
    if (!under.some((t) => t.text)) continue
    const part = `${s.heading ? `\n\n${"#".repeat(s.level)} ${s.heading}` : ""}${s.text ? `\n\n${s.text}` : ""}`
    if (out.length + part.length > MOST) {
      cut = true
      break
    }
    out += part
  }
  return { markdown: out, cut }
}

// MDN's HTML as markdown, by its tree.

/** @typedef {{ tag: string, attrs: string, kids: (Node | string)[] }} Node */

// Tags that are part of a line; the rest are blocks of their own.
const INLINE = new Set(["a", "abbr", "b", "bdi", "br", "cite", "code", "data", "del", "dfn", "em", "i", "img", "ins", "kbd", "mark", "math", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr"])
// Tags without an end.
const VOID = new Set(["area", "br", "col", "hr", "img", "input", "source", "track", "wbr"])
// What isn't text to read: drawings (its diagrams of what inherits from what), "Try it"'s live editor, buttons.
const SKIP = new Set(["button", "interactive-example", "script", "style", "svg", "template"])
/** @type {Record<string, string>} */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }
// (A line break, till a line's spaces are tidied.)
const BREAK = ""

/** HTML as a tree (MDN's is well-formed). @param {string} html */
function parse(html) {
  /** @type {Node} */
  const root = { tag: "", attrs: "", kids: [] }
  const open = [root]
  for (const [, end, name, attrs, text] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|<!--[\s\S]*?-->|([^<]+|<)/g)) {
    const top = open[open.length - 1]
    const tag = name?.toLowerCase()
    if (text !== undefined) top.kids.push(text)
    else if (!tag) continue
    else if (end) {
      const at = open.map((n) => n.tag).lastIndexOf(tag)
      if (at > 0) open.length = at
    } else {
      /** @type {Node} */
      const node = { tag, attrs, kids: [] }
      top.kids.push(node)
      if (!VOID.has(tag) && !attrs.endsWith("/")) open.push(node)
    }
  }
  return root
}

/** @param {string} s */
const decode = (s) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, e) => (e[0] !== "#" ? ENTITIES[e] ?? all : String.fromCodePoint(/x/i.test(e[1]) ? parseInt(e.slice(2), 16) : Number(e.slice(1)))))
/** @param {Node} n @param {string} name */
const attr = (n, name) => decode(new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(n.attrs)?.[1] ?? "")
/** @param {Node | string} n @returns {string} */
const text = (n) => (typeof n === "string" ? decode(n) : n.tag === "br" ? "\n" : n.kids.map(text).join(""))
/** @param {Node} n */
const nodes = (n) => /** @type {Node[]} */ (n.kids.filter((k) => typeof k !== "string"))
/** Every node under `n` that's a `tag`. @param {Node} n @param {string} tag @returns {Node[]} */
const all = (n, tag) => nodes(n).flatMap((k) => (k.tag === tag ? [k] : all(k, tag)))
/** Text that's not to be read as markdown. @param {string} s */
const plain = (s) => s.replace(/[\\`*_[\]<]/g, "\\$&")
/** @param {string} s */
const code = (s) => ((s = s.replace(/\s+/g, " ").trim()) ? (s.includes("`") ? `\`\` ${s} \`\`` : `\`${s}\``) : "")
/** A line's spaces as one, its breaks as markdown's. @param {string} s */
const tidy = (s) => s.replace(/^[\s]+|[\s]+$/g, "").replace(/\s+/g, " ").replace(/ ? ?/g, "\\\n")

/** @param {string} html @param {string} url */
const markdown = (html, url) => blocks(parse(html), url).join("\n\n")

/** A node's children as blocks of markdown. @param {Node} n @param {string} url @returns {string[]} */
function blocks(n, url) {
  /** @type {string[]} */
  const out = []
  let line = ""
  const flush = () => {
    const t = tidy(line)
    if (t) out.push(t)
    line = ""
  }
  for (const k of n.kids) {
    if (typeof k === "string" || INLINE.has(k.tag)) line += inline(k, url)
    else {
      flush()
      out.push(...block(k, url))
    }
  }
  flush()
  return out.filter(Boolean)
}

/** A node in a line, as markdown. @param {Node | string} n @param {string} url @returns {string} */
function inline(n, url) {
  if (typeof n === "string") return plain(decode(n))
  const inner = () => n.kids.map((k) => inline(k, url)).join("")
  // (Its marks inside its spaces: "**bold** ", not "**bold **".)
  const wrap = (/** @type {string} */ mark, s = inner()) => (s.trim() ? s.replace(/^(\s*)([\s\S]*?)(\s*)$/, `$1${mark}$2${mark}$3`) : s)
  switch (n.tag) {
    case "br":
      return BREAK
    case "code":
    case "kbd":
    case "samp":
      return code(text(n))
    case "strong":
    case "b":
      return wrap("**")
    case "em":
    case "i":
    case "cite":
    case "dfn":
    case "var":
      return wrap("*")
    case "a": {
      const href = attr(n, "href")
      const label = inner()
      // (Its links within the page lead nowhere here.)
      if (!href || href.startsWith("#") || !label.trim()) return label
      return `[${label}](${(href.startsWith("/") ? MDN + href : href).replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")})`
    }
    case "img":
      return plain(attr(n, "alt"))
    case "math": {
      const tex = all(n, "annotation")[0]
      return code(text(tex ?? n))
    }
    case "span":
      // (Its marks: "Experimental", "Deprecated", "Read only", "Optional".)
      if (attr(n, "role") === "img") return ` *${attr(n, "aria-label")}*`
      if (/\bbadge\b/.test(attr(n, "class"))) return ` ${wrap("*")}`
  }
  return SKIP.has(n.tag) ? "" : inner()
}

/** A block of HTML as markdown's. @param {Node} n @param {string} url @returns {string[]} */
function block(n, url) {
  const kind = attr(n, "class")
  const quote = () => [blocks(n, url).join("\n\n").replace(/^/gm, "> ")]
  switch (n.tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const t = tidy(n.kids.map((k) => inline(k, url)).join(""))
      return t ? [`${"#".repeat(Number(n.tag[1]))} ${t}`] : []
    }
    case "p":
      return blocks(n, url)
    case "pre": {
      const lang = /\bbrush: ?([\w-]+)/.exec(kind)?.[1] ?? ""
      const t = text(n).replace(/\n+$/, "")
      const fence = t.includes("```") ? "~~~" : "```"
      return [`${fence}${lang === "plain" ? "" : lang}\n${t}\n${fence}`]
    }
    case "ul":
    case "ol":
      // (A lesson's Previous and Next.)
      if (/\bprev-next\b/.test(kind)) return []
      return [list(nodes(n).filter((k) => k.tag === "li").map((li) => blocks(li, url)), n.tag === "ol")]
    case "dl": {
      // (A term, then what it is: a list's item, what it is under it.)
      /** @type {string[][]} */
      const items = []
      for (const k of nodes(n)) {
        if (k.tag === "dt") {
          const t = tidy(k.kids.map((c) => inline(c, url)).join(""))
          items.push([t.includes("`") ? t : `**${t}**`])
        } else if (k.tag === "dd") {
          if (!items.length) items.push([])
          items[items.length - 1].push(...blocks(k, url))
        }
      }
      return [list(items, false)]
    }
    case "table":
      return [table(n, url)]
    case "blockquote":
      return quote()
    case "iframe":
      return [`*Its result is live on MDN.*`]
    case "hr":
      return ["---"]
    case "div":
      if (/\bnotecard\b/.test(kind)) return quote()
      // (The name of an example's language, over its code.)
      if (/\bexample-header\b/.test(kind)) return []
  }
  return SKIP.has(n.tag) ? [] : blocks(n, url)
}

/** Items (each its blocks) as a markdown list. @param {string[][]} items @param {boolean} ordered */
function list(items, ordered) {
  return items
    .filter((b) => b.length)
    .map((b, i) => {
      const mark = ordered ? `${i + 1}. ` : "- "
      // (A list in an item right under its line; its paragraphs apart.)
      const body = b.reduce((s, part) => `${s}${/^(- |\d+\. )/.test(part) ? "\n" : "\n\n"}${part}`)
      return mark + body.replace(/\n(?=.)/g, `\n${" ".repeat(mark.length)}`)
    })
    .join("\n")
}

/**
 * A table as markdown's; one of a thing's properties (in each row, a
 * heading and its value) as a list.
 * @param {Node} n @param {string} url
 */
function table(n, url) {
  const rows = all(n, "tr").map((tr) => nodes(tr).filter((c) => c.tag === "th" || c.tag === "td"))
  if (!rows.length) return ""
  const cell = (/** @type {Node} */ c) => blocks(c, url).join(" ").replace(/\\\n/g, " ").replace(/\|/g, "\\|")
  if (rows.every((r) => r.length === 2 && r[0].tag === "th")) {
    return list(
      rows.map(([th, td]) => {
        const [first = "", ...more] = blocks(td, url)
        const label = `**${cell(th).replace(/:$/, "")}**`
        return more.length || /^(- |\d+\. )/.test(first) ? [label, first, ...more] : [`${label}: ${first}`]
      }),
      false,
    )
  }
  const width = Math.max(...rows.map((r) => r.length))
  const line = (/** @type {string[]} */ cells) => `| ${[...cells, ...Array(width - cells.length).fill("")].join(" | ")} |`
  const [head, ...body] = rows.map((r) => r.map(cell))
  return [line(head), line(Array(width).fill("---")), ...body.map(line)].join("\n")
}
