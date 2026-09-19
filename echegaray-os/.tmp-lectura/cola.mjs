import { makeGoogleClient } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig() })
for (const p of ['Cash Flow Semanal', 'Cash Flow Mensual']) {
  const v = await g.readSheetValues(ID, `${p}!A1:C200`)
  console.log(`\n════ ${p} (${v.length} filas con dato) ════`)
  v.forEach((f, i) => {
    const a = String(f?.[0] ?? '').slice(0, 78)
    const b = String(f?.[1] ?? '').slice(0, 26)
    const c = String(f?.[2] ?? '').slice(0, 20)
    if (a || b || c) console.log(`${String(i+1).padStart(3)} | ${a.padEnd(78)} | ${b.padEnd(26)} | ${c}`)
  })
}
