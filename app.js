const WORKER = 'https://r2.tvkapora.workers.dev/';
const CRAWLER = 'https://crawler.tvkapora.workers.dev/?u=';
const DELAY = 2000, JITTER = 400;
const BRANDS = [
  'ableton','allen-heath','arturia','avalon','avid','compel','cranborne-audio',
  'crane-song','denon-dj','fender-studio','genelec','headrush','hosa','m-audio',
  'm-game','marantz-professional','numark','presonus','rane','rupert-neve-designs',
  'rode','rode-x','sheeran-loopers','sibelius','sonarworks','soundswitch','stanton',
  'universal-audio','warm-audio'
];

let activeBrand = null, brandData = {};
const $ = id => document.getElementById(id);
const brandList=$('brand-list'), toolbar=$('toolbar'), tableWrap=$('table-wrap'),
  tbody=$('tbody'), notice=$('notice'), statusEl=$('status'), jsonDate=$('json-date');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = ms => ms + Math.floor(Math.random() * JITTER);
const setStatus = msg => { statusEl.textContent = msg; };
const setDate = iso => { jsonDate.textContent = iso ? iso.slice(0,16).replace('T',' ') : ''; };

function renderBrands() {
  BRANDS.forEach(slug => {
    const btn = document.createElement('button');
    btn.className = 'brand-btn'; btn.textContent = slug; btn.id = 'b-'+slug;
    btn.onclick = () => openBrand(slug, btn);
    brandList.appendChild(btn);
  });
}

async function workerGet(params) {
  const u = new URL(WORKER);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`worker ${r.status}`);
  return r.json();
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

function renderTable(urunler) {
  tbody.innerHTML = '';
  urunler.forEach((u,i) => appendRow(u, i));
}

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
  downloadJson(json, `${brand}.json`);
  setDate(json.guncelleme);
  setStatus(`${urunler.length} ürün tamamlandı`);
  return json;
}

function downloadJson(data, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download = filename; a.click();
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
          tr.classList.remove('updating');
        }
      }
    } catch {}
    if (i < total-1) await sleep(rand(DELAY));
  }

  const json = { ...data, urunler, guncelleme: new Date().toISOString() };
  setDate(json.guncelleme);
  if (newLinks.length) showNotice(brand, newLinks, json);
  else { downloadJson(json, `${brand}.json`); setStatus('güncellendi'); }
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
    downloadJson(json, `${brand}.json`);
    setStatus('yeni ürünler eklendi');
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

async function openBrand(brand, btn) {
  document.querySelectorAll('.brand-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  activeBrand = brand;
  toolbar.classList.remove('hidden');
  tableWrap.classList.remove('hidden');
  notice.classList.add('hidden');
  $('brand-title').textContent = brand;
  tbody.innerHTML = ''; setDate(null); setStatus('');

  const data = await fetch(`data/compel/${brand}.json?_=${Date.now()}`).then(r=>r.ok?r.json():null).catch(()=>null);
  if (!data) {
    $('btn-init').classList.remove('hidden');
    setStatus('json yok — "ilk çekim" yapın');
    brandData[brand] = null;
  } else {
    $('btn-init').classList.add('hidden'); brandData[brand]=data;
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

renderBrands();
