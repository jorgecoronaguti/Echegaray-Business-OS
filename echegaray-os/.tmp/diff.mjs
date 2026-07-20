import { makeGoogleClient, WRITE_SCOPES } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
import { query } from '../orquestador/lib/db.mjs'
import { parseMonto } from '../orquestador/lib/cash-briefing.mjs'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const ID='1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const rows = await g.readSheetValues(ID, 'Compras!A4:O5000')
const sheet = new Map()
let sumO = 0
for (const r of rows) { const id=String(r?.[0]??'').trim(); const o=parseMonto(r?.[14]); if(o) sumO+=o; if(id) sheet.set(id, o) }
const { rows: db } = await query("select referencia_externa id, total from public.costos_obra where origen='compras_sheet'")
console.log('SUMA columna O del Sheet:', Math.round(sumO).toLocaleString('es-AR'))
console.log('SUMA total en Supabase  :', Math.round(db.reduce((s,r)=>s+Number(r.total),0)).toLocaleString('es-AR'))
const difs=[]
for (const r of db) { const s = sheet.get(r.id); const d = Number(r.total) - (s??0); if (Math.abs(d)>1) difs.push({id:r.id, sheet:s, db:Number(r.total), dif:d}) }
console.log('\nfilas que no coinciden:', difs.length)
for (const d of difs.slice(0,15)) console.log(` id ${d.id}  sheet ${Math.round(d.sheet??0).toLocaleString('es-AR')}  db ${Math.round(d.db).toLocaleString('es-AR')}  dif ${Math.round(d.dif).toLocaleString('es-AR')}`)
const ids = new Set(db.map(r=>r.id))
const soloSheet = [...sheet].filter(([k,v])=>!ids.has(k)&&v)
console.log('\nen el Sheet y NO en la base:', soloSheet.length, Math.round(soloSheet.reduce((s,[,v])=>s+v,0)).toLocaleString('es-AR'))
process.exit(0)
