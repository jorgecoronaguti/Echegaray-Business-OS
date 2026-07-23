import { hallarPestana } from './sheet-pestanas.mjs'

// ¿LOS CHEQUES Y LA TARJETA ESTÁN CONTEMPLADOS EN EL CASH FLOW, O SON PLATA INVISIBLE?
//
// LA PREGUNTA DEL DUEÑO (20/07): "¿qué pasó con los cheques a cubrir en los cash flows, en qué
// concepto están?" y "¿todo lo que se contempla en Compras está en algún concepto del cash flow?".
//
// MI RESPUESTA ANTERIOR ESTABA MAL A MEDIAS. Excluí los cheques del cash flow diciendo "el cheque es
// CÓMO se paga, no qué se compró". Eso es cierto — pero SÓLO si la factura que el cheque paga está
// cargada en Compras. Al medirlo:
//
//   CHEQUES   89 filas · $71.900.300
//     · 39 ($38.388.505) tienen su factura en Compras → ya están en el cash flow, en el rubro que le
//       toque a esa factura. Sumarlos otra vez duplicaría.
//     · 50 ($33.511.796) NO tienen factura en Compras → son pagos reales que el cash flow NO ve.
//   TARJETA   29 filas · $8.785.691
//     · 24 ($7.437.350) están en Compras · 5 ($1.348.341) no.
//
// O sea: la respuesta correcta no es "sumarlos" ni "ignorarlos". Es medir cuánto de cada uno ya está
// contemplado, y mostrar el resto como trabajo pendiente de carga. Un cheque sin factura en Compras
// no es un problema del cash flow: es una compra que nadie registró.
//
// LA LLAVE ES EL NÚMERO DE COMPROBANTE, no el monto. Cruzar por proveedor+monto daba sólo 2 matches
// de 89 — porque un cheque suele pagar una parte de una factura, o varias facturas juntas. Por
// comprobante dan 39. El número de comprobante es el único identificador que comparten las dos
// planillas.

/**
 * Normaliza un número de comprobante para poder cruzarlo entre planillas.
 * "0001-000036", "1-36" y "00001-0000036" son el MISMO comprobante: punto de venta 1, número 36.
 * Por eso se limpia cada parte por separado — sacar los ceros de la cadena entera daba "1000036"
 * contra "10000036" y el match fallaba justo en los comprobantes con más relleno.
 */
export const normComprobante = (s) => String(s ?? '')
  .split(/[^0-9]+/)
  .filter(Boolean)
  .map((p) => p.replace(/^0+/, '') || '0')
  .join('-')

/**
 * ¿Esta clave sirve para cruzar, o es demasiado pobre y va a dar matches falsos?
 *
 * Sirve si tiene DOS partes (punto de venta + número, el formato de una factura argentina) o si es
 * un número largo. Contar sólo dígitos era el criterio equivocado: la factura "00045-00000009" se
 * normaliza a "45-9" — tres dígitos — y quedaba descartada, con lo cual las 12 cuotas de la tarjeta
 * de Modica figuraban como "sin factura en Compras" cuando la factura estaba ahí.
 */
export const esLlaveUtil = (k) => k.includes('-') || k.replace(/-/g, '').length >= 5

/**
 * NÚCLEO PURO: reparte instrumentos de pago (cheques, tarjeta) entre los que YA están contemplados
 * en Compras y los que no.
 * @param {Array<{comprobante?:string, monto:number, proveedor?:string, fecha_pago?:string, debitado?:string}>} instrumentos
 * @param {Set<string>} comprobantesEnCompras claves ya normalizadas
 * @returns {{contemplados:Array, sin_registrar:Array, total:number, monto_contemplado:number, monto_sin_registrar:number, sin_numero:number}}
 */
