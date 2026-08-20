// LA LÓGICA DEL MARCO, SEPARADA DE SU JSX.
//
// Vive aparte por una razón concreta: `node --test` corre los tests de lógica pura con el despojado
// de tipos nativo de Node, que no entiende JSX. Un `contextoActivo()` adentro del `.tsx` sería
// lógica que no se puede probar sin levantar un navegador — y esta decide qué tab se enciende, que
// es lo único que hace la barra.

export interface Contexto { href: string; label: string; testid: string }

export const CONTEXTOS: Contexto[] = [
  { href: '/hoy', label: 'Hoy', testid: 'nav-hoy' },
  { href: '/mi-trabajo', label: 'Mi trabajo', testid: 'nav-mi-trabajo' },
  { href: '/mi-informacion', label: 'Mi información', testid: 'nav-mi-informacion' },
]

/** ¿Qué contexto está activo? `/mi-informacion/horas` activa «Mi información»: el contexto es la
 *  raíz, no la pantalla. La barra tiene que dejar de compararse por igualdad exacta, pero SIN que
 *  `/mi-trabajoso` encienda `/mi-trabajo` — por eso la barra en el prefijo. */
export function contextoActivo(pathname: string): string | null {
  const c = CONTEXTOS.find((x) => pathname === x.href || pathname.startsWith(`${x.href}/`))
  return c?.href ?? null
}

/** Iniciales de un nombre, para el círculo del header. Nunca un avatar genérico: un muñequito gris
 *  parece una persona que no es. */
export function inicialesDe(nombre: string | null | undefined, email: string | null | undefined): string {
  const base = (nombre ?? '').trim() || (email ?? '').trim()
  if (!base) return '—'
  const partes = base.split(/[\s@.]+/).filter(Boolean)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? (partes[1]?.[0] ?? '') : ''
  return (a + b).toUpperCase() || '—'
}
