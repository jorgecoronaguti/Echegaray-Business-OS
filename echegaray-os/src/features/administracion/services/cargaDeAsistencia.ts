// LA CARGA DE ASISTENCIA — UNA SOLA EXPERIENCIA (dueño, 17/09/2026).
//
// Textual: *«la funcionalidad de carga de asistencia en mobile se hace en la sección horas y en
// computadora en la sección plantel, es una funcionalidad cruzada y errada, tenés que rehacer y hacer
// una sola experiencia de uso para ingresar a carga de asistencia»*.
//
// Había tres puertas con tres modelos mentales: Plantel marcaba SÓLO HOY y persona por persona; Horas
// en el teléfono pedía elegir obra → día → presencia → horas; `/campo/asistencia` repetía lo segundo.
// Esta pantalla es un día y TODA la gente, agrupada por la obra donde está ese día. Lo que decide qué
// se ve vive acá, puro y probado; las escrituras siguen siendo las acciones que ya existían.
//
// ═══ QUÉ NO DECIDE ESTE ARCHIVO ═══
//
// Qué escribe un toque (`casillaTrasToque` / `marcaDeLaCasilla`), cuánto es la jornada
// (`jornadaPorDefecto`), qué motivo es licencia (`tipoDeMotivo`) ni si la quincena está cerrada
// (`quincenaCerrada`). Una segunda definición de cualquiera de esas discreparía con Plantel y Horas el
// día que se corrija una sola.

import type { CasillaPresencia, EstadoPresencia } from './presenciaDelDia.ts'
import { validarProgramacion } from './planDeObraActual.ts'
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { leerCeldaDeHoras } from './jornadaPorObra.ts'
import { hrefDeAsistencia } from './vistaDeAsistencia.ts'
import { obraDeLaAsignacionDelDia } from '../../../../orquestador/lib/asignacion-del-dia.mjs'

export const RUTA_CARGA_ASISTENCIA = '/administracion/personas/asistencia'

// ═══ DECISIÓN 2 DEL DUEÑO (confirmada 17/09/2026) ═══
//
// «Jefes de obra y mensuales SÍ se marcan presentes, sin presentismo». Revierte, SÓLO en esta pantalla,
// la regla del 08/09 de `personasAMarcar` («los jefes no se marcan»), que sigue rigiendo las pantallas
// viejas hasta que el hito 2 las retire. Si el dueño vuelve atrás, se cambia esta constante y su test.
//
// «Mensual» se lee por el puesto (`esJefe`) y no por la tarifa: `persona_tarifa` es de `ve_economia()`
// y el jefe de obra —que usa esta pantalla— no la puede leer. Con la tarifa, la misma persona
// tendría presentismo para Administración y no para el jefe.
export const MARCAR_JEFES_Y_MENSUALES = true

export interface PersonaDeLaCarga {
  id: string
  nombre: string
  categoria: string | null
  /** `esJefeDeObra(puesto)`, decidido en el servidor con el mismo criterio que la grilla y Plantel. */
  esJefe: boolean
}

export const seListaParaMarcar = (p: Pick<PersonaDeLaCarga, 'esJefe'>): boolean =>
  MARCAR_JEFES_Y_MENSUALES || !p.esJefe

/** Los botones de tardanza: sólo a quien tiene presentismo y sólo sobre «sin marcar» o «Está» —tocarlos
 *  declara presente (17/09/2026)—. Sobre «No vino» o «Licencia» serían una contradicción que el CHECK
 *  `asistencia_dia_tardanza_solo_presente` rechaza. */
export const muestraTardanza = (p: Pick<PersonaDeLaCarga, 'esJefe'>, estado: EstadoPresencia | null): boolean =>
  tienePresentismo(p) && (estado === null || estado === 'presente')

/** Quien cobra por mes no tiene presentismo: la tardanza no le cambia un peso, y ofrecerla invita a
 *  cargar una marca que después la liquidación ignora sin decirlo. */
export const tienePresentismo = (p: Pick<PersonaDeLaCarga, 'esJefe'>): boolean => !p.esJefe

export interface PresenciaDelDiaConObra extends CasillaPresencia {
  persona_id: string
  estado: EstadoPresencia
  obra_canonica_id: string | null
}

export interface HoraDelDiaConObra {
  persona_id: string
  obra_canonica_id: string | null
  horas: number
  tipo_hora: string
}

export interface AsignacionDelDia {
  persona_id: string
  obra_id: string
  desde: string | null
  hasta: string | null
}

export type PorqueDeLaObra = 'marca' | 'horas' | 'asignacion' | 'varias-asignaciones' | 'sin-obra'

