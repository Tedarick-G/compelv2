import {
  T,
  esc,
  parseDelimited,
  pickColumn,
  readFileText,
  ymdToDmy,
  normBrand,
  filterBySelectedBrand,
  depotFromNoisyPaste,
} from "./utils.js";

const API_BASE = "https://robot-workstation.tvkapora.workers.dev";
const COMPEL_BRANDS_URL = "https://compel.com.tr/markalar";
const $ = s => document.querySelector(s);

const COMPEL_HDR = [
  "Ana Başlık",
  "Varyant Başlık",
  "Başlık",
  "Marka",
  "Ürün Kodu",
  "EAN",
  "Stok",
  "Fiyat",
  "Link",
  "Görsel",
  "Ana Link",
  "Ana Görsel",
];

const state = {
  brands: [],
  selBrands: new Set(),
  meta: null,
  selDaily: { tsoft: "", aide: "" },
  readCache: { date: "", pass: "" },
  saveCred: null,
  logs: [],
};

function setStatus(t) {
  $("#status").textContent = T(t);
}

function clearLog() {
  state.logs = [];
  $("#log").textContent = "";
}

function log(t) {
  const x = T(t);
  if (!x) return;
  state.logs.push(x);
  $("#log").textContent = state.logs.join("\n");
}

function setBusy(on) {
  [
    "#brandBtn",
    "#tsoftDaily",
    "#csvBtn",
    "#csv",
    "#aideDaily",
    "#aideRaw",
    "#listBtn",
    "#oneUrl",
    "#oneExpand",
    "#oneBtn",
  ].forEach(sel => {
    const el = $(sel);
    if (el) el.disabled = !!on;
  });
}

async function api(path, opt = {}) {
  const r = await fetch(API_BASE + path, opt);
  const t = await r.text();

  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }

  if (!r.ok) throw new Error(j?.error || t || `HTTP ${r.status}`);
  return j;
}

function buildSelectedBrandNormSet() {
  const out = new Set();
  for (const b of state.brands) {
    if (!state.selBrands.has(b.id)) continue;
    const k = normBrand(b.name);
    if (k) out.add(k);
  }
  return out;
}

async function loadBrands() {
  const data = await api(`/api/compel/brands?u=${encodeURIComponent(COMPEL_BRANDS_URL)}`);
  const arr = Array.isArray(data?.brands) ? data.brands : [];

  state.brands = arr.map((b, i) => ({
    id: String(b.url || `brand-${i}`),
    name: T(b.brand || b.title),
    url: T(b.url),
    image: T(b.image),
    productCount: Number.isFinite(Number(b.productCount)) ? Number(b.productCount) : 0,
  }));

  renderBrandMenu();
}

async function loadMeta() {
  try {
    state.meta = await api("/api/daily/meta");
  } catch {
    state.meta = null;
  }
  paintDailyBtns();
}

function pickHM(obj) {
  return T(obj?.hm || obj?.time || "");
}

function dailyPick(kind) {
  const label = kind === "tsoft" ? "T-Soft" : "Aide";
  const t = state.meta?.today?.[kind];
  if (t?.exists) {
    return {
      ymd: state.meta?.today?.ymd || "",
      label: `${label} ${ymdToDmy(state.meta?.today?.ymd || "")} Tarihli Veri`,
      hm: pickHM(t),
    };
  }

  const y = state.meta?.yesterday?.[kind];
  if (y?.exists) {
    return {
      ymd: state.meta?.yesterday?.ymd || "",
      label: `${label} ${state.meta?.yesterday?.dmy || ""} Tarihli Veri`,
      hm: "",
    };
  }

  return null;
}

function paintDailyBtns() {
  for (const kind of ["tsoft", "aide"]) {
    const btn = $(`#${kind}Daily`);
    const pick = dailyPick(kind);
    const label = kind === "tsoft" ? "T-Soft" : "Aide";
    if (!btn) continue;

    btn.disabled = !pick;
    btn.textContent = !pick
      ? `${label} Veri Yok`
      : state.selDaily[kind] === pick.ymd
        ? `${label} Seçildi`
        : pick.hm
          ? `${label} ${pick.hm}`
          : pick.label;
  }
}

