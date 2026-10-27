// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Notion: the pages and databases shared with your integration, found by
// title (the recently edited ones with nothing typed), and a page's blocks
// read here as markdown, from Notion's API.

const API = "https://api.notion.com/v1"
const VERSION = "2026-03-11"
// The most of a page's blocks read: five requests' worth. The rest is a click away.
const MOST = 500
const LIST = /^(bulleted_list_item|numbered_list_item|to_do)$/

/** What Notion answers, or why it wouldn't. @param {string} path @param {object} [body] a search's */
async function api(path, body) {
  const token = String(f2.preferences.token ?? "").trim()
  if (!token) throw new Error("No integration secret: set one in its settings (⌘,).")
  const headers = { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, ...(body ? { "Content-Type": "application/json" } : {}) }
  const response = await fetch(`${API}${path}`, body ? { method: "POST", headers, body } : { headers })
  const answer = await response.json().catch(() => ({}))
  if (response.ok) return answer
  const why = answer.message ?? `${response.status}`
  if (response.status === 401) throw new Error("Notion refused the integration's secret: make one at app.notion.com/developers/connections, and set it in its settings (⌘,).")
  if (answer.code === "object_not_found") throw new Error("Notion can't find that page, or it isn't shared with the integration: in the page's ••• menu, Connections, add it.")
  if (response.status === 403) throw new Error(`Notion refused (${why}): the integration needs Read content, on its Configuration tab.`)
  if (response.status === 429) throw new Error("Notion says that's too many requests for now: try again in a moment.")
  throw new Error(`Notion said: ${why}`)
}