export function repartirCobertura(instrumentos = [], comprobantesEnCompras = new Set()) {
  // TRES grupos, no dos. La diferencia importa y casi la paso por alto: de los 50 cheques que no
  // matchean, 40 ($21.880.254) simplemente NO TIENEN número de comprobante cargado — su factura
  // puede estar perfectamente en Compras y no hay forma de saberlo. Sólo 10 ($11.631.542) tienen
  // número y ese número no aparece en Compras: ésos sí son, con seguridad, facturas sin cargar.
  // Decir "$33,5M sin registrar" mezcla un problema confirmado con una ignorancia, y exagera.
  const contemplados = []
  const faltaFactura = []
  const sinNumero = []
  for (const i of instrumentos) {
    const k = normComprobante(i.comprobante)
    if (!esLlaveUtil(k)) sinNumero.push(i)
    else if (comprobantesEnCompras.has(k)) contemplados.push(i)
    else faltaFactura.push(i)
  }
  const suma = (a) => a.reduce((s, x) => s + (Number(x.monto) || 0), 0)
  return {
    contemplados,
    falta_factura: faltaFactura,
    sin_numero_comprobante: sinNumero,
    // Se mantiene por compatibilidad: todo lo que NO se pudo confirmar como contemplado.
    sin_registrar: [...faltaFactura, ...sinNumero],
    total: suma(instrumentos),
    monto_contemplado: suma(contemplados),
    monto_falta_factura: suma(faltaFactura),
    monto_sin_numero: suma(sinNumero),
    monto_sin_registrar: suma(faltaFactura) + suma(sinNumero),
    sin_numero: sinNumero.length,
  }
}

/**
 * NÚCLEO PURO: los cheques que todavía hay que CUBRIR, agrupados por mes de pago.
 * Es una pregunta de tesorería distinta de la anterior: no importa si la factura está registrada,
 * importa cuánta plata tiene que haber en la cuenta y cuándo. Un cheque emitido y no debitado es un
 * compromiso en firme — más firme que una factura con fecha prevista.
 * @param {Array} instrumentos con {monto, fecha_pago:'YYYY-MM', debitado}
 * @returns {{por_mes:Array<{mes:string, cantidad:number, monto:number}>, total:number}}
 */
export function aCubrirPorMes(instrumentos = []) {
  const acc = new Map()
  let total = 0
  for (const i of instrumentos) {
    // "DEBITADO = SI" ya salió de la cuenta. Lo demás está pendiente de cubrir.
    if (String(i.debitado ?? '').trim().toUpperCase() === 'SI') continue
    const mes = String(i.fecha_pago ?? '').trim() || '(sin fecha)'
    const m = Number(i.monto) || 0
    total += m
    // EL AÑO Y EL MES DE VERDAD, cuando se conocen. El rótulo "julio 26" que se ve en la pestaña es
    // FORMATO: la celda tiene una fecha adentro. Agrupar por el texto funciona en código y falla en
    // una fórmula del Sheet, que compara contra el valor real — daba $0 en las cuatro filas.
    const d = i.fecha instanceof Date && !Number.isNaN(+i.fecha) ? i.fecha : null
    const a = acc.get(mes) ?? { mes, cantidad: 0, monto: 0, anio: d?.getFullYear() ?? null, num: d ? d.getMonth() + 1 : null }
    a.cantidad++; a.monto += m
    acc.set(mes, a)
  }
  // Se ordena por la fecha real cuando existe: alfabéticamente, "agosto" va antes que "julio".
  const por_mes = [...acc.values()].sort((a, b) => (
    a.anio && b.anio ? (a.anio - b.anio) || (a.num - b.num) : a.mes.localeCompare(b.mes)
  ))
  return { por_mes, total }
}