function toggleDaily(kind) {
  const pick = dailyPick(kind);
  if (!pick) return;
  state.selDaily[kind] = state.selDaily[kind] === pick.ymd ? "" : pick.ymd;
  paintDailyBtns();
}

async function getReadPass(date) {
  if (state.readCache.date === date && state.readCache.pass) return state.readCache.pass;
  const p = prompt("Okuma şifresi:") || "";
  if (!T(p)) throw new Error("Şifre girilmedi");
  state.readCache = { date, pass: T(p) };
  return state.readCache.pass;
}

function ensureSaveCred() {
  if (state.saveCred?.adminPassword && state.saveCred?.readPassword) return state.saveCred;

  const adminPassword = T(prompt("Yetkili Şifre:") || "");
  const readPassword = T(prompt("Okuma Şifresi:") || "");

  if (!adminPassword || !readPassword) throw new Error("Şifre girilmedi");

  state.saveCred = { adminPassword, readPassword };
  return state.saveCred;
}

async function saveDaily(kind, data) {
  const c = ensureSaveCred();
  await api("/api/daily/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      adminPassword: c.adminPassword,
      readPassword: c.readPassword,
      data,
    }),
  });
  await loadMeta();
}

function renderBrandMenu() {
  const box = $("#brandMenu");
  if (!box) return;

  box.innerHTML = state.brands
    .map(b => {
      const countTxt = b.productCount ? ` (${b.productCount})` : "";
      return `<label><input type="checkbox" value="${esc(b.id)}"> ${esc(b.name)}${esc(countTxt)}</label>`;
    })
    .join("");

  box.onchange = e => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;

    const id = el.value;
    if (el.checked) state.selBrands.add(id);
    else state.selBrands.delete(id);

    $("#brandBtn").textContent = state.selBrands.size ? `Marka (${state.selBrands.size})` : "Marka";
  };
}

