#!/usr/bin/env node
// LA AUDITORÍA DE LA BASE MAESTRA — REPRODUCIBLE, Y QUE PUEDE DECIR QUE NO.
//
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs                    # el cuadro, sin tocar nada
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --json             # lo mismo, para otro programa
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --guardar          # graba los veredictos
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --duplicados       # sólo los pares
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --cuadrillas       # sólo el frente de cuadrillas
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --cargas           # carga social vs HH
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --cuadrillas --aplicar
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --cuadrillas --revertir
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --par T1075.1 T1111.0   # dos, lado a lado
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --fusionar T1234 T1235
//   node orquestador/scripts/xsas-basemaestra-auditar.mjs --deshacer-fusion <uuid>
//
// SIN FLAGS NO ESCRIBE NADA. Es lectura y cuadro; todo lo que muta pide su flag.
//
// ═══ QUÉ MIDE, Y CONTRA QUÉ ═══
//
// Lee la Base Maestra tal como está —205 tarea_tipo con su análisis vigente— y contesta tres
// preguntas que el dueño hizo, cada una con su evidencia al lado:
//
//   1. ¿qué pares se parecen, y son la misma partida?   → xsas-basemaestra-duplicados.mjs
//   2. ¿de dónde sale la cuadrilla de cada tarea?       → plano/cuadrilla.mjs
//   3. ¿cuántas quedan SIN_DATO, y por qué?
//
// Los dos módulos que deciden son PUROS y están probados aparte. Este archivo sólo lee, ordena e
// imprime: si el veredicto de un par cambia, cambió el clasificador o cambió el dato, nunca el
// formateo.
//
// ═══ POR QUÉ LA CARGA DE CUADRILLAS ES REVERSIBLE CON UN SOLO DELETE ═══
//
// Todo lo que este script escribe en `analisis_cuadrilla` lleva `fuente` con el prefijo
// `xsas-basemaestra`. `--revertir` borra exactamente eso y nada más: una cuadrilla que cargue una
// persona a mano no tiene ese prefijo y sobrevive. Es la misma disciplina que «respetar lo editado
// por personas».
import { getPool } from '../lib/db.mjs'
import { auditarDuplicados, planDeFusion, veredicto } from './xsas-basemaestra-duplicados.mjs'
import { cuadrillaDesdeObservaciones } from '../lib/plano/cuadrilla.mjs'

const FUENTE = 'xsas-basemaestra'
const arg = (n) => process.argv.includes(n)
const valor = (n, i = 1) => process.argv[process.argv.indexOf(n) + i]

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LECTURA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Las 205 fichas: identidad, receta, costo y cuánto se usa cada una. Cuatro consultas fijas. */
async function leerFichas(q) {
  const { rows: tareas } = await q(`
    select t.id, t.codigo, t.nombre, t.unidad, t.division, t.descripcion, t.activo,
           a.id as analisis_id, a.contexto, a.estado, a.variante,
           ac.costo_directo, ac.hs_unitarias, ac.n_lineas
      from public.tarea_tipo t
      join public.analisis a on a.tarea_tipo_id = t.id and a.vigente
      left join public.analisis_costo ac on ac.analisis_id = a.id
     order by t.codigo`)
  // El aporte de cada línea al costo directo sale de `recurso_costo`, que es donde el desperdicio
  // ya está aplicado. Rehacerlo acá daría una segunda definición del mismo número.
  const { rows: lineas } = await q(`
    select a.id as analisis_id, r.codigo as recurso, r.nombre as recurso_nombre, r.tipo, l.cantidad,
           rc.costo_con_desperdicio, rc.fecha_precio,
           round(l.cantidad * rc.costo_con_desperdicio, 2) as aporte
      from public.analisis a
      join public.analisis_linea l on l.analisis_id = a.id
      join public.recurso r on r.id = l.recurso_id
      left join public.recurso_costo rc on rc.recurso_id = r.id
     where a.vigente`)
  const { rows: usos } = await q(`
    select t.codigo,
           count(distinct cp.id)::int  as cotizaciones,
           count(distinct oa.id)::int  as actividades,
           count(distinct rh.id)::int  as rendimientos
      from public.tarea_tipo t
      left join public.cotizacion_partida cp     on cp.tarea_tipo_id = t.id
      left join public.obra_actividad oa         on oa.tarea_tipo_id = t.id
      left join public.rendimiento_historico rh  on rh.tarea_tipo_id = t.id
     group by t.codigo`)

  const porAnalisis = new Map()
  for (const l of lineas) porAnalisis.set(l.analisis_id, [...(porAnalisis.get(l.analisis_id) ?? []), l])
  const porCodigo = new Map(usos.map((u) => [u.codigo, u]))
  return tareas.map((t) => ({
    ...t,
    composicion: porAnalisis.get(t.analisis_id) ?? [],
    costoUnitario: t.costo_directo === null ? null : Number(t.costo_directo),
    hsUnitarias: t.hs_unitarias === null ? null : Number(t.hs_unitarias),
    usos: porCodigo.get(t.codigo) ?? {},
  }))
}

