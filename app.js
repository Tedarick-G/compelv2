const API_BASE="https://doretest.tvkapora.workers.dev";
const TR="tr-TR";
const $=s=>document.querySelector(s);
const T=s=>String(s??"").trim();
const D=s=>String(s??"").replace(/[^\d]/g,"");

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
      else cur+=ch
    }
    out.push(cur);
    return out.map(v=>v.trim())
  };
  let hdr=null,rows=[];
  for(const line of lines){
    if(!line.trim()) continue;
    if(!hdr){hdr=split(line);continue}
    const vals=split(line),obj={};
    for(let i=0;i<hdr.length;i++) obj[hdr[i]]=vals[i]??"";
    rows.push(obj)
  }
  return {hdr:hdr||[],rows}
}
const normHeader=h=>T(h).toLocaleUpperCase(TR).replace(/\s+/g," ");
function pickColumn(row,wanted){
  const map=new Map(Object.keys(row||{}).map(k=>[normHeader(k),k]));
  for(const w of wanted){const k=map.get(normHeader(w));if(k)return k}
  return null
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
    .trim().replace(/\s+/g," ")
}
const compact=s=>T(s).replace(/\s+/g,"");
const ALIAS=new Map([
  ["RODE","RODE"],["RODEX","RODE"],["DENON","DENON DJ"],["DENONDJ","DENON DJ"],
  ["FENDER","FENDER STUDIO"],["FENDERSTUDIO","FENDER STUDIO"],["UNIVERSAL","UNIVERSAL AUDIO"],["UNIVERSALAUDIO","UNIVERSAL AUDIO"],
  ["WARMAUDIO","WARM AUDIO"],["BEYER","BEYERDYNAMIC"],["BEYERDYNAMIC","BEYERDYNAMIC"],["ALLENHEATH","ALLEN HEATH"],
  ["MARANTZPROFESSIONAL","MARANTZ"],["RUPERTNEVEDESIGNS","RUPERT NEVE"]
]);
function normBrand(s){const k=rawNorm(s);return k?(ALIAS.get(compact(k))||k):""}

const state={
  brands:[],
  selBrands:new Set(),
  meta:null,
  selDaily:{tsoft:"",aide:""},
  readCache:{date:"",pass:""},
  saveCred:null
};

const setStatus=t=>$("#status").textContent=T(t);
const ymdToDmy=s=>{const m=T(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:s};

async function api(path,opt={}){
  const r=await fetch(API_BASE+path,opt),t=await r.text();
  let j;try{j=JSON.parse(t)}catch{j=t}
  if(!r.ok) throw new Error(j?.error||t||`HTTP ${r.status}`);
  return j
}

async function loadBrands(){
  const data=await api("/api/brands");
  state.brands=Array.isArray(data)?data:[];
  renderBrandMenu()
}
async function loadMeta(){
  try{state.meta=await api("/api/daily/meta")}catch{state.meta=null}
  paintDailyBtns()
}
function pickHM(obj){return T(obj?.hm||obj?.HM||obj?.time||obj?.saat||"")}
function dailyPick(kind){
  const t=state.meta?.today?.[kind];
  if(t?.exists) return {ymd:state.meta.today.ymd,label:`${kind==="tsoft"?"T-Soft":"Aide"} ${ymdToDmy(state.meta.today.ymd)} Tarihli Veri`,hm:pickHM(t)};
  const y=state.meta?.yesterday?.[kind];
  if(y?.exists) return {ymd:state.meta.yesterday.ymd,label:`${kind==="tsoft"?"T-Soft":"Aide"} ${state.meta.yesterday.dmy} Tarihli Veri`,hm:""};
  return null
}
function paintDailyBtns(){
  for(const kind of ["tsoft","aide"]){
    const btn=$(`#${kind}Daily`),pick=dailyPick(kind);
    btn.disabled=!pick;
    btn.textContent=pick?(state.selDaily[kind]===pick.ymd?`${kind==="tsoft"?"T-Soft":"Aide"} Seçildi`:(pick.hm?`${kind==="tsoft"?"T-Soft":"Aide"} ${pick.hm}`:pick.label)):`${kind==="tsoft"?"T-Soft":"Aide"} Veri Yok`
  }
}
function toggleDaily(kind){
  const pick=dailyPick(kind); if(!pick) return;
  state.selDaily[kind]=state.selDaily[kind]===pick.ymd?"":pick.ymd;
  paintDailyBtns()
}
async function getReadPass(date){
  if(state.readCache.date===date&&state.readCache.pass) return state.readCache.pass;
  const p=prompt("Okuma şifresi:")||"";
  if(!T(p)) throw new Error("Şifre girilmedi");
  state.readCache={date,pass:T(p)};
  return T(p)
}
function ensureSaveCred(){
  if(state.saveCred?.adminPassword&&state.saveCred?.readPassword) return state.saveCred;
  const admin=prompt("Yetkili Şifre:")||"";
  if(!T(admin)) throw new Error("Yetkili şifre girilmedi");
  const read=prompt("Okuma Şifresi:")||"";
  if(!T(read)) throw new Error("Okuma şifresi girilmedi");
  state.saveCred={adminPassword:T(admin),readPassword:T(read)};
  return state.saveCred
}
async function saveDaily(kind,data){
  const cred=ensureSaveCred();
  await api("/api/daily/save",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({kind,adminPassword:cred.adminPassword,readPassword:cred.readPassword,data})
  });
  await loadMeta()
}

