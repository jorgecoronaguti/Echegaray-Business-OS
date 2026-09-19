// EL ESTADO DE CUENTA DE UN CLIENTE — EL DOCUMENTO TRANSCRIBE, NO CALCULA.
//
// ═══ POR QUÉ EXISTE (24/08/2026) ═══
//
// A Javier Sánchez se le venían mandando "Recibo N.pdf": un Excel a mano con precio, pagos y saldo
// por obra. Dieciséis versiones, ninguna atada a Cobranzas. El Recibo 16 (17/07) declaraba para
// Mampostería un saldo de $9.273.576 y Cobranzas cobró $8.758.810: $514.766 de diferencia que nadie
// vio porque los dos números vivían en archivos distintos. Ése es el defecto que este módulo cierra:
// el estado de cuenta sale de las mismas filas que mueven la caja, o no sale.
//
// ═══ LA REGLA QUE GOBIERNA CADA NÚMERO ═══
//
// Se TRANSCRIBE lo que una pestaña ya publica; no se vuelve a calcular. `OBRAS` cuadro 3 dice
// cuánto se contrató, cuánto se certificó y cuánto queda por cobrar por obra; `OBRAS` cuadro 2 lo
// dice por cliente; `Calendario de Cobros!A2` dice a cuánto se valúa el dólar hoy. El documento
// copia esos números con su celda de origen y agrega, como único aporte propio, el DETALLE fila por
// fila que el cliente puede auditar.
//
// ═══ EL ÚNICO CÁLCULO, Y ES UN CONTROL ═══
//
// `contratado − cobrado − por cobrar` por obra. Debería dar cero. Cuando no da, significa que hay
// plata del contrato que NO tiene fila con fecha en Cobranzas — y por lo tanto no está en ningún
// mes del Calendario, ni en el Cash Flow, ni en este documento. Al 24/08/2026 daba $17.553.946 en
// Pisos Industriales: el 36,9 % de esa obra, invisible en los tres lugares donde se la mira.
//
// POR ESO ESE CÁLCULO NO ES UN DATO MÁS SINO UN FRENO: mientras `controles` devuelva algo, el
// documento se imprime con una banda de CONTROL INTERNO que dice que no se envíe. Un estado de
// cuenta con un saldo que la propia empresa no cerró es peor que no mandar ninguno — el cliente lo
// lee como el saldo total y esa lectura después hay que discutirla.
//
// ═══ QUÉ NO HACE ═══
//
// No escribe en el Sheet, no decide si un saldo se cobra o se perdona, y no manda nada. Prepara un
// documento que firma Dirección.

import { clienteCanonico } from './libro-clientes.mjs'
import { fechaDeSerial, serialDe } from './libro-extractores-fechas.mjs'
import { contratoDeclarado, cotizacionDeObra } from './estado-de-cuenta-contratos.mjs'

/** Las columnas de `Cobranzas` que lee el documento, en índice 0 y con su letra para citarla. */
// LA COLUMNA W ("Notas") NO ESTÁ ACÁ A PROPÓSITO. Guarda notas internas —"precio pactado
// $40.000.000 (cotización 21/07 $42.876.310) — confirmado por Dirección 24/08"— que son para el
// OS, no para el cliente. Imprimirla convertiría un precio pactado en un descuento a explicar.
export const COL = Object.freeze({
  fechaEmision: 2, tipoComprobante: 3, comprobante: 4, cliente: 6, ordenCompra: 7, concepto: 8,
  neto: 9, iva: 10, retenciones: 11, total: 12, forma: 13, estado: 14, fechaCobro: 16, moneda: 26,
})
/** La letra de cada columna, para que el PDF pueda decir de dónde salió cada renglón. */
export const LETRA = Object.freeze({
  fechaEmision: 'C', comprobante: 'E', cliente: 'G', ordenCompra: 'H', concepto: 'I', neto: 'J',
  iva: 'K', total: 'M', forma: 'N', estado: 'O', fechaCobro: 'Q', moneda: 'AA',
})

/** Primera fila con datos de `Cobranzas` (las 4 de arriba son título y encabezado). */
export const INICIO = 5
/** Los estados que significan "la plata todavía no entró" — los mismos de `cobranzas-por-cliente`. */
export const NO_COBRADO = Object.freeze(['Facturado', 'Pendiente', 'Proyectado'])

