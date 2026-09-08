#!/usr/bin/env node
// SÓLO LEE. Corre los invariantes de `obra_asignacion` contra la base viva y sale ≠0 si alguno da
// rojo. Existe suelto —además de correr dentro de `asistencia-obra-por-dia.mjs`— para que el
// control se pueda pedir sin disparar ninguna escritura: un control que obliga a escribir para
// mirarse no se usa.
//
//   node orquestador/scripts/invariantes-asignaciones.mjs
import { query, closePool } from '../lib/db.mjs'
import { revisarAsignaciones, formatearHallazgos, SQL_ASIGNACIONES, SQL_OBRAS } from '../lib/invariantes/asignaciones.mjs'

const [asig, obras] = await Promise.all([query(SQL_ASIGNACIONES), query(SQL_OBRAS)])
const r = revisarAsignaciones({ asignaciones: asig.rows, obras: obras.rows })
console.log(`obra_asignacion · ${r.revisadas} filas · ${r.vigentes} vigentes · ${r.hallazgos.length ? `${r.hallazgos.length} ROJO` : 'VERDE'}`)
if (r.hallazgos.length) console.log(formatearHallazgos(r.hallazgos))
await closePool().catch(() => {})
process.exitCode = r.hallazgos.length ? 1 : 0
