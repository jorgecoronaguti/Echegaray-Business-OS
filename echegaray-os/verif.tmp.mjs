import { makeGoogleClient, WRITE_SCOPES } from './orquestador/lib/google.mjs'
import { loadConfig } from './orquestador/lib/config.mjs'
import { ubicarCuadro } from './orquestador/lib/nomina-sync.mjs'

const ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const hoja = await g.readSheetValues(ID, 'Jornales por Quincena!A1:J200')
const buscar = (re) => hoja.findIndex((r) => (r ?? []).some((c) => re.test(String(c ?? '').trim())))
console.log('ubicarCuadro (ancla /^desde$/i):', JSON.stringify(ubicarCuadro(hoja)))
console.log('buscar /^TOTAL PROYECTADO$/i  →', buscar(/^TOTAL PROYECTADO$/i))
console.log('buscar /^Básico \\$\\/hora$/i  →', buscar(/^Básico \$\/hora$/i))
console.log('buscar /^Quincena$/i          →', buscar(/^Quincena$/i))
console.log('buscar /Total a pagar hasta diciembre/i →', buscar(/Total a pagar hasta diciembre/i))
console.log('buscar /Escala del convenio/i →', buscar(/Escala del convenio/i))
