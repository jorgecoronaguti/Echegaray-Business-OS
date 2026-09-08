// LA QUINCENA — la grilla PERSONA × día de `/administracion/personas?vista=asistencia`.
//
// Es la MISMA fuente que carga el jefe en `/campo/asistencia`: `registros_hh`. No hay una lectura
// «de administración» y otra «de campo» — dos consultas distintas sobre la misma jornada darían dos
// verdades sobre el mismo día, que es exactamente el defecto que este repo ya pagó.
//
// ═══ UNA FILA POR PERSONA. NUNCA DOS ═══
//
// La versión anterior armaba una fila por par (persona, obra) y el mismo nombre aparecía dos veces
// con la leyenda «la misma persona, la otra obra». El dueño lo vio en producción y lo rechazó:
// *"duplicaste personas… no dupliques nada"*. La grilla contesta «cuántas horas puso cada uno», y
// esa pregunta tiene una sola respuesta por persona y por día. La celda es la SUMA del día en todas
// sus obras; cuando hay más de una, la celda lo declara y el desglose vive en el panel.
//
// ═══ LA COLUMNA OBRA NUNCA MUESTRA UN SLUG ═══
//
// *"jamás el slug tipo sf-mamposteria / la-estrella… si no tiene obra activa, ponele cliente"*. El
// orden es: la obra ACTIVA de su asignación vigente HOY (`obra_canonica.nombre`) · si no tiene ninguna,
// el CLIENTE de la obra donde están sus horas (`obra_canonica.cliente_texto`) · si esa obra no
// tiene cliente cargado, el nombre de la obra · y si no hay nada, «Sin obra activa». El id no es un
// rótulo: es una clave técnica, y escribirla en la pantalla es mostrarle al dueño la plomería.
//
// ═══ LOS TRES SILENCIOS NO SON EL MISMO SILENCIO ═══
//
//   sin_marcar   otros marcaron ese día y a éste no. ES UN RECLAMO: va en rojo y el pie lo nombra.
//   sin_dato     NADIE marcó ese día en ninguna obra. NO se puede afirmar «no se trabajó» ni
//                «nadie lo cargó»: son dos cosas distintas y la grilla no tiene con qué elegir.
//                Se dibuja «—» y el pie dice literalmente que no hay registro, sin interpretarlo.
//   no_laborable feriado o sábado. No se reclama. El domingo ya no es una columna.
//
// ═══ LA LICENCIA NO ES UNA AUSENCIA ═══
//
// Se dibujan distinto porque son cosas distintas: la licencia tiene respaldo documental y alguien
// la autorizó (enfermedad, ART, vacaciones, suspensión); la ausencia es la falta lisa. Guardarlas
// como el mismo silencio le saca un derecho al legajo, y es lo que hacía esta grilla.

import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { redondear } from './jornadaPorObra.ts'
import { etiquetaDeMotivo } from './motivoDeAusencia.ts'
import { esJefeDeObra } from './vocabularioPersona.ts'

export type EstadoCeldaObra =
  | 'horas'
  | 'ausente'
  | 'licencia'
  | 'no_laborable'
  | 'sin_marcar'
  | 'sin_dato'
  | 'futuro'
  /** EL DÍA EN CURSO. No es `sin_marcar` —nadie se atrasó todavía— ni `futuro` —se puede cargar—:
   *  es editable y no reclama. Sin este estado la columna de hoy salía entera punteada. */
  | 'hoy'

/** Lo que esa persona tiene cargado ese día en UNA obra. El desglose que muestra el panel. */
export interface TramoDeObra {
  obra_id: string
  /** El nombre real de la obra. Nunca el id. */
  nombre: string
  /** Horas trabajadas. `null` cuando el tramo es una ausencia declarada. */
  horas: number | null
  ausente: boolean
}

export interface CeldaObra {
  fecha: string
  estado: EstadoCeldaObra
  /** Horas trabajadas del día, sumando todas sus obras. `null` en todo lo que no sea `horas`. */
  horas: number | null
  /** Una entrada por obra con algo cargado ese día. Vacío cuando no hay nada. */
  tramos: TramoDeObra[]
  /** La etiqueta del motivo del catálogo, para `ausente` y `licencia`. Nunca `notas` en crudo, y
   *  `null` cuando nadie escribió un motivo reconocible: inventarlo sería afirmar una causa. */
  motivo: string | null
}

