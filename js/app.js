// ./js/app.js
// ✅ Orchestrator (tamamlanmış) + Guide state resolver + T-Soft modal fix

import { TR } from "./utils.js";
import { loadBrands, dailyMeta, dailyGet, dailySave, scanCompel } from "./api.js";
import { createMatcher, normBrand } from "./match.js";
import { createDepot } from "./depot.js";
import { createRenderer } from "./render.js";

import { AIDE_BRAND_SEED, TSOFT_BRAND_SEED } from "./brands.seed.js";

// modules
import { createUIChips } from "./ui/chips.js";
import { createGuide } from "./ui/guide.js";
import { createDaily } from "./ui/daily.js";
import { createBrandUI } from "./ui/brand.js";
import { createCompelMode } from "./modes/compel.js";
import { createAllMode } from "./modes/all.js";
import { toTitleCaseTR, buildCanonicalBrandList } from "./helpers/text.js";
import { createTsoftModal } from "./ui/tsoftModal.js";

const $ = (id) => document.getElementById(id);

// ✅ FRONTEND GITHUB'DA, API CLOUDFLARE WORKER'DA
const API_BASE = "https://doretest.tvkapora.workers.dev";

const SUPPLIERS = {
  COMPEL: "Compel",
  ALL: "Tüm Markalar",
  AKALIN: "Akalın",
};

let ACTIVE_SUPPLIER = SUPPLIERS.COMPEL;

// =========================
// UI (chips/status)
// =========================
const ui = createUIChips({ $, TR });

// =========================
// Guide
// =========================
const guide = createGuide({ $, TR, getActiveSupplier: () => ACTIVE_SUPPLIER });

// =========================
// Daily
// =========================
const daily = createDaily({
  $,
  TR,
  apiBase: API_BASE,
  api: { dailyMeta, dailyGet, dailySave },
  ui,
  onAfterPick: () => guide.updateFromState(),
});

// =========================
// ✅ T-Soft Modal (popover) — FIX
// =========================
createTsoftModal({ $ });

// =========================
// Brand UI
// =========================
let COMPEL_BRANDS_CACHE = null;

const brandUI = createBrandUI({
  $,
  TR,
  ui,
  guide,
  normBrand,
  toTitleCaseTR,
  suppliers: SUPPLIERS,
  getActiveSupplier: () => ACTIVE_SUPPLIER,
  setActiveSupplier: (x) => (ACTIVE_SUPPLIER = x),
  buildAllBrands: () =>
    buildCanonicalBrandList({
      normBrand,
      tsoftSeed: TSOFT_BRAND_SEED,
      aideSeed: AIDE_BRAND_SEED,
    }),
});

// =========================
// Depot + Matcher + Renderer
// =========================
const depot = createDepot({
  ui,
  normBrand,
  onDepotLoaded: async () => {
    // Aide yüklenince daily seçimini sıfırla
    daily.clearSelection("aide");
    daily.paint();

    // Compel modunda veri varsa refresh
    if (ACTIVE_SUPPLIER === SUPPLIERS.COMPEL && matcher.hasData()) {
      matcher.runMatch();
      compelMode.refresh();
    }

    applySupplierUi();

    // “Bugünün verisi olarak kaydet” (Aide)
    await daily.trySaveIfChecked({
      kind: "aide",
      getRaw: () => depot.getLastRaw() || "",
    });

    guide.updateFromState();
  },
});

const matcher = createMatcher({
  getDepotAgg: () => depot.agg,
  isDepotReady: () => depot.isReady(),
});

const renderer = createRenderer({ ui });

// =========================
// Modes
// =========================
const compelMode = createCompelMode({
  $,
  TR,
  apiBase: API_BASE,
  api: { scanCompel, dailyGet, dailySave },
  ui,
  depot,
  matcher,
  renderer,
  brandUI,
  daily,
  guide,
  normBrand,
});

const allMode = createAllMode({
  $,
  TR,
  ui,
  depot,
  renderer,
  brandUI,
  daily,
  guide,
  normBrand,
  toTitleCaseTR,
});

// =========================
// Guide step resolver
// =========================
function hasTsoftReady() {
  const file = $("f2")?.files?.[0];
  const sel = daily.getSelected();
  return !!file || !!String(sel?.tsoft || "").trim();
}

function hasAideReady() {
  const sel = daily.getSelected();
  return depot?.isReady?.() || !!String(sel?.aide || "").trim();
}

function resolveGuideStep() {
  if (ACTIVE_SUPPLIER === SUPPLIERS.AKALIN) return "done";

  const selectedCount = brandUI.getSelectedIds().size;
  if (!selectedCount) return "brand";
  if (!hasTsoftReady()) return "tsoft";
  if (!hasAideReady()) return "aide";
  return "list";
}

guide.setStateResolver(resolveGuideStep);

// =========================
// Supplier dropdown
// =========================
function applySupplierUi() {
  const go = $("go");
  if (go) {
    if (ACTIVE_SUPPLIER === SUPPLIERS.AKALIN) {
      go.classList.add("wip");
      go.title = "Yapım Aşamasında";
    } else {
      go.classList.remove("wip");
      go.title = "Listele";
    }
  }

  if (ACTIVE_SUPPLIER === SUPPLIERS.AKALIN) {
    ui.setStatus(
      "Tedarikçi Akalın entegre edilmedi. Lütfen farklı bir tedarikçi seçin.",
      "bad"
    );
  } else {
    ui.setStatus("Hazır", "ok");
  }

  brandUI.applySupplierUi();
  guide.updateFromState();
}

