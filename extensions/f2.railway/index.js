// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Railway: your projects (each service's latest deployment), a project's
// services, a service's deployments, everything deployed lately, and a
// deployment's build or deploy log, from Railway's GraphQL API with a
// token of yours. A page with a build going on keeps itself up to date
// while it's open, and says when each is done.

const API = "https://backboard.railway.com/graphql/v2"
const DASHBOARD = "https://railway.com"

/**
 * @typedef {{ commitMessage?: string, commitHash?: string, branch?: string, repo?: string, commitAuthor?: string,
 *   image?: string, reason?: string }} Meta
 * @typedef {{ id: string, status: string, createdAt: string, statusUpdatedAt?: string | null, url?: string | null,
 *   staticUrl?: string | null, meta?: Meta | null, canRedeploy?: boolean, canRollback?: boolean,
 *   deploymentStopped?: boolean, creator?: { name?: string | null } | null, serviceId?: string | null,
 *   service?: { name: string } | null }} Deployment
 * @typedef {{ serviceId: string, serviceName: string, environmentId: string, latestDeployment?: Deployment | null,
 *   domains?: { serviceDomains: { domain: string }[], customDomains: { domain: string }[] } }} Instance
 * @typedef {{ id: string, name: string, isEphemeral?: boolean, serviceInstances?: { edges: { node: Instance }[] },
 *   deployments?: { edges: { node: Deployment }[] } }} Environment
 * @typedef {{ id: string, name: string, updatedAt?: string, workspace: string,
 *   environments: { edges: { node: Environment }[] } }} Project
 * @typedef {{ project: { id: string, name: string }, environment: { id: string, name: string } }} Where
 */

/** Railway turned the token away (or what it asked for isn't the token's to see). */
class Refused extends Error {}

const TOKEN =
  "Railway didn't accept the token: it may be mistyped, deleted, or a project's (those don't work here). Make one at railway.com/account/tokens and set it in its settings (⌘,)."

/** Requests the token has left this hour, as Railway last said. */
let left = Infinity

/**
 * What Railway's API answers, or what's wrong, in a sentence.
 * @param {string} query @param {Record<string, unknown>} [variables]
 * @returns {Promise<any>}
 */
async function api(query, variables = {}) {
  const response = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${String(f2.preferences.token ?? "").trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? NaN)
  if (!Number.isNaN(remaining)) left = remaining
  if (response.status === 429) throw new Error("Railway says that's too many requests for this hour: try again in a while.")
  /** @type {{ data?: any, errors?: { message: string }[] }} */
  const body = await response.json().catch(() => ({}))
  const why = body.errors?.[0]?.message
  if (response.status === 401 || /not authorized|unauthenticated|invalid token/i.test(why ?? "")) throw new Refused(TOKEN)
  if (why) throw new Error(`Railway said: ${why.replace(/\.$/, "")}.`)
  if (!response.ok || !body.data) throw new Error(`Railway said ${response.status}.`)
  return body.data
}

/**
 * Every project the token sees, with `fields` of each: in every workspace
 * you're in (an account's token), or the one a workspace's is.
 * @param {string} fields
 * @returns {Promise<Project[]>}
 */
async function everyProject(fields) {
  try {
    const data = await api(`query { me { workspaces { name projects { edges { node { ${fields} } } } } } }`)
    /** @type {{ name: string, projects: { edges: { node: Omit<Project, "workspace"> }[] } }[]} */
    const workspaces = data.me.workspaces
    return workspaces.flatMap((w) => w.projects.edges.map((e) => ({ ...e.node, workspace: w.name })))
  } catch (e) {
    // (A workspace's token can't ask who you are: its projects are asked for by themselves.)
    if (!(e instanceof Refused)) throw e
    const data = await api(`query { projects { edges { node { ${fields} workspace { name } } } } }`)
    /** @type {{ node: Omit<Project, "workspace"> & { workspace?: { name: string } | null } }[]} */
    const edges = data.projects.edges
    return edges.map((e) => ({ ...e.node, workspace: e.node.workspace?.name ?? "" }))
  }
}

const DEPLOYMENT = "id status createdAt statusUpdatedAt url staticUrl meta canRedeploy canRollback deploymentStopped creator { name }"
const INSTANCES = `serviceInstances { edges { node { serviceId serviceName environmentId
  latestDeployment { ${DEPLOYMENT} } domains { serviceDomains { domain } customDomains { domain } } } } }`
const PROJECT = `id name updatedAt environments { edges { node { id name isEphemeral ${INSTANCES} } } }`