/** Una asignación viva EN ALGÚN PUNTO de la quincena, a una obra ACTIVA. El servicio ya filtró las
 *  dos cosas. `desde`/`hasta` viajan porque «vigente en la quincena» y «vigente HOY» no son lo
 *  mismo: la primera decide quién aparece en la grilla, la segunda cuál es su obra actual. */
export interface AsignacionQuincena {
  persona_id: string
  nombre: string
  nota: string | null
  obra_id: string
  /** `null` = sin límite, no «nunca». Ausente se trata como `null` por compatibilidad. */
  desde?: string | null
  hasta?: string | null
  /** ¿Se le pueden imputar horas a esa obra? `false` = la obra NO está activa. Ausente = sí. Una
   *  asignación no elegible NO pone a nadie en la grilla, pero SÍ puede ser su obra vigente. */
  elegible?: boolean
}

export interface RegistroQuincena {
  persona_id: string
  /** `null` = una AUSENCIA o LICENCIA, que desde el 08/09/2026 se registra sin obra: es de la
   *  persona y sus horas no son costo de ninguna obra. Cuenta en la fila y NO en ninguna columna
   *  de obra: ni en el rótulo, ni en el desglose, ni en «horas en …». */
  obra_id: string | null
  fecha: string
  horas: number
  tipo_hora: string
  /** La clave del motivo (`enfermedad`, `falta`…). Opcional: sin ella la celda no lleva tooltip. */
  notas?: string | null
}

/** Cómo se nombra a alguien que NO tiene ninguna asignación. Sale de `persona_plantel`. */
export interface PersonaRotulo {
  nombre: string
  nota: string | null
}

/** El catálogo de obras, para rotular sin inventar y sin mostrar el id. */
export interface ObraRotulo {
  id: string
  nombre: string
  /** `obra_canonica.cliente_texto`. `null` cuando la obra no tiene cliente cargado. */
  cliente: string | null
  /** `obra_canonica.estado`. La pantalla escribe «(cerrada)» con la palabra REAL de la base: una
   *  obra pausada no es una obra cerrada, e inventar el estado es afirmar lo que nadie dijo. */
  estado?: string | null
}

export interface FilaQuincena {
  /** El `persona_id`. La fila ES la persona: no hay dos filas con la misma clave. */
  clave: string
  persona: { id: string; nombre: string; nota: string | null }
  /** Lo que se escribe en la columna OBRA. Nombre de obra, cliente, o «Sin obra activa». */
  rotuloObra: string
  /**
   * A qué obra se imputa lo que se escriba en una celda vacía. `null` cuando no hay ninguna obra
   * activa: sin destino no se puede escribir, y elegir una por la persona sería inventar el costo.
   */
  obraPorDefecto: { id: string; nombre: string } | null
  /**
   * Su asignación vigente HOY cuando la obra NO admite horas (cerrada, pausada). El desplegable la
   * muestra seleccionada y deshabilitada; `obraPorDefecto` queda en `null` porque a esa obra no se
   * le puede imputar nada.
   *
   * Sin esto la pantalla mentía: el desplegable sólo lista obras activas, así que a AGUERO
   * —vigente en MAMPOSTERÍA, cerrada— le mostraba «SF - PISOS INDUSTRIALES», que no es su obra.
   * Tres de diecisiete filas afirmaban una obra que la base no dice (producción, 08/09/2026).
   */
  obraVigenteNoElegible: { id: string; nombre: string } | null
  celdas: CeldaObra[]
  /** Horas trabajadas de la quincena. `null` = ninguna declarada, que no es lo mismo que cero. */
  horas: number | null
  /** Las fechas que hay que reclamar. Vacío = nada que reclamar. */
  reclama: string[]
  /** Jefe de obra según `personas.puesto`. Es lo que parte la grilla en dos secciones. */
  esJefe: boolean
}

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export const SIN_OBRA = 'Sin obra activa'

export interface EntradaQuincenaObra {
  asignaciones: AsignacionQuincena[]
  registros: RegistroQuincena[]
  /** Catálogo por id. Lo que no esté acá no se puede rotular y cae a `SIN_OBRA`. */
  obras: Record<string, ObraRotulo>
  dias: string[]
  /** Feriados y sábados. La grilla no los reclama. */
  noLaborables?: string[]
  /** El plantel por id, para nombrar a quien dejó registros sin tener ninguna asignación. */
  personas?: Record<string, PersonaRotulo>
  /**
   * `personas.puesto` por id — el ROL ORGANIZACIONAL, y lo único que separa a los jefes de obra del
   * resto del plantel (dueño, 08/09/2026). Quién es jefe lo decide `esJefeDeObra`, acá y en el
   * plantel: una sola definición, en `vocabularioPersona.ts`.
   *
   * AUSENTE NO ES «NO HAY JEFES», ES «NO SE PUDO MIRAR»: quien lee decide qué hacer con eso. Lo que
   * esta capa no hace es inventar un rol — sin el dato, la fila cae con los obreros, que es donde
   * estaba antes de este cambio.
   */
  puestos?: Record<string, string | null>
  /** Hoy, para no reclamar un día que todavía no terminó. */
  hoy: string
}