/**
 * EN QUÉ OBRA APARECE ALGUIEN ESE DÍA — en el orden en que la evidencia manda.
 *
 *  1. LA MARCA DEL DÍA (`asistencia_dia.obra_canonica_id`). Si ya lo declararon en otra obra, está
 *     ahí: mostrarlo en su obra asignada invitaría a marcarlo de nuevo, y el upsert es por
 *     (persona, fecha) — pisaría la primera declaración con otra obra.
 *  2. LAS HORAS TRABAJADAS de ese día con obra. Son costo ya imputado a esa obra.
 *  3. LA ASIGNACIÓN VIGENTE ese día, con la regla única del importador (`asignacion-del-dia.mjs`).
 *     Un empate total no se elige: queda sin obra y la pantalla lo dice.
 */
export function obraDelDiaDePersona({ fecha, presencia, horas, asignaciones }: {
  fecha: string
  presencia: Pick<PresenciaDelDiaConObra, 'obra_canonica_id'> | null
  horas: readonly HoraDelDiaConObra[]
  asignaciones: readonly AsignacionDelDia[]
}): { obraId: string | null; porque: PorqueDeLaObra } {
  if (presencia?.obra_canonica_id) return { obraId: presencia.obra_canonica_id, porque: 'marca' }
  const trabajada = horas.find((h) => h.obra_canonica_id && esTrabajada(h.tipo_hora))
  if (trabajada?.obra_canonica_id) return { obraId: trabajada.obra_canonica_id, porque: 'horas' }
  const tramos = asignaciones.map((a) => ({ obra: a.obra_id, desde: a.desde, hasta: a.hasta }))
  const cubren = asignaciones.filter((a) => (!a.desde || a.desde <= fecha) && (!a.hasta || fecha <= a.hasta))
  if (cubren.length === 0) return { obraId: null, porque: 'sin-obra' }
  const obraId = obraDeLaAsignacionDelDia(tramos, fecha) as string | null
  return obraId ? { obraId, porque: 'asignacion' } : { obraId: null, porque: 'varias-asignaciones' }
}

export interface FilaDeCarga {
  persona: PersonaDeLaCarga
  obraId: string | null
  porque: PorqueDeLaObra
  casilla: CasillaPresencia
  /** Horas TRABAJADAS de ese día en la obra de la fila. `null` = ninguna cargada (no es cero). */
  horas: number | null
  /** Horas trabajadas ese día en OTRAS obras, por obra (dueño, 17/09: «dos obras el mismo día se
   *  reparten las horas, 5 + 4»). Se muestran y se editan al lado: sin esto el día se carga dos veces. */
  otrasObras: { obraId: string; horas: number }[]
}

export interface GrupoDeCarga {
  obraId: string | null
  nombre: string
  filas: FilaDeCarga[]
}

export const NOMBRE_SIN_OBRA = 'Sin obra'

const redondear = (n: number): number => Math.round(n * 100) / 100

/** Las filas del día: toda persona listable, cada una en su obra. Pura: no lee, no escribe. */
export function armarCargaDelDia({ fecha, personas, presencias, horas, asignaciones }: {
  fecha: string
  personas: readonly PersonaDeLaCarga[]
  presencias: readonly PresenciaDelDiaConObra[]
  horas: readonly HoraDelDiaConObra[]
  asignaciones: readonly AsignacionDelDia[]
}): FilaDeCarga[] {
  const porPersona = <T extends { persona_id: string }>(xs: readonly T[]) => {
    const m = new Map<string, T[]>()
    for (const x of xs) m.set(x.persona_id, [...(m.get(x.persona_id) ?? []), x])
    return m
  }
  const presenciaDe = new Map(presencias.map((p) => [p.persona_id, p]))
  const horasDe = porPersona(horas)
  const asignacionesDe = porPersona(asignaciones)

  return personas.filter(seListaParaMarcar).map((p) => {
    const presencia = presenciaDe.get(p.id) ?? null
    const suyas = horasDe.get(p.id) ?? []
    const { obraId, porque } = obraDelDiaDePersona({
      fecha, presencia, horas: suyas, asignaciones: asignacionesDe.get(p.id) ?? [],
    })
    const trabajadas = suyas.filter((h) => esTrabajada(h.tipo_hora))
    const sumaDe = (id: string | null) => redondear(trabajadas.filter((h) => h.obra_canonica_id === id).reduce((t, h) => t + h.horas, 0))
    const otras = [...new Set(trabajadas.map((h) => h.obra_canonica_id))]
      .filter((id): id is string => id !== null && id !== obraId)
    return {
      persona: p,
      obraId,
      porque,
      casilla: presencia
        ? {
          estado: presencia.estado, motivo: presencia.motivo ?? null,
          llego_tarde: presencia.llego_tarde === true, salio_antes: presencia.salio_antes === true,
        }
        : { estado: null, motivo: null },
      horas: obraId !== null && trabajadas.some((h) => h.obra_canonica_id === obraId) ? sumaDe(obraId) : null,
      otrasObras: otras.map((id) => ({ obraId: id, horas: sumaDe(id) })).sort((a, b) => a.obraId.localeCompare(b.obraId)),
    }
  })
}

