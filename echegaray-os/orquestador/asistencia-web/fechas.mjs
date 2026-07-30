// FECHA OPERATIVA de la pantalla de asistencia.
//
// Una sola regla de negocio acá y es dura: NO SE CARGA ASISTENCIA DE UNA FECHA FUTURA.
// Cargar el jueves lo del viernes es fabricar un dato de HH que después entra al jornal,
// al costo de obra y a la línea de jornales del cash flow. El pasado sí: el jefe carga
// desde la calle y a veces al día siguiente.
//
// "Hoy" se calcula en la zona horaria de San Juan, NO en la del servidor ni en la del
// celular. A las 21:30 de un 30/07 en San Juan el reloj UTC ya dice 31/07: sin zona
// explícita, la pantalla habría empezado a rechazar el día en curso todas las noches.
//
// Puro: sin red, sin base, sin `new Date()` implícito en las funciones que se testean.

export const ZONA = 'America/Argentina/San_Juan'

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Fecha de hoy en San Juan, en ISO 'YYYY-MM-DD'. */
export function hoyIso(ahora = new Date()) {
  return FORMATO.format(ahora)
}

/** ¿'2026-02-30' es una fecha real? El round-trip lo dice sin librerías. */
function existe(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Valida la fecha que llega de la pantalla.
 * Vacía ⇒ hoy (el caso normal: el jefe abre y carga el día en curso).
 *
 * @returns {{ok:true, fecha:string}|{ok:false, error:string}}
 */
export function validarFecha(entrada, { hoy = hoyIso() } = {}) {
  const v = entrada == null ? '' : String(entrada).trim()
  if (!v) return { ok: true, fecha: hoy }
  if (!RE_ISO.test(v) || !existe(v)) {
    return { ok: false, error: 'La fecha no es válida. Elegí una del calendario.' }
  }
  // Comparación de cadenas ISO: es exacta y no arrastra husos horarios.
  if (v > hoy) {
    return { ok: false, error: 'No se puede cargar asistencia de una fecha futura.' }
  }
  return { ok: true, fecha: v }
}

/** Fecha para mostrarle a una persona: 30/07/2026. */
export function fechaLegible(iso) {
  if (!RE_ISO.test(String(iso ?? ''))) return String(iso ?? '')
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}
