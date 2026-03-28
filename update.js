const WORKER = process.env.WORKER; // compelkv.tvkapora.workers.dev

const DELAY = 2500;
const FIELDS = 'urun_linki,sku,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok,varyant_adi';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function collectLinks(brand) {
  const seen = new Set(), all = [];
  let page = 1;
  while(true) {
    const res = await get(`${WORKER}?u=${brand}&page=${page}&fields=urun_linki`);
    const links = (res.urunler||[]).map(u=>u.urun_linki).filter(Boolean);
    if (!links.length) break;
    let added = 0;
    links.forEach(l => { if(!seen.has(l)){ seen.add(l); all.push(l); added++; } });
    if (!added) break;
    page++;
    await sleep(DELAY);
  }
  return all;
}

async function updateBrand(brand) {
  console.log(`→ ${brand}`);
  // KV'den mevcut data
  const kvRes = await fetch(`${WORKER}?get=${brand}`);
  if (kvRes.status === 404) { console.log(`  KV'de yok, atlanıyor`); return; }
  const data = await kvRes.json();
  const urunler = data.urunler || [];

  // Yeni linkler
  const liveLinks = await collectLinks(brand);
  const linkSet = new Set(urunler.map(u=>u.urun_linki));
  const newLinks = liveLinks.filter(l=>!linkSet.has(l));

  // Fiyat/stok güncelle
  for (let i = 0; i < urunler.length; i++) {
    const u = urunler[i];
    try {
      const res = await get(`${WORKER}?u=${encodeURIComponent(u.urun_linki)}&fields=${FIELDS}`);
      const rs = Array.isArray(res)?res:[res];
      const match = u.varyant_adi ? rs.find(r=>r.sku===u.sku)||rs[0] : rs[0];
      if (match&&!match.hata) {
        u.guncel_fiyat=match.guncel_fiyat;
        u.usd_kdv_haric=match.usd_kdv_haric;
        u.eur_kdv_haric=match.eur_kdv_haric;
        u.stok=match.stok;
      }
    } catch(e) { console.warn(`  hata: ${e.message}`); }
    await sleep(DELAY);
  }

  // Yeni ürünler
  if (newLinks.length) {
    console.log(`  ${newLinks.length} yeni ürün`);
    const allFields = 'urun_linki,kapak_gorsel,urun_adi,varyant_adi,sku,ean,marka_adi,kategori_adi,guncel_fiyat,usd_kdv_haric,eur_kdv_haric,stok';
    for (const link of newLinks) {
      try {
        const res = await get(`${WORKER}?u=${encodeURIComponent(link)}&fields=${allFields}`);
        const rows = Array.isArray(res)?res:[res];
        rows.forEach(r=>{ if(r&&!r.hata) urunler.push(r); });
      } catch {}
      await sleep(DELAY);
    }
  }

  const json = { ...data, urunler, guncelleme: new Date().toISOString() };
  await fetch(`${WORKER}?set=${brand}`, { method:'POST', body: JSON.stringify(json) });
  console.log(`  ✓ ${urunler.length} ürün kaydedildi`);
}

async function main() {
  const res = await get(`${WORKER}?brands`);
  const brands = res.brands || [];
  console.log(`${brands.length} marka güncellenecek`);
  for (const b of brands) {
    await updateBrand(b.slug);
    await sleep(3000);
  }
  console.log('Tamamlandı');
}

main().catch(e => { console.error(e); process.exit(1); });
