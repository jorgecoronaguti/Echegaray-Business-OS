import { makeGoogleClient, WRITE_SCOPES } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const ID='1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const m = await g.getSheetMeta(ID)
for (const s of m) console.log(`${String(s.rows).padStart(6)} x ${String(s.cols).padStart(3)}  ${s.title}`)
process.exit(0)
