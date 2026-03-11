const ORIGIN = "https://compel.com.tr";
const IST_TZ = "Europe/Istanbul";
const te = new TextEncoder();

const FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "cache-control": "no-cache",
};

const FALLBACK_BRANDS = [
  { id: 1, slug: "ableton", name: "Ableton", count: 10 },
  { id: 48, slug: "allen-heath", name: "Allen & Heath", count: 8 },
  { id: 4, slug: "arturia", name: "Arturia", count: 61 },
  { id: 6, slug: "avalon", name: "Avalon", count: 4 },
  { id: 7, slug: "avid", name: "Avid", count: 16 },
  { id: 49, slug: "compel", name: "Compel", count: 3 },
  { id: 41, slug: "cranborne-audio", name: "Cranborne Audio", count: 9 },
  { id: 9, slug: "crane-song", name: "Crane Song", count: 6 },
  { id: 10, slug: "denon-dj", name: "Denon DJ", count: 10 },
  { id: 50, slug: "fender-studio", name: "Fender Studio", count: 8 },
  { id: 11, slug: "genelec", name: "Genelec", count: 25 },
  { id: 12, slug: "headrush", name: "HeadRush", count: 8 },
  { id: 13, slug: "hosa", name: "Hosa", count: 296 },
  { id: 16, slug: "m-audio", name: "M-Audio", count: 50 },
  { id: 44, slug: "m-game", name: "M-Game", count: 2 },
  { id: 17, slug: "marantz-professional", name: "Marantz Professional", count: 9 },
  { id: 20, slug: "numark", name: "Numark", count: 33 },
  { id: 21, slug: "presonus", name: "PreSonus", count: 97 },
  { id: 23, slug: "rane", name: "Rane", count: 10 },
  { id: 24, slug: "rode", name: "RØDE", count: 245 },
  { id: 45, slug: "rode-x", name: "RØDE X", count: 3 },
  { id: 25, slug: "rupert-neve-designs", name: "Rupert Neve Designs", count: 8 },
  { id: 47, slug: "sheeran-loopers", name: "Sheeran Loopers", count: 2 },
  { id: 26, slug: "sibelius", name: "Sibelius", count: 6 },
  { id: 28, slug: "sonarworks", name: "Sonarworks", count: 12 },
  { id: 43, slug: "soundswitch", name: "SoundSwitch", count: 1 },
  { id: 42, slug: "stanton", name: "Stanton", count: 3 },
  { id: 36, slug: "universal-audio", name: "Universal Audio", count: 73 },
  { id: 38, slug: "warm-audio", name: "Warm Audio", count: 79 },
];

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function textResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

async function cachedFetch(url, ctx, cacheSeconds = 300) {
  const cache = caches.default;
  const req = new Request(url, { method: "GET", headers: FETCH_HEADERS });

  const cached = await cache.match(req);
  if (cached) return cached.clone();

  const resp = await fetch(req, { cf: { cacheTtl: cacheSeconds, cacheEverything: true } });
  if (resp.ok) ctx.waitUntil(cache.put(req, resp.clone()));
  return resp;
}

function s(v) { return v == null ? "" : String(v).trim(); }

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

function dh(s0 = "") {
  return String(s0 || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&uuml;/g, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&ouml;/g, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&ccedil;/g, "ç")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&nbsp;/g, " ");
}

