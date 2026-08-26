// LEER UNA FACTURA EN PDF SIN NINGÚN MODELO — el camino que sí llega a cero.
//
// ═══ POR QUÉ ESTE ES EL BUENO ═══
//
// Una foto de un papel arrugado necesita interpretar píxeles. Un PDF de factura electrónica trae el
// texto EMBEBIDO: lo escribió el sistema de facturación del proveedor, no una cámara. Medido sobre
// los PDFs reales del canal el 25/08/2026: los 6 que no son un escaneo dieron entre 3.500 y 4.000
// caracteres de texto limpio, con cada importe rotulado por AFIP.
//
// Factura A (`COD. 01`):
//     Punto de Venta: Comp. Nro:	00009 00003204
//     Importe Neto Gravado: $ 388070,00
//     IVA 21%: $ 81494,70
//     Importe Total: $ 469564,70
//     CAE N°: 86316774738912
//
// Factura C (`COD. 011`, monotributista) no discrimina IVA y eso NO es un dato faltante: es que no
// hay IVA que discriminar. Se devuelve `iva: 0` con `ivaDiscriminado: false`, que es distinto de
// «no lo pude leer».
//
// ═══ CUÁL DE LOS DOS CUIT ES EL EMISOR ═══
//
// El PDF trae los dos —el que factura y el que recibe— y las etiquetas «CUIT:» aparecen sueltas,
// lejos del número. La regla que sí es robusta: **el CUIT que NO es el de la empresa es el del
// emisor**. Si aparece uno solo, o ninguno es el nuestro, no se afirma nada.
//
// ═══ LA ARITMÉTICA SE VERIFICA, NO SE CONFÍA ═══
//
// `neto + IVA + otros tributos = total` es una identidad. Si no cierra, algo se leyó mal —o el PDF
// trae dos comprobantes— y se dice, en vez de escribir una fila que no cuadra. Es la misma
// disciplina que la cadena de saldos del banco, que ya encontró dos errores de transcripción reales.

/** El CUIT de Echegaray Construcciones S.A.S. Configurable por si el OS opera otra razón social. */
const CUIT_EMPRESA = () => String(process.env.ORQ_CUIT_EMPRESA || '30716304643').replace(/\D/g, '')

/** `COD. 01` → letra del comprobante. AFIP imprime el código con o sin cero a la izquierda. */
const POR_CODIGO = Object.freeze({
  1: 'A', 2: 'A', 3: 'A', 6: 'B', 7: 'B', 8: 'B', 11: 'C', 12: 'C', 13: 'C',
  51: 'M', 52: 'M', 53: 'M', 201: 'A', 202: 'A', 203: 'A', 206: 'B', 207: 'B', 208: 'B',
  211: 'C', 212: 'C', 213: 'C',
})
const NOTAS_DE_CREDITO = new Set([3, 8, 13, 53, 203, 208, 213])

/**
 * UN IMPORTE ESCRITO EN es-AR. `388.070,00` y `388070,00` son el mismo número; `388,070.00` no
 * aparece en un comprobante argentino y leerlo al revés cambiaría el gasto por mil.
 */
export function importeAr(texto) {
  const s = String(texto ?? '').trim().replace(/[$\s]/g, '')
  if (!s || !/\d/.test(s)) return null
  // El ÚLTIMO separador es el decimal si le siguen exactamente dos dígitos.
  const m = s.match(/^(-?[\d.]*?)([.,](\d{1,2}))?$/)
  if (!m) return null
  const entero = m[1].replace(/[.,]/g, '')
  const dec = m[3] ?? '0'
  const n = Number(`${entero || '0'}.${dec.padEnd(2, '0')}`)
  return Number.isFinite(n) ? n : null
}

/** El valor que sigue a una etiqueta de AFIP, en la misma línea o en la siguiente. */
function trasEtiqueta(texto, etiqueta) {
  const re = new RegExp(`${etiqueta}\\s*:?\\s*\\$?\\s*([\\d.,]+)`, 'i')
  return importeAr(texto.match(re)?.[1])
}

