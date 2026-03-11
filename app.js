const API_BASE="https://doretest.tvkapora.workers.dev";
const TR="tr-TR";
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const T=s=>String(s??"").trim();
const D=s=>String(s??"").replace(/[^\d]/g,"");
const esc=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const stockNum=(raw,src="")=>{
  const s=T(raw); if(!s) return 0;
  const up=s.toLocaleUpperCase(TR);
  if(src==="compel"){
    if(/(STOK\s*YOK|YOK|TÜKEND[İI]|OUT\s*OF\s*STOCK|NONE|N\/A|NA)/i.test(up)) return 0;
    if(/(VAR|STOKTA|MEVCUT|AVAILABLE|IN\s*STOCK|EVET|YES|TRUE)/i.test(up)) return 1;
  }
  let t=s;
  if(t.includes(".")&&t.includes(",")) t=t.replace(/\./g,"").replace(/,/g,".");
  else t=t.replace(/,/g,".");
  t=t.replace(/[^0-9.\-]/g,"");
  const n=parseFloat(t);
  return Number.isFinite(n)?n:0;
};
const inStock=(raw,src)=>stockNum(raw,src)>0;

function detectDelimiter(h){const c=["\t",";",",","|"];let b=c[0],m=-1;for(const d of c){const k=h.split(d).length-1;if(k>m){m=k;b=d}}return b}
function parseDelimited(text){
  const lines=String(text||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
  const first=lines.find(x=>x.trim())||"",delim=detectDelimiter(first);
  const split=line=>{
    const out=[];let cur="",q=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}
      else if(!q&&ch===delim){out.push(cur);cur=""}
      else cur+=ch;
    }
    out.push(cur);
    return out.map(v=>v.trim());
  };
  let hdr=null,rows=[];
  for(const line of lines){
    if(!line.trim()) continue;
    if(!hdr){hdr=split(line);continue}
    const vals=split(line),obj={};
    for(let i=0;i<hdr.length;i++) obj[hdr[i]]=vals[i]??"";
    rows.push(obj);
  }
  return {hdr:hdr||[],rows};
}
const normHeader=h=>T(h).toLocaleUpperCase(TR).replace(/\s+/g," ");
function pickColumn(row,wanted){
  const map=new Map(Object.keys(row||{}).map(k=>[normHeader(k),k]));
  for(const w of wanted){const k=map.get(normHeader(w)); if(k) return k}
  return null;
}
const readFileText=f=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(fr.error);fr.readAsText(f,"UTF-8")});

