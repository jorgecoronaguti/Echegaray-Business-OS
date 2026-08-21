// EL MOTOR DE CRONOGRAMA, DEL LADO DE LA WEB.
//
// El camino crítico NO se calcula acá: lo calcula `orquestador/lib/cronograma.mjs`, que es puro,
// tiene 18 pruebas y se importa tal cual. Este archivo es el PUENTE WEB: lee lo que Supabase
// devolvió, se lo da de comer al motor en índices de día hábil, y devuelve fechas.
//
// ═══ POR QUÉ NO SE IMPORTA `cronograma-obra.mjs`, QUE HACE EXACTAMENTE ESTO ═══
//
// Porque ese puente lee con `db.mjs` — el pool de `pg` del Work Fabric, que se conecta con la
// credencial de servicio y NO pasa por RLS. Traerlo a un Server Component convertiría cada
// pantalla de obra en un agujero: el jefe de obra vería el cronograma de las obras que no le
// tocan, y la regla «no ve costo ni margen» —que hoy la hace cumplir Postgres— dejaría de
// evaluarse porque las policies no se evalúan para el rol de servicio. La web lee con la sesión
// del usuario, siempre.
//
// De ahí que `duracionDe` y `hhRestantes` estén portadas y no importadas. Que sean DOS
// implementaciones de la misma regla es una deuda real, y por eso no queda librada a la buena fe:
// `orquestador/lib/cronograma-web-conformidad.test.mjs` importa las dos y las corre contra la
// misma tabla de casos. Si alguien cambia el motor y no toca esta copia, ese test se pone rojo.
//
// ═══ PLAN Y PROYECCIÓN SON DOS LECTURAS DEL MISMO PLAN, Y NINGUNA SE GUARDA ═══
//
// `vista='plan'` usa la duración planificada. `vista='proyeccion'` usa las HH que faltan según el
// rendimiento OBSERVADO. La proyección se calcula en cada lectura a propósito: guardada, envejece
// sin avisar y nadie sabe de cuándo es el número que está mirando.

import { calcular, conflictosDeCuadrilla, simularMovimiento } from '../../../../orquestador/lib/cronograma.mjs'
import { CalendarioObra, aISO } from '../../../../orquestador/lib/calendario-obra.mjs'

/** Qué base sustenta las HH que faltan. Se MUESTRA: un número que no dice de dónde salió obliga
 *  a confiar en él, y en una obra eso se paga en plazo. */
export type BaseProyeccion = 'plan' | 'rendimiento observado' | 'terminada' | 'sin base'

/** Lo que una actividad trae de `obra_actividad_control`, sólo las columnas que el motor usa. */
export interface ActividadCruda {
  actividad_id: string
  nombre: string
  tipo: string | null
  actividad_padre_id: string | null
  orden: number | null
  rubro: string | null
  seccion: string | null
  hh_plan: number | string | null
  hh_real: number | string | null
  avance_pct: number | string | null
  dias_plan: number | string | null
  inicio_plan: string | null
  fin_plan: string | null
  inicio_base: string | null
  fin_base: string | null
  inicio_real: string | null
  fin_real: string | null
  estado: string | null
  cuadrilla_id: string | null
  cuadrilla_prevista: string | null
  cantidad_objetivo: number | string | null
  unidad: string | null
  dotacion_prevista: number | string | null
  tope_frente: number | string | null
  impedimentos_abiertos: number | string | null
  /** Capacidad ponderada de la cuadrilla asignada. Se resuelve aparte (`cuadrilla_capacidad`)
   *  porque PostgREST no hace este join, y es lo que convierte «4 personas» en 3,2 de capacidad. */
  capacidad_ponderada?: number | string | null
}

export interface DependenciaCruda {
  origen_id: string
  destino_id: string
  tipo: string
  lag_dias: number | string | null
}

export interface ObraCruda {
  id: string
  jornada_horas: number | string | null
  dias_habiles: number[] | null
  fecha_inicio_plan: string | null
}

export interface FilaCronograma extends ActividadCruda {
  duracion: number | null
  inicio_calculado: string | null
  fin_calculado: string | null
  holgura: number | null
  critica: boolean
  sin_plan: boolean
  hh_restantes: number | null
  base_de_la_proyeccion: BaseProyeccion
}

export interface ConflictoCuadrilla {
  cuadrillaId: string
  actividades: string[]
  desde: string
  hasta: string
}

export interface Cronograma {
  obraId: string
  vista: VistaCronograma
  origen: string
  jornada: number
  /** Sin una sola dependencia declarada NO hay cronograma: hay una lista. Ver el comentario largo
   *  en `armarCronograma`. */
  sinSecuencia: boolean
  finObra: string | null
  /** El fin que daría el motor si nadie secuenciara nada. Se puede mostrar, ROTULADO como lo que
   *  es, pero no es un fin de obra. */
  finObraSiTodoEnParalelo: string | null
  actividades: FilaCronograma[]
  criticas: string[]
  sinPlan: string[]
  conflictos: ConflictoCuadrilla[]
}

