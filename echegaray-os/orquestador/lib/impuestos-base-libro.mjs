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
  fecha: 'Cobranzas!$P$5:$P', // «Fecha de Factura» — NO la C, que es «Fecha de Venta»
  neto: 'Cobranzas!$J$5:$J',
  iva: 'Cobranzas!$K$5:$K',
})

/** Índices dentro de `Cobranzas!A5:P`, el mismo contrato que `VENTA` pero para el núcleo puro. */
const IDX = Object.freeze({ categoria: 1, neto: 9, iva: 10, fecha: 15 })

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
export function ventasFacturadasDelMes(anio, m, medida = 'iva') {
  const col = VENTA[medida]
  if (!col) {
    throw new Error(`impuestos-base-libro: "${medida}" no es una medida de las ventas del mes. `
      + 'Sólo hay dos: `neto` (columna J, la base imponible) e `iva` (columna K, el débito fiscal).')
  }
  const { desde, hasta } = ventanaDelMes(anio, m)
  const suma = `SUMPRODUCT((${VENTA.categoria}="B")*ISNUMBER(${VENTA.fecha})`
    + `*(${VENTA.fecha}>=${desde})*(${VENTA.fecha}<${hasta})*N(${col}))`
  return `LET(x;${suma};IF(x=0;"";x))`
}

/**
 * NÚCLEO PURO: las mismas ventas que la fórmula, en código, para exhibirlas en el `--dry`.
 * Índices de `Cobranzas!A5:P`. Devuelve `{ '2026-09': { neto, iva, facturas } }`.
 */
export function ventasPorMesDeEmision(filas = []) {
  const porMes = {}
  for (const f of filas) {
    if (String(f?.[IDX.categoria] ?? '').trim().toUpperCase() !== 'B') continue
    const s = Number(f?.[IDX.fecha])
    if (!Number.isFinite(s) || !s) continue
    const d = new Date(Date.UTC(1899, 11, 30))
    d.setUTCDate(d.getUTCDate() + s)
    const per = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
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
 * @param {Array} filas `Cobranzas!A5:P` sin formatear
 * @param {number} anio
 * @param {string} hoy ISO `YYYY-MM-DD`. NO `new Date()`: el generador tiene que dar la misma grilla
 *        corrido dos veces el mismo día, y un test tiene que poder fijar el día.
 */
export function planDeVentas(filas = [], anio, hoy) {
  const porMes = ventasPorMesDeEmision(filas)
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
