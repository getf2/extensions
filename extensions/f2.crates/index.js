// @ts-check
/// <reference path="../../types/f2.d.ts" />

// crates.io: Rust's crates searched as you type (its own search, a request
// a second at most, as it asks), with each one's license from deps.dev
// (crates.io's search doesn't say it), all of them in one request.

const HEADERS = { "User-Agent": "F2-crates/1 (https://getf2.com)" }
const GREEN = "#3b6837"

/**
 * @typedef {{ name: string, description?: string | null, max_stable_version?: string | null, default_version?: string | null, max_version: string,
 *   downloads: number, recent_downloads?: number | null, updated_at: string, repository?: string | null }} Crate
 */

const compact = (/** @type {number} */ n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
const day = (/** @type {string} */ iso) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

/** What Cargo.toml asks for: "1.48" (any 1.x from 1.48), the whole version for a 0.0.x or a pre-release. @param {string} v */
function requirement(v) {
  const [major, minor] = v.split(".")
  return v.includes("-") || (major === "0" && minor === "0") || minor === undefined ? v : `${major}.${minor}`
}

/** Each crate's license, by name, from deps.dev (none, if it's not known there yet). @param {{ name: string, version: string }[]} crates */
async function licenses(crates) {
  /** @type {Record<string, string>} */
  const found = {}
  if (!crates.length) return found
  const response = await fetch("https://api.deps.dev/v3alpha/versionbatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { requests: crates.map((c) => ({ versionKey: { system: "CARGO", name: c.name, version: c.version } })) },
  }).catch(() => null)
  if (!response?.ok) return found
  for (const r of (await response.json()).responses ?? []) {
    if (r.version?.licenses?.length) found[r.request.versionKey.name] = r.version.licenses.join(" AND ")
  }
  return found
}

/** @param {Crate} c @param {string | undefined} license */
function row(c, license) {
  const version = c.max_stable_version ?? c.default_version ?? c.max_version
  const recent = c.recent_downloads ?? 0
  const about = (c.description ?? "").replace(/\s+/g, " ").trim()
  const toml = `${c.name} = "${requirement(version)}"`
  const repository = c.repository?.trim()
  /** @type {F2.Action[]} */
  const actions = [{ title: "Open on crates.io", open: `https://crates.io/crates/${c.name}`, icon: "safari" }]
  if (repository) actions.push({ title: "Open Repository", open: repository, icon: "chevron.left.forwardslash.chevron.right" })
  actions.push(
    { title: "Open docs.rs", open: `https://docs.rs/${c.name}`, icon: "book" },
    { title: "Copy Cargo.toml Line", copy: toml, icon: "doc.on.doc" },
    { title: "Copy cargo add", copy: `cargo add ${c.name}`, icon: "terminal" },
  )
  return {
    title: c.name,
    subtitle: about,
    icon: "cube.box.fill",
    color: GREEN,
    accessory: `v${version}`,
    tags: recent ? [{ text: `${compact(recent)}/90d`, color: "gray" }] : [],
    detail: {
      markdown: `## ${c.name}\n\n${about}\n\n\`\`\`toml\n${toml}\n\`\`\``,
      metadata: [
        { label: "Version", text: version },
        { label: "Downloads", text: c.downloads.toLocaleString("en-US") },
        { label: "Recent downloads (90 days)", text: recent.toLocaleString("en-US") },
        { label: "Updated", text: day(c.updated_at) },
        { label: "License", text: license ?? "–" },
        { label: "Repository", text: repository?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || "–" },
      ],
    },
    actions,
  }
}

f2.command("search", async ({ query }) => {
  const q = query.trim()
  if (!q) {
    f2.show({ items: [], placeholder: "Search crates…", loading: false })
    return
  }
  f2.loading(`Searching crates.io for “${q}”…`)
  // (A search typed within a second of the last waits for the rest of it.)
  const wait = Number((await f2.storage.get("last")) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((done) => setTimeout(done, wait))
  await f2.storage.set("last", Date.now())
  const size = Number(f2.preferences.size ?? 25) || 25
  const response = await fetch(`https://crates.io/api/v1/crates?${new URLSearchParams({ q, per_page: size })}`, { headers: HEADERS })
  if (response.status === 429) throw new Error("crates.io asks for fewer searches for now: try again in a minute.")
  if (!response.ok) throw new Error(`crates.io said ${response.status}.`)
  /** @type {Crate[]} */
  const crates = (await response.json()).crates ?? []
  const known = await licenses(crates.map((c) => ({ name: c.name, version: c.max_stable_version ?? c.default_version ?? c.max_version })))
  f2.show({ items: crates.map((c) => row(c, known[c.name])), loading: false })
})
