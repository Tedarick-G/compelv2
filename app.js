const WORKER = 'https://r2.tvkapora.workers.dev/';
const DELAY = 1000;
const JITTER = 400;

const SITES = {
  compel: {
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

let activeBrand = null;
let brandData = {};
let selectedBrands = new Set();

const $ = id => document.getElementById(id);
const brandList = $('brand-list');
const productSection = $('product-section');
const brandsSection = $('brands-section');
const tbody = $('tbody');
const notice = $('notice');
const status = $('status');
const brandChecks = $('brand-checks');

function setStatus(msg, dur=3000) {
  status.textContent = msg;
  status.classList.remove('hidden');
  clearTimeout(setStatus._t);
  if (dur) setStatus._t = setTimeout(() => status.classList.add('hidden'), dur);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = ms => ms + Math.floor(Math.random() * JITTER);

// --- Header: marka checkboxları ---
function renderBrandChecks() {
  brandChecks.innerHTML = '';
  SITES.compel.brands.forEach(slug => {
    const lbl = document.createElement('label');
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.value = slug;
    chk.checked = selectedBrands.has(slug);
    chk.onchange = () => {
      chk.checked ? selectedBrands.add(slug) : selectedBrands.delete(slug);
      renderBrands();
    };
    lbl.appendChild(chk);
    lbl.append(' ' + slug);
    brandChecks.appendChild(lbl);
  });
}

$('chk-compel').onchange = function() {
  if (this.checked) { renderBrandChecks(); renderBrands(); }
  else { brandChecks.innerHTML = ''; brandList.innerHTML = ''; selectedBrands.clear(); }
};

// --- Brand butonları ---
function renderBrands() {
  const all = SITES.compel.brands;
  const list = selectedBrands.size ? all.filter(b => selectedBrands.has(b)) : all;
  brandList.innerHTML = '';
  list.forEach(slug => {
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

async function workerGet(params) {
  const u = new URL(WORKER);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`worker ${r.status}`);
  return r.json();
}

// --- Satır oluştur ---
function makeRow(u, i) {
  const out = (u.stok === 0 || u.stok === null) ? 'out' : '';
  const tr = document.createElement('tr');

  // ürün adı + link toggle
  const urunCell = document.createElement('td');
  urunCell.innerHTML = `<span class="urun-adi">${u.urun_adi||'-'}</span>${u.varyant_adi?`<br><span class="variant">${u.varyant_adi}</span>`:''}`;
  const linkRow = document.createElement('tr');
  linkRow.className = 'link-row hidden';
  linkRow.innerHTML = `<td colspan="11"><a href="${u.urun_linki}" target="_blank">${u.urun_linki}</a></td>`;
  urunCell.querySelector('.urun-adi').style.cursor = 'pointer';
  urunCell.querySelector('.urun-adi').onclick = () => linkRow.classList.toggle('hidden');

  tr.innerHTML = `
    <td>${i+1}</td>
    <td>${u.kapak_gorsel?`<img class="thumb" src="${u.kapak_gorsel}" loading="lazy">`:'<div class="no-img"></div>'}</td>
    <td>${u.sku||'-'}</td>
    <td>${u.marka_adi||'-'}</td>
    <td></td>
    <td>${u.kategori_adi||'-'}</td>
    <td class="${out}">${u.stok??'-'}</td>
    <td class="${out}">${u.guncel_fiyat||'-'}</td>
    <td class="${out}">${u.usd_kdv_haric||'-'}</td>
    <td class="${out}">${u.eur_kdv_haric||'-'}</td>
    <td>${u.ean||'-'}</td>`;
  tr.cells[4].appendChild(urunCell);

  return [tr, linkRow];
}

function appendRow(u, i) {
  const [tr, linkRow] = makeRow(u, i);
  tbody.appendChild(tr);
  tbody.appendChild(linkRow);
}

function renderTable(urunler) {
  tbody.innerHTML = '';
  urunler.forEach((u, i) => appendRow(u, i));
}

// --- İlk çekim ---
async function initBrandData(brand) {
  setStatus(`${brand} çekiliyor...`, 0);
  const fields = 'urun_linki,kapak_gorsel,urun_adi,varyant_adi,sku,ean,marka_adi,kategori_adi,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok';
  let allLinks = [], page = 1;

  while(true) {
    setStatus(`${brand} sayfa ${page} taranıyor...`, 0);
    try {
      const res = await workerGet({ u: brand, page, fields: 'urun_linki', limit: 999 });
      const links = (res.urunler||[]).map(u => u.urun_linki).filter(Boolean);
      if (!links.length) break;
      allLinks.push(...links);
      if (links.length < 10) break;
      page++;
      await sleep(rand(DELAY));
    } catch(e) { setStatus(`Hata: ${e.message}`); break; }
  }

  allLinks = [...new Set(allLinks)];
  setStatus(`${allLinks.length} ürün bulundu, detaylar çekiliyor...`, 0);
  tbody.innerHTML = '';
  const urunler = [];
  let idx = 0;

  for (let i = 0; i < allLinks.length; i++) {
    setStatus(`${i+1}/${allLinks.length} — ${brand}`, 0);
    try {
      const res = await workerGet({ u: allLinks[i], fields });
      const rows = Array.isArray(res) ? res : [res];
      rows.forEach(r => {
        if (r && !r.hata) { urunler.push(r); appendRow(r, idx++); }
      });
    } catch(e) { console.warn(allLinks[i], e.message); }
    if (i < allLinks.length - 1) await sleep(rand(DELAY));
  }

  const json = { brand, guncelleme: new Date().toISOString(), urunler };
  downloadJson(json, `${brand}.json`);
  setStatus(`${urunler.length} ürün indirildi. JSON'u data/compel/ klasörüne koy.`);
  return json;
}

function downloadJson(data, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
  a.download = filename;
  a.click();
}

// --- Güncelleme ---
async function refreshBrand(brand, data) {
  const urunler = data.urunler || [];
  const linkSet = new Set(urunler.map(u => u.urun_linki));
  const fields = 'urun_linki,sku,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok,varyant_adi';

  setStatus('Yeni ürün kontrolü...', 0);
  let liveLinks = [], page = 1;
  while(true) {
    try {
      const res = await workerGet({ u: brand, page, fields: 'urun_linki', limit: 999 });
      const links = (res.urunler||[]).map(u => u.urun_linki).filter(Boolean);
      if (!links.length) break;
      liveLinks.push(...links);
      if (links.length < 10) break;
      page++;
      await sleep(rand(DELAY));
    } catch { break; }
  }
  const newLinks = [...new Set(liveLinks)].filter(l => !linkSet.has(l));

  for (let i = 0; i < urunler.length; i++) {
    const u = urunler[i];
    setStatus(`güncelleniyor ${i+1}/${urunler.length}`, 0);
    try {
      const res = await workerGet({ u: u.urun_linki, fields });
      const rows = Array.isArray(res) ? res : [res];
      const match = u.varyant_adi ? rows.find(r => r.sku === u.sku)||rows[0] : rows[0];
      if (match && !match.hata) {
        u.guncel_fiyat = match.guncel_fiyat;
        u.usd_kdv_haric = match.usd_kdv_haric;
        u.eur_kdv_haric = match.eur_kdv_haric;
        u.stok = match.stok;
      }
    } catch {}
    if (i < urunler.length - 1) await sleep(rand(DELAY));
  }

  const json = { ...data, urunler, guncelleme: new Date().toISOString() };
  if (newLinks.length) showNotice(brand, newLinks, json);
  else { downloadJson(json, `${brand}.json`); setStatus(`Güncellendi. JSON'u repoya yükle.`); }
  brandData[brand] = json;
  renderTable(json.urunler);
}

function showNotice(brand, newLinks, json) {
  notice.classList.remove('hidden');
  notice.innerHTML = `⚠ ${newLinks.length} yeni ürün bulundu <span class="new-badge">yükle</span>`;
  notice.onclick = async () => {
    notice.classList.add('hidden');
    const fields = 'urun_linki,kapak_gorsel,urun_adi,varyant_adi,sku,ean,marka_adi,kategori_adi,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok';
    let idx = json.urunler.length;
    for (let i = 0; i < newLinks.length; i++) {
      setStatus(`yeni ürün ${i+1}/${newLinks.length}`, 0);
      try {
        const res = await workerGet({ u: newLinks[i], fields });
        const rows = Array.isArray(res) ? res : [res];
        rows.forEach(r => { if(r && !r.hata) { json.urunler.push(r); appendRow(r, idx++); } });
      } catch {}
      if (i < newLinks.length - 1) await sleep(rand(DELAY));
    }
    json.guncelleme = new Date().toISOString();
    brandData[brand] = json;
    downloadJson(json, `${brand}.json`);
    setStatus(`Yeni ürünler eklendi. JSON'u repoya yükle.`);
  };
}

// --- CSV ---
function exportCsv(urunler, brand) {
  const cols = ['sira_no','urun_linki','kapak_gorsel','sku','marka_adi','urun_adi','varyant_adi','kategori_adi','stok','guncel_fiyat','usd_kdv_haric','eur_kdv_haric','ean'];
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const rows = [cols.join(','), ...urunler.map((u,i) => cols.map(c => esc(c==='sira_no'?i+1:u[c])).join(','))];
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
    $('btn-init').classList.remove('hidden');
    setStatus(`${brand} için json yok. "ilk çekim" yapın.`);
    brandData[brand] = null;
  } else {
    $('btn-init').classList.add('hidden');
    brandData[brand] = data;
    renderTable(data.urunler);
    setStatus(`${data.urunler.length} ürün (${data.guncelleme?.slice(0,10)})`, 3000);
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
  if (!activeBrand || !brandData[activeBrand]) { setStatus('Önce ilk çekimi yapın.'); return; }
  await refreshBrand(activeBrand, JSON.parse(JSON.stringify(brandData[activeBrand])));
};
$('btn-export').onclick = () => {
  if (activeBrand && brandData[activeBrand]) exportCsv(brandData[activeBrand].urunler, activeBrand);
};
$('btn-init').onclick = async () => {
  if (!activeBrand) return;
  $('btn-init').classList.add('hidden');
  const data = await initBrandData(activeBrand);
  brandData[activeBrand] = data;
};

// --- Init ---
renderBrandChecks();
renderBrands();
