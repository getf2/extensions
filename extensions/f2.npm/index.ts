/// <reference path="../../types/f2.d.ts" />
// F2's npm extension: npm's registry searched as you type (its search
// API, no account needed). Built to index.js: `bun build`, see EXTENSIONS.md.

type Found = {
  package: {
    name: string
    version: string
    description?: string
    keywords?: string[]
    license?: string
    date?: string
    publisher?: { username?: string }
    links: { npm: string; homepage?: string; repository?: string }
  }
  downloads?: { weekly?: number }
}

const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
// A repository as a link to open: npm's are often git's ("git://github.com/a/b.git",
// "git+ssh://git@github.com/a/b.git", "git@github.com:a/b", "github:a/b", even
// "a/b"), each of them https://github.com/a/b.
const SHORT: Record<string, string> = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" }
const repo = (url?: string) => {
  const u = url?.trim().replace(/^git\+/, "").replace(/#.*$/, "").replace(/\.git\/?$/, "")
  if (!u) return undefined
  const short = /^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/.exec(u)
  if (short) return `https://${SHORT[short[1] ?? "github"]}/${short[2]}`
  if (u.startsWith("gist:")) return `https://gist.github.com/${u.slice(5)}`
  const scp = /^[\w.-]+@([\w.-]+):(?!\/)(.+)$/.exec(u)
  if (scp) return `https://${scp[1]}/${scp[2]}`
  // (Its port only if it's the web's: an ssh one isn't.)
  const full = /^(\w+):\/\/(?:[^@/]+@)?([^/:]+)(:\d+)?(\/.*)?$/.exec(u)
  return full ? `https://${full[2]}${full[1] === "https" ? (full[3] ?? "") : ""}${full[4] ?? ""}` : undefined
}

f2.command("search", async ({ query }) => {
  const q = query.trim()
  if (!q) {
    f2.show({ items: [], placeholder: "Search npm packages…", loading: false })
    return
  }
  f2.loading(`Searching npm for “${q}”…`)
  const size = Number(f2.preferences.size ?? 25) || 25
  const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=${size}`)
  if (!response.ok) throw new Error(`npm said ${response.status}`)
  const found = (await response.json()).objects as Found[]
  const items = found.map(({ package: p, downloads }) => {
    const weekly = downloads?.weekly ?? 0
    const source = repo(p.links.repository)
    const actions: F2.Action[] = [{ title: "Open on npm", open: p.links.npm, icon: "safari" }]
    if (source) actions.push({ title: "Open Repository", open: source, icon: "chevron.left.forwardslash.chevron.right" })
    if (p.links.homepage && p.links.homepage !== source) actions.push({ title: "Open Homepage", open: p.links.homepage, icon: "house" })
    actions.push({ title: "Copy Install Command", copy: `npm install ${p.name}`, icon: "terminal" }, { title: "Copy Name", copy: p.name, icon: "doc.on.doc" })
    return {
      title: p.name,
      subtitle: p.description ?? "",
      icon: "shippingbox.fill",
      accessory: `v${p.version}`,
      tags: weekly ? [{ text: `${compact(weekly)}/wk`, color: "gray" }] : [],
      detail: {
        markdown: `## ${p.name}\n\n${p.description ?? ""}\n\n${(p.keywords ?? []).slice(0, 8).map((k) => `\`${k}\``).join(" ")}\n\n\`\`\`\nnpm install ${p.name}\n\`\`\``,
        metadata: [
          { label: "Version", text: p.version },
          { label: "Weekly downloads", text: weekly ? weekly.toLocaleString("en-US") : "–" },
          { label: "License", text: p.license ?? "–" },
          { label: "Published", text: p.date ? new Date(p.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "–" },
          { label: "Publisher", text: p.publisher?.username ?? "–" },
        ],
      },
      actions,
    } satisfies F2.Row
  })
  f2.show({ items, loading: false })
})
