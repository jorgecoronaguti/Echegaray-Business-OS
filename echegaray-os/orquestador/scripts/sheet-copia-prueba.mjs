// COPIA DE PRUEBA DEL FLUJO DE CAJA — files.copy por API; imprime el id. Para verificar un generador
// rediseñado sin tocar el real: ORQ_CASHFLOW_ID=<id> + scripts/en-copia.mjs o pestana-migrar-layout.mjs.
//   node orquestador/scripts/sheet-copia-prueba.mjs <etiqueta>
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const r = await g.copyFile(ID, `COPIA PRUEBA ${process.argv[2] || 'x'} ${new Date().toISOString().slice(0, 16)}`)
console.log(r?.id || JSON.stringify(r).slice(0, 200))
