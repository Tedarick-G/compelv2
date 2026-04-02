const WORKER = 'https://compelkv.tvkapora.workers.dev/';
const CRAWLER = 'https://crawler.tvkapora.workers.dev/?u=';
const DELAY = 2000, JITTER = 400;

let activeBrand = null, brandData = {};
const $ = id => document.getElementById(id);
const brandList=$('brand-list'), toolbar=$('toolbar'), tableWrap=$('table-wrap'),
  tbody=$('tbody'), notice=$('notice'), statusEl=$('status');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = ms => ms + Math.floor(Math.random() * JITTER);
const setStatus = msg => { statusEl.textContent = msg; };
const DAYS=['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
function fmtFull(iso){
  if(!iso)return'';
  const d=new Date(new Date(iso).getTime()+3*3600000);
  const today=new Date(new Date().getTime()+3*3600000);
  const yest=new Date(today-86400000);
  const ds=d.toISOString().slice(0,10),ts=today.toISOString().slice(0,10),ys=yest.toISOString().slice(0,10);
  const label=ds===ts?'Bugün':ds===ys?'Dün':`${ds} ${DAYS[d.getUTCDay()]}`;
  return`${label} ${d.toISOString().slice(11,16)}`;
}

async function workerGet(params) {
  const u = new URL(WORKER);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`worker ${r.status}`);
  return r.json();
}

async function kvGet(slug){
  const r=await fetch(`${WORKER}?get=${slug}`);
  if(r.status===404)return null;
  if(!r.ok)throw new Error(`kv ${r.status}`);
  return r.json();
}

async function kvSet(slug,data){
  await fetch(`${WORKER}?set=${slug}`,{method:'POST',body:JSON.stringify(data)});
}

