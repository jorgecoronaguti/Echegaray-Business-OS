// TODO PANEL DEL ENTORNO ES ESTADO DE URL — y por eso el armado de la URL tiene test.
//
// ═══ POR QUÉ NO VIVE EN EL `useState` DE UN COMPONENTE ═══
//
// La mitad del trabajo de una cotización es «mirá esta partida». Un inspector abierto en el estado
// de React no se puede mandar por chat: el que recibe el enlace ve la pantalla cerrada y tiene que
// buscar. Con la URL, el enlace abre exactamente lo que el otro estaba mirando — la vista, la cola y
// el inspector incluidos.
//
// ═══ Y POR QUÉ ES UN MÓDULO PURO ═══
//
// Concatenar querystrings a mano en seis lugares de un `.tsx` es la forma más barata de perder la
// vista al abrir una partida, o de dejar `?atencion=1` pegado para siempre. Acá se arma una sola
// vez, y el test recorre las combinaciones que la pantalla usa.

export type Vista = 'oferta' | 'costos'

export interface EstadoUrl {
  vista: Vista
  /** `partida:<id>` mientras el inspector sólo sabe abrir partidas. `null` = cerrado. */
  insp: string | null
  atencion: boolean
  nueva: boolean
}

/** Lo que llega por `searchParams`, ya sin `undefined` ni arrays. */
export interface Consulta {
  vista?: string | string[]
  insp?: string | string[]
  atencion?: string | string[]
  nueva?: string | string[]
  /** El alias viejo: `?partida=<id>`. Se conserva porque hay enlaces sueltos apuntándole. */
  partida?: string | string[]
}

const uno = (v: string | string[] | undefined): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null

/**
 * LA VISTA POR DEFECTO ES «COSTOS».
 *
 * Quien abre un presupuesto desde adentro de la empresa viene a trabajar el costo, no a mirar el
 * documento del cliente. Abrir en «Oferta» obligaría a un clic en el 90 % de las visitas.
 */
export function leerEstadoUrl(q: Consulta): EstadoUrl {
  return {
    vista: uno(q.vista) === 'oferta' ? 'oferta' : 'costos',
    insp: uno(q.insp),
    atencion: uno(q.atencion) === '1',
    nueva: uno(q.nueva) === '1',
  }
}

/** El id de la partida que el inspector tiene abierta, o `null` si no es un inspector de partida. */
export function partidaDelInspector(insp: string | null): string | null {
  if (!insp || !insp.startsWith('partida:')) return null
  const id = insp.slice('partida:'.length).trim()
  return id === '' ? null : id
}

/**
 * EL ALIAS `?partida=<id>` → `?insp=partida:<id>`.
 *
 * `TablaPartidas` y los enlaces ya repartidos por el sistema apuntan a `?partida=`. Cambiarles la
 * forma sería romper enlaces mandados por chat, que es la clase de rotura que nadie reporta y todos
 * sufren. Devuelve `null` cuando no hay nada que redirigir.
 */
export function aliasPartida(q: Consulta): string | null {
  const vieja = uno(q.partida)
  if (!vieja) return null
  return `partida:${vieja}`
}

/** La URL del entorno con el estado pedido. Lo que no se pasa, se hereda de `base`. */
export function hrefEntorno(id: string, base: EstadoUrl, cambios: Partial<EstadoUrl> = {}): string {
  const e = { ...base, ...cambios }
  const p = new URLSearchParams()
  p.set('vista', e.vista)
  if (e.insp) p.set('insp', e.insp)
  if (e.atencion) p.set('atencion', '1')
  if (e.nueva) p.set('nueva', '1')
  return `/presupuestos/${id}?${p.toString()}`
}