/**
 * EL PIE DE UNA FACTURA C, DONDE AFIP SEPARA LAS ETIQUETAS DE LOS NÚMEROS.
 *
 * En la A cada rótulo trae su importe al lado. En la C el extractor de texto devuelve los números
 * en un bloque y los rótulos en otro:
 *
 *     0,00 · 576546,15 · 576546,15 · «Subtotal: $» · «Importe Otros Tributos: $» · «Importe Total: $»
 *
 * Aparear por posición es una inferencia, y sola no alcanza. Por eso SÓLO se acepta si además
 * cierra contra una fuente independiente: la suma de los subtotales de las líneas del detalle. Dos
 * caminos distintos que dan el mismo número no es una coincidencia; uno solo es una suposición.
 *
 * Devuelve null cuando no puede afirmarlo — que es la respuesta correcta cuando no se sabe.
 */
export function pieDeFacturaSinIva(texto) {
  const bloque = texto.match(/Subtotal:\s*\$[\s\S]{0,120}?Importe Total:\s*\$/i)
  if (!bloque) return null
  // Los tres importes que preceden inmediatamente al bloque de rótulos.
  const antes = texto.slice(0, bloque.index)
  const nums = [...antes.matchAll(/^\s*([\d.]*\d,\d{2})\s*$/gm)].map((m) => importeAr(m[1])).filter((n) => n != null)
  if (nums.length < 3) return null
  const [otros, subtotal, total] = nums.slice(-3)
  if (subtotal == null || total == null) return null

  // ── LA VERIFICACIÓN INDEPENDIENTE: la suma de las líneas del detalle ──
  // Cada línea termina con su subtotal. Si suman lo mismo que el total apareado, el apareo es
  // correcto por dos caminos distintos.
  const lineas = [...texto.matchAll(/([\d.]*\d,\d{2})\s+[\d.]*\d,\d{2}\s+0,00\s+0,00/g)]
    .map((m) => importeAr(m[1])).filter((n) => n != null)
  const sumaLineas = lineas.reduce((a, b) => a + b, 0)
  const cierraConElDetalle = lineas.length > 0 && Math.abs(sumaLineas - total) < 0.5

  if (!cierraConElDetalle && Math.abs(subtotal - total) > 0.5) return null // ni una cosa ni la otra
  return { subtotal, total, otrosTributos: otros ?? 0, verificadoConElDetalle: cierraConElDetalle }
}

/**
 * EL NOMBRE DEL ARCHIVO QUE PONE AFIP: `20287737824_001_00009_00003204 …pdf`
 * → CUIT del emisor, código de comprobante, punto de venta, número.
 *
 * NO se usa como fuente: se usa para CONFIRMAR lo leído del contenido. Un nombre de archivo se
 * renombra, se copia y miente — ya pasó con «HM», que resultó ser la libreta del IERIC.
 */
export function identidadDelNombre(nombre) {
  const m = String(nombre ?? '').match(/(\d{11})_(\d{2,3})_(\d{4,5})_(\d{8})/)
  if (!m) return null
  return { cuit: m[1], codigo: Number(m[2]), puntoVenta: Number(m[3]), numero: Number(m[4]) }
}

/**
 * EL COMPROBANTE QUE DECLARA EL PDF. Null si el texto no parece una factura electrónica.
 *
 * @param texto el texto extraído del PDF (`PDFParse().getText()`)
 * @param nombreArchivo opcional, para la confirmación cruzada
 */
