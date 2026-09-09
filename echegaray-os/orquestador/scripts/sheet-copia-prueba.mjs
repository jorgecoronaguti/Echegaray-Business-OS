// COPIA DE PRUEBA DEL FLUJO DE CAJA — files.copy por API; imprime el id. Para verificar un generador
// rediseñado sin tocar el real: ORQ_CASHFLOW_ID=<id> + scripts/en-copia.mjs o pestana-migrar-layout.mjs.
//   node orquestador/scripts/sheet-copia-prueba.mjs <etiqueta>
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
// Con --sembrar <id> no copia: siembra una copia que ya existe.
const soloSembrar = process.argv.includes('--sembrar') ? process.argv[process.argv.indexOf('--sembrar') + 1] : null
const r = soloSembrar ? { id: soloSembrar } : await g.copyFile(ID, `COPIA PRUEBA ${process.argv[2] || 'x'} ${new Date().toISOString().slice(0, 16)}`)
const copia = r?.id
if (!copia) { console.error(JSON.stringify(r).slice(0, 200)); process.exit(1) }
// LAS RÉPLICAS QUE LLEGAN POR IMPORT* NO CARGAN EN UNA COPIA (piden autorización y quedan en #REF!):
// se siembran con los VALORES del real, como espejo, para que la copia calcule igual que el original.
const meta = await g.getSheetMeta(ID)
for (const m of meta) {
  if (!m.title.startsWith('_')) continue
  const f = await g.readSheetValues(ID, `'${m.title}'!A1:C3`, { render: 'FORMULA' })
  if (!f.flat().some((c) => typeof c === 'string' && /^=IMPORT/i.test(c))) continue
  const v = await g.readSheetValues(ID, `'${m.title}'`, { render: 'UNFORMATTED_VALUE' })
  const ancho = Math.max(...v.map((r) => r.length), 1)
  const rect = v.map((r) => Array.from({ length: ancho }, (_, i) => (r[i] === undefined ? '' : r[i])))
  const res = await g.updateSheetValues(copia, `'${m.title}'!A1`, rect, { espejo: true })
  console.error(`sembrada ${m.title} en la copia: ${rect.length} filas (${res?.protegido ? 'PROTEGIDA' : 'ok'})`)
}
console.log(copia)
