// LO QUE LA OBRA ENSEÑA — el borde que convierte hechos en conocimiento reutilizable.
//
// ═══ EL CICLO, EN UNA LÍNEA ═══
//
//   HECHO NUEVO → estado interno → plan contra real → candidato → contraste → validado → cotización
//
// El cálculo lo hace `obra-plan-real.mjs`, que es puro y no toca la base. Acá sólo está el borde:
// leer las fuentes, guardar el resultado y decidir —con la regla, no con un criterio— en qué estado
// entra cada aprendizaje.
//
// ═══ LAS DOS COSAS QUE ESTE MÓDULO NO HACE ═══
//
// **No le pregunta a un modelo.** Un rendimiento es una división y una comparación. El modelo puede
// después explicar POR QUÉ una actividad rindió mal; el número no se lo pregunta a nadie.
//
// **No pisa la referencia maestra.** Las diez filas del xlsm con las que se viene cotizando quedan
// como REFERENCIA y ningún aprendizaje las modifica. Lo aprendido convive con ellas y quien cotiza
// ve las dos, con su cantidad de casos y su confianza. Retirar una referencia es decisión del dueño.

import { compararPlanReal, estadoDelAprendizaje, afirmacionDe, num } from './obra-plan-real.mjs'

/** Obras que existen en la base pero no son obras: el aprendizaje no puede salir de un fixture. */
export const OBRAS_NO_REALES = Object.freeze(['prueba-e2e'])

/** Días entre dos fechas, inclusive. `null` si falta alguna. */
export function diasEntre(desde, hasta) {
  if (!desde || !hasta) return null
  const a = new Date(desde), b = new Date(hasta)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b - a) / 86_400_000) + 1
}

/**
 * DE UNA FILA DE `xsas_actividad` A UNA COMPARACIÓN. Puro: se le da la fila, devuelve el análisis.
 *
 * Las preferencias entre fuentes están acá y no repartidas por el código:
 *  · la duración real, la que declara la actividad; si no está, la que abarcan las HH cargadas.
 *  · la dotación real, la cantidad de personas que efectivamente imputaron horas; si nadie imputó,
 *    las asignadas. Es la diferencia entre quién estuvo y quién figuraba.
 *  · el costo por actividad NO EXISTE hoy: `costos_reales` se imputa por obra. Sale `null`, y el
 *    faltante queda escrito en la comparación.
 */
export function analizarFila(f) {
  const plan = {
    unidad: f.unidad,
    cantidad: f.plan_cantidad,
    hh: f.plan_hh,
    dias: f.plan_dias,
    dotacion: f.plan_dotacion,
    costo: null,
  }
  const real = {
    cantidad: f.cantidad_real,
    avancePct: num(f.avance_medido) ?? num(f.avance_declarado),
    hh: f.hh_real,
    hhImproductivas: f.hh_improductivas,
    dias: num(f.dias_real) ?? diasEntre(f.primera_hh, f.ultima_hh),
    dotacion: num(f.personas_con_hh) || num(f.dotacion_real),
    costo: null,
  }
  const c = compararPlanReal(plan, real)

  // El rendimiento con el que se COTIZÓ, cuando la actividad viene de una partida presupuestada.
  // Es distinto del plan de obra: el plan puede haberse ajustado después de vender.
  const hsUnitariasPresupuesto = num(f.presupuesto_hs_unitarias)

  return {
    ...c,
    actividadId: f.actividad_id,
    obraId: f.obra_id,
    obra: f.obra,
    cliente: f.cliente,
    actividad: f.actividad,
    tarea: f.tarea ?? f.actividad,
    tareaTipoId: f.tarea_tipo_id,
    analisisId: f.analisis_id,
    hsUnitarias: c.real.hsUnitarias,
    hsUnitariasPlan: c.plan.hsUnitarias ?? hsUnitariasPresupuesto,
    hsUnitariasPresupuesto,
    partes: f.partes,
    conEvidencia: f.con_evidencia,
    ultimoHecho: [f.ultima_ejecucion, f.ultima_hh].filter(Boolean).sort().at(-1) ?? null,
  }
}

/** Las observaciones de todas las actividades reales, ya comparadas. Sólo lee. */
export async function observaciones({ query }) {
  const { rows } = await query(
    `select * from public.xsas_actividad
      where obra_id <> all($1::text[])
        and (hh_real is not null or cantidad_real is not null or avance_declarado is not null)`,
    [OBRAS_NO_REALES])
  return rows.map(analizarFila)
}

/**
 * EL PASO QUE APRENDE. Para cada observación aprendible decide su estado contra lo ya conocido y lo
 * deja escrito en dos lugares con propósitos distintos:
 *
 *   `rendimiento_historico`  el NÚMERO, para que la próxima cotización lo encuentre.
 *   `conocimiento_empresa`   la FRASE, para que un agente o el chat la lean sin saber SQL.
 *
 * Idempotente por actividad: correr esto tres veces en un día no crea tres casos. Lo que cambia es
 * el hecho observado, no el reloj.
 */
