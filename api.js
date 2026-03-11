export const API_BASE = "https://doretest.tvkapora.workers.dev";

async function j(url, opt) {
  const r = await fetch(url, opt);
  const t = await r.text().catch(() => "");
  let x = null;
  try { x = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(x?.error || t || `${r.status}`);
  return x;
}

export function loadBrands() {
  return j(`${API_BASE}/api/brands`, { cache: "no-store" });
}

export function loadCatalogPage(brand, page) {
  return j(`${API_BASE}/api/catalog/page`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brand, page }),
  });
}

export function dailyMeta() {
  return j(`${API_BASE}/api/daily/meta`, { cache: "no-store" });
}

export function dailyGet({ date, password, want } = {}) {
  return j(`${API_BASE}/api/daily/get`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, password, want }),
  });
}

export function dailySave({ kind, adminPassword, readPassword, data } = {}) {
  return j(`${API_BASE}/api/daily/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, adminPassword, readPassword, data }),
  });
}
