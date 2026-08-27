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
/**
 * LA CANTIDAD EJECUTADA QUE NO SE CARGÓ PERO SE PUEDE DEMOSTRAR.
 *
 * Una actividad medida por partes no registra metros: registra porcentaje. Cuando el sistema la da
 * por TERMINADA y la actividad tiene cantidad objetivo, la cantidad ejecutada es esa: terminar
 * significa haber hecho lo que había que hacer. No es una estimación, es lo que «terminada» quiere
 * decir — y por eso queda marcado en la evidencia como derivado, con de dónde salió.
 *
 * Fuera de ese caso no se deduce nada: un 60% de avance NO son 60% de los metros salvo que alguien
 * lo haya medido, y multiplicar el objetivo por el porcentaje sería inventar la medición.
 */
export function cantidadEjecutadaDe(f) {
  const cargada = num(f.cantidad_real)
  if (cargada !== null) return { cantidad: cargada, derivada: false }
  const objetivo = num(f.plan_cantidad)
  // NO SE DERIVA SOBRE UN CIERRE QUE SALIÓ DE UNA SUMA. `avance_sumado` marca las actividades cuyo
  // 100% es «porcentaje declarado + porcentaje de los partes»: pueden estar terminadas en la barra
  // y al 75% en la obra. Inventarles la cantidad objetivo sería fabricar el dato más caro del
  // circuito — el que después se cotiza.
  if (f.terminada === true && objetivo !== null && f.avance_sumado !== true) {
    return { cantidad: objetivo, derivada: true, porQue: 'actividad terminada: lo ejecutado es la cantidad objetivo' }
  }
  return { cantidad: null, derivada: false }
}

/**
 * DE UNA FILA DE `xsas_actividad` A UNA COMPARACIÓN. Puro: se le da la fila, devuelve el análisis.
 *
 * Todo lo real —avance, HH, fechas, cierre— viene YA RESUELTO por la vista canónica. Este módulo no
 * vuelve a decidir ninguna de esas cosas: el día que lo hizo publicó «ninguna actividad tiene fecha
 * real» mientras el sistema tenía 152.
 *
 * Lo único que no está y no se inventa: el costo por actividad. `costos_reales` se imputa por obra,
 * así que sale `null` y el faltante queda escrito en la comparación.
 */
export function analizarFila(f) {
  const ejecutada = cantidadEjecutadaDe(f)
  const plan = {
    unidad: f.unidad,
    cantidad: f.plan_cantidad,
    hh: f.plan_hh,
    dias: f.plan_dias,
    dotacion: f.plan_dotacion,
    costo: null,
  }
  const real = {
    cantidad: ejecutada.cantidad,
    avancePct: f.avance_pct,
    hh: f.hh_real,
    hhImproductivas: f.hh_improductivas,
    dias: f.dias_real,
    dotacion: f.dotacion_real,
    terminada: f.terminada ?? null,
    avanceSumado: f.avance_sumado === true,
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
    terminada: f.terminada ?? null,
    origenAvance: f.origen_avance ?? null,
    cantidadDerivada: ejecutada.derivada,
    porQueLaCantidad: ejecutada.porQue ?? null,
    partes: f.n_partes,
    inicioReal: f.inicio_real ?? null,
    finReal: f.fin_real ?? null,
    origenInicioReal: f.origen_inicio_real ?? null,
    origenFinReal: f.origen_fin_real ?? null,
    ultimoHecho: f.fin_real ?? f.ultimo_parte ?? null,
    // POR QUÉ y CON QUIÉN. Un rendimiento sin la causa del desvío y sin la composición de la
    // cuadrilla es un número que no se puede discutir ni comparar con otra obra.
    causas: f.causas ?? null,
    composicion: f.composicion ?? null,
    cuadrillaId: f.cuadrilla_id ?? null,
  }
}