async function loadBrands() {
  try {
    const res = await fetch(`${WORKER}?brands`).then(r=>r.json());
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
    <td>${u.sku?`<a href="${CRAWLER}${encodeURIComponent(u.urun_linki)}" target="_blank" style="color:inherit;text-decoration:none;cursor:pointer">${u.sku}</a>`:'-'}</td>
    <td>${u.marka_adi||'-'}</td>
    <td><span class="urun-adi" style="cursor:pointer" title="Kopyala" onclick="navigator.clipboard.writeText(this.textContent.trim())">${u.urun_adi||'-'}${u.varyant_adi?` · ${u.varyant_adi}`:''}</span></td>
    <td>${u.kategori_adi||'-'}</td>
    <td class="price ${out}" style="cursor:pointer" onclick="navigator.clipboard.writeText(this.closest('tr').dataset.sku||'')">${u.stok??'-'}</td>
    <td class="aide-stok ts-col">-</td>
    <td class="ts-stok ts-col">-</td>
    <td class="price ${out}">${u.guncel_fiyat?`<a href="${u.urun_linki}" target="_blank" style="color:inherit;text-decoration:none;cursor:pointer">${u.guncel_fiyat}</a>`:'-'}</td>
    <td class="price ${out}">${u.usd_kdv_haric||'-'}</td>
    <td class="price ${out}">${u.eur_kdv_haric||'-'}</td>
    <td class="ts-fiyat ts-col">-</td>
    <td class="fiyat-fark ts-col">-</td>
    <td>${u.ean||'- '}</td>
    <td class="ts-barkod ts-col">-</td>`;
  return tr;
}

function appendRow(u, i) { tbody.appendChild(makeRow(u, i)); }
function renderTable(urunler) {
  tbody.innerHTML = '';
  urunler.forEach((u,i) => appendRow(u, i));
  $('col-toggles').classList.remove('hidden');
  applyColVisibility();
  if(tsoftData || aideData) applyMatching(urunler);
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
  await kvSet(brand, json); $('brand-title').innerHTML=`${activeBrand.charAt(0).toUpperCase()+activeBrand.slice(1)} <span class="brand-meta">· ${urunler.length} ürün · Son Güncelleme: ${fmtFull(json.guncelleme)}</span>`; setStatus('tamamlandı');
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

  const json = { ...data, urunler, guncelleme: new Date().toISOString() }; if (newLinks.length) showNotice(brand, newLinks, json);
  else { await kvSet(brand, json);  setStatus('güncellendi — KV kaydedildi'); }
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
    json.guncelleme = new Date().toISOString(); brandData[brand]=json;
    await kvSet(brand, json);
    setStatus('yeni ürünler KV\'ye kaydedildi');
  };
}

async function openBrand(slug, btn) {
  document.querySelectorAll('.brand-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  activeBrand = slug;
  toolbar.classList.remove('hidden');
  tableWrap.classList.remove('hidden');
  notice.classList.add('hidden');
  const bt=$('brand-title'); bt.textContent=slug.charAt(0).toUpperCase()+slug.slice(1);
  tbody.innerHTML = ''; setStatus('yükleniyor...');

  const data = await kvGet(slug);
  if (!data) {
    $('btn-init').classList.remove('hidden');
    setStatus('KV\'de yok — "ilk çekim" yapın');
    brandData[slug] = null;
  } else {
    $('btn-init').classList.add('hidden'); brandData[slug]=data;
    renderTable(data.urunler); $('brand-title').innerHTML=`${slug.charAt(0).toUpperCase()+slug.slice(1)} <span class="brand-meta">· ${data.urunler.length} ürün · Son Güncelleme: ${fmtFull(data.guncelleme)}</span>`; setStatus('');
  }
  
}

$('btn-refresh').onclick = async () => {
  if (!activeBrand||!brandData[activeBrand]) { setStatus('önce ilk çekimi yapın'); return; }
  await refreshBrand(activeBrand, JSON.parse(JSON.stringify(brandData[activeBrand])));
};
$('btn-init').onclick = async () => {
  if (!activeBrand) return;
  $('btn-init').classList.add('hidden');
  brandData[activeBrand] = await initBrandData(activeBrand);
};

loadBrands().then(renderBrands);

(async () => {
  try {
    const ts = await kvGet('tsoft:data');
    if(ts?.text) { loadTsoft(ts.text, true); const el=$('tsoft-status'); if(el) el.textContent = `✓ ${tsoftData.rows.length} ürün · ${ts.date||''}`; }
  } catch {}
  try {
    const ai = await kvGet('aide:data');
    if(ai?.text) { parseAide(ai.text, true); const el=$('aide-status'); if(el) el.textContent = `✓ ${aideData.size} kod · ${ai.date||''}`; }
  } catch {}
})();

const AIDE_AMBARS = new Set(['sesci magaza','sescibaba']);
let tsoftData = null;
let aideData = null; 

const BRAND_ALIAS = {
  'warmaudio':'warm audio','allenheath':'allen heath','rodex':'rode',
  'denondj':'denon dj','fenderstudio':'fender studio','universalaudio':'universal audio',
  'rupertnevedesigns':'rupert neve','marantzprofessional':'marantz'
};
function normBrand(s) {
  s=(s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[øØ]/g,'o').toLowerCase().replace(/[^a-z0-9]+/g,'').trim();
  return BRAND_ALIAS[s]||s;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const delim = lines[0].includes(';') ? ';' : ',';
  const hdr = lines[0].split(delim).map(h=>h.replace(/^\uFEFF/,'').trim());
  return lines.slice(1).filter(Boolean).map(l => {
    const vals = l.split(delim);
    const o = {};
    hdr.forEach((h,i) => o[h] = (vals[i]||'').trim());
    return o;
  });
}

function loadTsoft(text, skipKV) {
  const rows = parseCSV(text);
  tsoftData = { byBarkod: new Map(), byWs: new Map(), bySup: new Map(), rows };
  rows.forEach(r => {
    const b = (r['Barkod']||'').trim();
    const ws = (r['Web Servis Kodu']||'').trim();
    const sup = (r['Tedarikçi Ürün Kodu']||'').trim();
    if(b) tsoftData.byBarkod.set(b, r);
    if(ws) tsoftData.byWs.set(ws, r);
    if(sup) tsoftData.bySup.set(sup, r);
  });
  const date = fmtFull(new Date().toISOString());
  if(!skipKV) {
    kvSet('tsoft:data', {text, date});
  }
  if(activeBrand && brandData[activeBrand]) applyMatching(brandData[activeBrand].urunler);
}

function parseAide(text, skipKV) {
  aideData = new Map();
  const lines = text.split(/\r?\n/);
  for(const line of lines) {
    const parts = line.split('\t').map(s=>s.trim());
    if(parts.length < 6) continue;
    const ambar = (parts[5]||'').toLowerCase().trim();
    if(!AIDE_AMBARS.has(ambar)) continue;
    const stokKodu = (parts[2]||'').trim().toUpperCase();
    const stok = parseFloat((parts[4]||'0').replace(',','.')) || 0;
    if(!stokKodu) continue;
    aideData.set(stokKodu, (aideData.get(stokKodu)||0) + stok);
    const alt = stokKodu.replace(/^0+(?=\d)/,'');
    if(alt !== stokKodu) aideData.set(alt, (aideData.get(alt)||0) + stok);
  }
  const date = fmtFull(new Date().toISOString());
  if(!skipKV) {
    kvSet('aide:data', {text, date});
  }
  if(activeBrand && brandData[activeBrand]) applyMatching(brandData[activeBrand].urunler);
}

function matchTsoft(u, eanUnique) {
  if(!tsoftData) return null;
  const isVariant = !!u.varyant_adi;
  if(!isVariant || eanUnique) {
    const eans = (u.ean||'').split(/[^0-9]+/).filter(e=>e.length>=8);
    for(const e of eans) {
      const r = tsoftData.byBarkod.get(e) || tsoftData.byBarkod.get(e.replace(/^0+/,''));
      if(r) return r;
    }
    if(u.sku) return tsoftData.byWs.get(u.sku) || tsoftData.bySup.get(u.sku) || null;
    return null;
  }
  if(u.sku) return tsoftData.byWs.get(u.sku) || tsoftData.bySup.get(u.sku) || null;
  return null;
}

function aideStok(tsoftRow) {
  if(!aideData || !tsoftRow) return null;
  const sup = (tsoftRow['Tedarikçi Ürün Kodu']||'').trim().toUpperCase();
  if(!sup) return null;
  const v = aideData.get(sup) ?? aideData.get(sup.replace(/^0+/,''));
  return v != null ? v : null;
}

function applyMatching(urunler) {
  if(!tsoftData && !aideData) return;
  const brand = activeBrand ? normBrand(activeBrand) : '';
  const rows = [...tbody.querySelectorAll('tr[data-link]')];
  const compelOnly = [], tsoftMatched = new Set();

  // Varyantlar arasında paylaşılan (tekrarlı) EAN'ları tespit et — bunları eşleşmede kullanma
  const eanUsageCount = {};
  urunler.forEach(u => {
    if(!u.varyant_adi) return;
    const ean = (u.ean||'').trim();
    if(ean) eanUsageCount[ean] = (eanUsageCount[ean] || 0) + 1;
  });
  const sharedEans = new Set(Object.keys(eanUsageCount).filter(e => eanUsageCount[e] > 1));

  rows.forEach((tr, i) => {
    const u = urunler[i];
    if(!u) return;
    const eanUnique = !u.varyant_adi || !(sharedEans.has((u.ean||'').trim()));
    const ts = matchTsoft(u, eanUnique);
    const aide = ts ? aideStok(ts) : null;

    const tsCell = tr.querySelector('.ts-fiyat');
    const tsStokCell = tr.querySelector('.ts-stok');
    const aideCell = tr.querySelector('.aide-stok');
    if(!tsCell||!tsStokCell||!aideCell) return;

    if(ts) {
      const barkodCell = tr.querySelector('.ts-barkod');
      if(barkodCell) barkodCell.textContent = ts['Barkod']||'-';
      const tsFiyatRaw = ts['KDV Dahil Fiyat']||'';
      const tsSlug = (ts['SEO Link']||'').trim();
      const tsUrl = tsSlug ? `https://www.sescibaba.com/${tsSlug}` : null;
      if(tsUrl) {
        tsCell.innerHTML = `<a href="${tsUrl}" target="_blank" style="color:inherit;text-decoration:none;cursor:pointer">${tsFiyatRaw||'-'}</a>`;
      } else {
        tsCell.textContent = tsFiyatRaw||'-';
      }
      const tsStok = parseFloat((ts['Stok']||'0').toString().replace(',','.')) || 0;
      const tsSup = ts['Tedarikçi Ürün Kodu']||'';
      tsStokCell.textContent = ts['Stok']||'0';
      tsStokCell.style.cursor = 'pointer';
      tsStokCell.onclick = () => navigator.clipboard.writeText(tsSup);
      aideCell.textContent = aide!=null?aide:'-';
      const compelStok = typeof u.stok === 'number' ? u.stok : parseFloat(u.stok) || 0;
      const aideStokVal = aide != null ? aide : 0;
      // T-Soft stok uyarısı: compel veya aide > 0 ama tsoft <= 0  VEYA  tsoft > 0 ama compel ve aide = 0
      const tsStokUyari = (compelStok > 0 || aideStokVal > 0) && tsStok <= 0
                       || tsStok > 0 && compelStok <= 0 && aideStokVal <= 0;
      tsStokCell.style.color = tsStokUyari ? '#ff6666' : '';
      tsStokCell.style.fontWeight = tsStokUyari ? 'bold' : '';
      tsStokCell.style.textDecoration = '';

      // Fiyat farkı
      const farkCell = tr.querySelector('.fiyat-fark');
      if(farkCell) {
        const compelTL = tr.querySelectorAll('td')[9]?.textContent||'';
        const tsFiyat = parseFloat(tsFiyatRaw.replace(/\./g,'').replace(',','.'))||0;
        const compelFiyat = parseFloat(compelTL.replace(/[^0-9.,]/g,'').replace(/\./g,'').replace(',','.'))||0;
        if(tsFiyat && compelFiyat) {
          const pct = ((tsFiyat - compelFiyat) / compelFiyat * 100);
          const abs = Math.abs(pct).toFixed(1).replace('.',',');
          farkCell.textContent = pct > 0 ? `%${abs} ↑` : `%${abs} ↓`;
          if(pct > 0) {
            const t = Math.min(pct / 20, 1);
            const rv = Math.round(17 + (255-17)*t).toString(16).padStart(2,'0');
            const gv = Math.round(17 + (102-17)*t).toString(16).padStart(2,'0');
            farkCell.style.color = `#${rv}${gv}${gv}`;
            farkCell.style.fontWeight = 'bold';
          } else {
            farkCell.style.color = '#111';
            farkCell.style.fontWeight = '';
          }
        } else { farkCell.textContent = '-'; }
      }
      tr.classList.add('match-ok'); tr.classList.remove('match-none');
      tsoftMatched.add(ts['Web Servis Kodu']||''); tsoftMatched.add(ts['Tedarikçi Ürün Kodu']||'');
    } else {
      tr.querySelector('.ts-barkod') && (tr.querySelector('.ts-barkod').textContent='-');
      tsCell.textContent='-'; tsStokCell.textContent='-'; aideCell.textContent=aide!=null?aide:'-';
      tr.classList.add('match-none'); tr.classList.remove('match-ok');
      compelOnly.push(u);
    }
  });

  // Eşleşmeyen T-Soft ürünleri (seçili marka)
  const tsoftOnly = tsoftData ? tsoftData.rows.filter(r => {
    const aktif = (r['Aktif']||'').toLowerCase().trim();
    if(aktif==='false'||aktif==='0') return false;
    const bn = normBrand(r['Marka']||'');
    if(bn !== brand) return false;
    const ws = r['Web Servis Kodu']||'', sup = r['Tedarikçi Ürün Kodu']||'';
    return !tsoftMatched.has(ws) && !tsoftMatched.has(sup);
  }) : [];

  // T-Soft fiyat format
  tbody.querySelectorAll('.ts-fiyat').forEach(td => {
    const a = td.querySelector('a');
    if(a) { if(a.textContent && a.textContent !== '-') a.textContent = fmtPrice(a.textContent); }
    else { if(td.textContent && td.textContent !== '-') td.textContent = fmtPrice(td.textContent); }
  });
  renderUnmatched(compelOnly, tsoftOnly);
  applyColVisibility();
}

