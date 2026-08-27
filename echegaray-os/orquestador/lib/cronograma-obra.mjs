// EL PUENTE ENTRE EL MOTOR Y LA OBRA REAL.
//
// `cronograma.mjs` es puro y trabaja en índices de día hábil. Acá se le da de comer: se leen las
// actividades, sus dependencias y el calendario de la obra, se calcula, y se devuelven FECHAS.
//
// ═══ PLAN · REAL · PROYECCIÓN SON TRES COSAS, Y NO SE PISAN ═══
//
//   PLAN        `inicio_plan` / `fin_plan`     — lo que alguien planificó. Se guarda.
//   LÍNEA BASE  `inicio_base` / `fin_base`     — el plan aprobado, sellado. No se toca nunca más.
//   REAL        `inicio_real` / `fin_real`     — lo que pasó.
//   PROYECCIÓN  se CALCULA en cada lectura     — la mejor estimación de hoy.
//
// La proyección NO se guarda a propósito. Cambia con cada avance registrado, y una proyección
// guardada es una que envejece sin avisar: se lee de una columna que dice «12/09» y nadie sabe si
// se calculó ayer o hace tres meses. Guardar el plan y calcular la proyección es lo que impide que
// una actualización de avance borre la línea base, que es el defecto que el contrato nombra.
//
// ═══ LA PROYECCIÓN USA EL RENDIMIENTO OBSERVADO, NO EL DEL ANÁLISIS ═══
//
// Si una actividad lleva 40% de avance y consumió el 60% de sus HH, no va a terminar con las HH
// que decía el análisis. La proyección corrige por lo que está pasando: es la diferencia entre un
// informe y una alerta.

import { query } from './db.mjs'
// EL FALLBACK NO PUEDE SER UN 8 ESCRITO ACÁ. Decía `|| 8` en los dos lugares, y el 8 era la jornada
// vieja: cuando la del dueño pasó a 44 h semanales (27/08), una obra sin `jornada_horas` cargada
// habría seguido estirando cada actividad un 10%. La jornada vive en un solo archivo.
import { HORAS_POR_DIA_HABIL } from './jornada-uocra.mjs'
import { calcular, simularMovimiento, conflictosDeCuadrilla } from './cronograma.mjs'
import { CalendarioObra, aISO } from './calendario-obra.mjs'

/**
 * El día 0 del cronograma.
 *
 * Sale de la obra: su fecha de inicio de plan si la declaró, y si no, la fecha más temprana que
 * aparezca en sus actividades. Sólo cuando la obra no tiene NI fecha de inicio NI una sola
 * actividad fechada se cae a hoy, y eso es honesto: no hay ningún dato del que sacarla.
 *
 * Tomar «hoy» cuando sí hay fechas es lo que hacía que una obra con seis meses de historia se
 * dibujara arrancando esta mañana, con todo lo ya ejecutado apilado en el primer día.
 */
export function origenDelCronograma(obra, actividades, calendario) {
  // `pg` devuelve las columnas `date` como objetos Date, no como cadenas: `String(fecha)` da
  // «Wed Aug 20 2026…» y ordenarlo alfabéticamente no significa nada. aISO() normaliza los dos.
  const candidatas = []
  if (obra.fecha_inicio_plan) candidatas.push(aISO(obra.fecha_inicio_plan))
  for (const a of actividades) {
    for (const f of [a.inicio_real, a.inicio_plan, a.inicio_base]) {
      if (f) candidatas.push(aISO(f))
    }
  }
  const mas_temprana = candidatas.length ? candidatas.sort()[0] : new Date().toISOString().slice(0, 10)
  return calendario.proximoHabil(mas_temprana)
}

