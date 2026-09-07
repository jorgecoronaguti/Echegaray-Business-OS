import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'

const email = 'jorge@ecsas.com.ar'
const cuenta = await operadorPara(email)
const cfg = loadConfig()
const google = makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(cuenta), soloUsuario: true })

const queries = [
  'from:juanmessina.com.ar',
  'from:documentacion@juanmessina.com.ar',
  'from:pagos@juanmessina.com.ar',
  '"orden de pago" O/P',
  'juanmessina.com.ar orden',
]
const vistos = new Map()
for (const q of queries) {
  try {
    const r = await google.gmailSearch(q, { max: 20 })
    console.log(`\n=== query: ${q} (${r.length}) ===`)
    for (const m of r) {
      console.log(`${m.id} | ${m.date} | ${m.from} | ${m.subject}`)
      vistos.set(m.id, m)
    }
  } catch (e) {
    console.log(`ERROR query "${q}":`, e.message)
  }
}
console.log('\nTOTAL únicos:', vistos.size)