// A deployment's statuses, as shown. `going`: still on its way (built,
// deployed), so a page showing it looks again.
/** @typedef {{ text: string, color: string, icon: string, going?: boolean, bad?: boolean }} Status */
/** @type {Record<string, Status>} */
const STATUSES = {
  SUCCESS: { text: "Active", color: "green", icon: "checkmark.circle.fill" },
  BUILDING: { text: "Building", color: "yellow", icon: "hammer.fill", going: true },
  DEPLOYING: { text: "Deploying", color: "yellow", icon: "arrow.up.circle.fill", going: true },
  INITIALIZING: { text: "Initializing", color: "yellow", icon: "hourglass", going: true },
  QUEUED: { text: "Queued", color: "yellow", icon: "clock.fill", going: true },
  WAITING: { text: "Waiting", color: "orange", icon: "pause.circle.fill", going: true },
  NEEDS_APPROVAL: { text: "Needs Approval", color: "orange", icon: "hand.raised.fill" },
  FAILED: { text: "Failed", color: "red", icon: "xmark.octagon.fill", bad: true },
  CRASHED: { text: "Crashed", color: "red", icon: "exclamationmark.triangle.fill", bad: true },
  SLEEPING: { text: "Sleeping", color: "indigo", icon: "moon.zzz.fill" },
  REMOVING: { text: "Removing", color: "gray", icon: "minus.circle" },
  REMOVED: { text: "Removed", color: "gray", icon: "minus.circle.fill" },
  SKIPPED: { text: "Skipped", color: "gray", icon: "forward.fill" },
}
/** @type {Status} */
const STOPPED = { text: "Stopped", color: "gray", icon: "stop.circle.fill" }
/** @type {Status} */
const NONE = { text: "Not deployed", color: "gray", icon: "circle.dashed" }

/** @param {Deployment | null | undefined} d @returns {Status} */
function status(d) {
  if (!d) return NONE
  if (d.status === "SUCCESS" && d.deploymentStopped) return STOPPED
  return STATUSES[d.status] ?? { text: d.status, color: "gray", icon: "circle.dashed" }
}

