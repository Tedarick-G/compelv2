const WORKER = 'https://r2.tvkapora.workers.dev/';
const DELAY = 1000;
const JITTER = 400;

const SITES = {
  compel: {
    base: 'https://compel.com.tr',
    dataPath: 'data/compel/',
    brands: [
      'ableton','allen-heath','arturia','avalon','avid','compel','cranborne-audio',
      'crane-song','denon-dj','fender-studio','genelec','headrush','hosa','m-audio',
      'm-game','marantz-professional','numark','presonus','rane','rupert-neve-designs',
      'rode','rode-x','sheeran-loopers','sibelius','sonarworks','soundswitch','stanton',
      'universal-audio','warm-audio'
    ]
  }
};

let activeSite = 'compel';
let activeBrand = null;
let brandData = {};

// --- DOM ---
const $ = id => document.getElementById(id);
const brandList = $('brand-list');
const productSection = $('product-section');
const brandsSection = $('brands-section');
const tbody = $('tbody');
const notice = $('notice');
const status = $('status');

function setStatus(msg, dur=3000) {
  status.textContent = msg;
  status.classList.remove('hidden');
  clearTimeout(setStatus._t);
  if (dur) setStatus._t = setTimeout(() => status.classList.add('hidden'), dur);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(ms) { return ms + Math.floor(Math.random() * JITTER); }

// --- Brand buttons ---
function renderBrands() {
  const site = SITES[activeSite];
  brandList.innerHTML = '';
  site.brands.forEach(slug => {
    const btn = document.createElement('button');
    btn.className = 'brand-btn';
    btn.textContent = slug;
    btn.onclick = () => openBrand(slug);
    brandList.appendChild(btn);
  });
}

// --- Data ---
async function loadJson(brand) {
  try {
    const r = await fetch(`data/compel/${brand}.json?_=${Date.now()}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// --- Worker fetch ---
async function workerGet(params) {
  const u = new URL(WORKER);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`worker ${r.status}`);
  return r.json();
}

// --- İlk çekim: tüm brand ürünlerini worker'dan sırayla çek ---
async function initBrandData(brand) {
  setStatus(`${brand} çekiliyor... (bu biraz sürer)`, 0);
  const fields = 'urun_linki,kapak_gorsel,urun_adi,varyant_adi,sku,ean,marka_adi,kategori_adi,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok';
  
  // Önce tüm linkleri çek (sadece linkler)
  let allProducts = [];
  let page = 1;
  
  while(true) {
    setStatus(`${brand} sayfa ${page} taranıyor...`, 0);
    try {
      const res = await workerGet({ u: brand, page, fields: 'urun_linki', limit: 999 });
      const links = (res.urunler || []).map(u => u.urun_linki).filter(Boolean);
      if (!links.length) break;
      allProducts.push(...links);
      // Worker tek sayfada hepsini dönebilir; eğer döndüyse dur
      if (!res.urunler || res.urunler.length < 10) break;
      page++;
      await sleep(rand(DELAY));
    } catch(e) {
      setStatus(`Hata: ${e.message}`);
      break;
    }
  }

  // Deduplicate
  allProducts = [...new Set(allProducts)];
  setStatus(`${allProducts.length} ürün bulundu, detaylar çekiliyor...`, 0);

  const urunler = [];
  for (let i = 0; i < allProducts.length; i++) {
    const link = allProducts[i];
    setStatus(`${i+1}/${allProducts.length} - ${brand}`, 0);
    try {
      const res = await workerGet({ u: link, fields });
      const rows = Array.isArray(res) ? res : [res];
      rows.forEach(r => { if(r && !r.hata) urunler.push(r); });
    } catch(e) {
      console.warn(link, e.message);
    }
    if (i < allProducts.length - 1) await sleep(rand(DELAY));
  }

  const json = { brand, guncelleme: new Date().toISOString(), urunler };
  downloadJson(json, `${brand}.json`);
  setStatus(`${brand}: ${urunler.length} ürün indirildi. JSON'u data/compel/ klasörüne koy.`);
  return json;
}

function downloadJson(data, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
  a.download = filename;
  a.click();
}

// --- Güncelleme: sadece fiyat/stok refresh ---
async function refreshBrand(brand, existingData) {
  const urunler = existingData.urunler || [];
  const fields = 'urun_linki,sku,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok,varyant_adi';
  
  // Mevcut link seti
  const linkSet = new Set(urunler.map(u => u.urun_linki));
  
  // Worker'dan mevcut linkleri çek (yeni ürün kontrolü)
  setStatus('Yeni ürün kontrolü...', 0);
  let liveLinks = [];
  let page = 1;
  while(true) {
    try {
      const res = await workerGet({ u: brand, page, fields: 'urun_linki', limit: 999 });
      const links = (res.urunler || []).map(u => u.urun_linki).filter(Boolean);
      if (!links.length) break;
      liveLinks.push(...links);
      if (!res.urunler || res.urunler.length < 10) break;
      page++;
      await sleep(rand(DELAY));
    } catch { break; }
  }
  liveLinks = [...new Set(liveLinks)];
  const newLinks = liveLinks.filter(l => !linkSet.has(l));

  // Fiyat/stok güncelle
  const updated = [];
  for (let i = 0; i < urunler.length; i++) {
    const u = urunler[i];
    setStatus(`güncelleniyor ${i+1}/${urunler.length}`, 0);
    try {
      // varyant → sku ile eşleş, tekil → link ile
      const key = u.varyant_adi ? u.sku : u.urun_linki;
      const res = await workerGet({ u: u.urun_linki, fields });
      const rows = Array.isArray(res) ? res : [res];
      const match = u.varyant_adi
        ? rows.find(r => r.sku === u.sku) || rows[0]
        : rows[0];
      if (match && !match.hata) {
        u.guncel_fiyat = match.guncel_fiyat;
        u.usd_kdv_haric = match.usd_kdv_haric;
        u.eur_kdv_haric = match.eur_kdv_haric;
        u.stok = match.stok;
      }
    } catch {}
    updated.push(u);
    if (i < urunler.length - 1) await sleep(rand(DELAY));
  }

  const json = { ...existingData, urunler: updated, guncelleme: new Date().toISOString() };
  
  if (newLinks.length) {
    showNotice(brand, newLinks, json);
  } else {
    downloadJson(json, `${brand}.json`);
    setStatus(`Güncellendi. JSON'u data/compel/ klasörüne koy.`);
  }
  brandData[brand] = json;
  renderTable(json.urunler);
}

function showNotice(brand, newLinks, json) {
  notice.classList.remove('hidden');
  notice.innerHTML = `⚠ ${newLinks.length} yeni ürün bulundu <span class="new-badge">yükle</span>`;
  notice.onclick = async () => {
    notice.classList.add('hidden');
    const newRows = [];
    for (let i = 0; i < newLinks.length; i++) {
      setStatus(`yeni ürün ${i+1}/${newLinks.length}`, 0);
      try {
        const fields = 'urun_linki,kapak_gorsel,urun_adi,varyant_adi,sku,ean,marka_adi,kategori_adi,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok';
        const res = await workerGet({ u: newLinks[i], fields });
        const rows = Array.isArray(res) ? res : [res];
        rows.forEach(r => { if(r && !r.hata) newRows.push(r); });
      } catch {}
      if (i < newLinks.length - 1) await sleep(rand(DELAY));
    }
    json.urunler.push(...newRows);
    json.guncelleme = new Date().toISOString();
    brandData[brand] = json;
    renderTable(json.urunler);
    downloadJson(json, `${brand}.json`);
    setStatus(`${newRows.length} yeni ürün eklendi. JSON'u repoya yükle.`);
  };
}

// --- Tablo ---
function renderTable(urunler) {
  tbody.innerHTML = '';
  urunler.forEach((u, i) => {
    const tr = document.createElement('tr');
    const stokClass = (u.stok === 0 || u.stok === null) ? 'out' : '';
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${u.kapak_gorsel ? `<img class="thumb" src="${u.kapak_gorsel}" loading="lazy">` : '<div class="no-img"></div>'}</td>
      <td>
        <a href="${u.urun_linki}" target="_blank">${u.urun_adi || '-'}</a>
        ${u.varyant_adi ? `<br><span class="variant">${u.varyant_adi}</span>` : ''}
      </td>
      <td>${u.sku || '-'}</td>
      <td class="${stokClass}">${u.guncel_fiyat || '-'}</td>
      <td class="${stokClass}">${u.usd_kdv_haric || '-'}</td>
      <td class="${stokClass}">${u.eur_kdv_haric || '-'}</td>
      <td class="${stokClass}">${u.stok ?? '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- CSV export ---
function exportCsv(urunler, brand) {
  const cols = ['urun_linki','urun_adi','varyant_adi','sku','ean','marka_adi','kategori_adi','guncel_fiyat','usd_kdv_haric','eur_kdv_haric','stok'];
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const rows = [cols.join(','), ...urunler.map(u => cols.map(c => esc(u[c])).join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8'}));
  a.download = `${brand}.csv`;
  a.click();
}

// --- Brand açma ---
async function openBrand(brand) {
  activeBrand = brand;
  brandsSection.classList.add('hidden');
  productSection.classList.remove('hidden');
  notice.classList.add('hidden');
  $('brand-title').textContent = brand;
  tbody.innerHTML = '';

  const data = await loadJson(brand);
  if (!data) {
    // JSON yok → ilk çekim butonu göster
    $('btn-init').classList.remove('hidden');
    setStatus(`${brand} için json bulunamadı. "İlk çekim" yapın.`);
    brandData[brand] = null;
  } else {
    $('btn-init').classList.add('hidden');
    brandData[brand] = data;
    renderTable(data.urunler);
    setStatus(`${data.urunler.length} ürün yüklendi (${data.guncelleme?.slice(0,10)})`, 3000);
  }
}

// --- Events ---
$('btn-back').onclick = () => {
  productSection.classList.add('hidden');
  brandsSection.classList.remove('hidden');
  activeBrand = null;
  notice.classList.add('hidden');
  status.classList.add('hidden');
};

$('btn-refresh').onclick = async () => {
  if (!activeBrand) return;
  const data = brandData[activeBrand];
  if (!data) { setStatus('Önce ilk çekimi yapın.'); return; }
  await refreshBrand(activeBrand, JSON.parse(JSON.stringify(data)));
};

$('btn-export').onclick = () => {
  if (!activeBrand || !brandData[activeBrand]) return;
  exportCsv(brandData[activeBrand].urunler, activeBrand);
};

$('btn-init').onclick = async () => {
  if (!activeBrand) return;
  $('btn-init').classList.add('hidden');
  const data = await initBrandData(activeBrand);
  brandData[activeBrand] = data;
  renderTable(data.urunler);
};

// --- Init ---
renderBrands();
