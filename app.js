const WORKER = 'https://r2.tvkapora.workers.dev/';
const KV = 'https://compelkv.tvkapora.workers.dev/';
const CRAWLER = 'https://crawler.tvkapora.workers.dev/?u=';
const DELAY = 2000, JITTER = 400;

let activeBrand = null, brandData = {};
const $ = id => document.getElementById(id);
const brandList=$('brand-list'), toolbar=$('toolbar'), tableWrap=$('table-wrap'),
  tbody=$('tbody'), notice=$('notice'), statusEl=$('status'), jsonDate=$('json-date');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = ms => ms + Math.floor(Math.random() * JITTER);
const setStatus = msg => { statusEl.textContent = msg; };
const setDate = iso => { jsonDate.textContent = iso ? iso.slice(0,16).replace('T',' ') : ''; };

async function workerGet(params) {
  const u = new URL(WORKER);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`worker ${r.status}`);
  return r.json();
}

async function kvGet(slug) {
  const r = await fetch(`${KV}?get=${slug}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return r.json();
}

async function kvSet(slug, data) {
  await fetch(`${KV}?set=${slug}`, { method: 'POST', body: JSON.stringify(data) });
}

async function loadBrands() {
  try {
    const res = await fetch(`${KV}?brands`).then(r=>r.json());
    return res.brands || [];
  } catch { return []; }
}

function renderBrands(brands) {
  brandList.innerHTML = '';
  brands.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'brand-btn'; btn.id = 'b-'+b.slug;
    btn.innerHTML = `${b.name} <span class="brand-count">${b.count}</span>`;
    btn.onclick = () => openBrand(b.slug, btn);
    brandList.appendChild(btn);
  });
}

function makeRow(u, i) {
  const out = (u.stok===0||u.stok===null) ? 'out' : '';
  const tr = document.createElement('tr');
  tr.dataset.link = u.urun_linki;
  if (u.sku) tr.dataset.sku = u.sku;
  tr.innerHTML = `
    <td>${i+1}</td>
    <td>${u.kapak_gorsel?`<img class="thumb" src="${u.kapak_gorsel}" loading="lazy">`:'<div class="no-img"></div>'}</td>
    <td>${u.sku||'-'}</td>
    <td>${u.marka_adi||'-'}</td>
    <td><a class="urun-adi" href="${CRAWLER}${encodeURIComponent(u.urun_linki)}" target="_blank" title="${u.urun_adi||''}">${u.urun_adi||'-'}${u.varyant_adi?` · ${u.varyant_adi}`:''}</a></td>
    <td>${u.kategori_adi||'-'}</td>
    <td class="price ${out}">${u.stok??'-'}</td>
    <td class="price ${out}">${u.guncel_fiyat||'-'}</td>
    <td class="price ${out}">${u.usd_kdv_haric||'-'}</td>
    <td class="price ${out}">${u.eur_kdv_haric||'-'}</td>
    <td>${u.ean||'-'}</td>`;
  return tr;
}

function appendRow(u, i) { tbody.appendChild(makeRow(u, i)); }
function renderTable(urunler) { tbody.innerHTML = ''; urunler.forEach((u,i) => appendRow(u, i)); }

async function collectLinks(brand) {
  const seen = new Set(), all = [];
  let page = 1;
  while(true) {
    setStatus(`sayfa ${page} taranıyor...`);
    try {
      const res = await workerGet({ u: brand, page, fields: 'urun_linki' });
      const links = (res.urunler||[]).map(u=>u.urun_linki).filter(Boolean);
      if (!links.length) break;
      let added = 0;
      links.forEach(l => { if(!seen.has(l)){ seen.add(l); all.push(l); added++; } });
      if (!added) break;
      page++;
      await sleep(rand(DELAY));
    } catch(e) { setStatus(`hata: ${e.message}`); break; }
  }
  return all;
}

async function initBrandData(brand) {
  const fields = 'urun_linki,kapak_gorsel,urun_adi,varyant_adi,sku,ean,marka_adi,kategori_adi,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok';
  tbody.innerHTML = '';
  const allLinks = await collectLinks(brand);
  const total = allLinks.length;
  const urunler = [];
  for (let i = 0; i < total; i++) {
    setStatus(`${i+1}/${total} çekiliyor`);
    try {
      const res = await workerGet({ u: allLinks[i], fields });
      const rows = Array.isArray(res)?res:[res];
      rows.forEach(r => { if(r&&!r.hata){ urunler.push(r); appendRow(r, urunler.length-1); } });
    } catch(e) { console.warn(allLinks[i], e.message); }
    if (i < total-1) await sleep(rand(DELAY));
  }
  const json = { brand, guncelleme: new Date().toISOString(), urunler };
  await kvSet(brand, json);
  setDate(json.guncelleme);
  setStatus(`${urunler.length} ürün tamamlandı — KV'ye kaydedildi`);
  return json;
}

async function refreshBrand(brand, data) {
  const urunler = data.urunler || [];
  const fields = 'urun_linki,sku,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok,varyant_adi';
  setStatus('yeni ürün kontrolü...');
  const liveLinks = await collectLinks(brand);
  const linkSet = new Set(urunler.map(u=>u.urun_linki));
  const newLinks = liveLinks.filter(l=>!linkSet.has(l));
  const total = urunler.length;
  const domRows = [...tbody.querySelectorAll('tr[data-link]')];

  for (let i = 0; i < total; i++) {
    const u = urunler[i];
    setStatus(`güncelleniyor ${i+1}/${total}`);
    const tr = domRows.find(r => r.dataset.link===u.urun_linki &&
      (!u.varyant_adi || r.querySelector('.urun-adi')?.textContent.includes(u.varyant_adi)));
    if (tr) tr.classList.add('updating');
    try {
      const res = await workerGet({ u: u.urun_linki, fields });
      const rs = Array.isArray(res)?res:[res];
      const match = u.varyant_adi ? rs.find(r=>r.sku===u.sku)||rs[0] : rs[0];
      if (match&&!match.hata) {
        u.guncel_fiyat=match.guncel_fiyat; u.usd_kdv_haric=match.usd_kdv_haric;
        u.eur_kdv_haric=match.eur_kdv_haric; u.stok=match.stok;
        if (tr) {
          const out=(u.stok===0||u.stok===null)?'out':'';
          const cells=tr.querySelectorAll('.price');
          [u.stok??'-',u.guncel_fiyat||'-',u.usd_kdv_haric||'-',u.eur_kdv_haric||'-']
            .forEach((v,j)=>{ cells[j].textContent=v; cells[j].className=`price ${out}`; });
          tr.classList.remove('updating'); tr.querySelectorAll('.price').forEach(c=>{c.classList.add('flashed');setTimeout(()=>c.classList.remove('flashed'),1200);});
        }
      }
    } catch {}
    if (i < total-1) await sleep(rand(DELAY));
  }

  const json = { ...data, urunler, guncelleme: new Date().toISOString() };
  setDate(json.guncelleme);
  if (newLinks.length) showNotice(brand, newLinks, json);
  else { await kvSet(brand, json); setStatus('güncellendi — KV kaydedildi'); }
  brandData[brand] = json;
}

function showNotice(brand, newLinks, json) {
  notice.classList.remove('hidden');
  notice.innerHTML = `⚠ ${newLinks.length} yeni ürün <span class="new-badge">yükle</span>`;
  notice.onclick = async () => {
    notice.classList.add('hidden');
    const fields = 'urun_linki,kapak_gorsel,urun_adi,varyant_adi,sku,ean,marka_adi,kategori_adi,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok';
    for (let i = 0; i < newLinks.length; i++) {
      setStatus(`yeni ürün ${i+1}/${newLinks.length}`);
      try {
        const res = await workerGet({ u: newLinks[i], fields });
        const rows = Array.isArray(res)?res:[res];
        rows.forEach(r=>{ if(r&&!r.hata){ json.urunler.push(r); appendRow(r, json.urunler.length-1); } });
      } catch {}
      if (i < newLinks.length-1) await sleep(rand(DELAY));
    }
    json.guncelleme = new Date().toISOString();
    setDate(json.guncelleme); brandData[brand]=json;
    await kvSet(brand, json);
    setStatus('yeni ürünler KV\'ye kaydedildi');
  };
}

function exportCsv(urunler, brand) {
  const cols = ['sira_no','urun_linki','kapak_gorsel','sku','marka_adi','urun_adi','varyant_adi','kategori_adi','stok','guncel_fiyat','usd_kdv_haric','eur_kdv_haric','ean'];
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const rows = [cols.join(','), ...urunler.map((u,i)=>cols.map(c=>esc(c==='sira_no'?i+1:u[c])).join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}));
  a.download = `${brand}.csv`; a.click();
}

