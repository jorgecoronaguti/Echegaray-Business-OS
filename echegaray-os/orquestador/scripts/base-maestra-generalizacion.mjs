// ¿SIRVE ESTO PARA UN PROYECTO QUE NO CONOCEMOS? — MAP · COMPOSE · HH sobre la base REAL.
//
// La prueba de un motor de cotización no es que reproduzca la obra con la que se construyó: es que
// se porte igual de bien sobre una obra que no vio nunca, y que diga con nombre y apellido lo que
// NO puede cotizar. Un motor que mapea el 100 % es un motor que está inventando.
//
// Corre DOS proyectos estructuralmente distintos —uno con cómputo real cargado, otro dictado por
// teléfono sin planos— y publica los mismos once números para cada uno.
// NO escribe nada: sólo lee la base y el catálogo.
//
//   node orquestador/scripts/base-maestra-generalizacion.mjs

import { getPool } from '../lib/db.mjs'
import { baseMaestraCompleta } from './cotizador-casos-reales.mjs'
import { seleccionarTodas, ESTADO } from '../lib/plano/seleccion.mjs'
import { preguntaParaCerrar, responder } from '../lib/base-maestra-pregunta.mjs'
import { paresComplementarios, complementosDe, evaluarComposicion, paresSospechosos } from '../lib/base-maestra-completitud.mjs'
import { rendimientoConDistribucion, hhDePartida, LECTURA } from '../lib/rendimiento-distribucion.mjs'
import { ESTADO_BM } from '../lib/base-maestra-estado.mjs'

const n = (x) => (x === null || x === undefined ? null : Number(x))
const plata = (x) => (x === null ? '—' : `$ ${Math.round(x).toLocaleString('es-AR')}`)

/** Un proyecto → los ocho números. PURA salvo por lo que recibe ya leído. */
function correrProyecto({ nombre, computos }, base) {
  const { tareas, composiciones, costos, huecosPorTarea, rendimientos, pares } = base
  const sel = seleccionarTodas(computos, tareas)

  const filas = []
  let cerradasPorPregunta = 0
  let sinPreguntaPosible = 0

  for (const m of sel.mapeos) {
    const fila = { elemento: m.computo.nombre, unidad: m.computo.unidad, cantidad: n(m.computo.cantidad?.valor), estadoMapeo: m.estado, codigos: [], pregunta: null }

    if (m.estado === ESTADO.MAPEADA) {
      fila.codigos = [m.tarea.codigo]
    } else {
      // El motor no pudo. ¿Puede al menos PREGUNTAR algo contestable?
      const p = preguntaParaCerrar(m, { costos, paresComplementarios: pares })
      fila.pregunta = p
      const contestables = (p?.opciones ?? []).filter((o) => o.respuesta !== 'NO_HAY_ANALISIS')
      if (!contestables.length) { sinPreguntaPosible++ } else {
        // Se simula la respuesta RECOMENDADA sólo cuando el motor tiene una (VAN_JUNTAS). Donde no
        // la tiene, NO se elige por el usuario: se cuenta como pregunta abierta y no como mapeo.
        if (p.recomendada) {
          const r = responder(p, p.recomendada)
          if (r.ok && r.estado === ESTADO.MAPEADA) { fila.codigos = r.codigos; cerradasPorPregunta++; fila.estadoMapeo = 'CERRADA_POR_REGLA' }
        }
      }
    }

    // ── COMPOSE ──
    fila.composiciones = fila.codigos.map((cod) => {
      const t = tareas.find((x) => x.codigo === cod)
      const lineas = composiciones.get(t?.id) ?? []
      return evaluarComposicion(
        { codigo: cod, nombre: t?.nombre, unidad: t?.unidad, lineas, costoDirecto: costos[cod] ?? null, lineasSinPrecio: huecosPorTarea[cod] ?? 0 },
        { complementos: complementosDe(cod, pares), estadoDeclarado: ESTADO_BM.HISTORICO },
      )
    })

    // ── HH ──
    fila.hh = fila.codigos.map((cod) => {
      const t = tareas.find((x) => x.codigo === cod)
      const r = rendimientoConDistribucion(rendimientos.get(t?.id) ?? [], { hsAnalisis: base.hsAnalisis[cod] ?? null })
      return hhDePartida({ cantidad: fila.cantidad, unidad: fila.unidad, rendimiento: r })
    })
    filas.push(fila)
  }

  const conComposicion = filas.filter((f) => f.composiciones?.length)
  const incompletas = conComposicion.flatMap((f) => f.composiciones).filter((c) => c.estado === ESTADO_BM.INCOMPLETO)
  const hhs = filas.flatMap((f) => f.hh ?? [])
  return {
    nombre,
    aMapear: computos.length,
    mapeadasDirecto: sel.mapeadas,
    cerradasPorPregunta,
    rechazadasPorIncompatibilidad: sel.mapeos.filter((m) => m.estado === ESTADO.PARTIDA_CANDIDATA && /no hay ninguna tarea|contradecir/.test(m.porQue ?? '')).length,
    conPreguntaContestable: filas.filter((f) => f.pregunta && (f.pregunta.opciones ?? []).some((o) => o.respuesta !== 'NO_HAY_ANALISIS')).length,
    sinPreguntaPosible,
    sinComposicion: filas.filter((f) => f.codigos.length && !f.composiciones.some((c) => c.cajones && Object.keys(c.cajones).length)).length,
    composicionesIncompletas: incompletas.length,
    causasDeIncompletitud: incompletas.flatMap((c) => c.huecos.map((h) => h.causa)),
    hhConEvidenciaEcsas: hhs.filter((h) => h.estado === LECTURA.EXPERIENCIA_ECSAS).length,
    hhPorReferencia: hhs.filter((h) => h.estado === LECTURA.REFERENCIA_ANALISIS).length,
    hhSinDato: hhs.filter((h) => h.estado === LECTURA.SIN_DATO).length,
    filas,
  }
}

