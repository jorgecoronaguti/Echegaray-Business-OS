// QUIÉN APARECE EN LA LIQUIDACIÓN DE ESTA QUINCENA — Y QUIÉN NO, SIN QUE NADIE SE BORRE.
//
// Pedido del dueño (09/09/2026, textual): *«solo dejame en plantel quienes estén activos esta
// quincena y sacá a los que no, cuidado con eso»*. El «cuidado» es la parte importante y está en el
// código, no en un comentario: esto NO ESCRIBE NADA. No da de baja, no toca `personas`, no cambia
// `en_la_empresa`. Filtra una lectura y publica cuántos quedaron afuera.
//
// ═══ POR QUÉ EL FILTRO ES UNA UNIÓN DE TRES EVIDENCIAS Y NO UN CAMPO ═══
//
// «Activo» no es un estado guardado: es una conclusión sobre una ventana de tiempo. Una persona está
// activa esta quincena si aparece en alguna de las tres cosas que la empresa hace con ella:
//
//   · le liquidó la quincena anterior (línea en la última cerrada — la fuente que el dueño usa),
//   · le cargó horas o presencia en la quincena en curso,
//   · le acordó una tarifa que empieza dentro de la quincena.
//
// Un campo `activo` habría que mantenerlo a mano y quedaría viejo el día que alguien se olvide; las
// tres evidencias se actualizan solas porque son el trabajo del módulo.
//
// ═══ LOS QUE NO APARECEN NO DESAPARECEN ═══
//
// El contador «N sin actividad esta quincena» existe para que sacar gente de la vista no sea lo
// mismo que perderla. Una lista que se acorta en silencio es indistinguible de una que se rompió.
//
// ═══ Y LO QUE EXISTE PARA PROBAR NO ENTRA EN NINGUNA DE LAS DOS LISTAS ═══
//
// Una identidad de prueba no está «sin actividad»: no es una persona. Contarla ahí haría que el
// enlace «17 sin actividad» llevara a una lista con una cuenta de Playwright adentro. Se descarta
// antes de partir, con el único criterio del repo (`identidadDePrueba.ts`).
//
// LA EXCEPCIÓN, DESDE EL 12/09/2026: una cuenta que TAMBIÉN existe para probar sí las ve. Es la
// misma regla que la base aplica en `persona_directorio` (`sesion_es_de_prueba()`), y es lo que
// permite que un E2E escriba una celda de horas sin tocar el jornal de una persona real.

import { sinIdentidadesDePrueba } from './identidadDePrueba.ts'

// ═══ DESDE EL 14/09/2026: EL PLANTEL QUE LA QUINCENA TUVO, NO EL DE HOY ═══
//
// Dueño, textual: *«cada quincena tiene q mostrar el plantel q tuvo activo, no mostrar solo el activo
// actual»*. Las pantallas cortaban con `en_la_empresa = true`, que es el estado de HOY: una quincena de
// marzo perdía a quien se fue en junio. Esta es la única regla, y la usan Horas, el cuadro de
// Liquidación, Caja, Costo y convenio, Cierre y recibos y la semana de asistencia. La proyección de
// quincenas FUTURAS (`getPersonasProyectables`) sigue con el plantel de hoy: ahí sí corresponde.

export interface PersonaDelPlantel {
  id: string
  nombre: string
  /** El estado de HOY. Sólo decide junto con las fechas; nunca corta por sí solo. */
  enLaEmpresa: boolean
  fechaIngreso?: string | null
  fechaEgreso?: string | null
  /** `personas.es_prueba`. Las vistas ya lo filtran; si llega, manda. */
  esPrueba?: boolean | null
  email?: string | null
  /**
   * `personas.subcontrato_id` (20260915T0910). Quien lo tiene es de la cuadrilla de un subcontratista: su costo va a
   * la obra del subcontrato y NO es plantel propio en ninguna quincena, aunque tenga recibos.
   */
  subcontratoId?: string | null
}

