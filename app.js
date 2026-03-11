import { loadBrands, loadCatalogPage, dailyMeta, dailyGet, dailySave } from "./api.js";

const $ = (id) => document.getElementById(id);

const state = {
  brands: [],
  selected: new Set(),
  dailyMeta: null,
  dailyPick: { tsoft: "", aide: "" },
  readPass: { date: "", pass: "" },
  saveCred: null,
  compelRows: [],
  tsoftRows: [],
  aideRows: [],
  queue: [],
  loading: false,
};

const fixedCompelCols = ["title", "url", "image", "brand", "productCode", "ean", "stock", "price", "isNew", "error"];

function setStatus(t = "") {
  $("st").textContent = t;
}

function normBrand(s = "") {
  let x = String(s || "").trim();
  try { x = x.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); } catch {}
  return x
    .replace(/Ø/g, "O").replace(/ø/g, "o")
    .replace(/\u0130/g, "I").replace(/\u0131/g, "I")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/&/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR");
}

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsText(file);
  });
}

function detectDelimiter(line = "") {
  const a = (line.match(/\t/g) || []).length;
  const b = (line.match(/;/g) || []).length;
  const c = (line.match(/,/g) || []).length;
  if (a >= b && a >= c) return "\t";
  if (b >= c) return ";";
  return ",";
}

function parseDelimited(text = "") {
  const src = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n").filter((x) => x.trim());
  if (!lines.length) return [];
  const d = detectDelimiter(lines[0]);

  const rows = [];
  for (const line of lines) {
    const row = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (ch === d && !q) {
        row.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    rows.push(row.map((x) => x.trim()));
  }

  const head = rows.shift() || [];
  return rows.map((r) => {
    const o = {};
    head.forEach((h, i) => o[h || `COL_${i + 1}`] = r[i] ?? "");
    return o;
  });
}

function pickColumn(row = {}, names = []) {
  const keys = Object.keys(row);
  const hit = names.find((n) => keys.includes(n));
  return hit || "";
}

function getBrandRows(rows) {
  if (!rows.length) return [];
  const c = pickColumn(rows[0], ["Marka", "MARKA", "Brand", "brand"]);
  return rows.map((r) => ({ ...r, __brand: normBrand(c ? r[c] : "") }));
}

function getSelectedBrandNorms() {
  const s = new Set();
  for (const id of state.selected) {
    const b = state.brands.find((x) => String(x.id) === String(id));
    if (b) s.add(normBrand(b.name));
  }
  return s;
}

function renderBrandMenu() {
  const box = $("brandMenu");
  box.innerHTML = state.brands.map((b) => `
    <label>
      <input type="checkbox" data-id="${esc(String(b.id))}" ${state.selected.has(String(b.id)) ? "checked" : ""}>
      <span>${esc(b.name)} (${esc(String(b.count))})</span>
    </label>
  `).join("");

  box.querySelectorAll("input[type=checkbox]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = String(el.dataset.id || "");
      if (el.checked) state.selected.add(id);
      else state.selected.delete(id);
      renderBrandSummary();
    });
  });

  renderBrandSummary();
}

function renderBrandSummary() {
  const names = state.brands
    .filter((b) => state.selected.has(String(b.id)))
    .map((b) => b.name);
  $("brandSummary").textContent = names.length ? `Marka: ${names.length}` : "Marka Seç";
}

