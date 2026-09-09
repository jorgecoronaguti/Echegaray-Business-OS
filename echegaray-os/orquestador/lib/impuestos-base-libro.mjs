// LA BASE DEL IVA PROYECTADO, EN FÓRMULAS SOBRE EL LIBRO.
//
// ═══ POR QUÉ NO APUNTA AL CASH FLOW (05/08/2026) ═══
//
// Las celdas del IVA proyectado apuntaban por POSICIÓN al Cash Flow Mensual. El rediseño por bloques
// puso otra cosa en esas coordenadas y la fórmula habría leído el egreso proyectado de enero como
// débito fiscal — sin un solo error. La base se calcula sobre `_MOVIMIENTOS`, la fuente única que
// alimenta las vistas.
//
// ═══ Y POR QUÉ EL DÉBITO PREGUNTA SI HAY FACTURA (03/09/2026) ═══
//
// El dueño: «las proyecciones de IVA están tomando de manera exagerada; lo indicado con B en
// cobranzas es lo que tiene que considerar siempre». El débito sumaba TODO cobro de rubro Cobranzas
// sin mirar si llevaba factura, y las 33 filas `N` —$284.773.901, IVA cero en las treinta y tres—
// entraban como si devengaran.

import { terminoLibro } from './libro-sumas.mjs'

/** Los cuatro rubros del libro que dan crédito fiscal: compras con factura. */
export const RUBROS_CREDITO_LIBRO = ['Materiales Civil', 'Materiales Mantenimiento', 'Estructura', 'Servicios recurrentes']

/** La ventana de un mes, en expresiones de fecha del Sheet. Fin EXCLUIDO, como en todo el repo. */
export const ventanaDelMes = (anio, m) => ({ desde: `DATE(${anio};${m};1)`, hasta: `EOMONTH(DATE(${anio};${m};1);0)+1` })

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// «LAS VENTAS DEL MES» — UNA SOLA DEFINICIÓN, DOS BLOQUES
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL DEFECTO QUE ESTO CIERRA (04/09/2026) ═══
//
// La pestaña afirmaba DOS COSAS DISTINTAS sobre los mismos meses. El bloque de IVA decía que en
// septiembre se vendieron $71.149.689 (facturas emitidas, devengado) y el de Ingresos Brutos, tres
// filas más abajo, $183.717.604 (cobranzas del Libro, percibido). En noviembre uno decía CERO ventas
// y el otro $20.405.671. Dos definiciones del mismo concepto, a la vista, en la misma pantalla.
//
// LA BASE DE LOS DOS IMPUESTOS ES LA MISMA Y SALE DE COBRANZAS: categoría `B`, por mes de emisión de
// la factura (columna P), neto en J e IVA en K. Es la orden permanente del dueño —«lo indicado con B
// en cobranzas es lo que tiene que considerar SIEMPRE»— y es el criterio devengado que la propia DDJJ
// usa. MEDIDO el 04/09/2026 contra las siete DDJJ de Rentas ya presentadas (`_IIBB_RAW`): la base
// declarada de enero a julio suma $260.978.437, la facturación del mismo período $266.151.642 y las
// cobranzas $421.371.359. La base declarada es facturación, no cobranza: proyectar sobre cobranzas
// la inflaba un 62%.
//
// POR QUÉ NO SE DERIVA CON ×alícuota/(1+alícuota). Cobranzas ya escribe el IVA de cada factura en su
// columna K. Derivarlo lo volvería a convertir, y aplicarle el factor a un importe **neto de
// retenciones** —que es lo que hacía— mezcla caja con base imponible.
//
// Y VA POR FECHA DE EMISIÓN, no de cobro. El IVA débito se devenga cuando se emite la factura —regla
// de oro 4, P&L devengado— y así es como se arma la DDJJ. Tomarlo por mes de cobro corría la plata a
// otro período: septiembre mostraba **$15.139.582 a pagar cuando el propio bloque de control de la
// pestaña decía $452.447**, porque en septiembre se cobran facturas emitidas meses antes.
//
// Las filas `N` no entran nunca: no llevan factura, su columna K está vacía en las treinta y tres, y
// un cobro sin factura no devenga IVA. La plata sigue entera en la caja; lo que no existe es su IVA.
//
// Rangos ABIERTOS y lectura VIVA: si el dueño corrige una categoría o carga una factura, el número se
// rehace solo al abrir la planilla, sin correr ningún generador.