const txt = (v) => String(v ?? '').trim()
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** NÚCLEO PURO: pesos como los lee el dueño — "$ 1.234.567". Sin centavos: el documento decide, no concilia. */
export const pesos = (n) => `$ ${Math.round(num(n)).toLocaleString('es-AR')}`

/** NÚCLEO PURO: dólares — "U$S 3.500". */
export const dolares = (n) => `U$S ${Math.round(num(n)).toLocaleString('es-AR')}`

/** NÚCLEO PURO: serial de Sheets → "DD/MM/AAAA". Vacío si no hay fecha: nunca una fecha inventada. */
export function fechaAR(serial) {
  if (!Number.isFinite(Number(serial)) || Number(serial) <= 0) return ''
  const d = fechaDeSerial(Number(serial))
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

/** NÚCLEO PURO: "AAAA-MM-DD" → serial de Sheets. Es como entra `--corte` por la línea de comandos. */
export function serialDeISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(iso))
  return m ? serialDe(Number(m[1]), Number(m[2]), Number(m[3])) : null
}

/**
 * NÚCLEO PURO: un importe como lo ESCRIBE la pestaña ("$47.590.272", "—", "($20.000.000)") a número.
 *
 * El paréntesis es negativo (así publica OBRAS "falta certificar" cuando sobra certificación) y el
 * guion largo es cero. Un texto que no es número devuelve null y NO cero: cero es una afirmación
 * ("no debe nada") y no puede salir de un renglón que no se supo leer.
 */
export function montoAR(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const s = txt(valor)
  if (!s || s === '—' || s === '-') return 0
  const neg = /^\(.*\)$/.test(s)
  const limpio = s.replace(/[()$\s▲]/g, '').replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null
  return (neg ? -1 : 1) * Math.abs(Number(limpio))
}

/** NÚCLEO PURO: las filas de `Cobranzas` de un cliente canónico — incluye TODOS sus alias. */
export const filasDelCliente = (filas, canonico) =>
  (filas ?? []).filter((f) => clienteCanonico(txt(f?.[COL.cliente])) === canonico)

/** El concepto legible de una fila: el de la columna I, y si está vacía el rótulo de la H. */
const conceptoDe = (f) => txt(f[COL.concepto]) || txt(f[COL.ordenCompra]) || '—'

/**
 * ¿La fecha de cobro de esta fila es una ESTIMACIÓN y no una fecha acordada?
 *
 * Lo declara la propia fila en su concepto ("… · fecha estimada 15/09, confirmar"). Se lee de ahí y
 * no de una lista aparte: quien carga la fila es quien sabe si la fecha está acordada, y si mañana
 * la confirma le saca esas dos palabras y el documento deja de decir "estimada" solo. Un
 * vencimiento estimado impreso como acordado es una promesa que el cliente después reclama.
 */
export const esFechaEstimada = (f) => /fecha\s+estimada/i.test(txt(f?.[COL.concepto]))

/**
 * EL TIPO DE CAMBIO CON EL QUE SE CERRÓ CADA COMPROBANTE, declarado por sus propias filas.
 *
 * ═══ POR QUÉ NO SE REVALÚA UN COBRO YA HECHO ═══
 *
 * La FA 220 se cobró en dos partes: U$S 15.400 en billete y U$S 4.600 en pesos. Cobranzas guarda la
 * primera EN DÓLARES (columna AA = USD) y la segunda en pesos, con el tipo de cambio escrito en el
 * concepto: "parte U$S 4.600 = $ 7.130.000 a TC 1.550". A ese dólar se emitió la factura y a ese
 * dólar el cliente la pagó: la cuenta corriente de esa factura está SALDADA y no se mueve más.
 *
 * Los cuadros que agregan cartera (OBRAS, Calendario) revalúan ese cobro al dólar del día porque
 * miden cuánto vale hoy lo que entró — está bien para la cartera y está MAL para un estado de
 * cuenta: le diría al cliente que su factura pagada cambia de importe todos los días. Decisión del
 * dueño, 24/08/2026.
 *
 * El TC sale del concepto de CUALQUIER fila del mismo comprobante, y no de una tabla aparte: la
 * factura es una sola operación aunque Cobranzas la parta en dos renglones.
 *
 * @returns {Map<string, number>} comprobante → tipo de cambio declarado
 */
