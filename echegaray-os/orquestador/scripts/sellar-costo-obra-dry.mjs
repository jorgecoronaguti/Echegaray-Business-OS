// SELLA EL COSTO POR OBRA DE LAS QUINCENAS CERRADAS. DRY POR DEFECTO (auditoría 14/09/2026).
//
//   node orquestador/scripts/sellar-costo-obra-dry.mjs                 → qué sellaría, sin escribir
//   node orquestador/scripts/sellar-costo-obra-dry.mjs --aplicar       → sella, quincena por quincena
//   node orquestador/scripts/sellar-costo-obra-dry.mjs --desde 2026-08-16 [--aplicar]   → una sola
//
// La migración 20260915T0800 NO sella nada al aplicarse: se sella cuando el dueño confirma la base de costo.
// `sellar_costo_obra_quincena` guarda la foto anterior en `costo_obra_quincena_historia` antes de reescribir.
// Correrlo fuera del horario del dueño: cada quincena recalcula a todo el plantel.

import { query, closePool } from '../lib/db.mjs'

const APLICAR = process.argv.includes('--aplicar')
const i = process.argv.indexOf('--desde')
const UNA = i > 0 ? process.argv[i + 1] : null

async function main() {
  const existe = (await query("select to_regprocedure('public.costo_mo_quincena_calculo(date, text[])') is not null as ok")).rows[0].ok
  if (!existe) { console.log('La migración 20260915T0800 no está aplicada: no hay nada que sellar.'); return }
  const quincenas = (await query(`select desde::text from public.liquidacion_quincena group by desde
                                   having bool_and(estado = 'cerrada') ${UNA ? 'and desde = $1' : ''} order by desde`, UNA ? [UNA] : [])).rows
  console.log(`[${APLICAR ? 'aplicar' : 'dry'}] ${quincenas.length} quincena(s) cerrada(s)`)
  for (const { desde } of quincenas) {
    const hoy = (await query(`select count(*)::int n, round(sum(costo_total)) t,
                                     count(*) filter (where estado = 'falta_dato')::int sin_dato
                                from public.costo_mo_quincena_calculo($1::date)`, [desde])).rows[0]
    const sellada = (await query('select count(*)::int n from public.costo_obra_quincena where quincena_desde = $1::date', [desde])).rows[0].n
    console.log(`  ${desde}: ${hoy.n} filas, $ ${Number(hoy.t ?? 0).toLocaleString('es-AR')}, ${hoy.sin_dato} sin dato · foto actual ${sellada} filas`)
    if (APLICAR) {
      const n = (await query('select public.sellar_costo_obra_quincena($1::date) as n', [desde])).rows[0].n
      const leidas = (await query('select count(*)::int n from public.costo_obra_quincena where quincena_desde = $1::date', [desde])).rows[0].n
      console.log(`    sellada: ${n} filas escritas, ${leidas} leídas de la tabla`)
    }
  }
  if (!APLICAR) console.log('[dry] no se escribió nada.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(closePool).catch(async (e) => { console.error(e); await closePool(); process.exit(1) })
}