function rawNorm(s){
  let x=T(s).replace(/\u00A0/g," ");
  if(!x) return "";
  try{x=x.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")}catch{}
  return x.toLocaleUpperCase(TR)
    .replace(/\u0130/g,"I").replace(/\u0131/g,"I")
    .replace(/Ğ/g,"G").replace(/Ü/g,"U").replace(/Ş/g,"S").replace(/Ö/g,"O").replace(/Ç/g,"C")
    .replace(/Ø/g,"O").replace(/ø/g,"o")
    .replace(/&/g," ")
    .replace(/[^A-Z0-9]+/g," ")
    .trim().replace(/\s+/g," ");
}
const compact=s=>T(s).replace(/\s+/g,"");
const ALIAS=new Map([
  ["RODE","RODE"],["RODEX","RODE"],["DENON","DENON DJ"],["DENONDJ","DENON DJ"],
  ["FENDER","FENDER STUDIO"],["FENDERSTUDIO","FENDER STUDIO"],["UNIVERSAL","UNIVERSAL AUDIO"],["UNIVERSALAUDIO","UNIVERSAL AUDIO"],
  ["WARMAUDIO","WARM AUDIO"],["BEYER","BEYERDYNAMIC"],["BEYERDYNAMIC","BEYERDYNAMIC"],["ALLENHEATH","ALLEN HEATH"],
  ["MARANTZPROFESSIONAL","MARANTZ"],["RUPERTNEVEDESIGNS","RUPERT NEVE"]
]);
function normBrand(s){const k=rawNorm(s); return k?(ALIAS.get(compact(k))||k):""}
function normName(s){
  let x=rawNorm(s);
  x=x.replace(/\b(RENK|COLOR|COLOUR|SIZE|BOYUT|EBAT|MODEL)\b/g," ").replace(/\s+/g," ").trim();
  return x;
}
function parseEans(v){
  const a=String(v??"").split(/[^0-9]+/g).map(D).filter(x=>x.length>=8),set=new Set();
  for(const x of a){set.add(x); if(x.startsWith("0")&&x.length>1) set.add(x.slice(1)); else set.add("0"+x)}
  return [...set];
}
const codeNorm=s=>T(s).replace(/\u00A0/g," ").replace(/\s+/g," ").toLocaleUpperCase(TR);
const codeAlt=s=>{const k=codeNorm(s); return /^[0-9]+$/.test(k)?k.replace(/^0+(?=\d)/,""):k};

const state={
  brands:[],
  selBrands:new Set(),
  meta:null,
  selDaily:{tsoft:"",aide:""},
  readCache:{date:"",pass:""}
};

const setStatus=t=>$("#status").textContent=T(t);
const ymdToDmy=s=>{const m=T(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}.${m[2]}.${m[1]}`:s};

async function api(path,opt={}){const r=await fetch(API_BASE+path,opt);const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t} if(!r.ok) throw new Error(j?.error||t||`HTTP ${r.status}`); return j}
async function loadBrands(){
  const data=await api("/api/brands");
  state.brands=Array.isArray(data)?data:[];
  renderBrandMenu();
}
async function loadMeta(){
  try{state.meta=await api("/api/daily/meta")}catch{state.meta=null}
  paintDailyBtns();
}
function pickHM(obj){return T(obj?.hm||obj?.HM||obj?.time||obj?.saat||"")}
function todayPick(kind){
  const t=state.meta?.today?.[kind]; if(t?.exists) return {ymd:state.meta.today.ymd,label:`${kind==="tsoft"?"T-Soft":"Aide"} ${ymdToDmy(state.meta.today.ymd)} Tarihli Veri`,hm:pickHM(t)};
  const y=state.meta?.yesterday?.[kind]; if(y?.exists) return {ymd:state.meta.yesterday.ymd,label:`${kind==="tsoft"?"T-Soft":"Aide"} ${state.meta.yesterday.dmy} Tarihli Veri`,hm:""};
  return null;
}
function paintDailyBtns(){
  for(const kind of ["tsoft","aide"]){
    const btn=$(`#${kind}Daily`);
    const pick=todayPick(kind);
    btn.disabled=!pick;
    btn.textContent=pick?(state.selDaily[kind]===pick.ymd?`${kind==="tsoft"?"T-Soft":"Aide"} Seçildi`:(pick.hm?`${kind==="tsoft"?"T-Soft":"Aide"} ${pick.hm}`:pick.label)):`${kind==="tsoft"?"T-Soft":"Aide"} Veri Yok`;
  }
}
function toggleDaily(kind){
  const pick=todayPick(kind); if(!pick) return;
  state.selDaily[kind]=state.selDaily[kind]===pick.ymd?"":pick.ymd;
  paintDailyBtns();
}
async function getReadPass(date){
  if(state.readCache.date===date&&state.readCache.pass) return state.readCache.pass;
  const p=prompt("Okuma şifresi:")||"";
  if(!T(p)) throw new Error("Şifre girilmedi");
  state.readCache={date,pass:T(p)};
  return T(p);
}

