// LA LIBRETA, ESCRITA EN EL CHAT — «P. Tello 18/9 2.640.000».
//
// ═══ DE DÓNDE SALE ESTO (22/09/2026) ═══
//
// El dueño mandó la foto de su libreta: una línea por pago, con tres datos —concepto, fecha y monto— y nada
// más. Y dijo qué quiere: *«quiero q la experiencia del chat sea de carga natural y q se interprete quedando
// registrado todo en app.ecsas.com.ar y sheet flujo de fondos (compras, caja) segun corresponda»*.
//
// Sus cuatro decisiones, que son las que gobiernan este archivo:
//   · la caja NO se toca aparte: *«no tiene q simplemente identificar como ahora q se pago en efectivo y en
//     pestaña compras y hacer la deduccion en pestaña caja»* — la línea es una fila de Compras pagada en
//     efectivo, y CAJA la resta como lo hace hoy;
//   · un gasto SIN comprobante entra igual, marcado como tal;
//   · los jornales NO van por acá: van por Liquidación de horas;
//   · cargan los mismos que hoy pueden entregar efectivo.
//
// ═══ QUÉ DECIDE ESTE ARCHIVO, Y QUÉ NO ═══
//
// Decide si una línea ES una línea de libreta y qué dice: concepto, fecha y monto. NO decide el proveedor, la
// obra ni el rubro — eso lo resuelve el circuito de Compras con su historial, que es donde vive esa verdad.
// Y no adivina el monto: la libreta se escribe a las apuradas y un número mal leído es plata mal registrada.

const MESES = 'ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic'
// «18/9», «18-9», «18/09/26», «18 de septiembre». El año es opcional: en la libreta casi nunca está.
const RE_FECHA = new RegExp(`\\b(\\d{1,2})\\s*(?:/|-|\\s+de\\s+)\\s*(\\d{1,2}|${MESES})[a-z]*(?:\\s*(?:/|-|\\s+de\\s+)\\s*(\\d{2,4}))?\\b`, 'i')
const ORDEN_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Minúsculas, sin acentos. */
const plano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * La fecha de la línea. Devuelve ISO o null. Sin año, el año es el de `hoy` — salvo que eso deje la fecha en
 * el futuro, que en una libreta es siempre diciembre del año pasado anotado en enero.
 */
