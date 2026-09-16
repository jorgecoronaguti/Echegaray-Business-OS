#!/usr/bin/env node
// Saca de `obra_asignacion` los tramos que una corrección del mismo día dejó atrás (16/09/2026).
// Regla y por qué: `lib/asignaciones-reemplazadas.mjs`. Dry por defecto; escribe con `--aplicar`.
//
//   node orquestador/scripts/limpiar-asignaciones-reemplazadas.mjs
//   node orquestador/scripts/limpiar-asignaciones-reemplazadas.mjs --persona "GONZALEZ TOBARES EMILIANO"
//   node orquestador/scripts/limpiar-asignaciones-reemplazadas.mjs --aplicar
import { query, withTx, closePool } from '../lib/db.mjs'
import { planDeLimpieza, SQL_SACAR } from '../lib/asignaciones-reemplazadas.mjs'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d }
const APLICAR = process.argv.includes('--aplicar')
const PERSONA = arg('persona')

const linea = (n, x) => `  ${n.padEnd(34)} ${x.obra_id.padEnd(32)} ${x.desde.slice(5)}..${x.hasta.slice(5)}  id ${x.id.slice(0, 8)}  reemplazada por ${x.reemplazadaPor.slice(0, 8)}`

async function leer() {
  const [asignaciones, horas, personas] = await Promise.all([
    query(`select a.id, a.persona_id, a.obra_id, to_char(a.desde, 'YYYY-MM-DD') desde, to_char(a.hasta, 'YYYY-MM-DD') hasta
             from public.obra_asignacion a join public.personas p on p.id = a.persona_id
            where a.desde is not null and ($1::text is null or p.nombre_completo = $1)`, [PERSONA]),
    query(`select persona_id, to_char(fecha, 'YYYY-MM-DD') fecha, obra_canonica_id
             from public.registros_hh where obra_canonica_id is not null and fecha >= '2026-01-01'`),
    query('select id, nombre_completo from public.personas'),
  ])
  return { asignaciones: asignaciones.rows, horas: horas.rows, nombre: new Map(personas.rows.map((p) => [p.id, p.nombre_completo])) }
}

async function main() {
  const { asignaciones, horas, nombre } = await leer()
  const { sacar, conHoras } = planDeLimpieza({ asignaciones, horas })
  console.log(`obra_asignacion con desde: ${asignaciones.length} filas${PERSONA ? ` de «${PERSONA}»` : ''} · ${APLICAR ? 'APLICAR' : 'DRY'}`)
  console.log(`\nA SACAR · reemplazados el mismo día y sin horas en su obra: ${sacar.length}`)
  for (const x of sacar) console.log(linea(nombre.get(x.persona_id) ?? x.persona_id, x))
  console.log(`\nCON HORAS · reemplazados pero con horas cargadas en su obra (los mira una persona): ${conHoras.length}`)
  for (const x of conHoras) console.log(linea(nombre.get(x.persona_id) ?? x.persona_id, x))

  if (!APLICAR || sacar.length === 0) return
  const borradas = await withTx(async (tx) => {
    let n = 0
    for (const x of sacar) n += (await tx.query(SQL_SACAR, [x.id, x.persona_id])).rowCount
    if (n !== sacar.length) throw new Error(`Se pidieron ${sacar.length} filas y la base borró ${n}: no se escribe nada`)
    return n
  })
  // LA EVIDENCIA ES DEL EFECTO: se relee y el plan tiene que quedar vacío.
  const releido = await leer()
  const quedan = planDeLimpieza({ asignaciones: releido.asignaciones, horas: releido.horas }).sacar.length
  console.log(`\nESCRITO: ${borradas} filas borradas (transacción confirmada) · releído: quedan ${quedan} por sacar (tiene que ser 0)`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(closePool)
