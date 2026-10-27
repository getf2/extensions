(() => {
  // f2.cloudflare/index.ts
  var API = "https://api.cloudflare.com/client/v4";
  var ORANGE = "#f38020";
  async function api(path) {
    const token = f2.preferences.CLOUDFLARE_API_TOKEN;
    if (!token)
      throw new Error("No API token: set one in its settings (⌘,).");
    const response = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      const why = body.errors?.[0]?.message ?? `${response.status}`;
      throw new Error(response.status === 403 || response.status === 401 ? `Cloudflare refused the token (${why}): it may need more permissions.` : `Cloudflare said: ${why}`);
    }
    return body.result;
  }
  function ago(stamp) {
    if (!stamp)
      return "";
    const secs = (Date.now() - new Date(stamp).getTime()) / 1000;
    for (const [unit, size] of [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]]) {
      if (secs >= size)
        return `${Math.floor(secs / size)}${unit} ago`;
    }
    return "just now";
  }
  var dash = (account, rest) => `https://dash.cloudflare.com/${account}/${rest}`;
  var status = (s) => s === "success" ? "green" : s === "failure" ? "red" : "yellow";
  f2.command("workers", async () => {
    f2.loading("Finding your accounts…");
    const accounts = await api("/accounts?per_page=50");
    for (const [i, account] of accounts.entries()) {
      f2.loading(`Listing ${account.name}'s Workers…`, (i + 0.5) / accounts.length);
      const [scripts, projects] = await Promise.all([
        api(`/accounts/${account.id}/workers/scripts`).catch(() => []),
        f2.preferences.pages === false ? Promise.resolve([]) : api(`/accounts/${account.id}/pages/projects`).catch(() => [])
      ]);
      scripts.sort((a, b) => b.modified_on.localeCompare(a.modified_on));
      const rows = scripts.map((s) => ({
        title: s.id,
        subtitle: s.routes?.[0]?.pattern ?? "",
        icon: s.has_assets ? "globe" : "gearshape.2.fill",
        color: ORANGE,
        section: `${account.name} · Workers`,
        accessory: `deployed ${ago(s.modified_on)}`,
        tags: s.last_deployed_from ? [{ text: s.last_deployed_from, color: "gray" }] : [],
        keywords: [account.name, ...s.routes?.map((r) => r.pattern) ?? []],
        actions: [
          { title: "Open in Dashboard", open: dash(account.id, `workers/services/view/${s.id}/production`), icon: "safari" },
          { title: "Deployments", push: { command: "deployments", args: { account: account.id, script: s.id } }, icon: "clock.arrow.circlepath" },
          { title: "Copy Name", copy: s.id, icon: "doc.on.doc" }
        ]
      }));
      for (const p of projects) {
        const latest = p.latest_deployment;
        const stage = latest?.latest_stage?.status;
        rows.push({
          title: p.name,
          subtitle: latest?.deployment_trigger?.metadata?.commit_message?.split(`
`)[0] ?? p.subdomain,
          icon: "doc.richtext.fill",
          color: ORANGE,
          section: `${account.name} · Pages`,
          accessory: latest ? `deployed ${ago(latest.created_on)}` : "",
          tags: stage ? [{ text: stage, color: status(stage) }] : [],
          keywords: [account.name, p.subdomain, ...p.domains ?? []],
          actions: [
            { title: "Open Site", open: `https://${p.domains?.[0] ?? p.subdomain}`, icon: "globe" },
            { title: "Deployments", push: { command: "pages-deployments", args: { account: account.id, project: p.name } }, icon: "clock.arrow.circlepath" },
            { title: "Open in Dashboard", open: dash(account.id, `pages/view/${p.name}`), icon: "safari" }
          ]
        });
      }
      f2.show(i === 0 ? { items: rows } : { append: rows });
    }
    f2.show({ loading: false, progress: 1, placeholder: "Search your Workers and Pages…" });
  });
  f2.command("deployments", async ({ args }) => {
    const { account, script } = args;
    f2.show({ title: `${script}: Deployments`, loading: "Fetching deployments…" });
    const found = (await api(`/accounts/${account}/workers/scripts/${script}/deployments`)).deployments;
    found.sort((a, b) => b.created_on.localeCompare(a.created_on));
    const items = found.map((d, i) => {
      const message = d.annotations?.["workers/message"];
      return {
        title: message ?? `Deployed ${ago(d.created_on)}`,
        subtitle: d.author_email ?? "",
        icon: i === 0 ? "checkmark.circle.fill" : "clock",
        color: i === 0 ? "green" : "gray",
        tags: [...i === 0 ? [{ text: "Live", color: "green" }] : [], { text: d.source, color: "gray" }],
        accessory: ago(d.created_on),
        detail: {
          markdown: `## ${message ?? "Deployment"}

${d.versions.map((v) => `- \`${v.version_id}\`: ${v.percentage}%`).join(`
`)}`,
          metadata: [
            { label: "When", text: new Date(d.created_on).toLocaleString("en-US") },
            { label: "By", text: d.author_email ?? "" },
            { label: "From", text: d.source },
            { label: "Trigger", text: d.annotations?.["workers/triggered_by"] ?? "" }
          ]
        },
        actions: [
          { title: "Open in Dashboard", open: dash(account, `workers/services/view/${script}/production/deployments`), icon: "safari" },
          { title: "Copy Version ID", copy: d.versions[0]?.version_id ?? "", icon: "doc.on.doc" },
          { title: "Copy Deployment ID", copy: d.id, icon: "doc.on.doc" }
        ]
      };
    });
    f2.show({ items, loading: false });
  });
  f2.command("pages-deployments", async ({ args }) => {
    const { account, project } = args;
    f2.show({ title: `${project}: Deployments`, loading: "Fetching deployments…" });
    const found = await api(`/accounts/${account}/pages/projects/${project}/deployments?per_page=25`);
    const items = found.map((d) => {
      const meta = d.deployment_trigger?.metadata ?? {};
      const stage = d.latest_stage?.status ?? "";
      return {
        title: meta.commit_message?.split(`
`)[0] ?? d.id.slice(0, 8),
        subtitle: [meta.branch, meta.commit_hash?.slice(0, 7)].filter(Boolean).join(" · "),
        icon: stage === "success" ? "checkmark.circle.fill" : stage === "failure" ? "xmark.circle.fill" : "clock.fill",
        color: status(stage),
        section: d.environment === "production" ? "Production" : "Previews",
        tags: stage ? [{ text: stage, color: status(stage) }] : [],
        accessory: ago(d.created_on),
        actions: [
          { title: "Open Deployment", open: d.url, icon: "globe" },
          { title: "Open in Dashboard", open: dash(account, `pages/view/${project}/${d.id}`), icon: "safari" },
          { title: "Copy URL", copy: d.url, icon: "link" }
        ]
      };
    });
    f2.show({ items, loading: false });
  });
})();