async function openBrand(slug, btn) {
  document.querySelectorAll('.brand-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  activeBrand = slug;
  toolbar.classList.remove('hidden');
  tableWrap.classList.remove('hidden');
  notice.classList.add('hidden');
  $('brand-title').textContent = slug;
  tbody.innerHTML = ''; setDate(null); setStatus('yükleniyor...');

  const data = await kvGet(slug);
  if (!data) {
    $('btn-init').classList.remove('hidden');
    setStatus('KV\'de yok — "ilk çekim" yapın');
    brandData[slug] = null;
  } else {
    $('btn-init').classList.add('hidden'); brandData[slug]=data;
    renderTable(data.urunler); setDate(data.guncelleme);
    setStatus(`${data.urunler.length} ürün yüklendi`);
  }
  tableWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('btn-refresh').onclick = async () => {
  if (!activeBrand||!brandData[activeBrand]) { setStatus('önce ilk çekimi yapın'); return; }
  await refreshBrand(activeBrand, JSON.parse(JSON.stringify(brandData[activeBrand])));
};
$('btn-export').onclick = () => {
  if (activeBrand&&brandData[activeBrand]) exportCsv(brandData[activeBrand].urunler, activeBrand);
};
$('btn-init').onclick = async () => {
  if (!activeBrand) return;
  $('btn-init').classList.add('hidden');
  brandData[activeBrand] = await initBrandData(activeBrand);
};

// Başlangıç
loadBrands().then(renderBrands);
