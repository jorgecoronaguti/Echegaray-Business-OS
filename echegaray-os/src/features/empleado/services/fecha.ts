// LAS FECHAS DEL PERFIL, EN CASTELLANO Y SIN DEPENDER DEL ICU DEL SERVIDOR.
//
// `toLocaleDateString('es-AR', { weekday: 'long' })` devuelve «Wednesday» si el Node que corre en
// Vercel se construyó con ICU reducido. Es un modo de fallar silencioso —la pantalla no se rompe,
// sólo queda en inglés— y en un teléfono de obra eso es peor que un error: nadie lo reporta.
//
// El día de la semana se calcula desde la fecha ISO, en UTC, para que no se corra un día por el
// huso: `new Date('2026-08-20')` es medianoche UTC, y en Argentina eso todavía es el 19.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** `2026-08-20` → `miércoles 20/08`. Es el encabezado de «Hoy». */
export function diaYFecha(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  const [, m, dd] = iso.slice(0, 10).split('-')
  return `${DIAS[d.getUTCDay()]} ${dd}/${m}`
}

/** `2026-08-20` → `miércoles 20/08/2026`. La versión de escritorio, que tiene lugar para el año. */
export function diaFechaYAnio(iso: string): string {
  const [a] = iso.slice(0, 10).split('-')
  return `${diaYFecha(iso)}/${a}`
}

/** El primer y el último día del mes de una fecha. La ventana por defecto de Mis horas y Asistencia. */
export function mesDe(iso: string): { desde: string; hasta: string } {
  const [a, m] = iso.slice(0, 10).split('-')
  const ultimo = new Date(Date.UTC(Number(a), Number(m), 0)).getUTCDate()
  return { desde: `${a}-${m}-01`, hasta: `${a}-${m}-${String(ultimo).padStart(2, '0')}` }
}

/** El mes anterior al de una fecha. Diciembre → enero del año anterior, que es donde se rompen las
 *  implementaciones que restan uno al número del mes. */
export function mesAnterior(iso: string): { desde: string; hasta: string } {
  const [a, m] = iso.slice(0, 10).split('-').map(Number)
  const anio = m === 1 ? a - 1 : a
  const mes = m === 1 ? 12 : m - 1
  return mesDe(`${anio}-${String(mes).padStart(2, '0')}-01`)
}

/** `2026-08` → `Agosto 2026`. */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function mesLargo(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-')
  return `${MESES[Number(m) - 1] ?? m} ${a}`
}

/** `2026-08-20` → `20/08`. */
export function dm(iso: string | null): string | null {
  if (!iso) return null
  const [, m, d] = iso.slice(0, 10).split('-')
  return d ? `${d}/${m}` : iso
}

/** `oficial_especializado` → `Oficial especializado`. El vocabulario de la base se escribe con
 *  guiones bajos porque es una clave; a la persona se le muestra su categoría, no la clave. No hay
 *  diccionario: una clave nueva se lee igual de bien y no queda sin traducir hasta que alguien se
 *  acuerde de agregarla. */
export function legible(v: string | null | undefined): string | null {
  if (!v) return null
  const t = v.replace(/_/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : null
}
