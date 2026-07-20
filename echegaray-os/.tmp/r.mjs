import { makeGoogleClient, WRITE_SCOPES } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const ID='1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
for (const r of process.argv.slice(2)) {
  const v = await g.readSheetValues(ID, r)
  console.log(`\n===== ${r} =====`)
  console.log(v.map((row,i)=>`${i+1}| ${row.join(' | ')}`).join('\n'))
}
process.exit(0)