export function leerFecha(texto, hoy = new Date()) {
  const m = String(texto ?? '').match(RE_FECHA)
  if (!m) return null
  const dia = Number(m[1])
  const crudoMes = plano(m[2])
  const mes = /^\d+$/.test(crudoMes) ? Number(crudoMes) : ORDEN_MES.indexOf(crudoMes === 'set' ? 'sep' : crudoMes.slice(0, 3)) + 1
  if (!(dia >= 1 && dia <= 31) || !(mes >= 1 && mes <= 12)) return null
  let anio = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : hoy.getFullYear()
  const iso = (a) => `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  if (!m[3] && new Date(`${iso(anio)}T12:00:00`) > new Date(hoy.getTime() + 86400000)) anio -= 1
  const d = new Date(`${iso(anio)}T12:00:00`)
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== dia ? null : iso(anio)
}

/**
 * El monto. Lo mismo que en las entregas, con una diferencia: acá el número SIEMPRE está al final de la
 * línea, que es como se escribe una libreta. Un número pegado a la fecha no es el monto.
 */
export function leerMonto(texto, o = {}) {
  return montoEn(texto, o)?.valor ?? null
}

/**
 * El monto Y DÓNDE ESTÁ. El concepto se arma sacando EXACTAMENTE este texto: borrar «cualquier número»
 * dejaba «Camb EEA885» en «Camb EEA», y la patente es parte del concepto.
 */
export function montoEn(texto, { sinFecha = null } = {}) {
  const t = plano(sinFecha ?? texto).replace(/\s+/g, ' ').trim()
  const ms = [...t.matchAll(/(?<![\w./-])\$?\s*(\d[\d.,]*)\s*(mill?on(?:es)?|mil|k)?(?![\w./-])/g)]
  if (!ms.length) return null
  // El ÚLTIMO número de la línea es el monto: «Rep t.los/stereo 19/9 325.000». Con dos candidatos de plata
  // sin fecha de por medio no se adivina — se pregunta.
  const plata = ms.filter((m) => m[2] || (Number(String(m[1]).replace(/\./g, '').replace(',', '.')) || 0) >= 1000)
  if (plata.length !== 1) return null
  const [, crudo, escala] = plata[0]
  const n = Number(String(crudo).replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  const factor = !escala ? 1 : /mill/.test(escala) ? 1_000_000 : 1_000
  return { valor: Math.round(n * factor * 100) / 100, texto: plata[0][0].trim() }
}

/** Lo que queda cuando se sacan la fecha y el monto: eso es el concepto, tal como lo escribió la persona. */
export function leerConcepto(texto, hoy = new Date()) {
  let t = String(texto ?? '')
  const fecha = leerFecha(t, hoy)
  const sinFecha = fecha ? t.replace(RE_FECHA, ' ') : t
  const m = montoEn(t, { sinFecha })
  t = sinFecha
  if (m) {
    const i = plano(t).indexOf(m.texto)
    if (i >= 0) t = t.slice(0, i) + ' ' + t.slice(i + m.texto.length)
  }
  // Los paréntesis de «P. TELLO (18/9)» quedan vacíos al sacar la fecha: se limpian, no se muestran.
  const limpio = t.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/[\s.,;:-]+/g, ' ').trim()
  return limpio.length >= 2 ? limpio : null
}

/** Lo que NO es una línea de libreta: los jornales van por Liquidación (decisión del dueño, 22/09/2026). */
export const RE_JORNALES = /\bjornal(es)?\b|\bquincena\b|\bsueldos?\b/i

/**
 * NÚCLEO PURO: ¿qué dice esta línea?
 *
 * @returns {{estado:'listo', concepto:string, fecha:string, monto:number}
 *          |{estado:'pregunta', falta:'monto'|'concepto'}
 *          |{estado:'jornales'}
 *          |{estado:'nada'}}
 */
export function interpretarLinea(texto, hoy = new Date()) {
  const t = String(texto ?? '').trim()
  if (!t || t.length > 200) return { estado: 'nada' }
  if (!/\d/.test(t)) return { estado: 'nada' }
  if (RE_JORNALES.test(t)) return { estado: 'jornales' }
  const fecha = leerFecha(t, hoy)
  const sinFecha = fecha ? t.replace(RE_FECHA, ' ') : t
  const monto = leerMonto(t, { sinFecha })
  if (monto == null) return { estado: 'pregunta', falta: 'monto' }
  const concepto = leerConcepto(t, hoy)
  if (!concepto) return { estado: 'pregunta', falta: 'concepto' }
  return { estado: 'listo', concepto, fecha: fecha ?? iso(hoy), monto }
}

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

/** Varias líneas de una vez: una libreta se pasa en bloque, no de a una. */
export function interpretarLibreta(texto, hoy = new Date()) {
  return String(texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((linea) => ({ linea, ...interpretarLinea(linea, hoy) }))
}

export const TEXTO_JORNALES =
  'Los jornales se cargan en Liquidación de horas, no acá: si los escribo como gasto, la quincena los cuenta dos veces.'

/**
 * LA IDENTIDAD DE UNA LÍNEA. Sin factura no hay CUIT ni número, así que la clave la da lo que la línea DICE:
 * fecha, concepto y monto. Dos líneas idénticas el mismo día son, casi siempre, la misma anotada dos veces —y
 * ese es el error que hay que evitar, porque el gasto se duplica en cuatro pestañas—. Cuando de verdad son
 * dos pagos iguales el mismo día, se distinguen escribiendo algo más en el concepto («Flete 2»).
 *
 * El prefijo `l:` la separa de las claves de comprobante (`c:` con CUIT, `p:` con proveedor): son espacios
 * distintos y no pueden colisionar.
 */
export function claveDeLinea({ fecha, concepto, monto } = {}) {
  const c = plano(concepto).replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-')
  if (!fecha || !c || !(monto > 0)) return null
  return `l:${fecha}|${c}|${Math.round(monto * 100)}`
}
