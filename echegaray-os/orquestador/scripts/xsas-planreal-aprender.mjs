#!/usr/bin/env node
// EL CIRCUITO DE APRENDIZAJE, EJERCITADO CONTRA LA BASE REAL.
//
//   node orquestador/scripts/xsas-planreal-aprender.mjs                 ← el veredicto de hoy
//   node orquestador/scripts/xsas-planreal-aprender.mjs --probar-el-si  ← prueba que PUEDE promover
//
// ═══ POR QUÉ HACE FALTA EJERCITARLO ═══
//
// Hay 10 CANDIDATO en `conocimiento_empresa` y 2 en `rendimiento_historico`, y ninguno atravesó el
// circuito completo: nadie los contrastó, nadie los pasó por la compuerta de regresión y nadie
// registró por qué siguen siendo candidatos. Un circuito que nunca rechazó ni promovió nada NO está
// probado — está sin ejercitar, y las dos cosas se ven igual desde afuera.
//
// ═══ EL MODO `--probar-el-si` ═══
//
// Un circuito que sólo dice que no también puede ser una constante. Con esta bandera se inserta UN
// caso sintético —prefijo `ZZ-`, de una obra que no existe— para demostrar que con dos mediciones
// consistentes de obras distintas el circuito SÍ promueve, y después se revierte.
//
// Toda la corrida vive en UNA conexión de `pool.connect()` dentro de `begin`/`rollback`. Con
// `pool.query` cada sentencia cae en una conexión distinta y el rollback no revierte nada: ya pasó
// en este repo y sobrevivieron 4 de 6 filas.

import { getPool } from '../lib/db.mjs'
import { expedienteDe, promocionDe, regresionDe, ESTADO_APRENDIZAJE } from '../lib/plano/aprender.mjs'

const probarElSi = process.argv.includes('--probar-el-si')
const OBRA_SINTETICA = 'ZZ-obra-de-prueba-del-circuito'

// Una fecha que llega como Date y se pasa por `String()` da «Sat Aug 22», que no ordena ni se
// compara. El rango del expediente se arma ordenando strings: con ese formato, agosto va antes que
// abril y el «desde» sale mal.
const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null))

const casoDe = (r) => ({
  obraId: r.obra_id, actividadId: r.actividad_id, tareaTipoId: r.tarea_tipo_id,
  unidad: r.unidad, hsUnitarias: r.hs_unitarias === null ? null : Number(r.hs_unitarias),
  hsUnitariasPlan: r.hs_unitarias_plan === null ? null : Number(r.hs_unitarias_plan),
  cantidad: r.cantidad === null ? null : Number(r.cantidad),
  fecha: iso(r.fecha_hasta),
  fuente: r.fuente, estado: r.estado, confianza: r.confianza,
})

