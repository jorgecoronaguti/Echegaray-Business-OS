// CÓMO QUIERO VER OBRAS — la preferencia de vista, separada de quien la guarda.
//
// ═══ EL PEDIDO, TEXTUAL (19/08/2026) ═══
//
//   *"necesito q las vistas resumen y gantt guarden cual fue el ultimo «filtrado» q hice segun la
//   columna para q me la muestre de esa manera y no tener q estar poniendo nuevamente como quiero
//   verlo"*
//
// ═══ POR QUÉ NO SE GUARDA EN EL NAVEGADOR ═══
//
// `localStorage` obligaría a que la tabla —hoy un server component que lee de Postgres— se vuelva
// de cliente sólo para reordenarse, y a que la primera pintura salga con el orden equivocado y se
// corrija sola a los cien milisegundos. Un parpadeo así, en la pantalla que se abre veinte veces
// por día, se nota más que el problema que arregla.
//
// La preferencia viaja en una COOKIE, que el servidor ya lee antes de renderizar: la pantalla sale
// derecha la primera vez. Y la URL sigue siendo la verdad —se comparte, se recarga, vuelve con el
// botón de atrás—: la cookie sólo recuerda con qué URL abrir cuando no se pidió ninguna.

/** Las claves de la URL que definen "cómo quiero ver esto". Nada más se recuerda. */
export const CLAVES_VISTA = ['orden', 'dir', 'etapa', 'q', 'archivadas', 'escala'] as const
export type ClaveVista = typeof CLAVES_VISTA[number]

/** Una cookie por vista: el Gantt y el Resumen se miran distinto y no comparten preferencia. */
export function cookieDeVista(pathname: string): string | null {
  if (pathname === '/obras') return 'obras.resumen'
  if (pathname === '/obras/gantt') return 'obras.gantt'
  return null
}

/** Lo que hay que recordar de esta URL, o `null` si el que mira no eligió nada. */
export function preferenciaDe(params: URLSearchParams): string | null {
  const guardar = new URLSearchParams()
  for (const k of CLAVES_VISTA) {
    const v = params.get(k)
    // Una clave presente pero VACÍA es una elección: «sin filtro de etapa». Se conserva, porque
    // borrarla haría que la preferencia guardada volviera a filtrar sola.
    if (v !== null) guardar.set(k, v)
  }
  const texto = guardar.toString()
  return texto === '' ? null : texto
}

/**
 * ¿Con qué query hay que abrir esta pantalla?
 *
 * `null` = con la que vino. Se restaura SÓLO cuando no se pidió ninguna de las claves de vista: si
 * el que mira tocó una columna, esa elección manda sobre lo que había guardado, siempre.
 */
export function queryARestaurar(params: URLSearchParams, guardada: string | null): string | null {
  if (!guardada) return null
  if (CLAVES_VISTA.some((k) => params.has(k))) return null
  const destino = new URLSearchParams(guardada)
  // Lo que ya venía en la URL y no es preferencia de vista se conserva: un `?nueva=1` o cualquier
  // parámetro futuro no puede desaparecer porque había una vista guardada.
  for (const [k, v] of params) if (!destino.has(k)) destino.set(k, v)
  const texto = destino.toString()
  return texto === '' ? null : texto
}

/** El pedido explícito de volver al estado de fábrica. Borra la cookie y abre la pantalla limpia. */
export const CLAVE_LIMPIAR = 'limpiar'
