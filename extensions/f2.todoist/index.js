// @ts-check
/// <reference path="../../types/f2.d.ts" />

// Todoist: what's due today (and overdue), and in the next seven days, by
// priority, from Todoist's API (v1) with your API token; a task completed
// from its row, and one added as typed, read by Todoist's own Quick Add
// ("Call Ana tomorrow 3pm p1 #Work").

const API = "https://api.todoist.com/api/v1"
const RED = "#e44332"
// Todoist's priorities as it shows them: the API's 4 is "P1", red.
/** @type {Record<number, { name: string, icon: string, color: string }>} */
const PRIORITY = {
  4: { name: "P1", icon: "flag.fill", color: "#d1453b" },
  3: { name: "P2", icon: "flag.fill", color: "#eb8909" },
  2: { name: "P3", icon: "flag.fill", color: "#246fe0" },
  1: { name: "P4", icon: "circle", color: "gray" },
}
const DAY = 86_400_000

/**
 * Todoist's answer, or an error that says what to do.
 * @param {string} path @param {{ method?: string, body?: object }} [options]
 */
async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${String(f2.preferences.token ?? "").trim()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body,
  })
  const text = await response.text()
  /** @type {any} */
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {}
  if (response.ok) return body
  const why = body?.error ?? (text.trim().slice(0, 200) || `${response.status}`)
  if (response.status === 401) throw new Error("Todoist refused the token: copy it again from Todoist's Settings › Integrations › Developer, into its settings here (⌘,).")
  if (response.status === 429) throw new Error(`Todoist asks to wait (${why}): try again in ${body?.error_extra?.retry_after ?? 60} seconds.`)
  if (response.status === 403) throw new Error(`Todoist refused (${why}): the token may be for another account.`)
  throw new Error(`Todoist said ${response.status}: ${why}`)
}

/** All of a list's pages. @param {string} path @param {Record<string, string>} [params] */
async function all(path, params = {}) {
  /** @type {any[]} */
  const found = []
  /** @type {string | null} */
  let cursor = null
  do {
    const page = await api(`${path}?${new URLSearchParams({ ...params, limit: "200", ...(cursor ? { cursor } : {}) })}`)
    found.push(...page.results)
    cursor = page.next_cursor
  } while (cursor && found.length < 2000)
  return found
}

/** Its projects' names, by id. */
async function projects() {
  return new Map((await all("/projects")).map((p) => [p.id, p.name]))
}

/**
 * When a task's due: its moment (in this Mac's time zone), whether it has a
 * time, and how many days from today. Todoist's are "2026-10-27" (a day),
 * "2026-10-27T15:00:00" (a time wherever you are) or "…Z" (a fixed one).
 * @param {{ date?: string } | null} due
 */
function when(due) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d))?(?:\.\d+)?(Z)?)?$/.exec(due?.date ?? "")
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map((x) => Number(x ?? 0))
  const at = m[7] ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s)
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY)
  return { at, timed: m[4] !== undefined, days }
}

/** "Today", "Tomorrow", "Yesterday", or the day ("Thursday, Oct 30"). @param {Date} at @param {number} days */
function dayName(at, days) {
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days === -1) return "Yesterday"
  const year = at.getFullYear() !== new Date().getFullYear() ? { year: /** @type {const} */ ("numeric") } : {}
  return at.toLocaleDateString(undefined, { weekday: days > 0 && days < 7 ? "long" : "short", month: "short", day: "numeric", ...year })
}

/** @param {Date} at */
const time = (at) => at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

/** A task's text as a title: its markdown links as their text, without bold. @param {string} content */
const plain = (content) => content.replace(/\[([^\]]*)\]\([^)\s]*\)/g, "$1").replace(/\*\*/g, "").trim()

/** Where "Open in Todoist" goes: the app, or the web (its settings say). @param {string} [id] */
const link = (id) =>
  f2.preferences.open === "web" ? `https://app.todoist.com/app/${id ? `task/${id}` : "today"}` : id ? `todoist://task?id=${id}` : "todoist://today"

/**
 * A task's row.
 * @param {any} t a task, as Todoist's API has it
 * @param {Map<string, string>} names its projects' names
 * @param {(due: NonNullable<ReturnType<typeof when>>) => string} said its due date, as its page says it
 * @returns {F2.Row}
 */