export function tcPorComprobante(filas) {
  const mapa = new Map()
  for (const f of filas ?? []) {
    const comp = comprobanteDe(f)
    if (!comp || mapa.has(comp)) continue
    const m = /\ba\s*TC\s*([\d.]+(?:,\d+)?)/i.exec(txt(f[COL.concepto]))
    const tc = m ? montoAR(m[1]) : null
    if (Number.isFinite(tc) && tc > 0) mapa.set(comp, tc)
  }
  return mapa
}

/** El comprobante citable: "FA 219" cuando hay tipo y número; sólo el número, o vacío. */
const comprobanteDe = (f) => [txt(f[COL.tipoComprobante]), txt(f[COL.comprobante])].filter(Boolean).join(' ')

/**
 * NÚCLEO PURO: los cobros del período — estado "Cobrado" y fecha de cobro dentro de la ventana.
 *
 * EL ESTADO MANDA, NO LA FECHA. `cobranzas-por-cliente.mjs` ya pagó ese error: una proyección
 * también tiene fecha en Q, y contarla como cobrada hizo que un cuadro de deuda publicara $0 con
 * $76M sin cobrar. Acá pasaría lo mismo al revés: le mostraríamos al cliente como pagado algo que
 * no pagó.
 */
export function movimientosCobrados(filas, { desde, hasta }) {
  const tcs = tcPorComprobante(filas)
  return (filas ?? [])
    .filter((f) => txt(f[COL.estado]) === 'Cobrado')
    .filter((f) => {
      const q = num(f[COL.fechaCobro])
      return q >= desde && q <= hasta
    })
    .map((f) => {
      const comprobante = comprobanteDe(f)
      const moneda = txt(f[COL.moneda]) || 'ARS'
      const tcFactura = moneda === 'USD' ? (tcs.get(comprobante) ?? null) : null
      return {
        fechaCobro: num(f[COL.fechaCobro]),
        comprobante,
        concepto: conceptoDe(f),
        forma: txt(f[COL.forma]),
        neto: num(f[COL.neto]),
        iva: num(f[COL.iva]),
        total: num(f[COL.total]),
        moneda,
        tcFactura,
        // El equivalente en pesos AL TC DE LA FACTURA. Null cuando la fila está en dólares y ninguna
        // fila del comprobante declara el TC: preferimos mostrar sólo los dólares antes que elegir
        // un dólar por nuestra cuenta y publicar un peso que nadie pactó.
        pesosAlTcFactura: moneda === 'USD' ? (tcFactura ? num(f[COL.total]) * tcFactura : null) : num(f[COL.total]),
      }
    })
    .sort((a, b) => a.fechaCobro - b.fechaCobro)
}

/**
 * NÚCLEO PURO: los vencimientos que quedan — lo no cobrado, ordenado por fecha de cobro.
 *
 * Se incluyen también los de fecha ANTERIOR al corte: eso es deuda vencida y es justamente lo que
 * un estado de cuenta tiene que mostrar. `CANCELAR` queda afuera porque la pestaña lo usa para
 * anular una fila, no para postergarla.
 */
export function vencimientosPendientes(filas, { hasta } = {}) {
  return (filas ?? [])
    .filter((f) => NO_COBRADO.includes(txt(f[COL.estado])))
    .filter((f) => num(f[COL.total]) !== 0 || num(f[COL.neto]) !== 0)
    .map((f) => ({
      fechaCobro: num(f[COL.fechaCobro]),
      concepto: conceptoDe(f),
      rotulo: txt(f[COL.ordenCompra]),
      forma: txt(f[COL.forma]),
      neto: num(f[COL.neto]),
      iva: num(f[COL.iva]),
      total: num(f[COL.total]),
      moneda: txt(f[COL.moneda]) || 'ARS',
      fechaEstimada: esFechaEstimada(f),
      vencido: Number.isFinite(hasta) && num(f[COL.fechaCobro]) > 0 && num(f[COL.fechaCobro]) < hasta,
    }))
    .sort((a, b) => a.fechaCobro - b.fechaCobro)
}

