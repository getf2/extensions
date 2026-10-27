// @ts-check
/// <reference path="../../types/f2.d.ts" />

// GitHub: your repos (and your organizations'), their issues and Actions
// runs, from GitHub's REST API; pull requests from its GraphQL API (one
// request says how each is reviewed and how much it changes); and a failed
// run's failed steps, from its failed jobs' logs.

const API = "https://api.github.com"
const GITHUB = "#24292f"
const OPEN = "#1a7f37"
const DRAFT = "#59636e"
// What a job or step that went wrong ends as.
const FAILED = new Set(["failure", "timed_out"])
// Of a failed step's log, its last lines: where it says what went wrong.
const LAST = 150
// The most of a log shown: the rest is on GitHub.
const MOST = 60_000

const headers = () => ({
  Authorization: `Bearer ${String(f2.preferences.token ?? "").trim()}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2026-03-10",
})

/**
 * Why GitHub said no, and what to do about it.
 * @param {F2Response} response @param {string} need the token's permission it takes ("Issues")
 */
async function refused(response, need) {
  const why = (await response.json().catch(() => ({}))).message ?? `${response.status}`
  if (response.status === 401) return new Error(`GitHub refused the token (${why}): make a new one, and set it in its settings (⌘,).`)
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const at = new Date(Number(response.headers.get("x-ratelimit-reset")) * 1000)
    return new Error(`GitHub's rate limit is reached: try again at ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`)
  }
  if (response.status === 429 || response.headers.has("retry-after")) return new Error(`GitHub asks to wait a minute (${why}): try again soon (⌘R).`)
  if (response.status === 403) return new Error(`GitHub refused (${why}): the token needs Read-only for ${need}, and an organization may have to approve it.`)
  if (response.status === 404) return new Error(`GitHub found nothing there: the token may not have that repo, or Read-only for ${need} on it.`)
  return new Error(`GitHub said ${response.status}: ${why}`)
}

/** A page of the REST API's, and the next page's address. @param {string} url @param {string} need */
async function get(url, need) {
  const response = await fetch(url, { headers: headers() })
  if (!response.ok) throw await refused(response, need)
  return { body: await response.json(), next: /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1] }
}

/** The GraphQL API's data: what it could say, if not all of it. @param {string} query @param {Record<string, unknown>} [variables] */
async function graphql(query, variables = {}) {
  const response = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: { query, variables },
  })
  if (!response.ok) throw await refused(response, "Pull requests")
  const { data, errors } = await response.json()
  if (errors?.length) {
    console.log("GitHub said:", errors.map((/** @type {any} */ e) => e.message).join(" · "))
    // (Some pull requests may be in repos the token can't see: the others are shown.)
    if (!data || !Object.values(data).some(Boolean)) {
      const types = errors.map((/** @type {any} */ e) => e.type)
      const hint = types.includes("NOT_FOUND") ? " Or the token may not have that repo." : types.includes("FORBIDDEN") || types.includes("INSUFFICIENT_SCOPES") ? " The token needs Read-only for Pull requests." : ""
      throw new Error(`GitHub said: ${errors[0].message.replace(/\.?$/, ".")}${hint}`)
    }
  }
  return data
}