function row(t, names, said) {
  const due = when(t.due)
  const priority = PRIORITY[t.priority] ?? PRIORITY[1]
  const project = names.get(t.project_id) ?? ""
  const title = plain(t.content)
  /** @type {string[]} */
  const labels = t.labels ?? []
  const deadline = when(t.deadline)
  return {
    title,
    subtitle: project,
    icon: priority.icon,
    color: priority.color,
    accessory: [due ? said(due) : "", t.due?.is_recurring ? "↻" : ""].filter(Boolean).join(" "),
    tags: labels.slice(0, 3).map((l) => ({ text: l, color: "gray" })),
    keywords: [project, ...labels, priority.name],
    detail: {
      markdown: `## ${t.content}\n\n${t.description || "_No description._"}`,
      metadata: [
        ...(project ? [{ label: "Project", text: project }] : []),
        ...(due ? [{ label: "Due", text: `${dayName(due.at, due.days)}${due.timed ? ` ${time(due.at)}` : ""}${t.due.is_recurring ? ` (${t.due.string})` : ""}`, ...(due.days < 0 ? { color: "red" } : {}) }] : []),
        ...(deadline ? [{ label: "Deadline", text: dayName(deadline.at, deadline.days) }] : []),
        ...(t.duration ? [{ label: "Takes", text: `${t.duration.amount} ${t.duration.unit}${t.duration.amount === 1 ? "" : "s"}` }] : []),
        { label: "Priority", text: priority.name, color: priority.color },
        ...(labels.length ? [{ label: "Labels", text: labels.join(", ") }] : []),
      ],
    },
    actions: [
      { title: "Complete", run: { command: "complete", args: { id: t.id, title, recurring: Boolean(t.due?.is_recurring) } }, icon: "checkmark.circle" },
      { title: "Open in Todoist", open: link(t.id), icon: "arrow.up.forward.app" },
      { title: "Copy", copy: title, icon: "doc.on.doc" },
    ],
  }
}

/** Tasks a filter finds, with when they're due, by priority, then time, then Todoist's own order. @param {string} query */
async function due(query) {
  const [tasks, names] = await Promise.all([all("/tasks/filter", { query }), projects()])
  const found = tasks.map((t) => ({ t, due: when(t.due) }))
  /** @param {NonNullable<ReturnType<typeof when>> | null} d */
  const at = (d) => (d?.timed ? d.at.getTime() : Infinity)
  found.sort((a, b) => b.t.priority - a.t.priority || at(a.due) - at(b.due) || a.t.day_order - b.t.day_order || a.t.child_order - b.t.child_order)
  return { found, names }
}

/** A row for an empty page. @param {string} title */
const nothing = (title) => ({ title, icon: "checkmark.circle", color: RED, actions: [{ title: "Open Todoist", open: link(), icon: "arrow.up.forward.app" }] })

f2.command("today", async () => {
  f2.loading("Getting today's tasks…")
  const { found, names } = await due("today | overdue")
  const rows = (/** @type {boolean} */ late) =>
    found
      .filter(({ due }) => due && (late ? due.days < 0 : due.days === 0))
      .map(({ t }) => ({ ...row(t, names, (d) => (late ? dayName(d.at, d.days) : d.timed ? time(d.at) : "")), section: late ? "Overdue" : "Today" }))
  const items = [...rows(true), ...rows(false)]
  f2.show({ items: items.length ? items : [nothing("Nothing's due today")], loading: false, placeholder: "Search today's tasks…" })
})

f2.command("upcoming", async () => {
  f2.loading("Getting the week's tasks…")
  // (Today's too, if "7 days" were to begin tomorrow; overdue ones are Today's.)
  const { found, names } = await due("today | 7 days")
  const week = found.filter(({ due }) => due && due.days >= 0 && due.days < 7)
  week.sort((a, b) => (a.due?.days ?? 0) - (b.due?.days ?? 0))
  const items = week.map(({ t, due }) => ({
    ...row(t, names, (d) => (d.timed ? time(d.at) : "")),
    section: due ? dayName(due.at, due.days) : "",
  }))
  f2.show({ items: items.length ? items : [nothing("Nothing's due in the next 7 days")], loading: false, placeholder: "Search the week's tasks…" })
})

f2.command("add", ({ query }) => {
  const text = query.trim()
  if (!text) {
    f2.show({ items: [], placeholder: "Call Ana tomorrow 3pm p1 #Work", loading: false })
    return
  }
  f2.show({
    items: [
      {
        title: `Add “${text}”`,
        subtitle: "Its date, #project, /section, @labels and p1–p4 are read by Todoist",
        icon: "plus.circle.fill",
        color: RED,
        actions: [{ title: "Add Task", run: { command: "quick-add", args: { text } }, icon: "plus.circle" }],
      },
    ],
    loading: false,
  })
})

f2.command("quick-add", async ({ args }) => {
  f2.loading("Adding it…")
  const added = await api("/tasks/quick", { method: "POST", body: { text: String(args.text ?? "") } })
  const project = added?.project_id ? await api(`/projects/${encodeURIComponent(added.project_id)}`).catch(() => null) : null
  const due = when(added?.due ?? null)
  const facts = [
    project?.inbox_project ? "" : project?.name ?? "",
    due ? `${dayName(due.at, due.days)}${due.timed ? ` ${time(due.at)}` : ""}` : "",
    added?.priority > 1 ? PRIORITY[added.priority].name : "",
  ].filter(Boolean)
  const title = `Added “${plain(added?.content ?? String(args.text))}”`
  f2.show({ notice: facts.length ? { title, text: facts.join(" · ") } : title, refresh: true, loading: false })
})

f2.command("complete", async ({ args }) => {
  f2.loading("Completing it…")
  await api(`/tasks/${encodeURIComponent(String(args.id))}/close`, { method: "POST" })
  // (A recurring task isn't done with: it's due next time.)
  f2.show({ notice: args.recurring ? `Done: “${args.title}”, till next time` : `Completed “${args.title}”`, refresh: true, loading: false })
})