function renderBrandMenu(){
  const box=$("#brandMenu");
  box.innerHTML=state.brands.map(b=>`<label><input type="checkbox" value="${b.id}"> ${esc(b.name)}</label>`).join("");
  box.onchange=e=>{
    const el=e.target;
    if(!(el instanceof HTMLInputElement)) return;
    const id=Number(el.value);
    if(el.checked) state.selBrands.add(id); else state.selBrands.delete(id);
    $("#brandBtn").textContent=state.selBrands.size?`Marka (${state.selBrands.size})`:"Marka";
  };
}
$("#brandBtn").onclick=()=>$("#brandWrap").classList.toggle("open");
document.addEventListener("click",e=>{if(!$("#brandWrap").contains(e.target)) $("#brandWrap").classList.remove("open")});

$("#tsoftDaily").onclick=()=>toggleDaily("tsoft");
$("#aideDaily").onclick=()=>toggleDaily("aide");
$("#csvBtn").onclick=()=>$("#csv").click();
$("#csv").onchange=()=>{if($("#csv").files[0]) state.selDaily.tsoft="",paintDailyBtns()};

function parseTsoft(raw){
  const p=parseDelimited(raw),rows=p.rows;
  if(!rows.length) throw new Error("T-Soft CSV boş");
  const s=rows[0];
  const C={
    ws:pickColumn(s,["Web Servis Kodu","WebServis Kodu","WebServisKodu"]),
    name:pickColumn(s,["Ürün Adı","Urun Adi","Ürün Adi"]),
    sup:pickColumn(s,["Tedarikçi Ürün Kodu","Tedarikci Urun Kodu","Tedarikçi Urun Kodu"]),
    ean:pickColumn(s,["Barkod","EAN","EAN13"]),
    stock:pickColumn(s,["Stok"]),
    brand:pickColumn(s,["Marka"]),
    seo:pickColumn(s,["SEO Link","Seo Link","SEO","Seo"]),
    active:pickColumn(s,["Aktif","AKTIF","Active","ACTIVE"]),
  };
  const miss=["ws","name","sup","ean","stock","brand"].filter(k=>!C[k]);
  if(miss.length) throw new Error("T-Soft sütun eksik: "+miss.join(", "));
  const parseAktif=v=>{const s=T(v).toLowerCase(); return s==="true"||s==="1"||s==="yes"||s==="evet"?true:s==="false"||s==="0"||s==="no"||s==="hayır"||s==="hayir"?false:null};
  return rows.map(r=>({
    brand:T(r[C.brand]),
    brandN:normBrand(r[C.brand]),
    name:T(r[C.name]),
    nameN:normName(r[C.name]),
    ws:codeNorm(r[C.ws]),
    sup:codeNorm(r[C.sup]),
    wsAlt:codeAlt(r[C.ws]),
    supAlt:codeAlt(r[C.sup]),
    eans:parseEans(r[C.ean]),
    stock:stockNum(r[C.stock],"products"),
    active:C.active?parseAktif(r[C.active]):null,
    seo:T(r[C.seo])
  }));
}
function depotFromNoisyPaste(text){
  const out=[],lines=String(text||"").split(/\r\n|\r|\n/);
  const skip=s=>!s||/^(Tümü|Sesçibaba Logo|Şirketler|Siparişler|Onay Bekleyen|Sipariş Listesi|İade Listesi|Sesçibaba Stokları|Stok Listesi|Ara|Previous|Next|Showing\b.*|\d+)$/.test(s);
  for(let l of lines){
    l=T(l.replace(/\u00A0/g," "));
    if(skip(l)||!l.includes("\t")) continue;
    const a=l.split("\t").map(x=>T(x)).filter(Boolean);
    if(a.length<6) continue;
    let marka="",model="",stokKodu="",aciklama="",stok="",ambar="";
    if(a.length===6){[marka,model,stokKodu,aciklama,stok,ambar]=a}
    else{
      marka=a[0]; ambar=a.at(-2)||""; stok=a.at(-3)||"";
      const mid=a.slice(1,-3); if(mid.length<3) continue;
      model=mid.slice(0,-2).join(" "); stokKodu=mid.at(-2)||""; aciklama=mid.at(-1)||"";
    }
    if(!stokKodu) continue;
    out.push({Marka:marka,Model:model,"Stok Kodu":stokKodu,"Açıklama":aciklama,Stok:stok,Ambar:ambar});
  }
  return out;
}
function parseAide(raw){
  const txt=String(raw||"");
  let rows=[],C={};
  try{
    const p=parseDelimited(txt);
    if(p.rows.length){
      const s=p.rows[0];
      C={
        code:pickColumn(s,["Stok Kodu","StokKodu","STOK KODU","Stock Code"]),
        stock:pickColumn(s,["Stok","Miktar","Qty","Quantity"]),
        brand:pickColumn(s,["Marka","Brand"]),
        model:pickColumn(s,["Model"]),
        name:pickColumn(s,["Ürün Adı","Urun Adi","Ürün Adi","Product Name","Product"]),
        desc:pickColumn(s,["Açıklama","Aciklama","Description"])
      };
      if(C.code&&C.stock) rows=p.rows.map(r=>({
        brand:T(C.brand?r[C.brand]:""),
        brandN:normBrand(C.brand?r[C.brand]:""),
        code:codeNorm(r[C.code]),
        codeAlt:codeAlt(r[C.code]),
        name:T((C.model&&r[C.model])||(C.name&&r[C.name])||(C.desc&&r[C.desc])||""),
        stock:stockNum(r[C.stock])
      }));
    }
  }catch{}
  if(!rows.length){
    rows=depotFromNoisyPaste(txt).map(r=>({
      brand:T(r.Marka),brandN:normBrand(r.Marka),code:codeNorm(r["Stok Kodu"]),codeAlt:codeAlt(r["Stok Kodu"]),
      name:T(r.Model||r["Açıklama"]||""),stock:stockNum(r.Stok)
    }));
  }
  const out=new Map();
  for(const r of rows){
    if(!r.brandN||!r.code) continue;
    out.has(r.brandN)||out.set(r.brandN,new Map());
    const m=out.get(r.brandN),k=r.codeAlt||r.code;
    if(!m.has(k)) m.set(k,{brand:r.brand,code:k,name:r.name,stock:r.stock});
    else{
      const it=m.get(k);
      it.stock+=r.stock;
      if(!it.name&&r.name) it.name=r.name;
    }
  }
  return out;
}
function buildTsoftIndex(rows){
  const idx={byBrand:new Map(),used:new Set()};
  for(const r of rows){
    idx.byBrand.has(r.brandN)||idx.byBrand.set(r.brandN,{rows:[],ean:new Map(),code:new Map(),name:new Map()});
    const g=idx.byBrand.get(r.brandN);
    g.rows.push(r);
    for(const e of r.eans){g.ean.has(e)||g.ean.set(e,[]);g.ean.get(e).push(r)}
    for(const c of [r.sup,r.ws,r.supAlt,r.wsAlt].filter(Boolean)) g.code.set(c,r);
    if(r.nameN){g.name.has(r.nameN)||g.name.set(r.nameN,[]);g.name.get(r.nameN).push(r)}
  }
  return idx;
}
function fuzzyNamePick(group,nameN){
  if(!group||!nameN) return null;
  const exact=group.name.get(nameN); if(exact?.length===1) return exact[0];
  let hit=null;
  for(const r of group.rows){
    if(!r.nameN) continue;
    if(r.nameN===nameN) return r;
    if(r.nameN.includes(nameN)||nameN.includes(r.nameN)){
      if(hit) return null;
      hit=r;
    }
  }
  return hit;
}
function findTsoft(compel,idx){
  const g=idx.byBrand.get(compel.brandN); if(!g) return null;
  for(const e of compel.eans){const arr=g.ean.get(e); if(arr?.length) return arr[0]}
  for(const c of [compel.code,compel.codeAlt].filter(Boolean)){const r=g.code.get(c); if(r) return r}
  const byName=fuzzyNamePick(g,compel.nameN); if(byName) return byName;
  return null;
}
function parseCompel(items){
  return items.map(x=>{
    const title=T(x.title);
    return {
      brand:T(x.brand),
      brandN:normBrand(x.brand),
      name:title,
      nameN:normName(title),
      code:codeNorm(x.productCode),
      codeAlt:codeAlt(x.productCode),
      eans:parseEans(x.ean),
      stockRaw:T(x.stock),
      stock:stockNum(x.stock,"compel"),
      url:T(x.url)
    };
  });
}
function matchAll(compel,tsoft,aide){
  const idx=buildTsoftIndex(tsoft);
  const rows=[],compelOnly=[],usedT=new Set(),usedA=new Set();
  for(const c of compel){
    const t=findTsoft(c,idx);
    if(t) usedT.add(t);
    const brandA=aide.get(c.brandN)||new Map();
    const a=t?(brandA.get(t.supAlt||t.sup)||brandA.get(t.wsAlt||t.ws)||brandA.get(c.codeAlt||c.code)||null):(brandA.get(c.codeAlt||c.code)||null);
    if(a) usedA.add(`${c.brandN}||${a.code}`);
    const eanOk=t?(c.eans.length?c.eans.some(e=>t.eans.includes(e)):null):null;
    const expected=t?(c.stock>0||(a?.stock||0)>0):false;
    const stokOk=t?(expected===(t.stock>0)):null;
    const ok=!!t&&eanOk!==false&&stokOk!==false;
    const row={brand:c.brand,compel:c,tsoft:t,aide:a,eanOk,stokOk,ok};
    rows.push(row);
    if(!t) compelOnly.push(row);
  }

  const tsoftOnly=[];
  for(const t of tsoft){
    if(usedT.has(t)) continue;
    tsoftOnly.push(t);
  }

  const aideOnly=[];
  for(const [bn,m] of aide){
    for(const [code,a] of m){
      if(usedA.has(`${bn}||${code}`)) continue;
      aideOnly.push(a);
    }
  }

  rows.sort((a,b)=>{
    const ag=a.ok?1:a.tsoft?2:3,bg=b.ok?1:b.tsoft?2:3;
    if(ag!==bg) return ag-bg;
    return String(a.brand).localeCompare(String(b.brand),"tr",{sensitivity:"base"})||String(a.compel.name).localeCompare(String(b.compel.name),"tr",{sensitivity:"base"});
  });
  tsoftOnly.sort((a,b)=>String(a.brand).localeCompare(String(b.brand),"tr",{sensitivity:"base"})||String(a.name).localeCompare(String(b.name),"tr",{sensitivity:"base"}));
  aideOnly.sort((a,b)=>String(a.brand).localeCompare(String(b.brand),"tr",{sensitivity:"base"})||String(a.name).localeCompare(String(b.name),"tr",{sensitivity:"base"}));

  return {rows,compelOnly,tsoftOnly,aideOnly};
}