/**
 * Las filas de la grilla, UNA POR PERSONA. Las personas salen de la unión de las asignaciones
 * vigentes y de quien dejó registros en la quincena: alguien que cargó horas en una obra a la que
 * ya no está asignado tiene que verse igual — sus horas existen.
 */
export function armarQuincenaPorObra(e: EntradaQuincenaObra): FilaQuincena[] {
  const noLaborables = new Set(e.noLaborables ?? [])
  const diasConDato = new Set(e.registros.map((r) => r.fecha))
  const porPersona = new Map<string, RegistroQuincena[]>()
  for (const r of e.registros) {
    const previos = porPersona.get(r.persona_id)
    if (previos) previos.push(r)
    else porPersona.set(r.persona_id, [r])
  }

  return personasDe(e.asignaciones, e.registros, e.personas ?? {}).map((p) => {
    const suyos = porPersona.get(p.persona_id) ?? []
    const celdas = e.dias.map((fecha) => celdaDe({
      fecha,
      registros: suyos.filter((r) => r.fecha === fecha),
      obras: e.obras,
      esNoLaborable: noLaborables.has(fecha),
      hayDatoEseDia: diasConDato.has(fecha),
      futuro: fecha > e.hoy,
      esHoy: fecha === e.hoy,
    }))
    const vigente = obraActivaDe(p.asignaciones, suyos, e.obras, e.hoy)
    const activa = vigente?.elegible ? vigente.obra : null
    const noElegible = vigente && !vigente.elegible ? vigente.obra : null
    return {
      clave: p.persona_id,
      persona: { id: p.persona_id, nombre: p.nombre, nota: p.nota },
      // EL CHIP NO PUEDE CONTARLA EN UNA OBRA ACTIVA. Por eso el rótulo de la obra no elegible
      // lleva su estado pegado: «MAMPOSTERÍA (cerrada)» es un chip propio y no engorda PISOS.
      rotuloObra: activa?.nombre
        ?? (noElegible ? rotuloDeObraNoElegible(noElegible) : null)
        ?? clienteDe(suyos, e.obras) ?? SIN_OBRA,
      obraPorDefecto: activa ? { id: activa.id, nombre: activa.nombre } : null,
      obraVigenteNoElegible: noElegible ? { id: noElegible.id, nombre: noElegible.nombre } : null,
      celdas,
      // `null` Y NO CERO CUANDO NO HAY NINGUNA HORA. Un «0» afirma que esa persona trabajó cero
      // horas esa quincena; lo que pasa es que no hay con qué contestar.
      horas: celdas.some((c) => c.estado === 'horas')
        ? redondear(celdas.reduce((s, c) => s + (c.horas ?? 0), 0))
        : null,
      reclama: celdas.filter((c) => c.estado === 'sin_marcar').map((c) => c.fecha),
      esJefe: esJefeDeObra(e.puestos?.[p.persona_id] ?? null),
    }
  })
}

/** Un tramo de asignación de la persona, tal como llegó. `null` en las puntas = sin límite. */
interface TramoAsignado {
  obra_id: string
  desde: string | null
  hasta: string | null
  /** `false` cuando la obra no admite horas. Sigue siendo su obra vigente: no se descarta. */
  elegible: boolean
}

const tramoDe = (a: AsignacionQuincena): TramoAsignado => ({
  obra_id: a.obra_id, desde: a.desde ?? null, hasta: a.hasta ?? null, elegible: a.elegible !== false,
})

/** «MAMPOSTERÍA (cerrada)» — el nombre real con el estado real. */
function rotuloDeObraNoElegible(o: ObraRotulo): string {
  const estado = (o.estado ?? '').trim()
  return estado ? `${o.nombre} (${estado})` : o.nombre
}

