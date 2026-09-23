// LA CUENTA PROPIA TIENE DOS CARAS Y UN SOLO MAPA (dueño, 23/09/2026 · mapa de pantallas, duda 8).
//
// `/mi-cuenta/{legajo,horas,documentos}` es la versión de escritorio (todos los roles, con header) y
// `/mi-informacion/{legajo,horas,documentos}` la del teléfono (M05–M08, barra inferior). El dueño
// decidió conservar las dos, sin redirects, con los mismos nombres y con un enlace de cada una a la
// otra según el dispositivo. Este mapa es la única definición de qué pantalla es «la misma» del
// otro lado: si alguien suma una cara nueva, la suma acá y las dos shells la ofrecen solas.

export type ParteDeCuenta = 'legajo' | 'horas' | 'documentos'

export const VERSIONES_DE_CUENTA: Record<ParteDeCuenta, { titulo: string; escritorio: string; telefono: string }> = {
  legajo: { titulo: 'Mi legajo', escritorio: '/mi-cuenta/legajo', telefono: '/mi-informacion/legajo' },
  horas: { titulo: 'Mis horas', escritorio: '/mi-cuenta/horas', telefono: '/mi-informacion/horas' },
  documentos: { titulo: 'Mis documentos', escritorio: '/mi-cuenta/documentos', telefono: '/mi-informacion/documentos' },
}

/** La otra cara de una ruta, o `null` si esa ruta no tiene par (Perfil, Seguridad, Recibos, Efectivo…). */
export function otraCaraDe(pathname: string): { href: string; dispositivo: 'escritorio' | 'telefono' } | null {
  const ruta = pathname.split('?')[0].replace(/\/+$/, '')
  for (const v of Object.values(VERSIONES_DE_CUENTA)) {
    if (ruta === v.escritorio) return { href: v.telefono, dispositivo: 'telefono' }
    if (ruta === v.telefono) return { href: v.escritorio, dispositivo: 'escritorio' }
  }
  return null
}
