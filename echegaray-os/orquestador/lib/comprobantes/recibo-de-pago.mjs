// EL RECIBO DE PAGO FIRMADO POR UN TERCERO (dueño, 03/10/2026).
//
// «Recibí de Echegaray Construcciones SAS la cantidad de … en concepto de … Son $ …» y una firma. Es lo que
// entrega un sereno, un subcontratista o un servicio que cobra en efectivo: NO es una factura y no tiene —ni
// va a tener nunca— número de comprobante, CUIT ni CAE. Lo que lo identifica es QUIÉN cobró, CUÁNDO y CUÁNTO.
//
// Hasta hoy el chat lo trataba como una factura a la que le faltaba el número: «No hay nada que cargar
// todavía … tocá Corregir». No había dato que el dueño pudiera dar para destrabarlo. Acá se reconoce la clase
// de papel —determinístico, sobre lo que la visión ya transcribió— y se le da su propia identidad.
//
// LO QUE NO HACE: inventar un número, ni darle clave a la FILA del Sheet. La clave `r:` vive sólo en el
// registro de idempotencia (`comunicacion.comprobantes_cargados`); en Compras la fila queda sin número, como
// las 155 que ya hay, y el espejo la sigue viendo sin clave (`compra_sheet.clave` null, memoria del 01/10).
import { aFechaAR, aNumero, normalizar } from '../carga-comprobantes.mjs'

// «Recibí», «recibimos», «recibo» — escrito por el que cobra. La visión transcribe el papel en `anotacion`.
const RE_RECIBI = /\brecib(i|imos|o de|o por)\b/
const RE_DUDA_RECIBO = /\brecibo\b/

/**
 * ¿Es un recibo de pago de un tercero? Sólo si NO hay nada fiscal leído (CUIT, número, CAE, tipo) y el papel
 * dice que alguien recibió plata. Un tique o una factura con la palabra «recibo» en algún lado no entra: tiene
 * número, y el número manda.
 */
export function esReciboDePago(item = {}) {
  const c = item?.comprobante ?? {}
  if (String(c.cuit ?? '').replace(/\D/g, '').length || String(c.numero ?? '').trim() || c.cae || String(c.tipo ?? '').trim()) return false
  if (c.esPresupuestoORemito) return false
  const papel = normalizar([c.anotacion, c.anotacionAlt].filter(Boolean).join(' '))
  if (RE_RECIBI.test(papel)) return true
  return (item?.dudas ?? []).some((d) => RE_DUDA_RECIBO.test(normalizar(d)))
}

/**
 * La identidad de un recibo: quién cobró, la fecha y los centavos. Dos quincenas del mismo sereno son dos
 * recibos (otra fecha); el mismo papel mandado dos veces es uno. Sin cualquiera de los tres, null: sin clave no
 * hay barrera de duplicados y la escritura frena (`escritura.mjs`, «sin clave de idempotencia»).
 * El prefijo `r:` no colisiona con `c:`/`p:` (comprobantes) ni con `l:` (libreta).
 */
export function claveDeRecibo(item = {}) {
  if (!esReciboDePago(item)) return null
  const c = item?.comprobante ?? {}
  const quien = normalizar(c.proveedor).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const fecha = aFechaAR(c.fecha)
  const total = aNumero(c.total)
  if (!quien || !fecha || !(total > 0)) return null
  const [d, m, y] = fecha.split('/')
  return `r:${quien}|${y}-${m}-${d}|${Math.round(total * 100)}`
}

/** Las preguntas, en lenguaje llano y diciendo cómo se contestan. */
export const PREGUNTA_RECIBO = Object.freeze({
  PROVEEDOR: '**¿a quién se le pagó?** La firma no se lee: escribime acá en el hilo el nombre de quien cobró (por ejemplo «Juan Pérez»).',
  IMPORTE: '**¿de cuánto es?** No pude leer el importe: escribímelo acá en el hilo (por ejemplo «1.540.000»).',
})