/** Trae todo lo que el motor necesita de una obra, en una sola ida a la base. */
export async function insumosDeLaObra(obraId) {
  const [obra, actividades, dependencias, feriados] = await Promise.all([
    query('select id, jornada_horas, dias_habiles, fecha_inicio_plan from public.obra_canonica where id = $1', [obraId]),
    query(
      `select c.actividad_id as id, c.nombre, c.tipo, c.actividad_padre_id, c.orden,
              c.hh_plan, c.hh_real, c.avance_pct, c.dias_plan, c.inicio_plan, c.fin_plan,
              c.inicio_base, c.fin_base, c.inicio_real, c.fin_real, c.estado,
              c.cuadrilla_id, c.cantidad_objetivo, c.unidad, a.dotacion_prevista, a.tope_frente,
              cap.capacidad_ponderada
         from public.obra_actividad_control c
         join public.obra_actividad a on a.id = c.actividad_id
         left join public.cuadrilla_capacidad cap on cap.cuadrilla_id = c.cuadrilla_id
        where c.obra_id = $1 and not c.archivada`, [obraId]),
    query('select origen_id as origen, destino_id as destino, tipo, lag_dias as lag from public.obra_dependencia where obra_id = $1', [obraId]),
    query(
      `select fecha from public.calendario_no_laborable
        where alcance <> 'obra' or obra_id = $1`, [obraId]),
  ])
  if (!obra.rows.length) throw new Error(`la obra ${obraId} no existe en obra_canonica`)
  return {
    obra: obra.rows[0],
    actividades: actividades.rows,
    dependencias: dependencias.rows,
    calendario: new CalendarioObra(obra.rows[0].dias_habiles, feriados.rows.map((f) => f.fecha)),
  }
}

/**
 * Cuánto dura una actividad, en días hábiles.
 * Devuelve null —«sin plan»— cuando falta el insumo. Nunca 1 para que el grafo cierre.
 */
export function duracionDe(act, jornada = 8) {
  if (act.dias_plan != null && Number(act.dias_plan) > 0) return Number(act.dias_plan)
  const hh = act.hh_plan == null ? null : Number(act.hh_plan)
  if (hh == null) return null
  const capacidad = act.capacidad_ponderada != null
    ? Number(act.capacidad_ponderada)
    : (act.dotacion_prevista != null ? Number(act.dotacion_prevista) : null)
  if (!capacidad || capacidad <= 0) return null
  return Math.max(1, Math.ceil(hh / (capacidad * jornada)))
}

/**
 * Las HH que le faltan a una actividad, corregidas por lo que viene pasando.
 *
 * Con 40% de avance y el 60% de las HH consumidas, el rendimiento observado es peor que el del
 * análisis y las HH restantes salen de ESE rendimiento, no del previsto. Sin avance registrado no
 * hay observación, así que se usa el plan y se dice que es el plan.
 */
export function hhRestantes(act) {
  const plan = act.hh_plan == null ? null : Number(act.hh_plan)
  const real = act.hh_real == null ? 0 : Number(act.hh_real)
  const avance = act.avance_pct == null ? null : Number(act.avance_pct) / 100

  if (avance == null || avance <= 0) {
    return { hh: plan == null ? null : Math.max(0, plan - real), base: 'plan' }
  }
  if (avance >= 1) return { hh: 0, base: 'terminada' }
  if (real > 0) {
    const totalProyectado = real / avance          // lo que va a costar entera, al ritmo de hoy
    return { hh: Math.max(0, totalProyectado - real), base: 'rendimiento observado' }
  }
  return { hh: plan == null ? null : plan * (1 - avance), base: 'plan' }
}