/** Qué personas tuvieron actividad EN ESTA quincena. Cualquiera alcanza. */
export interface ActividadDeLaQuincena {
  /** Filas de `registros_hh` con fecha en la ventana. */
  conHoras: ReadonlySet<string>
  /** Línea en `liquidacion_linea` de esta quincena. */
  conLinea: ReadonlySet<string>
  /** Recibo en `recibo_sueldo_linea` de este período. */
  conRecibo: ReadonlySet<string>
  /** Fila en `jornales_bloque_persona` de esta quincena. */
  conJornales: ReadonlySet<string>
}

export interface PlantelDeLaQuincena<P extends PersonaDelPlantel> {
  activas: P[]
  /**
   * QUIEN HOY ESTÁ EN LA EMPRESA Y NO ENTRA EN ESTA QUINCENA (ingresó después, por ejemplo). Se devuelven
   * enteros: una lista que se acorta en silencio es indistinguible de una que se rompió. Las bajas que no
   * son de esta quincena no se cuentan acá: no son «sin actividad», son de otro tiempo.
   */
  sinActividad: P[]
  /** Los `id` con actividad propia en la quincena (a): entran aunque falten tarifa u horas. */
  conActividad: Set<string>
  /**
   * LA CUADRILLA DE UN SUBCONTRATISTA que habría entrado por la regla. No son plantel propio, pero se devuelven: sacar
   * a alguien de la vista no es perderlo, y sus recibos siguen existiendo.
   */
  deSubcontrato: P[]
}

// ═══ DESDE EL 15/09/2026: SIN FECHA DE INGRESO NO ES «DESDE SIEMPRE» ═══
//
// Dueño, textual: *«están mal las quincenas anteriores porque aparecen personas que son parte de un equipo de
// subcontratistas»*. Diez personas dadas de alta el 01/09 desde la liquidación del estudio tienen `fecha_ingreso`
// vacía, y la regla vieja leía el vacío como «ya estaba»: aparecían de enero a agosto. Un ingreso sin cargar no
// afirma nada, ni antes ni después; lo único que ubica a esa persona en una quincena es lo que la empresa hizo con
// ella ESA quincena. El espejo SQL es `activo` en `costo_mo_quincena_calculo` (20260915T0900).

/**
 * EL PLANTEL DE LA QUINCENA [desde, hasta]. Ni una escritura.
 *
 *   a) actividad en la quincena → entra, esté o no en la empresa hoy;
 *   b) sin actividad → tiene `fecha_ingreso` CARGADA y a más tardar `hasta` (sin fecha, sólo entra por a),
 *      no egresó antes de `desde`, y está en la empresa o tiene la fecha de egreso cargada. Una baja SIN
 *      fecha de egreso no tiene cómo ubicarse en el tiempo: sin actividad, no entra.
 *   siempre fuera: `es_prueba`, las identidades de prueba (salvo una sesión de prueba, como la base) y la cuadrilla
 *   de un subcontratista (`subcontratoId`), que se devuelve aparte en `deSubcontrato`.
 */
export function plantelDeLaQuincena<P extends PersonaDelPlantel>(
  personas: readonly P[], q: { desde: string; hasta: string }, a: ActividadDeLaQuincena, laSesionEsDePrueba = false,
): PlantelDeLaQuincena<P> {
  const conActividad = new Set<string>()
  const reales = sinIdentidadesDePrueba(
    personas.filter((p) => laSesionEsDePrueba || p.esPrueba !== true),
    (p) => ({ nombre: p.nombre, email: p.email ?? null }), laSesionEsDePrueba,
  )
  const activas: P[] = []
  const sinActividad: P[] = []
  const deSubcontrato: P[] = []
  for (const p of reales) {
    const tuvo = a.conHoras.has(p.id) || a.conLinea.has(p.id) || a.conRecibo.has(p.id) || a.conJornales.has(p.id)
    const ingreso = p.fechaIngreso != null && p.fechaIngreso <= q.hasta
    const egreso = p.fechaEgreso == null || p.fechaEgreso >= q.desde
    const ubicable = p.enLaEmpresa || p.fechaEgreso != null
    const entra = tuvo || (ingreso && egreso && ubicable)
    if (p.subcontratoId) { if (entra) deSubcontrato.push(p); continue }
    if (tuvo) conActividad.add(p.id)
    if (entra) activas.push(p)
    else if (p.enLaEmpresa) sinActividad.push(p)
  }
  return { activas, sinActividad, conActividad, deSubcontrato }
}

