// EN EL TELÉFONO, HERRAMIENTAS ES LA VERSIÓN DE CAMPO (dueño, 23/09/2026: «así está la versión mobile
// hoy» — la pantalla de escritorio dibujada en el teléfono, con el panel encima de la lista). Cada ruta
// de escritorio tiene su equivalente en `/campo/herramientas`; lo que sólo existe en escritorio
// (Resumen, Planilla, Etiquetas, Mantenimiento como cola) cae al menú del teléfono, que sabe llegar
// a lo mismo por activo.

const ACTIVO = /^\/herramientas\/(?:inventario|rodados|maquinarias)\/([^/]+)$/

/** La ruta de teléfono para una ruta de escritorio de Herramientas. `null` si no es de Herramientas. */
export function rutaTelefonoDeHerramientas(pathname: string, search = ''): string | null {
  if (!/^\/herramientas(\/|$)/.test(pathname)) return null
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const activo = q.get('activo') ?? q.get('a') ?? pathname.match(ACTIVO)?.[1] ?? null
  if (activo) return `/campo/herramientas/a/${encodeURIComponent(activo)}`
  const revision = q.get('revision')
  if (revision) return `/campo/herramientas/a/${encodeURIComponent(revision)}/revision`
  const lugar = q.get('u') ?? q.get('en') ?? q.get('lugar')
  const conLugar = (base: string) => (lugar ? `${base}?en=${encodeURIComponent(lugar)}` : base)
  if (pathname.startsWith('/herramientas/inventario')) return conLugar('/campo/herramientas/buscar')
  if (pathname.startsWith('/herramientas/ubicaciones')) return lugar ? conLugar('/campo/herramientas/lugar') : '/campo/herramientas'
  if (pathname.startsWith('/herramientas/movimientos')) return conLugar('/campo/herramientas/movimientos')
  if (pathname.startsWith('/herramientas/rodados') || pathname.startsWith('/herramientas/maquinarias')) return '/campo/herramientas/buscar?para=verificar'
  return '/campo/herramientas'
}