/** Las observaciones de cuadrilla, de las DOS fuentes que hoy existen. Cada una llega con su
 *  origen literal: la que no trae categorías llega igual, y el módulo la descarta con nombre. */
async function leerObservaciones(q) {
  const { rows } = await q(`
    select t.codigo, rh.cantidad, rh.hh_reales, rh.composicion, rh.fuente, rh.estado, rh.confianza
      from public.rendimiento_historico rh
      join public.tarea_tipo t on t.id = rh.tarea_tipo_id
     order by t.codigo, rh.cantidad`)
  const { rows: dot } = await q(`
    select t.codigo, dh.dotacion_real, dh.obra_id, dh.actividad_nombre
      from public.dotacion_historica dh
      join public.tarea_tipo t on t.id = dh.tarea_tipo_id`)
  const mapa = new Map()
  const push = (codigo, o) => mapa.set(codigo, [...(mapa.get(codigo) ?? []), o])
  for (const r of rows) {
    push(r.codigo, {
      composicion: r.composicion?.cuadrilla ?? null,
      personas: r.composicion?.personas ?? null,
      cantidad: r.cantidad === null ? null : Number(r.cantidad),
      hh: r.hh_reales === null ? null : Number(r.hh_reales),
      fuente: r.composicion?.origen ?? r.fuente ?? 'rendimiento_historico',
      tareaObservada: r.composicion?.tarea_observada ?? null,
    })
  }
  // La dotación es un NÚMERO DE PERSONAS, no una cuadrilla. Entra a propósito para que el informe
  // diga por qué no alcanza, en vez de que esa evidencia parezca no existir.
  for (const d of dot) {
    push(d.codigo, { composicion: null, personas: d.dotacion_real, fuente: `dotacion_historica · obra ${d.obra_id}` })
  }
  return mapa
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS DOS CUADROS
// ══════════════════════════════════════════════════════════════════════════════════════════════

function cuadroDuplicados(fichas) {
  const filas = auditarDuplicados(fichas)
  const porCodigo = new Map(fichas.map((f) => [f.codigo, f]))
  return filas.map((v) => ({
    ...v,
    nombreA: porCodigo.get(v.a)?.nombre, nombreB: porCodigo.get(v.b)?.nombre,
    unidadA: porCodigo.get(v.a)?.unidad, unidadB: porCodigo.get(v.b)?.unidad,
    costoA: porCodigo.get(v.a)?.costoUnitario, costoB: porCodigo.get(v.b)?.costoUnitario,
    hhA: porCodigo.get(v.a)?.hsUnitarias, hhB: porCodigo.get(v.b)?.hsUnitarias,
    plan: planDeFusion(v, porCodigo.get(v.a), porCodigo.get(v.b)),
  }))
}

function cuadroCuadrillas(fichas, observaciones) {
  return fichas.map((f) => {
    const obs = observaciones.get(f.codigo) ?? []
    const r = cuadrillaDesdeObservaciones(obs)
    return { codigo: f.codigo, nombre: f.nombre, unidad: f.unidad, analisisId: f.analisis_id,
      hhPorUnidad: f.hsUnitarias, observaciones: obs.length, ...r }
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE ESCRIBE — CADA UNO CON SU FLAG
// ══════════════════════════════════════════════════════════════════════════════════════════════

async function guardarVeredictos(q, filas, corrida) {
  for (const f of filas) {
    await q(`insert into public.base_maestra_relacion
               (codigo_a, codigo_b, veredicto, regla, por_que, evidencia, criterios, corrida)
             values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
    [f.a, f.b, f.veredicto, f.regla, f.porQue, JSON.stringify(f.ejes), f.criterios, corrida])
  }
  return filas.length
}

/** Carga sólo las tareas con veredicto UNICA o CONVERGE. Idempotente: borra lo suyo y reescribe.
 *  Lo que no es suyo —`fuente` sin el prefijo— no se toca. */
async function aplicarCuadrillas(q, cuadro) {
  const cargables = cuadro.filter((c) => c.estado === 'UNICA' || c.estado === 'CONVERGE')
  let filas = 0
  for (const c of cargables) {
    await q(`delete from public.analisis_cuadrilla where analisis_id = $1 and fuente like $2`,
      [c.analisisId, `${FUENTE}%`])
    for (const [categoria, cantidad] of Object.entries(c.composicion)) {
      await q(`insert into public.analisis_cuadrilla (analisis_id, categoria, cantidad, fuente, estado, evidencia)
               values ($1,$2,$3,$4,'CANDIDATO',$5::jsonb)
               on conflict (analisis_id, categoria) do nothing`,
      [c.analisisId, categoria, cantidad, `${FUENTE} · ${c.estado}`,
        JSON.stringify({ estado: c.estado, porQue: c.porQue, observaciones: c.usadas })])
      filas++
    }
  }
  return { tareas: cargables.length, filas }
}

async function revertirCuadrillas(q) {
  const { rowCount } = await q(`delete from public.analisis_cuadrilla where fuente like $1`, [`${FUENTE}%`])
  return rowCount
}

/**
 * FUSIONAR — y la única razón por la que esta función existe es para poder NEGARSE.
 *
 * Corre entera en UNA transacción sobre UNA conexión: el estado previo se lee, se escribe la fila
 * de fusión con su reversa, y recién entonces se desactiva. Si algo falla en el medio no queda
 * media fusión aplicada.
 */
export async function fusionar(cliente, fichas, codigoA, codigoB, corrida) {
  const a = fichas.find((f) => f.codigo === codigoA)
  const b = fichas.find((f) => f.codigo === codigoB)
  if (!a || !b) return { ok: false, porQue: `no encuentro ${!a ? codigoA : codigoB} entre las tareas vigentes` }
  const [x, y] = a.codigo < b.codigo ? [a, b] : [b, a]
  const v = veredicto(x, y)
  const plan = planDeFusion(v, x, y)
  if (!plan.ok) return plan

  const { rows: [rel] } = await cliente.query(
    `insert into public.base_maestra_relacion (codigo_a, codigo_b, veredicto, regla, por_que, evidencia, criterios, corrida)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) returning id`,
    [x.codigo, y.codigo, v.veredicto, v.regla, v.porQue, JSON.stringify(v.ejes), ['FUSION'], corrida])

  const absorbido = fichas.find((f) => f.codigo === plan.absorbido)
  const previo = { tarea_tipo: { codigo: absorbido.codigo, activo: absorbido.activo },
    analisis: { id: absorbido.analisis_id, vigente: true } }
  const { rows: [fus] } = await cliente.query(
    `insert into public.base_maestra_fusion (accion, codigo_sobrevive, codigo_absorbido, relacion_id, estado_previo, por_que)
     values ('FUSIONAR',$1,$2,$3,$4::jsonb,$5) returning id`,
    [plan.sobrevive, plan.absorbido, rel.id, JSON.stringify(previo), plan.porQue])

  await cliente.query(`update public.tarea_tipo set activo = false where codigo = $1`, [plan.absorbido])
  await cliente.query(`update public.analisis set vigente = false where id = $1`, [absorbido.analisis_id])
  return { ok: true, fusionId: fus.id, ...plan }
}

/** DESHACER — restaura el estado_previo que la fusión guardó, y deja constancia de que se deshizo. */
export async function deshacerFusion(cliente, fusionId) {
  const { rows: [f] } = await cliente.query(
    `select * from public.base_maestra_fusion where id = $1 and accion = 'FUSIONAR'`, [fusionId])
  if (!f) return { ok: false, porQue: `no existe la fusión ${fusionId}` }
  const previo = f.estado_previo
  await cliente.query(`update public.tarea_tipo set activo = $2 where codigo = $1`,
    [previo.tarea_tipo.codigo, previo.tarea_tipo.activo])
  await cliente.query(`update public.analisis set vigente = $2 where id = $1`,
    [previo.analisis.id, previo.analisis.vigente])
  await cliente.query(
    `insert into public.base_maestra_fusion (accion, revierte_a, codigo_sobrevive, codigo_absorbido, estado_previo, por_que)
     values ('DESHACER',$1,$2,$3,$4::jsonb,$5)`,
    [f.id, f.codigo_sobrevive, f.codigo_absorbido, f.estado_previo, `reversa de la fusión ${f.id}`])
  return { ok: true, restaurado: previo }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL INFORME
// ══════════════════════════════════════════════════════════════════════════════════════════════

const $ = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 }))

function imprimirDuplicados(filas) {
  console.log(`\n═══ PARES CANDIDATOS: ${filas.length} ═══`)
  for (const f of filas) {
    console.log(`\n· ${f.a} «${f.nombreA}» (${f.unidadA})  ⟷  ${f.b} «${f.nombreB}» (${f.unidadB})`)
    console.log(`  criterio ${f.criterios.join('+')} · VEREDICTO ${f.veredicto} [${f.regla}]`)
    console.log(`  ejes  unidad ${f.ejes.unidad} · nombre ${f.ejes.nombre} · receta ${f.ejes.composicion}`
      + ` · recursos ${f.ejes.recursos} (solape ${f.ejes.solapamientoRecursos}) · costo ${f.ejes.costoUnitario}`
      + ` · HH ${f.ejes.hsUnitarias} · contexto ${f.ejes.contexto}`)
    console.log(`  costo $${$(f.costoA)}/${f.unidadA} vs $${$(f.costoB)}/${f.unidadB}   ·   HH ${$(f.hhA)} vs ${$(f.hhB)}`)
    console.log(`  ${f.porQue}`)
    if (f.hallazgo) console.log(`  ⚠ HALLAZGO: ${f.hallazgo}`)
    if (f.accion) console.log(`  → ${f.accion}`)
    if (f.pregunta) console.log(`  ? PARA ${f.preguntaPara}: ${f.pregunta}`)
    console.log(`  fusión: ${f.plan.ok ? `SÍ — ${f.plan.porQue}` : 'NO — ' + f.plan.porQue}`)
  }
  const cuenta = filas.reduce((m, f) => ({ ...m, [f.veredicto]: (m[f.veredicto] ?? 0) + 1 }), {})
  console.log(`\n  resumen: ${Object.entries(cuenta).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
  console.log(`  fusionables: ${filas.filter((f) => f.plan.ok).length}`)
}

function imprimirCuadrillas(cuadro) {
  const cuenta = cuadro.reduce((m, c) => ({ ...m, [c.estado]: (m[c.estado] ?? 0) + 1 }), {})
  console.log(`\n═══ CUADRILLAS SOBRE ${cuadro.length} TAREAS ═══`)
  for (const c of cuadro.filter((x) => x.estado !== 'SIN_DATO' || x.observaciones)) {
    console.log(`\n· ${c.codigo} «${c.nombre}» (${c.unidad}) · ${$(c.hhPorUnidad)} HH/${c.unidad} · ${c.observaciones} observación(es)`)
    console.log(`  ${c.estado}${c.composicion ? ` → ${JSON.stringify(c.composicion)} (${c.personas} personas, ${c.frentes} frente/s)` : ''}`)
    console.log(`  ${c.porQue}`)
    for (const u of c.usadas) console.log(`    · ${JSON.stringify(u.observado)} — ${u.cantidad ?? '?'} u en ${u.hh ?? '?'} HH — ${u.fuente}`)
    for (const d of c.descartadas) console.log(`    ✗ ${d.porQue} — ${d.fuente}`)
  }
  console.log(`\n  resumen: ${Object.entries(cuenta).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
}

/**
 * LA CARGA SOCIAL CONTRA LAS HORAS QUE DICE COBRAR. Sale de las mismas fichas, sin otra consulta.
 *
 * La convención del libro migrado es 1 hora de carga social por cada hora de mano de obra: así
 * están T1002 (0,5/0,5), T1075 (2,8+2,2 / 2,8+2,2) y la mayoría. La migración de la Base Maestra ya
 * había contado 33 tareas con mano de obra y NINGUNA carga social. Lo que faltaba contar son las
 * que tienen carga social PARCIAL, que no aparecen en `analisis_incompleto` porque tienen las dos
 * cosas y por lo tanto no disparan ninguna de sus cuatro condiciones.
 *
 * ESTO NO AFIRMA QUE ESTÉN MAL. Un 0,70 puede ser deliberado —parte de las horas subcontratadas, o
 * personal fuera de convenio— y nadie lo escribió en ningún lado. Por eso el cuadro publica el
 * ratio y no un veredicto: es una lista de preguntas con nombre y apellido, no una corrección.
 *
 * ═══ UNA TAREA QUE SE ESCAPA DE LOS DOS CONTROLES ═══
 *
 * T1037 «DEMOLICIÓN DE OBRA» tiene 1,47 hs de mano de obra y una línea de carga social con
 * cantidad CERO. Acá cuenta como «sin ninguna carga social», que es lo que es. En
 * `analisis_incompleto` no aparece, porque su condición es `bool_or(tipo = 'carga_social')` y la
 * línea EXISTE: el cero no es vacío, y ahí una tarea subcosteada al 100 % en ese componente pasa
 * por completa. Por eso este cuadro suma sobre las cantidades y no sobre la existencia de la línea.
 */
function imprimirCargasSociales(fichas) {
  const suma = (fi, tipo) => fi.composicion.filter((l) => l.tipo === tipo).reduce((s, l) => s + Number(l.cantidad), 0)
  const filas = fichas.map((f) => ({ codigo: f.codigo, nombre: f.nombre, mo: suma(f, 'mano_obra'), cs: suma(f, 'carga_social') }))
    .filter((r) => r.mo > 0)
  const sinCs = filas.filter((r) => r.cs === 0)
  const parcial = filas.filter((r) => r.cs > 0 && Math.abs(r.cs - r.mo) > 0.001)
  console.log(`\n═══ CARGA SOCIAL vs HORAS DE MANO DE OBRA ═══`)
  console.log(`${filas.length} tareas con mano de obra · ${sinCs.length} sin ninguna carga social · ${parcial.length} con carga social PARCIAL`)
  for (const r of parcial.sort((x, y) => x.codigo < y.codigo ? -1 : 1)) {
    console.log(`  ${r.codigo.padEnd(9)} ${(r.cs / r.mo).toFixed(3).padStart(6)}  ${$(r.mo)} hs MO / ${$(r.cs)} hr CS  «${r.nombre}»`)
  }
  console.log(`  ninguno de estos es un veredicto: el ratio se publica, la explicación la tiene quien cargó la planilla`)
}

/**
 * DOS TAREAS CUALESQUIERA, LADO A LADO, CON LA DIFERENCIA DESARMADA POR COMPONENTE.
 *
 * Existe por el par T1075.1 / T1111.0: dos nombres que dicen casi lo mismo y un factor de precio de
 * 2,25 entre ellos. Un factor no se explica mirando el total —el total es el síntoma—: se explica
 * separando mano de obra, cargas sociales, materiales y equipos, y después mirando qué línea está
 * en uno y no en el otro. Eso es lo que imprime esto.
 *
 * Ninguno de estos dos pares es candidato a duplicado, y por eso el modo existe aparte: el criterio
 * de candidatos es duro a propósito, y esta pregunta la trae una persona.
 */
function imprimirPar(fichas, ca, cb) {
  const a = fichas.find((f) => f.codigo === ca)
  const b = fichas.find((f) => f.codigo === cb)
  if (!a || !b) return console.log(`no encuentro ${!a ? ca : cb}`)
  const f = (x, y) => (x && y ? `×${(Math.max(x, y) / Math.min(x, y)).toFixed(2)}` : '—')
  const suma = (fi, tipo) => fi.composicion.filter((l) => l.tipo === tipo)
    .reduce((s, l) => s + Number(l.cantidad), 0)
  console.log(`\n═══ ${a.codigo} «${a.nombre}» (${a.unidad})  vs  ${b.codigo} «${b.nombre}» (${b.unidad}) ═══`)
  console.log(`costo unitario  $${$(a.costoUnitario)}  vs  $${$(b.costoUnitario)}   ${f(a.costoUnitario, b.costoUnitario)}`)
  console.log(`HH por unidad   ${$(a.hsUnitarias)}  vs  ${$(b.hsUnitarias)}   ${f(a.hsUnitarias, b.hsUnitarias)}`)
  for (const tipo of ['mano_obra', 'carga_social', 'material', 'equipo', 'otro']) {
    const [x, y] = [suma(a, tipo), suma(b, tipo)]
    if (x || y) console.log(`  cantidad de ${tipo.padEnd(13)} ${$(x)} vs ${$(y)}   ${f(x, y)}`)
  }
  const en = (fi) => new Map(fi.composicion.map((l) => [l.recurso, l]))
  const [ma, mb] = [en(a), en(b)]
  const linea = (l) => `${l.recurso_nombre} — ${l.cantidad} × $${$(l.costo_con_desperdicio)} = $${$(l.aporte)} (${l.tipo}, precio ${l.fecha_precio?.toISOString?.().slice(0, 10) ?? 'sin fecha'})`
  let soloA = 0
  let soloB = 0
  console.log(`\nsólo en ${a.codigo}:`)
  for (const [k, l] of ma) if (!mb.has(k)) { soloA += Number(l.aporte ?? 0); console.log(`  + ${linea(l)}`) }
  console.log(`  Σ $${$(soloA)}`)
  console.log(`sólo en ${b.codigo}:`)
  for (const [k, l] of mb) if (!ma.has(k)) { soloB += Number(l.aporte ?? 0); console.log(`  + ${linea(l)}`) }
  console.log(`  Σ $${$(soloB)}`)
  console.log(`en los dos, con cantidad distinta:`)
  for (const [k, l] of ma) {
    const o = mb.get(k)
    if (o && Number(o.cantidad) !== Number(l.cantidad)) {
      console.log(`  ≠ ${l.recurso_nombre}: ${l.cantidad} ($${$(l.aporte)}) vs ${o.cantidad} ($${$(o.aporte)})   ${f(Number(l.cantidad), Number(o.cantidad))}`)
    }
  }
  console.log(`\nveredicto del clasificador: ${veredicto(a, b).veredicto} [${veredicto(a, b).regla}]`)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = getPool()
  const q = (s, p) => pool.query(s, p)
  const corrida = `xsas-G · ${new Date().toISOString()}`
  const fichas = await leerFichas(q)
  const observaciones = await leerObservaciones(q)
  const dup = cuadroDuplicados(fichas)
  const cua = cuadroCuadrillas(fichas, observaciones)

  if (arg('--json')) {
    console.log(JSON.stringify({ tareas: fichas.length, duplicados: dup, cuadrillas: cua }, null, 2))
  } else if (arg('--par')) {
    imprimirPar(fichas, valor('--par', 1), valor('--par', 2))
  } else if (arg('--fusionar')) {
    const cliente = await pool.connect()
    try {
      await cliente.query('begin')
      const r = await fusionar(cliente, fichas, valor('--fusionar', 1), valor('--fusionar', 2), corrida)
      if (!r.ok) { await cliente.query('rollback'); console.log('NO SE FUSIONA:', r.porQue) } else {
        await cliente.query('commit'); console.log('FUSIONADO:', JSON.stringify(r, null, 2))
      }
    } finally { cliente.release() }
  } else if (arg('--deshacer-fusion')) {
    const cliente = await pool.connect()
    try {
      await cliente.query('begin')
      const r = await deshacerFusion(cliente, valor('--deshacer-fusion'))
      await cliente.query(r.ok ? 'commit' : 'rollback')
      console.log(JSON.stringify(r, null, 2))
    } finally { cliente.release() }
  } else {
    console.log(`Base Maestra: ${fichas.length} tareas con análisis vigente · corrida ${corrida}`)
    const solo = ['--cuadrillas', '--duplicados', '--cargas'].filter(arg)
    const mostrar = (n) => solo.length === 0 || solo.includes(n)
    if (mostrar('--duplicados')) imprimirDuplicados(dup)
    if (mostrar('--cuadrillas')) imprimirCuadrillas(cua)
    if (mostrar('--cargas')) imprimirCargasSociales(fichas)
    if (arg('--guardar')) console.log(`\n✓ ${await guardarVeredictos(q, dup, corrida)} veredictos guardados en base_maestra_relacion`)
    if (arg('--aplicar')) console.log(`\n✓ cuadrillas cargadas: ${JSON.stringify(await aplicarCuadrillas(q, cua))}`)
    if (arg('--revertir')) console.log(`\n✓ ${await revertirCuadrillas(q)} filas de analisis_cuadrilla con fuente «${FUENTE}*» eliminadas`)
  }
  await pool.end()
}

if (import.meta.url === `file://${process.argv[1]}`) await main()

export { leerFichas, leerObservaciones, cuadroDuplicados, cuadroCuadrillas, aplicarCuadrillas, revertirCuadrillas, FUENTE }
