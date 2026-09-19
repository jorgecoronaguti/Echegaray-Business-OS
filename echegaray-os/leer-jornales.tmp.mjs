import { makeGoogleClient, WRITE_SCOPES } from './orquestador/lib/google.mjs'
import { loadConfig } from './orquestador/lib/config.mjs'
const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const v = await g.readSheetValues(ID, `'Parámetros'!A1:F120`)
v.forEach((f, i) => {
  const s = (f || []).map((c) => String(c ?? '')).join(' | ')
  if (s.replace(/\|/g, '').trim()) console.log(String(i + 1).padStart(3), s.slice(0, 150))
})