async function initBrandsCompel() {
  brandUI.setBrandPrefix("Hazır");
  brandUI.setLoading(true);

  try {
    const data = await loadBrands(API_BASE);
    COMPEL_BRANDS_CACHE = data;
    if (ACTIVE_SUPPLIER === SUPPLIERS.COMPEL) brandUI.setBrands(data);
  } catch (e) {
    console.error(e);
    if (ACTIVE_SUPPLIER === SUPPLIERS.COMPEL) {
      brandUI.setBrandStatusText("Markalar yüklenemedi (API).");
    }
  } finally {
    brandUI.setLoading(false);
    brandUI.render();
    applySupplierUi();
  }
}

function initSupplierDropdown() {
  const wrap = $("supplierWrap"),
    btn = $("supplierBtn"),
    menu = $("supplierMenu"),
    itC = $("supplierCompelItem"),
    itAll = $("supplierAllItem"),
    itA = $("supplierAkalinItem");

  if (!wrap || !btn || !menu || !itC || !itAll || !itA) return;

  const open = () => {
    menu.classList.add("show");
    menu.setAttribute("aria-hidden", "false");
    btn.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    menu.classList.remove("show");
    menu.setAttribute("aria-hidden", "true");
    btn.setAttribute("aria-expanded", "false");
  };

  const paint = () => {
    const mk = (el, name) => {
      const sel = ACTIVE_SUPPLIER === name;
      el.setAttribute("aria-disabled", sel ? "true" : "false");
      el.textContent = sel ? `${name} (seçili)` : name;
    };
    mk(itC, SUPPLIERS.COMPEL);
    mk(itAll, SUPPLIERS.ALL);
    mk(itA, SUPPLIERS.AKALIN);
  };

  const setSupplier = async (name) => {
    if (!name || name === ACTIVE_SUPPLIER) return close();

    ACTIVE_SUPPLIER = name;
    const lab = $("supplierLabel");
    lab && (lab.textContent = `1) Tedarikçi: ${name}`);

    // reset
    brandUI.resetAllSelections();
    compelMode.reset();
    allMode.reset();
    depot.reset();
    matcher.resetAll();

    if (name === SUPPLIERS.AKALIN) {
      brandUI.setBrandPrefix("Akalın");
      brandUI.setBrands([]);
    } else if (name === SUPPLIERS.ALL) {
      brandUI.setBrandPrefix("Tüm Markalar");
      brandUI.setBrands(brandUI.buildAllBrandsWithIds());
    } else {
      brandUI.setBrandPrefix("Hazır");
      if (COMPEL_BRANDS_CACHE?.length) brandUI.setBrands(COMPEL_BRANDS_CACHE);
      else await initBrandsCompel();
    }

    paint();
    close();
    brandUI.render();
    applySupplierUi();
    guide.setStep("brand");
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    paint();
    menu.classList.contains("show") ? close() : open();
  });

  itC.addEventListener("click", (e) => {
    e.preventDefault();
    if (itC.getAttribute("aria-disabled") === "true") return;
    void setSupplier(SUPPLIERS.COMPEL);
  });

  itAll.addEventListener("click", (e) => {
    e.preventDefault();
    if (itAll.getAttribute("aria-disabled") === "true") return;
    void setSupplier(SUPPLIERS.ALL);
  });

  itA.addEventListener("click", (e) => {
    e.preventDefault();
    if (itA.getAttribute("aria-disabled") === "true") return;
    void setSupplier(SUPPLIERS.AKALIN);
  });

  document.addEventListener("click", (e) => !wrap.contains(e.target) && close());
  addEventListener("keydown", (e) => e.key === "Escape" && close());
  paint();
}

// =========================
// GO button
// =========================
async function handleGo() {
  if (ACTIVE_SUPPLIER === SUPPLIERS.AKALIN) {
    applySupplierUi();
    return;
  }

  if (!brandUI.getSelectedIds().size) {
    alert("Lütfen bir marka seçin");
    guide.updateFromState();
    return;
  }

  let ok = false;
  if (ACTIVE_SUPPLIER === SUPPLIERS.ALL) ok = await allMode.generate();
  else ok = await compelMode.generate();

  if (ok) guide.setStep("done");
  else guide.updateFromState();
}

$("go") && ($("go").onclick = handleGo);

// =========================
// init
// =========================
initSupplierDropdown();

brandUI.ensureListHeader();
brandUI.ensureSearchBar();

guide.setStep("brand");
applySupplierUi();

if (ACTIVE_SUPPLIER === SUPPLIERS.COMPEL) initBrandsCompel();
else if (ACTIVE_SUPPLIER === SUPPLIERS.ALL) {
  brandUI.setBrandPrefix("Tüm Markalar");
  brandUI.setBrands(brandUI.buildAllBrandsWithIds());
  brandUI.render();
} else {
  brandUI.render();
}

daily.refreshMeta();
guide.updateFromState();
