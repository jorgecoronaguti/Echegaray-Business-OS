#!/usr/bin/env node
// Repone en `registros_hh` la obra del día que la web declaró (`asistencia_dia`) donde la planilla la
// pisó. Regla y por qué: `lib/restaurar-hh-desde-web.mjs`. Dry por defecto; escribe con `--aplicar`.
//
//   node orquestador/scripts/restaurar-hh-desde-web.mjs --desde 2026-09-01 --hasta 2026-09-15
//   node orquestador/scripts/restaurar-hh-desde-web.mjs --desde 2026-09-01 --hasta 2026-09-15 --aplicar
//   --autor-email jorge@ecsas.com.ar   (el autor con el que queda la fila; por defecto el dueño)
import { query, withTx, closePool } from '../lib/db.mjs'
import { fechaOperativaSanJuan } from '../comunicacion/asistencia-ui.mjs'
import { planDeRestauracion, rastroDeRestauracion, SQL_RESTAURAR } from '../lib/restaurar-hh-desde-web.mjs'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d }
const APLICAR = process.argv.includes('--aplicar')
const DESDE = arg('desde'); const HASTA = arg('hasta', fechaOperativaSanJuan())
const AUTOR_EMAIL = arg('autor-email', 'jorge@ecsas.com.ar')
for (const [n, v] of [['desde', DESDE], ['hasta', HASTA]]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v ?? '')) throw new Error(`--${n} tiene que ser YYYY-MM-DD, no «${v}»`)
}

const linea = (n, x) => `  ${n.padEnd(32)} ${x.fecha.slice(5)}  web: ${x.obra_web ?? x.web}  ·  planilla: ${x.obra_jornales ?? 'sin obra'} ${x.horas}h ${x.tipo_hora}`

async function main() {
  const [hh, asistencia, personas, autor] = await Promise.all([
    query(`select id, persona_id, to_char(fecha, 'YYYY-MM-DD') fecha, obra_canonica_id, tipo_hora, horas, fuente_legacy, actualizado_por
             from public.registros_hh where fecha between $1 and $2`, [DESDE, HASTA]),
    query(`select persona_id, to_char(fecha, 'YYYY-MM-DD') fecha, obra_canonica_id, estado, origen, motivo
             from public.asistencia_dia where fecha between $1 and $2`, [DESDE, HASTA]),
    query('select id, nombre_completo from public.personas'),
    query('select id from auth.users where email = $1', [AUTOR_EMAIL]),
  ])
  const nombre = new Map(personas.rows.map((p) => [p.id, p.nombre_completo]))
  const { restaurar, conflictos, chocan } = planDeRestauracion({ hh: hh.rows, asistencia: asistencia.rows })
  console.log(`registros_hh ${DESDE}..${HASTA}: ${hh.rows.length} filas · asistencia_dia: ${asistencia.rows.length} marcas · ${APLICAR ? 'APLICAR' : 'DRY'}`)
  console.log(`\nA RESTAURAR · la obra declarada en la web sobre la fila de la planilla: ${restaurar.length}`)
  for (const x of restaurar) console.log(linea(nombre.get(x.persona_id) ?? x.persona_id, x))
  console.log(`\nCONFLICTOS · la web dice que no vino y la planilla trae horas (decide una persona): ${conflictos.length}`)
  for (const x of conflictos) console.log(linea(nombre.get(x.persona_id) ?? x.persona_id, x))
  console.log(`\nCHOCAN · ya hay una fila en la obra declarada (no se mueven): ${chocan.length}`)
  for (const x of chocan) console.log(linea(nombre.get(x.persona_id) ?? x.persona_id, x))

  if (!APLICAR || restaurar.length === 0) return
  const autorId = autor.rows[0]?.id
  if (!autorId) throw new Error(`No existe el usuario «${AUTOR_EMAIL}»: la fila restaurada necesita autor`)
  const hoy = fechaOperativaSanJuan()
  const escritas = await withTx(async (tx) => {
    let n = 0
    for (const x of restaurar) n += (await tx.query(SQL_RESTAURAR, [x.id, x.obra_web, autorId, rastroDeRestauracion(x, hoy)])).rowCount
    if (n !== restaurar.length) throw new Error(`Se pidieron ${restaurar.length} filas y la base confirmó ${n}: no se escribe nada`)
    return n
  })
  // LA EVIDENCIA ES DEL EFECTO: se relee y el plan tiene que quedar vacío.
  const releido = await query(`select id, persona_id, to_char(fecha, 'YYYY-MM-DD') fecha, obra_canonica_id, tipo_hora, horas, fuente_legacy, actualizado_por
                                 from public.registros_hh where fecha between $1 and $2`, [DESDE, HASTA])
  const quedan = planDeRestauracion({ hh: releido.rows, asistencia: asistencia.rows }).restaurar.length
  console.log(`\nESCRITO: ${escritas} filas restauradas (transacción confirmada) · releído: quedan ${quedan} por restaurar (tiene que ser 0)`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(closePool)