/**
 * NÚCLEO PURO: los instrumentos SIN factura en Compras, con su fecha real de pago.
 *
 * POR QUÉ HACE FALTA UNA LÍNEA EN EL CASH FLOW Y NO ALCANZA CON MEDIRLO. El bloque de medición del
 * pie contesta "cuánto falta cargar", pero el cuadro de arriba —el que se mira para decidir— seguía
 * sin ver esa plata. Y son pagos que salen de la cuenta igual: $12.979.883 confirmados.
 *
 * NO PUEDE DUPLICAR, POR CONSTRUCCIÓN. Sólo entran los instrumentos cuyo número de comprobante NO
 * está en Compras. Si estuviera, ya viajó al cash flow por el rubro de esa factura y acá no aparece.
 * Es la única forma de sumar cheques sin romper la regla de oro: el que ya está contemplado, se
 * excluye solo.
 *
 * @param {Array} instrumentos con {comprobante, monto, fecha} — fecha es la de PAGO, no la de emisión
 * @param {Set<string>} comprobantesEnCompras claves ya normalizadas
 * @returns {Array<{fecha:Date, monto:number, proveedor:string}>}
 */
export function faltaFacturaConFecha(instrumentos = [], comprobantesEnCompras = new Set()) {
  const { falta_factura: falta } = repartirCobertura(instrumentos, comprobantesEnCompras)
  return falta.filter((i) => i.fecha instanceof Date && !Number.isNaN(i.fecha.getTime()))
    .map((i) => ({ fecha: i.fecha, monto: Number(i.monto) || 0, proveedor: i.proveedor ?? '' }))
}

/**
 * LAS MARCAS QUE EL OS ESCRIBE AL LADO DE CADA CHEQUE Y DE CADA CONSUMO DE TARJETA.
 *
 * POR QUÉ SON CONSTANTES Y NO TEXTOS SUELTOS (21/07). El cash flow SUMA por estas marcas: la línea
 * "Pagos con cheque y tarjeta sin factura registrada" dejó de ser un número pegado y pasó a ser una
 * fórmula que cuenta las filas marcadas. Si el texto cambia de un lado y no del otro, la fórmula da
 * $0 y nadie se entera — que es exactamente la forma de fallar que este cambio vino a sacar.
 *
 * El cruce sigue haciéndose en código, no en fórmula: normalizar "0001-000036" contra "1-36" en una
 * celda sería ilegible. Lo que cambia es que el resultado del cruce queda ESCRITO fila por fila —
 * visible, filtrable, verificable— y el total lo hace el Sheet sumando esas filas.
 */
export const MARCAS = {
  ok: '✓ su factura está en Compras',
  falta: '⚠ FALTA cargar la factura en Compras — este pago no lo ve el cash flow',
  sinNumero: '⚠ sin N° de comprobante — no se puede cruzar',
}

/** NÚCLEO PURO: qué marca le toca a un instrumento de pago. */
export function marcaDe(comprobante, comprobantesEnCompras = new Set()) {
  const k = normComprobante(comprobante)
  if (!esLlaveUtil(k)) return MARCAS.sinNumero
  return comprobantesEnCompras.has(k) ? MARCAS.ok : MARCAS.falta
}

/**
 * NÚCLEO PURO: cuánto de una lista cae en una ventana [desde, hasta).
 * El límite superior es EXCLUYENTE para que ningún pago caiga en dos columnas del cash flow.
 * @param {Array<{fecha:Date, monto:number}>} items
 * @returns {number}
 */
export function montoEnVentana(items = [], desde, hasta) {
  return items.reduce((s, i) => (i.fecha >= desde && i.fecha < hasta ? s + i.monto : s), 0)
}

