#!/usr/bin/env node
// POR QUÉ NO SE PUEDE COMPARAR — la causa raíz de cada hueco, medida sobre la base real.
//
//   node orquestador/scripts/xsas-planreal-causas.mjs            ← todas las obras
//   node orquestador/scripts/xsas-planreal-causas.mjs --json      ← para encadenar
//
// ═══ NO ESCRIBE NUNCA ═══
//
// Todo corre dentro de una transacción que termina en ROLLBACK. Necesita escribir —el plan heredado
// y las observaciones se calculan escribiendo y volviendo a leer— pero la base queda igual. Sin la
// transacción habría que elegir entre no medir o ensuciar la base de otros siete agentes.
//
// ═══ QUÉ CONTESTA, Y POR QUÉ NO ALCANZA CON LA TABLA DE MOTIVOS ═══
//
// El informe de `plan-vs-real-obra.mjs` publica los MOTIVOS. Un motivo no se puede repartir:
// «SIN_CONSUMO_REGISTRADO ×275» parece 275 comprobantes perdidos y es UNA captura vacía contada 275
// veces. Acá cada observación recibe su CAUSA RAÍZ y su DISPOSICIÓN —OS, obra, tiempo o alcance— y
// eso sí es una lista de trabajo.
//
// ═══ Y EL DENOMINADOR QUE NO SE VE ═══
//
// Las obras SIN genealogía no aportan observaciones malas: no aportan ninguna. Por eso el cuadro
// empieza por la cobertura y marca `SESGADO` mientras falte una obra. «2 comparables de 406» sin esa
// línea al lado se lee como el estado de la empresa cuando es el de una sola obra.

import { getPool } from '../lib/db.mjs'
import { genealogiaDeObra, heredarPlan } from '../lib/cotizador/obra.mjs'
import { consolidarEjecucion } from '../lib/cotizador/ejecucion-real.mjs'
import { compararObra, CONCEPTO } from '../lib/cotizador/plan-vs-real.mjs'
import {
  cuadroDeCausas, coberturaDeObras, comparabilidadViva, DISPOSICION,
} from '../lib/cotizador/plan-real-causas.mjs'
import { leerPlanDeObra, leerEjecucionReal, guardarGenealogia, guardarPlan, enlazarActividad } from '../lib/cotizador/obra-pg.mjs'

const comoJson = process.argv.includes('--json')

/** El universo: toda obra con ejecución registrada, tenga o no con qué compararse. */
async function universo(q) {
  return q(`
    select oc.id obra_id,
           (select count(*)::int from obra_ejecucion e where e.obra_id = oc.id) partes,
           (select count(*)::int from registros_hh h join obra_actividad a on a.id = h.actividad_id
             where a.obra_id = oc.id) imputaciones_hh,
           (select count(*)::int from cotizaciones c
             where c.obra_canonica_id = oc.id and c.congelada_en is not null) congeladas,
           (select count(*)::int from obra_actividad a
             where a.obra_id = oc.id and a.cotizacion_partida_id is not null and not a.archivada) ligadas
      from obra_canonica oc order by 2 desc`)
}

/**
 * ¿ESTÁ VACÍA LA PUERTA DE ENTRADA DE CADA DATO, EN ESTA OBRA?
 *
 * Es lo que separa «nadie cargó nunca esto» de «hay datos y no enganchan». Se mide por OBRA y no
 * globalmente: una obra puede tener toda su captura de costos y otra ninguna, y el arreglo es
 * distinto en cada una.
 */
async function capturaVaciaDe(q, obraId) {
  const [{ costos }] = await q('select count(*)::int costos from obra_partida_costo_real where obra_id = $1', [obraId])
  const [{ hh }] = await q('select count(*)::int hh from registros_hh h join obra_actividad a on a.id = h.actividad_id where a.obra_id = $1', [obraId])
  const [{ cant }] = await q('select count(*)::int cant from obra_ejecucion where obra_id = $1 and cantidad is not null', [obraId])
  return Object.freeze({
    [CONCEPTO.COSTO]: costos === 0, [CONCEPTO.MATERIAL]: costos === 0, [CONCEPTO.PRECIO]: costos === 0,
    [CONCEPTO.HH]: hh === 0, [CONCEPTO.RENDIMIENTO]: hh === 0, [CONCEPTO.CANTIDAD]: cant === 0,
  })
}

/**
 * ¿PUEDE ESTA PARTIDA LLEGAR AL 100 %?
 *
 * `cerrada` exige un parte con `avance_pct >= 100`. Si NINGÚN parte de la actividad trae porcentaje,
 * el cierre no puede llegar nunca y «se compara cuando cierre» es una promesa vacía. Devuelve el
 * conjunto de partidas que SÍ tienen por dónde cerrar.
 */