/** El cronograma de la obra, en fechas. `vista` = 'plan' | 'proyeccion'. */
export async function cronogramaDeLaObra(obraId, vista = 'plan') {
  const { obra, actividades, dependencias, calendario } = await insumosDeLaObra(obraId)
  const jornada = Number(obra.jornada_horas) || HORAS_POR_DIA_HABIL
  const origen = origenDelCronograma(obra, actividades, calendario)

  // Los contenedores no se planifican: agregan. Su ventana es la de sus hijas.
  const ejecutables = actividades.filter((a) => a.tipo !== 'resumen')

  const paraElMotor = ejecutables.map((a) => {
    let duracion
    if (vista === 'proyeccion') {
      const { hh } = hhRestantes(a)
      duracion = hh == null ? duracionDe(a, jornada)
        : (hh === 0 ? 0 : duracionDe({ ...a, dias_plan: null, hh_plan: hh }, jornada))
    } else {
      duracion = duracionDe(a, jornada)
    }
    return {
      id: a.id,
      nombre: a.nombre,
      duracion,
      cuadrillaId: a.cuadrilla_id,
      inicioFijo: a.inicio_real ? calendario.indice(origen, aISO(a.inicio_real)) : undefined,
    }
  })

  const calculo = calcular(paraElMotor, dependencias)
  const conflictos = conflictosDeCuadrilla(paraElMotor, calculo)

  const filas = ejecutables.map((a) => {
    const c = calculo.actividades.get(a.id)
    const { hh, base } = hhRestantes(a)
    return {
      ...a,
      duracion: c.duracion,
      inicio_calculado: c.sinPlan ? null : calendario.fecha(origen, c.inicio),
      fin_calculado: c.sinPlan ? null : calendario.fecha(origen, c.fin),
      holgura: c.holgura ?? null,
      critica: c.critica ?? false,
      sin_plan: c.sinPlan,
      hh_restantes: hh,
      base_de_la_proyeccion: base,
    }
  })

  // Una obra sin una sola dependencia declarada NO tiene cronograma: tiene una lista. El motor
  // devuelve todo arrancando el día 1 porque es lo correcto —nada secuencia a nada— pero dibujar
  // eso como un plan sería mentir con una barra. La pantalla tiene que decir «sin secuencia
  // cargada», que es el estado real, y no un fin de obra que nadie planificó.
  const sinSecuencia = dependencias.length === 0

  return {
    obraId,
    vista,
    origen,
    jornada,
    sinSecuencia,
    finObra: sinSecuencia ? null : (calculo.finObra == null ? null : calendario.fecha(origen, calculo.finObra)),
    finObraSiTodoEnParalelo: calculo.finObra == null ? null : calendario.fecha(origen, calculo.finObra),
    actividades: filas,
    // Sin dependencias, «crítica» no significa nada: lo sería la más larga y nada más.
    criticas: sinSecuencia ? [] : calculo.criticas,
    sinPlan: calculo.sinPlan,
    conflictos: conflictos.map((x) => ({
      ...x,
      desde: calendario.fecha(origen, x.desde),
      hasta: calendario.fecha(origen, x.hasta),
    })),
  }
}

/** Qué pasa si alguien arrastra una actividad. Devuelve fechas, no índices. */
export async function simularArrastre(obraId, actividadId, deltaDias) {
  const { obra, actividades, dependencias, calendario } = await insumosDeLaObra(obraId)
  const jornada = Number(obra.jornada_horas) || HORAS_POR_DIA_HABIL
  const origen = origenDelCronograma(obra, actividades, calendario)
  const nombres = new Map(actividades.map((a) => [a.id, a.nombre]))
  const paraElMotor = actividades
    .filter((a) => a.tipo !== 'resumen')
    .map((a) => ({ id: a.id, nombre: a.nombre, duracion: duracionDe(a, jornada), cuadrillaId: a.cuadrilla_id }))

  const r = simularMovimiento(paraElMotor, dependencias, actividadId, deltaDias)
  return {
    ...r,
    arrastradas: r.arrastradas.map((x) => ({ ...x, nombre: nombres.get(x.id) })),
    finObraAntes: r.finObraAntes == null ? null : calendario.fecha(origen, r.finObraAntes),
    finObraDespues: r.finObraDespues == null ? null : calendario.fecha(origen, r.finObraDespues),
  }
}
