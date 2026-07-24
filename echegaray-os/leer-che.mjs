import { makeGoogleClient, WRITE_SCOPES } from './orquestador/lib/google.mjs'
import { loadConfig } from './orquestador/lib/config.mjs'
const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const v = await g.readSheetValidations(ID, [`'Cheques Emitidos'!A102:M112`])
const rows = v?.sheets?.[0]?.data?.[0]?.rowData || []
rows.forEach((r, i) => {
  const vals = (r.values || []).map((c, j) => (c?.dataValidation ? `${String.fromCharCode(65 + j)}:${JSON.stringify(c.dataValidation)}` : null)).filter(Boolean)
  if (vals.length) console.log(102 + i, vals.join(' | '))
})
console.log('fin validaciones')
