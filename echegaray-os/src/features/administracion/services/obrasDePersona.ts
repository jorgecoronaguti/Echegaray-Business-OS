// DÓNDE TRABAJÓ ESTA PERSONA — todas las obras, incluidas las que ya cerraron.
//
// El dueño: *«si hay obras que ya no están activas como La Estrella Galpón 9, o San Francisco con
// Mampostería, etc., dejarlo reflejado en la ficha de cada persona; son obras que estuvieron
// activas dentro de la misma plataforma»*.
//
// ═══ UNA OBRA CERRADA NO SE ESCONDE ═══
//
// El historial de una persona son sus obras, y la mitad de las obras de esta empresa ya cerraron.
// Filtrar por `estado = 'activa'` —que es lo que hacen las pantallas de carga, y con razón, porque
// ahí se ELIGE una obra— dejaría una ficha que dice que Aguero trabajó en una sola obra cuando
// trabajó en cinco. Acá no se elige nada: se lee lo que pasó. Se ven todas, y el estado de hoy es
// una marca discreta al lado del nombre, no un filtro.
//
// ═══ LA FUENTE SON LAS HORAS, NO LAS ASIGNACIONES ═══
//
// Una asignación dice dónde se lo puso; `registros_hh` dice dónde trabajó de verdad. En la base al
// 08/09/2026 hay gente asignada a una obra que imputa a otra: listar por asignación escondería
// obras con horas reales de esa persona. La asignación vigente sólo decide el ORDEN.
//
// ═══ Y NUNCA UN SLUG ═══
//
// *«jamás el slug tipo sf-mamposteria / la-estrella»*. Cuando `obra_canonica.nombre` es una clave
// técnica se cae al CLIENTE (`cliente_texto`), que es como el dueño nombra esas obras. Si tampoco
// hay cliente se muestra el nombre igual: inventar un rótulo sería peor que mostrar el que existe.

import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { tramosProgramados } from './planDeObraActual.ts'
import type { ImputacionHH } from '../types/index.ts'

export interface ObraTrabajada {
  /** `obra_canonica_id`. Es la clave y el destino del enlace. */
  id: string
  /** El rótulo real: nombre de obra, o el cliente cuando el nombre es una clave técnica. */
  nombre: string
  /** El estado HOY. `null` cuando no se pudo leer: no se afirma que esté cerrada. */
  activa: boolean | null
  /** Primer y último día con horas de ESTA persona en ESA obra. */
  primer: string
  ultimo: string
  /** Días distintos con trabajo declarado. No es la cantidad de filas. */
  dias: number
  horas: number
  /** Es la obra de su asignación vigente. */
  vigente: boolean
}

/** Lo que la base sabe de cada obra. La pantalla lo trae junto; acá no se lee nada. */
export interface DatosDeObra {
  nombre: string | null
  cliente: string | null
  estado: string | null
}

const redondear = (n: number): number => Math.round(n * 100) / 100

/**
 * ¿Ese texto es una clave técnica y no un nombre?
 *
 * `sf-mamposteria`, `la-estrella-galpon-9`: minúsculas, guiones y ningún espacio. Un nombre real
 * lleva espacios («La Estrella Galpón 9») o mayúsculas («MAMPOSTERÍA»). La regla es deliberadamente
 * estrecha: ante la duda gana el nombre cargado, porque esconderlo por sospecha dejaría a la obra
 * sin rótulo.
 */
export const pareceSlug = (v: string): boolean =>
  /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(v.trim())

/** El rótulo de una obra. Nunca un slug, nunca un uuid. */
export function rotuloDeObra(id: string, datos: DatosDeObra | undefined, deLasHoras: string | null): string {
  const nombre = (datos?.nombre ?? deLasHoras ?? '').trim()
  const cliente = (datos?.cliente ?? '').trim()
  if (nombre && !pareceSlug(nombre)) return nombre
  if (cliente) return cliente
  // Sin nombre usable y sin cliente queda el nombre tal cual está cargado; y si no hay ni eso, se
  // dice que falta. El id NO se escribe: es plomería, no un rótulo.
  return nombre || 'obra sin nombre cargado'
}

const dia = (r: ImputacionHH): string | null => r.fecha?.slice(0, 10) ?? null

/**
 * Las obras donde esta persona tiene horas, de la más reciente a la más vieja.
 *
 * La obra de su asignación vigente va primera cuando tiene horas: es dónde está hoy, y es la
 * primera pregunta que se le hace a un legajo. Sin horas no entra a la lista —esta lista es «dónde
 * trabajó», no «dónde está asignado»— y ese hecho ya lo publica el panel de asignación.
 */