function renderTable(cols,rows){
  return `<table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${
    rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join("")}</tr>`).join("")
  }</tbody></table>`;
}
function render(result){
  const matched=result.rows.filter(x=>x.ok).length;
  const warn=result.rows.filter(x=>x.tsoft&&!x.ok).length;
  $("#out").innerHTML=
    `<div><b>Toplam:</b> ${result.rows.length} | <b>Temiz Eşleşme:</b> ${matched} | <b>Kontrol Gereken:</b> ${warn} | <b>Compel Only:</b> ${result.compelOnly.length} | <b>T-Soft Only:</b> ${result.tsoftOnly.length} | <b>Aide Only:</b> ${result.aideOnly.length}</div>`+
    renderTable(
      ["Marka","Compel","T-Soft","Aide","Durum"],
      result.rows.map(x=>[
        esc(x.brand),
        x.compel.url?`<a href="${esc(x.compel.url)}" target="_blank">${esc(x.compel.name)}</a><br><small>${esc(x.compel.code||"-")} | ${x.compel.stock>0?"Var":"Yok"}</small>`:`${esc(x.compel.name)}<br><small>${esc(x.compel.code||"-")} | ${x.compel.stock>0?"Var":"Yok"}</small>`,
        x.tsoft?`${esc(x.tsoft.name)}<br><small>${esc(x.tsoft.sup||x.tsoft.ws||"-")} | ${x.tsoft.stock>0?"Var":"Yok"}${x.tsoft.active===false?" | Pasif":""}</small>`:"-",
        x.aide?`${esc(x.aide.name||"-")}<br><small>${esc(x.aide.code)} | ${x.aide.stock}</small>`:"-",
        x.ok?"OK":x.tsoft?`EAN:${x.eanOk===false?"Hatalı":"?"} / Stok:${x.stokOk===false?"Hatalı":"?"}`:"Eşleşmedi"
      ])
    )+
    `<h3>Compel Eşleşmeyen</h3>`+
    renderTable(["Marka","Ürün","Kod","Stok"],result.compelOnly.map(x=>[
      esc(x.brand),esc(x.compel.name),esc(x.compel.code||"-"),esc(x.compel.stock>0?"Var":"Yok")
    ]))+
    `<h3>T-Soft Eşleşmeyen</h3>`+
    renderTable(["Marka","Ürün","Kod","Stok"],result.tsoftOnly.map(x=>[
      esc(x.brand),esc(x.name),esc(x.sup||x.ws||"-"),esc(x.stock)
    ]))+
    `<h3>Aide Eşleşmeyen</h3>`+
    renderTable(["Marka","Ürün","Kod","Stok"],result.aideOnly.map(x=>[
      esc(x.brand),esc(x.name||"-"),esc(x.code),esc(x.stock)
    ]));
}

async function getTsoftRaw(){
  if(state.selDaily.tsoft){
    const pass=await getReadPass(state.selDaily.tsoft);
    const j=await api("/api/daily/get",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date:state.selDaily.tsoft,password:pass,want:["tsoft"]})});
    if(!j?.tsoft?.exists||!j?.tsoft?.data) throw new Error("T-Soft günlük veri yok");
    return String(j.tsoft.data);
  }
  const f=$("#csv").files[0];
  if(!f) throw new Error("T-Soft CSV seçilmedi");
  return String(await readFileText(f));
}
async function getAideRaw(){
  if(state.selDaily.aide){
    const pass=await getReadPass(state.selDaily.aide);
    const j=await api("/api/daily/get",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date:state.selDaily.aide,password:pass,want:["aide"]})});
    if(!j?.aide?.exists||!j?.aide?.data) throw new Error("Aide günlük veri yok");
    return String(j.aide.data);
  }
  const raw=$("#aideRaw").value;
  if(!T(raw)) throw new Error("Aide yapıştırma alanı boş");
  return raw;
}
async function list(){
  try{
    const sel=state.brands.filter(b=>state.selBrands.has(b.id));
    if(!sel.length) throw new Error("Compel marka seç");
    setStatus("okunuyor...");
    const [tsoftRaw,aideRaw,compelRes]=await Promise.all([
      getTsoftRaw(),
      getAideRaw(),
      api("/api/compel/list",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({brands:sel})})
    ]);
    const compel=parseCompel(compelRes.items||[]);
    const tsoft=parseTsoft(tsoftRaw).filter(r=>state.selBrands.size?sel.some(b=>normBrand(b.name)===r.brandN):true);
    const aide=parseAide(aideRaw);
    render(matchAll(compel,tsoft,aide));
    setStatus("hazır");
  }catch(e){
    console.error(e);
    setStatus(e.message||String(e));
  }
}

$("#listBtn").onclick=list;
loadBrands().then(loadMeta);