export type VistaCronograma = 'plan' | 'proyeccion'

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

/**
 * Cuánto dura una actividad, en días hábiles.
 * Devuelve null —«sin plan»— cuando falta el insumo. Nunca 1 para que el grafo cierre.
 *
 * PUERTO de `duracionDe` en `orquestador/lib/cronograma-obra.mjs`. Ver la nota de arriba.
 */
export function duracionDe(act: Partial<ActividadCruda>, jornada = 8): number | null {
  const dias = num(act.dias_plan)
  if (dias != null && dias > 0) return dias
  const hh = num(act.hh_plan)
  if (hh == null) return null
  const cap = num(act.capacidad_ponderada) ?? num(act.dotacion_prevista)
  if (!cap || cap <= 0) return null
  return Math.max(1, Math.ceil(hh / (cap * jornada)))
}

/**
 * Las HH que le faltan a una actividad, corregidas por lo que viene pasando.
 *
 * Con 40 % de avance y el 60 % de las HH consumidas, el rendimiento observado es peor que el del
 * análisis y las HH restantes salen de ESE rendimiento, no del previsto. Sin avance registrado no
 * hay observación: se usa el plan y se DICE que es el plan.
 *
 * PUERTO de `hhRestantes` en `orquestador/lib/cronograma-obra.mjs`.
 */
export function hhRestantes(act: Partial<ActividadCruda>): { hh: number | null; base: BaseProyeccion } {
  const plan = num(act.hh_plan)
  const real = num(act.hh_real) ?? 0
  const avancePct = num(act.avance_pct)
  const avance = avancePct == null ? null : avancePct / 100

  if (avance == null || avance <= 0) {
    return { hh: plan == null ? null : Math.max(0, plan - real), base: 'plan' }
  }
  if (avance >= 1) return { hh: 0, base: 'terminada' }
  if (real > 0) {
    const totalProyectado = real / avance // lo que va a costar entera, al ritmo de hoy
    return { hh: Math.max(0, totalProyectado - real), base: 'rendimiento observado' }
  }
  return { hh: plan == null ? null : plan * (1 - avance), base: 'plan' }
}

/**
 * El día 0 del cronograma. Sale de la obra: su inicio de plan si lo declaró, y si no, la fecha más
 * temprana que aparezca en sus actividades. Sólo cuando no hay NI inicio NI una sola actividad
 * fechada se cae a hoy — y eso es honesto, no hay ningún dato del que sacarla.
 *
 * Tomar «hoy» cuando sí hay fechas es lo que hacía que una obra con seis meses de historia se
 * dibujara arrancando esta mañana, con todo lo ejecutado apilado en el primer día.
 */
export function origenDelCronograma(
  obra: ObraCruda, actividades: ActividadCruda[], calendario: CalendarioObra, hoy?: string,
): string {
  const candidatas: string[] = []
  if (obra.fecha_inicio_plan) candidatas.push(aISO(obra.fecha_inicio_plan))
  for (const a of actividades) {
    for (const f of [a.inicio_real, a.inicio_plan, a.inicio_base]) if (f) candidatas.push(aISO(f))
  }
  const temprana = candidatas.length
    ? candidatas.sort()[0]
    : (hoy ?? new Date().toISOString().slice(0, 10))
  return calendario.proximoHabil(temprana)
}

/** La duración que el motor tiene que usar en cada vista. Aislada porque es la única diferencia
 *  entre plan y proyección, y esconderla dentro de un `map` es cómo se pierde de vista. */
function duracionSegunVista(a: ActividadCruda, vista: VistaCronograma, jornada: number): number | null {
  if (vista !== 'proyeccion') return duracionDe(a, jornada)
  const { hh } = hhRestantes(a)
  if (hh == null) return duracionDe(a, jornada)
  if (hh === 0) return 0
  return duracionDe({ ...a, dias_plan: null, hh_plan: hh }, jornada)
}

export interface InsumosCronograma {
  obra: ObraCruda
  actividades: ActividadCruda[]
  dependencias: DependenciaCruda[]
  noLaborables: string[]
}

/**
 * El cronograma de la obra, en fechas. Puro: recibe lo ya leído y no toca la base.
 *
 * ═══ SIN DEPENDENCIAS NO HAY CRONOGRAMA, HAY UNA LISTA ═══
 *
 * El motor devuelve todo arrancando el día 1 porque es lo correcto —nada secuencia a nada— pero
 * dibujar eso como un plan sería mentir con una barra. `sinSecuencia` es el estado real de las
 * cinco obras con actividades fechadas, y la pantalla lo tiene que DECIR y ofrecer cargarla.
 */