/** Las columnas de Cobranzas que DEFINEN una venta. Una sola vez acá: dos bloques las consumen. */
export const VENTA = Object.freeze({
  categoria: 'Cobranzas!$B$5:$B',
  comprobante: 'Cobranzas!$E$5:$E', // «N° Comprobante» — vacío = la factura todavía no se emitió
  fecha: 'Cobranzas!$P$5:$P', // «Fecha de Factura» — NO la C, que es «Fecha de Venta»
  cobro: 'Cobranzas!$Q$5:$Q', // «Fecha cobro» — el mes al que se corre una factura B vencida y no emitida
  neto: 'Cobranzas!$J$5:$J',
  iva: 'Cobranzas!$K$5:$K',
})

/** Índices dentro de `Cobranzas!A5:Q`, el mismo contrato que `VENTA` pero para el núcleo puro. */
const IDX = Object.freeze({ categoria: 1, comprobante: 4, neto: 9, iva: 10, fecha: 15, cobro: 16 })

// ═══ «REVISAR BIEN LAS FECHAS DE FACTURA CON B, PARA LO QUE PASÓ Y PARA LO FUTURO» (09/09/2026) ═══
//
// MEDIDO el 09/09 contra ARCA (las 63 filas B de Cobranzas): la «Fecha de Factura» no es confiable
// en ninguna de las dos direcciones. Hacia atrás, siete facturas de ARCOR de enero–marzo figuran en
// Cobranzas con fecha de abril–mayo, y trece filas cobradas no tienen número de comprobante aunque su
// factura existe en ARCA (1-213, 1-214, 1-215, 1-219, 1-220, 1-53). Hacia adelante, las nueve
// certificaciones de Quattropani (filas 78–86) llevan TODAS «18/08» como fecha de factura y ninguna
// está emitida: sus cobros van quincenales del 11/09 al 30/12. Sumarlas en agosto ponía $10,9M de
// débito en un mes cuya DDJJ va a decir $7,2M.
//
// LA REGLA, dicha por el dueño: *«lo que aparece en AfipSDK, que tiene que ser como lo facturado en
// B de Cobranzas»* para lo que pasó, y *«lo que se va a facturar es lo que Cobranzas indica con B»*
// para lo futuro. En fórmula:
//
//   · mes CERRADO (anterior al de hoy): sólo las B EMITIDAS (con N° de comprobante) por «Fecha de
//     Factura». Es la misma población que ARCA; si difieren, lo dice el control `cobranzas-vs-arca`.
//   · mes EN CURSO y FUTUROS: las B por «Fecha de Factura» —emitidas o no: es el plan—, MÁS las B
//     sin comprobante cuya fecha de factura ya venció, corridas al mes de su «Fecha cobro» (una
//     factura no se cobra antes de emitirse: es la cota más tardía, con el dato del propio dueño).
//     Si la fecha de cobro también venció, caen en el mes en curso.
//
// Sin `hoy` no hay «mes cerrado»: la función exige la fecha para no decidir con new Date().

/** Primer día del mes de `hoy` (ISO) como expresión del Sheet, y su índice de mes. */
const mesEnCursoDe = (hoy) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(hoy ?? ''))
  if (!m) throw new Error('impuestos-base-libro: falta `hoy` (ISO) — sin él no sé qué mes está cerrado')
  return { anio: Number(m[1]), mes: Number(m[2]), inicio: `DATE(${Number(m[1])};${Number(m[2])};1)` }
}

/**
 * LAS VENTAS FACTURADAS DE UN MES, en la medida pedida (`iva` o `neto`). El IVA débito del bloque 1 y
 * la base imponible del bloque 2 son ESTA misma expresión con otra columna: si mañana cambia el
 * criterio, cambia una vez.
 *
 * UN MES SIN NINGUNA FACTURA EMITIDA VALE VACÍO, NO CERO. Son cosas distintas y la diferencia es cara
 * en las dos direcciones: leído como pronóstico, un `$0` dice «este mes no pagás IVA» cuando lo que
 * pasa es que todavía no facturaste. Y hacia adentro del cuadro, el 0 CUENTA COMO DATO: sube el ancla
 * de `anclaDeProyeccion` hasta diciembre, con lo que los meses proyectados pasan a «ajeno», el
 * generador deja de emitirlos y el bloque cambia de alto en cada corrida — medido el 03/09/2026:
 * saltaba entre 101 y 105 filas y dejaba los rótulos tres filas corridos.
 *
 * Devuelve el TÉRMINO, sin el `=`, para poder componerlo. PURA.
 */
