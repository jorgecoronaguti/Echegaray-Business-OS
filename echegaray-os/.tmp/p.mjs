import { makeGoogleClient, WRITE_SCOPES } from '../orquestador/lib/google.mjs'
import { loadConfig } from '../orquestador/lib/config.mjs'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const ID='1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const v = await g.readSheetValues(ID, 'Parámetros!A70:D92')
console.log(v.map((r,i)=>`${70+i}: ${JSON.stringify(r)}`).join('\n'))
process.exit(0)
