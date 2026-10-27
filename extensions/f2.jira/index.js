// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Jira: your open issues and its search, from your Jira Cloud site's REST
// API (v3), signed in with your email and an API token; an issue's
// description (Atlassian Document Format) read here as markdown.

// What's asked of each issue, for its row and its detail.
const FIELDS = "summary,status,priority,issuetype,assignee,reporter,updated,description,project"
// An issue's type as a symbol, in Jira's colors.
const TYPES = { bug: ["ladybug.fill", "red"], story: ["bookmark.fill", "green"], task: ["checkmark.square.fill", "blue"], epic: ["bolt.fill", "purple"], subtask: ["arrow.turn.down.right", "blue"] }
// A status's category as Jira's lozenges: to do, in progress, done.
const CATEGORY = { new: "gray", indeterminate: "blue", done: "green" }

/**
 * @typedef {{ name: string, statusCategory?: { key: string } }} Status
 * @typedef {{ key: string, fields: { summary: string, status: Status, priority?: { name: string } | null, issuetype?: { name: string } | null,
 *   assignee?: { displayName: string } | null, reporter?: { displayName: string } | null, updated: string, description?: Node | null,
 *   project?: { key: string, name: string } | null } }} Issue
 * @typedef {{ type: string, text?: string, attrs?: Record<string, any>, marks?: { type: string, attrs?: Record<string, any> }[], content?: Node[] }} Node
 */

/** The site its settings say: "yourcompany.atlassian.net". */
function site() {
  const s = String(f2.preferences.site ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "")
  if (!/^[a-z0-9][a-z0-9-]*\.atlassian\.net$/.test(s)) throw new Error(`“${s}” isn't a Jira Cloud site: set one like yourcompany.atlassian.net in its settings (⌘,).`)
  return s
}

/** What the site answers, or why it wouldn't. @param {string} path */
async function api(path) {
  const at = site()
  const sign = btoa(`${String(f2.preferences.email ?? "").trim()}:${String(f2.preferences.token ?? "").trim()}`)
  const response = await fetch(`https://${at}/rest/api/3${path}`, { headers: { Authorization: `Basic ${sign}`, Accept: "application/json" } })
  // (A refused sign-in can still answer, as someone signed out: Jira says so in a header.)
  if (response.status === 401 || /AUTHENTICAT/.test(response.headers.get("x-seraph-loginreason") ?? "")) {
    throw new Error(`${at} refused the email and API token: check both in its settings (⌘,); a token's made at id.atlassian.com › Security › API tokens.`)
  }
  const body = await response.json().catch(() => null)
  // (Atlassian's edge, not a site, says "errorMessage": "Site temporarily unavailable".)
  if (response.status === 404 && (!body || body.errorMessage)) throw new Error(`There's no Jira site at ${at}: check its address in its settings (⌘,).`)
  if (!response.ok) {
    const why = body?.errorMessages?.[0] ?? Object.values(body?.errors ?? {})[0] ?? `${response.status}`
    if (response.status === 403) throw new Error(`Jira refused (${why}): your account may need permission to browse that project.`)
    throw Object.assign(new Error(`Jira said: ${why}`), { status: response.status })
  }
  return body
}

/** Issues the JQL finds; nothing found is checked to be so, not a sign-in gone wrong. @param {string} jql @param {number} most */
async function search(jql, most) {
  /** @type {Issue[]} */
  const issues = (await api(`/search/jql?${new URLSearchParams({ jql, fields: FIELDS, maxResults: String(most) })}`)).issues
  if (!issues.length) await api("/myself")
  return issues
}

