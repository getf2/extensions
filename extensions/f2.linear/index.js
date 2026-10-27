// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Linear: your open issues in sections by state, its search, and a new
// issue made in one of your teams, all from Linear's GraphQL API with a
// personal API key.

const API = "https://api.linear.app/graphql"
// What's asked of each issue, for its row and its detail.
const ISSUE = `id identifier title url branchName priority priorityLabel description updatedAt
  state { name type color position } assignee { name } team { key name }
  labels(first: 10) { nodes { name } } project { name } cycle { number name }`
// A state's kind as a symbol, and where its section comes in My Issues.
const ICONS = { triage: "tray", backlog: "circle.dashed", unstarted: "circle", started: "circle.lefthalf.filled", completed: "checkmark.circle.fill", canceled: "xmark.circle.fill" }
const ORDER = ["started", "unstarted", "triage", "backlog"]

/**
 * @typedef {{ id: string, identifier: string, title: string, url: string, branchName: string, priority: number, priorityLabel: string,
 *   description?: string | null, updatedAt: string, state: { name: string, type: string, color: string, position: number },
 *   assignee?: { name: string } | null, team: { key: string, name: string }, labels: { nodes: { name: string }[] },
 *   project?: { name: string } | null, cycle?: { number: number, name?: string | null } | null }} Issue
 */

/** What Linear answers a query, or why it wouldn't. @param {string} query @param {Record<string, unknown>} [variables] */
async function gql(query, variables = {}) {
  const key = String(f2.preferences.apiKey ?? "").trim()
  if (!key) throw new Error("No API key: set one in its settings (⌘,).")
  // (A personal key is sent as it is, without "Bearer".)
  const response = await fetch(API, { method: "POST", headers: { Authorization: key, "Content-Type": "application/json" }, body: { query, variables } })
  const body = await response.json().catch(() => ({}))
  const error = body.errors?.[0]
  const code = error?.extensions?.code
  if (response.status === 401 || code === "AUTHENTICATION_ERROR") throw new Error("Linear refused the API key: make one in Linear's Settings › Security & access › Personal API keys, and set it in its settings (⌘,).")
  if (code === "RATELIMITED" || response.status === 429) throw new Error("Linear says that's too many requests for now: try again in a minute.")
  if (code === "FORBIDDEN" || response.status === 403) throw new Error(`Linear refused (${error?.message ?? response.status}): the API key may need more permissions (Read, and Create issues to make one).`)
  if (error) throw new Error(`Linear said: ${error.extensions?.userPresentableMessage ?? error.message}`)
  if (!response.ok || !body.data) throw new Error(`Linear said ${response.status}.`)
  return body.data
}