/** "3h ago". @param {string} stamp */
function ago(stamp) {
  const secs = (Date.now() - new Date(stamp).getTime()) / 1000
  for (const [unit, size] of /** @type {[string, number][]} */ ([["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]])) {
    if (secs >= size) return `${Math.floor(secs / size)}${unit} ago`
  }
  return "just now"
}

/** A page's address, from its id. @param {string} id */
const link = (id) => `https://app.notion.com/p/${id.replace(/-/g, "")}`
/** @param {any[]} [parts] rich text */
const plain = (parts) => (parts ?? []).map((t) => t.plain_text ?? "").join("")

/** A page or a database (a data source) found, as a row. @param {any} r */
function row(r) {
  const page = r.object === "page"
  // (A page's title is whichever of its properties is its title.)
  const name = (page ? plain(Object.values(r.properties ?? {}).find((p) => p?.type === "title")?.title) : plain(r.title)) || "Untitled"
  const url = r.url
  const parent = r.parent?.type ?? ""
  return {
    title: name,
    subtitle: !page ? "Database" : parent === "workspace" ? "Page" : /data_source|database/.test(parent) ? "In a database" : "In a page",
    icon: page ? "doc.text" : "tablecells",
    accessory: r.last_edited_time ? `edited ${ago(r.last_edited_time)}` : "",
    actions: [
      { title: "Open in Notion", open: url, icon: "safari" },
      ...(page ? [{ title: "Read", push: { command: "page", args: { id: r.id, title: name, url, icon: r.icon?.type === "emoji" ? r.icon.emoji : "", edited: r.last_edited_time ?? "" } }, icon: "book" }] : []),
      { title: "Copy Link", copy: url, icon: "link" },
    ],
  }
}

f2.command("search", async ({ query }) => {
  const q = query.trim()
  f2.loading(q ? `Searching Notion for “${q}”…` : "Getting what's recently edited…")
  const found = await api("/search", q ? { query: q, page_size: 25 } : { sort: { timestamp: "last_edited_time", direction: "descending" }, page_size: 25 })
  // (Not what's in the trash, nor what's only partly there: a database it may not see all of.)
  /** @type {any[]} */
  const results = found.results.filter((/** @type {any} */ r) => !r.in_trash && r.url)
  if (!q && !results.length) {
    f2.show({
      items: [{ title: "Nothing's shared with the integration yet", subtitle: "In a page's ••• menu, Connections, add it", icon: "info.circle", actions: [{ title: "Open Notion", open: "https://app.notion.com", icon: "safari" }] }],
      placeholder: "Search Notion…",
      loading: false,
    })
    return
  }
  f2.show({ items: results.map((r) => ({ ...row(r), ...(q ? {} : { section: "Recently edited" }) })), placeholder: "Search Notion…", loading: false })
})

f2.command("page", async ({ args }) => {
  f2.show({ title: args.title, loading: `Reading “${args.title}”…` })
  /** @type {any[]} */
  const blocks = []
  /** @type {string | null} */
  let cursor = null
  let more = false
  do {
    const got = await api(`/blocks/${args.id}/children?${new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) })}`)
    blocks.push(...got.results)
    cursor = got.next_cursor
    more = got.has_more
  } while (more && cursor && blocks.length < MOST)
  const body = markdown(blocks)
  f2.show({
    title: args.title,
    detail: {
      markdown: `# ${args.icon ? `${args.icon} ` : ""}${args.title}\n\n${body || "*Nothing's on this page.*"}${more ? "\n\n*…the rest is in Notion (⌘K › Open in Notion).*" : ""}`,
      metadata: args.edited ? [{ label: "Edited", text: new Date(args.edited).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) }] : [],
      actions: [
        { title: "Open in Notion", open: args.url, icon: "safari" },
        { title: "Copy Link", copy: args.url, icon: "link" },
      ],
    },
    loading: false,
  })
})

/**
 * A page's blocks as markdown: its text, headings, lists, to-dos, quotes,
 * callouts, code, dividers, links and subpages. One level of them: what's
 * in a table, columns or a toggle is left to Notion.
 * @param {any[]} blocks
 */
function markdown(blocks) {
  let out = ""
  let last = ""
  let number = 0
  for (const b of blocks) {
    const v = b[b.type] ?? {}
    number = b.type !== "numbered_list_item" ? 0 : last === b.type ? number + 1 : v.list_start_index ?? 1
    const text = rich(v.rich_text)
    const url = v.external?.url ?? v.file?.url ?? v.url
    const caption = plain(v.caption)
    /** @type {string} */
    let md
    switch (b.type) {
      case "paragraph":
        md = text
        break
      case "heading_1":
      case "heading_2":
      case "heading_3":
      case "heading_4":
        // (A level down: the page's title is its first.)
        md = `${"#".repeat(Number(b.type.slice(-1)) + 1)} ${text}`
        break
      case "bulleted_list_item":
        md = `- ${text}`
        break
      case "numbered_list_item":
        md = `${number}. ${text}`
        break
      case "to_do":
        md = `- [${v.checked ? "x" : " "}] ${text}`
        break
      case "toggle":
        md = `▸ ${text}`
        break
      case "quote":
        md = text.replace(/^/gm, "> ")
        break
      case "callout":
        md = `${v.icon?.type === "emoji" ? `${v.icon.emoji} ` : ""}${text}`.replace(/^/gm, "> ")
        break
      case "code":
        md = `\`\`\`${v.language === "plain text" ? "" : (v.language ?? "")}\n${plain(v.rich_text)}\n\`\`\`${caption ? `\n\n*${caption}*` : ""}`
        break
      case "equation":
        md = `\`${v.expression}\``
        break
      case "divider":
        md = "---"
        break
      case "child_page":
        md = `📄 [${v.title || "Untitled"}](${link(b.id)})`
        break
      case "child_database":
        md = `🗂️ [${v.title || "Untitled"}](${link(b.id)})`
        break
      case "link_to_page":
        md = `→ [A linked page](${link(v.page_id ?? v.database_id ?? "")})`
        break
      case "bookmark":
      case "embed":
      case "link_preview":
        md = url ? `[${caption || url}](${url})` : ""
        break
      case "image":
      case "video":
      case "audio":
      case "file":
      case "pdf":
        md = url ? `[${b.type === "pdf" ? "PDF" : b.type[0].toUpperCase() + b.type.slice(1)}: ${caption || v.name || "open it"}](${url})` : ""
        break
      default:
        md = b.has_children ? `*(A ${b.type.replace(/_/g, " ")}: open it in Notion.)*` : ""
    }
    // (A list's items together; anything else apart.)
    if (md.trim()) out += (out ? (LIST.test(b.type) && b.type === last ? "\n" : "\n\n") : "") + md
    last = b.type
  }
  return out
}

/** Rich text as markdown: bold, italics, struck, code, links; its line breaks kept. @param {any[]} [parts] */
function rich(parts = []) {
  return parts
    .map((t) => {
      // (Its spaces outside the marks, or markdown doesn't see them.)
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(t.plain_text ?? "") ?? ["", "", "", ""]
      if (!core) return t.plain_text ?? ""
      const a = t.annotations ?? {}
      let s = a.code ? `\`${core}\`` : core
      if (a.bold) s = `**${s}**`
      if (a.italic) s = `*${s}*`
      if (a.strikethrough) s = `~~${s}~~`
      if (t.href) s = `[${s}](${t.href})`
      return lead + s + trail
    })
    .join("")
    .replace(/\n/g, "  \n")
}