const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** El recorte de la pantalla: por obra (`id`, o `sin-obra`) y por texto en nombre o categoría. */
export function filtrarCarga(
  filas: readonly FilaDeCarga[], { obra, q }: { obra?: string | null; q?: string | null },
): FilaDeCarga[] {
  const texto = normalizar(q ?? '')
  return filas.filter((f) => {
    if (obra === OBRA_SIN_OBRA && f.obraId !== null) return false
    if (obra && obra !== OBRA_SIN_OBRA && f.obraId !== obra) return false
    if (!texto) return true
    return normalizar(`${f.persona.nombre} ${f.persona.categoria ?? ''}`).includes(texto)
  })
}

/** El valor del filtro que recorta a quienes no tienen obra ese día. No es un id posible de obra. */
export const OBRA_SIN_OBRA = 'sin-obra'

/** Los grupos por obra, ordenados por nombre, con «Sin obra» al final: es lo que hay que resolver
 *  después de marcar a las cuadrillas, no antes. */
export function agruparPorObra(
  filas: readonly FilaDeCarga[], nombres: Readonly<Record<string, string>>,
): GrupoDeCarga[] {
  const grupos = new Map<string | null, FilaDeCarga[]>()
  for (const f of filas) grupos.set(f.obraId, [...(grupos.get(f.obraId) ?? []), f])
  return [...grupos.entries()]
    .map(([obraId, fs]) => ({
      obraId,
      nombre: obraId === null ? NOMBRE_SIN_OBRA : (nombres[obraId] ?? obraId),
      filas: [...fs].sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre, 'es')),
    }))
    .sort((a, b) => (a.obraId === null ? 1 : b.obraId === null ? -1 : a.nombre.localeCompare(b.nombre, 'es')))
}

export interface ResumenDeCarga {
  presentes: number
  ausentes: number
  licencias: number
  sinMarcar: number
  conTardanza: number
}

export function resumenDeCarga(casillas: readonly CasillaPresencia[]): ResumenDeCarga {
  const cuenta = (e: EstadoPresencia | null) => casillas.filter((c) => c.estado === e).length
  return {
    presentes: cuenta('presente'),
    ausentes: cuenta('ausente'),
    licencias: cuenta('licencia'),
    sinMarcar: cuenta(null),
    conTardanza: casillas.filter((c) => c.estado === 'presente' && (c.llego_tarde === true || c.salio_antes === true)).length,
  }
}

/**
 * ¿SE PUEDE MOVER A ALGUIEN DE OBRA ESE DÍA? Con la misma regla que la acción (`validarProgramacion`):
 * desde hoy en adelante sí; hacia atrás no, porque reimputaría costo de días ya mirados. La pantalla
 * no ofrece el gesto que la acción va a rechazar.
 */
export const puedeMoverDeObraEl = (fecha: string, hoy: string): boolean =>
  validarProgramacion({ hoy, desde: fecha }) === null

// ═══ DECISIÓN 5 DEL DUEÑO (confirmada 17/09/2026): HASTA CUÁNDO SE CORRIGE ═══
//
// «Jefe de obra corrige hoy + 2 días hábiles hacia atrás; más atrás, sólo Administración/Dirección».
// Hábil = lunes a viernes: el sábado trabajado existe pero no es el día que se espera controlar, y
// contarlo dejaría al jefe corrigiendo un jueves el lunes siguiente. Los feriados NO se descuentan:
// esta regla no lee el calendario de no laborables (límite declarado). Hacia adelante no hay tope.
export const DIAS_HABILES_ATRAS_JEFE = 2

const esHabil = (iso: string): boolean => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return d >= 1 && d <= 5
}

const restarUnDia = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** El día más viejo que el jefe de obra todavía puede corregir. */
export function limiteDelJefe(hoy: string, habiles: number = DIAS_HABILES_ATRAS_JEFE): string {
  let d = hoy
  for (let n = 0; n < habiles;) {
    d = restarUnDia(d)
    if (esHabil(d)) n += 1
  }
  return d
}