/** Las bandas del aging, con el mismo corte y los mismos rótulos que publica `OBRAS` cuadro 1. */
export const BANDAS = Object.freeze(['Por vencer', '1–30', '31–60', '61–90', '+90'])

/**
 * NÚCLEO PURO: el aging del saldo — en qué banda cae cada vencimiento respecto del corte.
 *
 * Sin fecha de cobro no hay banda posible: esa plata va a `sinFecha` y se ve, en vez de caer en
 * "Por vencer" y hacer creer que está programada.
 */
export function aging(vencimientos, corte) {
  const bandas = Object.fromEntries(BANDAS.map((b) => [b, 0]))
  let sinFecha = 0
  for (const v of vencimientos ?? []) {
    if (!v.fechaCobro) { sinFecha += v.total; continue }
    const dias = corte - v.fechaCobro
    if (dias <= 0) bandas['Por vencer'] += v.total
    else if (dias <= 30) bandas['1–30'] += v.total
    else if (dias <= 60) bandas['31–60'] += v.total
    else if (dias <= 90) bandas['61–90'] += v.total
    else bandas['+90'] += v.total
  }
  const vencido = bandas['1–30'] + bandas['31–60'] + bandas['61–90'] + bandas['+90']
  return { bandas, sinFecha, vencido, total: bandas['Por vencer'] + vencido + sinFecha }
}

const CABECERA_CUADRO2 = ['Cliente', '% cob.', 'Venta (neto)']
const CABECERA_CUADRO3 = ['Obra', '% cert.', 'Certificado (neto)']
const RE_OBRA = /^(\d+\.\d+)\s*·\s*(.+?)\s+—\s+(.+)$/

/** ¿Esta fila es la cabecera de un cuadro de OBRAS? Se busca por sus tres primeras celdas. */
const esCabecera = (cab) => (f) => cab.every((c, i) => txt(f?.[i]) === c)

/**
 * Las filas de un cuadro: desde su cabecera hasta el "⇒ TOTAL" que lo cierra.
 *
 * LOS CUADROS DE OBRAS SE PARECEN ENTRE SÍ Y ÉSE ES EL PELIGRO. El cuadro 3 numera sus obras
 * "3.1 · San Francisco — PISOS INDUSTRIALES" y el cuadro 4 —que es de COSTOS, no de cobranzas—
 * numera las suyas "4.7 · Quattropani … — SALONES COMERCIALES", con la misma forma exacta. Un
 * lector que busque el patrón en toda la pestaña se lleva las dos y le suma a un cliente una obra
 * que no existe, con importes que son costos. Por eso se entra por la CABECERA y se sale en el
 * total: el cuadro define su propio borde.
 */
function filasDelCuadro(filas, cabecera) {
  const i = (filas ?? []).findIndex(esCabecera(cabecera))
  if (i < 0) return []
  const salida = []
  for (let k = i + 1; k < filas.length; k++) {
    const a = txt(filas[k]?.[0])
    if (a.startsWith('⇒')) break
    if (a) salida.push({ fila: k + 1, valores: filas[k] })
  }
  return salida
}

/**
 * NÚCLEO PURO: la fila del cliente en `OBRAS` cuadro 2 ("OBRAS DEL AÑO"), transcripta.
 *
 * Devuelve null si el cliente no está en el cuadro. Eso NO es cero: es "la pestaña no lo publica",
 * y el documento tiene que decirlo así.
 */
export function carteraDeCuadro2(filasObras, canonico) {
  for (const { fila, valores: f } of filasDelCuadro(filasObras, CABECERA_CUADRO2)) {
    if (clienteCanonico(txt(f[0])) !== canonico) continue
    return {
      fila,
      porcentajeCobrado: txt(f[1]),
      ventaNeto: montoAR(f[2]),
      cobradoTotal: montoAR(f[3]),
      resta: montoAR(f[4]),
      vencido: montoAR(f[5]),
      materialesNeto: montoAR(f[6]),
      retenido: montoAR(f[7]),
    }
  }
  return null
}

/**
 * NÚCLEO PURO: las obras del cliente en `OBRAS` cuadro 3, transcriptas una por una.
 *
 * El rótulo trae obra y plazo pegados ("PISOS INDUSTRIALES · 05/08 → 30/09"): se parten para
 * imprimirlos separados, pero el rótulo COMPLETO viaja igual porque es la clave con la que
 * `cotizacionDeObra` engancha el documento de Drive.
 */
