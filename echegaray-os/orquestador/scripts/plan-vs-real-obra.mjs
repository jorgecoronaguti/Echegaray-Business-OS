#!/usr/bin/env node
// PLAN vs REAL DE UNA OBRA REAL.
//
//   node orquestador/scripts/plan-vs-real-obra.mjs <obra_id> [--cotizacion <uuid>] [--aplicar]
//   node orquestador/scripts/plan-vs-real-obra.mjs --obras          ← qué obras tienen con qué comparar
//
// ═══ POR DEFECTO NO ESCRIBE ═══
//
// Sin `--aplicar` todo corre dentro de una transacción que termina en ROLLBACK. Los números que
// imprime son reales —salen de escribir de verdad y volver a leer—, pero la base queda igual. Es la
// única forma honesta de contestar «¿cuántas relaciones quedarían establecidas?» sin establecerlas.
//
// ═══ LO QUE NO HACE ═══
//
// No inventa la genealogía. Si la obra no tiene una cotización CONGELADA candidata, dice que no y
// termina: elegir «la más parecida» entre dos versiones adjudicadas es exactamente la decisión que
// no le toca a un script.

import { randomUUID } from 'node:crypto'
import { getPool } from '../lib/db.mjs'
import { huellaDeEntradas } from '../lib/cotizador/freeze.mjs'
import { genealogiaDeObra, heredarPlan } from '../lib/cotizador/obra.mjs'
import { consolidarEjecucion } from '../lib/cotizador/ejecucion-real.mjs'
import { compararObra, NO_COMPARABLE } from '../lib/cotizador/plan-vs-real.mjs'
import {
  guardarGenealogia, guardarPlan, enlazarActividad, leerPlanDeObra, leerEjecucionReal,
  guardarObservaciones, leerGenealogia,
} from '../lib/cotizador/obra-pg.mjs'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const obraId = args.find((a) => !a.startsWith('--'))
// `indexOf` devuelve −1 cuando la bandera no está, y `args[-1+1]` es `args[0]` — o sea el NOMBRE DE
// LA OBRA. Con eso, el filtro por id no encontraba nada y el script decía «no hay ninguna versión
// congelada» sobre una obra que tiene dos. Un mensaje de «no hay» que en realidad era «no busqué».
const cotArg = args.includes('--cotizacion') ? args[args.indexOf('--cotizacion') + 1] : null
const $ = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n))
const pct = (n) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`)

async function inventario(pool) {
  const { rows } = await pool.query(`
    select oc.id obra, oc.nombre,
           (select count(*)::int from obra_actividad a where a.obra_id = oc.id) actividades,
           (select count(*)::int from obra_actividad a where a.obra_id = oc.id and a.cotizacion_partida_id is not null) ligadas,
           (select count(*)::int from obra_ejecucion e where e.obra_id = oc.id) partes,
           (select count(*)::int from obra_ejecucion e where e.obra_id = oc.id and e.cantidad is not null) partes_con_cantidad,
           (select count(*)::int from registros_hh h join obra_actividad a on a.id = h.actividad_id where a.obra_id = oc.id) imputaciones_hh,
           (select count(*)::int from cotizaciones c where c.obra_canonica_id = oc.id and c.congelada_en is not null) versiones_congeladas
      from obra_canonica oc order by 5 desc, 4 desc`)
  console.table(rows.filter((r) => r.actividades > 0))
}

/**
 * EL TESTIGO — no la huella del congelado.
 *
 * ═══ POR QUÉ ESTO NO VA A `huella_sha256` ═══
 *
 * La huella del congelado vale porque se tomó EN el congelado. Calcular un sha256 hoy sobre las
 * mismas filas y guardarlo ahí sería un sello con fecha falsa: certificaría el estado de hoy
 * afirmando que es el del 22/08.
 *
 * Y no hay forma de saber si son el mismo estado. Medido: `cotizacion_evento` —el registro
 * append-only de cambios— se creó el 29/08 13:09, SIETE DÍAS después de que v1 se congelara el
 * 22/08 16:23, con cero eventos para v1; y `cotizacion_partida` no tiene ninguna columna de
 * modificación, sólo `creado_en`. Un UPDATE en esa ventana no dejó rastro en ningún lado.
 *
 * Lo que sí sirve: este hash es el punto de partida HACIA ADELANTE. No prueba que v1 no cambió
 * entre el 22 y hoy —eso ya no se puede probar—, pero desde este momento un cambio en v1 se
 * detecta. Por eso viaja en `nota`, rotulado, y `huella_sha256` queda en NULL.
 */
async function testigoDeHoy(q, cotizacionId, congeladaEn) {
  const partidas = await q(`select codigo, cantidad, unidad from public.cotizacion_partida where cotizacion_id = $1`, [cotizacionId])
  // Los precios salen de la composición CONGELADA, no de `recurso_precio`: esa tabla se mueve, y la
  // composición guardó el costo, la moneda y la fecha del precio tal como entraron al congelado.
  const precios = await q(
    `select c.recurso_codigo, c.costo_unitario, c.moneda, c.fecha_precio
       from public.cotizacion_partida_composicion c
       join public.cotizacion_partida p on p.id = c.partida_id
      where p.cotizacion_id = $1`, [cotizacionId])
  const pol = (await q(`select pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
                               pct_iibb, pct_ganancias, pct_cheque, pct_iva from public.cotizaciones where id = $1`, [cotizacionId]))[0]
  const h = huellaDeEntradas({
    partidas,
    precios: precios.map((r) => ({ recursoCodigo: r.recurso_codigo, precio: r.costo_unitario, moneda: r.moneda, observadoEn: r.fecha_precio, fuente: 'composicion_congelada' })),
    politica: {
      pctGastosGenerales: pol.pct_gastos_generales, pctBeneficio: pol.pct_beneficio, pctFinanciero: pol.pct_financiero,
      factorFinanciero: pol.factor_financiero, pctIibb: pol.pct_iibb, pctGanancias: pol.pct_ganancias,
      pctCheque: pol.pct_cheque, pctIva: pol.pct_iva,
    },
    hoy: congeladaEn,
  })
  return h
}

/** Candidata: una versión CONGELADA de esta obra. Si hay más de una, NO elige. */
async function candidata(q, obra) {
  const filas = await q(`select id, numero, version, congelada_en, costo_estimado, monto_venta,
                                (select count(*)::int from cotizacion_partida p where p.cotizacion_id = c.id) partidas
                           from public.cotizaciones c
                          where c.obra_canonica_id = $1 and c.congelada_en is not null
                          order by version desc`, [obra])
  if (cotArg) return filas.find((f) => f.id === cotArg) ?? null
  if (filas.length > 1) {
    console.log(`⚠ ${filas.length} versiones congeladas de esta obra. El script NO elige: pasar --cotizacion <uuid>.`)
    console.table(filas.map((f) => ({ id: f.id, numero: f.numero, version: f.version, partidas: f.partidas })))
    return null
  }
  return filas[0] ?? null
}

async function main() {
  const pool = getPool()
  if (args.includes('--obras') || !obraId) { await inventario(pool); await pool.end(); return }

  const c = await pool.connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const puerta = { query: q }
  await c.query('begin')

  try {
    const ya = await leerGenealogia(puerta, obraId)
    const cot = ya ? { id: ya.cotizacion_id, numero: ya.numero, version: ya.version, congelada_en: ya.congelada_en, costo_estimado: ya.costo_estimado, monto_venta: ya.meta_ingreso } : await candidata(q, obraId)
    if (!cot) { console.log(`✗ ${obraId}: no hay ninguna versión CONGELADA para comparar. SIN_GENEALOGIA — que NO es «sin desvío».`); return }

    console.log(`\n═══ ${obraId} · contra ${cot.numero} v${cot.version} (congelada ${String(cot.congelada_en).slice(0, 10)}) ═══\n`)

    // ── 1 · genealogía y plan
    const testigo = await testigoDeHoy(q, cot.id, cot.congelada_en)
    const g = genealogiaDeObra({
      obraId, adjudicadaPor: null,
      // `huella: null` a propósito. El testigo va a `nota`, rotulado, para que nadie lo lea como la
      // huella del congelado. Ver `testigoDeHoy` para por qué esa distinción no es un formalismo.
      nota: `testigo-desde-${new Date().toISOString().slice(0, 10)}:${testigo.sha256} · NO es la huella del congelado (${testigo.resumen})`,
      congelada: { id: cot.id, numero: cot.numero, version: cot.version, congeladaEn: cot.congelada_en, costo_estimado: cot.costo_estimado, monto_venta: cot.monto_venta, huella: null },
    })
    if (!g.listo) { console.log('✗ genealogía bloqueada:', g.bloqueos.map((b) => b.detalle).join(' · ')); return }
    const origen = await guardarGenealogia(puerta, g.genealogia)

    const partidas = await q(`select partida_id, codigo, descripcion, unidad, cantidad, hs_unitarias,
                                     costo_unitario, subtotal, subcontratada, precio_subcontrato
                                from public.cotizacion_partida_valorizada where cotizacion_id = $1 order by orden`, [cot.id])
    const heredado = heredarPlan({ genealogia: g.genealogia, partidas })
    await guardarPlan(puerta, { origenId: origen.id, obraId, filas: heredado.filas })

    // ── 2 · enlazar cada partida del plan con su actividad, por el puntero que YA existe
    const actividades = await q(`select id, cotizacion_partida_id from public.obra_actividad
                                  where obra_id = $1 and cotizacion_partida_id is not null and not archivada`, [obraId])
    let enlazadas = 0
    for (const a of actividades) {
      const r = await enlazarActividad(puerta, { obraId, cotizacionPartidaId: a.cotizacion_partida_id, actividadId: a.id })
      if (r) enlazadas += 1
    }

    // ── 3 · consolidar y comparar
    const plan = await leerPlanDeObra(puerta, obraId)
    const cruda = await leerEjecucionReal(puerta, obraId, { partidaIds: plan.map((p) => p.cotizacionPartidaId) })
    const ejecucion = consolidarEjecucion({ plan, ...cruda })
    const r = compararObra({ obraId, plan, ejecucion })

    const corridaId = randomUUID()
    const guardadas = await guardarObservaciones(puerta, { obraId, observaciones: r.observaciones, corridaId })

    // ── 4 · los números
    console.log('RELACIONES ESTABLECIDAS')
    console.table([{
      'partidas de la cotización': partidas.length,
      'partidas del plan heredado': plan.length,
      'partidas ligadas a una actividad': enlazadas,
      'partidas SIN actividad': plan.length - enlazadas,
      'costo plan heredado': $(heredado.resumen.costoPlanTotal),
      'meta de ingreso (NO es costo)': $(g.genealogia.metaIngreso),
    }])

    console.log('\nLO QUE LA OBRA REGISTRÓ')
    console.table([{
      'partes de obra': cruda.ejecuciones.length,
      'imputaciones de HH': cruda.horas.length,
      'horas de equipo': cruda.equipos.length,
      'costos imputados a partida': cruda.costos.length,
      'filas de composición': cruda.composicion.length,
      'partidas con cantidad real': ejecucion.resumen.conCantidadReal,
      'partidas sólo con %': ejecucion.resumen.soloPorcentaje,
      'partidas sin nada': ejecucion.resumen.sinNingunRegistro,
      'partidas cerradas': ejecucion.resumen.cerradas,
    }])

    console.log('\nOBSERVACIONES')
    console.table([{
      'observaciones': r.resumen.observaciones, 'guardadas': guardadas,
      'COMPARABLES': r.resumen.comparables, 'no comparables': r.resumen.noComparables,
      'con causa declarada': r.resumen.conCausa, 'SIN_CAUSA': r.resumen.sinCausa,
      'desvío % promedio': r.resumen.desvioPctPromedio === null ? 'null (sin nada que promediar)' : pct(r.resumen.desvioPctPromedio),
    }])

    console.log('\nPOR QUÉ NO SE PUDO COMPARAR')
    console.table(Object.entries(r.resumen.porMotivo).map(([motivo, n]) => ({ motivo, observaciones: n, 'qué falta': EXPLICACION[motivo] ?? '' })))

    const conDesvio = r.observaciones.filter((o) => o.comparable)
    if (conDesvio.length) {
      console.log('\nLAS COMPARACIONES QUE SÍ SE PUDIERON HACER')
      console.table(conDesvio.map((o) => ({ partida: o.entidad, concepto: o.concepto, plan: o.plan, real: o.real, desvío: o.desvio, '%': pct(o.desvioPct), causa: o.causa })))
    } else {
      console.log('\n⚠ CERO comparaciones posibles. Eso NO es «la obra va bien»: es que no hay con qué mirarla.')
    }

    console.log('\nEJECUCIÓN REAL QUE NO ENGANCHÓ CON NINGUNA PARTIDA')
    console.table([r.resumen.sinImputar])

    console.log(aplicar ? `\n✓ APLICADO. corrida ${corridaId}` : '\n⟲ ROLLBACK: la base quedó como estaba. Con --aplicar se persiste.')
  } finally {
    await c.query(aplicar ? 'commit' : 'rollback')
    c.release()
    await pool.end()
  }
}

const EXPLICACION = Object.freeze({
  [NO_COMPARABLE.SIN_PLAN]: 'la cotización congelada no trae ese dato (cantidad, hs unitarias o costo)',
  [NO_COMPARABLE.SIN_REAL]: 'nadie registró ejecución en esa partida todavía',
  [NO_COMPARABLE.SOLO_PORCENTAJE]: 'el parte cargó avance % y no cantidad: cargar la cantidad en obra_ejecucion',
  [NO_COMPARABLE.PARTIDA_EN_CURSO]: 'la partida está empezada: se compara cuando llegue al 100%',
  [NO_COMPARABLE.SIN_HH_REALES]: 'no hay registros_hh con actividad_id de esa partida',
  [NO_COMPARABLE.SIN_COSTO_REAL]: 'ningún comprobante está imputado a esa partida (obra_partida_costo_real)',
  [NO_COMPARABLE.SUBCONTRATADA_SIN_HH]: 'correcto: una partida subcontratada no lleva HH propias',
  [NO_COMPARABLE.SIN_CONSUMO_REGISTRADO]: 'el recurso está cotizado y no hay compra imputada',
  [NO_COMPARABLE.SIN_RECURSO_EN_COMPOSICION]: 'se consumió algo que la cotización no previó — mirarlo',
})

await main()
