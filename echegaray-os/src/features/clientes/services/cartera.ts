// LA CARTERA: QUÉ CLIENTES SE VEN Y CUÁLES QUEDARON GUARDADOS.
//
// ═══ EL DEFECTO QUE ESTA FUNCIÓN VINO A CERRAR ═══
//
// `archivarCliente` escribía `activo = false` desde el primer día y `/clientes` NO FILTRABA: el
// cliente archivado seguía en la lista, en la misma posición, con los mismos números. El verbo
// existía y la consecuencia no — el mismo patrón que tenía «cerrar una obra» antes del 18/08.
//
// ═══ POR QUÉ EL FILTRO Y EL CONTEO SALEN DE UNA SOLA LECTURA ═══
//
// «Se ven N clientes y hay M guardados» es UNA decisión. Partirla en dos consultas —una filtrada
// para la tabla y un `count` para el pie— deja dos verdades que se desincronizan en cuanto una de
// las dos se ordena o se acota distinto, y el pie termina ofreciendo ver clientes que no aparecen.
//
// Vive suelta, sin tocar Supabase, para que se pueda probar sin base: es la pieza que hace que
// archivar tenga efecto, y una pieza así no puede depender de que alguien mire la pantalla.

export function separarArchivados<T extends { activo: boolean }>(
  clientes: T[],
): { activos: T[]; archivados: T[] } {
  return {
    activos: clientes.filter((c) => c.activo),
    archivados: clientes.filter((c) => !c.activo),
  }
}

// ═══ LOS DOS RECORTES DE LA CARTERA ═══════════════════════════════════════════════════════════
//
// «Todos · Con obra activa». Eran tres: el 10/09/2026 se retiró «Datos faltantes», y con él las
// aclaraciones «sin teléfono · sin contrato» que el dueño mandó sacar dos veces («quiero info
// precisa»). El recorte las reintroducía por la puerta de atrás: el chip contaba a los clientes por
// lo que les falta y no había en pantalla nada que dijera qué era eso.
//
// LO QUE SE PERDIÓ, DICHO: hoy el OS no ofrece ninguna vista de «a quién le falta el CUIT». Cuando
// vuelva a hacer falta, es una pantalla de trabajo pendiente —con su verbo y su destino—, no un
// filtro mudo sobre el maestro.

export const VISTAS_CARTERA = ['todo', 'activos'] as const
export type VistaCartera = (typeof VISTAS_CARTERA)[number]
export const esVistaCartera = (v: string | undefined): v is VistaCartera =>
  !!v && (VISTAS_CARTERA as readonly string[]).includes(v)

/** Lo que hace falta para decidir el recorte. Deliberadamente mínimo: así se prueba sin base. */
export interface FilaCartera {
  cuit: string | null
  telefono: string | null
  n_obras_activas: number
  /**
   * Lo contratado del cliente. Desde el 10/09/2026 sale de `cliente_economia` y NO de
   * `cliente_panel.contratado`, que era la suma del campo del formulario de la obra y se retiró de
   * la vista (PRP-REALIDAD-UNICA H1).
   */
  contratado: number | null
}

/**
 * El pie de la tabla. `contratado` es `null` cuando NINGUNO tiene monto cargado —no `0`—: cero
 * contratado y «nadie cargó el contrato» son dos hechos opuestos, y el segundo se escribe con
 * palabras. Medido el 24/08: ARCOR es exactamente ese caso.
 */
export function totalesCartera(clientes: FilaCartera[]): {
  clientes: number; conObraActiva: number; contratado: number | null
} {
  const conMonto = clientes.filter((c) => c.contratado !== null)
  return {
    clientes: clientes.length,
    conObraActiva: clientes.filter((c) => c.n_obras_activas > 0).length,
    contratado: conMonto.length === 0 ? null : conMonto.reduce((s, c) => s + (c.contratado ?? 0), 0),
  }
}

// ═══ CUÁNTAS OBRAS TIENE UN CLIENTE, DICHO UNA SOLA VEZ ═══════════════════════════════════════

/**
 * «5 en curso · 6 cerradas», UNA LÍNEA, y NUNCA un total que no cuadre con las filas de abajo.
 *
 * Devuelve UN texto y no dos: dibujarlo en dos renglones de 12 y 10,5px metía dos escalas en una
 * celda —«hay mezcla de diseño», dueño 10/09/2026— y sugería que el segundo número era menos
 * cierto que el primero. Son los dos igual de ciertos y dicen la misma cosa partida en dos.
 *
 * Messina decía «11 obras» con cinco filas colgando: el 11 es cierto y el 5 también, y ninguno de
 * los dos explicaba al otro. Cuando la vista no se pudo leer —`null`— se cae al total, que es lo
 * único que se sabe, y se dice «11 en total» para que nadie lo lea como «11 en curso».
 */
export function frasesDeObras(
  { obras, nEnCurso, nCerradas }: { obras: number; nEnCurso: number | null; nCerradas: number | null },
): string {
  if (nEnCurso === null || nCerradas === null) {
    return obras ? `${obras} en total` : 'sin obras'
  }
  const partes: string[] = []
  if (nEnCurso > 0) partes.push(`${nEnCurso} en curso`)
  if (nCerradas > 0) partes.push(`${nCerradas} ${nCerradas === 1 ? 'cerrada' : 'cerradas'}`)
  return partes.length ? partes.join(' · ') : 'sin obras'
}