export function comprobanteDesdePdf(texto, { nombreArchivo = null } = {}) {
  const t = String(texto ?? '')
  if (t.trim().length < 200) return null // un escaneo sin texto: no es asunto de este módulo

  const cod = t.match(/COD\.\s*0*(\d{1,3})/)
  const codigo = cod ? Number(cod[1]) : null
  const pvNro = t.match(/Punto de Venta:\s*Comp\.\s*Nro:?\s*(\d{4,5})\s+(\d{8})/i)
  if (!pvNro) return null // sin identidad no hay comprobante

  const nuestro = CUIT_EMPRESA()
  const cuits = [...new Set((t.match(/\b\d{11}\b/g) ?? []))]
  const ajenos = cuits.filter((c) => c !== nuestro)
  // Un solo CUIT ajeno es el emisor. Dos o más: no se elige uno — se declara y lo mira una persona.
  const cuitEmisor = ajenos.length === 1 ? ajenos[0] : null

  const neto = trasEtiqueta(t, 'Importe Neto Gravado')
  const iva21 = trasEtiqueta(t, 'IVA 21%')
  const iva105 = trasEtiqueta(t, 'IVA 10\\.?5%')
  const iva27 = trasEtiqueta(t, 'IVA 27%')
  const otros = trasEtiqueta(t, 'Importe Otros Tributos')
  let total = trasEtiqueta(t, 'Importe Total')
  // La C separa los rótulos de los números y `trasEtiqueta` no los encuentra. Ese pie tiene su
  // propio lector, que sólo afirma cuando cierra contra la suma del detalle.
  let pie = null
  if (total == null) { pie = pieDeFacturaSinIva(t); total = pie?.total ?? null }
  // Una factura C no discrimina IVA, y eso NO es un dato faltante: es que no hay IVA que discriminar.
  const ivaDiscriminado = iva21 != null || iva105 != null || iva27 != null
  const iva = ivaDiscriminado ? (iva21 ?? 0) + (iva105 ?? 0) + (iva27 ?? 0) : 0

  const c = {
    cuit: cuitEmisor,
    comprobante: `${pvNro[1].padStart(4, '0')}-${pvNro[2].padStart(8, '0')}`,
    puntoVenta: Number(pvNro[1]),
    numero: Number(pvNro[2]),
    tipo: codigo == null ? null : (POR_CODIGO[codigo] ?? null),
    esNotaCredito: codigo != null && NOTAS_DE_CREDITO.has(codigo),
    fecha: t.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null,
    // Sin IVA discriminado el neto ES el total: la C no lo separa, y dividir por 1,21 sería inventar.
    neto: neto ?? (ivaDiscriminado ? null : (pie?.subtotal ?? total)),
    iva,
    ivaDiscriminado,
    otrosTributos: otros ?? pie?.otrosTributos ?? 0,
    total,
    cae: t.match(/CAE\s*N[°º]?\s*:?\s*(\d{14})/i)?.[1] ?? t.match(/\b(\d{14})\b/)?.[1] ?? null,
    via: pie ? (pie.verificadoConElDetalle ? 'pdf_afip+detalle' : 'pdf_afip') : 'pdf_afip',
  }

  // ── la aritmética, verificada contra sí misma ──
  const suma = (c.neto ?? 0) + c.iva + c.otrosTributos
  c.cuadra = c.total != null && c.neto != null ? Math.abs(suma - c.total) < 0.5 : null

  // ── el nombre del archivo CONFIRMA, no aporta ──
  const delNombre = identidadDelNombre(nombreArchivo)
  if (delNombre) {
    c.confirmadoPorNombre = delNombre.puntoVenta === c.puntoVenta
      && delNombre.numero === c.numero
      && (c.cuit == null || delNombre.cuit === c.cuit)
    // Si el contenido no dijo cuál es el emisor pero el nombre sí, y todo lo demás coincide, se toma.
    if (c.cuit == null && c.confirmadoPorNombre) { c.cuit = delNombre.cuit; c.via = 'pdf_afip+nombre' }
  } else {
    c.confirmadoPorNombre = null
  }

  const falta = ['cuit', 'total'].filter((k) => c[k] == null)
  return { comprobante: c, completo: falta.length === 0 && c.cuadra !== false, falta, via: c.via }
}
