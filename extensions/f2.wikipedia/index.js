// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Wikipedia: its articles found by title as you type (full text when no
// title matches), and an article read right here, as text with its
// headings (its references and links left to the website).

const HEADERS = { "Api-User-Agent": "F2-Wikipedia/1 (https://getf2.com)" }
// Where an English article's own text ends: what's after is lists of links.
const AFTER = /^(See also|References|Notes|Citations|Sources|Bibliography|Further reading|External links|Footnotes)$/i
// The most of an article shown: the rest is a click away.
const MOST = 60_000

/** The Wikipedia its settings say: "en", "is"… */
function language() {
  const code = String(f2.preferences.language ?? "en").trim().toLowerCase()
  if (!/^[a-z][a-z-]{1,15}$/.test(code)) throw new Error(`“${code}” isn't a Wikipedia's language: set one like en, de or is in its settings (⌘,).`)
  return code
}

/** @param {string} url */
async function get(url) {
  const response = await fetch(url, { headers: HEADERS })
  if (!response.ok) throw new Error(`Wikipedia said ${response.status}.`)
  return response.json()
}

/** An article's address. @param {string} lang @param {string} title */
const link = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":")}`

f2.command("search", async ({ query }) => {
  const q = query.trim()
  if (!q) {
    f2.show({ items: [], placeholder: "Search Wikipedia…", loading: false })
    return
  }
  const lang = language()
  f2.loading(`Searching Wikipedia for “${q}”…`)
  const base = `https://${lang}.wikipedia.org/w/rest.php/v1/search`
  /** @type {{ title: string, description?: string | null }[]} */
  let pages = (await get(`${base}/title?q=${encodeURIComponent(q)}&limit=20`)).pages
  if (!pages.length) pages = (await get(`${base}/page?q=${encodeURIComponent(q)}&limit=20`)).pages
  f2.show({
    items: pages.map((p) => ({
      title: p.title,
      subtitle: p.description ?? "",
      icon: "doc.text",
      actions: [
        { title: "Read", push: { command: "article", args: { title: p.title } }, icon: "book" },
        { title: "Open on Wikipedia", open: link(lang, p.title), icon: "safari" },
        { title: "Copy Link", copy: link(lang, p.title), icon: "link" },
      ],
    })),
    loading: false,
  })
})

f2.command("article", async ({ args }) => {
  const lang = language()
  f2.loading(`Reading “${args.title}”…`)
  const asked = new URLSearchParams({
    action: "query",
    prop: "extracts|info|description",
    inprop: "url",
    explaintext: "1",
    exsectionformat: "wiki",
    redirects: "1",
    format: "json",
    formatversion: "2",
    titles: args.title,
  })
  const p = (await get(`https://${lang}.wikipedia.org/w/api.php?${asked}`)).query?.pages?.[0]
  if (!p || p.missing || !p.extract) throw new Error(`Wikipedia has no article “${args.title}”.`)
  const url = p.fullurl ?? link(lang, p.title)
  const { markdown, words, cut } = article(p.title, p.extract)
  f2.show({
    title: p.title,
    detail: {
      markdown: cut ? `${markdown}\n\n*…the rest is on Wikipedia (⌘K › Open on Wikipedia).*` : markdown,
      metadata: [
        ...(p.description ? [{ label: "What", text: p.description }] : []),
        { label: "Words", text: words.toLocaleString("en-US") },
        { label: "To read", text: `${Math.max(1, Math.round(words / 230))} min` },
      ],
      actions: [
        { title: "Open on Wikipedia", open: url, icon: "safari" },
        { title: "Copy Link", copy: url, icon: "link" },
      ],
    },
    loading: false,
  })
})

/**
 * An article's plain text (its headings as "== Early life ==") as
 * markdown: its headings as headings, its paragraphs apart, without the
 * sections that are only lists of links, or that are empty.
 * @param {string} title @param {string} text
 */
function article(title, text) {
  /** @type {{ heading: string, level: number, lines: string[] }[]} */
  const sections = [{ heading: "", level: 1, lines: [] }]
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    const h = /^(={2,6})\s*(.*?)\s*\1$/.exec(line)
    if (h) {
      if (h[1].length === 2 && AFTER.test(h[2])) break
      sections.push({ heading: h[2], level: h[1].length, lines: [] })
    } else if (line) {
      // (What's left of a pronunciation or a note taken out: "(; 23 June".)
      sections[sections.length - 1].lines.push(line.replace(/\(\s*[;,]\s*/g, "(").replace(/\s*\(\s*\)/g, ""))
    }
  }
  let markdown = `# ${title}`
  let cut = false
  const words = sections.reduce((n, s) => n + s.lines.join(" ").split(/\s+/).filter(Boolean).length, 0)
  for (const [i, s] of sections.entries()) {
    // (A heading with nothing under it, nor under its own subheadings, is left out.)
    const next = sections.slice(i + 1).findIndex((t) => t.level <= s.level)
    const under = sections.slice(i, next < 0 ? undefined : i + 1 + next)
    if (!under.some((t) => t.lines.length)) continue
    const part = `${s.heading ? `\n\n${"#".repeat(s.level)} ${s.heading}` : ""}${s.lines.map((l) => `\n\n${l}`).join("")}`
    if (markdown.length + part.length > MOST) {
      cut = true
      break
    }
    markdown += part
  }
  return { markdown, words, cut }
}