async function main() {
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)
  const { tareas, composiciones } = await baseMaestraCompleta(query)

  const ac = (await query(`select codigo, tarea_tipo_id, costo_directo, n_lineas_sin_precio, hs_unitarias from public.analisis_costo where vigente`)).rows
  const costos = Object.fromEntries(ac.map((r) => [r.codigo, n(r.costo_directo)]))
  const huecosPorTarea = Object.fromEntries(ac.map((r) => [r.codigo, Number(r.n_lineas_sin_precio ?? 0)]))
  const hsAnalisis = Object.fromEntries(ac.map((r) => [r.codigo, n(r.hs_unitarias)]))

  const rh = (await query(`select tarea_tipo_id, hs_unitarias, estado, confianza, obra_id from public.rendimiento_historico`)).rows
  const rendimientos = new Map()
  for (const r of rh) {
    const l = rendimientos.get(r.tarea_tipo_id) ?? []
    l.push({ hsUnitarias: n(r.hs_unitarias), estado: r.estado, confianza: r.confianza, obraId: r.obra_id })
    rendimientos.set(r.tarea_tipo_id, l)
  }
  const pares = paresComplementarios(tareas)
  const base = { tareas, composiciones, costos, huecosPorTarea, hsAnalisis, rendimientos, pares }

  // ── PROYECTO A · QUATTROPANI, las partidas REALES cargadas en COT-2026-001 ──────────────────
  const cot = (await query(`select id from public.cotizaciones where obra_nombre='Salón Comercial' and estado='borrador' order by fecha_cotizacion limit 1`)).rows[0]
  const pq = (await query(`select descripcion, unidad, cantidad from public.cotizacion_partida where cotizacion_id=$1 order by orden`, [cot.id])).rows
  const quattropani = {
    nombre: 'QUATTROPANI · Salón Comercial (hormigón + estructura metálica)',
    computos: pq.map((r, i) => ({ id: `Q-${i + 1}`, nombre: r.descripcion, unidad: r.unidad, cantidad: { valor: n(r.cantidad) } })),
  }

  // ── PROYECTO B · un dictado sin planos, estructuralmente distinto ───────────────────────────
  const dictado = [
    ['MAMPOSTERÍA LADRILLON CERÁMICO', 'M2', 520], ['PISO DE HORMIGON ALISADO MECÁNICO', 'M2', 300],
    ['REVOQUE GRUESO INTERIOR', 'M2', 640], ['CONTRAPISO PARA MOSAICO', 'M2', 300],
    ['EXCAVACION A MANO', 'M3', 45], ['PINTURA LATEX INTERIOR', 'M2', 640],
    ['CIELORRASO DE PLACA DE YESO', 'M2', 280], ['COLUMNA DE CARGA H17', 'M3', 12],
  ]
  const obraNueva = {
    nombre: 'OBRA NUEVA · dictado por teléfono, sin planos (mampostería + terminaciones)',
    computos: dictado.map(([q, u, c], i) => ({ id: `D-${i + 1}`, nombre: q, unidad: u, cantidad: { valor: c } })),
  }

  const resultados = [correrProyecto(quattropani, base), correrProyecto(obraNueva, base)]

  console.log('\n═══ BASE MAESTRA · PRUEBA DE GENERALIZACIÓN ═══')
  console.log(`catálogo: ${tareas.length} partidas con análisis vigente · ${pares.length} par(es) complementario(s) detectado(s)\n`)
  for (const r of resultados) {
    console.log(`── ${r.nombre}`)
    console.log(`   partidas a mapear .................. ${r.aMapear}`)
    console.log(`   mapeadas con atributos compatibles . ${r.mapeadasDirecto}`)
    console.log(`   cerradas por regla (VAN_JUNTAS) .... ${r.cerradasPorPregunta}`)
    console.log(`   rechazadas por incompatibilidad .... ${r.rechazadasPorIncompatibilidad}`)
    console.log(`   con pregunta CONTESTABLE ........... ${r.conPreguntaContestable}`)
    console.log(`   sin pregunta posible (crear APU) ... ${r.sinPreguntaPosible}`)
    console.log(`   sin composición .................... ${r.sinComposicion}`)
    console.log(`   composiciones INCOMPLETAS .......... ${r.composicionesIncompletas}  ${r.causasDeIncompletitud.length ? `(${[...new Set(r.causasDeIncompletitud)].join(', ')})` : ''}`)
    console.log(`   HH con evidencia ECSAS ............. ${r.hhConEvidenciaEcsas}`)
    console.log(`   HH por referencia del análisis ..... ${r.hhPorReferencia}`)
    console.log(`   HH SIN_DATO ........................ ${r.hhSinDato}\n`)
  }

  console.log('── LAS PREGUNTAS QUE EL MOTOR SABE HACER (antes no existía ninguna)')
  for (const r of resultados) {
    for (const f of r.filas.filter((x) => x.pregunta)) {
      console.log(`   [${r.nombre.split(' ·')[0]}] ${f.elemento}`)
      console.log(`      ${f.pregunta.tipo}: ${f.pregunta.pregunta}`)
      for (const o of f.pregunta.opciones) console.log(`        · ${o.respuesta} → ${o.que}`)
    }
  }

  console.log('\n── DEFECTOS DE LA BASE MAESTRA QUE ESTE FRENTE REPORTA')
  for (const p of pares) console.log(`   COMPLEMENTARIAS · ${p.miembros.map((m) => `${m.codigo} (${m.cajonDeclarado}, ${plata(costos[m.codigo])})`).join(' + ')} — «${p.raiz}» [${p.unidad}]: van SUMADAS, elegir una cotiza la mitad`)
  for (const s of paresSospechosos(tareas)) console.log(`   POSIBLE DUPLICADO · ${s.codigos.join(' / ')} — «${s.raiz}» [${s.unidad}]`)

  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