export async function aprender({ query }, { dry = false } = {}) {
  const obs = await observaciones({ query })
  const aprendibles = obs.filter((o) => o.aprendible && o.tareaTipoId)
  const sinTipo = obs.filter((o) => o.aprendible && !o.tareaTipoId)

  // Lo ya conocido para esas tareas — incluida la referencia del xlsm, que se lee para NO pisarla.
  const tipos = [...new Set(aprendibles.map((o) => o.tareaTipoId))]
  const previos = tipos.length
    ? (await query(
      `select id, tarea_tipo_id, actividad_id, unidad, hs_unitarias, estado, confianza, veces_confirmado
         from public.rendimiento_historico where tarea_tipo_id = any($1::uuid[])`, [tipos])).rows
      .map((r) => ({
        tareaTipoId: r.tarea_tipo_id, actividadId: r.actividad_id, unidad: r.unidad,
        hsUnitarias: num(r.hs_unitarias), estado: r.estado, confianza: r.confianza,
      }))
    : []

  const resultado = []
  for (const o of aprendibles) {
    const veredicto = estadoDelAprendizaje(o, previos)
    const evidencia = {
      vista: 'public.xsas_actividad',
      actividad_id: o.actividadId,
      obra: o.obraId,
      partes_de_ejecucion: o.partes,
      partes_con_evidencia: o.conEvidencia,
      cantidad_real: o.real.cantidad,
      hh_real: o.real.hh,
      avance_pct: o.avancePct,
      hs_unitarias_plan: o.hsUnitariasPlan,
      hs_unitarias_presupuesto: o.hsUnitariasPresupuesto,
      ultimo_hecho: o.ultimoHecho,
      faltantes: o.faltantes,
    }
    const clave = `plan-real:${o.actividadId}`
    const fila = {
      clave, veredicto, evidencia, obs: o,
      afirmacion: afirmacionDe({
        tarea: o.tarea, obra: o.obra, unidad: o.unidad, cantidad: o.real.cantidad,
        avancePct: o.avancePct, hsUnitarias: o.hsUnitarias, hsUnitariasPlan: o.hsUnitariasPlan,
        desvioPct: o.derivado.desvioProductividadPct,
      }),
    }
    resultado.push(fila)
    if (dry) continue

    // ── EL NÚMERO ──
    await query(
      `insert into public.rendimiento_historico
         (tarea_tipo_id, analisis_id, obra_id, actividad_id, unidad, cantidad, hh_reales,
          hh_improductivas, hs_unitarias_plan, desvio_hs_unitarias_pct, avance_pct,
          dotacion, dias, fecha_desde, fecha_hasta, fuente, evidencia, estado, confianza,
          veces_confirmado, clave, actualizado_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ejecucion-real',$16,$17,$18,$19,$20, now())
       -- El índice único es PARCIAL (where actividad_id is not null): sin repetir el predicado,
       -- Postgres no puede elegirlo y el insert falla con «no unique index matching».
       on conflict (actividad_id) where actividad_id is not null do update set
         cantidad = excluded.cantidad, hh_reales = excluded.hh_reales,
         -- Una fila que pasa a mantenerla el ciclo lo dice: su fuente ya no es de dónde vino, es
         -- quién la sostiene al día.
         fuente = excluded.fuente,
         hh_improductivas = excluded.hh_improductivas,
         -- hs_unitarias NO se escribe: la base la genera como (hh_reales - hh_improductivas)/cantidad.
         -- Una sola definición del concepto, y es la de la base.
         hs_unitarias_plan = excluded.hs_unitarias_plan,
         desvio_hs_unitarias_pct = excluded.desvio_hs_unitarias_pct,
         avance_pct = excluded.avance_pct, dotacion = excluded.dotacion, dias = excluded.dias,
         fecha_hasta = excluded.fecha_hasta, evidencia = excluded.evidencia,
         estado = excluded.estado, confianza = excluded.confianza,
         veces_confirmado = excluded.veces_confirmado, clave = excluded.clave, actualizado_en = now()`,
      [o.tareaTipoId, o.analisisId, o.obraId, o.actividadId, o.unidad, o.real.cantidad, o.real.hh,
        o.real.hhImproductivas, o.hsUnitariasPlan, o.derivado.desvioProductividadPct,
        o.avancePct, o.real.dotacion, o.real.dias, null, o.ultimoHecho,
        JSON.stringify(evidencia), veredicto.estado, veredicto.confianza, veredicto.vecesConfirmado, clave])

    // ── LA FRASE ──
    //
    // `veces_confirmado` se ESCRIBE con el veredicto, no se incrementa en el conflicto: el contador
    // tiene que contar CASOS COMPARABLES, y una segunda corrida sobre la misma actividad no es un
    // caso nuevo. Ése fue el defecto que infló el conocimiento del Director.
    await query(
      `insert into public.conocimiento_empresa (area, afirmacion, clave, confianza, tipo, fuente, evidencia, veces_confirmado)
            values ('obra', $1, $2, $3, $4, 'xsas:plan-real', $5, $6)
       on conflict (clave) do update set
         afirmacion = excluded.afirmacion, confianza = excluded.confianza, tipo = excluded.tipo,
         evidencia = excluded.evidencia, veces_confirmado = excluded.veces_confirmado,
         updated_at = now(), vigente = true`,
      [fila.afirmacion, clave, veredicto.confianza, veredicto.estado,
        JSON.stringify(evidencia), veredicto.vecesConfirmado])

    // Lo recién escrito entra en la comparación de las siguientes: dos actividades del mismo tipo en
    // la misma corrida tienen que poder confirmarse entre sí.
    previos.push({
      tareaTipoId: o.tareaTipoId, actividadId: o.actividadId, unidad: o.unidad,
      hsUnitarias: o.hsUnitarias, estado: veredicto.estado, confianza: veredicto.confianza,
    })
  }

  return {
    miradas: obs.length,
    aprendidas: resultado.length,
    validadas: resultado.filter((r) => r.veredicto.estado === 'VALIDADO').length,
    candidatas: resultado.filter((r) => r.veredicto.estado === 'CANDIDATO').length,
    // Actividades que rindieron un número pero no dicen DE QUÉ TAREA son: sin tipo de tarea el
    // rendimiento no se puede reutilizar en otra obra, así que no se guarda. Se cuenta para que el
    // hueco se vea.
    sinTipoDeTarea: sinTipo.length,
    filas: resultado,
  }
}