function renderUnmatched(compelOnly, tsoftOnly) {
  const tt = $('tbody-tsoft-only');
  tt.innerHTML = '';
  tsoftOnly.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${r['Tedarikçi Ürün Kodu']||'-'}</td><td style="text-align:left">${r['Ürün Adı']||'-'}</td><td>${r['Stok']||'-'}</td><td>${fmtPrice(r['KDV Dahil Fiyat']||'')}</td><td>${r['Barkod']||'-'}</td>`;
    tt.appendChild(tr);
  });
  $('unmatched').classList.toggle('hidden', !tsoftOnly.length);
}


function applyKutuHasarli() {
  const chk = document.getElementById('chk-kutu-hasarli');
  if(!chk) return;
  const show = chk.checked;
  tbody.querySelectorAll('tr[data-link]').forEach(tr => {
    const ad = tr.querySelector('.urun-adi');
    if(ad && /hasar/i.test(ad.textContent)) {
      tr.style.display = show ? '' : 'none';
    }
  });
}
function applyColVisibility() {
  const checks = document.querySelectorAll('#col-toggles input[data-col]');
  const table = $('main-table');
  if(!table) return;
  checks.forEach(chk => {
    const col = parseInt(chk.dataset.col);
    const visible = chk.checked;
    table.querySelectorAll(`tr > *:nth-child(${col+1})`).forEach(cell => {
      cell.style.display = visible ? '' : 'none';
    });
  });
  applyKutuHasarli();
}

$('tsoft-file').onchange = async e => {
  const file = e.target.files[0]; if(!file) return;
  loadTsoft(await file.text());
};

let dataModalMode = null;
function openDataModal(mode, existingDate) {
  dataModalMode = mode;
  const modal = $('data-modal');
  $('data-modal-title').textContent = mode === 'tsoft' ? 'T-Soft Verisi' : 'Aide Verisi';
  const existBtn = $('data-modal-existing');
  if(existingDate) {
    existBtn.textContent = `${existingDate} Tarihli veriyi yükle`;
    existBtn.style.display = '';
  } else {
    existBtn.style.display = 'none';
  }
  $('data-modal-new').textContent = mode === 'tsoft' ? 'Yeni CSV yükle' : 'Yeni yapıştır';
  modal.classList.remove('hidden');
}

$('data-modal-cancel').onclick = () => $('data-modal').classList.add('hidden');

$('data-modal-existing').onclick = async () => {
  $('data-modal').classList.add('hidden');
  try {
    if(dataModalMode === 'tsoft') {
      const ts = await kvGet('tsoft:data');
      if(ts?.text) { loadTsoft(ts.text, true); const el=$('tsoft-status'); if(el) el.textContent = `✓ ${tsoftData.rows.length} ürün · ${ts.date}`; }
    } else {
      const ai = await kvGet('aide:data');
      if(ai?.text) { parseAide(ai.text, true); const el=$('aide-status'); if(el) el.textContent = `✓ ${aideData.size} kod · ${ai.date}`; }
    }
  } catch(e) { alert('KV hatası: ' + e.message); }
};

$('data-modal-new').onclick = () => {
  $('data-modal').classList.add('hidden');
  if(dataModalMode === 'tsoft') $('tsoft-file').click();
  else $('aide-modal').classList.remove('hidden');
};

$('tsoft-btn').onclick = async () => {
  try { const ts = await kvGet('tsoft:data'); openDataModal('tsoft', ts?.date||null); }
  catch { openDataModal('tsoft', null); }
};

$('aide-btn').onclick = async () => {
  try { const ai = await kvGet('aide:data'); openDataModal('aide', ai?.date||null); }
  catch { openDataModal('aide', null); }
};

$('aide-close').onclick = () => $('aide-modal').classList.add('hidden');
$('aide-load').onclick = () => {
  const txt = $('aide-paste').value;
  if(txt.trim()) { parseAide(txt); $('aide-modal').classList.add('hidden'); }
};

document.querySelectorAll('#col-toggles input').forEach(chk => {
  chk.onchange = applyColVisibility;
});

function fmtPrice(v) {
  if(!v||v==='-') return '-';
  const n = parseFloat(String(v).replace(/\./g,'').replace(',','.'));
  if(!Number.isFinite(n)) return v;
  return n.toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

let sortState = { col: null, asc: true };
let origOrder = [];

function parseNum(s) {
  if(!s||s==='-') return -Infinity;
  return parseFloat(String(s).replace(/\./g,'').replace(',','.')) || 0;
}

function sortTable(col) {
  const rows = [...tbody.querySelectorAll('tr[data-link]')];
  if(!origOrder.length) origOrder = [...rows];

  if(col === 'idx') {
    origOrder.forEach(r => tbody.appendChild(r));
    sortState = { col: null, asc: true };
    document.querySelectorAll('.sort-btn').forEach(b => {
      b.dataset.sort !== 'idx' && (b.innerHTML = b.innerHTML.replace(/[↑↓↕]/g,'↕'));
    });
    return;
  }

  const asc = sortState.col === col ? !sortState.asc : true;
  sortState = { col, asc };

  const getVal = tr => {
    const cells = tr.querySelectorAll('td');
    if(col==='stok') return parseNum(cells[6]?.textContent);
    if(col==='tl')   return parseNum(cells[9]?.textContent);
    return 0;
  };

  rows.sort((a,b) => asc ? getVal(a)-getVal(b) : getVal(b)-getVal(a));
  rows.forEach(r => tbody.appendChild(r));

  document.querySelectorAll('.sort-btn').forEach(b => {
    if(b.dataset.sort==='idx') return;
    const label = b.dataset.sort==='stok'?'Stok':'TL';
    b.innerHTML = `${label} ${b.dataset.sort===col?(asc?'↑':'↓'):'↕'}`;
  });
}

document.getElementById('chk-kutu-hasarli')?.addEventListener('change', applyKutuHasarli);

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.onclick = () => sortTable(btn.dataset.sort);
});