function renderTable(target, title, hdr, rows) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;

  const head = (hdr || []).map((h, i) => `<th>${esc(h)} <small>s${i + 1}</small></th>`).join("");
  const body = (rows || []).map(r =>
    `<tr>${hdr.map(h => `<td>${esc(r[h] ?? "")}</td>`).join("")}</tr>`
  ).join("");

  el.innerHTML = `
    <h3>${esc(title)}</h3>
    <div class="meta">Satır: ${(rows || []).length} | Sütun: ${(hdr || []).length}</div>
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function clearTables() {
  ["#l1", "#l2", "#l3"].forEach(sel => {
    const el = $(sel);
    if (el) el.innerHTML = "";
  });
}

function compelBaseUrl(u) {
  const v = T(u);
  if (!v) return "";
  try {
    const x = new URL(v);
    x.search = "";
    x.hash = "";
    return x.toString();
  } catch {
    return v.split("#")[0].split("?")[0];
  }
}

function asTextStock(v) {
  return v == null ? "" : String(v);
}

function productToCompelRows(product) {
  const baseTitle = T(product?.title);
  const brand = T(product?.brand);
  const productUrl = T(product?.url);
  const baseUrl = compelBaseUrl(productUrl);
  const baseImage = T(product?.image);
  const price = T(product?.price);
  const stock = asTextStock(product?.stock);
  const productCode = T(product?.productCode);
  const ean = T(product?.ean);
  const variants = Array.isArray(product?.variants) ? product.variants : [];

  if (!variants.length) {
    return [{
      "Ana Başlık": baseTitle,
      "Varyant Başlık": "",
      "Başlık": baseTitle,
      "Marka": brand,
      "Ürün Kodu": productCode,
      "EAN": ean,
      "Stok": stock,
      "Fiyat": price,
      "Link": productUrl || baseUrl,
      "Görsel": baseImage,
      "Ana Link": baseUrl || productUrl,
      "Ana Görsel": baseImage,
    }];
  }

  return variants.map(v => {
    const variantType = T(v?.variantType);
    const variantLabel = T(v?.variantLabel);
    const variantUrl = T(v?.variantUrl) || productUrl || baseUrl;
    const variantTitle = [baseTitle, variantLabel].filter(Boolean).join(" - ");
    const variantHead = [variantType, variantLabel].filter(Boolean).join(" : ");
    const isSelected = variantUrl === productUrl;

    return {
      "Ana Başlık": baseTitle,
      "Varyant Başlık": variantHead || variantLabel,
      "Başlık": variantTitle || baseTitle,
      "Marka": brand,
      "Ürün Kodu": isSelected ? productCode : "",
      "EAN": isSelected ? ean : "",
      "Stok": isSelected ? stock : "",
      "Fiyat": isSelected ? price : "",
      "Link": variantUrl,
      "Görsel": isSelected ? baseImage : "",
      "Ana Link": baseUrl || productUrl,
      "Ana Görsel": baseImage,
    };
  });
}

async function getTsoftRaw() {
  if (state.selDaily.tsoft) {
    const pass = await getReadPass(state.selDaily.tsoft);
    const j = await api("/api/daily/get", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: state.selDaily.tsoft,
        password: pass,
        want: ["tsoft"],
      }),
    });

    if (!j?.tsoft?.exists || !j?.tsoft?.data) throw new Error("T-Soft günlük veri yok");
    return String(j.tsoft.data);
  }

  const f = $("#csv").files?.[0];
  if (!f) throw new Error("T-Soft CSV seçilmedi");
  return String(await readFileText(f));
}

async function getAideRaw() {
  if (state.selDaily.aide) {
    const pass = await getReadPass(state.selDaily.aide);
    const j = await api("/api/daily/get", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: state.selDaily.aide,
        password: pass,
        want: ["aide"],
      }),
    });

    if (!j?.aide?.exists || !j?.aide?.data) throw new Error("Aide günlük veri yok");
    return String(j.aide.data);
  }

  const raw = $("#aideRaw").value;
  if (!T(raw)) throw new Error("Aide yapıştırma alanı boş");
  return raw;
}

function parseTsoftRawToFullRows(raw) {
  const p = parseDelimited(raw);
  if (!p.rows.length) throw new Error("T-Soft CSV boş");

  const s = p.rows[0];
  const brandCol = pickColumn(s, ["Marka"]);
  if (!brandCol) throw new Error("T-Soft marka sütunu bulunamadı");

  const rows = filterBySelectedBrand(p.rows, r => r[brandCol] || "", buildSelectedBrandNormSet());
  return { hdr: p.hdr, rows };
}

function parseAideRawToFullRows(raw) {
  const txt = String(raw || "");
  let rows = [];
  let hdr = [];

  try {
    const p = parseDelimited(txt);
    if (p.rows.length) {
      const s = p.rows[0];
      const brandCol = pickColumn(s, ["Marka", "Brand"]);
      const codeCol = pickColumn(s, ["Stok Kodu", "StokKodu", "STOK KODU", "Stock Code"]);

      if (brandCol && codeCol) {
        rows = filterBySelectedBrand(p.rows, r => r[brandCol] || "", buildSelectedBrandNormSet());
        hdr = p.hdr;
      }
    }
  } catch {}

  if (rows.length) return { hdr, rows };

  const noisy = depotFromNoisyPaste(txt);
  return {
    hdr: ["Marka", "Model", "Stok Kodu", "Açıklama", "Stok", "Ambar"],
    rows: filterBySelectedBrand(noisy, r => r["Marka"] || "", buildSelectedBrandNormSet()),
  };
}

function parseCompelFullRows(items) {
  const flat = [];
  for (const item of items || []) {
    flat.push(...productToCompelRows(item));
  }

  const rows = filterBySelectedBrand(flat, r => r["Marka"] || "", buildSelectedBrandNormSet());
  return { hdr: COMPEL_HDR, rows };
}

async function readCompel(sel) {
  const items = [];
  clearLog();

  for (let i = 0; i < sel.length; i++) {
    const brand = sel[i];
    setStatus(`Taranıyor: ${brand.name} (${i + 1}/${sel.length})`);
    log(`${brand.name} okunuyor...`);

    try {
      const j = await api(`/api/compel/brand?u=${encodeURIComponent(brand.url)}`);
      const products = Array.isArray(j?.products) ? j.products : [];
      items.push(...products);
      log(`${brand.name} tamam (${products.length})`);
    } catch (err) {
      log(`${brand.name} hata: ${err?.message || String(err)}`);
    }
  }

  if (!items.length) throw new Error("Compel ürünleri alınamadı");
  return items;
}

async function testOne() {
  try {
    const inputUrl = T($("#oneUrl").value);
    if (!inputUrl) throw new Error("Ürün linki gir");

    setBusy(true);
    setStatus("Ürün test ediliyor...");

    const expand = $("#oneExpand").checked ? "1" : "0";
    const j = await api(`/api/compel/one?u=${encodeURIComponent(inputUrl)}&expand=${expand}`);

    $("#oneOut").textContent = JSON.stringify(j, null, 2);
    setStatus("Ürün testi hazır");
  } catch (e) {
    const msg = e?.message || String(e);
    $("#oneOut").textContent = msg;
    setStatus(msg);
  } finally {
    setBusy(false);
  }
}

async function list() {
  try {
    const sel = state.brands.filter(b => state.selBrands.has(b.id));
    if (!sel.length) throw new Error("Compel marka seç");

    clearTables();
    clearLog();
    setBusy(true);
    setStatus("Okunuyor...");

    const [tsoftRaw, aideRaw, compelItems] = await Promise.all([
      getTsoftRaw(),
      getAideRaw(),
      readCompel(sel),
    ]);

    const l1 = parseCompelFullRows(compelItems);
    const l2 = parseTsoftRawToFullRows(tsoftRaw);
    const l3 = parseAideRawToFullRows(aideRaw);

    renderTable("#l1", "Compel Tüm Kolonlar", l1.hdr, l1.rows);
    renderTable("#l2", "T-Soft Tüm Kolonlar", l2.hdr, l2.rows);
    renderTable("#l3", "Aide Tüm Kolonlar", l3.hdr, l3.rows);

    setStatus("Hazır");
  } catch (e) {
    const msg = e?.message || String(e);
    if (/unauthorized/i.test(msg)) state.readCache = { date: "", pass: "" };
    console.error(e);
    setStatus(msg);
    log(msg);
  } finally {
    setBusy(false);
  }
}

$("#brandBtn").onclick = () => $("#brandWrap").classList.toggle("open");

document.addEventListener("click", e => {
  const wrap = $("#brandWrap");
  if (wrap && !wrap.contains(e.target)) wrap.classList.remove("open");
});

$("#tsoftDaily").onclick = () => toggleDaily("tsoft");
$("#aideDaily").onclick = () => toggleDaily("aide");
$("#csvBtn").onclick = () => $("#csv").click();
$("#oneBtn").onclick = testOne;

$("#csv").onchange = () => {
  if ($("#csv").files?.[0]) {
    state.selDaily.tsoft = "";
    paintDailyBtns();
  }
};

$("#aideRaw").addEventListener("input", () => {
  if (T($("#aideRaw").value)) {
    state.selDaily.aide = "";
    paintDailyBtns();
  }
});

$("#tsoftSave").onchange = async e => {
  try {
    if (!e.target.checked) return;

    const f = $("#csv").files?.[0];
    if (!f) throw new Error("Önce T-Soft CSV seç");

    setStatus("T-Soft kaydediliyor...");
    await saveDaily("tsoft", String(await readFileText(f)));
    setStatus("T-Soft kaydedildi");
  } catch (err) {
    setStatus(err?.message || String(err));
  } finally {
    e.target.checked = false;
  }
};

$("#aideSave").onchange = async e => {
  try {
    if (!e.target.checked) return;

    const raw = T($("#aideRaw").value);
    if (!raw) throw new Error("Önce Aide verisi yapıştır");

    setStatus("Aide kaydediliyor...");
    await saveDaily("aide", raw);
    setStatus("Aide kaydedildi");
  } catch (err) {
    setStatus(err?.message || String(err));
  } finally {
    e.target.checked = false;
  }
};

$("#listBtn").onclick = list;

(async () => {
  try {
    await loadBrands();
    await loadMeta();
  } catch (e) {
    console.error(e);
    setStatus(e?.message || String(e));
  }
})();