export type PermisoDelDia = { ok: true } | { ok: false; porque: string }

/** ¿Este rol puede marcar o corregir ese día? `null` en rol = nadie: falla cerrado. */
export function puedeCorregirElDia({ rol, fecha, hoy }: { rol: string | null | undefined; fecha: string; hoy: string }): PermisoDelDia {
  if (rol === 'direccion' || rol === 'administracion') return { ok: true }
  if (rol !== 'jefe_obra') return { ok: false, porque: 'Tu usuario no carga asistencia.' }
  if (fecha >= limiteDelJefe(hoy)) return { ok: true }
  return { ok: false, porque: `Más de ${DIAS_HABILES_ATRAS_JEFE} días hábiles atrás: lo corrige Administración.` }
}

/**
 * LO QUE VIAJA A `cambiarObraActual` AL MOVER DESDE ESTA PANTALLA. Hoy va SIN `desde`: la acción usa
 * su propio hoy, y mandar el de la página a medianoche haría rebotar el pase con «hacia atrás». Un día
 * futuro va con `desde` y sin `hasta` —el pase programado de siempre (M3)—; `null` si el día es pasado.
 */
export function entradaDeMover({ personaId, destino, fecha, hoy }: {
  personaId: string; destino: string; fecha: string; hoy: string
}): { persona_id: string; obra_id: string | null; desde?: string } | null {
  // SIN ELEGIR NO SE MUEVE. «Sin obra» es un destino que CIERRA la asignación: si fuera el valor por
  // defecto del desplegable, un toque apurado en «Mover» dejaría a alguien sin obra desde hoy.
  if (!destino || !puedeMoverDeObraEl(fecha, hoy)) return null
  return { persona_id: personaId, obra_id: destino === DESTINO_SIN_OBRA ? null : destino, ...(fecha === hoy ? {} : { desde: fecha }) }
}

/** El valor del desplegable que elige «Sin obra» a propósito. No es un id de obra posible. */
export const DESTINO_SIN_OBRA = '__sin_obra__'

/**
 * LO QUE VIAJA A `guardarJornada` AL SALIR DE UNA CASILLA DE HORAS. `nada` cuando no cambió o cuando se
 * vació una casilla que ya estaba vacía: un blur no puede ser una escritura.
 */
export type EnvioDeHoras =
  | { tipo: 'nada' }
  | { tipo: 'error'; error: string }
  | { tipo: 'guardar'; entrada: { obra_id: string; fecha: string; vaciar: string[] } | { obra_id: string; fecha: string; marcas: { persona_id: string; estado: 'presente'; horas: number }[] } }

export function envioDeHoras({ personaId, obraId, fecha, antes, texto }: {
  personaId: string; obraId: string; fecha: string; antes: number | null; texto: string
}): EnvioDeHoras {
  const lectura = leerCeldaDeHoras(texto)
  if (lectura.accion === 'error') return { tipo: 'error', error: lectura.error }
  if (lectura.accion === 'vaciar') {
    return antes === null ? { tipo: 'nada' } : { tipo: 'guardar', entrada: { obra_id: obraId, fecha, vaciar: [personaId] } }
  }
  if (lectura.horas === antes) return { tipo: 'nada' }
  return { tipo: 'guardar', entrada: { obra_id: obraId, fecha, marcas: [{ persona_id: personaId, estado: 'presente', horas: lectura.horas }] } }
}

/**
 * LA SALIDA A LA CORRECCIÓN COMPLETA (D5–D7, H3): tramo de licencia, «sin novedad», mover sólo la jornada.
 * Eso ya lo hace el panel de la grilla con `corregirJornada`; reimplementarlo acá sería la segunda
 * definición de la acción más delicada de Horas. Se abre la quincena de ese día, buscando a la persona.
 */
export const hrefCorregirEnHoras = (fecha: string, nombre: string): string =>
  hrefDeAsistencia('/administracion/personas', {}, { quincena: fecha, q: nombre, modo: 'quincena' })

/**
 * QUÉ SE PUEDE TOCAR ESE DÍA. La quincena cerrada NO es sólo lectura: `guardarPresencia` sigue
 * guardando la presencia (es un hecho del día) y descarta tardanza y horas, que cambiarían una
 * liquidación pagada (D1, Q1). Ofrecer esos dos botones sería prometer una escritura que la acción
 * rechaza; apagar también la presencia sería quitar una capacidad que ya existe.
 * El permiso del día (decisión 5), en cambio, apaga todo: `motivo` dice por qué.
 */
