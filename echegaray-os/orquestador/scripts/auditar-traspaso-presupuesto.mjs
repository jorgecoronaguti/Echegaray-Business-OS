#!/usr/bin/env node
// ¿QUÉ INFORMACIÓN PIERDE UN PRESUPUESTO CUANDO SE CONVIERTE EN OBRA?
//
//   node --env-file=.env.local orquestador/scripts/auditar-traspaso-presupuesto.mjs [--detalle]
//
// Lee la base y contesta concepto por concepto: qué se conservó, qué se perdió y qué el presupuesto
// nunca supo. **No escribe nada.** Es un control, y un control que puede escribir deja de serlo.
//
// El criterio vive en `orquestador/lib/presupuesto-a-obra.mjs` y está probado sin base; acá sólo se
// leen las filas y se imprime. Esa separación es la que permite que el mismo veredicto lo pueda dar
// un test, la web o el chat sin tres implementaciones distintas.

import { getPool } from '../lib/db.mjs'
import { auditarPartida, resumirTraspaso, VEREDICTO } from '../lib/presupuesto-a-obra.mjs'

const detalle = process.argv.includes('--detalle')

const SQL_PARTIDAS = `
  select distinct p.id, p.descripcion, p.rubro, p.unidad, p.cantidad, p.tarea_tipo_id, p.analisis_id,
         p.subcontratada, coalesce(p.hs_unitarias, ac.hs_unitarias) as hs_unitarias
    from public.cotizacion_partida p
    left join public.analisis_costo ac on ac.analisis_id = p.analisis_id
   where exists (select 1 from public.obra_actividad a where a.cotizacion_partida_id = p.id)
   order by p.descripcion`

const SQL_ACTIVIDADES = `
  select id, tipo, rol_estructura, nombre, tarea_tipo_id, unidad, cantidad_objetivo, hh_plan,
         dotacion_prevista, fin_plan, cotizacion_partida_id, partida_codigo, fuente
    from public.obra_actividad where cotizacion_partida_id = $1`

async function leerPartida(pool, partida) {
  const [act, comp, plan, cuad, dep] = await Promise.all([
    pool.query(SQL_ACTIVIDADES, [partida.id]),
    pool.query('select orden, recurso_codigo, recurso_nombre, tipo, cantidad from public.cotizacion_partida_composicion where partida_id = $1', [partida.id]),
    pool.query('select tipo, recurso_codigo, cantidad_plan from public.obra_actividad_insumo_plan where cotizacion_partida_id = $1', [partida.id]),
    pool.query('select sum(cantidad) as n from public.analisis_cuadrilla where analisis_id = $1', [partida.analisis_id]),
    pool.query(`select d.id from public.obra_dependencia d
                 where d.origen_id in (select id from public.obra_actividad where cotizacion_partida_id = $1)`, [partida.id]),
  ])
  return auditarPartida({
    partida,
    actividades: act.rows,
    composicion: comp.rows,
    insumosPlan: plan.rows,
    dependencias: dep.rows,
    cuadrillaTipo: cuad.rows[0]?.n ?? null,
  })
}

const MARCA = { [VEREDICTO.CONSERVADO]: '✓', [VEREDICTO.PERDIDO]: '✗', [VEREDICTO.NO_LO_SABIA]: '·' }

async function main() {
  const pool = getPool()
  const { rows: partidas } = await pool.query(SQL_PARTIDAS)
  if (partidas.length === 0) {
    console.log('Ninguna partida se convirtió todavía en plan de obra: no hay traspaso que auditar.')
    return
  }
  const auditorias = []
  for (const p of partidas) auditorias.push(await leerPartida(pool, p))
  const r = resumirTraspaso(auditorias)

  console.log(`\nPRESUPUESTO → OBRA · ${r.partidas} partidas convertidas\n`)
  console.log('  concepto            conserva  pierde  no lo sabía')
  for (const f of r.porConcepto) {
    const alerta = f.perdido > 0 ? '  ← ' + f.rompe : ''
    console.log(`  ${f.nombre.padEnd(20)}${String(f.conservado).padStart(6)}${String(f.perdido).padStart(8)}${String(f.sinDato).padStart(12)}${alerta}`)
  }

  if (detalle) {
    for (const a of auditorias) {
      if (a.perdidos.length === 0) continue
      console.log(`\n  ${a.descripcion}`)
      for (const c of a.controles.filter((x) => x.estado === VEREDICTO.PERDIDO)) {
        console.log(`    ${MARCA[c.estado]} ${c.nombre}: ${c.detalle}`)
      }
    }
  }

  console.log(r.puenteIntacto
    ? '\n✓ el puente no pierde ningún concepto. Lo que falta, falta en el presupuesto.\n'
    : `\n✗ el puente pierde: ${r.conceptosPerdidos.join(', ')} — correr con --detalle para ver en qué partidas.\n`)
  if (r.conceptosSinDato.length > 0) {
    console.log(`  Deuda del presupuesto, no de la conversión: ${r.conceptosSinDato.join(', ')}.`)
    console.log('  Arreglar la conversión no las mueve: el dato nunca existió.\n')
  }
  // Un control que siempre sale con 0 no sirve de guardia: si el puente está roto, se nota.
  process.exitCode = r.puenteIntacto ? 0 : 1
}

main().then(() => getPool().end()).catch((e) => { console.error(e.message); process.exit(2) })