interface PersonaDeLaGrilla {
  persona_id: string
  nombre: string
  nota: string | null
  /** Sus asignaciones a obras ACTIVAS vivas en la quincena. Puede tener más de una, y puede tener
   *  tramos ya cerrados: cuál rige HOY lo decide `obraActivaDe`, no esta lista. */
  asignaciones: TramoAsignado[]
}

/** Las personas de la quincena, ordenadas por nombre. Una entrada por `persona_id`, sin excepción. */
function personasDe(
  asignaciones: AsignacionQuincena[],
  registros: RegistroQuincena[],
  plantel: Record<string, PersonaRotulo>,
): PersonaDeLaGrilla[] {
  const mapa = new Map<string, PersonaDeLaGrilla>()
  for (const a of asignaciones) {
    // NO SE DEDUPLICA POR OBRA. Dos tramos a la misma obra con `desde` distinto son dos hechos
    // —volvió a la obra después de un paso por otra— y el `desde` del último es justamente lo que
    // desempata cuál rige hoy. Colapsarlos al primero perdía ese dato.
    // UNA ASIGNACIÓN A UNA OBRA QUE NO ADMITE HORAS NO CREA LA FILA: la grilla se llenaría de gente
    // que sólo figura en obras cerradas del historial de JORNALES. Se engancha al final, sobre
    // quien ya está en la grilla por otra razón.
    if (a.elegible === false) continue
    const tramo = tramoDe(a)
    const previa = mapa.get(a.persona_id)
    if (previa) { previa.asignaciones.push(tramo); continue }
    mapa.set(a.persona_id, {
      persona_id: a.persona_id, nombre: a.nombre, nota: a.nota, asignaciones: [tramo],
    })
  }
  for (const r of registros) {
    if (mapa.has(r.persona_id)) continue
    // ═══ CUALQUIER REGISTRO PONE A SU PERSONA EN LA GRILLA ═══
    //
    // No sólo las horas trabajadas: una ausencia, una licencia o una improductiva también son un
    // hecho declarado de esta quincena. QUIROGA ALEXANDER SEBASTIAN tenía 45 licencias por
    // enfermedad importadas de JORNALES —del 01/07 al 07/09— y ninguna asignación, y la pantalla
    // lo mostraba como si no existiera: alguien de licencia larga es exactamente lo que
    // Administración necesita ver.
    //
    // El nombre sale de su asignación si la tiene, y si no del PLANTEL. Antes, sin asignación no
    // había con qué nombrarlo y la fila se descartaba; `persona_plantel` es la misma tabla de la
    // que salen todos los nombres de esta pantalla, no una segunda fuente.
    const conNombre = asignaciones.find((a) => a.persona_id === r.persona_id)
    const delPlantel = plantel[r.persona_id]
    if (!conNombre && !delPlantel) continue
    mapa.set(r.persona_id, {
      persona_id: r.persona_id,
      nombre: conNombre?.nombre ?? delPlantel.nombre,
      nota: conNombre?.nota ?? delPlantel?.nota ?? null,
      asignaciones: [],
    })
  }
  for (const a of asignaciones) {
    if (a.elegible !== false) continue
    mapa.get(a.persona_id)?.asignaciones.push(tramoDe(a))
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * LA OBRA ACTUAL ES LA ASIGNACIÓN VIGENTE HOY. NO LA DE MÁS HORAS.
 *
 * El defecto que esto arregla lo vio el dueño en producción (08/09/2026): *"empiezo a poner bien en
 * la obra que están y se rompe"*. Movía a ALANIZ de PISOS INDUSTRIALES a SALÓN COMERCIAL, el acuse
 * decía «Ya estaba en Quattropani – SALÓN COMERCIAL» —porque la asignación vigente SÍ era ésa— y el
 * desplegable volvía a mostrar PISOS INDUSTRIALES. La razón: el tramo cerrado de PISOS sigue vivo
 * dentro de la quincena (sus horas de esos días existen y tienen que verse), y esta función elegía
 * entre las dos por HORAS. Las horas de la quincena ya estaban en PISOS, así que la pantalla
 * contradecía a la base y desmentía el gesto que el dueño acababa de hacer.
 *
 * Las horas de la quincena NO deciden dónde está hoy una persona: dicen dónde estuvo. El orden es
 * `hasta` vigente hoy · el `desde` MÁS RECIENTE · y sólo con el mismo `desde` —dos frentes abiertos
 * el mismo día, donde la base no tiene con qué elegir— desempatan las horas, y después el nombre
 * para que el rótulo no baile entre dos recargas.
 */
function obraActivaDe(
  asignaciones: TramoAsignado[],
  registros: RegistroQuincena[],
  catalogo: Record<string, ObraRotulo>,
  hoy: string,
): { obra: ObraRotulo; elegible: boolean } | null {
  // Vigente HOY: empezó (o siempre estuvo) y no se cerró antes de hoy. Un `desde` futuro todavía no
  // rige — decir que ya está ahí sería adelantar un traslado que no ocurrió.
  const vigentes = asignaciones.filter((a) =>
    (!a.desde || a.desde <= hoy) && (!a.hasta || a.hasta >= hoy))
  const rotulables = vigentes
    .map((a) => ({ tramo: a, obra: catalogo[a.obra_id] }))
    .filter((x): x is { tramo: TramoAsignado; obra: ObraRotulo } => Boolean(x.obra))
  if (rotulables.length === 0) return null
  const horas = new Map<string, number>()
  for (const r of registros) {
    if (esTrabajada(r.tipo_hora) && r.obra_id) {
      horas.set(r.obra_id, (horas.get(r.obra_id) ?? 0) + numero(r.horas))
    }
  }
  const ganador = [...rotulables].sort((a, b) =>
    (b.tramo.desde ?? '').localeCompare(a.tramo.desde ?? '')
    || (horas.get(b.obra.id) ?? 0) - (horas.get(a.obra.id) ?? 0)
    || a.obra.nombre.localeCompare(b.obra.nombre, 'es'))[0]
  return { obra: ganador.obra, elegible: ganador.tramo.elegible }
}

/**
 * El CLIENTE de la obra donde están sus horas, para quien no tiene ninguna obra activa. Se elige la
 * obra con más horas de la quincena. Si esa obra no tiene cliente cargado se cae a su nombre —que
 * sigue siendo un rótulo real— y nunca al id.
 */
function clienteDe(
  registros: RegistroQuincena[], catalogo: Record<string, ObraRotulo>,
): string | null {
  const horas = new Map<string, number>()
  // SÓLO LAS FILAS CON OBRA. Éste es el rótulo que la grilla muestra como «horas en …»: una
  // ausencia sin obra no puede fabricar «horas en La Estrella» — que es exactamente lo que el dueño
  // rechazó el 08/09/2026.
  for (const r of registros) {
    if (r.obra_id) horas.set(r.obra_id, (horas.get(r.obra_id) ?? 0) + numero(r.horas))
  }
  const mejor = [...horas.entries()]
    .map(([id, h]) => ({ obra: catalogo[id], h }))
    .filter((x): x is { obra: ObraRotulo; h: number } => Boolean(x.obra))
    .sort((a, b) => b.h - a.h || a.obra.nombre.localeCompare(b.obra.nombre, 'es'))[0]
  if (!mejor) return null
  return mejor.obra.cliente?.trim() || mejor.obra.nombre.trim() || null
}

function celdaDe({ fecha, registros, obras, esNoLaborable, hayDatoEseDia, futuro, esHoy }: {
  fecha: string
  registros: RegistroQuincena[]
  obras: Record<string, ObraRotulo>
  esNoLaborable: boolean
  hayDatoEseDia: boolean
  futuro: boolean
  esHoy: boolean
}): CeldaObra {
  const tramos = tramosDe(registros, obras)
  const trabajadas = registros.filter((r) => esTrabajada(r.tipo_hora))
  // LO TRABAJADO GANA A LA AUSENCIA, y no al revés. Cuando la fila era por obra, una ausencia en
  // esa obra era todo lo que había del día. Ahora la fila es la persona: si trabajó 8 hs en una
  // obra y en otra alguien le cargó una ausencia, el día NO es una ausencia — son 8 horas y un
  // dato contradictorio, que el desglose del panel deja ver.
  if (trabajadas.length > 0) {
    return {
      fecha, estado: 'horas', tramos, motivo: null,
      horas: redondear(trabajadas.reduce((s, r) => s + numero(r.horas), 0)),
    }
  }
  if (registros.length > 0) {
    // LICENCIA GANA SOBRE AUSENCIA cuando el día trae las dos — la misma regla que la ficha de la
    // persona (`quincenaDePersona.ts`): la licencia está autorizada y documentada, degradarla a
    // falta le saca un derecho al legajo. Ninguna de las dos suma horas trabajadas.
    const licencia = registros.some((r) => r.tipo_hora === 'licencia')
    return {
      fecha, estado: licencia ? 'licencia' : 'ausente', horas: null, tramos,
      motivo: motivoDelDia(registros),
    }
  }
  // EL FUTURO SE PREGUNTA PRIMERO. Al revés, el sábado 12 —que todavía no llegó— salía con el «—»
  // de no laborable mientras el resto de los días futuros salían vacíos: la misma quincena decía
  // dos cosas distintas del mismo mañana. Lo que un día NO pasado tiene para decir es nada.
  if (futuro) return { fecha, estado: 'futuro', horas: null, tramos, motivo: null }
  if (esNoLaborable) return { fecha, estado: 'no_laborable', horas: null, tramos, motivo: null }
  if (esHoy) return { fecha, estado: 'hoy', horas: null, tramos, motivo: null }
  if (!hayDatoEseDia) return { fecha, estado: 'sin_dato', horas: null, tramos, motivo: null }
  return { fecha, estado: 'sin_marcar', horas: null, tramos, motivo: null }
}

/** El primer motivo del catálogo que traiga el día. `null` si nadie escribió uno reconocible. */
function motivoDelDia(registros: RegistroQuincena[]): string | null {
  for (const r of registros) {
    const m = etiquetaDeMotivo(r.notas)
    if (m) return m
  }
  return null
}

/** El desglose por obra del día, ordenado por nombre. Es lo que el panel muestra y corrige. */
function tramosDe(
  registros: RegistroQuincena[], obras: Record<string, ObraRotulo>,
): TramoDeObra[] {
  const mapa = new Map<string, TramoDeObra>()
  for (const r of registros) {
    // UNA AUSENCIA SIN OBRA NO ES UN TRAMO DE OBRA. El desglose del panel dice dónde estuvo el día;
    // una ausencia no estuvo en ninguna parte. Si entrara acá, el panel la mostraría como un tramo
    // «Sin obra activa» y `tramos.length > 1` diría que el día se repartió entre dos obras.
    if (r.obra_id === null) continue
    const previo = mapa.get(r.obra_id) ?? {
      obra_id: r.obra_id,
      // SIN CATÁLOGO NO SE ESCRIBE EL ID. Una obra que la sesión no puede leer por RLS igual dejó
      // horas visibles; rotularla con su slug sería lo que el dueño rechazó.
      nombre: obras[r.obra_id]?.nombre ?? SIN_OBRA,
      horas: null,
      ausente: false,
    }
    if (esTrabajada(r.tipo_hora)) previo.horas = redondear((previo.horas ?? 0) + numero(r.horas))
    else previo.ausente = true
    mapa.set(r.obra_id, previo)
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** El total por columna. `null` en un día sin ningún dato: un 0 diría que se trabajaron cero horas. */
export function totalesPorDia(filas: FilaQuincena[], dias: string[]): (number | null)[] {
  return dias.map((fecha, i) => {
    const celdas = filas.map((f) => f.celdas[i]).filter((c) => c?.fecha === fecha)
    if (celdas.every((c) => c.estado !== 'horas')) return null
    return redondear(celdas.reduce((s, c) => s + (c.horas ?? 0), 0))
  })
}

/**
 * El total de la quincena. `null` —y la pantalla escribe «—»— cuando NADIE declaró una hora.
 *
 * Devolvía `0`, y un cero abajo de una columna de guiones afirma que la empresa trabajó cero horas
 * esa quincena. Lo que pasa es que no hay con qué contestar: es la misma regla que ya gobierna cada
 * celda y cada total por día, que estaba rota justo en el número más grande de la pantalla.
 */
export function totalDeLaQuincena(filas: FilaQuincena[]): number | null {
  if (!filas.some((f) => f.horas !== null)) return null
  return redondear(filas.reduce((s, f) => s + (f.horas ?? 0), 0))
}

/** Cuántas personas tiene cada rótulo de obra en la quincena. Los chips del encabezado. */
export function personasPorObra(filas: FilaQuincena[]): { rotulo: string; personas: number }[] {
  const mapa = new Map<string, number>()
  for (const f of filas) mapa.set(f.rotuloObra, (mapa.get(f.rotuloObra) ?? 0) + 1)
  return [...mapa.entries()]
    .map(([rotulo, personas]) => ({ rotulo, personas }))
    .sort((a, b) => b.personas - a.personas || a.rotulo.localeCompare(b.rotulo, 'es'))
}

/** «1 día sin marcar» — el ámbar del encabezado. Cuenta DÍAS distintos, no celdas. */
export function diasSinMarcar(filas: FilaQuincena[]): number {
  return new Set(filas.flatMap((f) => f.reclama)).size
}
