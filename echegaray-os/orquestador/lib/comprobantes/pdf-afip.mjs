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
/** Y las de DÉBITO, que SUMAN. Los dos se llaman «notas»: confundirlos ya costó $41,9M en este repo.
 *  Viaja hasta la clave de idempotencia porque una nota de débito comparte numeración con la factura. */
const NOTAS_DE_DEBITO = new Set([2, 7, 12, 202, 207, 212])

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE EL PAPEL DICE ADEMÁS DE LOS NÚMEROS (10/09/2026)
//
// Hasta hoy este módulo leía identidad e importes y nada más. Alcanzaba mientras lo llamaba sólo su
// test; desde el 05/09 su salida va DERECHO a una fila de Compras sin que ningún modelo la mire, y
// una factura sin razón social, sin letra, sin concepto y sin condición de venta deja cuatro celdas
// vacías y —lo grave— hace que la columna B se llene con `N`, "en negro", sobre un comprobante con
// CAE. Todo eso está impreso en el PDF: no leerlo era una decisión, no un límite.
//
// Las cuatro funciones de abajo son PURAS y devuelven `null` cuando el texto no lo dice sin
// ambigüedad. `null` acá no es una pérdida: `sin-modelo.mjs` lo convierte en «este papel sigue al
// camino del modelo», que es exactamente lo que corresponde cuando el atajo no alcanza.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Lo que NO puede ser el valor de un campo: un rótulo, una fecha, un CUIT o puros números. */
function pareceValor(linea) {
  const t = String(linea ?? '').trim()
  if (t.length < 2 || t.length > 90) return false
  if (t.endsWith(':')) return false
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return false
  if (/^[\d\s.,%$-]+$/.test(t)) return false
  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(t)
}

/**
 * LA RAZÓN SOCIAL DEL QUE FACTURA, que en este formato está impresa en el renglón siguiente al
 * rótulo de la copia (`ORIGINAL` / `DUPLICADO` / `TRIPLICADO`).
 *
 * Medido sobre los cuatro PDF que entraron por el canal entre el 01 y el 10/09/2026: 4 de 4. Los
 * otros dos lugares donde el nombre aparece —el bloque «Razón Social:» y el pie— NO son estables:
 * en la factura de Turiaci el rótulo «Razón Social:» viaja separado de su valor.
 *
 * Se exige que el nombre aparezca MÁS DE UNA VEZ en el documento (todas las copias lo repiten): un
 * renglón suelto que casualmente siga a la palabra ORIGINAL no es una razón social.
 */
export function razonSocialEmisor(texto) {
  const t = String(texto ?? '')
  const m = t.match(/(?:^|\n)\s*(?:ORIGINAL|DUPLICADO|TRIPLICADO)\s*\r?\n\s*([^\n]+)/i)
  const nombre = m?.[1]?.trim() ?? null
  if (!nombre || !pareceValor(nombre)) return null
  // Ni el comprador ni un rótulo del formulario.
  if (/ECHEGARAY CONSTRUCCIONES/i.test(nombre)) return null
  const veces = t.split(nombre).length - 1
  return veces >= 2 ? nombre : null
}

/**
 * LA CONDICIÓN DE VENTA IMPRESA. En este formato es el último valor del bloque del encabezado: el
 * renglón que precede al `CUIT:` / `Ingresos Brutos:` del segundo cuadro.
 *
 * Viaja TAL CUAL (`Contado`, `Cuenta Corriente`, `Cheque`, `Transferencia Bancaria`) sin traducirse:
 * quien la convierte en modalidad, estado y forma de pago es `condicionAPago` / `tipoPagoValido` del
 * cargador, que es el mismo camino por el que pasa lo que lee el modelo. Traducirla acá sería tener
 * dos reglas para la misma columna.
 */
export function condicionDeVentaImpresa(texto) {
  const t = String(texto ?? '')
  if (!/Condici[óo]n de venta:/i.test(t)) return null
  const m = t.match(/\n\s*([^\n]+?)\s*\r?\n\s*CUIT:\s*\r?\n\s*Ingresos Brutos:/i)
  const v = m?.[1]?.trim() ?? null
  return v && pareceValor(v) ? v : null
}

/**
 * QUÉ SE COMPRÓ, sacado de los RENGLONES del detalle — nunca del nombre del proveedor, que es el
 * error que ya convirtió una carga de combustible en «comestibles y bebidas».
 *
 * La descripción de cada ítem es el texto que PRECEDE inmediatamente a su cantidad. Esa regla
 * resuelve sola las dos trampas del formato: el código de artículo (`001`) no es texto y queda
 * afuera, y la unidad de medida (`otras` + `unidades`) va DESPUÉS de la cantidad, así que nunca se
 * confunde con la descripción. Una descripción partida en dos renglones se vuelve a unir.
 */
/**
 * LOS RÓTULOS DE LA TABLA DEL DETALLE, que salen como renglones sueltos igual que los artículos.
 * Sin esta lista el concepto de la factura de Rodríguez salía «Cantidad U. medida Precio Unit. %
 * Bonif Subtotal Alicuota IVA Subtotal c/IVA Orden 641 + Orden 642»: el encabezado pegado adelante.
 * Se comparan normalizados (sin acentos, sin puntos) para que `U. medida` y `U. Medida` sean el mismo.
 */