export function ventasFacturadasDelMes(anio, m, medida = 'iva', { hoy } = {}) {
  const col = VENTA[medida]
  if (!col) {
    throw new Error(`impuestos-base-libro: "${medida}" no es una medida de las ventas del mes. `
      + 'Sólo hay dos: `neto` (columna J, la base imponible) e `iva` (columna K, el débito fiscal).')
  }
  const { desde, hasta } = ventanaDelMes(anio, m)
  const enCurso = mesEnCursoDe(hoy)
  const cerrado = anio < enCurso.anio || (anio === enCurso.anio && m < enCurso.mes)
  const esElEnCurso = anio === enCurso.anio && m === enCurso.mes
  const B = `(${VENTA.categoria}="B")`
  const porFactura = `ISNUMBER(${VENTA.fecha})*(${VENTA.fecha}>=${desde})*(${VENTA.fecha}<${hasta})`
  const vencidaSinEmitir = `(${VENTA.comprobante}="")*ISNUMBER(${VENTA.fecha})*(${VENTA.fecha}<${enCurso.inicio})`
  const terminos = cerrado
    ? [`${B}*(${VENTA.comprobante}<>"")*${porFactura}`]
    : [
        `${B}*${porFactura}`,
        `${B}*${vencidaSinEmitir}*ISNUMBER(${VENTA.cobro})*(${VENTA.cobro}>=${desde})*(${VENTA.cobro}<${hasta})*(${VENTA.cobro}>=${enCurso.inicio})`,
        ...(esElEnCurso ? [`${B}*${vencidaSinEmitir}*(N(${VENTA.cobro})<${enCurso.inicio})`] : []),
      ]
  const suma = terminos.map((t) => `SUMPRODUCT(${t}*N(${col}))`).join('+')
  return `LET(x;${suma};IF(x=0;"";x))`
}