function pickHMFrom(obj) {
  if (!obj) return "";
  const direct = String(obj.hm || obj.HM || obj.time || obj.saat || "").trim();
  if (direct) return direct;
  const iso = String(obj.iso || obj.ISO || obj.createdAt || obj.updatedAt || obj.at || "").trim();
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

function dmy(ymd = "") {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function paintDailyButtons() {
  const meta = state.dailyMeta || {};
  const tToday = meta?.today?.tsoft;
  const aToday = meta?.today?.aide;
  const tY = meta?.yesterday?.tsoft;
  const aY = meta?.yesterday?.aide;

  const tBtn = $("tsoftDailyBtn");
  const aBtn = $("aideDailyBtn");

  if (tToday?.exists) {
    const hm = pickHMFrom(tToday);
    tBtn.textContent = state.dailyPick.tsoft === meta.today.ymd
      ? "T-Soft Seçildi"
      : hm ? `T-Soft Bugün ${hm}` : `T-Soft ${dmy(meta.today.ymd)}`;
    tBtn.disabled = false;
  } else if (tY?.exists) {
    tBtn.textContent = state.dailyPick.tsoft === meta.yesterday.ymd
      ? "T-Soft Seçildi"
      : `T-Soft ${dmy(meta.yesterday.ymd)}`;
    tBtn.disabled = false;
  } else {
    tBtn.textContent = "T-Soft Veri Yok";
    tBtn.disabled = true;
  }

  if (aToday?.exists) {
    const hm = pickHMFrom(aToday);
    aBtn.textContent = state.dailyPick.aide === meta.today.ymd
      ? "Aide Seçildi"
      : hm ? `Aide Bugün ${hm}` : `Aide ${dmy(meta.today.ymd)}`;
    aBtn.disabled = false;
  } else if (aY?.exists) {
    aBtn.textContent = state.dailyPick.aide === meta.yesterday.ymd
      ? "Aide Seçildi"
      : `Aide ${dmy(meta.yesterday.ymd)}`;
    aBtn.disabled = false;
  } else {
    aBtn.textContent = "Aide Veri Yok";
    aBtn.disabled = true;
  }
}

function toggleDaily(kind) {
  const meta = state.dailyMeta || {};
  const today = meta?.today?.ymd || "";
  const yesterday = meta?.yesterday?.ymd || "";
  const todayOk = !!meta?.today?.[kind]?.exists;
  const yOk = !!meta?.yesterday?.[kind]?.exists;

  const pick = todayOk ? today : yOk ? yesterday : "";
  if (!pick) return;

  state.dailyPick[kind] = state.dailyPick[kind] === pick ? "" : pick;

  if (kind === "tsoft" && state.dailyPick.tsoft) $("f2").value = "";
  if (kind === "aide" && state.dailyPick.aide) $("aidePaste").value = "";

  paintDailyButtons();
}

async function refreshDailyMeta() {
  try {
    state.dailyMeta = await dailyMeta();
  } catch {
    state.dailyMeta = null;
  }
  paintDailyButtons();
}

async function getReadPass(date) {
  if (state.readPass.date === date && state.readPass.pass) return state.readPass.pass;
  const p = prompt("Okuma şifresi:");
  if (!p) throw new Error("Şifre girilmedi");
  state.readPass = { date, pass: p.trim() };
  return state.readPass.pass;
}

function ensureSaveCred() {
  if (state.saveCred?.adminPassword && state.saveCred?.readPassword) return state.saveCred;
  const adminPassword = prompt("Yetkili Şifre:");
  if (!adminPassword) return null;
  const readPassword = prompt("Bugün için okuma şifresi:");
  if (!readPassword) return null;
  state.saveCred = { adminPassword: adminPassword.trim(), readPassword: readPassword.trim() };
  return state.saveCred;
}

async function saveTodayIfChecked(kind, raw) {
  const cb = $(kind === "tsoft" ? "tsoftSaveToday" : "aideSaveToday");
  if (!cb.checked) return;
  const cred = ensureSaveCred();
  if (!cred) { cb.checked = false; return; }
  await dailySave({ kind, ...cred, data: raw });
  cb.checked = false;
  await refreshDailyMeta();
}

function tableCols(rows, fixed = []) {
  if (!rows.length) return fixed;
  const keys = new Set(fixed);
  rows.forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));
  return [...keys];
}