async function main() {
  const pool = getPool()
  const c = await pool.connect()
  const q = async (sql, p) => (await c.query(sql, p)).rows
  await c.query('begin')
  try {
    const filas = await q(`select * from public.rendimiento_historico where estado <> 'DESCARTADO'`)
    const porTarea = new Map()
    for (const f of filas) {
      const k = String(f.tarea_tipo_id)
      if (!porTarea.has(k)) porTarea.set(k, [])
      porTarea.get(k).push(casoDe(f))
    }

    // ═══ LA PRUEBA DE QUE EL CIRCUITO PUEDE DECIR QUE SÍ ═══
    //
    // El caso sintético se agrega EN MEMORIA y no en la base. La alternativa —insertarlo con
    // prefijo ZZ- dentro de la transacción— exigía crear también una obra y una actividad para
    // satisfacer dos claves foráneas: tres filas sintéticas en una base que comparten otros siete
    // agentes, para probar algo que no necesita ninguna. El caso va rotulado y su obra se llama
    // `ZZ-`, así que no se puede confundir con una medición real en la tabla de arriba.
    if (probarElSi) {
      for (const [, casos] of porTarea) {
        const real = casos.find((x) => x.estado !== 'REFERENCIA' && x.hsUnitarias !== null)
        if (!real) continue
        casos.push({
          ...real, obraId: OBRA_SINTETICA, actividadId: `${OBRA_SINTETICA}-act`,
          // +10 %: DENTRO de la tolerancia del ±30 %, para que sea consistente. Con una diferencia
          // mayor el circuito devolvería CONTRASTADO y la prueba no diría nada sobre el «sí».
          hsUnitarias: real.hsUnitarias * 1.1, fuente: 'ZZ-prueba-del-circuito', estado: 'CANDIDATO',
        })
      }
      console.log(`⚠ MODO PRUEBA: se agregó UN caso sintético por tarea, en memoria, obra ${OBRA_SINTETICA}.\n`)
    }

    const veredictos = []
    for (const [tareaTipoId, casos] of porTarea) {
      // Los CANDIDATO medidos en obra son los que aspiran a promoverse. Las REFERENCIA del xlsm son
      // el conocimiento contra el que se contrastan y NO se promueven a sí mismas.
      const medidos = casos.filter((x) => x.estado !== 'REFERENCIA')
      if (!medidos.length) continue
      const referencia = casos.find((x) => x.estado === 'REFERENCIA') ?? null
      const nuevo = medidos[medidos.length - 1]
      const previos = casos.filter((x) => x !== nuevo)

      const exp = expedienteDe({
        clave: `rendimiento:${tareaTipoId}`,
        condicion: 'se cotiza esta tarea y hay rendimiento real medido en obra',
        afirmacion: 'el rendimiento real observado se usa como referencia para cotizar esta tarea',
        casos: medidos,
      })
      const promo = promocionDe(nuevo, previos)

      // ═══ LA REGRESIÓN ═══ Los casos conocidos son las mediciones anteriores: se predice la HH de
      // cada una con la referencia vieja y con el rendimiento nuevo, y se compara el error.
      const conocidos = previos
        .filter((p) => p.cantidad !== null && p.hsUnitarias !== null)
        .map((p) => ({ cantidad: p.cantidad, real: p.cantidad * p.hsUnitarias }))
      const reg = regresionDe({
        casosConocidos: conocidos,
        valorViejo: referencia?.hsUnitarias ?? null,
        valorNuevo: nuevo.hsUnitarias,
        predecir: (caso, v) => caso.cantidad * v,
      })

      veredictos.push({
        tarea: tareaTipoId.slice(0, 8),
        n: exp.sampleCount,
        obras: exp.obras.length,
        unidad: exp.unidades.join('/') || '—',
        rendimiento: exp.distribucion.promedio,
        dispersion: exp.dispersion === null ? 'null (un solo caso)' : exp.dispersion,
        rango: `${exp.rangoDeFechas.desde ?? '—'} → ${exp.rangoDeFechas.hasta ?? '—'}${exp.rangoDeFechas.casosSinFecha ? ` (${exp.rangoDeFechas.casosSinFecha} sin fecha)` : ''}`,
        ESTADO: promo.estado,
        regresion: reg.resultado,
        'ACTIVA?': promo.estado === ESTADO_APRENDIZAJE.VALIDADO && reg.promueve,
        porQue: promo.porQue,
      })
    }

    console.log('═══ EL CIRCUITO, CORRIDO SOBRE LOS CASOS REALES ═══\n')
    console.table(veredictos)
    const activan = veredictos.filter((v) => v['ACTIVA?'])
    console.log(`\n${veredictos.length} expediente(s) · ${activan.length} se activarían · ${veredictos.length - activan.length} NO`)
    for (const v of veredictos.filter((x) => !x['ACTIVA?'])) console.log(`  ✗ ${v.tarea}: ${v.ESTADO} · ${v.porQue} · regresión ${v.regresion}`)
    for (const v of activan) console.log(`  ✓ ${v.tarea}: ${v.ESTADO} y la regresión no empeora los casos conocidos`)
    if (!probarElSi) console.log('\nPara probar que el circuito PUEDE promover (y no es una constante que siempre dice que no): --probar-el-si')
  } finally {
    // SIEMPRE rollback, incluso sin `--probar-el-si`: este script no promueve nada. La promoción es
    // una decisión con efecto sobre cómo se cotiza, y la firma el dueño.
    await c.query('rollback')
    c.release()
    await pool.end()
    console.log('\n⟲ ROLLBACK: la base quedó como estaba. Este script NO promueve — informa.')
  }
}

await main()