/** "3h ago". @param {string | null | undefined} iso */
function ago(iso) {
  const at = Date.parse(iso ?? "")
  if (Number.isNaN(at)) return ""
  const gone = (Date.now() - at) / 1000
  for (const [unit, size] of /** @type {[string, number][]} */ ([["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]])) {
    if (gone >= size) return `${Math.floor(gone / size)}${unit} ago`
  }
  return "just now"
}
/** "1m 20s". @param {number} ms */
const took = (ms) => (ms >= 3600000 ? `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m` : ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${Math.max(1, Math.round(ms / 1000))}s`)

/** How long it's been going (still going), or took (done). @param {Deployment} d */
function duration(d) {
  const from = Date.parse(d.createdAt)
  const to = status(d).going ? Date.now() : Date.parse(d.statusUpdatedAt ?? "")
  return Number.isNaN(from) || Number.isNaN(to) || to < from ? "" : took(to - from)
}

/** What its commit (or image) says. @param {Meta | null | undefined} meta */
function commit(meta) {
  const message = String(meta?.commitMessage ?? "").trim()
  return {
    title: message.split("\n")[0],
    body: message.split("\n").slice(1).join("\n").trim(),
    sha: String(meta?.commitHash ?? "").slice(0, 7),
    branch: String(meta?.branch ?? ""),
    repo: String(meta?.repo ?? ""),
    author: String(meta?.commitAuthor ?? ""),
    image: String(meta?.image ?? ""),
    reason: String(meta?.reason ?? ""),
  }
}

/** Its address: its own domain if it has one, else Railway's. @param {Instance} i */
function address(i) {
  const domain = i.domains?.customDomains[0]?.domain ?? i.domains?.serviceDomains[0]?.domain
  return domain ? `https://${domain}` : ""
}

// A deployment's steps, as Railway's dashboard has them.
/** @type {Record<string, string>} */
const STEPS = {
  WAIT_FOR_DEPENDENCIES: "Wait for dependencies",
  SNAPSHOT_CODE: "Snapshot the code",
  BUILD_IMAGE: "Build the image",
  PUBLISH_IMAGE: "Publish the image",
  PRE_DEPLOY_COMMAND: "Pre-deploy command",
  MIGRATE_VOLUMES: "Migrate volumes",
  CREATE_CONTAINER: "Create the container",
  CONFIGURE_NETWORK: "Configure the network",
  HEALTHCHECK: "Healthcheck",
  DRAIN_INSTANCES: "Drain the old instances",
}
const EVENTS = "edges { node { step createdAt completedAt payload { error skipped } } }"
/** @typedef {{ step: string, createdAt: string, completedAt?: string | null, payload?: { error?: string | null, skipped?: boolean | null } | null }} Step */

/** Where it stopped, and why: its failed step's error. @param {Step[]} steps */
function failure(steps) {
  const failed = steps.find((e) => e.payload?.error)
  return failed?.payload?.error ? `${STEPS[failed.step] ?? failed.step}: ${failed.payload.error}` : ""
}

/** Why each failed deployment did, by id (they don't change: asked once each). @type {Map<string, string>} */
const why = new Map()

/** Asks why those of `deployments` that failed did, all at once. @param {Deployment[]} deployments */
async function askWhy(deployments) {
  const ids = [...new Set(deployments.filter((d) => status(d).bad && !why.has(d.id)).map((d) => d.id))].slice(0, 25)
  if (!ids.length) return
  const data = await api(
    `query (${ids.map((_, n) => `$d${n}: String!`).join(", ")}) { ${ids.map((_, n) => `d${n}: deploymentEvents(id: $d${n}) { ${EVENTS} }`).join(" ")} }`,
    Object.fromEntries(ids.map((id, n) => [`d${n}`, id])),
  ).catch(() => null)
  for (const [n, id] of ids.entries()) {
    /** @type {{ node: Step }[] | undefined} */
    const edges = data?.[`d${n}`]?.edges
    if (edges) why.set(id, failure(edges.map((e) => e.node)))
  }
}

/** A failed deployment's reason, quoted, for its detail. @param {Deployment | null | undefined} d */
const reason = (d) => (d && why.get(d.id) ? `> ${why.get(d.id)}` : "")

/** Where it is in Railway's dashboard. @param {string} project @param {string} [service] @param {string} [environment] @param {string} [deployment] */
function dashboard(project, service, environment, deployment) {
  if (!service) return `${DASHBOARD}/project/${project}`
  const asked = new URLSearchParams({ ...(environment ? { environmentId: environment } : {}), ...(deployment ? { id: deployment } : {}) })
  return `${DASHBOARD}/project/${project}/service/${service}${asked.size ? `?${asked}` : ""}`
}

/**
 * A deployment's actions: its log first when it failed (that says why).
 * @param {Deployment} d @param {string} name its service's @param {string} link in Railway @param {string} site its address, if any
 * @param {boolean} latest whether it's its service's latest
 */
function actions(d, name, link, site, latest) {
  const s = status(d)
  const c = commit(d.meta)
  const build = { title: "Build Log", push: { command: "logs", args: { id: d.id, kind: "build", name, link } }, icon: "hammer" }
  const deploy = { title: "Deploy Log", push: { command: "logs", args: { id: d.id, kind: "deploy", name, link } }, icon: "doc.plaintext" }
  const live = d.status === "SUCCESS" && !d.deploymentStopped
  // (An image's deployed as it is, not built: a database's, say.)
  const built = !c.image || Boolean(c.repo)
  const first = s.bad ? (d.status === "CRASHED" || !built ? deploy : build) : null
  return [
    ...(first ? [first] : []),
    ...(site && live && latest ? [{ title: "Open URL", open: site, icon: "safari" }] : []),
    { title: "Open in Railway", open: link, icon: "tram" },
    ...(built && first !== build ? [build] : []),
    ...(first !== deploy ? [deploy] : []),
    ...(site ? [{ title: "Copy URL", copy: site, icon: "link" }] : []),
    ...(s.going
      ? [{ title: "Cancel Deployment", run: { command: "cancel", args: { id: d.id, name } }, icon: "xmark.circle", confirm: `Cancel ${name}'s deployment?`, destructive: true }]
      : []),
    ...(d.canRedeploy && !s.going
      ? [{ title: latest ? "Redeploy" : "Redeploy This One", run: { command: "redeploy", args: { id: d.id, name } }, icon: "arrow.clockwise", confirm: `Build and deploy ${name} again?` }]
      : []),
    ...(live && latest ? [{ title: "Restart", run: { command: "restart", args: { id: d.id, name } }, icon: "power", confirm: `Restart ${name}? (It isn't built again.)` }] : []),
  ]
}

/** What's known of a deployment, as facts. @param {Deployment} d @param {string} [environment] */
function facts(d, environment) {
  const s = status(d)
  const c = commit(d.meta)
  const by = d.creator?.name ?? ""
  return [
    { label: "Status", text: s.text, color: s.color },
    ...(environment ? [{ label: "Environment", text: environment }] : []),
    ...(c.repo ? [{ label: "Repository", text: c.repo }] : []),
    ...(c.branch ? [{ label: "Branch", text: c.branch }] : []),
    ...(c.sha ? [{ label: "Commit", text: c.sha }] : []),
    ...(c.image ? [{ label: "Image", text: c.image }] : []),
    ...(c.author && c.author !== by ? [{ label: "Author", text: c.author }] : []),
    ...(by ? [{ label: "By", text: by }] : []),
    ...(c.reason && c.reason !== "deploy" ? [{ label: "Why", text: c.reason[0].toUpperCase() + c.reason.slice(1) }] : []),
    { label: "Started", text: new Date(d.createdAt).toLocaleString("en-US") },
    ...(duration(d) ? [{ label: s.going ? "For" : "Took", text: duration(d) }] : []),
  ]
}

/** What a deployment's called: its commit's first line, or what was deployed. @param {Deployment} d @param {string} name its service's */
const named = (d, name) => commit(d.meta).title || (commit(d.meta).image ? `${name}: ${commit(d.meta).image}` : `${name} deployed`)

/** What it says beside it: how long it's been going, or when. @param {Deployment} d */
const when = (d) => (status(d).going ? `${status(d).text} · ${duration(d)}` : ago(d.createdAt))

/** A service in an environment, by its latest deployment. @param {Instance} i @param {Where} where */
function serviceRow(i, where) {
  const d = i.latestDeployment
  const s = status(d)
  const site = address(i)
  const link = dashboard(where.project.id, i.serviceId, where.environment.id)
  const c = commit(d?.meta)
  return {
    title: i.serviceName,
    subtitle: site.replace("https://", "") || c.title,
    icon: s.icon,
    color: s.color,
    section: where.environment.name,
    accessory: d ? when(d) : "",
    tags: [{ text: s.text, color: s.color }],
    keywords: [site, c.branch, c.sha, c.repo, s.text].filter(Boolean),
    detail: d
      ? { markdown: [`### ${named(d, i.serviceName)}`, reason(d), c.body].filter(Boolean).join("\n\n"), metadata: [...(site ? [{ label: "Address", text: site.replace("https://", "") }] : []), ...facts(d)] }
      : { markdown: `### ${i.serviceName}\n\nNot deployed in ${where.environment.name} yet.` },
    actions: [
      ...(d ? actions(d, i.serviceName, dashboard(where.project.id, i.serviceId, where.environment.id, d.id), site, true) : [{ title: "Open in Railway", open: link, icon: "tram" }]),
      {
        title: "Deployments",
        push: { command: "deployments", args: { project: where.project.id, service: i.serviceId, environment: where.environment.id, name: i.serviceName } },
        icon: "clock.arrow.circlepath",
      },
    ],
  }
}

/**
 * A deployment's row.
 * @param {Deployment} d @param {Where} where @param {string} name its service's
 * @param {boolean} everywhere whether its project's named (in everything's)
 * @param {boolean} [place] called by where it is, not what (a rollout's, all of one commit)
 */
function deploymentRow(d, where, name, everywhere, place = false) {
  const s = status(d)
  const c = commit(d.meta)
  const link = dashboard(where.project.id, d.serviceId ?? undefined, where.environment.id, d.id)
  return {
    title: place ? `${where.project.name} · ${name}` : named(d, name),
    subtitle: place ? where.environment.name : [everywhere ? `${where.project.name} · ${name}` : "", everywhere ? where.environment.name : "", c.branch, c.sha].filter(Boolean).join(" · "),
    icon: s.icon,
    color: s.color,
    accessory: when(d),
    tags: [{ text: s.text, color: s.color }],
    keywords: [where.project.name, name, where.environment.name, c.branch, c.sha, d.creator?.name ?? "", s.text].filter(Boolean),
    detail: { markdown: [`### ${named(d, name)}`, reason(d), c.body].filter(Boolean).join("\n\n"), metadata: [{ label: "Service", text: name }, ...facts(d, where.environment.name)] },
    actions: actions(d, name, link, d.staticUrl ? `https://${d.staticUrl}` : "", false),
  }
}

/** How long to wait before looking again (less often as the hour's requests run out), or 0: not again. */
const pause = () => (left > 300 ? 5000 : left > 100 ? 15000 : left > 25 ? 60000 : 0)
/** @param {number} ms */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * Shows what `look` finds and, while any deployment in it is going on,
 * looks again every few seconds (for half an hour at most), with a
 * notification as they end (one for all that ended at once: a commit
 * deployed to many services is one).
 * @param {() => Promise<{ items: F2.Row[], deployments: { d: Deployment, name: string, where: Where }[], placeholder: string }>} look
 */
async function watch(look) {
  /** @type {Map<string, string>} what was going on, by deployment */
  const going = new Map()
  const until = Date.now() + 30 * 60000
  for (;;) {
    const { items, deployments, placeholder } = await look()
    /** @type {{ d: Deployment, name: string, where: Where }[]} */
    const ended = []
    for (const x of deployments) {
      const s = status(x.d)
      if (going.has(x.d.id) && !s.going) ended.push(x)
      if (s.going) going.set(x.d.id, x.name)
      else going.delete(x.d.id)
    }
    if (ended.length === 1) {
      const [{ d, name, where }] = ended
      f2.notice(d.status === "SUCCESS" ? `${name} is live` : `${name}: ${status(d).text.toLowerCase()}`, `${where.project.name} · ${where.environment.name}${duration(d) ? ` · took ${duration(d)}` : ""}`)
    } else if (ended.length > 1) {
      const live = ended.filter((x) => x.d.status === "SUCCESS").length
      const failed = ended.filter((x) => status(x.d).bad)
      const which = failed.slice(0, 3).map((x) => `${x.where.project.name} · ${x.name}`).join(", ") + (failed.length > 3 ? "…" : "")
      f2.notice(`${ended.length} deployments done`, [live ? `${live} live` : "", failed.length ? `${failed.length} failed: ${which}` : ""].filter(Boolean).join(" · "))
    }
    const wait = pause()
    const watching = going.size > 0 && wait > 0 && Date.now() < until
    f2.show({
      items,
      placeholder: going.size && !wait ? "Not updating by itself: few of Railway's requests left this hour (⌘R)" : placeholder,
      loading: watching ? (going.size === 1 ? `${[...going.values()][0]}: updating as it goes…` : `${going.size} deployments going: updating as they go…`) : false,
    })
    if (!watching) return
    await sleep(wait)
  }
}

/** Each service in each of its environments, the long-lived ones first. @param {Project} p */
function instances(p) {
  const environments = p.environments.edges.map((e) => e.node).sort((a, b) => Number(a.isEphemeral ?? false) - Number(b.isEphemeral ?? false))
  return environments.flatMap((environment) =>
    (environment.serviceInstances?.edges ?? [])
      .map((e) => ({ i: e.node, where: { project: { id: p.id, name: p.name }, environment: { id: environment.id, name: environment.name } } }))
      .sort((a, b) => a.i.serviceName.localeCompare(b.i.serviceName, "en", { sensitivity: "base" })),
  )
}

/** A project's row, by its services' latest deployments. @param {Project} p @param {boolean} sectioned whether its workspace is named */
function projectRow(p, sectioned) {
  const all = instances(p)
  const latest = all.map(({ i }) => i.latestDeployment).filter((d) => d != null)
  // (What it says is what's most to know: one going on, then one that failed.)
  const first = latest.find((d) => status(d).going) ?? latest.find((d) => status(d).bad)
  const newest = [...latest].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
  const s = first ? status(first) : latest.length ? STATUSES.SUCCESS : NONE
  const names = [...new Set(all.map(({ i }) => i.serviceName))]
  const many = new Set(all.map(({ where }) => where.environment.id)).size > 1
  // (Its address: one of its own domains, else a service's built from code, not a database's.)
  const rank = (/** @type {Instance} */ i) => (i.domains?.customDomains.length ? 2 : 0) + (commit(i.latestDeployment?.meta).repo ? 1 : 0)
  const site = [...all].sort((a, b) => rank(b.i) - rank(a.i)).map(({ i }) => address(i)).find(Boolean) ?? ""
  return {
    title: p.name,
    subtitle: names.join(", ") || "No services",
    icon: "square.stack.3d.up.fill",
    color: s.color,
    ...(sectioned ? { section: p.workspace } : {}),
    accessory: first && status(first).going ? when(first) : newest ? ago(newest.createdAt) : "",
    tags: [{ text: first ? status(first).text : s.text, color: s.color }],
    keywords: [...names, p.workspace, ...all.map(({ i }) => address(i).replace("https://", ""))].filter(Boolean),
    detail: {
      markdown: `### ${p.name}`,
      metadata: all.map(({ i, where }) => {
        const d = i.latestDeployment
        return { label: many ? `${i.serviceName} (${where.environment.name})` : i.serviceName, text: d ? `${status(d).text} · ${when(d)}` : NONE.text, color: status(d).color }
      }),
    },
    actions: [
      { title: "Services", push: { command: "services", args: { project: p.id, name: p.name } }, icon: "square.stack.3d.up" },
      { title: "Open in Railway", open: dashboard(p.id), icon: "tram" },
      ...(site ? [{ title: "Open URL", open: site, icon: "safari" }] : []),
      { title: "Copy Project ID", copy: p.id, icon: "doc.on.doc" },
    ],
  }
}

f2.command("projects", async () => {
  f2.loading("Getting your projects…")
  await watch(async () => {
    const projects = await everyProject(PROJECT)
    const newest = (/** @type {Project} */ p) => Math.max(Date.parse(p.updatedAt ?? "") || 0, ...instances(p).map(({ i }) => Date.parse(i.latestDeployment?.createdAt ?? "") || 0))
    projects.sort((a, b) => newest(b) - newest(a))
    const sectioned = new Set(projects.map((p) => p.workspace)).size > 1
    return {
      items: projects.map((p) => projectRow(p, sectioned)),
      deployments: projects.flatMap((p) => instances(p).flatMap(({ i, where }) => (i.latestDeployment ? [{ d: i.latestDeployment, name: i.serviceName, where }] : []))),
      placeholder: projects.length ? "Search your projects…" : "No projects here yet",
    }
  })
})

f2.command("services", async ({ args }) => {
  f2.show({ title: args.name, loading: "Getting its services…" })
  await watch(async () => {
    const data = await api(`query ($id: String!) { project(id: $id) { ${PROJECT} } }`, { id: args.project })
    const all = instances({ ...data.project, workspace: "" })
    await askWhy(all.flatMap(({ i }) => (i.latestDeployment ? [i.latestDeployment] : [])))
    return {
      items: all.map(({ i, where }) => serviceRow(i, where)),
      deployments: all.flatMap(({ i, where }) => (i.latestDeployment ? [{ d: i.latestDeployment, name: i.serviceName, where }] : [])),
      placeholder: all.length ? "Search its services…" : "No services in it yet",
    }
  })
})

f2.command("deployments", async ({ args }) => {
  f2.show({ title: `${args.name}: Deployments`, loading: "Getting its deployments…" })
  await watch(async () => {
    const data = await api(
      `query ($input: DeploymentListInput!, $project: String!) { deployments(input: $input, first: 40) { edges { node { ${DEPLOYMENT} serviceId } } }
        project(id: $project) { name environments { edges { node { id name } } } } }`,
      { input: { projectId: args.project, serviceId: args.service, environmentId: args.environment }, project: args.project },
    )
    /** @type {Deployment[]} */
    const found = data.deployments.edges.map((/** @type {{ node: Deployment }} */ e) => e.node)
    /** @type {{ node: { id: string, name: string } }[]} */
    const environments = data.project.environments.edges
    await askWhy(found)
    const where = { project: { id: args.project, name: data.project.name }, environment: { id: args.environment, name: environments.find((e) => e.node.id === args.environment)?.node.name ?? "" } }
    return {
      items: found.map((d) => deploymentRow(d, where, args.name, false)),
      deployments: found.map((d) => ({ d, name: args.name, where })),
      placeholder: found.length ? "Search its deployments…" : "No deployments yet",
    }
  })
})

/** @typedef {{ d: Deployment, name: string, where: Where }} Placed a deployment, with its service's name and where it is */

/** The latest deployments everywhere, newest first. @returns {Promise<Placed[]>} */
async function everywhere() {
  const projects = await everyProject(`id name environments { edges { node { id name deployments(first: 10) { edges { node { ${DEPLOYMENT} serviceId service { name } } } } } } }`)
  return projects
    .flatMap((p) =>
      p.environments.edges.flatMap((e) =>
        (e.node.deployments?.edges ?? []).map((x) => ({ d: x.node, name: x.node.service?.name ?? "A service", where: { project: { id: p.id, name: p.name }, environment: { id: e.node.id, name: e.node.name } } })),
      ),
    )
    .sort((a, b) => Date.parse(b.d.createdAt) - Date.parse(a.d.createdAt))
}

/**
 * Deployments of one commit together (a push deploys every service built
 * from its repo: one rollout), each service's newest only; the rest each
 * by itself. Newest first.
 * @param {Placed[]} found newest first
 */
function rollouts(found) {
  /** @type {Map<string, Placed[]>} */
  const groups = new Map()
  for (const x of found) {
    const sha = commit(x.d.meta).sha
    const key = sha ? `${commit(x.d.meta).repo}@${sha}` : x.d.id
    const group = groups.get(key) ?? []
    if (!group.some((y) => y.d.serviceId === x.d.serviceId && y.where.environment.id === x.where.environment.id)) group.push(x)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** Going on first, then failed, then the rest, by project and service. @param {Placed[]} group */
const ordered = (group) =>
  [...group].sort(
    (a, b) =>
      Number(status(b.d).going ?? false) - Number(status(a.d).going ?? false) ||
      Number(status(b.d).bad ?? false) - Number(status(a.d).bad ?? false) ||
      `${a.where.project.name} ${a.name}`.localeCompare(`${b.where.project.name} ${b.name}`, "en", { sensitivity: "base" }),
  )

/** A commit deployed to several services: how far it's got. @param {Placed[]} group */
function rolloutRow(group) {
  const [{ d: newest }] = group
  const c = commit(newest.meta)
  const going = group.filter((x) => status(x.d).going)
  const bad = group.filter((x) => status(x.d).bad)
  const s = going.length ? STATUSES.BUILDING : bad.length ? STATUSES.FAILED : STATUSES.SUCCESS
  const started = Math.min(...group.map((x) => Date.parse(x.d.createdAt)))
  const projects = new Set(group.map((x) => x.where.project.id)).size
  const tag = going.length ? `${group.length - going.length} of ${group.length} done` : bad.length ? `${bad.length} failed` : "All active"
  return {
    title: c.title || named(newest, group[0].name),
    subtitle: [c.branch, c.sha, `${group.length} services${projects > 1 ? ` in ${projects} projects` : ""}`].filter(Boolean).join(" · "),
    icon: s.icon,
    color: s.color,
    accessory: going.length ? `${s.text} · ${took(Date.now() - started)}` : ago(newest.createdAt),
    tags: [{ text: tag, color: s.color }],
    keywords: [c.sha, c.branch, c.repo, ...new Set(group.flatMap((x) => [x.where.project.name, x.name]))].filter(Boolean),
    detail: {
      markdown: [`### ${c.title || named(newest, group[0].name)}`, ...bad.map((x) => `**${x.where.project.name} · ${x.name}**: ${why.get(x.d.id) || status(x.d).text}`), c.body].filter(Boolean).join("\n\n"),
      metadata: ordered(group).map((x) => ({ label: `${x.where.project.name} · ${x.name}`, text: `${status(x.d).text} · ${when(x.d)}`, color: status(x.d).color })),
    },
    actions: [
      { title: "Deployments", push: { command: "rollout", args: { key: `${c.repo}@${c.sha}`, title: c.title || c.sha } }, icon: "list.bullet" },
      ...(bad.length ? actions(bad[0].d, `${bad[0].where.project.name} · ${bad[0].name}`, dashboard(bad[0].where.project.id, bad[0].d.serviceId ?? undefined, bad[0].where.environment.id, bad[0].d.id), "", false).slice(0, 1) : []),
      ...(c.repo && c.sha ? [{ title: "Copy Commit", copy: commit(newest.meta).sha, icon: "doc.on.doc" }] : []),
    ],
  }
}

f2.command("recent", async () => {
  f2.loading("Getting the latest deployments…")
  await watch(async () => {
    const groups = rollouts(await everywhere()).slice(0, 25)
    const shown = groups.flat()
    await askWhy(shown.map(({ d }) => d))
    return {
      items: groups.map((g) => (g.length > 1 ? rolloutRow(g) : deploymentRow(g[0].d, g[0].where, g[0].name, true))),
      deployments: shown,
      placeholder: groups.length ? "Search the latest deployments…" : "Nothing's been deployed yet",
    }
  })
})

f2.command("rollout", async ({ args }) => {
  f2.show({ title: args.title, loading: "Getting its deployments…" })
  await watch(async () => {
    const group = rollouts(await everywhere()).find((g) => `${commit(g[0].d.meta).repo}@${commit(g[0].d.meta).sha}` === args.key) ?? []
    await askWhy(group.map(({ d }) => d))
    return {
      items: ordered(group).map(({ d, name, where }) => deploymentRow(d, where, name, true, true)),
      deployments: group,
      placeholder: group.length ? "Search its deployments…" : "It isn't among the latest deployments now",
    }
  })
})

/** Text as the log had it, without its terminal colors. @param {string} s */
const plain = (s) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "")

// A line that's an error, by what it says: Railway's builds mark every
// line "info".
const ERROR = /^\s*(?:\[[^\]]*\]\s*)?(?:error|fatal|panic)\b|npm ERR!|\bERR_[A-Z_]{3,}\b|exit(?:ed with)? code:? [1-9]/i

/** Its steps, each ticked off (or why it failed), as a list. @param {Step[]} steps @param {boolean} going */
function stepList(steps, going) {
  return [...steps]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((e) => {
      const from = Date.parse(e.createdAt)
      const to = e.completedAt ? Date.parse(e.completedAt) : going ? Date.now() : NaN
      const time = Number.isNaN(to) ? "" : ` · ${took(to - from)}`
      const name = STEPS[e.step] ?? e.step
      if (e.payload?.error) return `- ✗ **${name}**${time}: ${e.payload.error}`
      if (e.payload?.skipped) return `- – ${name} (skipped)`
      return e.completedAt ? `- ✓ ${name}${time}` : going ? `- ⋯ **${name}**${time}` : `- ${name}`
    })
    .join("\n")
}

f2.command("logs", async ({ args }) => {
  const deploy = args.kind === "deploy"
  const name = deploy ? "Deploy Log" : "Build Log"
  f2.show({ title: `${args.name}: ${name}`, loading: `Getting its ${name.toLowerCase()}…` })
  const until = Date.now() + 30 * 60000
  let was = ""
  for (;;) {
    const data = await api(
      `query ($id: String!) { deployment(id: $id) { ${DEPLOYMENT} } logs: ${deploy ? "deploymentLogs" : "buildLogs"}(deploymentId: $id, limit: 1500) { message severity }
        steps: deploymentEvents(id: $id) { ${EVENTS} } }`,
      { id: args.id },
    )
    /** @type {Deployment} */
    const d = data.deployment
    const s = status(d)
    /** @type {{ message: string, severity?: string | null }[]} */
    const logs = data.logs
    const lines = logs.flatMap((l) => plain(l.message).replace(/\n$/, "").split("\n").map((text) => ({ text, error: /^err/i.test(l.severity ?? "") || ERROR.test(text) })))
    /** @type {Step[]} */
    const steps = data.steps.edges.map((/** @type {{ node: Step }} */ e) => e.node)
    if (s.bad) why.set(d.id, failure(steps))
    // (A build's going on: its latest lines first, where it's got to.)
    const following = s.going && (!deploy || d.status === "DEPLOYING")
    const MOST = 600
    const shown = lines.slice(-MOST)
    const errors = lines.filter((l) => l.error && l.text.trim()).slice(-20)
    const block = (/** @type {string[]} */ ls) => `\`\`\`\`\n${ls.join("\n")}\n\`\`\`\``
    f2.show({
      title: `${args.name}: ${name}`,
      detail: {
        markdown: [
          `### ${named(d, args.name)}`,
          steps.length ? stepList(steps, s.going ?? false) : "",
          following && lines.length > 25 ? `**Latest**\n\n${block(lines.slice(-25).map((l) => l.text))}` : "",
          errors.length ? `**Errors**\n\n${block(errors.map((l) => l.text))}` : "",
          lines.length > MOST ? `*The last ${MOST} of its ${lines.length.toLocaleString("en-US")} lines (the rest in Railway).*` : "",
          lines.length ? block(shown.map((l) => l.text)) : following ? "Nothing in it yet: it's starting." : "Nothing's in it.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        metadata: [
          { label: "Status", text: s.text, color: s.color },
          ...(duration(d) ? [{ label: s.going ? "For" : "Took", text: duration(d) }] : []),
          { label: "Lines", text: lines.length.toLocaleString("en-US") },
          ...(errors.length ? [{ label: "Errors", text: String(lines.filter((l) => l.error).length), color: "red" }] : []),
        ],
        actions: [
          { title: "Open in Railway", open: args.link, icon: "tram" },
          { title: "Copy Log", copy: lines.map((l) => l.text).join("\n"), icon: "doc.on.doc" },
        ],
      },
      loading: following ? `${s.text}: following it…` : false,
    })
    if (was && was !== d.status && !s.going) f2.notice(d.status === "SUCCESS" ? `${args.name} is live` : `${args.name}: ${s.text.toLowerCase()}`, duration(d) ? `Took ${duration(d)}` : undefined)
    was = d.status
    const wait = pause()
    if (!following || !wait || Date.now() > until) return
    await sleep(Math.min(wait, 4000))
  }
})

f2.command("redeploy", async ({ args }) => {
  f2.loading(`Starting ${args.name}'s deployment…`)
  await api("mutation ($id: String!) { deploymentRedeploy(id: $id) { id } }", { id: args.id })
  f2.show({ notice: { title: `${args.name} is being deployed`, text: "Its build has started." }, refresh: true })
})

f2.command("restart", async ({ args }) => {
  f2.loading(`Restarting ${args.name}…`)
  await api("mutation ($id: String!) { deploymentRestart(id: $id) }", { id: args.id })
  f2.show({ notice: { title: `${args.name} is restarting` }, refresh: true })
})

f2.command("cancel", async ({ args }) => {
  f2.loading(`Canceling ${args.name}'s deployment…`)
  await api("mutation ($id: String!) { deploymentCancel(id: $id) }", { id: args.id })
  f2.show({ notice: { title: `${args.name}'s deployment was canceled` }, refresh: true })
})