function val(v) {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderTable(id, rows, cols = []) {
  const el = $(id);
  if (!rows.length) {
    el.innerHTML = `<tr><td class="muted">boş</td></tr>`;
    return;
  }

  const c = cols.length ? cols : tableCols(rows);
  const th = c.map((k, i) => `<th>s${i + 1} ${esc(k)}</th>`).join("");
  const tr = rows.map((r) => {
    const tds = c.map((k) => {
      const v = val(r[k]);
      if (k === "isNew") return `<td class="${r[k] ? "new" : ""}">${r[k] ? "yes" : ""}</td>`;
      return `<td>${esc(v)}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  el.innerHTML = `<thead><tr>${th}</tr></thead><tbody>${tr}</tbody>`;
}

function selectedBrands() {
  return state.brands.filter((b) => state.selected.has(String(b.id)));
}

function dedupeCompel(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = [
      r.title || "",
      r.url || "",
      r.productCode || "",
      r.ean || "",
      r.brand || ""
    ].join("||").toLocaleLowerCase("tr");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function pushQueue(brand, page, totalPages) {
  if (page > totalPages) return;
  state.queue.push({ brand, page, totalPages });
}

function paintMoreButton() {
  const btn = $("moreBtn");
  if (!state.queue.length) {
    btn.hidden = true;
    btn.textContent = "";
    return;
  }
  const n = state.queue[0];
  btn.hidden = false;
  btn.textContent = `${n.brand.name} ${n.page}. sayfayı getir`;
}

async function loadOneQueuePage() {
  if (!state.queue.length || state.loading) return;
  state.loading = true;
  $("moreBtn").disabled = true;
  try {
    const q = state.queue.shift();
    setStatus(`Taranıyor: ${q.brand.name} (${q.page}/${q.totalPages})`);
    const res = await loadCatalogPage(q.brand, q.page);
    state.compelRows = dedupeCompel(state.compelRows.concat(res.items || []));
    renderTable("compelTable", state.compelRows, fixedCompelCols);
    if (res.nextPage) pushQueue(q.brand, res.nextPage, res.totalPages || q.totalPages);
    if (res.newCount) setStatus(`${q.brand.name}: ${res.newCount} yeni ürün`);
    else setStatus("Hazır");
  } catch (e) {
    setStatus(String(e.message || e));
  } finally {
    state.loading = false;
    $("moreBtn").disabled = false;
    paintMoreButton();
  }
}

async function getTsoftRaw() {
  if (state.dailyPick.tsoft) {
    const pass = await getReadPass(state.dailyPick.tsoft);
    const got = await dailyGet({ date: state.dailyPick.tsoft, password: pass, want: ["tsoft"] });
    if (!got?.tsoft?.exists) throw new Error("T-Soft daily yok");
    return String(got.tsoft.data || "");
  }
  const file = $("f2").files?.[0];
  if (!file) return "";
  return await readFileText(file);
}

async function getAideRaw() {
  if (state.dailyPick.aide) {
    const pass = await getReadPass(state.dailyPick.aide);
    const got = await dailyGet({ date: state.dailyPick.aide, password: pass, want: ["aide"] });
    if (!got?.aide?.exists) throw new Error("Aide daily yok");
    return String(got.aide.data || "");
  }
  return String($("aidePaste").value || "");
}

function filterBySelectedBrands(rows) {
  const set = getSelectedBrandNorms();
  return getBrandRows(rows).filter((r) => set.has(r.__brand)).map((r) => {
    const x = { ...r };
    delete x.__brand;
    return x;
  });
}

async function generate() {
  if (state.loading) return;
  if (!state.selected.size) {
    alert("Marka seç");
    return;
  }

  state.loading = true;
  $("go").disabled = true;
  $("moreBtn").disabled = true;
  state.compelRows = [];
  state.queue = [];

  try {
    setStatus("Okunuyor...");

    const tRaw = await getTsoftRaw();
    const aRaw = await getAideRaw();

    state.tsoftRows = tRaw ? filterBySelectedBrands(parseDelimited(tRaw)) : [];
    state.aideRows = aRaw ? filterBySelectedBrands(parseDelimited(aRaw)) : [];

    renderTable("tsoftTable", state.tsoftRows);
    renderTable("aideTable", state.aideRows);

    if (tRaw) await saveTodayIfChecked("tsoft", tRaw);
    if (aRaw) await saveTodayIfChecked("aide", aRaw);

    const brands = selectedBrands();
    for (const b of brands) {
      setStatus(`Taranıyor: ${b.name} (1/${Math.max(1, Math.ceil((Number(b.count) || 0) / 20))})`);
      const res = await loadCatalogPage(b, 1);
      state.compelRows = dedupeCompel(state.compelRows.concat(res.items || []));
      if (res.nextPage) pushQueue(b, res.nextPage, res.totalPages || Math.max(1, Math.ceil((Number(b.count) || 0) / 20)));
    }

    renderTable("compelTable", state.compelRows, fixedCompelCols);
    paintMoreButton();
    setStatus("Hazır");
  } catch (e) {
    setStatus(String(e.message || e));
    alert(String(e.message || e));
  } finally {
    state.loading = false;
    $("go").disabled = false;
    $("moreBtn").disabled = false;
    paintMoreButton();
  }
}

async function init() {
  try {
    state.brands = await loadBrands();
    renderBrandMenu();
  } catch (e) {
    setStatus(`Marka yüklenemedi: ${e.message || e}`);
  }

  await refreshDailyMeta();

  $("brandBox").addEventListener("toggle", renderBrandSummary);

  $("tsoftDailyBtn").addEventListener("click", () => toggleDaily("tsoft"));
  $("aideDailyBtn").addEventListener("click", () => toggleDaily("aide"));

  $("tsoftPickBtn").addEventListener("click", () => $("f2").click());
  $("f2").addEventListener("change", () => {
    if ($("f2").files?.[0]) state.dailyPick.tsoft = "";
    paintDailyButtons();
  });

  $("aidePaste").addEventListener("input", () => {
    if ($("aidePaste").value.trim()) state.dailyPick.aide = "";
    paintDailyButtons();
  });

  $("go").addEventListener("click", generate);
  $("moreBtn").addEventListener("click", loadOneQueuePage);

  $("tsoftSaveToday").addEventListener("change", (e) => {
    if (e.target.checked && !ensureSaveCred()) e.target.checked = false;
  });

  $("aideSaveToday").addEventListener("change", (e) => {
    if (e.target.checked && !ensureSaveCred()) e.target.checked = false;
  });

  renderTable("compelTable", [], fixedCompelCols);
  renderTable("tsoftTable", []);
  renderTable("aideTable", []);
  paintMoreButton();
}

init();