async function partidasQuePuedenCerrar(q, obraId) {
  const filas = await q(`
    select distinct a.cotizacion_partida_id pid
      from obra_ejecucion e join obra_actividad a on a.id = e.actividad_id
     where e.obra_id = $1 and a.cotizacion_partida_id is not null and e.avance_pct is not null`, [obraId])
  return new Set(filas.map((f) => String(f.pid)))
}

async function cronogramaConDias(q, obraId) {
  const filas = await q(`
    select cotizacion_partida_id pid from obra_actividad
     where obra_id = $1 and cotizacion_partida_id is not null and not archivada and dias_plan is not null`, [obraId])
  return new Set(filas.map((f) => String(f.pid)))
}

/** Una obra con genealogía, comparada de punta a punta. Escribe y revierte. */
async function medirObra(q, obraId) {
  const cots = await q(`select id, numero, version, congelada_en, costo_estimado, monto_venta
                          from cotizaciones where obra_canonica_id = $1 and congelada_en is not null
                         order by version`, [obraId])
  if (!cots.length) return null
  // Con más de una congelada el script NO elige: toma la PRIMERA por versión y lo declara. Elegir
  // «la más parecida» entre dos adjudicadas es una decisión del dueño, no de un medidor.
  const cot = cots[0]

  const g = genealogiaDeObra({
    obraId, adjudicadaPor: null, nota: 'medicion-de-causas (rollback)',
    congelada: { id: cot.id, numero: cot.numero, version: cot.version, congeladaEn: cot.congelada_en, costo_estimado: cot.costo_estimado, monto_venta: cot.monto_venta, huella: null },
  })
  if (!g.listo) return { obraId, bloqueado: g.bloqueos.map((b) => b.detalle).join(' · ') }
  const origen = await guardarGenealogia({ query: q }, g.genealogia)

  const partidas = await q(`select partida_id, codigo, descripcion, unidad, cantidad, hs_unitarias,
                                   costo_unitario, subtotal, subcontratada, precio_subcontrato
                              from cotizacion_partida_valorizada where cotizacion_id = $1 order by orden`, [cot.id])
  const heredado = heredarPlan({ genealogia: g.genealogia, partidas })
  await guardarPlan({ query: q }, { origenId: origen.id, obraId, filas: heredado.filas })

  const acts = await q(`select id, cotizacion_partida_id from obra_actividad
                         where obra_id = $1 and cotizacion_partida_id is not null and not archivada`, [obraId])
  for (const a of acts) await enlazarActividad({ query: q }, { obraId, cotizacionPartidaId: a.cotizacion_partida_id, actividadId: a.id })

  const plan = await leerPlanDeObra({ query: q }, obraId)
  const cruda = await leerEjecucionReal({ query: q }, obraId, { partidaIds: plan.map((p) => p.cotizacionPartidaId) })
  const r = compararObra({ obraId, plan, ejecucion: consolidarEjecucion({ plan, ...cruda }) })

  const vacia = await capturaVaciaDe(q, obraId)
  const cierran = await partidasQuePuedenCerrar(q, obraId)
  const conDias = await cronogramaConDias(q, obraId)
  const conActividad = new Set(plan.filter((p) => p.actividadId).map((p) => String(p.cotizacionPartidaId)))

  // Una partida «con ejecución» es la que registró algo real: un parte o una hora. Sin esto, las
  // partidas que nadie tocó salían clasificadas como problema de clave — ver `causaRaiz`.
  const conEjecucion = new Set(consolidarEjecucion({ plan, ...cruda }).partidas
    .filter((p) => p.cantidad.valor !== null || p.avancePct !== null || p.hhReales.valor !== null)
    .map((p) => String(p.cotizacionPartidaId)))

  const cuadro = cuadroDeCausas(r.observaciones, (o) => {
    const pid = String(o.cotizacionPartidaId ?? '')
    return {
      tieneGenealogia: true,
      partidaConActividad: conActividad.has(pid),
      partidaConEjecucion: conEjecucion.has(pid),
      puedeCerrar: cierran.has(pid),
      cronogramaTieneDias: conDias.has(pid),
      capturaVacia: vacia,
    }
  })
  return {
    obraId, cotizacion: `${cot.numero} v${cot.version}`, congeladasDisponibles: cots.length,
    resumen: r.resumen, cuadro, viva: comparabilidadViva({ comparables: r.resumen.comparables, cuadro }),
  }
}

