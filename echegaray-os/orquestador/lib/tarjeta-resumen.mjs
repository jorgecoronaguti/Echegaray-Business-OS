// EL RESUMEN DE LA TARJETA, LEÍDO DEL PDF — NÚCLEO PURO, SIN ARCHIVOS NI RED.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// Textual del dueño: «quiero saber cuánto tengo que pagar en ambos saldos, ARS y USD, qué me están
// cobrando, si ya se pagó, cuánto puede venir la próxima… y cuando empiece a enviar los resúmenes se
// debe actualizar».
//
// Lo último es lo que no existía. La tarjeta vivía como CONSTANTE ESCRITA A MANO en
// `banco-santander.mjs`: cada resumen nuevo obligaba a que alguien editara un archivo `.mjs`. Para
// los movimientos del banco la puerta existe desde el 23/07 (`importar-banco.mjs`); para la tarjeta,
// no había ninguna. Un dato operativo que sólo se actualiza tocando el código no se actualiza:
// envejece, y la pestaña muestra una foto de hace un mes como si fuera de hoy.
//
// Este módulo es el parser, y es PURO A PROPÓSITO: recibe el TEXTO ya extraído, no el PDF. Así se
// prueba entero con un fixture de cuatro líneas, sin PyMuPDF, sin archivo y sin base. La extracción
// (PyMuPDF) y la escritura (Postgres) viven en `scripts/importar-tarjeta.mjs`.
//
// ═══ EL RESUMEN ES UN INFORME DE ANCHO FIJO, Y ESO ES LO QUE LO HACE LEGIBLE ═══
//
// El PDF del Santander no tiene tablas: tiene texto posicionado. `page.get_text()` de PyMuPDF lo
// devuelve con las columnas alineadas por espacios —verificado contra el resumen Nro 202120, cierre
// 20/08/2026— y esas columnas son estables porque las imprime un sistema de mainframe. Por eso se
// corta por POSICIÓN y no por separadores: un `split(/\s+/)` mezcla el comercio con el importe en
// cuanto el comercio tiene un espacio ("GRUAS SAN BLAS SA"), y peor, no distingue la columna de
// pesos de la de dólares — que están una al lado de la otra y son la misma cifra con otro
// significado.
//
// LAS COLUMNAS SE MIDIERON, NO SE ADIVINARON: sobre el PDF real, con las posiciones de cada palabra.

/** Dónde empieza y termina cada campo de una línea de movimiento. [inicio, fin) en caracteres. */
export const COL = {
  anio: [0, 2],
  mes: [3, 10],
  dia: [11, 13],
  comprobante: [14, 20],
  // '*' = compra en cuotas del comercio · 'K' = consumo en moneda extranjera · ' ' = el resto.
  // No se usa para decidir nada: la cuota se lee del plan "C.nn/mm" y la moneda, de la columna.
  marca: [21, 22],
  descripcion: [24, 72],
  // Cuando el consumo es en moneda extranjera, el banco recorta el comercio, mete la referencia del
  // comercio y pega la sigla "USD" sin un espacio: "ANTHROPIC        in1TzGiCBUSD       45,00".
  comercioUsd: [24, 41],
  refUsd: [41, 50],
  monedaUsd: [50, 53],
  // ARRANCA EN 75 Y NO EN 72, QUE ES DONDE TERMINA LA DESCRIPCIÓN. La línea del pago imprime el tipo
  // de cambio pegado a la descripción ("… 1384.664,47 TC1520,000") y su cola cae en las columnas 72
  // y 73: leyendo desde la 72, el campo quedaba "00      1090.924,47-" y el importe se leía como
  // NULO. Un pago de $1,38 M convertido en cero por dos dígitos de más.
  pesos: [75, 92],
  dolares: [95, 112],
}

const MESES = [
  ['ene', 1], ['feb', 2], ['mar', 3], ['abr', 4], ['may', 5], ['jun', 6],
  ['jul', 7], ['ago', 8], ['sep', 9], ['set', 9], ['oct', 10], ['nov', 11], ['dic', 12],
]

