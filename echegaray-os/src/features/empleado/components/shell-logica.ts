// LA LÓGICA DEL MARCO, SEPARADA DE SU JSX.
//
// Vive aparte por una razón concreta: `node --test` corre los tests de lógica pura con el despojado
// de tipos nativo de Node, que no entiende JSX. Un `contextoActivo()` adentro del `.tsx` sería
// lógica que no se puede probar sin levantar un navegador — y esta decide qué tab se enciende, que
// es lo único que hace la barra.

export interface Contexto { href: string; label: string; testid: string }

// CUATRO CONTEXTOS Y NO TRES, PORQUE ASÍ LOS DIBUJAN LOS MOCKUPS (M02 y M09, 24/08/2026).
//
// El handoff escrito decía «tres contextos»; los mockups del dueño dibujan CUATRO tabs —Hoy ·
// Trabajo · Horas · Yo— y ante la diferencia manda el mockup. La razón de negocio es visible en
// M06: las horas son lo que el empleado mira más seguido después de fichar, y esconderlas un nivel
// adentro de «Mi información» las ponía a dos toques de distancia.
//
// EL ORDEN DE LA LISTA ES PARTE DE LA LÓGICA: `/mi-informacion/horas` va ANTES que
// `/mi-informacion` para que `contextoActivo` —que resuelve por prefijo— encienda «Horas» y no
// «Yo». Invertirlos apaga la pestaña propia de la pantalla que se está mirando.
export const CONTEXTOS: Contexto[] = [
  { href: '/hoy', label: 'Hoy', testid: 'nav-hoy' },
  { href: '/mi-trabajo', label: 'Trabajo', testid: 'nav-mi-trabajo' },
  { href: '/mi-informacion/horas', label: 'Horas', testid: 'nav-mis-horas' },
  { href: '/mi-informacion', label: 'Yo', testid: 'nav-mi-informacion' },
]

/** ¿Qué contexto está activo? `/mi-informacion/documentos` activa «Yo»: el contexto es la raíz, no
 *  la pantalla. La barra tiene que dejar de compararse por igualdad exacta, pero SIN que
 *  `/mi-trabajoso` encienda `/mi-trabajo` — por eso la barra en el prefijo. */
export function contextoActivo(pathname: string): string | null {
  const c = CONTEXTOS.find((x) => pathname === x.href || pathname.startsWith(`${x.href}/`))
  return c?.href ?? null
}

/** ¿Es una de las CUATRO pantallas raíz? Lo decide la igualdad exacta, no el prefijo:
 *  `/mi-informacion` es raíz y `/mi-informacion/documentos` no.
 *
 *  De esto depende QUÉ CHROME se dibuja (Design System · Employee shell, 23/08/2026): la barra de
 *  contextos «se usa sólo en las pantallas raíz; las de detalle llevan back en el topbar». Una barra
 *  de cuatro destinos abajo Y una flecha de volver arriba son dos formas de salir compitiendo en 390px
 *  —y la de abajo tapa la última fila de la lista, que es donde vive lo que se vino a buscar. */
export function esRaiz(pathname: string): boolean {
  return CONTEXTOS.some((c) => c.href === pathname)
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