function renderBrandMenu(){
  const box=$("#brandMenu");
  box.innerHTML=state.brands.map(b=>`<label><input type="checkbox" value="${b.id}"> ${b.name}</label>`).join("");
  box.onchange=e=>{
    const el=e.target;
    if(!(el instanceof HTMLInputElement)) return;
    const id=Number(el.value);
    if(el.checked) state.selBrands.add(id); else state.selBrands.delete(id);
    $("#brandBtn").textContent=state.selBrands.size?`Marka (${state.selBrands.size})`:"Marka"
  }
}
$("#brandBtn").onclick=()=>$("#brandWrap").classList.toggle("open");
document.addEventListener("click",e=>{if(!$("#brandWrap").contains(e.target)) $("#brandWrap").classList.remove("open")});

$("#tsoftDaily").onclick=()=>toggleDaily("tsoft");
$("#aideDaily").onclick=()=>toggleDaily("aide");
$("#csvBtn").onclick=()=>$("#csv").click();
$("#csv").onchange=()=>{if($("#csv").files[0]){state.selDaily.tsoft="";paintDailyBtns()}};

$("#tsoftSave").onchange=async e=>{
  try{
    if(!e.target.checked) return;
    const f=$("#csv").files[0];
    if(!f) throw new Error("Önce T-Soft CSV seç");
    setStatus("T-Soft kaydediliyor...");
    await saveDaily("tsoft",String(await readFileText(f)));
    setStatus("T-Soft kaydedildi");
  }catch(err){
    console.error(err);
    setStatus(err.message||String(err));
  }finally{
    e.target.checked=false
  }
};

$("#aideSave").onchange=async e=>{
  try{
    if(!e.target.checked) return;
    const raw=T($("#aideRaw").value);
    if(!raw) throw new Error("Önce Aide verisi yapıştır");
    setStatus("Aide kaydediliyor...");
    await saveDaily("aide",raw);
    setStatus("Aide kaydedildi");
  }catch(err){
    console.error(err);
    setStatus(err.message||String(err));
  }finally{
    e.target.checked=false
  }
};

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
      model=mid.slice(0,-2).join(" "); stokKodu=mid.at(-2)||""; aciklama=mid.at(-1)||""
    }
    if(!stokKodu) continue;
    out.push({"Marka":marka,"Model":model,"Stok Kodu":stokKodu,"Açıklama":aciklama,"Stok":stok,"Ambar":ambar})
  }
  return out
}

function filterBySelectedBrand(rows,getBrand){
  const selNorm=new Set(state.brands.filter(b=>state.selBrands.has(b.id)).map(b=>normBrand(b.name)));
  if(!selNorm.size) return rows;
  return rows.filter(r=>selNorm.has(normBrand(getBrand(r))))
}

function parseTsoftRawToFullRows(raw){
  const p=parseDelimited(raw),rows=p.rows;
  if(!rows.length) throw new Error("T-Soft CSV boş");
  const s=rows[0],brandCol=pickColumn(s,["Marka"]);
  if(!brandCol) throw new Error("T-Soft marka sütunu bulunamadı");
  return {hdr:p.hdr,rows:filterBySelectedBrand(rows,r=>r[brandCol]||""),brandCol}
}

function parseAideRawToFullRows(raw){
  const txt=String(raw||"");
  let rows=[],hdr=[];
  try{
    const p=parseDelimited(txt);
    if(p.rows.length){
      const s=p.rows[0];
      const brandCol=pickColumn(s,["Marka","Brand"]);
      const codeCol=pickColumn(s,["Stok Kodu","StokKodu","STOK KODU","Stock Code"]);
      if(brandCol&&codeCol){
        rows=filterBySelectedBrand(p.rows,r=>r[brandCol]||"");
        hdr=p.hdr
      }
    }
  }catch{}
  if(rows.length) return {hdr,rows};
  const noisy=depotFromNoisyPaste(txt);
  return {hdr:["Marka","Model","Stok Kodu","Açıklama","Stok","Ambar"],rows:filterBySelectedBrand(noisy,r=>r["Marka"]||"")}
}