/**
 * El número del mes a partir de como lo escribe el banco. PURA.
 *
 * El mismo resumen usa TRES formas para septiembre: "Set 26" en el encabezado, "Setiembre/26" en la
 * tabla de cuotas y "Septiembre" en ninguna, pero el resumen siguiente puede usarla. Se compara por
 * los tres primeros caracteres sin tildes, que es lo único estable.
 */
export function mesAr(nombre) {
  const n = String(nombre ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!n) return null
  const m = MESES.find(([p]) => n.startsWith(p))
  return m ? m[1] : null
}

/** Un año de dos dígitos como lo imprime el resumen ("26") a año completo. */
const anio4 = (a) => {
  const n = Number(String(a).trim())
  if (!Number.isFinite(n)) return null
  return n >= 100 ? n : 2000 + n
}

/**
 * Un importe del resumen a número. PURA.
 *
 * TRES FORMAS EN EL MISMO DOCUMENTO, y las tres tienen que dar el mismo número:
 *   "355.413,33"    el caso normal
 *   "1090.924,47"   el separador de miles aparece UNA sola vez — el banco no lo pone en el millón
 *   "2208958,42"    la línea "DEBITAREMOS…" lo imprime sin separador ninguno
 * El signo puede venir ATRÁS ("1090.924,47-", que es un crédito) y detrás puede haber un marcador
 * de total ("*"). Devuelve null y no cero cuando no es un número: un cero inventado entra en la
 * suma y hace cerrar un control que no cerraba.
 */