export function obrasTrabajadas(
  filas: ImputacionHH[],
  opciones: { obras?: Record<string, DatosDeObra>; obraVigente?: string | null } = {},
): ObraTrabajada[] {
  const porObra = new Map<string, ImputacionHH[]>()
  for (const f of filas) {
    if (!f.obra_canonica_id || !f.fecha) continue
    const previas = porObra.get(f.obra_canonica_id)
    if (previas) previas.push(f)
    else porObra.set(f.obra_canonica_id, [f])
  }
  const lista: ObraTrabajada[] = []
  for (const [id, suyas] of porObra) {
    const trabajadas = suyas.filter((f) => esTrabajada(f.tipo_hora))
    // UNA OBRA DONDE SÓLO HAY AUSENCIAS NO ES UNA OBRA DONDE TRABAJÓ. Se cae de la lista: decir
    // «trabajó en X, 0 HH» afirma un trabajo que no ocurrió.
    if (trabajadas.length === 0) continue
    const dias = (trabajadas.map(dia).filter(Boolean) as string[]).sort()
    const datos = opciones.obras?.[id]
    lista.push({
      id,
      nombre: rotuloDeObra(id, datos, trabajadas[0].obra_nombre),
      // ESTADO DESCONOCIDO NO ES «CERRADA». Si la obra no vino en el catálogo —RLS, o se borró— no
      // se afirma nada: pintar «cerrada» sobre lo que no se pudo leer es inventar un hecho.
      activa: datos?.estado == null ? null : datos.estado === 'activa',
      primer: dias[0],
      ultimo: dias[dias.length - 1],
      dias: new Set(dias).size,
      horas: redondear(trabajadas.reduce((s, f) => s + f.horas, 0)),
      vigente: id === opciones.obraVigente,
    })
  }
  return lista.sort((a, b) => {
    if (a.vigente !== b.vigente) return a.vigente ? -1 : 1
    return b.ultimo.localeCompare(a.ultimo)
  })
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE TODAVÍA NO PASÓ
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `obrasTrabajadas` no puede contestar esto y no debe intentarlo: su fuente son las horas, y un
// tramo programado para el 01/10 no tiene ninguna. Meterlo en esa lista obligaría a inventarle un
// «0 HH», que es exactamente la afirmación que el bloque evita cuando descarta las obras donde
// sólo hubo ausencias: decir «trabajó en X, 0 HH» afirma un trabajo que no ocurrió.
//
// Por eso es una lista aparte, con su propio rótulo y sin columna de horas. Son dos preguntas
// distintas —dónde trabajó y a dónde va— y cada una se contesta con su fuente.

/** Un pase programado de esta persona, listo para dibujar. Sin horas: todavía no hay ninguna. */
export interface TramoProgramado {
  /** `obra_asignacion.id`. Es la clave de la lista. */
  id: string
  obra_id: string
  /** El rótulo real, nunca un slug — misma regla que la lista de arriba. */
  nombre: string
  desde: string
  /** `null` = hasta nuevo aviso. No es «sin fecha»: es que no tiene fin decidido. */
  hasta: string | null
}

/**
 * Sus pases PROGRAMADOS, del más próximo al más lejano.
 *
 * QUÉ ES «PROGRAMADO» LO DECIDE `tramosProgramados` Y NADIE MÁS. La misma función que usan el panel
 * y la acción de cancelar: si la ficha tuviera su propio `desde > hoy`, el día que la regla cambie
 * —el pase que arranca hoy, por ejemplo— habría dos definiciones y sólo se corregiría una.
 *
 * Las asignaciones ya están en memoria en la ficha: esto no lee nada.
 */
export function tramosProgramadosDe(
  asignaciones: {
    id: string; obra_id: string; obra_nombre: string | null
    desde: string | null; hasta: string | null
  }[],
  hoy: string,
  obras: Record<string, DatosDeObra> = {},
): TramoProgramado[] {
  const conNombre = asignaciones.map((a) => ({
    id: a.id,
    obra_id: a.obra_id,
    nombre: rotuloDeObra(a.obra_id, obras[a.obra_id], a.obra_nombre),
    desde: a.desde,
    hasta: a.hasta,
  }))
  return tramosProgramados(conNombre, hoy)
    // `tramosProgramados` YA descartó los que no tienen `desde`; el guard es lo que deja que el tipo
    // de salida lo diga sin un `as`, que sería afirmarlo sin que nada lo sostenga.
    .filter((t): t is typeof t & { desde: string } => t.desde != null)
    .map((t) => ({ id: t.id, obra_id: t.obra_id, nombre: t.nombre, desde: t.desde, hasta: t.hasta }))
}
