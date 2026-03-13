const API="https://13.tvkapora.workers.dev"

async function loadBrands(){

const r=await fetch(API+"/brands")

const brands=await r.json()

for(const b of brands){

const opt=document.createElement("option")

opt.value=b
opt.text="Brand "+b

brandsSelect.appendChild(opt)

}

}

async function scan(){

const selected=[...brandsSelect.selectedOptions].map(o=>o.value)

const r=await fetch(API+"/scan?brands="+selected.join(","))

const data=await r.json()

render(data)

}

function render(data){

table.innerHTML=`<tr>
<th>#</th>
<th>Ürün</th>
<th>Stok</th>
<th>USD</th>
<th>EUR</th>
<th>EAN</th>
</tr>`

let i=1

for(const d of data){

table.innerHTML+=`
<tr>
<td>${i++}</td>
<td>${d.name||""}</td>
<td>${d.stock}</td>
<td>${d.usd}</td>
<td>${d.eur}</td>
<td>${d.ean}</td>
</tr>
`

}

}

const brandsSelect=document.getElementById("brands")

loadBrands()
