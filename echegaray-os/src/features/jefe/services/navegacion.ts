// LA BARRA DEL JEFE DE OBRA — la lógica, separada de su JSX (`node --test` no entiende JSX).
//
// ═══ LA OBRA VIAJA EN LA URL ═══
//
// Este perfil no tiene UNA obra: tiene las suyas, y cambia de una a otra durante el día. Guardar
// cuál está mirando en el servidor obligaría a que toda pantalla fuera dinámica por una preferencia,
// y guardarlo en el navegador haría que un enlace compartido abriera OTRA obra que la del que lo
// mandó. En la URL, un enlace es un enlace: `/obra/tareas?obra=san-francisco` es siempre esa obra.
//
// ═══ SON CUATRO CONTEXTOS — CAMBIO DE REGLA DECLARADO (Design 23/08) ═══
//
// Hasta el 22/08 eran tres. El contrato viejo dibujaba «Hoy · Tareas · Gente · Más» y «Más» no tenía
// pantalla, así que el cuarto botón no se dibujaba y el hueco quedaba declarado. El canónico J01 del
// 23/08 dibuja «Hoy · Tareas · Avance · Gente», y Avance SÍ tiene pantalla: J03, «Cómo viene la
// obra». El motivo por el que faltaba desapareció, así que el botón entra.
//
// Las tres pantallas que se abren DESDE éstas —registrar el avance de una tarea, el avance masivo y
// el frente— siguen sin barra y vuelven con la flecha.

export interface Contexto { href: string; label: string; testid: string }

export const CONTEXTOS: Contexto[] = [
  { href: '/obra/hoy', label: 'Hoy', testid: 'nav-jefe-hoy' },
  { href: '/obra/tareas', label: 'Tareas', testid: 'nav-jefe-tareas' },
  { href: '/obra/avance', label: 'Avance', testid: 'nav-jefe-avance' },
  { href: '/obra/personas', label: 'Gente', testid: 'nav-jefe-personas' },
]

/** La raíz del perfil, y la única ruta a la que se llega sin saber todavía qué obra se mira. */
export const INICIO = '/obra/hoy'

/**
 * ¿Qué contexto está encendido? Por prefijo con barra, para que `/obra/tareas-x` no encienda
 * `/obra/tareas` — y `/obra/avance-masivo` tampoco encienda `/obra/avance`.
 *
 * `conActividad` es la MISMA ruta con dos pantallas: `/obra/avance` es J03 (cómo viene la obra, un
 * contexto de la barra) y `/obra/avance?actividad=…` es el formulario que carga el avance de UNA
 * tarea, al que se entra desde Tareas y del que se vuelve con la flecha. Separarlas en dos rutas
 * habría sido más limpio y rompía los enlaces que ya circulan y las pruebas que los usan.
 */
export function contextoActivo(pathname: string, conActividad = false): string | null {
  if (conActividad && pathname.startsWith('/obra/avance')) return null
  const c = CONTEXTOS.find((x) => pathname === x.href || pathname.startsWith(`${x.href}/`))
  return c?.href ?? null
}

/**
 * Un enlace del perfil, con la obra pegada. Sin obra devuelve la ruta pelada: la pantalla la va a
 * resolver sola con la primera que el jefe tenga, y forzar `?obra=` vacío en la URL dejaría un
 * parámetro que no significa nada y que después alguien lee como «ninguna obra».
 */
export function conObra(href: string, obraId: string | null | undefined, extra?: Record<string, string>): string {
  const p = new URLSearchParams()
  if (obraId) p.set('obra', obraId)
  for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v)
  const q = p.toString()
  return q ? `${href}?${q}` : href
}

/**
 * La obra que hay que mostrar: la pedida si el jefe la tiene, y si no la primera de las suyas.
 *
 * ═══ UNA OBRA QUE NO ESTÁ EN LA LISTA NO SE ABRE «VACÍA» ═══
 *
 * Devolver la pedida a ciegas dibujaría una pantalla sin una sola fila —la base no le va a dar
 * nada— y eso se lee como «esta obra no tiene tareas», que es exactamente lo contrario de lo que
 * pasó. Se cae a la primera suya, que es una obra real, y la pantalla dice cuál está mirando.
 */
export function obraElegida(disponibles: { id: string }[], pedida: string | null | undefined): string | null {
  if (disponibles.length === 0) return null
  if (pedida && disponibles.some((o) => o.id === pedida)) return pedida
  return disponibles[0].id
}

/**
 * A dónde vuelve la flecha de las tres pantallas que se abren desde otra.
 *
 * ═══ NO SE USA «ATRÁS» DEL NAVEGADOR ═══
 *
 * `history.back()` depende de por dónde vino: después de guardar un avance y volver, la pila tiene
 * la misma pantalla dos veces y la flecha deja al jefe girando en el lugar. Un destino declarado
 * siempre lleva a algún lado, y la obra viaja con él para no perder cuál estaba mirando.
 */
export function volverDe(pathname: string, obraId: string | null, conActividad = false): string | null {
  if (pathname.startsWith('/obra/avance-masivo')) return conObra('/obra/hoy', obraId)
  // Sólo el formulario de UNA tarea vuelve a Tareas. `/obra/avance` pelado es J03, que es un
  // contexto de la barra: darle flecha lo sacaría de la barra que lo acaba de abrir.
  if (pathname.startsWith('/obra/avance')) return conActividad ? conObra('/obra/tareas', obraId) : null
  if (pathname.startsWith('/obra/frente')) return conObra('/obra/hoy', obraId)
  return null
}