/** "owner/name", as an action gave it. @param {unknown} repo */
function repoName(repo) {
  const name = String(repo ?? "")
  if (!/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error(`“${name}” isn't a repo's name (owner/name).`)
  return name
}

/** "3h ago". @param {string | null} [stamp] */
function ago(stamp) {
  if (!stamp) return ""
  const gone = (Date.now() - Date.parse(stamp)) / 1000
  for (const [unit, size] of /** @type {[string, number][]} */ ([["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]])) {
    if (gone >= size) return `${Math.floor(gone / size)}${unit} ago`
  }
  return "just now"
}

/** @param {any} r a repo, as the REST API has it */
function repo(r) {
  const name = r.full_name
  return {
    title: r.name,
    subtitle: r.description || name,
    icon: r.private ? "lock.fill" : "book.closed.fill",
    color: GITHUB,
    section: r.owner.login,
    accessory: [r.language, r.stargazers_count ? `★ ${r.stargazers_count}` : "", ago(r.pushed_at)].filter(Boolean).join(" · "),
    tags: [
      ...(r.private ? [{ text: "Private", color: "gray" }] : []),
      ...(r.fork ? [{ text: "Fork", color: "purple" }] : []),
      ...(r.archived ? [{ text: "Archived", color: "orange" }] : []),
    ],
    keywords: [name, r.language ?? ""].filter(Boolean),
    actions: [
      { title: "Open on GitHub", open: r.html_url, icon: "safari" },
      { title: "Pull Requests", push: { command: "prs", args: { repo: name } }, icon: "arrow.triangle.pull" },
      { title: "Issues", push: { command: "issues", args: { repo: name } }, icon: "exclamationmark.circle" },
      { title: "Actions Runs", push: { command: "runs", args: { repo: name } }, icon: "play.circle" },
      { title: "Copy Clone URL", copy: r.ssh_url, icon: "doc.on.doc" },
      { title: "Copy Name", copy: name, icon: "textformat" },
    ],
  }
}

f2.command("repos", async () => {
  f2.loading("Fetching your repos…")
  // (Yours and your organizations', most recently pushed first, a page at a time.)
  /** @type {string | undefined} */
  let url = `${API}/user/repos?${new URLSearchParams({ affiliation: "owner,organization_member", sort: "pushed", per_page: "100" })}`
  for (let page = 0, count = 0; url && page < 10; page++) {
    const { body, next } = await get(url, "Metadata")
    count += body.length
    f2.show(page === 0 ? { items: body.map(repo) } : { append: body.map(repo) })
    if (next) f2.loading(`Fetching your repos… (${count})`)
    url = next
  }
  f2.show({ loading: false, placeholder: "Search your repos…" })
})

/**
 * @typedef {{ number: number, title: string, url: string, isDraft: boolean, body: string, updatedAt: string, headRefName: string,
 *   reviewDecision: string | null, additions: number, deletions: number, author: { login: string } | null,
 *   repository: { nameWithOwner: string, isArchived: boolean } }} PullRequest
 */
const PULL_REQUEST = "number title url isDraft body updatedAt headRefName reviewDecision additions deletions author { login } repository { nameWithOwner isArchived }"

/** @param {PullRequest} p @returns {F2.Row} */
function pullRequest(p) {
  const author = p.author?.login ?? "ghost"
  const review = p.reviewDecision === "APPROVED" ? { text: "Approved", color: "green" } : p.reviewDecision === "CHANGES_REQUESTED" ? { text: "Changes", color: "red" } : null
  return {
    title: p.title,
    subtitle: `#${p.number}`,
    icon: "arrow.triangle.pull",
    color: p.isDraft ? DRAFT : OPEN,
    tags: [...(p.isDraft ? [{ text: "Draft", color: "gray" }] : []), ...(review ? [review] : [])],
    keywords: [String(p.number), author, p.headRefName],
    detail: {
      markdown: `## ${p.title}\n\n${p.body || "_No description._"}`,
      metadata: [
        { label: "Repo", text: p.repository.nameWithOwner },
        { label: "Author", text: author },
        { label: "Updated", text: ago(p.updatedAt) },
        { label: "Branch", text: p.headRefName },
        { label: "Changes", text: `+${p.additions} −${p.deletions}` },
      ],
    },
    actions: [
      { title: "Open on GitHub", open: p.url, icon: "safari" },
      { title: "Copy Link", copy: p.url, icon: "link" },
      { title: "Copy Branch Name", copy: p.headRefName, icon: "arrow.triangle.branch" },
    ],
  }
}

f2.command("prs", async ({ args }) => {
  const [owner, name] = repoName(args.repo).split("/")
  f2.show({ title: `${name}: Pull Requests`, loading: "Fetching pull requests…" })
  const data = await graphql(
    `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { pullRequests(states: OPEN, first: 100, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { ${PULL_REQUEST} } } } }`,
    { owner, name },
  )
  /** @type {PullRequest[]} */
  const found = data.repository.pullRequests.nodes.filter(Boolean)
  f2.show({ items: found.map(pullRequest), loading: false, placeholder: "Search pull requests…" })
})

f2.command("my-prs", async () => {
  f2.loading("Fetching your pull requests…")
  const data = await graphql(`{ viewer { pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${PULL_REQUEST} } } } }`)
  /** @type {PullRequest[]} */
  const found = data.viewer.pullRequests.nodes.filter((/** @type {PullRequest | null} */ p) => p && !p.repository.isArchived)
  f2.show({
    items: found.map((p) => ({ ...pullRequest(p), subtitle: `${p.repository.nameWithOwner} #${p.number}`, section: p.repository.nameWithOwner })),
    loading: false,
    placeholder: "Search your pull requests…",
  })
})

f2.command("issues", async ({ args }) => {
  const repo = repoName(args.repo)
  f2.show({ title: `${repo.split("/")[1]}: Issues`, loading: "Fetching issues…" })
  /** @type {any[]} */
  const found = []
  // (Its list has pull requests in it too, so up to three pages for 100 issues.)
  /** @type {string | undefined} */
  let url = `${API}/repos/${repo}/issues?state=open&per_page=100`
  for (let page = 0; url && page < 3 && found.length < 100; page++) {
    const { body, next } = await get(url, "Issues")
    found.push(...body.filter((/** @type {any} */ i) => !i.pull_request))
    url = next
  }
  f2.show({
    items: found.slice(0, 100).map((i) => {
      const author = i.user?.login ?? "ghost"
      /** @type {{ name: string, color?: string }[]} */
      const labels = (i.labels ?? []).map((/** @type {any} */ l) => (typeof l === "string" ? { name: l } : l))
      return {
        title: i.title,
        subtitle: `#${i.number}`,
        icon: "exclamationmark.circle.fill",
        color: OPEN,
        tags: labels.slice(0, 3).map((l) => ({ text: l.name, ...(l.color ? { color: `#${l.color}` } : {}) })),
        keywords: [String(i.number), author, ...labels.map((l) => l.name)],
        detail: {
          markdown: `## ${i.title}\n\n${i.body || "_No description._"}`,
          metadata: [
            { label: "Author", text: author },
            { label: "Updated", text: ago(i.updated_at) },
            ...(i.comments ? [{ label: "Comments", text: String(i.comments) }] : []),
          ],
        },
        actions: [
          { title: "Open on GitHub", open: i.html_url, icon: "safari" },
          { title: "Copy Link", copy: i.html_url, icon: "link" },
        ],
      }
    }),
    loading: false,
    placeholder: "Search issues…",
  })
})

/** How a run ended: its icon, color and word. @type {Record<string, [string, string, string]>} */
const ENDED = {
  success: ["checkmark.circle.fill", "green", "Passed"],
  failure: ["xmark.circle.fill", "red", "Failed"],
  timed_out: ["xmark.circle.fill", "red", "Timed out"],
  cancelled: ["slash.circle", "gray", "Cancelled"],
  skipped: ["arrow.uturn.right.circle", "gray", "Skipped"],
}
/** "in_progress" as "In progress". @param {string} [s] */
const said = (s) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : "")

f2.command("runs", async ({ args }) => {
  const repo = repoName(args.repo)
  f2.show({ title: `${repo.split("/")[1]}: Actions`, loading: "Fetching runs…" })
  const { body } = await get(`${API}/repos/${repo}/actions/runs?per_page=50`, "Actions")
  f2.show({
    items: body.workflow_runs.map((/** @type {any} */ r) => {
      const [icon, color, word] = r.status !== "completed" ? ["clock.fill", "yellow", said(r.status)] : ENDED[r.conclusion] ?? ["questionmark.circle", "gray", said(r.conclusion)]
      return {
        title: r.display_title,
        subtitle: [r.name, r.head_branch].filter(Boolean).join(" · "),
        icon,
        color,
        section: r.name,
        tags: word ? [{ text: word, color }] : [],
        accessory: ago(r.created_at),
        keywords: [r.head_branch ?? "", r.event].filter(Boolean),
        actions: [
          { title: "Open on GitHub", open: r.html_url, icon: "safari" },
          ...(FAILED.has(r.conclusion) ? [{ title: "Show Failed Steps' Log", push: { command: "run-log", args: { repo, id: r.id } }, icon: "doc.text.magnifyingglass" }] : []),
          { title: "Copy Link", copy: r.html_url, icon: "link" },
        ],
      }
    }),
    loading: false,
    placeholder: "Search runs…",
  })
})

/**
 * @typedef {{ name: string, conclusion: string | null, started_at: string | null, completed_at: string | null }} Step
 * @typedef {{ id: number, name: string, html_url: string, conclusion: string | null, completed_at: string | null, steps?: Step[] }} Job
 */

/**
 * A job's log, as text, or why there's none. (GitHub answers with a link to it
 * on Azure's storage, which F2 follows without the token.)
 * @param {string} repo @param {Job} job
 */
async function jobLog(repo, job) {
  const response = await fetch(`${API}/repos/${repo}/actions/jobs/${job.id}/logs`, { headers: headers() })
  if (response.ok) return { log: await response.text() }
  if (response.status === 404 || response.status === 410) return { none: "GitHub no longer has its log: it keeps them as long as the repo's settings say (90 days, unless changed)." }
  if (response.url.startsWith(`${API}/`)) throw await refused(response, "Actions")
  return { none: `Its log couldn't be downloaded (${response.status}): try again (⌘R), or open it on GitHub.` }
}

/** A log's line as it reads: without its colors, GitHub's markers said plainly (or left out: null). @param {string} line */
function clean(line) {
  const text = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
  if (text.startsWith("##[endgroup]")) return null
  return text.replace(/^##\[group\]/, "").replace(/^##\[error\]/, "Error: ").replace(/^##\[warning\]/, "Warning: ").replace(/^##\[(notice|debug|command)\]/, "")
}

/**
 * A failed job's failed steps, each with its last lines, as `gh run view
 * --log-failed` shows: the job's log is one text, each line stamped with when
 * it was written, so a step's lines are those from when it began till it ended.
 * @param {string} log @param {Job} job
 */
function failedSteps(log, job) {
  /** @type {{ at: number, text: string, starts: boolean, error: boolean }[]} */
  const lines = []
  let at = 0
  for (const raw of log.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?Z ?(.*)$/.exec(raw)
    if (m) at = Date.parse(`${m[1]}Z`) / 1000
    const said = m ? m[2] : raw
    const text = clean(said)
    if (text !== null) lines.push({ at, text, starts: said.startsWith("##[group]"), error: said.startsWith("##[error]") })
  }
  while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop()
  /** @param {string} name @param {string[]} mine */
  const last = (name, mine) => ({ name, lines: mine.slice(-LAST), cut: Math.max(0, mine.length - LAST) })
  const steps = (job.steps ?? [])
    .filter((s) => FAILED.has(s.conclusion ?? "") && s.started_at)
    .map((s) => {
      // (Stamped to the second, a step often ends as the next ones begin: in
      // its first and last seconds, GitHub's markers tell them apart, a step
      // beginning at "##[group]" and a failed one ending at its "##[error]".)
      const from = Math.floor(Date.parse(s.started_at ?? "") / 1000)
      const to = Math.floor(Date.parse(s.completed_at ?? job.completed_at ?? "") / 1000) || Infinity
      const mine = lines.filter((l) => l.at >= from && l.at <= to)
      const begins = mine.findIndex((l) => l.starts)
      const error = mine.map((l) => l.error).lastIndexOf(true)
      const kept = mine.filter((l, i) => (i >= begins || l.at > from) && (error < 0 || i <= error || l.at < to))
      return last(s.name, kept.map((l) => l.text))
    })
    .filter((s) => s.lines.length)
  // (Failed before a step ran, or its steps not found in the log: the job's last lines.)
  return steps.length ? steps : [last("Its last lines", lines.map((l) => l.text))]
}

/** Text as a code block, its fence longer than any backticks in it. @param {string} text */
function code(text) {
  const fence = "`".repeat(Math.max(3, ...(text.match(/`{3,}/g) ?? []).map((b) => b.length + 1)))
  return `${fence}\n${text}\n${fence}`
}

f2.command("run-log", async ({ args }) => {
  const repo = repoName(args.repo)
  const run = `https://github.com/${repo}/actions/runs/${Number(args.id)}`
  f2.show({ title: "Failed Steps", loading: "Finding the failed jobs…" })
  /** @type {Job[]} */
  const jobs = (await get(`${API}/repos/${repo}/actions/runs/${Number(args.id)}/jobs?filter=latest&per_page=100`, "Actions")).body.jobs
  const failed = jobs.filter((j) => FAILED.has(j.conclusion ?? ""))
  /** @type {string[]} */
  const parts = []
  /** @type {string[]} */
  const copied = []
  let size = 0
  for (const [i, job] of failed.entries()) {
    if (size > MOST) {
      parts.push(`*${failed.length - i} more failed jobs on GitHub.*`)
      break
    }
    f2.loading(`Reading ${job.name}'s log…`, i / failed.length)
    const { log, none } = await jobLog(repo, job)
    parts.push(`## ${job.name}`)
    if (!log) {
      parts.push(`_${none}_`)
      continue
    }
    for (const step of failedSteps(log, job)) {
      const text = step.lines.join("\n")
      size += text.length
      parts.push(`### ${step.name}${step.cut ? `\n\n*Its last ${LAST} lines (${step.cut.toLocaleString("en-US")} before, on GitHub):*` : ""}\n\n${code(text)}`)
      copied.push(`── ${job.name} › ${step.name} ──\n${text}`)
    }
  }
  if (!failed.length) parts.push("_No job failed in its latest attempt: the run may have failed before any job ran, or been run again since._")
  f2.show({
    detail: {
      markdown: parts.join("\n\n"),
      metadata: [
        { label: "Repo", text: repo },
        { label: "Run", text: String(args.id) },
        { label: "Failed", text: `${failed.length} of ${jobs.length} jobs`, color: failed.length ? "red" : "gray" },
      ],
      actions: [
        { title: "Open on GitHub", open: failed.length === 1 ? failed[0].html_url : run, icon: "safari" },
        { title: "Copy Log", copy: copied.join("\n\n"), icon: "doc.on.doc" },
      ],
    },
    loading: false,
  })
})
