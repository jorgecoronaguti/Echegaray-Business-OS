import { makeGoogleClient, WRITE_SCOPES } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const ID='1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
for (const [rng, opt] of [['Cash Flow Mensual!A44:B48','FORMULA'],['Cash Flow Mensual!A44:B48','UNFORMATTED_VALUE']]) {
  const v = await g.readSheetValues(ID, rng, { valueRenderOption: opt }).catch(e=>['ERR '+e.message])
  console.log(`--- ${opt}`); console.log(JSON.stringify(v, null, 1))
}
process.exit(0)
