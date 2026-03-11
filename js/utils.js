export const TR = "tr-TR";

export const T = s => String(s ?? "").trim();

export const esc = s =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export function detectDelimiter(h) {
  const c = ["\t", ";", ",", "|"];
  let b = c[0], m = -1;
  for (const d of c) {
    const k = String(h || "").split(d).length - 1;
    if (k > m) { m = k; b = d; }
  }
  return b;
}

export function parseDelimited(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const first = lines.find(x => x.trim()) || "";
  const delim = detectDelimiter(first);

  const split = line => {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (!q && ch === delim) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map(v => v.trim());
  };

  let hdr = null, rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!hdr) { hdr = split(line); continue; }
    const vals = split(line), obj = {};
    for (let i = 0; i < hdr.length; i++) obj[hdr[i]] = vals[i] ?? "";
    rows.push(obj);
  }
  return { hdr: hdr || [], rows };
}

export const normHeader = h => T(h).toLocaleUpperCase(TR).replace(/\s+/g, " ");

export function pickColumn(row, wanted) {
  const map = new Map(Object.keys(row || {}).map(k => [normHeader(k), k]));
  for (const w of wanted) {
    const k = map.get(normHeader(w));
    if (k) return k;
  }
  return null;
}

export const readFileText = f =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsText(f, "UTF-8");
  });

export const ymdToDmy = s => {
  const m = T(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : T(s);
};

function rawNorm(s) {
  let x = T(s).replace(/\u00A0/g, " ");
  if (!x) return "";
  try { x = x.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); } catch {}
  return x
    .toLocaleUpperCase(TR)
    .replace(/\u0130/g, "I")
    .replace(/\u0131/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/Ø/g, "O")
    .replace(/ø/g, "o")
    .replace(/&/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const compact = s => T(s).replace(/\s+/g, "");

const ALIAS = new Map([
  ["RODE", "RODE"],
  ["RODEX", "RODE"],
  ["DENON", "DENON DJ"],
  ["DENONDJ", "DENON DJ"],
  ["FENDER", "FENDER STUDIO"],
  ["FENDERSTUDIO", "FENDER STUDIO"],
  ["UNIVERSAL", "UNIVERSAL AUDIO"],
  ["UNIVERSALAUDIO", "UNIVERSAL AUDIO"],
  ["WARMAUDIO", "WARM AUDIO"],
  ["BEYER", "BEYERDYNAMIC"],
  ["BEYERDYNAMIC", "BEYERDYNAMIC"],
  ["ALLENHEATH", "ALLEN HEATH"],
  ["MARANTZPROFESSIONAL", "MARANTZ"],
  ["RUPERTNEVEDESIGNS", "RUPERT NEVE"],
]);

export function normBrand(s) {
  const k = rawNorm(s);
  return k ? (ALIAS.get(compact(k)) || k) : "";
}

export function filterBySelectedBrand(rows, getBrand, selectedBrandNormSet) {
  if (!(selectedBrandNormSet instanceof Set) || !selectedBrandNormSet.size) return rows || [];
  return (rows || []).filter(r => selectedBrandNormSet.has(normBrand(getBrand(r))));
}

export function depotFromNoisyPaste(text) {
  const out = [];
  const lines = String(text || "").split(/\r\n|\r|\n/);
  const skip = s =>
    !s ||
    /^(Tümü|Sesçibaba Logo|Şirketler|Siparişler|Onay Bekleyen|Sipariş Listesi|İade Listesi|Sesçibaba Stokları|Stok Listesi|Ara|Previous|Next|Showing\b.*|\d+)$/i.test(s);

  for (let l of lines) {
    l = T(l.replace(/\u00A0/g, " "));
    if (skip(l) || !l.includes("\t")) continue;

    const a = l.split("\t").map(x => T(x)).filter(Boolean);
    if (a.length < 6) continue;

    let marka = "", model = "", stokKodu = "", aciklama = "", stok = "", ambar = "";

    if (a.length === 6) {
      [marka, model, stokKodu, aciklama, stok, ambar] = a;
    } else {
      marka = a[0];
      ambar = a.at(-2) || "";
      stok = a.at(-3) || "";
      const mid = a.slice(1, -3);
      if (mid.length < 3) continue;
      model = mid.slice(0, -2).join(" ");
      stokKodu = mid.at(-2) || "";
      aciklama = mid.at(-1) || "";
    }

    if (!stokKodu) continue;

    out.push({
      "Marka": marka,
      "Model": model,
      "Stok Kodu": stokKodu,
      "Açıklama": aciklama,
      "Stok": stok,
      "Ambar": ambar,
    });
  }

  return out;
}
