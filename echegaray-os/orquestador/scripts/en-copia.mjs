// CORRER UN GENERADOR CONTRA UNA COPIA DEL FLUJO DE CAJA — Y SÓLO CONTRA UNA COPIA.
//
// POR QUÉ (09/09/2026). Un generador corrido «para ver» sin el flag correcto escribió el Sheet real y
// rompió «Jornales por Quincena». Tests, dry y auditores no ven el resultado de las fórmulas: la única
// verificación real es aplicar sobre una COPIA del archivo y mirarla. Este envoltorio hace imposible
// equivocarse de destino: exige ORQ_CASHFLOW_ID, se niega si es el archivo real, y recién ahí lanza.
//
//   ORQ_CASHFLOW_ID=<id de la copia> node orquestador/scripts/en-copia.mjs scripts/jornales-pestana.mjs [args]
import { spawnSync } from 'node:child_process'
const REAL = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const id = process.env.ORQ_CASHFLOW_ID
if (!id || id.length < 30) { console.error('✗ falta ORQ_CASHFLOW_ID con el id de la COPIA'); process.exit(2) }
if (id === REAL) { console.error('✗ ORQ_CASHFLOW_ID es el Sheet REAL: me niego'); process.exit(2) }
const [script, ...args] = process.argv.slice(2)
if (!script) { console.error('uso: en-copia.mjs <script.mjs> [args]'); process.exit(2) }
console.log(`→ ${script} ${args.join(' ')}  sobre la copia ${id}`)
const r = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', env: { ...process.env, ORQ_CASHFLOW_ID: id } })
process.exit(r.status ?? 1)