function dhe(s0 = "") {
  return String(s0 || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

function text(x = "") {
  return dh(String(x || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function raw(t, r) {
  const m = String(t || "").match(r);
  return m ? dh((m[1] || "").trim()) : "";
}

function txt(t, r) {
  const m = String(t || "").match(r);
  return m ? text(m[1]) : "";
}

function noHash(u = "") { return String(u || "").split("#")[0]; }

function abs(u = "") {
  u = String(u || "").trim();
  return /^https?:\/\//i.test(u) ? u : ORIGIN + (u.startsWith("/") ? u : "/" + u);
}

function shortUrl(u = "") {
  try {
    const x = new URL(abs(u));
    return x.pathname + x.search;
  } catch {
    return String(u || "");
  }
}

function shortVariantUrl(u = "") {
  try {
    const x = new URL(abs(u));
    return x.search || x.pathname;
  } catch {
    return String(u || "");
  }
}

function shortImg(u = "") {
  try {
    return new URL(abs(u)).pathname;
  } catch {
    return String(u || "");
  }
}

function brandUrl(brand) {
  return `${ORIGIN}/brand/${brand.id}-${brand.slug}`;
}

function pageUrl(brand, page) {
  return page <= 1 ? brandUrl(brand) : `${brandUrl(brand)}?page=${page}`;
}

function parseBrandsFromMarkalar(html) {
  const byId = new Map();
  const re = /<a\b[^>]*href="([^"]*\/brand\/(\d+)-([^"\/?#]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = Number(m[2]);
    const slug = decodeURIComponent(m[3] || "");
    const rawText = text(m[4]);
    if (!Number.isFinite(id) || !slug) continue;
    const obj = byId.get(id) || { id, slug, name: "", count: null };
    const c = rawText.match(/(\d+)\s*ürün/i);
    if (c) obj.count = Number(c[1]);
    else if (rawText && !/image/i.test(rawText) && rawText.length <= 60) obj.name = rawText;
    byId.set(id, obj);
  }
  return [...byId.values()]
    .filter((x) => Number.isFinite(x.count))
    .map((x) => ({
      id: x.id,
      slug: x.slug,
      name: x.name || dh(x.slug.replace(/[-_]+/g, " ")).trim() || `Brand ${x.id}`,
      count: x.count,
    }));
}

function products(h) {
  const out = [];
  const seen = new Set();
  const re = /<article\b[\s\S]*?<\/article>/gi;
  let m;
  while ((m = re.exec(h))) {
    const b = m[0];
    if (!/product-miniature|js-product-miniature/i.test(b)) continue;

    const url =
      raw(b, /<a[^>]*class="[^"]*thumbnail[^"]*product-thumbnail[^"]*"[^>]*href="([^"]+)"/i) ||
      raw(b, /<a[^>]*href="([^"]+)"[^>]*class="[^"]*thumbnail[^"]*product-thumbnail[^"]*"/i) ||
      raw(b, /<h3[^>]*>\s*<a[^>]*href="([^"]+)"/i);

    const name =
      txt(b, /<a[^>]*class="[^"]*product_name[^"]*"[^>]*title="([^"]+)"/i) ||
      txt(b, /<a[^>]*class="[^"]*product_name[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
      txt(b, /<h3[^>]*>\s*<a[^>]*title="([^"]+)"/i);

    if (!url || !name) continue;

    const n = noHash(abs(url));
    if (seen.has(n)) continue;
    seen.add(n);

    out.push({
      name: text(name),
      title: text(name),
      url: n,
      image: shortImg(raw(b, /<img[^>]*data-src="([^"]+)"/i) || raw(b, /<img[^>]*src="([^"]+)"/i)),
      brand: "",
      productCode: "",
      stock: "",
      ean: "",
    });
  }
  return out;
}

function bname(s0) {
  const m = String(s0 || "").match(/Tüm\s+(.+?)\s+Markalı\s+Ürünler/i);
  return m?.[1] ? text(m[1]) : "";
}

function slugTitle(s0 = "") {
  return dh(String(s0 || ""))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => {
      const lo = String(w || "").toLocaleLowerCase("tr-TR");
      return lo ? lo.charAt(0).toLocaleUpperCase("tr-TR") + lo.slice(1) : "";
    })
    .join(" ");
}

function brandCode(n = "") {
  let s0 = String(n || "").trim();
  if (!s0) return "";
  try { s0 = s0.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); } catch {}
  return s0
    .replace(/Ø/g, "O").replace(/ø/g, "o")
    .replace(/\u0130/g, "I").replace(/\u0131/g, "I")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/&/g, " ").replace(/[^A-Za-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR");
}

function brandMeta(h, u) {
  const title = txt(h, /<title[^>]*>([\s\S]*?)<\/title>/i) || "";
  const h1 =
    txt(h, /<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
    txt(h, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    "";
  let name = bname(h1) || bname(title);
  if (!name) {
    const m = String(u || "").match(/\/brand\/\d+-([^/?#]+)/i);
    if (m?.[1]) name = slugTitle(m[1]);
  }
  return { name, code: brandCode(name) };
}

function attr(h, tag, key) {
  const t = String(h || "").match(new RegExp(`<${tag}\\b([^>]*?)>`, "i"));
  if (!t) return "";
  const a = (t[1] || "").match(new RegExp(`${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}="([^"]*)"`, "i"));
  return a ? a[1] : "";
}

function variants(h) {
  const out = [];
  const seen = new Set();
  const re = /<li[^>]*class="[^"]*input-container[^"]*"[^>]*>[\s\S]*?<\/li>/gi;
  let m;
  while ((m = re.exec(h))) {
    const b = m[0];
    const l = txt(b, /<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || "";
    const n = attr(b, "input", "name");
    const v = attr(b, "input", "value");
    if (!l || !v) continue;
    const k = `${n}__${v}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ l, n, v });
  }
  return out;
}

function dataObj(h) {
  const k = 'data-product="';
  const i0 = String(h || "").indexOf(k);
  if (i0 < 0) return {};
  let i = i0 + k.length;
  let e = "";
  while (i < h.length && h[i] !== '"') e += h[i++];
  if (!e) return {};
  try { return JSON.parse(dhe(e)); } catch { return {}; }
}

function dAttr(d, k) {
  if (!isObj(d)) return "";
  const a = isObj(d.attributes) ? d.attributes : {};
  const ks = Object.keys(a);
  return ks.length ? s(a[ks[0]]?.[k]) : "";
}

function tailNum(u, min = 1, max = 50, exact = 0) {
  try {
    const t = (new URL(u).pathname.match(/-([0-9]+)\.html?$/i)?.[1] || "").trim();
    if (!t) return "";
    if (exact && t.length !== exact) return "";
    if (t.length < min || t.length > max) return "";
    return t;
  } catch { return ""; }
}

function pcode(d, h, u) {
  return dAttr(d, "reference") ||
    txt(h, /<label[^>]*class="label"[^>]*>\s*Ürün Kodu\s*<\/label>\s*<span[^>]*>([\s\S]*?)<\/span>/i) ||
    tailNum(u, 3, 20) || "";
}

function pean(d, h, u) {
  return dAttr(d, "ean13") ||
    txt(h, /<dt[^>]*>\s*ean13\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i) ||
    txt(h, /<label[^>]*class="label"[^>]*>\s*EAN(?:13)?\s*<\/label>\s*<span[^>]*>([\s\S]*?)<\/span>/i) ||
    tailNum(u, 13, 13, 13) || "";
}

function prc(d) {
  return isObj(d) ? s(d.price || d.price_amount || d.price_tax_exc || "") : "";
}

function activeImg(h) {
  return raw(h, /<div[^>]*class="[^"]*\bthumb-item\b[^"]*\bslick-current\b[^"]*\bslick-active\b[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i) ||
    raw(h, /<div[^>]*class="[^"]*\bthumb-item\b[^"]*\bslick-current\b[^"]*\bslick-active\b[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
    raw(h, /<div[^>]*class="[^"]*\bthumb-item\b[^"]*\bslick-current\b[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i) ||
    raw(h, /<div[^>]*class="[^"]*\bthumb-item\b[^"]*\bslick-current\b[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
    "";
}

function coverImg(h) {
  return raw(h, /<div[^>]*class="[^"]*\bproduct-cover\b[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i) ||
    raw(h, /<div[^>]*class="[^"]*\bproduct-cover\b[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
    raw(h, /<img[^>]*class="[^"]*js-qv-product-cover[^"]*"[^>]*data-image-large-src="([^"]+)"/i) ||
    raw(h, /<img[^>]*class="[^"]*js-qv-product-cover[^"]*"[^>]*src="([^"]+)"/i) ||
    raw(h, /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
    "";
}

function dataImg(d) {
  if (!isObj(d)) return "";
  const c = d.cover || {};
  const imgs = Array.isArray(d.images) ? d.images : [];
  const cu = s(c.bySize?.large_default?.url || c.bySize?.large?.url || c.large?.url || c.url);
  if (cu) return cu;
  const cid = s(c.id_image || c.id);
  if (cid) {
    const img = imgs.find((x) => s(x.id_image || x.id) === cid);
    const u = s(img?.bySize?.large_default?.url || img?.bySize?.large?.url || img?.large?.url || img?.url);
    if (u) return u;
  }
  const f = imgs.find((x) => s(x?.bySize?.large_default?.url || x?.bySize?.large?.url || x?.large?.url || x?.url));
  return s(f?.bySize?.large_default?.url || f?.bySize?.large?.url || f?.large?.url || f?.url);
}

function qty(v, fb) {
  const n = num(v);
  return n === null ? s(fb) : n;
}

function vtitle(a, b) {
  a = s(a);
  b = s(b);
  if (!b) return a;
  if (!a || a.toLocaleLowerCase("tr").includes(b.toLocaleLowerCase("tr"))) return a || b;
  return `${a} - ${b}`;
}

function keyCatalog(productUrl) {
  return `catalog:${encodeURIComponent(noHash(abs(productUrl)))}`;
}

async function loadCatalog(env, productUrl) {
  const raw = await env.KV.get(keyCatalog(productUrl));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveCatalog(env, productUrl, data) {
  await env.KV.put(keyCatalog(productUrl), JSON.stringify(data));
}

async function buildCatalog(item, brandName, html) {
  const canonicalUrl = noHash(abs(raw(html, /<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i) || item.url));
  const d = dataObj(html);

  const base = {
    title: text(item.name || item.title || txt(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || "Ürün"),
    url: shortUrl(canonicalUrl),
    image: shortImg(activeImg(html) || coverImg(html) || dataImg(d) || item.image),
    brand: s(brandName || item.brand),
    productCode: pcode(d, html, canonicalUrl) || s(item.productCode),
    ean: pean(d, html, canonicalUrl) || s(item.ean),
  };

  const vs = variants(html);
  const vars = vs.map((v) => {
    const u = new URL(canonicalUrl);
    if (v.n && v.v) u.searchParams.set(v.n, v.v);
    return {
      label: v.l,
      title: vtitle(base.title, v.l),
      url: shortVariantUrl(u.toString()),
      fullUrl: u.toString(),
      image: base.image,
      brand: base.brand,
      productCode: base.productCode,
      ean: base.ean,
    };
  });

  return { base, variants: vars };
}

async function liveFromCatalog(cat, html, ctx) {
  const d = dataObj(html);
  const baseLive = {
    stock: qty(d.quantity, d.availability_message || ""),
    price:
      prc(d) ||
      txt(html, /<span[^>]*class="[^"]*current-price-value[^"]*"[^>]*content="([^"]+)"/i) ||
      txt(html, /<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
      "",
  };

  const vars = Array.isArray(cat?.variants) ? cat.variants : [];
  if (!vars.length) {
    return [{
      title: cat.base.title,
      url: cat.base.url,
      image: cat.base.image,
      brand: cat.base.brand,
      productCode: cat.base.productCode,
      ean: cat.base.ean,
      stock: baseLive.stock,
      price: baseLive.price,
    }];
  }

  const rows = await Promise.all(
    vars.map(async (v) => {
      let vh = "", vd = {};
      try {
        const vr = await cachedFetch(v.fullUrl, ctx, 300);
        if (vr.ok) {
          vh = await vr.text();
          vd = dataObj(vh);
        }
      } catch {}

      return {
        title: v.title || cat.base.title,
        url: v.url || cat.base.url,
        image: v.image || cat.base.image,
        brand: v.brand || cat.base.brand,
        productCode: pcode(vd, vh, v.fullUrl) || v.productCode || cat.base.productCode,
        ean: pean(vd, vh, v.fullUrl) || v.ean || cat.base.ean,
        stock: qty(vd.quantity, vd.availability_message || baseLive.stock),
        price: prc(vd) || baseLive.price,
      };
    })
  );

  return rows.length ? rows : [{
    title: cat.base.title,
    url: cat.base.url,
    image: cat.base.image,
    brand: cat.base.brand,
    productCode: cat.base.productCode,
    ean: cat.base.ean,
    stock: baseLive.stock,
    price: baseLive.price,
  }];
}

async function handleCatalogPage(req, env, ctx) {
  if (!env?.KV) return json({ error: "KV not bound" }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const brand = body?.brand;
  const page = Math.max(1, Number(body?.page) || 1);
  if (!brand?.id || !brand?.slug) return json({ error: "brand gerekli" }, 400);

  const totalPages = Math.max(1, Math.ceil((Number(brand.count) || 0) / 20));
  if (page > totalPages) return json({ error: "page out of range", totalPages }, 400);

  const resp = await cachedFetch(pageUrl(brand, page), ctx, 300);
  if (!resp.ok) return json({ error: `brand page ${resp.status}` }, 500);

  const html = await resp.text();
  const meta = brandMeta(html, brandUrl(brand));
  const brandName = meta.code || meta.name || brand.name || "";
  const pageItems = products(html);

  const items = [];
  const newProducts = [];

  for (const item of pageItems) {
    const productUrl = noHash(abs(item.url));
    let cat = await loadCatalog(env, productUrl);
    let isNew = false;

    const pr = await cachedFetch(productUrl, ctx, 300);
    if (!pr.ok) {
      items.push({
        title: item.title || item.name || "Ürün",
        url: shortUrl(item.url),
        image: item.image || "",
        brand: brandName,
        productCode: item.productCode || "",
        ean: item.ean || "",
        stock: item.stock || "",
        price: "",
        isNew: false,
        error: `product_fetch ${pr.status}`,
      });
      continue;
    }

    const detailHtml = await pr.text();

    if (!cat) {
      cat = await buildCatalog(item, brandName, detailHtml);
      await saveCatalog(env, productUrl, cat);
      isNew = true;
      newProducts.push({ title: item.title || item.name || "", url: shortUrl(item.url) });
    }

    const rows = await liveFromCatalog(cat, detailHtml, ctx);
    for (const r of rows) items.push({ ...r, isNew });
  }

  return json({
    ok: true,
    brand: {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      code: brandName,
      count: Number(brand.count) || 0,
    },
    page,
    totalPages,
    nextPage: page < totalPages ? page + 1 : 0,
    newCount: newProducts.length,
    newProducts,
    items,
  });
}

async function handleBrands(ctx) {
  const resp = await cachedFetch(`${ORIGIN}/markalar`, ctx, 300);
  if (!resp.ok) return json(FALLBACK_BRANDS, 200, { "x-brand-source": "fallback_http" });

  const html = await resp.text();
  const brands = parseBrandsFromMarkalar(html);
  if (!brands.length) return json(FALLBACK_BRANDS, 200, { "x-brand-source": "fallback_parse" });

  return json(brands, 200, { "x-brand-source": "compel_markalar" });
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", te.encode(String(s ?? "")));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function passHash(env, dateYmd, pass) {
  return sha256hex(`${String(env?.PEPPER ?? "")}||${dateYmd}||${String(pass ?? "")}`);
}

function istYMD(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function istHM(d = new Date()) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: IST_TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function istDDMMYYYY(d = new Date()) {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: IST_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")}${get("month")}${get("year")}`;
}

function dispDMYFromYMD(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function dayShiftYMD(base, delta) {
  return istYMD(new Date(new Date(`${base}T12:00:00Z`).getTime() + delta * 86400000));
}

function kPass(d) { return `daily:pass:${d}`; }
function kData(d, k) { return `daily:data:${d}:${k}`; }
function kMeta(d, k) { return `daily:meta:${d}:${k}`; }
function isYMD(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function isKind(s) { return s === "tsoft" || s === "aide"; }

async function readMetaKV(env, d, k) {
  const raw = await env.KV.get(kMeta(d, k));
  if (!raw) return { exists: false, hm: "" };
  try {
    const j = JSON.parse(raw);
    return { exists: true, hm: String(j?.hm ?? "") };
  } catch {
    return { exists: true, hm: "" };
  }
}

async function cleanupOlderThanYesterday(env, today) {
  const yest = dayShiftYMD(today, -1);

  for (const prefix of ["daily:data:", "daily:meta:", "daily:pass:"]) {
    let cursor;
    for (let i = 0; i < 20; i++) {
      const res = await env.KV.list({ prefix, cursor, limit: 1000 });
      for (const k of res?.keys || []) {
        const d = (k?.name || "").split(":")[2] || "";
        if (isYMD(d) && d < yest) await env.KV.delete(k.name);
      }
      if (res?.list_complete) break;
      cursor = res?.cursor;
    }
  }
}

async function handleDailyMeta(env) {
  if (!env?.KV) return json({ error: "KV not bound" }, 500);

  const today = istYMD();
  const yest = dayShiftYMD(today, -1);

  return json({
    today: {
      ymd: today,
      tsoft: await readMetaKV(env, today, "tsoft"),
      aide: await readMetaKV(env, today, "aide"),
    },
    yesterday: {
      ymd: yest,
      dmy: dispDMYFromYMD(yest),
      tsoft: { exists: (await readMetaKV(env, yest, "tsoft")).exists },
      aide: { exists: (await readMetaKV(env, yest, "aide")).exists },
    },
  });
}

async function handleDailyGet(req, env) {
  if (!env?.KV) return json({ error: "KV not bound" }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const date = isYMD(body?.date) ? body.date : istYMD();
  const password = s(body?.password);
  if (!password) return json({ error: "Password required" }, 401);

  const stored = await env.KV.get(kPass(date));
  if (!stored) return json({ error: "No daily password set" }, 404);

  const h = await passHash(env, date, password);
  if (h !== stored) return json({ error: "Unauthorized" }, 401);

  const want = Array.isArray(body?.want)
    ? body.want.map((x) => String(x).toLowerCase()).filter(isKind)
    : isKind(String(body?.kind ?? "").toLowerCase())
      ? [String(body.kind).toLowerCase()]
      : ["tsoft", "aide"];

  const out = { date };
  for (const kind of want) {
    const data = await env.KV.get(kData(date, kind));
    out[kind] = data != null ? { exists: true, data } : { exists: false };
  }

  return json(out);
}

async function handleDailySave(req, env) {
  if (!env?.KV) return json({ error: "KV not bound" }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const kind = String(body?.kind ?? "").toLowerCase();
  if (!isKind(kind)) return json({ error: "Bad kind (tsoft|aide)" }, 400);

  const today = istYMD();
  const admin = s(body?.adminPassword);
  if (admin !== istDDMMYYYY()) return json({ error: "Admin password wrong" }, 401);

  const readPassword = s(body?.readPassword);
  const dataAny = body?.data;

  if (!readPassword) return json({ error: "Read password required" }, 400);
  if (dataAny == null) return json({ error: "No data" }, 400);

  const data = typeof dataAny === "string" ? dataAny : JSON.stringify(dataAny);
  const bytes = te.encode(data).byteLength;
  if (bytes > 25 * 1024 * 1024) return json({ error: "Too large for KV (25MiB limit)" }, 413);

  const hm = istHM();
  const ph = await passHash(env, today, readPassword);

  await env.KV.put(kPass(today), ph);
  await env.KV.put(kData(today, kind), data);
  await env.KV.put(kMeta(today, kind), JSON.stringify({ hm, ts: Date.now(), bytes }));
  await cleanupOlderThanYesterday(env, today);

  return json({ ok: true, date: today, kind, hm, bytes });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return textResponse("ok");
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return textResponse("ok");
    }

    if (req.method === "GET" && url.pathname === "/api/brands") {
      return handleBrands(ctx);
    }

    if (req.method === "POST" && url.pathname === "/api/catalog/page") {
      return handleCatalogPage(req, env, ctx);
    }

    if (req.method === "GET" && url.pathname === "/api/daily/meta") {
      return handleDailyMeta(env);
    }

    if (req.method === "POST" && url.pathname === "/api/daily/get") {
      return handleDailyGet(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/daily/save") {
      return handleDailySave(req, env);
    }

    return textResponse("Not found", 404);
  },
};