function flattenCompelItems(items){
  const out=[];
  for(const it of items||[]){
    if(Array.isArray(it?.variants)&&it.variants.length){
      for(const v of it.variants){
        out.push({
          "Ana Başlık":T(it.title),
          "Varyant Başlık":T(v.title),
          "Başlık":T(v.title||it.title),
          "Marka":T(v.brand||it.brand),
          "Ürün Kodu":T(v.productCode||it.productCode),
          "EAN":T(v.ean||it.ean),
          "Stok":v.stock==null?String(it.stock??""):String(v.stock),
          "Fiyat":T(v.price||it.price),
          "Link":T(v.url||it.url),
          "Görsel":T(v.image||it.image),
          "Ana Link":T(it.url),
          "Ana Görsel":T(it.image)
        })
      }
    }else{
      out.push({
        "Ana Başlık":"",
        "Varyant Başlık":"",
        "Başlık":T(it.title),
        "Marka":T(it.brand),
        "Ürün Kodu":T(it.productCode),
        "EAN":T(it.ean),
        "Stok":it.stock==null?"":String(it.stock),
        "Fiyat":T(it.price),
        "Link":T(it.url),
        "Görsel":T(it.image),
        "Ana Link":"",
        "Ana Görsel":""
      })
    }
  }
  return out
}

function parseCompelFullRows(payload){
  const rows=flattenCompelItems(payload?.items||[]);
  return {
    hdr:["Ana Başlık","Varyant Başlık","Başlık","Marka","Ürün Kodu","EAN","Stok","Fiyat","Link","Görsel","Ana Link","Ana Görsel"],
    rows:filterBySelectedBrand(rows,r=>r.Marka||"")
  }
}

function renderList(listCode,title,hdr,rows,target){
  const head=hdr.map((h,i)=>`<th title="${h}">${h} <small>s${i+1}</small></th>`).join("");
  const cell=(h,v)=>{
    const x=String(v??"");
    if((/link/i.test(h)||/görsel/i.test(h))&&T(x)) return `<td><a href="${x}" target="_blank">Aç</a></td>`;
    return `<td>${x}</td>`
  };
  const body=rows.map(r=>`<tr>${hdr.map(h=>cell(h,r[h])).join("")}</tr>`).join("");
  target.innerHTML=
    `<h3>${title} <small>${listCode}</small></h3>`+
    `<div class="meta">Satır: ${rows.length} | Sütun: ${hdr.length}</div>`+
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

async function getTsoftRaw(){
  if(state.selDaily.tsoft){
    const pass=await getReadPass(state.selDaily.tsoft);
    const j=await api("/api/daily/get",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date:state.selDaily.tsoft,password:pass,want:["tsoft"]})});
    if(!j?.tsoft?.exists||!j?.tsoft?.data) throw new Error("T-Soft günlük veri yok");
    return String(j.tsoft.data)
  }
  const f=$("#csv").files[0];
  if(!f) throw new Error("T-Soft CSV seçilmedi");
  return String(await readFileText(f))
}

async function getAideRaw(){
  if(state.selDaily.aide){
    const pass=await getReadPass(state.selDaily.aide);
    const j=await api("/api/daily/get",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({date:state.selDaily.aide,password:pass,want:["aide"]})});
    if(!j?.aide?.exists||!j?.aide?.data) throw new Error("Aide günlük veri yok");
    return String(j.aide.data)
  }
  const raw=$("#aideRaw").value;
  if(!T(raw)) throw new Error("Aide yapıştırma alanı boş");
  return raw
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
    const l1=parseCompelFullRows(compelRes);
    const l2=parseTsoftRawToFullRows(tsoftRaw);
    const l3=parseAideRawToFullRows(aideRaw);
    renderList("l1","Compel Tüm Kolonlar",l1.hdr,l1.rows,$("#l1"));
    renderList("l2","T-Soft Tüm Kolonlar",l2.hdr,l2.rows,$("#l2"));
    renderList("l3","Aide Tüm Kolonlar",l3.hdr,l3.rows,$("#l3"));
    setStatus("hazır");
  }catch(e){
    console.error(e);
    setStatus(e.message||String(e))
  }
}

$("#listBtn").onclick=list;
loadBrands().then(loadMeta);
