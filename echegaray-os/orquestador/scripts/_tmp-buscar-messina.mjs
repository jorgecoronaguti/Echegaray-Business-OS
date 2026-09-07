import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'

const email = 'jorge@ecsas.com.ar'
const cuenta = await operadorPara(email)
console.log('cuenta operadora:', cuenta)
if (!cuenta) { console.log('SIN TOKEN'); process.exit(1) }
const cfg = loadConfig()
const google = makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(cuenta), soloUsuario: true })

const queries = [
  'messina "orden de pago"',
  'messina OP pago',
  'messina transferencia',
  'messina aviso de pago',
  'from:messina',
  '"orden de pago" messina newer_than:120d',
]
const vistos = new Set()
for (const q of queries) {
  try {
    const r = await google.gmailSearch(q, { max: 15 })
    console.log(`\n=== query: ${q} (${r.length}) ===`)
    for (const m of r) {
      if (!vistos.has(m.id)) {
        vistos.add(m.id)
        console.log(`${m.id} | ${m.date} | ${m.from} | ${m.subject}`)
      }
    }
  } catch (e) {
    console.log(`ERROR query "${q}":`, e.message)
  }
}
console.log('\nTOTAL únicos:', vistos.size)
console.log(JSON.stringify([...vistos]))