export function armarCronograma(
  { obra, actividades, dependencias, noLaborables }: InsumosCronograma,
  vista: VistaCronograma = 'plan',
  hoy?: string,
): Cronograma {
  const calendario = new CalendarioObra(obra.dias_habiles ?? [1, 2, 3, 4, 5], noLaborables)
  const jornada = num(obra.jornada_horas) || 8
  const origen = origenDelCronograma(obra, actividades, calendario, hoy)

  // Los contenedores no se planifican: agregan. Su ventana es la de sus hijas.
  const ejecutables = actividades.filter((a) => a.tipo !== 'resumen')

  const paraElMotor = ejecutables.map((a) => ({
    id: a.actividad_id,
    nombre: a.nombre,
    duracion: duracionSegunVista(a, vista, jornada),
    cuadrillaId: a.cuadrilla_id,
    inicioFijo: a.inicio_real ? calendario.indice(origen, aISO(a.inicio_real)) : undefined,
  }))

  const deps = dependencias.map((d) => ({
    origen: d.origen_id, destino: d.destino_id, tipo: d.tipo, lag: num(d.lag_dias) ?? 0,
  }))
  const calculo = calcular(paraElMotor, deps)
  const conflictos = conflictosDeCuadrilla(paraElMotor, calculo)

  const sinSecuencia = dependencias.length === 0

  const filas: FilaCronograma[] = ejecutables.map((a) => {
    const c = calculo.actividades.get(a.actividad_id)
    const { hh, base } = hhRestantes(a)
    return {
      ...a,
      duracion: c.duracion,
      inicio_calculado: c.sinPlan ? null : calendario.fecha(origen, c.inicio),
      fin_calculado: c.sinPlan ? null : calendario.fecha(origen, c.fin),
      holgura: c.holgura ?? null,
      // SIN SECUENCIA NINGUNA ACTIVIDAD ES CRÍTICA. El motor marca crítica a la que no tiene
      // holgura, y sin dependencias ésa es simplemente la más larga. Dejar el flag encendido
      // ponía la insignia «crítica» en dos filas de una pantalla cuyo KPI dice «sin secuencia»:
      // la pantalla se contradecía consigo misma a dos centímetros de distancia.
      critica: sinSecuencia ? false : (c.critica ?? false),
      sin_plan: c.sinPlan,
      hh_restantes: hh,
      base_de_la_proyeccion: hh == null ? 'sin base' : base,
    }
  })

  const finParalelo = calculo.finObra == null ? null : calendario.fecha(origen, calculo.finObra)

  return {
    obraId: obra.id,
    vista,
    origen,
    jornada,
    sinSecuencia,
    finObra: sinSecuencia ? null : finParalelo,
    finObraSiTodoEnParalelo: finParalelo,
    actividades: filas,
    // Sin dependencias «crítica» no significa nada: lo sería la más larga y nada más.
    criticas: sinSecuencia ? [] : calculo.criticas,
    sinPlan: calculo.sinPlan,
    conflictos: conflictos.map((x: { cuadrillaId: string; actividades: string[]; desde: number; hasta: number }) => ({
      ...x,
      desde: calendario.fecha(origen, x.desde),
      hasta: calendario.fecha(origen, x.hasta),
    })),
  }
}

export interface Arrastre {
  arrastradas: { id: string; nombre: string; dias: number }[]
  finObraAntes: string | null
  finObraDespues: string | null
  corrimientoFinObra: number
  sinPlan: boolean
}

/**
 * Qué pasa si alguien mueve una actividad. Devuelve fechas, no índices.
 *
 * Se muestra ANTES de confirmar. Mover una actividad y enterarse después de que corrió la obra
 * tres semanas es exactamente lo que el contrato pide evitar.
 */
export function simularArrastre(
  insumos: InsumosCronograma, actividadId: string, deltaDias: number, hoy?: string,
): Arrastre {
  const { obra, actividades, dependencias } = insumos
  const calendario = new CalendarioObra(obra.dias_habiles ?? [1, 2, 3, 4, 5], insumos.noLaborables)
  const jornada = num(obra.jornada_horas) || 8
  const origen = origenDelCronograma(obra, actividades, calendario, hoy)
  const nombres = new Map(actividades.map((a) => [a.actividad_id, a.nombre]))
  const paraElMotor = actividades
    .filter((a) => a.tipo !== 'resumen')
    .map((a) => ({
      id: a.actividad_id, nombre: a.nombre, duracion: duracionDe(a, jornada), cuadrillaId: a.cuadrilla_id,
    }))
  const deps = dependencias.map((d) => ({
    origen: d.origen_id, destino: d.destino_id, tipo: d.tipo, lag: num(d.lag_dias) ?? 0,
  }))

  const r = simularMovimiento(paraElMotor, deps, actividadId, deltaDias)
  return {
    arrastradas: r.arrastradas.map((x: { id: string; dias: number }) => ({
      ...x, nombre: nombres.get(x.id) ?? x.id,
    })),
    finObraAntes: r.finObraAntes == null ? null : calendario.fecha(origen, r.finObraAntes),
    finObraDespues: r.finObraDespues == null ? null : calendario.fecha(origen, r.finObraDespues),
    corrimientoFinObra: r.corrimientoFinObra ?? 0,
    sinPlan: Boolean(r.sinPlan),
  }
}