async function main() {
  const pool = getPool()
  const c = await pool.connect()
  const q = async (sql, p) => (await c.query(sql, p)).rows
  await c.query('begin')
  const salida = { obras: [], cobertura: null, huerfanos: null }
  try {
    const inv = await universo(q)
    salida.cobertura = coberturaDeObras(inv.map((o) => ({
      obraId: o.obra_id, partes: o.partes, imputacionesHH: o.imputaciones_hh, tieneGenealogia: o.congeladas > 0 && o.ligadas > 0,
    })))

    // ═══ LO QUE NO PERTENECE A NINGUNA OBRA ═══
    // `leerEjecucionReal` llega a las HH por `join obra_actividad`. Una imputación sin actividad no
    // entra por esa puerta y TAMPOCO sale en `sinImputar`, que filtra la lista ya filtrada. O sea:
    // no está en ningún lado. Se cuenta acá para que exista en algún número.
    const [h] = await q(`select count(*)::int filas, coalesce(sum(horas), 0)::numeric horas
                           from registros_hh where actividad_id is null`)
    salida.huerfanos = { imputacionesHHSinActividad: h.filas, horas: Number(h.horas) }

    for (const o of inv) {
      if (!(o.partes > 0 || o.imputaciones_hh > 0)) continue
      const m = await medirObra(q, o.obra_id)
      salida.obras.push(m ?? { obraId: o.obra_id, sinGenealogia: true, partes: o.partes, imputacionesHH: o.imputaciones_hh })
    }
  } finally {
    await c.query('rollback')
    c.release()
    await pool.end()
  }

  if (comoJson) { console.log(JSON.stringify(salida, null, 2)); return }

  console.log('\n═══ COBERTURA DEL UNIVERSO ═══')
  console.table([{ ...salida.cobertura, detalleNoMiradas: undefined }])
  if (salida.cobertura.sesgado) {
    console.log('⚠ SESGADO: estas obras tienen ejecución y NINGUNA observación. No bajan ningún promedio porque no existen en el cuadro.')
    console.table(salida.cobertura.detalleNoMiradas)
  }
  console.log('\nHH QUE NO PERTENECEN A NINGUNA OBRA (no entran por el join, y tampoco salen en sinImputar)')
  console.table([salida.huerfanos])

  for (const o of salida.obras) {
    if (o.sinGenealogia) { console.log(`\n── ${o.obraId}: SIN GENEALOGÍA · ${o.partes} partes y ${o.imputacionesHH} imputaciones que NO se comparan contra nada`); continue }
    if (o.bloqueado) { console.log(`\n── ${o.obraId}: BLOQUEADA · ${o.bloqueado}`); continue }
    console.log(`\n═══ ${o.obraId} · contra ${o.cotizacion}${o.congeladasDisponibles > 1 ? ` (de ${o.congeladasDisponibles} congeladas; el script NO elige)` : ''} ═══`)
    console.table([{ observaciones: o.resumen.observaciones, COMPARABLES: o.resumen.comparables, 'no comparables': o.resumen.noComparables }])
    console.log('COMPARABILIDAD SOBRE LO VIVO — lo que no empezó NO va al denominador')
    console.table([{ ...o.viva, 'tasa cruda (denominador inflado)': `${o.resumen.comparables}/${o.resumen.observaciones}` }])
    console.log('POR CAUSA RAÍZ')
    console.table(Object.entries(o.cuadro.porCausa).sort((a, b) => b[1] - a[1]).map(([causa, n]) => ({ causa, observaciones: n })))
    console.log('POR DISPOSICIÓN — quién lo arregla')
    console.table([{
      'ESTRUCTURA (el OS, hoy)': o.cuadro.recuperablesPorEstructura,
      'FALTA_DATO (alguien lo carga)': o.cuadro.faltaDatoDeclarado,
      'no son defecto (tiempo / no aplica)': o.cuadro.noSonDefecto,
      'ALCANCE (decisión comercial)': o.cuadro.porDisposicion[DISPOSICION.ALCANCE] ?? 0,
    }])
    console.log('QUÉ HAY QUE HACER, agrupado')
    const acciones = {}
    for (const f of o.cuadro.filas) acciones[`${f.disposicion} · ${f.arregla}`] = (acciones[`${f.disposicion} · ${f.arregla}`] ?? 0) + 1
    console.table(Object.entries(acciones).sort((a, b) => b[1] - a[1]).map(([accion, n]) => ({ accion, observaciones: n })))
  }
  console.log('\n⟲ ROLLBACK: la base quedó como estaba.')
}

await main()
