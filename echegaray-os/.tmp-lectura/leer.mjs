import { makeGoogleClient } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig() })
const meta = await g.getSheetMeta(ID)
for (const s of meta) console.log(`${s.sheetId}\t${s.rows}x${s.cols}\t${s.title}`)