export function obrasDeCuadro3(filasObras, canonico) {
  const salida = []
  for (const { fila, valores: f } of filasDelCuadro(filasObras, CABECERA_CUADRO3)) {
    const m = RE_OBRA.exec(txt(f[0]))
    if (!m || clienteCanonico(m[2]) !== canonico) continue
    const [nombre, plazo] = m[3].split('·').map((s) => txt(s))
    salida.push({
      fila,
      id: m[1],
      rotulo: txt(f[0]),
      nombre: nombre.replace(/\s*▲$/, '').trim(),
      plazo: txt(plazo).replace(/\s*▲$/, '').trim(),
      porcentajeCertificado: txt(f[1]),
      certificado: montoAR(f[2]),
      cobrado: montoAR(f[3]),
      porCobrar: montoAR(f[4]),
      vencido: montoAR(f[5]),
      contratado: montoAR(f[6]),
      faltaCertificar: montoAR(f[7]),
      proximoCobro: txt(f[8]),
    })
  }
  return salida
}

/**
 * NÚCLEO PURO: el tipo de cambio que declara `Calendario de Cobros!A2`.
 *
 * La celda es una frase ("… · USD valuado a $ 1.509,43500"). Se saca el número de ahí en vez de
 * pedirlo por parámetro para que el documento y el Calendario no puedan discrepar: si mañana el
 * Calendario valúa a otro dólar, este documento cambia solo.
 */
export function tcDelCalendario(textoA2) {
  const m = /USD\s+valuado\s+a\s*\$?\s*([\d.]+,\d+|\d+)/i.exec(txt(textoA2))
  return m ? montoAR(m[1]) : null
}

/** Cuánto del contrato representa cada certificación pendiente, según el rótulo de la propia fila. */
const RE_FRACCION = /Resto\s+(\d+(?:[.,]\d+)?)\s*%/i
const RE_CUOTAS = /(\d+)\s*\/\s*(\d+)\s*$/

/**
 * NÚCLEO PURO: la equivalencia en dólares de cada certificación de un contrato en USD.
 *
 * NADA DE ESTO SE INVENTA: el porcentaje del saldo y la cantidad de cuotas salen del rótulo que la
 * propia fila escribe ("Resto 50 % s/ contrato 97.650.000 — certificación quincenal 1/9"), y el
 * total en dólares del contrato declarado. Si falta cualquiera de los tres, devuelve null y el
 * documento no muestra equivalencia — que es lo correcto: una equivalencia mal armada en un
 * documento al cliente es una discusión de plata, no un renglón de más.
 *
 * `tcImplicito` es el dólar al que se cargaron las filas (contrato en pesos ÷ contrato en USD). Se
 * publica porque explica por qué el peso de hoy no coincide con el peso de la fila.
 */
export function equivalenciaUsd({ usdTotal, contratadoPesos, vencimientos }) {
  if (!Number.isFinite(usdTotal) || usdTotal <= 0) return null
  const conRotulo = (vencimientos ?? []).filter((v) => RE_FRACCION.test(v.rotulo) && RE_CUOTAS.test(v.rotulo))
  if (conRotulo.length === 0) return null
  const fraccion = montoAR(RE_FRACCION.exec(conRotulo[0].rotulo)[1]) / 100
  const cuotas = Number(RE_CUOTAS.exec(conRotulo[0].rotulo)[2])
  if (!Number.isFinite(fraccion) || !Number.isFinite(cuotas) || cuotas <= 0) return null
  return {
    usdTotal,
    fraccionSaldo: fraccion,
    cuotas,
    usdPorCuota: (usdTotal * fraccion) / cuotas,
    usdSaldo: usdTotal * fraccion * (conRotulo.length / cuotas),
    tcImplicito: Number.isFinite(contratadoPesos) && contratadoPesos > 0 ? contratadoPesos / usdTotal : null,
  }
}

