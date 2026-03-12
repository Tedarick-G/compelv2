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

export function splitDelimitedLine(line, delim) {
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
    } else {
      cur += ch;
    }
  }

  out.push(cur);
  return out.map(v => v.trim());
}

export function parseDelimited(text, opt = {}) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const startLineIndex =
    Number.isInteger(opt.startLineIndex) && opt.startLineIndex >= 0
      ? opt.startLineIndex
      : lines.findIndex(x => T(x));

  if (startLineIndex < 0) return { hdr: [], rows: [] };

  const first = lines[startLineIndex] || "";
  const delim = opt.delimiter || detectDelimiter(first);

  let hdr = null;
  const rows = [];

  for (let i = startLineIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!T(line)) continue;

    const vals = splitDelimitedLine(line, delim);

    if (!hdr) {
      hdr = vals;
      continue;
    }

    const obj = {};
    for (let j = 0; j < hdr.length; j++) obj[hdr[j]] = vals[j] ?? "";
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

export function findDelimitedHeaderLineIndex(text, requiredGroups = []) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = T(lines[i]);
    if (!line) continue;

    const delim = detectDelimiter(line);
    const cells = splitDelimitedLine(line, delim).map(normHeader);
    if (!cells.length) continue;

    const ok = requiredGroups.every(group =>
      group.some(w => cells.includes(normHeader(w)))
    );

    if (ok) return i;
  }

  return -1;
}

export function headersFromRows(rows, preferred = []) {
  const out = [];
  const seen = new Set();
  const allRows = Array.isArray(rows) ? rows : [];

  const add = h => {
    const k = T(h);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };

  for (const h of preferred) {
    if (allRows.some(r => Object.prototype.hasOwnProperty.call(r || {}, h))) add(h);
  }

  for (const row of allRows) {
    for (const k of Object.keys(row || {})) add(k);
  }

  return out;
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
    /^(Tümü|Sesçibaba Logo|Şirketler|Siparişler|Onay Bekleyen|Sipariş Listesi|İade Listesi|Sesçibaba Stokları|Stok Listesi|Ara|Previous|Next|Showing\b.*|\d+|E-Commerce Management\b.*|Powered by\b.*)$/i.test(s);

  let headerCols = null;

  for (let raw of lines) {
    let line = T(raw.replace(/\u00A0/g, " "));
    if (skip(line)) continue;
    if (!line.includes("\t")) continue;

    const cells = line.split("\t").map(x => T(x));
    const vals = cells.filter(Boolean);
    if (!vals.length) continue;

    const isHeader =
      vals.some(x => normHeader(x) === normHeader("Marka")) &&
      vals.some(x => [
        "Stok Kodu",
        "StokKodu",
        "STOK KODU",
        "Stock Code",
      ].some(w => normHeader(x) === normHeader(w)));

    if (isHeader) {
      headerCols = vals;
      continue;
    }

    if (headerCols) {
      const obj = {};
      for (let i = 0; i < headerCols.length; i++) obj[headerCols[i]] = vals[i] ?? "";

      const codeCol = pickColumn(obj, ["Stok Kodu", "StokKodu", "STOK KODU", "Stock Code"]);
      if (!codeCol || !T(obj[codeCol])) continue;

      out.push(obj);
      continue;
    }

    if (vals.length < 6) continue;

    let marka = "", model = "", stokKodu = "", aciklama = "", stok = "", ambar = "", firma = "";

    if (vals.length === 6) {
      [marka, model, stokKodu, aciklama, stok, ambar] = vals;
    } else if (vals.length === 7) {
      [marka, model, stokKodu, aciklama, stok, ambar, firma] = vals;
    } else {
      marka = vals[0];
      firma = vals.at(-1) || "";
      ambar = vals.at(-2) || "";
      stok = vals.at(-3) || "";
      const mid = vals.slice(1, -3);
      if (mid.length < 3) continue;
      model = mid.slice(0, -2).join(" ");
      stokKodu = mid.at(-2) || "";
      aciklama = mid.at(-1) || "";
    }

    if (!stokKodu) continue;

    const row = {
      "Marka": marka,
      "Model": model,
      "Stok Kodu": stokKodu,
      "Açıklama": aciklama,
      "Stok": stok,
      "Ambar": ambar,
    };

    if (firma) row["Firma"] = firma;
    out.push(row);
  }

  return out;
}
