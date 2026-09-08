// EL DÍA DE LA ASISTENCIA — cómo se escribe y cómo se corre. Sin base y sin React.
//
// Vivía como tres funciones privadas dentro de `src/app/campo/asistencia/page.tsx`. Cuando la
// misma carga apareció en Administración, copiarlas habría dejado dos definiciones de «qué día es
// hoy» que se desincronizan en la primera corrección. Acá se prueban, que es lo que un comentario
// no hace.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

export const esFechaISO = (v: string | undefined | null): v is string =>
  /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')

/** `lunes 7 de septiembre`. Sin el día de la semana, «7 de septiembre» no ubica a nadie en la obra. */
export function rotuloDelDia(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

const sumar = (fecha: string, dias: number): string => {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const esDomingo = (fecha: string): boolean => new Date(`${fecha}T00:00:00Z`).getUTCDay() === 0

/**
 * Correr N días de JORNADA — el domingo no cuenta y no se puede aterrizar en él.
 *
 * En UTC A PROPÓSITO: `new Date('2026-11-01')` + 24 h en una zona con horario de verano devuelve el
 * mismo día o se saltea uno. La fecha de la asistencia es un día calendario, no un instante.
 *
 * ═══ EL DOMINGO SE SALTA ═══
 *
 * Orden del dueño del 08/09/2026: los domingos no se trabajan y salen de la consideración. Esto es
 * lo que mueven «‹ ayer» y «mañana ›» de la carga del teléfono: sin el salto, el jefe que carga el
 * sábado y toca «mañana ›» cae en una pantalla que no se puede cargar y tiene que tocar dos veces.
 * Sábado + 1 = lunes; lunes − 1 = sábado.
 *
 * `dias = 0` devuelve la fecha TAL CUAL, incluso si es domingo: no correr no es corregir. Un
 * domingo que llegue por la URL sigue siendo legible —el dato existe aunque no se dibuje—; lo que
 * no hace esta función es DEJAR a nadie ahí cuando le pidieron moverse.
 */
export function correrDia(fecha: string, dias: number): string {
  if (dias === 0) return fecha
  const paso = dias > 0 ? 1 : -1
  let actual = fecha
  for (let i = 0; i < Math.abs(dias); i++) {
    actual = sumar(actual, paso)
    if (esDomingo(actual)) actual = sumar(actual, paso)
  }
  return actual
}

/** `YYYY-MM-DD` en la zona de quien corre. La fecha del parte es un día calendario, no un UTC. */
export function hoyISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * El día que se va a cargar: el pedido si es una fecha válida, hoy si no.
 *
 * NO CLAVA UN TOPE EN EL FUTURO a propósito. La pantalla ofrece «mañana ›» porque corregir el día
 * siguiente pasa —una obra que trabajó el sábado y se carga el domingo a la mañana— y porque quien
 * decide si esa fila puede existir es la policy de `registros_hh`, no el rótulo de un enlace. Lo
 * que sí se rechaza acá es la basura: `?dia=ayer` no es una fecha y cae a hoy en vez de romper.
 */
export function diaDeCarga(pedido: string | undefined | null, hoy: string): string {
  return esFechaISO(pedido) ? pedido : hoy
}

/** Marcador que `ElegirDia` reemplaza por la fecha elegida en la plantilla de URL. Vive acá (módulo
 *  sin 'use client') porque lo leen un Server Component y un Client Component: un valor exportado
 *  desde un módulo cliente no puede importarse del lado servidor. */
export const TOKEN_DIA = '__DIA__'