/**
 * NÚCLEO PURO: PLATA DEL CONTRATO QUE NO TIENE FECHA DE COBRO EN NINGUNA FILA.
 *
 * `OBRAS` cuadro 3 publica las tres cosas: cuánto se contrató, cuánto entró y cuánto está
 * programado. Si contratado > cobrado + por cobrar, hay plata del contrato que no está en ningún
 * mes del Calendario, ni en el Cash Flow, ni en este documento. Es lo que pasaba el 24/08/2026 con
 * Pisos Industriales: $17.553.946, el 36,9 % de la obra, invisible en los tres lugares.
 *
 * ═══ POR QUÉ LA PRUEBA ES DE UNA SOLA COLA ═══
 *
 * `Contratado` es NETO y de mano de obra; `Cobrado` y `Por cobrar` son TOTALES con IVA y pueden
 * incluir conceptos que no son el contrato — el fondo de materiales del Anexo II de Quattropani son
 * $44,1M que entran por Cobranzas y no pertenecen a los U$S 63.000. Por eso un EXCEDENTE no prueba
 * nada y no se reporta: sería un aviso permanente que enseña a ignorar la banda.
 *
 * Un FALTANTE, en cambio, es concluyente en cualquier dirección que se lo mire: ningún concepto de
 * más y ningún IVA pueden hacer que la suma quede POR DEBAJO del contrato neto. Si falta, falta.
 */
export function faltanteDeContrato(obra, tolerancia = 1) {
  const { contratado, cobrado, porCobrar } = obra ?? {}
  if (![contratado, cobrado, porCobrar].every(Number.isFinite)) return null
  const falta = contratado - cobrado - porCobrar
  return falta > tolerancia ? falta : null
}

/**
 * NÚCLEO PURO: LOS CONTROLES QUE FRENAN EL ENVÍO.
 *
 * Los tres comparan el DETALLE que el documento imprime contra el TOTAL que publica otra pestaña.
 * Un control que se valida contra la misma información que produce no controla nada: acá el detalle
 * sale de `Cobranzas` fila por fila y el total sale de `OBRAS`, que lo arma por su cuenta.
 *
 * El tercero es el que vigila el dólar. `Cobranzas` guarda una cobranza en USD (los U$S 15.400 en
 * billete del anticipo de Quattropani) y `OBRAS` la publica revaluada al tipo de cambio del
 * `Calendario`. Si el documento sumara los 15.400 como si fueran pesos —o usara otro dólar— la
 * diferencia sería de $23 millones y no habría ningún error a la vista.
 *
 * `tolerancia` absorbe el redondeo del propio Sheet (centavos), no una diferencia real.
 */
export function controles({ obras, vencimientos, movimientos, cartera, tipoCambio, tolerancia = 5 }) {
  const avisos = []
  for (const o of obras ?? []) {
    const falta = faltanteDeContrato(o, tolerancia)
    if (falta === null) continue
    avisos.push(`${o.nombre}: el contrato declara ${pesos(o.contratado)} y entre cobrado y `
      + `programado hay ${pesos(o.cobrado + o.porCobrar)} — faltan ${pesos(falta)} sin fila con `
      + `fecha de cobro (OBRAS fila ${o.fila}).`)
  }
  const suma = (vencimientos ?? []).reduce((a, v) => a + v.total, 0)
  if (cartera && Number.isFinite(cartera.resta) && Math.abs(cartera.resta - suma) > tolerancia) {
    avisos.push(`El detalle de vencimientos suma ${pesos(suma)} y OBRAS cuadro 2 publica `
      + `${pesos(cartera.resta)} de resta (fila ${cartera.fila}).`)
  }
  const enUsd = (movimientos ?? []).filter((m) => m.moneda === 'USD')
  const cobrado = (movimientos ?? []).reduce(
    (a, m) => a + (m.moneda === 'USD' ? m.total * (tipoCambio ?? NaN) : m.total), 0)
  // UN PESO DE DERIVA POR CADA DÓLAR EN CARTERA. `OBRAS` y `Calendario!A2` se leen con dos pedidos
  // distintos y el Sheet recalcula entre uno y otro: si el dólar se movió un centavo, la resta da
  // distinto sin que falte ninguna fila. Se tolera hasta $1 de movimiento del dólar — con eso, un
  // TC equivocado (1.550 contra 1.509 son $628.535) y una fila faltante (la más chica es $1,9M)
  // siguen cayendo del lado del aviso.
  const derivaAdmitida = enUsd.reduce((a, m) => a + Math.abs(m.total), 0)
  if (cartera && Number.isFinite(cartera.cobradoTotal) && Number.isFinite(cobrado)
      && Math.abs(cartera.cobradoTotal - cobrado) > tolerancia + derivaAdmitida) {
    // El dólar sólo se nombra si hay algo en dólares: si no, "valuando el USD a $ 0" manda a buscar
    // un problema cambiario donde lo que falta es una fila.
    const conQueDolar = enUsd.length > 0 ? ` —valuando el USD a ${pesos(tipoCambio)}—` : ''
    avisos.push(`El detalle de cobros suma ${pesos(cobrado)}${conQueDolar} y OBRAS cuadro 2 `
      + `publica ${pesos(cartera.cobradoTotal)} (fila ${cartera.fila}).`)
  }
  return avisos
}

