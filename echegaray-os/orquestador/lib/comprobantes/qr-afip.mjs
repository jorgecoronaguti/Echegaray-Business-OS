// EL QR DE AFIP — LEER UN COMPROBANTE SIN NINGÚN MODELO.
//
// ═══ POR QUÉ (25/08/2026) ═══
//
// El dueño lo pidió así: *«no quiero que intervenga api de claude … todo tiene que ser por el
// cerebro del OS independiente»*. Hasta hoy cada foto que entra por el canal pasa entera por un
// modelo de visión para sacar seis campos. Pero toda factura electrónica argentina lleva desde 2021
// un QR OBLIGATORIO (RG 4892/2020) que trae esos campos **firmados por el emisor**, en JSON.
//
// Eso no es una lectura: es el dato. No se equivoca con el sol, ni con el papel arrugado, ni con un
// 8 que parece un 3. Cuando el QR se lee, la identidad del comprobante es EXACTA.
//
// ═══ LO QUE EL QR TRAE, Y LO QUE NO ═══
//
// Medido sobre fotos reales del canal el 25/08/2026:
//   {"ver":1,"fecha":"2026-08-25","cuit":30711355223,"ptoVta":6,"tipoCmp":1,"nroCmp":8111,
//    "importe":112349.35,"moneda":"PES","ctz":1,"tipoDocRec":80,"nroDocRec":30716304643,
//    "tipoCodAut":"E","codAut":86349837876032}
//
// TRAE: emisor, punto de venta, tipo y número de comprobante, fecha, TOTAL y CAE.
// NO TRAE: razón social, neto gravado, IVA discriminado, ni el concepto. Eso lo completa el libro de
// ARCA (`desde-arca.mjs`), que tampoco necesita un modelo.
//
// LO QUE NINGÚN CAMINO DETERMINÍSTICO PUEDE DAR es la anotación manuscrita —«Estrella comedor»—,
// que es la que decide a qué obra se imputa el gasto. Para eso sigue haciendo falta leer la foto, o
// que la persona lo escriba en el mismo mensaje.

/** Los tipos de comprobante de AFIP que aparecen en las compras de la empresa. */
export const TIPO_CMP = Object.freeze({
  1: 'A', 2: 'A', 3: 'A',      // Factura / Nota de débito / Nota de crédito A
  6: 'B', 7: 'B', 8: 'B',
  11: 'C', 12: 'C', 13: 'C',
  51: 'M', 52: 'M', 53: 'M',
  201: 'A', 202: 'A', 203: 'A', // FCE MiPyME A
  206: 'B', 207: 'B', 208: 'B',
  211: 'C', 212: 'C', 213: 'C',
})

/** Un tipo de comprobante que RESTA en vez de sumar: notas de crédito. Ver la memoria del signo. */
const NOTAS_DE_CREDITO = new Set([3, 8, 13, 53, 203, 208, 213])

/**
 * ¿Esta cadena es un QR de comprobante de AFIP? Devuelve el payload en base64, o null.
 *
 * Se acepta el host con o sin `www` y con cualquier esquema: el QR impreso varía entre sistemas de
 * facturación, y rechazar por eso sería tirar un dato bueno.
 */
export function payloadDeQr(texto) {
  const s = String(texto ?? '').trim()
  if (!/afip\.gob\.ar\/fe\/qr/i.test(s)) return null
  const m = s.match(/[?&]p=([A-Za-z0-9+/=_-]+)/)
  return m ? m[1] : null
}

/**
 * EL COMPROBANTE QUE DECLARA EL QR. Null si la cadena no es un QR de AFIP o no se puede decodificar.
 *
 * Todo lo que devuelve sale del QR y NADA se infiere: si un campo no vino, no está. `esNotaCredito`
 * sí se deriva, del tipo de comprobante, porque es la única forma de saber que el importe RESTA — y
 * confundirlo ya costó $41,9 M una vez.
 */
export function comprobanteDesdeQr(texto) {
  const p = payloadDeQr(texto)
  if (!p) return null
  let j
  try {
    j = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch { return null }
  if (!j || typeof j !== 'object') return null

  const cuit = j.cuit == null ? null : String(j.cuit)
  const pv = j.ptoVta == null ? null : Number(j.ptoVta)
  const nro = j.nroCmp == null ? null : Number(j.nroCmp)
  if (!cuit || pv == null || nro == null) return null // sin identidad no hay comprobante

  const tipoCmp = j.tipoCmp == null ? null : Number(j.tipoCmp)
  return {
    cuit,
    puntoVenta: pv,
    numero: nro,
    /** `0004-00003755`, como lo escribe la pestaña Compras. */
    comprobante: `${String(pv).padStart(4, '0')}-${String(nro).padStart(8, '0')}`,
    tipoCmp,
    tipo: tipoCmp == null ? null : (TIPO_CMP[tipoCmp] ?? null),
    esNotaCredito: tipoCmp != null && NOTAS_DE_CREDITO.has(tipoCmp),
    fecha: j.fecha ?? null,
    total: j.importe == null ? null : Number(j.importe),
    moneda: j.moneda ?? null,
    cotizacion: j.ctz == null ? null : Number(j.ctz),
    receptorCuit: j.nroDocRec == null ? null : String(j.nroDocRec),
    cae: j.codAut == null ? null : String(j.codAut),
    /** De dónde salió cada campo. El OS nunca presenta una lectura como si fuera un hecho. */
    via: 'qr_afip',
  }
}

/**
 * ¿ESTE QR ES DE UN COMPROBANTE NUESTRO? El receptor tiene que ser la empresa.
 *
 * Una foto puede traer el comprobante de otro —el remito de un tercero, la factura que un proveedor
 * le hizo a otro cliente— y cargarlo como gasto propio sería inventar un costo. Sin `receptorCuit`
 * no se afirma nada: devuelve null, que es «no se puede saber», no «no es».
 */
export function esParaLaEmpresa(comprobante, cuitEmpresa) {
  const r = String(comprobante?.receptorCuit ?? '').replace(/\D/g, '')
  const e = String(cuitEmpresa ?? '').replace(/\D/g, '')
  if (!r || !e) return null
  return r === e
}