const ROTULOS_DETALLE = new Set([
  'codigo', 'producto / servicio', 'producto/servicio', 'cantidad', 'u medida', 'precio unit',
  '% bonif', 'imp bonif', 'subtotal', 'alicuota', 'iva', 'subtotal c/iva', 'otras', 'unidades',
  'otras unidades', 'unidad', 'kg', 'kilogramos', 'metros', 'litros',
])

/** Para comparar un renglón contra `ROTULOS_DETALLE`. */
function comoRotulo(linea) {
  return String(linea ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.:]/g, '').replace(/\s+/g, ' ').trim()
}

export function conceptoDelDetalle(texto) {
  const t = String(texto ?? '')
  const desde = t.search(/Producto\s*\/\s*Servicio/i)
  if (desde < 0) return null
  const resto = t.slice(desde)
  const hasta = resto.search(/CAE\s*N[°º]|Importe Otros Tributos:|Subtotal:\s*\$/i)
  const bloque = hasta > 0 ? resto.slice(0, hasta) : resto
  const cantidad = /^\d{1,3}(?:\.\d{3})*,\d{1,4}$/
  const items = []
  let corriendo = []
  for (const cruda of bloque.split(/\r?\n/)) {
    const l = cruda.trim()
    if (!l) continue
    if (ROTULOS_DETALLE.has(comoRotulo(l))) continue // un rótulo de la tabla no es un artículo
    if (cantidad.test(l)) {
      if (corriendo.length) items.push(corriendo.join(' '))
      corriendo = []
      continue
    }
    if (pareceValor(l)) corriendo.push(l)
    else corriendo = []
  }
  // Un artículo que aparece en la copia ORIGINAL vuelve a aparecer en el DUPLICADO y el TRIPLICADO:
  // es el MISMO renglón, no tres compras.
  const unicos = [...new Set(items)]
  const salida = unicos.join(' + ').replace(/\s+/g, ' ').trim()
  return salida ? salida.slice(0, 300) : null
}

/**
 * LA FECHA DE EMISIÓN, Y SÓLO CUANDO EL TEXTO LA DETERMINA.
 *
 * ═══ EL DEFECTO (10/09/2026) ═══
 *
 * Acá decía `t.match(/(\d{2}\/\d{2}\/\d{4})/)` — la PRIMERA fecha del texto. En una factura de
 * servicios con período facturado, la primera fecha es el «Período Facturado Desde». Medido sobre
 * los honorarios de Robles (`0001-00000211`): el texto arranca con **01/08/2026** y el comprobante
 * se emitió el **07/09/2026**. Un mes entero de diferencia, que en Compras es la columna D y en el
 * Flujo de Fondos es el mes en que ese costo aparece.
 *
 * ═══ LA REGLA, Y POR QUÉ NO ADIVINA ═══
 *
 * Las fechas del encabezado —las que van antes del `Punto de Venta:` del segundo cuadro— salen en
 * el orden del formulario. Cuando hay período facturado, las dos primeras son «Desde» y «Hasta»; lo
 * que queda son la emisión y el vencimiento para el pago. Si esas dos coinciden, la emisión no tiene
 * ambigüedad posible. Si no coinciden, **no se afirma nada**: se devuelve null y el papel sigue al
 * camino del modelo, que lee el formulario mirándolo.
 *
 * Y se cruza contra una fuente del propio papel que no participó de la elección: la emisión no puede
 * ser posterior al vencimiento del CAE.
 */
export function fechaDeEmision(texto) {
  const t = String(texto ?? '')
  const corte = t.search(/Punto de Venta:/i)
  const cabecera = corte > 0 ? t.slice(0, corte) : t
  let fechas = [...cabecera.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((m) => m[1])
  if (!fechas.length) return null
  if (/Per[íi]odo Facturado Desde:/i.test(cabecera)) {
    fechas = fechas.slice(2)
    if (!fechas.length) return null
  }
  const unica = fechas.every((f) => f === fechas[0]) ? fechas[0] : null
  if (!unica) return null
  const vtoCae = t.match(/Fecha de Vto\.? de CAE:[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null
  if (vtoCae && aDia(unica) > aDia(vtoCae)) return null
  return unica
}

/** DD/MM/AAAA → número comparable. Sólo para ordenar; no se exporta. */
function aDia(f) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(f ?? ''))
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : 0
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
    esNotaDebito: codigo != null && NOTAS_DE_DEBITO.has(codigo),
    // LA DE EMISIÓN, NO LA PRIMERA QUE APAREZCA. El porqué, en `fechaDeEmision`: en una factura con
    // período facturado la primera fecha del texto es el «Desde», y el gasto se iba un mes atrás.
    fecha: fechaDeEmision(t),
    // Lo que el papel dice además de los números, y que hasta hoy se tiraba: sin esto la fila de
    // Compras sale sin proveedor (E), sin concepto (L) y sin modalidad (F/P/S/X).
    emisor: razonSocialEmisor(t),
    condicionVenta: condicionDeVentaImpresa(t),
    concepto: conceptoDelDetalle(t),
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