/**
 * NÚCLEO PURO: el modelo completo del documento. Todo lo de arriba, en un objeto que el renderer
 * imprime sin decidir nada.
 *
 * @param {object} e
 * @param {string} e.cliente nombre canónico
 * @param {number} e.corte serial del día de corte
 * @param {any[][]} e.filasCobranzas la pestaña `Cobranzas` entera, sin filtrar
 * @param {any[][]} e.filasObras la pestaña `OBRAS` entera
 * @param {string} e.calendarioA2 la celda A2 del `Calendario de Cobros`
 * @param {object} e.identidad CUIT/domicilio del cliente y su fuente
 * @param {object} e.cuenta la cuenta bancaria para transferencias
 */
export function armarEstadoDeCuenta({
  cliente, corte, filasCobranzas, filasObras, calendarioA2, identidad = {}, cuenta = {}, desde,
}) {
  const propias = filasDelCliente(filasCobranzas, cliente)
  // EL PERÍODO ES EL AÑO DEL CORTE, no "todo lo que haya": es la misma ventana que declara OBRAS
  // ("OBRAS DEL AÑO", "⇒ TOTAL 2026") y el Calendario, y por eso los totales cierran contra ellos.
  const inicioAnio = desde ?? serialDe(fechaDeSerial(corte).getUTCFullYear(), 1, 1)
  const movimientos = movimientosCobrados(propias, { desde: inicioAnio, hasta: corte })
  const vencs = vencimientosPendientes(propias, { hasta: corte })
  const obras = obrasDeCuadro3(filasObras, cliente)
  const cartera = carteraDeCuadro2(filasObras, cliente)
  const contrato = contratoDeclarado(cliente)
  return {
    cliente,
    identidad,
    corte,
    periodo: { desde: inicioAnio, hasta: corte },
    contrato,
    obras: obras.map((o) => ({ ...o, cotizacion: cotizacionDeObra(contrato, o.rotulo) })),
    cartera,
    movimientos,
    // EL TOTAL QUE LEE EL CLIENTE ES LO QUE PAGÓ, al dólar de su factura — no al de hoy. Lo que no
    // se pudo valuar (dólares sin TC declarado) se informa aparte, nunca sumado como si fuera cero.
    cobradoDelPeriodo: movimientos.reduce((a, m) => a + (m.pesosAlTcFactura ?? 0), 0),
    cobradoSinValuar: movimientos
      .filter((m) => m.pesosAlTcFactura === null)
      .reduce((a, m) => a + m.total, 0),
    vencimientos: vencs,
    aging: aging(vencs, corte),
    tipoCambio: { valor: tcDelCalendario(calendarioA2), fuente: 'Calendario de Cobros!A2' },
    equivalencia: equivalenciaUsd({
      usdTotal: contrato.usdTotal,
      contratadoPesos: obras.reduce((a, o) => a + (o.contratado ?? 0), 0),
      vencimientos: vencs,
    }),
    cuenta,
    // EL CONTROL USA EL DÓLAR DEL CALENDARIO Y EL DOCUMENTO EL DE LA FACTURA, a propósito: el
    // control pregunta "¿están todas las filas?" contra un cuadro que revalúa, y el documento
    // pregunta "¿cuánto pagó el cliente?" contra la factura que firmó. Son dos preguntas distintas
    // y mezclarlas hace que una de las dos mienta.
    controles: controles({
      obras, vencimientos: vencs, movimientos, cartera, tipoCambio: tcDelCalendario(calendarioA2),
    }),
  }
}