/** A Jira time ("2026-10-26T19:37:45.138-0500") as a Date. @param {string} stamp */
const when = (stamp) => new Date(stamp.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"))

/** "3h ago". @param {string} stamp */
function ago(stamp) {
  const secs = (Date.now() - when(stamp).getTime()) / 1000
  for (const [unit, size] of /** @type {[string, number][]} */ ([["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]])) {
    if (secs >= size) return `${Math.floor(secs / size)}${unit} ago`
  }
  return "just now"
}

/** An issue as a row, its description beside it. @param {Issue} i */
function row(i) {
  const f = i.fields
  const link = `https://${site()}/browse/${i.key}`
  const type = f.issuetype?.name ?? ""
  const [icon, tint] = /** @type {Record<string, string[]>} */ (TYPES)[type.toLowerCase().replace(/[^a-z]/g, "")] ?? ["square.fill", "gray"]
  const status = /** @type {Record<string, string>} */ (CATEGORY)[f.status.statusCategory?.key ?? ""] ?? "gray"
  return {
    title: f.summary,
    subtitle: [i.key, f.project?.name].filter(Boolean).join(" · "),
    icon,
    color: tint,
    accessory: ago(f.updated),
    tags: [{ text: f.status.name, color: status }],
    keywords: [i.key, f.project?.key ?? "", f.status.name, type, f.assignee?.displayName ?? ""].filter(Boolean),
    detail: {
      markdown: `# ${f.summary}\n\n${(f.description && markdown(f.description)) || "*No description.*"}`,
      metadata: [
        { label: "Status", text: f.status.name, color: status },
        { label: "Priority", text: f.priority?.name ?? "None" },
        { label: "Type", text: type },
        { label: "Assignee", text: f.assignee?.displayName ?? "No one" },
        { label: "Reporter", text: f.reporter?.displayName ?? "No one" },
        { label: "Updated", text: when(f.updated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) },
      ],
    },
    actions: [
      { title: "Open in Jira", open: link, icon: "safari" },
      { title: "Copy Key", copy: i.key, icon: "number" },
      { title: "Copy Link", copy: link, icon: "link" },
    ],
  }
}

f2.command("mine", async () => {
  f2.loading("Getting your issues…")
  const issues = await search("assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC", 100)
  f2.show({ items: issues.map(row), placeholder: "Search your issues…", loading: false })
})

f2.command("search", async ({ query }) => {
  const q = query.trim()
  if (!q) {
    f2.loading("Getting what you've looked at…")
    const seen = await search("issue in issueHistory() ORDER BY lastViewed DESC", 20)
    f2.show({ items: seen.map((i) => ({ ...row(i), section: "Recently viewed" })), placeholder: "An issue's key (ABC-123), or words in it…", loading: false })
    return
  }
  // A key goes straight to its issue (if there's one), anything else is looked for in issues' text.
  if (/^[a-z][a-z0-9_]*-\d+$/i.test(q)) {
    f2.loading(`Getting ${q.toUpperCase()}…`)
    /** @type {Issue | null} */
    const issue = await api(`/issue/${q.toUpperCase()}?fields=${FIELDS}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)))
    if (issue) {
      f2.show({ items: [row(issue)], loading: false })
      return
    }
  }
  // (Without what text search takes as operators: AND in capitals, quotes, brackets, wildcards. Its last word may be the start of one.)
  const words = q.toLowerCase().replace(/[+\-&|!(){}[\]^~*?\\:"/]/g, " ").replace(/\s+/g, " ").trim()
  if (!words) {
    f2.show({ items: [], loading: false })
    return
  }
  f2.loading(`Searching Jira for “${q}”…`)
  f2.show({ items: (await search(`text ~ "${words}*" ORDER BY updated DESC`, 25)).map(row), loading: false })
})

// (Those whose text runs on in the line.)
const INLINE = new Set(["text", "hardBreak", "mention", "emoji", "inlineCard", "date", "status", "mediaInline", "placeholder", "inlineExtension"])
const PANELS = { info: "ℹ️", note: "📝", warning: "⚠️", success: "✅", error: "⛔" }

/**
 * Atlassian Document Format (a description) as markdown: paragraphs,
 * headings, lists, task lists, code, quotes, panels, rules, tables, links
 * and marks; attachments only said to be there.
 * @param {Node} node @returns {string}
 */
function markdown(node) {
  const a = node.attrs ?? {}
  const kids = node.content ?? []
  /** Its children: text run together, blocks apart. @param {string} [gap] */
  const inner = (gap = "\n\n") => (kids.length && INLINE.has(kids[0].type) ? kids.map(markdown).join("") : kids.map(markdown).filter(Boolean).join(gap))
  /** A list item: its marker, then the rest under it. @param {string} marker @param {Node} item */
  const item = (marker, item) => marker + markdown({ ...item, type: "listItem" }).split("\n").join(`\n${" ".repeat(marker.length)}`)
  switch (node.type) {
    case "text":
      return marked(node.text ?? "", node.marks ?? [])
    case "hardBreak":
      return "  \n"
    case "mention":
      return a.text ?? "@someone"
    case "emoji":
      return a.text ?? a.shortName ?? ""
    case "inlineCard":
    case "blockCard":
    case "embedCard":
      return a.url ? `<${a.url}>` : ""
    case "date": {
      // (Milliseconds since 1970, or seconds in the docs' example.)
      const t = Number(a.timestamp)
      return new Date(t < 1e11 ? t * 1000 : t).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
    }
    case "status":
      return `**${a.text ?? ""}**`
    case "heading":
      return `${"#".repeat(Math.min(Math.max(a.level ?? 1, 1), 6))} ${inner()}`
    case "listItem":
      return inner("\n")
    case "bulletList":
      return kids.map((k) => item("- ", k)).join("\n")
    case "orderedList":
      return kids.map((k, n) => item(`${(a.order ?? 1) + n}. `, k)).join("\n")
    case "taskList":
      return kids.map((k) => (k.type === "taskList" ? markdown(k).replace(/^/gm, "  ") : item(k.attrs?.state === "DONE" ? "- [x] " : "- [ ] ", k))).join("\n")
    case "decisionList":
      return kids.map((k) => item("- ✓ ", k)).join("\n")
    case "codeBlock":
      return `\`\`\`${a.language ?? ""}\n${kids.map((k) => k.text ?? "").join("")}\n\`\`\``
    case "blockquote":
      return inner().replace(/^/gm, "> ")
    case "panel":
      return `${/** @type {Record<string, string>} */ (PANELS)[a.panelType] ?? "ℹ️"} ${inner()}`.replace(/^/gm, "> ")
    case "rule":
      return "---"
    case "expand":
    case "nestedExpand":
      return `${a.title ? `**${a.title}**\n\n` : ""}${inner()}`
    case "table": {
      const rows = kids.map((r) => `| ${(r.content ?? []).map((c) => markdown({ ...c, type: "listItem" }).replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`)
      const columns = kids[0]?.content?.length ?? 1
      return [rows[0], `|${" --- |".repeat(columns)}`, ...rows.slice(1)].join("\n")
    }
    case "mediaSingle":
    case "mediaGroup":
    case "media":
    case "mediaInline":
      return node.type === "mediaGroup" || node.type === "mediaSingle" ? inner() : a.type === "external" && a.url ? `[${a.alt || "Image"}](${a.url})` : `*(${a.alt || "an attachment"}, in Jira)*`
    default:
      return inner()
  }
}

/** Text with its marks: bold, italics, struck, code, a link. @param {string} text @param {{ type: string, attrs?: Record<string, any> }[]} marks */
function marked(text, marks) {
  // (Its spaces outside the marks, or markdown doesn't see them.)
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? ["", "", text, ""]
  if (!core) return text
  let s = core
  for (const m of [...marks].sort((x, y) => Number(y.type === "code") - Number(x.type === "code"))) {
    if (m.type === "code") s = `\`${s}\``
    else if (m.type === "strong") s = `**${s}**`
    else if (m.type === "em") s = `*${s}*`
    else if (m.type === "strike") s = `~~${s}~~`
    else if (m.type === "link" && m.attrs?.href) s = `[${s}](${m.attrs.href})`
  }
  return lead + s + trail
}
