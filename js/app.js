// ./js/app.js

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

/* 🔧 ESKİSİ
const API_BASE = "https://robot-workstation.tvkapora.workers.dev";
*/

/* ✅ YENİ WORKER */
const API_BASE = location.origin;

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
// T-Soft Modal
// =========================
createTsoftModal({ $ });

// =========================
// Brand UI
// =========================
let COMPEL_BRANDS_CACHE = null;

const SUPPLIERS = {
  COMPEL: "Compel",
  ALL: "Tüm Markalar",
  AKALIN: "Akalın",
};

let ACTIVE_SUPPLIER = SUPPLIERS.COMPEL;

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
    daily.clearSelection("aide");
    daily.paint();

    if (ACTIVE_SUPPLIER === SUPPLIERS.COMPEL && matcher.hasData()) {
      matcher.runMatch();
      compelMode.refresh();
    }

    applySupplierUi();

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
// Brand init
// =========================
async function initBrandsCompel() {
  brandUI.setBrandPrefix("Hazır");
  brandUI.setLoading(true);

  try {
    const data = await loadBrands(API_BASE);
    COMPEL_BRANDS_CACHE = data;

    if (ACTIVE_SUPPLIER === SUPPLIERS.COMPEL)
      brandUI.setBrands(data);

  } catch (e) {
    console.error(e);
    brandUI.setBrandStatusText("Markalar yüklenemedi (API).");
  } finally {
    brandUI.setLoading(false);
    brandUI.render();
    applySupplierUi();
  }
}

// =========================
// GO button
// =========================
async function handleGo() {

  if (!brandUI.getSelectedIds().size) {
    alert("Lütfen bir marka seçin");
    guide.updateFromState();
    return;
  }

  let ok = false;

  if (ACTIVE_SUPPLIER === SUPPLIERS.ALL)
    ok = await allMode.generate();
  else
    ok = await compelMode.generate();

  if (ok) guide.setStep("done");
  else guide.updateFromState();
}

$("go") && ($("go").onclick = handleGo);

// =========================
// init
// =========================
brandUI.ensureListHeader();
brandUI.ensureSearchBar();

guide.setStep("brand");

if (ACTIVE_SUPPLIER === SUPPLIERS.COMPEL)
  initBrandsCompel();

daily.refreshMeta();
guide.updateFromState();
