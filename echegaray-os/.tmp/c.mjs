import { makeGoogleClient, WRITE_SCOPES } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
import { parseMonto } from '../orquestador/lib/cash-briefing.mjs'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const ID='1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const rows = await g.readSheetValues(ID, 'Compras!A4:O5000')
let conId=0, sinId=0, negativos=0
for (const r of rows) { const id=String(r?.[0]??'').trim(); const o=parseMonto(r?.[14]); if(!o) continue
  if (id) conId+=o; else { sinId+=o; if(sinId) console.log('SIN ID:', JSON.stringify(r.slice(0,12)), o) }
  if (o<0) negativos+=o }
console.log('con ID:', Math.round(conId).toLocaleString('es-AR'), ' sin ID:', Math.round(sinId).toLocaleString('es-AR'), ' negativos:', Math.round(negativos).toLocaleString('es-AR'))
process.exit(0)