/** Las observaciones de todas las actividades reales, ya comparadas. Sólo lee. */
export async function observaciones({ query }, { obras = null } = {}) {
  // `obras` acota la corrida a un conjunto — lo usan las pruebas para trabajar sobre su obra de
  // fixture sin tocar el resto. En producción va en null y se miran todas.
  const { rows } = await query(
    `select * from public.xsas_actividad
      where obra_id <> all($1::text[])
        and ($2::text[] is null or obra_id = any($2::text[]))
        -- SÓLO TRABAJO. Un encabezado de frente hereda el avance y las fechas de sus hijas: su
        -- rendimiento sería el de todas juntas atribuido a una tarea sola.
        and es_trabajo
        and (hh_real is not null or cantidad_real is not null or avance_pct is not null)`,
    [OBRAS_NO_REALES, obras])
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
export async function aprender({ query }, { dry = false, obras = null } = {}) {
  const obs = await observaciones({ query }, { obras })
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
      origen_del_avance: o.origenAvance,
      terminada: o.terminada,
      causas: o.causas,
      inicio_real: o.inicioReal,
      fin_real: o.finReal,
      origen_inicio_real: o.origenInicioReal,
      origen_fin_real: o.origenFinReal,
      cantidad_real: o.real.cantidad,
      // Un número derivado dice que lo es y por qué. Sin esto no hay forma de distinguir después
      // una cantidad medida de una deducida del cierre.
      cantidad_derivada: o.cantidadDerivada,
      cantidad_derivada_porque: o.porQueLaCantidad,
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
          veces_confirmado, clave, causas, composicion, cuadrilla_id, actualizado_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ejecucion-real',$16,$17,$18,$19,$20,$21,$22,$23, now())
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
         fecha_desde = excluded.fecha_desde, fecha_hasta = excluded.fecha_hasta,
         evidencia = excluded.evidencia,
         estado = excluded.estado, confianza = excluded.confianza,
         veces_confirmado = excluded.veces_confirmado, clave = excluded.clave,
         causas = excluded.causas, composicion = excluded.composicion,
         cuadrilla_id = excluded.cuadrilla_id, actualizado_en = now()`,
      [o.tareaTipoId, o.analisisId, o.obraId, o.actividadId, o.unidad, o.real.cantidad, o.real.hh,
        o.real.hhImproductivas, o.hsUnitariasPlan, o.derivado.desvioProductividadPct,
        // La ventana del hecho: desde la primera evidencia hasta la última. Las dos salen de la
        // vista canónica, no de la fecha en que corrió el ciclo.
        o.avancePct, o.real.dotacion, o.real.dias, o.inicioReal, o.ultimoHecho,
        JSON.stringify(evidencia), veredicto.estado, veredicto.confianza, veredicto.vecesConfirmado, clave,
        o.causas ? JSON.stringify(o.causas) : null,
        o.composicion ? JSON.stringify(o.composicion) : null,
        o.cuadrillaId])

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA OTRA MÉTRICA: CUÁNTO TARDÓ
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El rendimiento (hs/unidad) necesita HH imputadas a la actividad, y de 277 actividades reales sólo
// 4 las tienen. La DURACIÓN sólo necesita fechas, y hay 119 actividades terminadas con duración
// planificada y duración real. Son 119 hechos medidos sobre cuánto tarda el trabajo de Echegaray
// que estaban ahí sin que nadie los mirara.
//
// No se mezclan con el rendimiento: dos métricas con dos requisitos y dos usos. Un solo número que
// las promediara escondería que de una tarea sabemos la duración por seis casos y el rendimiento
// por ninguno.

/** Desvío de duración en %. Positivo = tardó MÁS que lo planificado. */
export function desvioDuracion(diasPlan, diasReal) {
  const p = num(diasPlan), r = num(diasReal)
  if (p === null || r === null || p === 0) return null
  return ((r - p) / p) * 100
}

/**
 * ¿CUÁNTO VALE ESTA MEDICIÓN DE DURACIÓN?
 *
 *   alta   terminada, con fechas reales derivadas de la evidencia y un cierre que no salió de una suma.
 *   media  terminada pero con el cierre armado sumando dos declaraciones.
 *   baja   sin fecha real de inicio o de fin: la ventana no la sostiene ningún hecho.
 */
export function confianzaDuracion({ terminada, inicioReal, finReal, avanceSumado }) {
  if (!inicioReal || !finReal) return 'baja'
  if (terminada !== true) return 'baja'
  return avanceSumado === true ? 'media' : 'alta'
}

/**
 * EL PASO QUE APRENDE DURACIÓN. Independiente del de rendimiento: corre aunque no haya una sola
 * hora imputada.
 *
 * El hecho se guarda **aunque la actividad no tenga tipo de tarea**: el dato es cierto igual, y el
 * día que alguien la clasifique la experiencia pasa a ser reutilizable sin volver a medirla. Lo que
 * el tipo habilita es la comparación entre obras, y por eso sin tipo nunca se VALIDA.
 */
export async function aprenderDuracion({ query }, { dry = false, obras = null } = {}) {
  const { rows } = await query(
    `select actividad_id, obra_id, actividad, tarea_tipo_id, plan_dias, dias_real,
            inicio_plan, fin_plan, inicio_real, fin_real, terminada, avance_sumado, dotacion_real
       from public.xsas_actividad
      where obra_id <> all($1::text[])
        and ($2::text[] is null or obra_id = any($2::text[]))
        -- SÓLO TRABAJO. Una fila que agrupa a otras tiene por fechas la envolvente de sus hijas:
        -- guardar eso como la duración de una tarea mete en la Base Maestra un número que no
        -- corresponde a ningún trabajo. Dos de los 117 hechos venían de ahí.
        and es_trabajo
        -- UN PLAN DE CERO DÍAS NO ES UN PLAN. Son hitos del cronograma importado, no trabajo
        -- planificado: contra cero no hay desvío que calcular y la fila entraría con el número
        -- vacío. Se dejan afuera en vez de guardarlas rotas.
        and terminada and plan_dias > 0 and dias_real is not null`,
    [OBRAS_NO_REALES, obras])

  // Cuántas quedaron afuera por no tener un plan contra el cual medir.
  const { rows: [d] } = await query(
    `select count(*)::int n from public.xsas_actividad
      where obra_id <> all($1::text[]) and ($2::text[] is null or obra_id = any($2::text[]))
        and es_trabajo and terminada and dias_real is not null and coalesce(plan_dias, 0) <= 0`,
    [OBRAS_NO_REALES, obras])
  const descartadas = d?.n ?? 0

  // Lo ya conocido de esas tareas, para decidir si un caso confirma a otro.
  const tipos = [...new Set(rows.map((r) => r.tarea_tipo_id).filter(Boolean))]
  const previos = tipos.length
    ? (await query(
      `select actividad_id, obra_id, tarea_tipo_id, dias_plan, dias_real, confianza, estado
         from public.duracion_historica where tarea_tipo_id = any($1::uuid[])`, [tipos])).rows
    : []

  const salida = []
  for (const r of rows) {
    const desvio = desvioDuracion(r.plan_dias, r.dias_real)
    const confianza = confianzaDuracion({
      terminada: r.terminada, inicioReal: r.inicio_real, finReal: r.fin_real, avanceSumado: r.avance_sumado,
    })
    // VALIDA sólo con otra OBRA que tenga la misma tarea: dos frentes de la misma obra comparten
    // cuadrilla, encargado y clima, igual que en el rendimiento.
    const otras = r.tarea_tipo_id
      ? previos.filter((p) => p.tarea_tipo_id === r.tarea_tipo_id && p.obra_id !== r.obra_id && p.estado !== 'DESCARTADO')
      : []
    const estado = otras.length >= 1 ? 'VALIDADO' : 'CANDIDATO'
    const clave = `duracion:${r.actividad_id}`
    const evidencia = {
      vista: 'public.xsas_actividad', actividad_id: r.actividad_id, obra: r.obra_id,
      inicio_plan: r.inicio_plan, fin_plan: r.fin_plan,
      inicio_real: r.inicio_real, fin_real: r.fin_real,
      cierre_sumado: r.avance_sumado === true,
      sin_tipo_de_tarea: !r.tarea_tipo_id,
    }
    salida.push({ clave, actividad: r.actividad, obra: r.obra_id, diasPlan: Number(r.plan_dias), diasReal: Number(r.dias_real), desvio, estado, confianza })

    // LO RECIÉN MEDIDO ENTRA EN LA COMPARACIÓN DE LAS SIGUIENTES. Sin esto —el defecto que la
    // función de rendimiento ya tenía resuelto y ésta no copió— el estado dependía de cuántas veces
    // se hubiera corrido el ciclo y no de la evidencia: tres actividades del mismo tipo en tres
    // obras distintas salían CANDIDATO en la primera corrida y VALIDADO en la segunda, con los
    // mismos hechos. Y vaciar la tabla borraba todos los VALIDADO sin que cambiara un solo dato.
    previos.push({ actividad_id: r.actividad_id, obra_id: r.obra_id, tarea_tipo_id: r.tarea_tipo_id,
      dias_plan: r.plan_dias, dias_real: r.dias_real, confianza, estado })
    if (dry) continue

    await query(
      `insert into public.duracion_historica
         (actividad_id, obra_id, tarea_tipo_id, actividad_nombre, dias_plan, dias_real, desvio_pct,
          inicio_plan, fin_plan, inicio_real, fin_real, dotacion_real, estado, confianza,
          veces_confirmado, evidencia, clave, actualizado_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
       on conflict (clave) do update set
         tarea_tipo_id = excluded.tarea_tipo_id, dias_plan = excluded.dias_plan,
         dias_real = excluded.dias_real, desvio_pct = excluded.desvio_pct,
         inicio_real = excluded.inicio_real, fin_real = excluded.fin_real,
         dotacion_real = excluded.dotacion_real, estado = excluded.estado,
         confianza = excluded.confianza, veces_confirmado = excluded.veces_confirmado,
         evidencia = excluded.evidencia, actualizado_en = now()`,
      [r.actividad_id, r.obra_id, r.tarea_tipo_id, r.actividad, r.plan_dias, r.dias_real, desvio,
        r.inicio_plan, r.fin_plan, r.inicio_real, r.fin_real, r.dotacion_real, estado, confianza,
        otras.length + 1, JSON.stringify(evidencia), clave])
  }

  return {
    medidas: salida.length,
    validadas: salida.filter((s) => s.estado === 'VALIDADO').length,
    sinTipo: rows.filter((r) => !r.tarea_tipo_id).length,
    tardaronMas: salida.filter((s) => (s.desvio ?? 0) > 0).length,
    // EL HUECO SE CUENTA. Las terminadas con plan de cero días se descartan a propósito —un plan de
    // cero no es un plan— pero descartarlas en silencio hace que el total publicado parezca la
    // totalidad de lo que había.
    descartadasSinPlan: descartadas,
    filas: salida,
  }
}