/**
 * NÚCLEO PURO: las filas de una versión ANTERIOR de este mismo bloque que quedaron sueltas.
 *
 * ═══ POR QUÉ EXISTE (23/07) ═══
 *
 * El Cash Flow Mensual tenía DOS copias del bloque de cobertura: un residuo en las filas 131–154 y
 * el vivo en las 157–193. No leían lo mismo —el residuo `'Cheques Emitidos'!$M$13:$M$401` y
 * `'Tarjeta de Credito'!$L$3:$L$330`, el vivo `$M$4` y `$L$400`— así que la contradicción iba a
 * aparecer el día que Cheques escribiera en las filas 4 a 12 o Tarjeta pasara la 330. Encima el
 * residuo tenía seriales crudos sin formato (46260, 46291, 46321) donde debía decir "agosto 26".
 *
 * MECANISMO: el residuo perdió su fila de FIRMA (el título del bloque), así que la búsqueda de
 * idempotencia no lo encontraba; y la limpieza de colas sólo borra HACIA ABAJO, de modo que un
 * residuo que quedó ARRIBA del bloque nuevo era inmune y sobrevivía a cada corrida.
 *
 * ═══ Y POR QUÉ NO ROMPE LA REGLA DE ORO ═══
 *
 * No se borra "todo lo que hay entre A y B": se borran SÓLO las filas que este bloque reconoce como
 * PROPIAS — su rótulo está en la lista de etiquetas que el generador acaba de producir, o la fila
 * está vacía, o es una fila de mes (un serial o "agosto 26") dentro del tramo. Cualquier texto que
 * una persona haya escrito ahí no matchea y se preserva intacto.
 *
 * @param {any[][]} actual   la pestaña leída (valores), desde la fila 1
 * @param {any[][]} generado la grilla que el bloque nuevo produjo (para reconocer sus filas por firma)
 * @param {{desde:number, hasta:number}} vivo el rango (1-based, inclusive) que ocupa el bloque nuevo
 * @returns {number[]} filas 1-based a limpiar
 */
export function fragmentosViejos(actual = [], generado = [], { desde = 0, hasta = -1 } = {}) {
  // Los rótulos de la columna A del bloque ("CHEQUES — total emitido", "TOTAL A CUBRIR"…). Cubren las
  // filas titeadas, incluidas las de dato — que en el residuo traen números pegados en vez de las
  // fórmulas del bloque nuevo, así que NO se pueden reconocer por su terna B/C.
  const etiquetas = new Set(generado.map((f) => String(f?.[0] ?? '').trim()).filter(Boolean))
  // Los sub-encabezados SIN rótulo ("|Cantidad|Monto"): se reconocen por su terma B/C, con A vacía.
  const firmaBC = (fila) => (fila || []).slice(1, 3).map((c) => String(c ?? '').trim().toLowerCase()).join('|')
  const subHeaders = new Set(generado.filter((f) => !String(f?.[0] ?? '').trim() && firmaBC(f) !== '|').map(firmaBC))
  const dentro = (f) => f >= desde && f <= hasta
  const txt = (f) => String(actual[f - 1]?.[0] ?? '').trim()
  const vacia = (f) => !(actual[f - 1] || []).some((c) => String(c ?? '').trim())
  // Una fila de mes: el serial crudo de una fecha, o el mes ya formateado ("agosto 26").
  const esMes = (t) => /^\d{4,6}$/.test(t) || /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i.test(t)
  const propia = (f) => etiquetas.has(txt(f)) || (!txt(f) && subHeaders.has(firmaBC(actual[f - 1]))) || vacia(f) || esMes(txt(f))

  // Sólo se ancla en filas cuyo RÓTULO de columna A pertenece al bloque: un sub-encabezado suelto
  // aparece en muchos lados y no alcanza para afirmar "acá hay un residuo".
  const reconocidas = []
  for (let f = 1; f <= actual.length; f++) if (!dentro(f) && etiquetas.has(txt(f))) reconocidas.push(f)
  if (!reconocidas.length) return []
  const min = Math.min(...reconocidas)
  const max = Math.max(...reconocidas)
  const out = []
  for (let f = min; f <= max; f++) if (!dentro(f) && propia(f)) out.push(f)
  return out
}

// Se re-exporta para no romper a quien ya la importaba de acá; su casa es sheet-pestanas.mjs.
export { hallarPestana }
