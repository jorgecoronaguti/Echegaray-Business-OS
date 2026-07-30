// FECHA OPERATIVA de la asistencia dentro de Mattermost.
//
// Una sola regla de negocio y es dura: NO SE CARGA ASISTENCIA DE UNA FECHA FUTURA.
// Cargar el jueves lo del viernes es fabricar un dato de HH que después entra al jornal,
// al costo de obra y a la línea de jornales del cash flow. El pasado sí: el jefe carga
// desde la calle y a veces al día siguiente.
//
// "Hoy" se calcula en la zona horaria de San Juan, NO en la del servidor ni en la del
// celular. A las 21:30 de un 30/07 en San Juan el reloj UTC ya dice 31/07: sin zona
// explícita, el bot habría empezado a rechazar el día en curso todas las noches.
//
// Puro: sin red, sin base, sin `new Date()` implícito en las funciones que se testean.

export const ZONA = 'America/Argentina/San_Juan'

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/
/** 30/07/2026 · 30-07-2026 · 30/7/26 — lo que una persona escribe a mano. */
const RE_LOCAL = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Nombres de día en castellano rioplatense. Índice = getUTCDay(). */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const pad = (n) => String(n).padStart(2, '0')

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
 * Valida la fecha que llega de una acción.
 * Vacía ⇒ hoy (el caso normal: el jefe abre y carga el día en curso).
 *
 * @returns {{ok:true, fecha:string}|{ok:false, error:string}}
 */
export function validarFecha(entrada, { hoy = hoyIso() } = {}) {
  const v = entrada == null ? '' : String(entrada).trim()
  if (!v) return { ok: true, fecha: hoy }
  if (!RE_ISO.test(v) || !existe(v)) {
    return { ok: false, error: 'Esa fecha no existe. Escribila como 30/07/2026.' }
  }
  // Comparación de cadenas ISO: es exacta y no arrastra husos horarios.
  if (v > hoy) {
    return { ok: false, error: 'No se puede cargar asistencia de una fecha futura.' }
  }
  return { ok: true, fecha: v }
}

/** El día anterior a una ISO. Sin librerías y sin husos: aritmética en UTC. */
export function diaAnterior(iso) {
  if (!RE_ISO.test(String(iso ?? ''))) return null
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/**
 * Lo que una persona escribió a mano → ISO, o `null` si no se entiende.
 * Acepta 30/07/2026, 30-7-26, 30/07 (año de referencia) y el ISO directo.
 * NO adivina entre día y mes: en Argentina siempre es día primero.
 */
export function interpretarFechaEscrita(texto, { hoy = hoyIso() } = {}) {
  const v = String(texto ?? '').trim()
  if (!v) return null
  if (RE_ISO.test(v)) return existe(v) ? v : null
  const m = RE_LOCAL.exec(v)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const anio = anioDe(m[3], hoy)
  const iso = `${anio}-${pad(mes)}-${pad(dia)}`
  return RE_ISO.test(iso) && existe(iso) ? iso : null
}

/** Año escrito con 2 o 4 dígitos, o el del día de referencia si no vino. */
function anioDe(crudo, hoy) {
  if (!crudo) return Number(String(hoy).slice(0, 4))
  const n = Number(crudo)
  if (crudo.length <= 2) return 2000 + n
  return n
}

/** Fecha para mostrarle a una persona: 30/07/2026. */
export function fechaLegible(iso) {
  if (!RE_ISO.test(String(iso ?? ''))) return String(iso ?? '')
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}

/** Fecha con el día de la semana: "jueves 30/07/2026". El jefe carga por día, no por número. */
export function fechaEnPalabras(iso) {
  if (!RE_ISO.test(String(iso ?? ''))) return String(iso ?? '')
  const [y, m, d] = String(iso).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS[dt.getUTCDay()]} ${pad(d)}/${pad(m)}/${y}`
}