/** "3h ago". @param {string} stamp */
function ago(stamp) {
  const secs = (Date.now() - new Date(stamp).getTime()) / 1000
  for (const [unit, size] of /** @type {[string, number][]} */ ([["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]])) {
    if (secs >= size) return `${Math.floor(secs / size)}${unit} ago`
  }
  return "just now"
}

/** @param {string} [c] */
const color = (c) => (c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : "gray")

/** An issue as a row; in My Issues, under its state. @param {Issue} i @param {boolean} [mine] */
function row(i, mine) {
  const labels = i.labels.nodes.map((l) => l.name)
  const cycle = i.cycle && (i.cycle.name || `Cycle ${i.cycle.number}`)
  return {
    title: i.title,
    subtitle: [i.identifier, i.project?.name].filter(Boolean).join(" · "),
    icon: /** @type {Record<string, string>} */ (ICONS)[i.state.type] ?? "circle",
    color: color(i.state.color),
    ...(mine ? { section: i.state.name } : {}),
    accessory: mine ? ago(i.updatedAt) : `${i.state.name} · ${ago(i.updatedAt)}`,
    // (Only what wants doing soon is tagged.)
    tags: i.priority === 1 ? [{ text: "Urgent", color: "red" }] : i.priority === 2 ? [{ text: "High", color: "orange" }] : [],
    keywords: [i.identifier, i.team.key, i.team.name, i.state.name, i.project?.name ?? "", i.assignee?.name ?? "", ...labels].filter(Boolean),
    detail: {
      markdown: `# ${i.title}\n\n${i.description?.trim() || "*No description.*"}`,
      metadata: [
        { label: "State", text: i.state.name, color: color(i.state.color) },
        { label: "Priority", text: i.priorityLabel },
        { label: "Assignee", text: i.assignee?.name ?? "No one" },
        ...(labels.length ? [{ label: "Labels", text: labels.join(", ") }] : []),
        ...(i.project ? [{ label: "Project", text: i.project.name }] : []),
        ...(cycle ? [{ label: "Cycle", text: cycle }] : []),
      ],
    },
    actions: [
      { title: "Open in Linear", open: i.url, icon: "safari" },
      { title: "Copy Branch Name", copy: i.branchName, icon: "arrow.triangle.branch" },
      { title: "Copy ID", copy: i.identifier, icon: "number" },
      { title: "Copy Link", copy: i.url, icon: "link" },
    ],
  }
}

f2.command("mine", async () => {
  f2.loading("Getting your issues…")
  /** @type {Issue[]} */
  const issues = []
  /** @type {string | null} */
  let after = null
  // (A hundred at a time, three hundred at most.)
  for (let page = 0; page < 3; page++) {
    const { viewer } = await gql(
      `query ($after: String) { viewer { assignedIssues(first: 100, after: $after, orderBy: updatedAt, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
        nodes { ${ISSUE} } pageInfo { hasNextPage endCursor } } } }`,
      { after },
    )
    issues.push(...viewer.assignedIssues.nodes)
    if (!viewer.assignedIssues.pageInfo.hasNextPage) break
    after = viewer.assignedIssues.pageInfo.endCursor
  }
  // Started first, then to do, then the rest; within each, the furthest along, then the most pressing.
  const rank = (/** @type {Issue} */ i) => (ORDER.includes(i.state.type) ? ORDER.indexOf(i.state.type) : ORDER.length)
  const urgency = (/** @type {Issue} */ i) => i.priority || 5
  issues.sort((a, b) => rank(a) - rank(b) || b.state.position - a.state.position || urgency(a) - urgency(b) || b.updatedAt.localeCompare(a.updatedAt))
  f2.show({ items: issues.map((i) => row(i, true)), placeholder: "Search your issues…", loading: false })
})

f2.command("search", async ({ query }) => {
  const q = query.trim()
  if (!q) {
    f2.loading("Getting what's new…")
    const { issues } = await gql(`{ issues(first: 25, orderBy: updatedAt) { nodes { ${ISSUE} } } }`)
    f2.show({ items: issues.nodes.map((/** @type {Issue} */ i) => ({ ...row(i), section: "Recently updated" })), placeholder: "Search Linear issues…", loading: false })
    return
  }
  f2.loading(`Searching Linear for “${q}”…`)
  const { searchIssues } = await gql(`query ($q: String!) { searchIssues(term: $q, first: 25) { nodes { ${ISSUE} } } }`, { q })
  f2.show({ items: searchIssues.nodes.map((/** @type {Issue} */ i) => row(i)), loading: false })
})

f2.command("create", async ({ query }) => {
  const title = query.trim()
  if (!title) {
    f2.show({ items: [], placeholder: "The new issue's title…", loading: false })
    return
  }
  f2.loading("Getting your teams…")
  const { viewer } = await gql(`{ viewer { teams(first: 50) { nodes { id key name } } } }`)
  /** @type {{ id: string, key: string, name: string }[]} */
  const teams = viewer.teams.nodes
  if (!teams.length) throw new Error("You aren't in any team in Linear: join one there to make issues in it.")
  f2.show({
    items: teams.map((t) => ({
      title: `Create “${title}” in ${t.name}`,
      subtitle: t.key,
      icon: "plus.circle",
      actions: [{ title: `Create in ${t.name}`, run: { command: "create-issue", args: { team: t.id, title } }, icon: "plus" }],
    })),
    loading: false,
  })
})

f2.command("create-issue", async ({ args }) => {
  f2.loading(`Creating “${args.title}”…`)
  const { issueCreate } = await gql(
    `mutation ($team: String!, $title: String!) { issueCreate(input: { teamId: $team, title: $title }) { success issue { identifier url } } }`,
    { team: args.team, title: args.title },
  )
  if (!issueCreate.success || !issueCreate.issue) throw new Error("Linear didn't make the issue: try again.")
  f2.show({ notice: { title: `Created ${issueCreate.issue.identifier}`, text: args.title }, open: issueCreate.issue.url, refresh: true, loading: false })
})
