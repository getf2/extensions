// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Vercel: your projects (each with its production address, framework and
// latest deployment), a project's deployments and everyone's lately, and a
// deployment's build log, from Vercel's REST API with a token of yours.

const API = "https://api.vercel.com"

/**
 * @typedef {{ uid: string, name: string, url?: string | null, created: number, readyState?: string, state?: string,
 *   target?: string | null, meta?: Record<string, string>, creator?: { username?: string }, inspectorUrl?: string | null,
 *   buildingAt?: number, ready?: number, errorMessage?: string | null }} Deployment
 * @typedef {{ createdAt: number, readyState: string, meta?: Record<string, string>, creator?: { username?: string } }} Latest
 * @typedef {{ id: string, name: string, accountId: string, framework?: string | null, nodeVersion?: string, updatedAt?: number,
 *   latestDeployments?: Latest[], targets?: Record<string, { alias?: string[], url?: string } | null>, link?: Record<string, any> }} Project
 */

/** The team its settings name, or "". */
const team = () => String(f2.preferences.team ?? "").trim()

/**
 * What Vercel's API answers, or what's wrong, in a sentence. A team's asked
 * for by its id (team_…) or its slug, as its settings name it.
 * @param {string} path @param {Record<string, string | number>} [params] @param {boolean} [scoped] whether it's asked of the team
 */
async function api(path, params = {}, scoped = true) {
  const t = scoped ? team() : ""
  const asked = new URLSearchParams({ ...params, ...(t ? { [t.startsWith("team_") ? "teamId" : "slug"]: t } : {}) })
  const response = await fetch(`${API}${path}${asked.size ? `?${asked}` : ""}`, {
    headers: { Authorization: `Bearer ${String(f2.preferences.token ?? "").trim()}` },
  })
  if (response.ok) return response.json()
  /** @type {{ error?: { message?: string, invalidToken?: boolean } }} */
  const body = await response.json().catch(() => ({}))
  const why = body.error?.message?.replace(/\.$/, "")
  // (Vercel says 403 with `invalidToken` for a token it doesn't know.)
  if (response.status === 401 || body.error?.invalidToken)
    throw new Error("Vercel didn't accept the token: it may be mistyped, revoked or expired. Make one at vercel.com/account/tokens and set it in its settings (⌘,).")
  if (t && (response.status === 403 || (response.status === 404 && /team/i.test(why ?? ""))))
    throw new Error(`Vercel won't show the team “${t}” with this token: check its slug or ID in its settings (⌘,), and that the token's scope includes that team.`)
  if (response.status === 403)
    throw new Error(`Vercel refused the token (${why ?? "not authorized"}): its scope may not reach this. Make one whose scope is Full Account, or set the team in its settings (⌘,).`)
  if (response.status === 404) throw new Error(`Vercel says ${why ? `“${why}”` : "it isn't there"}: it may have been deleted, or be another team's.`)
  if (response.status === 429) throw new Error("Vercel says that's too many requests for now: try again in a minute.")
  throw new Error(`Vercel said ${response.status}${why ? `: ${why}` : ""}.`)
}