export function importe(txt) {
  const t = String(txt ?? '').trim().replace(/[*#]+$/, '').trim()
  if (!/^-?\d[\d.]*,\d{2}-?$/.test(t)) return null
  const neg = t.startsWith('-') || t.endsWith('-')
  const n = Number(t.replace(/-/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

/**
 * El tipo de cambio que el banco imprime pegado al pago: "TC1520,000". PURA.
 *
 * NO se lee con `importe`: el TC viene con TRES decimales y `importe` exige dos a propósito —esa
 * exigencia es lo que evita confundir una referencia numérica con un importe—. Aflojarla para que
 * entre el TC habría hecho entrar también todo lo demás.
 */
export function tipoDeCambio(desc = '') {
  const m = /TC\s*([\d.]+),(\d+)/.exec(String(desc))
  if (!m) return null
  const n = Number(`${m[1].replace(/\./g, '')}.${m[2]}`)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * EL TIPO DE CAMBIO DEL CIERRE, DEDUCIDO. PURA — y se declara CÁLCULO, no dato.
 *
 * El resumen NO imprime el tipo de cambio con el que valuó los consumos en dólares. Pero imprime la
 * base de la percepción RG 5617 en pesos y el total de consumos en dólares, y el cociente da el TC:
 * $815.850,03 ÷ U$S 544,99 = 1.497,00 redondo al centavo. Se usa para MEDIR (¿el débito del banco se
 * explica con este dólar?), nunca para convertir: los dólares se debitan en dólares.
 */
export const tcDeducido = (base, dolares) => (base && dolares ? Math.round((base / dolares) * 100) / 100 : null)

/** Una fecha "20 Ago 26" o "20 Ago 2026" a ISO. Devuelve null si no la entiende. */
export function fechaLarga(txt) {
  const m = /(\d{1,2})\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,10})\.?\s+(\d{2,4})/.exec(String(txt ?? ''))
  if (!m) return null
  const mes = mesAr(m[2])
  const a = anio4(m[3])
  if (!mes || !a) return null
  const d = Number(m[1])
  if (d < 1 || d > 31) return null
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** El texto de un campo de ancho fijo. Se rellena la línea: cortar más allá del final da ''. */
const campo = (linea, [a, b]) => String(linea ?? '').padEnd(b).slice(a, b).trim()

/** ¿La línea tiene un importe EN LA COLUMNA de pesos o en la de dólares? */
const tieneImporte = (l) => importe(campo(l, COL.pesos)) !== null || importe(campo(l, COL.dolares)) !== null

/**
 * LA CABECERA: la que se repite en todas las hojas y define de qué documento hablamos.
 *
 * El número de resumen no tiene rótulo propio en el texto extraído: los rótulos ("Resumen Nro.",
 * "Hoja") se imprimen una vez arriba y los VALORES caen apilados abajo, en el orden
 * cart / cuenta / liq / resumen / hoja. Por eso se ancla en la HOJA ("01/05"), que es
 * inconfundible, y se lee para arriba. Si el ancla no aparece, el número queda en null y el
 * importador lo dice: un resumen sin identidad no se puede deduplicar.
 */
export function parsearCabecera(lineas = []) {
  const L = lineas.map((l) => String(l ?? ''))
  const buscar = (re) => { for (const l of L) { const m = re.exec(l); if (m) return m } return null }

  const cierre = buscar(/CIERRE\s+(\d{1,2}\s+\w{3,10}\s+\d{2,4})/i)
  const vto = buscar(/VENCIMIENTO\s+(\d{1,2}\s+\w{3,10}\s+\d{2,4})/i)
  const cierreAnt = buscar(/Cierre\s*Ant\.?:\s*(\d{1,2}\s+\w{3,10}\s+\d{2,4})/i)
  const vtoAnt = buscar(/Vto\.?\s*Ant\.?:\s*(\d{1,2}\s+\w{3,10}\s+\d{2,4})/i)
  const proxCierre = buscar(/Prox\.?\s*Cierre:\s*(\d{1,2}\s+\w{3,10}\s+\d{2,4})/i)
  const proxVto = buscar(/Prox\.?\s*Vto\.?:\s*(\d{1,2}\s+\w{3,10}\s+\d{2,4})/i)
  const titular = buscar(/^AT:\s*(.+?)\s*$/m)

  let numero = null
  let cuentaTarjeta = null
  for (let i = 0; i < L.length; i++) {
    if (!/^\s*\d{2}\/\d{2}\s*$/.test(L[i])) continue
    const nro = (L[i - 1] ?? '').trim()
    const cta = (L[i - 3] ?? '').trim()
    if (/^\d{3,10}$/.test(nro)) numero = nro
    if (/^\d{6,14}$/.test(cta)) cuentaTarjeta = cta
    if (numero) break
  }

  const lim = (re) => { const m = buscar(re); return m ? importe(m[1]) : null }
  return {
    numero,
    cuentaTarjeta,
    titular: titular ? titular[1].trim() : null,
    cierre: cierre ? fechaLarga(cierre[1]) : null,
    vencimiento: vto ? fechaLarga(vto[1]) : null,
    cierreAnterior: cierreAnt ? fechaLarga(cierreAnt[1]) : null,
    vencimientoAnterior: vtoAnt ? fechaLarga(vtoAnt[1]) : null,
    proximoCierre: proxCierre ? fechaLarga(proxCierre[1]) : null,
    proximoVencimiento: proxVto ? fechaLarga(proxVto[1]) : null,
    limiteCompra: lim(/COMPRA\s+\$\s*([\d.,]+)/i),
    limiteCuotas: lim(/CUOTAS\s+\$\s*([\d.,]+)/i),
    limiteFinanciacion: lim(/FINANCIACION\s+\$\s*([\d.,]+)/i),
  }
}

/**
 * QUÉ ES CADA LÍNEA DEL DETALLE. PURA, y es la decisión que más caro sale equivocar.
 *
 * Un cargo leído como consumo infla el consumo y desaparece del cuadro de "qué me están cobrando",
 * que es una de las cinco preguntas del dueño. Por eso los cargos se reconocen por su texto exacto
 * —el que imprime el banco— y todo lo demás cae en `consumo`: lo que no se reconoce se ve, no se
 * reparte.
 */
export function clasificarLinea(desc = '') {
  const d = String(desc).trim().toUpperCase()
  if (/^SALDO ANTERIOR/.test(d)) return { tipo: 'saldo_anterior', concepto: null }
  if (/^SU PAGO/.test(d)) return { tipo: 'pago', concepto: null }
  if (/^IMPUESTO DE SELLOS\s+P\b/.test(d)) return { tipo: 'cargo', concepto: 'sellos_provinciales' }
  if (/^IMPUESTO DE SELLOS/.test(d)) return { tipo: 'cargo', concepto: 'sellos' }
  if (/^DB\.?\s*RG\s*5617/.test(d)) return { tipo: 'cargo', concepto: 'rg5617' }
  if (/^(DB\.?\s*)?PERCEP/.test(d)) return { tipo: 'cargo', concepto: 'percepcion' }
  if (/\bI\.?V\.?A\.?\b/.test(d)) return { tipo: 'cargo', concepto: 'iva' }
  if (/INTERES(ES)?\s+(POR\s+)?FINANCIA/.test(d)) return { tipo: 'cargo', concepto: 'interes_financiacion' }
  if (/PUNITORIO/.test(d)) return { tipo: 'cargo', concepto: 'punitorio' }
  if (/COMISION|CARGO ADMINISTRATIVO|MANTENIMIENTO DE CUENTA|RENOVACION ANUAL/.test(d)) return { tipo: 'cargo', concepto: 'comision' }
  if (/SEGURO/.test(d)) return { tipo: 'cargo', concepto: 'seguro' }
  return { tipo: 'consumo', concepto: null }
}

/** El plan de cuotas "C.08/18" → { cuota: 8, cuotas: 18 }. Sin plan, un pago. */
export function plan(desc = '') {
  const m = /C\.\s*(\d{1,2})\s*\/\s*(\d{1,2})/.exec(String(desc))
  return m ? { cuota: Number(m[1]), cuotas: Number(m[2]) } : { cuota: null, cuotas: null }
}

/**
 * EL DETALLE: consumos, cargos, el pago del período y el saldo anterior.
 *
 * El año y el mes se imprimen UNA sola vez por grupo y las líneas siguientes traen sólo el día
 * ("26 Agosto  05 …" y después "           05 …"). Se arrastra el último visto: sin eso, todas las
 * compras del grupo quedan sin fecha, y la fecha de compra es lo que después permite reconocer un
 * consumo recurrente.
 *
 * @returns {{movimientos:object[], totales:{pesos:number|null, dolares:number|null}, tarjeta:string|null, rechazos:object[]}}
 */
export function parsearDetalle(lineas = []) {
  const movimientos = []
  const rechazos = []
  let totales = { pesos: null, dolares: null }
  let tarjeta = null
  let anio = null
  let mes = null
  let orden = 0

  lineas.forEach((cruda, i) => {
    const l = String(cruda ?? '')
    if (!l.trim()) return
    if (/^_+\s*$/.test(l.trim())) return

    // La línea de totales del plástico arranca en la columna 0 y no es un movimiento: es el CONTROL
    // contra el que se suman los consumos. Se guarda aparte, nunca como una fila más.
    const tot = /^Tarjeta\s+(\S+)\s+Total\s+Consumos/i.exec(l)
    if (tot) {
      tarjeta = tot[1]
      totales = { pesos: importe(campo(l, COL.pesos)), dolares: importe(campo(l, COL.dolares)) }
      return
    }

    const desc = campo(l, COL.descripcion)
    const { tipo, concepto } = clasificarLinea(desc)
    if (tipo === 'saldo_anterior') {
      movimientos.push({
        orden: ++orden, tipo, concepto: null, fecha: null, comprobante: null, comercio: 'SALDO ANTERIOR',
        referencia: null, cuota: null, cuotas: null,
        pesos: importe(campo(l, COL.pesos)) ?? 0, dolares: importe(campo(l, COL.dolares)) ?? 0,
      })
      return
    }
    if (!tieneImporte(l)) return   // prosa legal, encabezados repetidos, renglones en blanco

    const a = campo(l, COL.anio)
    const m = campo(l, COL.mes)
    if (/^\d{2}$/.test(a) && mesAr(m)) { anio = anio4(a); mes = mesAr(m) }
    const d = campo(l, COL.dia)
    let fecha = null
    if (/^\d{1,2}$/.test(d) && anio && mes) fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`
    else if (/^\d{1,2}$/.test(d)) rechazos.push({ linea: i + 1, motivo: 'día sin mes: el grupo no declaró año/mes antes', texto: l.trim().slice(0, 70) })

    const esUsd = campo(l, COL.monedaUsd) === 'USD'
    const pes = importe(campo(l, COL.pesos))
    const dol = importe(campo(l, COL.dolares))
    // El pago del período trae el tipo de cambio con el que el banco convirtió el saldo en dólares:
    // "SU PAGO EN PESOS   1384.664,47 TC1520,000". Es el ÚNICO lugar del documento donde el TC
    // aparece declarado, y sin él la conciliación contra el banco no puede explicar por qué el
    // débito en pesos no coincide con el total en pesos del resumen.
    const tc = tipo === 'pago' ? tipoDeCambio(desc) : null
    // La base de la percepción RG 5617 verifica el consumo en dólares DESDE OTRA COLUMNA:
    // base / dólares = TC del cierre, y base × 30% = el importe percibido.
    const base = concepto === 'rg5617' ? importe(String((/\(\s*([\d.,]+)\s*\)/.exec(desc) || [])[1])) : null

    movimientos.push({
      orden: ++orden,
      tipo,
      concepto,
      fecha,
      comprobante: campo(l, COL.comprobante) || null,
      // Con referencia el banco recorta el comercio a 17 caracteres; sin ella, el comercio ocupa
      // todo el campo. Cortar siempre en 17 partiría "DLO*STARLINK ARGENTINA" al medio.
      // El comercio de un consumo en dólares vive en un campo más corto (el banco le hace lugar a la
      // referencia); el de un consumo en pesos ocupa todo el ancho y se le saca el plan de cuotas.
      // En un cargo o un pago no hay comercio: el rótulo termina en el primer doble espacio, y lo que
      // sigue ("30% (  815850,03 )", "1384.664,47 TC1520,000") ya se leyó en su propio campo.
      comercio: (esUsd ? campo(l, COL.comercioUsd)
        : tipo === 'consumo' ? desc.replace(/C\.\s*\d{1,2}\s*\/\s*\d{1,2}.*$/, '')
          : desc.replace(/\s{2,}.*$/, '')).trim() || null,
      referencia: esUsd ? campo(l, COL.refUsd) || null : null,
      ...plan(desc),
      pesos: pes ?? 0,
      dolares: dol ?? 0,
      ...(tc ? { tc } : {}),
      // LO QUE SALIÓ DE LA CUENTA no es lo que dice la columna de pesos: ahí va el CRÉDITO que el
      // pago aplicó al saldo en pesos ($1.090.924,47-). El débito real incluye el saldo en dólares
      // convertido al TC del día ($193,25 × 1.520 = $293.740) y sólo aparece escrito en la
      // descripción. Es el número que después se busca en el extracto del banco.
      ...(tipo === 'pago' ? { importePagado: importe(String((/([\d.]+,\d{2})/.exec(desc) || [])[1])) } : {}),
      ...(base ? { base } : {}),
    })
  })

  return { movimientos, totales, tarjeta, rechazos }
}

/**
 * LA TABLA "CUOTAS A VENCER" — lo único del resumen que habla del FUTURO.
 *
 * ═══ "A PARTIR DE MARZO/27 $1.421.653,32" NO ES UNA CUOTA MENSUAL: ES EL TOTAL ═══
 *
 * Es el renglón que miente si se lee rápido, y el error crece con cada mes que se proyecte. Acá se
 * guarda como lo que es (`cola.total`) y se DEDUCE en cuántas cuotas se reparte dividiendo por la
 * última cuota mensual publicada: si la división da exacta, la deducción se declara como CÁLCULO;
 * si no da exacta, queda en null y el importador lo dice. Nunca se reparte a ojo.
 */
export function parsearCuotasAVencer(lineas = []) {
  const L = lineas.map((l) => String(l ?? ''))
  const i0 = L.findIndex((l) => /Cuotas\s+a\s+vencer/i.test(l))
  if (i0 < 0) return { porMes: [], cola: null, total: 0, hallado: false }

  const ventana = L.slice(i0 + 1, i0 + 10)
  const reMes = /([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,12})\s*\/\s*(\d{2,4})/g
  const reImp = /\$\s*([\d.]+,\d{2})/g

  // ═══ SE EMPAREJA MES CON IMPORTE, Y NO SE TOMA "LA LÍNEA DE IMPORTES" A SECAS ═══
  //
  // La tabla son DOS renglones —los meses arriba, los importes abajo— y puede repetirse si el banco
  // publica más columnas de las que entran. Con "la primera línea con importes" alcanzaba hasta que
  // apareció la frase DEBITAREMOS a cinco renglones de distancia: también trae un "$" y un importe,
  // y pisaba la fila entera de cuotas con el total a debitar. Ahora un renglón de importes sólo
  // cuenta si viene DESPUÉS de uno de meses que todavía no se emparejó; cualquier otro se ignora.
  const porMes = []
  const cola = { desde: null, total: null, cuotas: null, cuota: null }
  let pendientes = []
  for (const l of ventana) {
    const ms = [...l.matchAll(reMes)]
    const is = [...l.matchAll(reImp)]
    if (/A\s+partir\s+de/i.test(l)) {
      if (ms.length) cola.desde = `${anio4(ms[0][2])}-${String(mesAr(ms[0][1])).padStart(2, '0')}-01`
      if (is.length) cola.total = importe(is[0][1])
      continue
    }
    if (ms.length && !is.length) { pendientes = ms.map((m) => ({ mes: mesAr(m[1]), anio: anio4(m[2]) })); continue }
    if (is.length && !ms.length && pendientes.length) {
      pendientes.forEach((m, i) => {
        if (is[i] && m.mes && m.anio) porMes.push({ mes: `${m.anio}-${String(m.mes).padStart(2, '0')}-01`, importe: importe(is[i][1]) })
      })
      pendientes = []
    }
  }

  // La deducción de en cuántas cuotas se reparte la cola. La única evidencia disponible es la última
  // cuota mensual publicada: si la cola es un múltiplo exacto de ella, son ésas. Un centavo de
  // diferencia y no se afirma nada.
  const ultima = porMes.length ? porMes[porMes.length - 1].importe : null
  if (cola.total && ultima) {
    const n = Math.round(cola.total / ultima)
    if (n >= 1 && Math.round(n * ultima * 100) === Math.round(cola.total * 100)) { cola.cuotas = n; cola.cuota = ultima }
  }

  const total = Math.round((porMes.reduce((s, m) => s + m.importe, 0) + (cola.total ?? 0)) * 100) / 100
  return { porMes, cola: cola.total ? cola : null, total, hallado: true }
}

/**
 * LA FRASE QUE CONVIERTE EL RESUMEN EN UNA OBLIGACIÓN CON FECHA CIERTA.
 *
 * "DEBITAREMOS DE SU C.C.00000000913836 LA SUMA DE $ 2208958,42 + U$S 544,99". Es la única cifra del
 * documento que sale de la cuenta corriente sola, sin que nadie la mande, y por eso es el titular de
 * la pestaña. Los dos importes van SEPARADOS: el de dólares se debita en dólares.
 */
export function parsearDebito(lineas = []) {
  for (const l of lineas) {
    const m = /DEBITAREMOS.*?C\.?C\.?\s*(\d+).*?SUMA\s+DE\s+\$\s*([\d.,]+)(?:\s*\+\s*U\$S\s*([\d.,]+))?/i.exec(String(l ?? ''))
    if (m) return { cuentaDebito: m[1], pesos: importe(m[2]), dolares: m[3] ? importe(m[3]) : 0 }
  }
  return { cuentaDebito: null, pesos: null, dolares: null }
}

/**
 * EL TALÓN DE LA ÚLTIMA HOJA: SALDO ACTUAL y PAGO MÍNIMO.
 *
 * ═══ POR QUÉ NO SE LEE POR RÓTULO ═══
 *
 * En el talón los rótulos y los números son bloques de texto separados: extraído, queda una lista de
 * números sueltos sin nada que diga cuál es cuál. Leer "el tercer número" sería una superstición.
 *
 * Se identifica POR LOS DOS ANCLAS QUE YA SE SABEN: el saldo actual en pesos y en dólares tienen que
 * ser exactamente los que declara la frase DEBITAREMOS. Si aparecen los dos, el número restante es
 * el pago mínimo y se declara verificado. Si no aparecen, NO se devuelve nada: un pago mínimo
 * inventado hace creer que se puede pagar menos de lo que hay que pagar, y la diferencia financia al
 * 6,411% mensual.
 */
export function parsearTalon(lineas = [], { pesos, dolares } = {}) {
  const numeros = lineas
    .map((l) => String(l ?? '').trim())
    .filter((t) => /^[\d.]+,\d{2}$/.test(t))
    .map((t) => importe(t))
  const cerca = (a, b) => a !== null && b !== null && Math.abs(a - b) < 0.005
  const iArs = numeros.findIndex((n) => cerca(n, pesos))
  const iUsd = numeros.findIndex((n, i) => i !== iArs && cerca(n, dolares))
  if (iArs < 0 || (dolares && iUsd < 0)) {
    return { pagoMinimo: null, saldoActual: null, verificado: false, motivo: 'el talón no repite el importe a debitar: no puedo afirmar cuál número es el pago mínimo' }
  }
  const resto = numeros.filter((_, i) => i !== iArs && i !== iUsd)
  if (resto.length !== 1) {
    return { pagoMinimo: null, saldoActual: { pesos, dolares }, verificado: false, motivo: `el talón trae ${resto.length} números además del saldo actual: no puedo afirmar cuál es el pago mínimo` }
  }
  return { pagoMinimo: resto[0], saldoActual: { pesos, dolares }, verificado: true, motivo: null }
}

/**
 * EL RESUMEN COMPLETO. Punto de entrada: recibe el texto de TODAS las hojas.
 *
 * @param {string} texto  lo que devuelve PyMuPDF, hoja por hoja, concatenado
 * @returns {{resumen:object, movimientos:object[], cuotas:object, rechazos:object[]}}
 */
export function parsearResumen(texto = '') {
  const lineas = String(texto).split('\n')
  const cab = parsearCabecera(lineas)
  const { movimientos, totales, tarjeta, rechazos } = parsearDetalle(lineas)
  const cuotas = parsearCuotasAVencer(lineas)
  const deb = parsearDebito(lineas)
  // El talón vive en la ÚLTIMA hoja. Se busca desde el último salto de página para no confundirlo
  // con las cajas vacías que las hojas 1 a 5 imprimen con el mismo rótulo.
  const iUltima = lineas.map((l, i) => (/^===\s*PAG|^\f/.test(l) ? i : -1)).filter((i) => i >= 0).pop() ?? 0
  const talon = parsearTalon(lineas.slice(iUltima), deb)

  const suma = (f) => Math.round(movimientos.filter(f).reduce((s, m) => s + m.pesos, 0) * 100) / 100
  const sumaUsd = (f) => Math.round(movimientos.filter(f).reduce((s, m) => s + m.dolares, 0) * 100) / 100
  const saldo = movimientos.find((m) => m.tipo === 'saldo_anterior')
  const pago = movimientos.find((m) => m.tipo === 'pago')

  return {
    resumen: {
      ...cab,
      tarjeta: tarjeta ? `Visa ${tarjeta}` : null,
      saldoAnteriorPesos: saldo?.pesos ?? null,
      saldoAnteriorDolares: saldo?.dolares ?? null,
      pagoAnterior: pago ? { fecha: pago.fecha, importe: pago.importePagado ?? null, tc: pago.tc ?? null, aplicadoPesos: pago.pesos, aplicadoDolares: pago.dolares } : null,
      // El total que publica el banco, no el que sumamos nosotros: la comparación entre los dos es
      // el control de que no se perdió ninguna línea al leer el PDF.
      consumosPesosDeclarado: totales.pesos,
      consumosDolaresDeclarado: totales.dolares,
      consumosPesos: suma((m) => m.tipo === 'consumo'),
      consumosDolares: sumaUsd((m) => m.tipo === 'consumo'),
      cargosPesos: suma((m) => m.tipo === 'cargo'),
      // CÁLCULO, no dato: ver `tcDeducido`. Es lo que después permite decidir si un débito en pesos
      // que no coincide con el total en pesos se explica por el saldo en dólares o es un hallazgo.
      tcCierre: tcDeducido(movimientos.find((m) => m.concepto === 'rg5617')?.base, sumaUsd((m) => m.tipo === 'consumo')),
      aDebitarPesos: deb.pesos,
      aDebitarDolares: deb.dolares,
      cuentaDebito: deb.cuentaDebito,
      pagoMinimo: talon.pagoMinimo,
      pagoMinimoVerificado: talon.verificado,
      pagoMinimoMotivo: talon.motivo,
    },
    movimientos,
    cuotas,
    rechazos,
  }
}
