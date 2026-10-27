// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Hacker News: its lists from its own API (in its order), its search from
// Algolia's, and a story's comments, all of them in one request (Algolia's),
// in the order Hacker News ranks them.

const FIREBASE = "https://hacker-news.firebaseio.com/v0"
const ALGOLIA = "https://hn.algolia.com/api/v1"
const ORANGE = "#ff6600"

/** @param {string} url */
async function get(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Hacker News said ${response.status}.`)
  return response.json()
}

/** "3h ago". @param {number} secs since 1970 */
function ago(secs) {
  const gone = Date.now() / 1000 - secs
  for (const [unit, size] of /** @type {[string, number][]} */ ([["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]])) {
    if (gone >= size) return `${Math.floor(gone / size)}${unit} ago`
  }
  return "just now"
}

/** A link's site, as Hacker News shows it: "github.com". @param {string} [url] */
const site = (url) => /^https?:\/\/(?:www\.)?([^/:?#]+)/i.exec(url ?? "")?.[1] ?? ""
/** @param {number} id */
const discussion = (id) => `https://news.ycombinator.com/item?id=${id}`

/**
 * @typedef {{ id: number, title: string, url?: string, by: string, score: number, comments: number, time: number, text?: string }} Story
 * @param {Story} s
 */
function row(s) {
  const comments = { title: "Read Comments", push: { command: "comments", args: { id: s.id } }, icon: "text.bubble" }
  const where = site(s.url)
  return {
    title: s.title,
    subtitle: [where, `${s.comments} comments`].filter(Boolean).join(" · "),
    icon: s.url ? "link" : "questionmark.bubble",
    color: ORANGE,
    accessory: `${s.score} points · ${ago(s.time)}`,
    keywords: [s.by, where].filter(Boolean),
    actions: [
      ...(s.url ? [{ title: "Open Link", open: s.url, icon: "safari" }, comments] : [comments]),
      { title: "Open on Hacker News", open: discussion(s.id), icon: "y.square" },
      { title: "Copy Link", copy: s.url ?? discussion(s.id), icon: "link" },
    ],
  }
}

/** One of Hacker News' lists ("topstories"), its first stories, in its order. @param {string} list @param {string} what */
async function stories(list, what) {
  f2.loading(`Getting ${what}…`)
  const size = Number(f2.preferences.size ?? 30) || 30
  /** @type {number[]} */
  const ids = (await get(`${FIREBASE}/${list}.json`)).slice(0, size)
  let got = 0
  const items = await Promise.all(
    ids.map(async (id) => {
      const item = await get(`${FIREBASE}/item/${id}.json`).catch(() => null)
      f2.loading(`Getting ${what}…`, ++got / ids.length)
      return item
    }),
  )
  f2.show({
    items: items
      .filter((i) => i && !i.deleted && !i.dead && i.title)
      .map((i) => row({ id: i.id, title: i.title, url: i.url, by: i.by, score: i.score ?? 0, comments: i.descendants ?? 0, time: i.time })),
    loading: false,
  })
}

f2.command("top", () => stories("topstories", "the front page"))
f2.command("show", () => stories("showstories", "Show HN"))
f2.command("ask", () => stories("askstories", "Ask HN"))

f2.command("search", async ({ query }) => {
  const q = query.trim()
  if (!q) {
    f2.show({ items: [], placeholder: "Search Hacker News…", loading: false })
    return
  }
  f2.loading(`Searching Hacker News for “${q}”…`)
  const found = await get(`${ALGOLIA}/search?${new URLSearchParams({ query: q, tags: "story", hitsPerPage: "30" })}`)
  f2.show({
    items: found.hits.map((/** @type {any} */ h) =>
      row({ id: Number(h.objectID), title: h.title, url: h.url ?? undefined, by: h.author, score: h.points ?? 0, comments: h.num_comments ?? 0, time: h.created_at_i }),
    ),
    loading: false,
  })
})

/**
 * @typedef {{ id: number, author?: string, text?: string | null, created_at_i: number, children: Comment[] }} Comment
 */
f2.command("comments", async ({ args }) => {
  f2.loading("Getting the comments…")
  // (Algolia's has them all, Hacker News' own says in what order.)
  const [tree, ranked] = await Promise.all([get(`${ALGOLIA}/items/${args.id}`), get(`${FIREBASE}/item/${args.id}.json`).catch(() => null)])
  /** @type {number[]} */
  const order = ranked?.kids ?? []
  const rank = (/** @type {Comment} */ c) => (order.includes(c.id) ? order.indexOf(c.id) : order.length)
  /** @type {string[]} */
  const parts = []
  let count = 0
  /** @param {Comment[]} comments @param {number} depth */
  const add = (comments, depth) => {
    for (const c of comments) {
      if (count >= 300) return
      if (c.author && c.text) {
        count++
        const quote = "> ".repeat(Math.min(depth, 4))
        const said = markdown(c.text).split("\n").map((l) => `${quote}${l}`.trimEnd()).join("\n")
        parts.push(`${quote}**${c.author}** · ${ago(c.created_at_i)}\n${quote}\n${said}`)
      }
      add(c.children ?? [], depth + 1)
    }
  }
  for (const c of [...(tree.children ?? [])].sort((a, b) => rank(a) - rank(b))) {
    add([c], 0)
    if (count >= 300) break
    parts.push("---")
  }
  const url = tree.url ?? undefined
  const head = `# ${tree.title ?? "Comments"}\n\n${[site(url), `${tree.points ?? 0} points`, `by ${tree.author}`, ago(tree.created_at_i)].filter(Boolean).join(" · ")}`
  const body = tree.text ? `\n\n${markdown(tree.text)}` : ""
  const all = ranked?.descendants ?? count
  f2.show({
    title: `${all} comments`,
    detail: {
      markdown: `${head}${body}\n\n---\n\n${parts.length ? parts.join("\n\n") : "No comments yet."}${count < all ? `\n\n*${all - count} more on Hacker News.*` : ""}`,
      actions: [
        ...(url ? [{ title: "Open Link", open: url, icon: "safari" }] : []),
        { title: "Open on Hacker News", open: discussion(args.id), icon: "y.square" },
        { title: "Copy Link", copy: url ?? discussion(args.id), icon: "link" },
      ],
    },
    loading: false,
  })
})

/** Hacker News' HTML (paragraphs, links, italics, code) as markdown. @param {string} html */
function markdown(html) {
  const text = (/** @type {string} */ s) =>
    s
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
  // (Code apart, as it is: its "<" aren't tags.)
  return html
    .split(/<pre><code>([\s\S]*?)<\/code><\/pre>/)
    .map((part, i) =>
      i % 2
        ? `\n\n\`\`\`\n${text(part).replace(/\n+$/, "")}\n\`\`\`\n\n`
        : text(
            part
              .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
              .replace(/<\/?i>/g, "*")
              .replace(/<p>/g, "\n\n")
              .replace(/<[^>]+>/g, ""),
          ),
    )
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