/** "3h ago". @param {number} [ms] since 1970 */
function ago(ms) {
  if (!ms) return ""
  const gone = (Date.now() - ms) / 1000
  for (const [unit, size] of /** @type {[string, number][]} */ ([["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]])) {
    if (gone >= size) return `${Math.floor(gone / size)}${unit} ago`
  }
  return "just now"
}
/** "1m 20s". @param {number} ms */
const took = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${Math.max(1, Math.round(ms / 1000))}s`)

// A deployment's states, as shown.
/** @type {Record<string, { text: string, color: string, icon: string }>} */
const STATES = {
  READY: { text: "Ready", color: "green", icon: "checkmark.circle.fill" },
  ERROR: { text: "Error", color: "red", icon: "xmark.octagon.fill" },
  BUILDING: { text: "Building", color: "yellow", icon: "hammer.fill" },
  INITIALIZING: { text: "Initializing", color: "yellow", icon: "hourglass" },
  QUEUED: { text: "Queued", color: "yellow", icon: "clock.fill" },
  CANCELED: { text: "Canceled", color: "gray", icon: "slash.circle.fill" },
  BLOCKED: { text: "Blocked", color: "orange", icon: "hand.raised.fill" },
  DELETED: { text: "Deleted", color: "gray", icon: "trash.fill" },
}
/** @param {string} [s] */
const state = (s) => STATES[s ?? ""] ?? { text: s ?? "Unknown", color: "gray", icon: "circle.dashed" }

// Frameworks' names, by Vercel's ids for them (the rest as they are).
/** @type {Record<string, string>} */
const FRAMEWORKS = {
  nextjs: "Next.js", nuxtjs: "Nuxt", sveltekit: "SvelteKit", "sveltekit-1": "SvelteKit", astro: "Astro", remix: "Remix",
  "react-router": "React Router", vite: "Vite", "create-react-app": "Create React App", gatsby: "Gatsby", vue: "Vue",
  angular: "Angular", hugo: "Hugo", eleventy: "Eleventy", "docusaurus-2": "Docusaurus", "tanstack-start": "TanStack Start",
  solidstart: "SolidStart", "solidstart-1": "SolidStart", vitepress: "VitePress", vuepress: "VuePress", storybook: "Storybook",
  node: "Node.js", express: "Express", hono: "Hono", nestjs: "NestJS", fastapi: "FastAPI", flask: "Flask", python: "Python",
}
/** @param {string | null} [id] */
const framework = (id) => (id ? FRAMEWORKS[id] ?? id : "Other")

/**
 * What a deployment's Git provider said of it, in its `meta`
 * ("githubCommitRef"…, or gitlab…, bitbucket…).
 * @param {Record<string, string>} [meta]
 */
function git(meta = {}) {
  const p = ["github", "gitlab", "bitbucket", "cursorOrigin"].find((p) => meta[`${p}CommitSha`] || meta[`${p}CommitRef`]) ?? "github"
  const message = meta[`${p}CommitMessage`]?.trim() ?? ""
  return {
    branch: meta[`${p}CommitRef`] ?? "",
    title: message.split("\n")[0],
    body: message.split("\n").slice(1).join("\n").trim(),
    sha: meta[`${p}CommitSha`]?.slice(0, 7) ?? "",
    author: meta[`${p}CommitAuthorName`] ?? meta[`${p}CommitAuthorLogin`] ?? "",
  }
}

/** A deployment's row. @param {Deployment} d @param {boolean} named whether its project is named (in everyone's) */
function deployment(d, named) {
  const g = git(d.meta)
  const s = state(d.readyState ?? d.state)
  const url = d.url ? `https://${d.url}` : ""
  const title = g.title || d.url || d.name
  const who = d.creator?.username ?? g.author
  const where = d.target ? d.target[0].toUpperCase() + d.target.slice(1) : "Preview"
  const failed = (d.readyState ?? d.state) === "ERROR"
  // (Nothing's at a failed, canceled or deleted one's URL.)
  const gone = failed || s.text === "Canceled" || s.text === "Deleted"
  const log = { title: "Build Log", push: { command: "log", args: { id: d.uid, title, inspector: d.inspectorUrl ?? "" } }, icon: "doc.plaintext" }
  return {
    title,
    subtitle: [named ? d.name : "", g.branch, where].filter(Boolean).join(" · "),
    icon: s.icon,
    color: s.color,
    accessory: [who, ago(d.created)].filter(Boolean).join(" · "),
    tags: [{ text: s.text, color: s.color }],
    keywords: [d.name, g.branch, who, g.sha, d.url ?? "", where, s.text].filter(Boolean),
    detail: {
      markdown: [`### ${title}`, g.body, d.errorMessage ? `> ${d.errorMessage}` : ""].filter(Boolean).join("\n\n"),
      metadata: [
        { label: "State", text: s.text, color: s.color },
        { label: "Environment", text: where },
        ...(g.branch ? [{ label: "Branch", text: g.branch }] : []),
        ...(g.sha ? [{ label: "Commit", text: g.sha }] : []),
        ...(g.author && g.author !== who ? [{ label: "Author", text: g.author }] : []),
        ...(who ? [{ label: "By", text: who }] : []),
        { label: "Created", text: new Date(d.created).toLocaleString("en-US") },
        ...(d.ready && d.buildingAt ? [{ label: "Built in", text: took(d.ready - d.buildingAt) }] : []),
      ],
    },
    // (A failed one's log first: it says why.)
    actions: [
      ...(failed ? [log] : []),
      ...(url && !gone ? [{ title: "Open URL", open: url, icon: "safari" }] : []),
      ...(d.inspectorUrl ? [{ title: "Open in Vercel", open: d.inspectorUrl, icon: "triangle" }] : []),
      ...(url ? [{ title: "Copy URL", copy: url, icon: "link" }] : []),
      ...(failed ? [] : [log]),
    ],
  }
}

/** A project's production address: its own domain if it has one, else Vercel's. @param {Project} p */
function production(p) {
  const aliases = p.targets?.production?.alias ?? []
  return aliases.find((a) => !a.endsWith(".vercel.app")) ?? aliases[0] ?? p.targets?.production?.url ?? ""
}

/** Its Git repository: "owner/repo". @param {Record<string, any>} [link] */
const repository = (link) => (link ? link.projectNameWithNamespace ?? [link.org ?? link.owner, link.repo ?? link.slug].filter(Boolean).join("/") : "")

/** A project's row. @param {Project} p @param {string} [slug] its account's, in the dashboard's addresses */
function project(p, slug) {
  const latest = [...(p.latestDeployments ?? [])].sort((a, b) => b.createdAt - a.createdAt)[0]
  const s = latest ? state(latest.readyState) : null
  const g = git(latest?.meta)
  const host = production(p)
  const site = host ? `https://${host}` : ""
  const repo = repository(p.link)
  const who = latest?.creator?.username ?? g.author
  return {
    title: p.name,
    subtitle: host || "Not in production yet",
    icon: "triangle.fill",
    color: s?.color ?? "gray",
    accessory: [framework(p.framework), latest ? ago(latest.createdAt) : ""].filter(Boolean).join(" · "),
    tags: s ? [{ text: s.text, color: s.color }] : [],
    keywords: [host, repo, framework(p.framework), ...(p.targets?.production?.alias ?? [])].filter(Boolean),
    detail: {
      markdown: latest ? [`### ${g.title || "Latest deployment"}`, g.body].filter(Boolean).join("\n\n") : "### Not deployed yet",
      metadata: [
        ...(s ? [{ label: "Latest", text: s.text, color: s.color }] : []),
        ...(g.branch ? [{ label: "Branch", text: g.branch }] : []),
        ...(g.sha ? [{ label: "Commit", text: g.sha }] : []),
        ...(who ? [{ label: "By", text: who }] : []),
        ...(latest ? [{ label: "Deployed", text: ago(latest.createdAt) }] : []),
        { label: "Production", text: host || "None yet" },
        { label: "Framework", text: framework(p.framework) },
        ...(repo ? [{ label: "Repository", text: repo }] : []),
        ...(p.nodeVersion ? [{ label: "Node.js", text: p.nodeVersion }] : []),
      ],
    },
    actions: [
      ...(site ? [{ title: "Open URL", open: site, icon: "safari" }] : []),
      { title: "Deployments", push: { command: "deployments", args: { project: p.id, name: p.name } }, icon: "clock.arrow.circlepath" },
      { title: "Open in Vercel", open: slug ? `https://vercel.com/${slug}/${p.name}` : "https://vercel.com/dashboard", icon: "triangle" },
      ...(site ? [{ title: "Copy URL", copy: site, icon: "link" }] : []),
    ],
  }
}

/**
 * The dashboard's name for each account its projects are in (a team's
 * slug, or your username), for their addresses there. A token that can't
 * ask (one project's) goes to the dashboard instead.
 * @param {Project[]} projects
 */
async function slugs(projects) {
  const t = team()
  /** @type {Record<string, string | undefined>} */
  const names = {}
  for (const id of new Set(projects.map((p) => p.accountId))) {
    names[id] =
      t && !t.startsWith("team_")
        ? t
        : id.startsWith("team_")
          ? (await api(`/v2/teams/${id}`, {}, false).catch(() => null))?.slug
          : (await api("/v2/user", {}, false).catch(() => null))?.user?.username
  }
  return names
}

f2.command("projects", async () => {
  f2.loading("Getting your projects…")
  /** @type {Project[]} */
  const projects = []
  /** @type {number | null | undefined} */
  let next
  do {
    // (Vercel answers with a page of them, or a plain list.)
    const page = await api("/v10/projects", { limit: 100, ...(next ? { until: next } : {}) })
    projects.push(...(Array.isArray(page) ? page : page.projects ?? []))
    next = Array.isArray(page) ? null : page.pagination?.next
  } while (next && projects.length < 1000)
  const names = await slugs(projects)
  const when = (/** @type {Project} */ p) => Math.max(p.updatedAt ?? 0, ...(p.latestDeployments ?? []).map((d) => d.createdAt))
  projects.sort((a, b) => when(b) - when(a))
  f2.show({
    items: projects.map((p) => project(p, names[p.accountId])),
    placeholder: projects.length ? "Search your projects…" : "No projects here: is the team in its settings (⌘,) the right one?",
    loading: false,
  })
})

/** Deployments, newest first. @param {Record<string, string | number>} params @param {boolean} named */
async function deployments(params, named) {
  /** @type {Deployment[]} */
  const found = (await api("/v7/deployments", { limit: 50, ...params })).deployments
  f2.show({
    items: found.map((d) => deployment(d, named)),
    placeholder: found.length ? "Search deployments…" : "No deployments yet",
    loading: false,
  })
}

f2.command("recent", async () => {
  f2.loading("Getting the latest deployments…")
  await deployments({}, true)
})

f2.command("deployments", async ({ args }) => {
  f2.show({ title: `${args.name}: Deployments`, loading: "Getting its deployments…" })
  await deployments({ projectId: args.project }, false)
})

/** Text as Vercel's log had it, without its terminal colors. @param {string} s */
const plain = (s) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "")

f2.command("log", async ({ args }) => {
  f2.show({ title: "Build Log", loading: "Getting the build log…" })
  /** @type {{ type: string, created: number, text?: string, level?: string, payload?: { text?: string } }[]} */
  const events = await api(`/v3/deployments/${encodeURIComponent(args.id)}/events`, { direction: "forward", limit: -1 })
  const lines = events.flatMap((e) => {
    const text = e.text ?? e.payload?.text
    return text && e.type !== "delimiter" ? plain(text).replace(/\n$/, "").split("\n").map((l) => ({ text: l, error: e.level === "error" || e.type === "fatal" })) : []
  })
  // (The end's where a build fails: the most shown is its last 600 lines.)
  const MOST = 600
  const shown = lines.slice(-MOST)
  const errors = lines.filter((l) => l.error && l.text.trim()).slice(-20)
  const block = (/** @type {string[]} */ ls) => `\`\`\`\`\n${ls.join("\n")}\n\`\`\`\``
  f2.show({
    title: "Build Log",
    detail: {
      markdown: [
        `### ${args.title}`,
        errors.length ? `**Errors**\n\n${block(errors.map((l) => l.text))}` : "",
        lines.length > MOST ? `*The last ${MOST} of its ${lines.length.toLocaleString("en-US")} lines (the rest in Vercel).*` : "",
        lines.length ? block(shown.map((l) => l.text)) : "Nothing's in its log yet.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      metadata: [
        { label: "Lines", text: lines.length.toLocaleString("en-US") },
        { label: "Errors", text: String(lines.filter((l) => l.error).length), color: errors.length ? "red" : "green" },
      ],
      actions: [
        ...(args.inspector ? [{ title: "Open in Vercel", open: args.inspector, icon: "triangle" }] : []),
        { title: "Copy Log", copy: lines.map((l) => l.text).join("\n"), icon: "doc.on.doc" },
      ],
    },
    loading: false,
  })
})