/**
 * ¿TIENE FILA EN EL CUADRO DE LA QUINCENA? El corte que `armarCuadros` hacía a mano, escrito una vez para que
 * la solapa Horas muestre exactamente las mismas personas (QA, 14/09/2026). Alguien del plantel sin
 * actividad, sin tarifa vigente, sin horas y sin presencia no cobra esta quincena: no es una fila.
 */
export function entraAlCuadro(e: {
  conActividad: boolean; tarifaVigente: boolean; horas: number; presenteSinHoras: boolean
}): boolean {
  return e.conActividad || e.tarifaVigente || e.horas > 0 || e.presenteSinHoras
}

const dm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * LA MARCA DE QUIEN YA NO ESTÁ PERO FIGURA EN LA QUINCENA QUE SE MIRA. Chica y apagada: nunca desaparece,
 * y tampoco se lee como un problema. `null` si hoy está en la empresa.
 */
export function marcaDeBaja(p: { enLaEmpresa: boolean; fechaEgreso?: string | null }): { texto: string; titulo: string } | null {
  if (p.enLaEmpresa) return null
  if (p.fechaEgreso) {
    const f = p.fechaEgreso.slice(0, 10)
    return { texto: `baja ${dm(f)}`, titulo: `Se dio de baja el ${dm(f)}/${f.slice(0, 4)}. Figura por la quincena que se está mirando.` }
  }
  return { texto: 'ya no está', titulo: 'Ya no está en la empresa (sin fecha de egreso cargada). Figura por su actividad en esta quincena.' }
}

export interface TarifaHeredada {
  personaId: string
  valorHora: number
  desde: string
  origen: string
}

/** Una línea de la última quincena cerrada: la única fuente del $/h que el dueño quiere heredar. */
export interface LineaDeLaAnterior {
  personaId: string
  valorHora: number | null
}

export const ORIGEN_HEREDADO = 'jornales · quincena anterior'

/**
 * EL $/h QUE ARRANCA LA QUINCENA NUEVA: EL DE LA ANTERIOR.
 *
 * Dueño, 09/09/2026: *«los precios por hora que tenés que poner esta quincena son los que salen de
 * la anterior»*. No es una estimación: es el precio acordado que se pagó quince días atrás, y es la
 * única forma de que Alaniz, Castillo y Zogbe —hoy «sin tarifa» en la pantalla— dejen de estar sin
 * precio sin que nadie invente un número.
 *
 * `desde` es el PRIMER DÍA DE LA QUINCENA EN CURSO y no la fecha de hoy, porque `tarifaVigenteAl`
 * elige por fecha: sembrada al 9 de septiembre, la quincena que arrancó el 1 la vería como futura y
 * seguiría liquidando sin tarifa hasta el día 9.
 *
 * Una línea sellada en `valor_hora` NULL no hereda nada: heredar un NULL escribiría una tarifa que
 * el CHECK de la base rechaza, y forzarla a cero liquidaría a esa persona en $ 0.
 */
export function tarifasHeredadas(
  lineas: readonly LineaDeLaAnterior[], desdeLaQuincenaEnCurso: string,
): TarifaHeredada[] {
  const porPersona = new Map<string, number>()
  for (const l of lineas) {
    if (l.valorHora == null || !(l.valorHora > 0)) continue
    porPersona.set(l.personaId, l.valorHora)
  }
  return [...porPersona].map(([personaId, valorHora]) => ({
    personaId, valorHora, desde: desdeLaQuincenaEnCurso, origen: ORIGEN_HEREDADO,
  }))
}