/** El período `YYYY-MM` de un serial de Sheets. */
const periodoDeSerial = (s) => {
  const d = new Date(Date.UTC(1899, 11, 30))
  d.setUTCDate(d.getUTCDate() + s)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * NÚCLEO PURO: a qué período va una fila B de Cobranzas, con la misma regla que la fórmula.
 * Devuelve null si no va a ninguno (sin categoría B, sin fecha, o vencida sin emitir en un mes cerrado).
 */
export function periodoDeVenta(fila, hoy) {
  if (String(fila?.[IDX.categoria] ?? '').trim().toUpperCase() !== 'B') return null
  const p = Number(fila?.[IDX.fecha])
  if (!Number.isFinite(p) || !p) return null
  const { anio, mes } = mesEnCursoDe(hoy)
  const enCurso = `${anio}-${String(mes).padStart(2, '0')}`
  const perFactura = periodoDeSerial(p)
  const emitida = String(fila?.[IDX.comprobante] ?? '').trim() !== ''
  if (perFactura >= enCurso) return perFactura          // el plan: emitida o no
  if (emitida) return perFactura                        // lo que pasó: sólo lo emitido
  const q = Number(fila?.[IDX.cobro])
  const perCobro = Number.isFinite(q) && q ? periodoDeSerial(q) : null
  return perCobro && perCobro >= enCurso ? perCobro : enCurso // vencida sin emitir: al cobro, o a hoy
}

/**
 * NÚCLEO PURO: las mismas ventas que la fórmula, en código, para exhibirlas en el `--dry`.
 * Índices de `Cobranzas!A5:Q`. Devuelve `{ '2026-09': { neto, iva, facturas } }`.
 */
export function ventasPorMesDeEmision(filas = [], hoy) {
  const porMes = {}
  for (const f of filas) {
    const per = periodoDeVenta(f, hoy)
    if (!per) continue
    const v = porMes[per] ?? (porMes[per] = { neto: 0, iva: 0, facturas: 0 })
    v.neto += Number(f?.[IDX.neto]) || 0
    v.iva += Number(f?.[IDX.iva]) || 0
    v.facturas++
  }
  return porMes
}

/**
 * LA FRONTERA ENTRE EL HECHO Y EL HUECO — calculada, nunca cableada.
 *
 * ═══ POR QUÉ UN MES FUTURO SIN FACTURAS NO SE PROYECTA (04/09/2026) ═══
 *
 * El dueño: *«cómo me va a dar a pagar si tengo saldo a favor en los meses siguientes, revisar y
 * rehacer»*. Tenía razón y la causa era proyectar UN SOLO LADO. Noviembre y diciembre tenían crédito
 * fiscal proyectado ($656.188 por mes, de las compras recurrentes del Libro) y débito CERO, porque
 * todavía no hay una sola factura con esas fechas. El cuadro fabricaba $1.312.377 de saldo a favor a
 * fin de año con eso.
 *
 * LA SALIDA NO ES PROYECTAR TAMBIÉN EL DÉBITO, PORQUE NO HAY DE DÓNDE. Se buscaron las dos fuentes
 * que el archivo tiene y ninguna sirve:
 *
 *   · Las COBRANZAS ESPERADAS del Libro, que es lo que el bloque de IIBB usaba. Medidas una por una
 *     el 04/09/2026, las siete filas de Cobranzas que se esperan cobrar en noviembre y diciembre
 *     tienen TODAS su factura ya emitida —seis de agosto y una de octubre—. Usarlas como «ventas de
 *     noviembre» declara por segunda vez un IVA que ya se devengó en agosto.
 *   · «Falta certificar» de la pestaña OBRAS, que sí es un driver legítimo de facturación futura:
 *     $47.659.263, y las tres obras que lo aportan terminan el 30/09, el 16/10 y el 21/08. No pone
 *     una sola venta en noviembre tampoco.
 *
 * Entonces no se proyecta: se declara el hueco. Un mes FUTURO sin facturas cargadas no tiene base, y
 * sin base no hay período fiscal que calcular — ni débito, ni crédito, ni base de IIBB. Un mes YA
 * TRANSCURRIDO sin facturas sí se calcula: ahí el cero es un hecho (no se vendió), no un dato que
 * falta, y su crédito fiscal es real.
 *
 * La frontera se mueve sola: el día que se cargue una factura con fecha de noviembre, noviembre pasa
 * a tener base y los dos bloques la usan en la corrida siguiente.
 *
 * @param {Array} filas `Cobranzas!A5:Q` sin formatear
 * @param {number} anio
 * @param {string} hoy ISO `YYYY-MM-DD`. NO `new Date()`: el generador tiene que dar la misma grilla
 *        corrido dos veces el mismo día, y un test tiene que poder fijar el día.
 */
export function planDeVentas(filas = [], anio, hoy) {
  const porMes = ventasPorMesDeEmision(filas, hoy)
  const per = (m) => `${anio}-${String(m).padStart(2, '0')}`
  // Un año que ya pasó no tiene mes en curso: sus doce meses son hechos y todos tienen base.
  const mesEnCurso = String(hoy ?? '').slice(0, 4) === String(anio) ? Number(String(hoy).slice(5, 7)) : 12
  const conVentas = (m) => (porMes[per(m)]?.facturas ?? 0) > 0
  const facturados = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(conVentas)
  return {
    porMes,
    mesEnCurso,
    mesesFacturados: facturados,
    ultimoMesFacturado: facturados.length ? facturados[facturados.length - 1] : 0,
    iva: (m) => porMes[per(m)]?.iva ?? 0,
    neto: (m) => porMes[per(m)]?.neto ?? 0,
    /** De los meses que se iban a proyectar, cuáles no tienen base de ventas y hay que dejar vacíos. */
    sinBase: (meses = []) => meses.filter((m) => m > mesEnCurso && !conVentas(m)),
  }
}

/** El término del CRÉDITO del mes: las compras con factura, netas de notas de crédito. */
export const creditoDeComprasDelMes = (anio, m) =>
  `-(${terminoLibro({ ...ventanaDelMes(anio, m), rubros: RUBROS_CREDITO_LIBRO })})`