export function queSePuedeElDia({ permiso, cierre }: { permiso: PermisoDelDia; cierre: string | null }): {
  marcar: boolean; tardanza: boolean; horas: boolean; motivo: string | null
} {
  if (!permiso.ok) return { marcar: false, tardanza: false, horas: false, motivo: permiso.porque }
  if (cierre) return { marcar: true, tardanza: false, horas: false, motivo: `${cierre} La presencia se sigue marcando; horas y tardanza no.` }
  return { marcar: true, tardanza: true, horas: true, motivo: null }
}

/** El enlace a esta pantalla desde Plantel y Horas. `hoy` no se escribe: es el día por defecto. */
export function hrefCargaDeAsistencia({ dia, obra, hoy }: { dia?: string | null; obra?: string | null; hoy?: string }): string {
  const p = new URLSearchParams()
  if (dia && dia !== hoy) p.set('dia', dia)
  if (obra) p.set('obra', obra)
  const qs = p.toString()
  return `${RUTA_CARGA_ASISTENCIA}${qs ? `?${qs}` : ''}`
}

// ═══ EL REDISEÑO APROBADO (dueño, 17/09/2026) ═══
//
// Una acción primaria por pantalla, el estado en un control segmentado y todo lo excepcional —mover,
// planificar, motivo, repartir horas— en el panel de la persona. Las tres reglas de abajo son lo que
// esa pantalla decide y no puede quedar escrito dos veces (compu y teléfono).

/**
 * «MARCAR PRESENTES · N SIN MARCAR»: a quién marca la acción primaria, agrupado por la obra donde se
 * imputa. Sólo a quien estaba sin marcar —no pisa un «Ausente» ni una licencia— y sólo con obra: la
 * jornada por defecto se imputa a esa obra, y sin obra habría que adivinarla.
 */
export function sinMarcarPorObra(
  filas: readonly FilaDeCarga[], casillas: Readonly<Record<string, CasillaPresencia>>,
  obraDe: (f: FilaDeCarga) => string | null,
): { porObra: Map<string, string[]>; sinObra: number } {
  const porObra = new Map<string, string[]>()
  let sinObra = 0
  for (const f of filas) {
    if ((casillas[f.persona.id] ?? f.casilla).estado) continue
    const obra = obraDe(f)
    if (!obra) { sinObra += 1; continue }
    porObra.set(obra, [...(porObra.get(obra) ?? []), f.persona.id])
  }
  return { porObra, sinObra }
}

/**
 * EL BOTÓN GRANDE DEL TELÉFONO. Sin marcar: «Presente» y un toque lo marca. Con cualquier marca abre la
 * ficha —nunca desmarca—: en la obra, con el pulgar, un toque de más no puede borrar un presente con sus
 * horas. Quitarlo es un gesto deliberado dentro de la ficha.
 */
export function botonDelTelefono(c: CasillaPresencia): { rotulo: string; accion: 'marcar' | 'abrir'; tono: 'pos' | 'neg' | 'neutro' | 'vacio' } {
  if (c.estado === 'presente') return { rotulo: '✓ Presente', accion: 'abrir', tono: 'pos' }
  if (c.estado === 'ausente') return { rotulo: 'Ausente', accion: 'abrir', tono: 'neg' }
  if (c.estado === 'licencia') return { rotulo: 'Licencia', accion: 'abrir', tono: 'neutro' }
  return { rotulo: 'Presente', accion: 'marcar', tono: 'vacio' }
}

/**
 * LO QUE VIAJA A `cambiarObraActual` DESDE EL PANEL: mover desde hoy o programar un pase desde un día
 * futuro, con o sin día de vuelta. Desde hoy y sin vuelta va SIN `desde` —la acción usa su propio hoy, ver
 * `entradaDeMover`—; con vuelta o desde un día futuro viajan las dos fechas. La validación es la misma
 * de la acción (`validarProgramacion`): el panel no ofrece un pase que la base va a rechazar.
 */
export function entradaDePase({ personaId, destino, desde, hasta, hoy }: {
  personaId: string; destino: string; desde: string; hasta: string | null; hoy: string
}): { ok: true; entrada: { persona_id: string; obra_id: string | null; desde?: string; hasta?: string } } | { ok: false; error: string } {
  if (!destino) return { ok: false, error: 'Elegí a qué obra va.' }
  const problema = validarProgramacion({ hoy, desde, hasta })
  if (problema) return { ok: false, error: problema }
  const obra_id = destino === DESTINO_SIN_OBRA ? null : destino
  if (desde === hoy && !hasta) return { ok: true, entrada: { persona_id: personaId, obra_id } }
  return { ok: true, entrada: { persona_id: personaId, obra_id, desde, ...(hasta ? { hasta } : {}) } }
}
