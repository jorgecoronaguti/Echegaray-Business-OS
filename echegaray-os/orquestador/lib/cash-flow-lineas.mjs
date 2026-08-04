// LAS LÍNEAS DEL CASH FLOW — LAS MISMAS EN EL SEMANAL Y EN EL MENSUAL.
//
// POR QUÉ EXISTE (20/07). El Semanal y el Mensual tenían listas de líneas DISTINTAS, escritas cada
// una por su lado. Consecuencias medidas: el Mensual no tenía "Servicios recurrentes" y se comía
// $9.825.332 del año; juntaba toda la nómina en una línea que el Semanal abría en cinco, así que no
// se podían contrastar; y los dos leían Estructura de un rango de filas que ya no existía, dejando
// $33.223.269 en cero sin avisar.
//
// Acá las líneas se declaran UNA vez y las dos pestañas se generan de la misma lista. Si mañana
// aparece un rubro nuevo en Compras, entra solo en los dos lados o no entra en ninguno — pero no
// puede volver a entrar en uno y faltar en el otro.
//
// EL PUNTO DE LA REGLA DEL DUEÑO ("nada duplicado ni fuera de consideración"): cada línea de egreso
// es exactamente un rubro de rubro-caja.mjs, que es una PARTICIÓN de Compras. Duplicar es imposible
// (un gasto cae en un solo rubro) y quedar afuera es visible (el control de abajo lo resta).

import { REGLAS, RUBROS } from './rubro-caja.mjs'
import { TASAS, REAL as REAL_DESCUBIERTO } from './costo-descubierto.mjs'
// La fecha de caja de una quincena vive en un solo lugar: ni el cash flow ni la pestaña de Jornales
// la definen por su cuenta. Ver lib/jornales-fecha-pago.mjs.
import { fechaDeCajaDeQuincena } from './jornales-fecha-pago.mjs'
// La otra mitad de la nómina de administración: los retiros mensuales de Dirección, que no están en
// ninguna planilla y hasta hoy sólo existían como filas sueltas de Compras.
import { formulaDireccion } from './direccion-retiros.mjs'
// Lo que el banco muestra que salió por cada naturaleza — para poder contrastarlo contra el cuadro.
import { formulaBancoPorNaturaleza } from './banco-vs-cuadro.mjs'
// El "⇒ " de los rótulos de total sale de una sola función, la misma que usan los generadores.
import { total } from './patron-pestana.mjs'

/** El sub-rubro de Estructura que NO es gasto del mes sino inversión. Lo escribe estructura-pestana. */
export const SUB_BIENES_DE_USO = 'Equipos y rodados (inversión)'
/** La columna de Compras donde vive el sub-rubro de Estructura. */
export const COL_SUB = 'Compras!$AF$4:$AF'

/** Rango de la columna de rubro en Compras (la escribe scripts/rubro-caja-sheet.mjs). */
export const COL_RUBRO = 'Compras!$AC$4:$AC'
/** Rango de la fecha en que la plata sale de la caja. */
export const COL_FECHA = 'Compras!$AD$4:$AD'
/** Rango del importe total con IVA. */
export const COL_TOTAL = 'Compras!$O$4:$O'

/**
 * El orden en que se leen los egresos: primero la gente, después la obra, después la estructura,
 * al final el Estado y los bancos. Es el orden en que el dueño decide cuando falta caja.
 */
const ORDEN = [
  'Nómina · Jornales de obra',
  'Nómina · Sueldos administración',
  'Nómina · SAC',
  'Nómina · Cargas sociales',
  'Nómina · Gremiales',
  'Materiales Civil',
  'Materiales Mantenimiento',
  'Estructura',
  'Servicios recurrentes',
  'Deuda previsional (planes de pago)',
  'Impuestos',
  'Financiero',
]

/**
 * NÚCLEO PURO: las líneas de egreso, en orden, con dónde vive el detalle de cada una.
 * @returns {Array<{rubro:string, detalle:string, paga:string}>}
 */
export function lineasEgreso() {
  const porRubro = new Map(REGLAS.map((r) => [r.rubro, r]))
  const faltan = ORDEN.filter((r) => !porRubro.has(r))
  if (faltan.length) throw new Error(`cash-flow-lineas: rubros que no existen en REGLAS: ${faltan.join(', ')}`)
  const sobran = REGLAS.filter((r) => !ORDEN.includes(r.rubro)).map((r) => r.rubro)
  // Si alguien agrega un rubro y se olvida de ponerlo acá, el cash flow lo dejaría afuera EN
  // SILENCIO — que es exactamente el bug que este archivo vino a matar. Mejor romper.
  if (sobran.length) throw new Error(`cash-flow-lineas: rubros sin línea en el cash flow: ${sobran.join(', ')}`)
  return ORDEN.map((r) => ({ rubro: r, detalle: porRubro.get(r).detalle, paga: porRubro.get(r).paga }))
}

/**
 * La línea 13, la que NO sale de Compras porque justamente mide lo que a Compras le falta.
 *
 * POR QUÉ EXISTE (20/07). El dueño preguntó dos veces por los cheques. La primera respuesta fue
 * correcta pero incompleta: "el cheque es CÓMO se paga, no qué se compró, así que no se suma". Eso
 * vale para los 39 cheques cuya factura SÍ está en Compras — sumarlos duplicaría $38.388.505. Pero
 * hay 15 instrumentos ($12.979.883) cuya factura NO está cargada en ningún lado: esa plata sale del
 * banco y NINGUNA línea del cash flow la veía. Medirla al pie y no sumarla dejaba el cuadro
 * subestimado a propósito.
 *
 * Se llena desde las pestañas Cheques Emitidos y Tarjeta de Credito, sólo con lo que no matchea
 * contra Compras. El día que se carguen esas facturas, esta línea baja sola a $0 y la plata aparece
 * en el rubro que le corresponde. Es una línea que existe para desaparecer.
 */
/**
 * DÓNDE VIVE CADA INSTRUMENTO DE PAGO, DECLARADO UNA SOLA VEZ.
 *
 * Estas coordenadas estaban repetidas en tres archivos: el que lee los cheques, el que los marca y
 * el que los suma en el cuadro. Con el número de columna escrito tres veces, cambiar la pestaña
 * arreglaba dos lados y rompía el tercero en silencio. Acá se declaran una vez y los tres las leen.
 *
 * filaCab = fila del encabezado · las columnas son letras porque las usa una fórmula del Sheet.
 */
export const INSTRUMENTOS = {
  cheques: { nombre: 'CHEQUES', pestaña: 'Cheques Emitidos', filaCab: 1, colMonto: 'F', colFecha: 'I', colMes: 'J', colDebitado: 'K', colMarca: 12 },
  // `filaCab` 2 → 31 (04/08). El encabezado del registro de la tarjeta está en la fila 31, no en la 2:
  // arriba vive la banda de la pestaña. Con el 2, `cheques-cobertura-sheet.mjs` estampaba su rótulo
  // "Estado en el OS · al …" en la fila del SUBTÍTULO y colgaba las marcas por debajo, encima de la
  // banda. Era un error preexistente que no se veía porque el bloque de arriba era distinto; el
  // rediseño lo dejó a la vista. También corrige el rango de `cash-flow-rehacer` (MAX de fechas),
  // que arrancaba en la 3 —dentro de la banda— en vez de en la primera fila de datos.
  tarjeta: { nombre: 'TARJETA DE CRÉDITO', pestaña: 'Tarjeta de Credito', filaCab: 31, colMonto: 'E', colFecha: 'H', colMes: 'I', colDebitado: 'J', colMarca: 11 },
}

/** Hasta qué fila se busca en las pestañas de instrumentos. De sobra para lo que hay (89 y 29). */
const FILA_FIN = 400

const letraDe = (n) => { let s = ''; for (let x = n; x >= 0; x = Math.floor(x / 26) - 1) s = String.fromCharCode(65 + (x % 26)) + s; return s }

/** El rango de una columna de un instrumento, desde su primera fila de datos. PURA. */
export const rangoInstrumento = (inst, col) =>
  `'${inst.pestaña}'!$${col}$${inst.filaCab + 1}:$${col}$${FILA_FIN}`

/**
 * NÚCLEO PURO: las fórmulas del bloque de medición de cheques y tarjeta del pie del cash flow.
 *
 * Antes ese bloque eran veinte números calculados en código y pegados. Ahora que la marca de cada
 * cheque está escrita en su propia fila, el bloque puede contarlas: es la misma información pero
 * verificable a mano y viva. La regla no distingue entre un número del cuadro y uno de un bloque de
 * control — un número pegado envejece igual en los dos lados.
 */
export function formulasInstrumento(inst, marcas) {
  const R = (c) => rangoInstrumento(inst, c)
  const M = R(letraDe(inst.colMarca))
  const importe = `IF(ISNUMBER(${R(inst.colMonto)});${R(inst.colMonto)};0)`
  const conMarca = (m) => ({
    cantidad: `=COUNTIF(${M};"${m}")`,
    monto: `=SUMPRODUCT((${M}="${m}")*${importe})`,
  })
  return {
    total: { cantidad: `=SUMPRODUCT(--(${M}<>""))`, monto: `=SUMPRODUCT((${M}<>"")*${importe})` },
    contemplados: conMarca(marcas.ok),
    falta: conMarca(marcas.falta),
    sinNumero: conMarca(marcas.sinNumero),
    /**
     * Lo que todavía no se debitó, por mes. Se compara contra la FECHA, no contra el rótulo: la
     * columna de mes de la pestaña dice "julio 26" pero adentro tiene una fecha, así que comparar
     * texto daba $0 en las cuatro filas del bloque.
     */
    aCubrir: (anio, num) => {
      const ini = `DATE(${anio};${num};1)`
      const ventana = `(${R(inst.colFecha)}>=${ini})*(${R(inst.colFecha)}<EOMONTH(${ini};0)+1)`
      const pendiente = `(UPPER(${R(inst.colDebitado)})<>"SI")`
      return {
        cantidad: `=SUMPRODUCT(${pendiente}*${ventana}*--ISNUMBER(${R(inst.colMonto)}))`,
        monto: `=SUMPRODUCT(${pendiente}*${ventana}*${importe})`,
      }
    },
  }
}

/**
 * NÚCLEO PURO: la fórmula de "pagos con cheque y tarjeta sin factura registrada" en una ventana.
 *
 * POR QUÉ ES FÓRMULA Y ANTES ERA UN NÚMERO PEGADO (21/07). El auditor de reglas de oro lo encontró:
 * $9.666.906,66 escritos a mano en el Cash Flow Mensual. El cruce contra Compras se hace en código
 * —normalizar "0001-000036" contra "1-36" en una celda sería ilegible— pero el RESULTADO del cruce
 * ya queda escrito fila por fila en cada pestaña, así que el total lo puede hacer el Sheet sumando
 * esas filas. La diferencia práctica: el día que se carga una factura que faltaba, esta línea baja
 * sola. Antes se quedaba con el número viejo hasta la próxima corrida del agente.
 *
 * @param {string} desde expresión de la fecha de inicio (ej. 'B$3')
 * @param {string} hasta expresión de la fecha de fin, EXCLUYENTE
 * @param {string} marcaFalta el texto exacto que el OS escribe cuando la factura no está
 */
export function formulaChequesSinFactura(desde, hasta, marcaFalta, instrumentos = Object.values(INSTRUMENTOS)) {
  const trozo = ({ pestaña, filaCab, colMonto, colFecha, colMarca }) => {
    const col = (n) => { let s = ''; for (let x = n; x >= 0; x = Math.floor(x / 26) - 1) s = String.fromCharCode(65 + (x % 26)) + s; return s }
    const r = (c) => `'${pestaña}'!$${c}$${filaCab + 1}:$${c}$${FILA_FIN}`
    return `SUMPRODUCT((${r(col(colMarca))}="${marcaFalta}")*(${r(colFecha)}>=${desde})*(${r(colFecha)}<${hasta})*IF(ISNUMBER(${r(colMonto)});${r(colMonto)};0))`
  }
  return `=${instrumentos.map(trozo).join('+')}`
}

/** El subconjunto de instrumentos de una línea de "sin factura": 'cheques' o 'tarjeta' abre UNO solo;
 * sin `inst` van los dos (compatibilidad). Con esto la misma fórmula anti-doble-conteo alimenta dos
 * líneas separadas sin sumar plata nueva: la partición cheques/tarjeta es de PRESENTACIÓN, no de monto. */
export function instrumentosDeLinea(inst) {
  return inst ? [INSTRUMENTOS[inst]] : Object.values(INSTRUMENTOS)
}

export const LINEA_CHEQUES = {
  rubro: 'Cheques y tarjeta sin factura cargada',
  detalle: 'Cheques Emitidos y Tarjeta de Credito',
  paga: 'Cheques Emitidos',
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CALENDARIO FISCAL — IVA e IIBB A PAGAR, LA SALIDA QUE EL CUADRO NO PROYECTABA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE (28/07). Auditoría TAUDIT: los dos cash flow no proyectaban hacia adelante el IVA ni
// el IIBB a pagar (~$13,18M/año sólo de IVA). La línea de "Impuestos" del cuadro sólo ve
// Compras!AC="Impuestos" —pagos YA hechos de OTROS impuestos— y el IVA/IIBB NO viven en Compras (lo
// dice impuestos-pestana.mjs: "En Compras no hay UNA SOLA fila de IVA ni de IIBB"). El dato ya está
// calculado, mes a mes, en la pestaña "Impuestos y Financieros": la fila "⇒ IVA a pagar en el mes" y
// la fila "⇒ IIBB a pagar en el mes". Esta línea LEE esas filas; no recalcula nada (una sola fuente).
//
// NO DUPLICA. El IVA/IIBB neto a pagar no está en Compras, así que la línea de "Impuestos" (rubro de
// Compras) y ésta miran plata distinta. Por eso "Impuestos y Financieros" pasa de DERIVADA a FUENTE en
// el mapa de cobertura (cash-flow-cobertura.mjs) SÓLO por estas dos filas; el resto de la pestaña
// (prendario, planes) sigue siendo vista de Compras y NO se suma.
//
// LAS FILAS NO SE HARDCODEAN (misma lección que Estructura!$15). Se ubican por su rótulo en la columna
// A, igual que Estructura/Recurrentes; si el rótulo no aparece, el generador rompe en vez de escribir
// una referencia muerta que devolvería $0 en silencio.
// EL CONTRATO SE DEFINE UNA VEZ, Y EL PRODUCTOR LO IMPORTA (31/07). Estaba escrito dos veces —acá el
// texto a buscar, allá el texto a escribir— y el 30/07 impuestos-pestana.mjs renombró su fila a "IVA a
// pagar en efectivo" razonando sobre el NÚMERO DE FILA ("queda en la misma fila 18 que leía el cash
// flow"), que es justo lo que este lado NO usa. Desde entonces los dos cash flow no se podían
// regenerar: el generador fallaba cerrado, que es lo correcto, pero el archivo quedó sin recibir nada.
// Ahora impuestos-pestana.mjs escribe ESTAS constantes: renombrar de un solo lado ya no es posible.
export const ROTULOS_CALENDARIO = { iva: 'IVA a pagar en efectivo', iibb: 'IIBB a pagar en el mes' }
export const CALENDARIO_IMPUESTOS = {
  pestaña: 'Impuestos y Financieros',
  // Los rótulos EXACTOS que escribe impuestos-pestana.mjs — con el "⇒ " que le antepone total().
  rotulos: { iva: total(ROTULOS_CALENDARIO.iva), iibb: total(ROTULOS_CALENDARIO.iibb) },
}

/** Los rótulos a ubicar por su fila en "Impuestos y Financieros", para que el generador los resuelva
 * (mismo mecanismo que tablasDeProyeccion). PURA. */
export function rotulosCalendarioImpuestos() {
  return Object.entries(CALENDARIO_IMPUESTOS.rotulos).map(([clave, rotulo]) => ({ clave, rotulo }))
}

/** Exige que las filas del calendario estén ubicadas: una referencia a una fila muerta da $0 sin avisar. */
function filasCalendarioOk(filasCal) {
  const { iva, iibb } = filasCal ?? {}
  if (!iva || !iibb) throw new Error('cash-flow-lineas: no sé en qué filas de "Impuestos y Financieros" están "IVA a pagar"/"IIBB a pagar" — sin eso la línea apuntaría a una fila muerta')
  return { iva, iibb }
}

/** La columna del mes N (1=enero) en la grilla mensual: enero es SIEMPRE la columna B, igual que en
 * "Impuestos y Financieros" (A=concepto, B..M=doce meses, N=total). PURA. */
export const colMesDelAnio = (m) => String.fromCharCode(65 + m)

/**
 * NÚCLEO PURO: el IVA + IIBB a pagar de un MES, leído del calendario. La columna del cash flow y la de
 * "Impuestos y Financieros" están alineadas (B=enero…M=diciembre), así que se referencia la misma
 * letra. El calendario YA trae real (ARCA/DDJJ) y proyección; esta línea sólo lo lee, no lo recalcula.
 * N() convierte una celda vacía o "—" en 0 sin romper.
 * @param {string} colTabla letra de la columna del mes (ej. 'D')
 * @param {{iva:number,iibb:number}} filasCal filas ubicadas por rótulo
 * @returns {string} fórmula es-AR
 */
export function formulaCalendarioImpuestosMes(colTabla, filasCal) {
  const { iva, iibb } = filasCalendarioOk(filasCal)
  const P = CALENDARIO_IMPUESTOS.pestaña
  return `=N('${P}'!${colTabla}$${iva})+N('${P}'!${colTabla}$${iibb})`
}

/**
 * NÚCLEO PURO: el IVA + IIBB imputado a una VENTANA SEMANAL. El calendario es mensual (no hay una
 * fecha de vencimiento por día en la pestaña), así que el total del mes cae en la semana que contiene
 * el fin de ese mes de vencimiento — aproximación DECLARADA de la timing intra-mes; el monto es exacto.
 * Se recorre los doce meses y se queda con los que vencen dentro de [desde, hasta) (límite superior
 * EXCLUYENTE, como el resto del cuadro, para que ningún mes caiga en dos semanas).
 * @param {string} desde expresión de inicio (ej. 'B$3') · @param {string} hasta límite EXCLUYENTE
 * @param {number} anio el año de la grilla (para construir la fecha de vencimiento del mes)
 * @param {{iva:number,iibb:number}} filasCal filas ubicadas por rótulo
 * @returns {string} fórmula es-AR
 */
export function formulaCalendarioImpuestosSemana(desde, hasta, anio, filasCal) {
  const { iva, iibb } = filasCalendarioOk(filasCal)
  const P = CALENDARIO_IMPUESTOS.pestaña
  const term = (m) => {
    const c = colMesDelAnio(m)
    // PERCIBIDO (+1): el IVA/IIBB del período de un mes se PAGA al mes siguiente. El vencimiento real
    // de AFIP cae alrededor del día 20 del mes siguiente → fin del mes del período + 20 días. Así el
    // egreso semanal cae en la semana en que efectivamente sale la plata, no en la del período.
    const venc = `EOMONTH(DATE(${anio};${m};1);0)+20`
    const monto = `(N('${P}'!${c}$${iva})+N('${P}'!${c}$${iibb}))`
    return `${monto}*(${venc}>=${desde})*(${venc}<${hasta})`
  }
  return `=${Array.from({ length: 12 }, (_, i) => term(i + 1)).join('+')}`
}

// De dónde sale la PROYECCIÓN de cada rubro para los meses que todavía no pasaron.
//
// POR QUÉ HACE FALTA (20/07). Medido: el cash flow proyectaba los INGRESOS pero no los egresos.
// De agosto a diciembre, Materiales Civil mostraba $203.132 contra un ritmo real de ~$26M por mes,
// y Estructura, Recurrentes, Mantenimiento e Impuestos mostraban $0. Con los cobros proyectados y
// los pagos no, el último cuatrimestre daba un superávit que no existe — del orden de $165M.
//
// DOS ORÍGENES, Y LA DIFERENCIA IMPORTA:
//   · 'tabla'  — la pestaña de detalle YA calcula su proyección (Estructura y Recurrentes lo hacen,
//                cada una con su regla y su ajuste por inflación). El cash flow la LEE de ahí. Si la
//                recalculara acá habría dos definiciones del mismo número, que es el error que este
//                archivo entero vino a corregir.
//   · 'ritmo'  — no hay pestaña que lo proyecte: se usa el promedio de los últimos 3 meses cerrados
//                ajustado por la inflación de Parámetros. Es un SUPUESTO declarado, no un dato.
//   · null     — no se proyecta. Los jornales ya traen sus quincenas futuras de su propia planilla.
/** Menos de esto no es una tendencia mensual, es un pago suelto. Misma regla que Estructura. */
export const MIN_MESES = 4
/** La fila del encabezado con los 12 primeros-de-mes. Se usa para contar en cuántos hubo gasto. */
const MESES_CAB = '$B$3:$M$3'

// LAS FILAS NO SE HARDCODEAN MÁS. La versión anterior apuntaba a Estructura!$15 y Recurrentes!$24
// escritos a mano, y eso ya falló una vez: los dos cash flow leían Estructura de un rango que había
// dejado de existir y mostraban $33.223.269 en CERO sin que nada avisara. Ahora la fila se busca por
// el rótulo de la columna A de cada pestaña y se pasa acá; si el rótulo no aparece, el script rompe
// en vez de escribir una referencia muerta.
const PROYECCION = {
  'Estructura': { tipo: 'tabla', pestaña: 'Estructura', rotulo: 'TOTAL ESTRUCTURA' },
  'Servicios recurrentes': { tipo: 'tabla', pestaña: 'Recurrentes', rotulo: 'TOTAL' },
  'Nómina · Jornales de obra': null,
  // Las cuotas que faltan YA están cargadas en Compras con su fecha de vencimiento (el saldo
  // pendiente es $7.958.394 y se ve en Cargas Sociales). Proyectar encima inventaba $4.355.383 de
  // cuotas que ningún plan tiene: un plan de pago tiene un número de cuotas fijo, no un ritmo.
  'Deuda previsional (planes de pago)': null,
  // Ídem: el crédito prendario tiene las cuotas 15 a 26 cargadas hasta diciembre.
  'Financiero': null,
}

/**
 * NÚCLEO PURO: el monto de un rubro en un MES, con proyección si el mes todavía no pasó.
 * @param {string} rubro nombre exacto
 * @param {string} celdaRubro celda con el nombre (ej. '$A12')
 * @param {string} colMes letra de la columna del mes en el cash flow (ej. 'I')
 * @param {string} colTabla letra de la columna equivalente en la pestaña de detalle
 * @param {number} filaCab fila del encabezado con las fechas
 * @returns {string} fórmula es-AR
 */
export function formulaMesConProyeccion(rubro, celdaRubro, colMes, colTabla, filaCab) {
  const mes = `${colMes}$${filaCab}`
  const real = `SUMIFS(${COL_TOTAL};${COL_RUBRO};${celdaRubro};${COL_FECHA};">="&${mes};${COL_FECHA};"<"&EOMONTH(${mes};0)+1)`
  const p = PROYECCION[rubro]
  if (p === null) return `=${real}`
  let proy
  if (p?.tipo === 'tabla') {
    const fila = filasTabla[p.pestaña]
    if (!fila) throw new Error(`cash-flow-lineas: no sé en qué fila de "${p.pestaña}" está "${p.rotulo}" — sin eso la referencia sería a una fila muerta`)
    proy = `${p.pestaña}!${colTabla}$${fila}`
  } else {
    // Promedio de los 3 meses cerrados anteriores a hoy, ajustado por inflación...
    const ventana = `SUMIFS(${COL_TOTAL};${COL_RUBRO};${celdaRubro};${COL_FECHA};">="&EOMONTH(TODAY();-4)+1;${COL_FECHA};"<="&EOMONTH(TODAY();0))/3`
    const factor = `IFERROR(INDEX(Parámetros!$C$74:$C$90;MATCH(EOMONTH(${mes};0);ARRAYFORMULA(EOMONTH(Parámetros!$A$74:$A$90;0));0));1)`
    // ...PERO SÓLO SI EL GASTO ES MENSUAL DE VERDAD. Sin este guard, el SAC — que se paga en junio y
    // en diciembre — entraba al promedio móvil de julio y se proyectaba TODOS los meses: $18.777.459
    // de aguinaldo inventado contra $7.368.710 reales. Es el mismo error que la moto en Estructura,
    // y la misma regla lo mata: un rubro que no aparece en al menos 4 meses del año no es una
    // tendencia, es un pago suelto, y proyectarlo es fabricar plata que nadie va a pagar.
    const mesesConGasto = `SUMPRODUCT(--(COUNTIFS(${COL_RUBRO};${celdaRubro};${COL_FECHA};">="&${MESES_CAB};${COL_FECHA};"<"&EOMONTH(${MESES_CAB};0)+1)>0))`
    proy = `IF(${mesesConGasto}<${MIN_MESES};0;${ventana}*${factor})`
  }
  // Un mes ya cerrado muestra lo que pasó, aunque sea cero. Sólo el futuro se proyecta.
  //
  // EN EL FUTURO GANA EL MAYOR, y esto NO es un detalle. La versión anterior decía "si hay algo real
  // cargado, mostrá eso y no proyectes". Medido en el Sheet: agosto de Materiales Civil mostraba
  // $203.132 — una sola factura cargada por adelantado — contra $39.936.681 en septiembre. Una
  // factura suelta con fecha de agosto apagaba la proyección del mes entero y borraba ~$40M de
  // egresos previstos.
  //
  // La lógica correcta es que en un mes que todavía no pasó, lo ya cargado es un PISO, no el total:
  // faltan cargar las compras que ese mes seguro va a tener. Si lo comprometido supera al ritmo
  // histórico, entonces sí manda lo comprometido — es un hecho, y un hecho le gana a un promedio.
  return `=IF(EOMONTH(${mes};0)<=EOMONTH(TODAY();0);${real};MAX(${real};${proy}))`
}

/**
 * Los rubros que NO se proyectan por ritmo, y por qué cada uno. Lo consume también el núcleo
 * Postgres: si la web proyectara un rubro que el Sheet no proyecta, serían dos verdades distintas
 * sobre la misma plata — que es el error que este archivo entero vino a matar.
 */
export const RUBROS_SIN_PROYECCION = Object.entries(PROYECCION)
  .filter(([, v]) => v === null)
  .map(([k]) => k)

/** Las pestañas de detalle cuya fila de total hay que ubicar antes de generar el cuadro. PURA. */
export function tablasDeProyeccion() {
  return Object.values(PROYECCION).filter((p) => p?.tipo === 'tabla').map((p) => ({ pestaña: p.pestaña, rotulo: p.rotulo }))
}

/** Los rubros cuya proyección sale de su propia pestaña, para poder explicarlo en el Sheet. PURA. */
export function origenProyeccion(rubro) {
  // Cortas a propósito: entran unos 48 caracteres en esta columna. El detalle va en la nota.
  if (rubro === LINEA_CHEQUES.rubro) return 'cheques y tarjeta YA emitidos: fecha cierta'
  const p = PROYECCION[rubro]
  if (p === null) return 'sus quincenas vienen de Jornales por Quincena'
  if (p?.tipo === 'tabla') return `la calcula la pestaña ${p.pestaña}`
  return 'promedio de 3 meses cerrados + inflación'
}

/**
 * NÚCLEO PURO: la fórmula del monto de un rubro en una ventana de fechas.
 * Todas las columnas viven en Compras, así que SUMIFS alcanza (SUMIFS falla cuando el rango a sumar
 * está en otra pestaña que los criterios — acá no es el caso).
 * @param {string} celdaRubro celda que tiene el nombre exacto del rubro (ej. '$A7')
 * @param {string} desde expresión de la fecha de inicio (ej. 'B$3')
 * @param {string} hasta expresión del límite superior, EXCLUYENTE
 * @returns {string} fórmula es-AR
 */
export function formulaRubroEnVentana(celdaRubro, desde, hasta) {
  return `=SUMIFS(${COL_TOTAL};${COL_RUBRO};${celdaRubro};${COL_FECHA};">="&${desde};${COL_FECHA};"<"&${hasta})`
}

/**
 * NÚCLEO PURO: los jornales de obra NO salen de Compras.
 * En Compras están tipeados a mano como estimación ($144.848.022 en el año); el dato real está en la
 * planilla de jornales, replicada en "Jornales por Quincena" ($114.371.743). Usar Compras acá
 * inflaría la caja $30,5M — que fue exactamente el reclamo del dueño: "no coinciden las quincenas y
 * sus montos con lo que dice la semana".
 * @returns {string} fórmula es-AR
 */
export function formulaJornales(desde, hasta) {
  // POR RANGO CON NOMBRE, NO POR NÚMERO DE FILA. Decía `$B$3:$B$16` y `$B$24:$B$33`; el rediseño de
  // Jornales del 23/07 movió las quincenas reales a la fila 41 y estas dos sumas habrían seguido
  // devolviendo un número —el de las filas equivocadas— sin marcar un solo error. Los nombres los
  // publica el generador de Jornales y se mueven con la pestaña.
  //
  // ═══ LA FECHA QUE DECIDE ES LA DE PAGO, NO LA DE CIERRE (31/07) ═══
  //
  // Decía acá mismo: "HASTA = fecha de pago, TOTAL = lo pagado". Era falso. El dueño: *"los jornales
  // que se pagan de la quincena q termina hoy, se pagarán la semana que viene"* — y el extracto del
  // Santander ya lo probaba desde antes: la quincena que cerró el 15/07 se pagó el 17/07 (lote
  // 260717507, $3.775.150, que es EXACTAMENTE su columna "Banco"), y la que cerró el 30/06 se pagó el
  // 01/07. Una quincena no se paga el día que cierra: se paga uno o dos días hábiles después.
  //
  // MEDIDO sobre las 24 quincenas del año: la quincena 16/07–31/07 ($7.675.588) pasa de la columna de
  // JULIO a la de AGOSTO, y de la semana del 27/07 a la del 03/08. El total del año no cambia
  // ($184.172.771 de las dos formas): la plata se mueve entre columnas, no aparece ni desaparece.
  //
  // EL FALLBACK A `HASTA` NO ES OPCIONAL. Si la celda de pago quedara vacía —una quincena vieja, una
  // fórmula borrada a mano— la línea devolvería cero para esa quincena y el cuadro seguiría cuadrando
  // con menos plata. Una línea en cero sin avisar es el peor resultado posible de este archivo.
  // La REAL mira primero lo que el dueño marcó como pagado: si se pagó, se pagó.
  const fReal = fechaDeCajaDeQuincena('JORNALES_REAL_PAGO', 'JORNALES_REAL_HASTA', 'JORNALES_REAL_PAGADO')
  const fProy = fechaDeCajaDeQuincena('JORNALES_PROY_PAGO', 'JORNALES_PROY_HASTA')
  // Bloque 1: quincenas reales (TOTAL = lo pagado).
  const real = `SUMPRODUCT(ISNUMBER(${fReal})*(${fReal}>=${desde})*(${fReal}<${hasta})*IF(ISNUMBER(JORNALES_REAL_TOTAL);JORNALES_REAL_TOTAL;0))`
  // Bloque 2: quincenas proyectadas.
  const proy = `SUMPRODUCT(ISNUMBER(${fProy})*(${fProy}>=${desde})*(${fProy}<${hasta})*IF(ISNUMBER(JORNALES_PROY_TOTAL);JORNALES_PROY_TOTAL;0))`
  return `=${real}+${proy}`
}

/**
 * NÚCLEO PURO: los sueldos de OFICINA en una ventana de caja, leyendo el bloque de la pestaña Jornales.
 *
 * POR QUÉ EXISTE (31/07). El dueño: "no estás considerando oficina... se ve mal todo en cashflow y por
 * ende podría estar mal en caja". Medido, tres números distintos para el mismo sueldo:
 *
 *   · planilla JORNALES (bloque Oficina):  $19.909.063 pagado + $21.385.051 proyectado
 *   · Compras, rubro "Nómina · Sueldos administración":  $51.020.773
 *   · lo que sumaba el cash flow:  el de Compras — el bloque de la planilla no lo leía NADIE
 *
 * La planilla de sueldos es la fuente de la nómina, igual que para los jornales de obra (que ya salen
 * del registro de quincenas y no de Compras). Que la línea de oficina saliera de Compras era la misma
 * capacidad con dos fuentes: la regla 9 del archivo, "no duplicar, un solo juego de rubros".
 *
 * UN MES ESTÁ PAGADO O PROYECTADO, NUNCA LOS DOS: el bloque llena "Pagado" cuando la planilla tiene el
 * mes y "Proyectado" cuando no. Sumar las dos columnas es correcto por construcción y, si algún día se
 * llenaran las dos, el control de nómina de más abajo lo grita en vez de duplicar en silencio.
 *
 * @param {string} desde expresión de inicio · @param {string} hasta límite EXCLUYENTE
 * @returns {string} fórmula es-AR
 */
export function formulaOficina(desde, hasta) {
  const f = 'OFICINA_PAGO'
  const en = `ISNUMBER(${f})*(${f}>=${desde})*(${f}<${hasta})`
  const pagado = 'IF(ISNUMBER(OFICINA_PAGADO);OFICINA_PAGADO;0)'
  const proy = 'IF(ISNUMBER(OFICINA_PROYECTADO);OFICINA_PROYECTADO;0)'
  return `=SUMPRODUCT(${en}*(${pagado}+${proy}))`
}

/**
 * NÚCLEO PURO: la línea "Sueldos de administración" del cash flow = OFICINA + DIRECCIÓN.
 *
 * ═══ POR QUÉ CAMBIÓ DE FUENTE (01/08) ═══
 *
 * Esta línea salía de Compras y el bloque de la planilla quedaba al lado como memo. Estaba puesto
 * así a propósito el 31/07, con esta razón escrita: *"la diferencia es de $10M largos y NO sé cuál
 * es la correcta: puede ser que Compras incluya gente que la planilla no tiene. Elegir una a ojo
 * sería inventar."*
 *
 * Se midió y era exactamente eso. Compras tiene CINCO personas y la planilla DOS: los tres que
 * faltaban son los retiros de Dirección (ver lib/direccion-retiros.mjs). El dueño confirmó quiénes
 * son y dónde van, así que la planilla dejó de estar incompleta y ya no hay nada que elegir a ojo:
 * las dos mitades de la nómina de administración viven ahora en "Jornales por Quincena" y ésta es
 * su suma. La regla 9 del archivo —un solo juego de rubros— se cumple recién ahora.
 *
 * LO QUE SE INVIRTIÓ, Y ES LO QUE EVITA EL DOBLE CONTEO: el memo pasó a ser Compras. Las mismas
 * filas siguen cargadas ahí (es donde el dueño registra el pago) pero YA NO SUMAN al flujo: la
 * línea que suma es ésta. Mientras los dos números no coincidan, la brecha se ve en el cuadro.
 */
export function formulaAdministracion(desde, hasta) {
  return `=${formulaOficina(desde, hasta).slice(1)}+${formulaDireccion(desde, hasta).slice(1)}`
}

/**
 * NÚCLEO PURO: las tres líneas de ingreso, leyendo Cobranzas.
 * La fecha de cobro es la real (columna Q) si ya se cobró, si no la de vencimiento (P): es la mejor
 * estimación disponible de CUÁNDO entra la plata. Cash flow es percibido, nunca devengado.
 * @returns {string} fórmula es-AR
 */
/**
 * HASTA QUÉ FILA SE LEE COBRANZAS. Es 400 y no 200 desde el 21/07.
 *
 * El tope viejo era una bomba de tiempo callada: Cobranzas va por la fila 60 y el día que pasara la
 * 200 los tres ingresos del cash flow habrían dejado de contar las filas nuevas sin dar un solo
 * error — el cuadro seguiría cuadrando, con menos plata. El resto del archivo (CAJA, los controles
 * de duplicados) ya leía hasta la 400; esto los pone a todos a mirar las mismas filas.
 */
export const FIN_COB = 400
export const COL_VALOR_BANCO = `$BB$5:$BB$${FIN_COB}`
export const MARCA_ENDOSADO = 'ENDOSADO'

/** El primer día del mes en curso, como fórmula. Es la línea que separa lo que YA PASÓ —donde sólo
 *  vale lo cobrado de verdad— de lo que viene, donde las dos puntas son proyección. */
export const INICIO_MES_ACTUAL = 'EOMONTH(TODAY();-1)+1'

export function formulaCobranzas(tipo, desde, hasta, modo = 'cobrado') {
  const C = 'Cobranzas'
  const F = FIN_COB
  const fecha = `IF(ISNUMBER(${C}!$Q$5:$Q$${F});${C}!$Q$5:$Q$${F};IF(ISNUMBER(${C}!$P$5:$P$${F});${C}!$P$5:$P$${F};0))`
  const monto = `IF(ISNUMBER(${C}!$M$5:$M$${F});${C}!$M$5:$M$${F};0)`
  const uni = `LOWER(${C}!$F$5:$F$${F})`
  // DECISIÓN DEL DUEÑO (25/07): un cobro SIN unidad de negocio (columna F vacía) va por defecto a
  // "Otras cobranzas" —no se cae del cuadro— y además se lo hace visible con el diagnóstico de abajo
  // para que se le asigne la unidad real. Por eso "otras" es TODO lo que no es civil ni mantenimiento,
  // SIN exigir F<>"": la plata se cuenta una sola vez (acá) y el diagnóstico sólo la señala.
  const filtro = tipo === 'otras'
    ? `(${uni}<>"civil")*(${uni}<>"mantenimiento")`
    : `(${uni}="${tipo}")`
  // UN VALOR ENDOSADO NO VA A ENTRAR. El banco dice que dos echeq de LA ESTRELLA por $10.000.000
  // cada uno se entregaron a Alumetal para pagarle. Cobranzas los muestra con fecha de cobro 15/08 y
  // 31/08 —y tiene razón en registrar que se cobraron, el echeq entró— pero esa plata no va a pasar
  // por la cuenta corriente nunca. Sin este filtro el cuadro esperaba $20.000.000 de ingreso en
  // agosto que ya se habían entregado.
  const noEndosado = `(LEFT(${C}!${COL_VALOR_BANCO}&"";${MARCA_ENDOSADO.length})<>"${MARCA_ENDOSADO}")`
  // EL ESTADO (columna O) MANDA EL CRITERIO — decisión del dueño (28/07). Cash flow es percibido:
  // "Cobrado" es plata que YA entró (un HECHO) y va en el bloque de cobros reales; todo lo demás
  // —Pendiente, Proyectado, Facturado, Vencido— es un cobro ESPERADO, todavía no percibido, y va en
  // un bloque aparte que NO suma al flujo, para no mezclar caja con proyección. "Endosado" no entra
  // por ninguno de los dos: esa plata se entregó a un tercero (ya lo excluye noEndosado).
  const est = `LOWER(${C}!$O$5:$O$${F})`
  const estado = modo === 'esperado'
    ? `(${est}<>"cobrado")*(${est}<>"endosado")`
    : `(${est}="cobrado")`

  // ═══ UN COBRO ESPERADO SÓLO CUENTA DE ESTE MES EN ADELANTE (04/08/2026) ═══
  //
  // El cuadro proyectaba los EGRESOS hacia adelante —jornales, cargas, impuestos, materiales— y NO
  // los ingresos: el bloque de cobranzas esperadas era un memo que no sumaba. Medido: el cierre de
  // diciembre daba −$254.274.052 cuando contando lo esperado da +$169.646.277. $423.920.329 de
  // diferencia, y una empresa sana leyéndose como una quiebra.
  //
  // Ahora suma, pero NO hacia atrás. Un cobro que se esperaba en julio y no entró no es plata: es un
  // atraso. Si sumara en su mes, el pasado dejaría de ser un hecho y el cuadro mentiría justo donde
  // se lo puede verificar contra el banco. Por eso la ventana tiene que empezar en el mes en curso
  // o después; para los meses cerrados la línea da cero y el atraso se ve en su propia fila.
  const soloDeAcaEnAdelante = modo === 'esperado' ? `*(${desde}>=${INICIO_MES_ACTUAL})` : ''
  return `=SUMPRODUCT(${filtro}*${noEndosado}*${estado}*(${fecha}>=${desde})*(${fecha}<${hasta})*${monto})${soloDeAcaEnAdelante}`
}

// ── LA COBERTURA DEL LADO DEL INGRESO (Cobranzas) ─────────────────────────────────────────────────
//
// POR QUÉ EXISTE (T04, 25/07). El lado del EGRESO es una partición de Compras con su control al pie:
// si un gasto queda sin rubro (SIN CLASIFICAR) o sin fecha de pago, el control lo grita. El lado del
// INGRESO no tenía nada equivalente, y tiene DOS formas de que un cobro real desaparezca del cuadro
// SIN QUE NADA AVISE — el hueco que este bloque cierra:
//
//   1. Sin UNIDAD DE NEGOCIO (columna F vacía). Por decisión del dueño (25/07) estos cobros ya NO se
//      caen: "otras" los cuenta por defecto (no exige F<>""). El diagnóstico de abajo NO reclasifica —
//      sólo los señala para que se les asigne la unidad real (civil/mantenimiento) si corresponde.
//   2. Sin FECHA de cobro (ni Q real ni P de vencimiento). Cada línea filtra por una ventana de
//      fechas; un cobro sin fecha no cae en ninguna semana ni mes, y como el total del año es la suma
//      de las columnas, tampoco aparece ahí. Es el espejo exacto de "Gastos sin fecha de pago".
//
// Son DIAGNÓSTICOS —lo ideal es que den $0—, igual que "Gastos sin fecha de pago" y "Filas con rubro
// pero sin importe" del lado del egreso. No reclasifican nada: sólo hacen visible el cobro que se cae
// del cuadro, para que el dueño le asigne unidad o fecha. Un endoso NO cuenta (esa plata no entra a
// la cuenta), con el mismo criterio que las líneas de ingreso.

/** Columnas de Cobranzas que miran los controles de cobertura del ingreso: F=unidad, M=monto, P=venc, Q=cobro. */
const COB_COBERTURA = { unidad: 'F', monto: 'M', venc: 'P', cobro: 'Q' }
const cobRango = (col) => `Cobranzas!$${col}$5:$${col}$${FIN_COB}`
/** El mismo filtro anti-endoso que usan las líneas de ingreso: un valor endosado no va a entrar. */
const cobNoEndosado = () => `(LEFT(Cobranzas!${COL_VALOR_BANCO}&"";${MARCA_ENDOSADO.length})<>"${MARCA_ENDOSADO}")`
/** El monto, tratando el no-número como 0 (hay celdas con "-"). */
const cobMontoNum = () => `IF(ISNUMBER(${cobRango(COB_COBERTURA.monto)});${cobRango(COB_COBERTURA.monto)};0)`

/**
 * NÚCLEO PURO: los cobros CON plata pero SIN unidad de negocio — no caen en ninguna línea de ingreso.
 * @returns {string} fórmula es-AR
 */
export function formulaCobranzasSinUnidad() {
  const sinUnidad = `(${cobRango(COB_COBERTURA.unidad)}="")`
  return `=SUMPRODUCT(${sinUnidad}*${cobNoEndosado()}*${cobMontoNum()})`
}

/**
 * NÚCLEO PURO: los cobros CON plata pero SIN fecha (ni cobro real Q ni vencimiento P) — no caen en
 * ninguna semana ni mes. (1-ISNUMBER) y no NOT(), que no es array-safe en Sheets.
 * @returns {string} fórmula es-AR
 */
export function formulaCobranzasSinFecha() {
  const sinFecha = `(1-ISNUMBER(${cobRango(COB_COBERTURA.cobro)}))*(1-ISNUMBER(${cobRango(COB_COBERTURA.venc)}))`
  return `=SUMPRODUCT(${sinFecha}*${cobNoEndosado()}*${cobMontoNum()})`
}

/**
 * NÚCLEO PURO: el bloque de control que prueba que no falta ni sobra nada.
 * Va escrito en la propia pestaña y a la vista: un control que hay que salir a buscar no se mira.
 * @param {number} filaPrimerEgreso fila (1-based) del primer rubro de egreso
 * @param {number} filaUltimoEgreso fila del último
 * @param {string} colTotal letra de la columna donde se escriben estos importes (ej. 'B')
 * @param {number} filaControl fila (1-based) donde arranca este bloque
 * @returns {Array<{etiqueta:string, formula:string, nota?:string}>}
 */
export function bloqueControl(filaPrimerEgreso, filaUltimoEgreso, colTotal, filaControl) {
  // Se suma RUBRO POR RUBRO y no leyendo los rótulos de la columna A. Desde que el cuadro tiene
  // estructura contable, esos rótulos son nombres para el que lee ("Materiales e insumos de obra
  // civil"), no los rubros de Compras — un SUMIF contra ellos daría $0 y el control mentiría
  // diciendo que todo cierra. La lista sale de REGLAS, así que un rubro nuevo entra solo.
  const porRubro = RUBROS.map((r) => formulaTotalRubro(r)).join('+')
  return [
    {
      etiqueta: 'Compras — total cargado',
      formula: `=SUM(${COL_TOTAL})`,
      nota: 'Todo lo que hay en la pestaña Compras, sin filtrar.',
    },
    {
      etiqueta: 'Suma de las líneas de egreso (a valores de Compras)',
      formula: `=${porRubro}`,
      nota: 'Cada rubro de Compras sumado por separado. Si un rubro quedara fuera del cuadro, esto daría menos que el total de arriba.',
    },
    {
      etiqueta: '⇒ Diferencia (tiene que ser $0)',
      formula: `=${colTotal}${filaControl}-${colTotal}${filaControl + 1}`,
      nota: 'Distinto de cero = hay gastos en Compras que ninguna línea del cash flow está mirando.',
    },
    {
      etiqueta: 'Gastos sin fecha de pago (no caen en ninguna semana)',
      formula: `=SUMIFS(${COL_TOTAL};${COL_FECHA};"")`,
      nota: 'Están clasificados y contados en el total, pero no se sabe CUÁNDO salen. Hay que fecharlos.',
    },
    {
      etiqueta: 'Filas con rubro pero SIN importe',
      formula: `=SUMPRODUCT((${COL_RUBRO}<>"")*(NOT(ISNUMBER(${COL_TOTAL}))))`,
      nota: 'Están clasificadas pero no suman en ningún lado porque su Total no es un número. Hoy son 3 filas de Google en USD 25,20 sin convertir a pesos: la suma del Sheet las ignora y nadie se entera.',
    },
    {
      etiqueta: 'Jornales: Compras (estimado) vs planilla real',
      formula: `=SUMIF(${COL_RUBRO};"Nómina · Jornales de obra";${COL_TOTAL})`,
      nota: 'El cash flow NO usa este número: usa el real de Jornales por Quincena. Por eso el total de egresos del año no coincide con el total de Compras, y está bien que no coincida.',
    },
    // LOS DOS ESPEJOS DEL LADO DEL INGRESO (T04): que ningún cobro real se caiga del cuadro en silencio.
    {
      etiqueta: 'Cobros sin unidad de negocio (van a "Otras cobranzas" — asignarles unidad)',
      formula: formulaCobranzasSinUnidad(),
      nota: 'Cobros con plata pero con la unidad (columna F de Cobranzas) vacía. Por decisión del dueño se cuentan en "Otras cobranzas" para que no se caigan del cuadro, y acá quedan visibles para asignarles la unidad real (civil/mantenimiento) si corresponde. No se cuentan dos veces: esta línea es diagnóstico, no suma. Los endosos no cuentan.',
    },
    {
      etiqueta: 'Cobros sin fecha (no caen en ninguna semana)',
      formula: formulaCobranzasSinFecha(),
      nota: 'Cobros con plata pero sin fecha de cobro ni de vencimiento: no caen en ninguna columna del cuadro. Espejo de "Gastos sin fecha de pago". Hay que fecharlos.',
    },
  ]
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CUADRO CON ESTRUCTURA CONTABLE — ESTADO DE FLUJO DE EFECTIVO, MÉTODO DIRECTO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ SE REHIZO (20/07). El dueño: "los cash flows tienen que quedar con conceptos utilizados en
// las áreas financieras contables, y que con +/- se abran las categorías y se vea adentro lo que
// corresponde puntualmente". Tenía razón: el cuadro anterior era una lista plana de 13 renglones
// operativos donde la cuota del crédito prendario estaba al lado del cemento. Eso no es un estado de
// flujo de efectivo, es un listado de gastos ordenado por comodidad interna.
//
// LA NORMA. RT 8 y RT 9 de la FACPCE (y NIC 7, que dice lo mismo) exigen que el flujo de efectivo se
// clasifique en TRES actividades, y por el método directo se muestran las clases de cobros y pagos:
//   · OPERATIVAS   — la actividad que genera los ingresos: cobrar obras, pagar gente, materiales,
//                    estructura e impuestos.
//   · INVERSIÓN    — comprar o vender bienes de uso. Una grúa no es gasto del mes: es inversión.
//   · FINANCIACIÓN — tomar y devolver deuda financiera. La cuota del prendario va acá, no en gastos.
// Y el cuadro cierra como manda la norma: variación neta del efectivo + efectivo al inicio =
// efectivo al cierre. Sin esas dos últimas líneas, un cash flow dice cuánto se mueve pero no puede
// contestar qué día te quedás sin plata.
//
// POR QUÉ IMPORTA ECONÓMICAMENTE Y NO ES PROLIJIDAD. Mezclar las tres actividades hace ilegible el
// dato que más manda en una constructora: si el flujo OPERATIVO es negativo, la empresa se está
// financiando con deuda o con capital de trabajo para sostener la operación, y eso tiene fecha de
// vencimiento. Con todo junto en una sola bolsa, ese diagnóstico no se puede hacer.
//
// LOS DOS CRITERIOS DISCUTIBLES, DECLARADOS EN VEZ DE ESCONDIDOS:
//   · Los PLANES DE PAGO DE DEUDA PREVISIONAL van en OPERATIVAS. Es un pasivo operativo (cargas
//     sociales) refinanciado, no deuda financiera tomada para invertir. La porción de intereses sí
//     sería financiación, pero en Compras el capital y el interés vienen en una sola cuota y
//     separarlos a ojo sería inventar el corte.
//   · La TARJETA DE CRÉDITO se trata por lo que se compró, no por el instrumento. Comprar materiales
//     en 6 cuotas es un pago a proveedores financiado, no una operación de financiación.

/** Los cobros y pagos que la norma pide mostrar por separado, agrupados por actividad. */
export const CUADRO = [
  {
    actividad: 'ACTIVIDADES OPERATIVAS',
    nota: 'Lo que genera y consume la operación: cobrar obras, pagar gente, materiales, estructura e impuestos. Si esta sección da negativo de forma sostenida, la operación se está financiando con deuda o con capital de trabajo.',
    grupos: [
      {
        nombre: 'Cobros por ventas y servicios (ya cobrado)', signo: 1,
        lineas: [
          { nombre: 'Cobranzas de obra civil', cobranzas: 'civil', modo: 'cobrado', detalle: 'Cobranzas' },
          { nombre: 'Cobranzas de mantenimiento', cobranzas: 'mantenimiento', modo: 'cobrado', detalle: 'Cobranzas' },
          { nombre: 'Otras cobranzas', cobranzas: 'otras', modo: 'cobrado', detalle: 'Cobranzas' },
        ],
      },
      {
        // ═══ SUMA AL FLUJO, DE ESTE MES EN ADELANTE (04/08/2026) ═══
        //
        // Era un memo con signo 0. La decisión del 28/07 —percibido y proyectado separados— se aplicó
        // sólo a los ingresos: los EGRESOS de los meses que vienen (jornales, cargas sociales,
        // impuestos, materiales) sí sumaban, y son igual de proyectados. Un cuadro que proyecta lo
        // que se paga y no lo que se cobra no está siendo prudente: está mal. Daba −$254.274.052 a
        // diciembre contra +$169.646.277 haciéndolo simétrico.
        //
        // El pasado no se toca: para los meses cerrados esta línea da cero (ver formulaCobranzas),
        // así que enero-julio siguen siendo el hecho verificable contra el banco.
        nombre: 'Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)', signo: 1,
        lineas: [
          { nombre: 'Esperado · obra civil', cobranzas: 'civil', modo: 'esperado', detalle: 'Cobranzas' },
          { nombre: 'Esperado · mantenimiento', cobranzas: 'mantenimiento', modo: 'esperado', detalle: 'Cobranzas' },
          { nombre: 'Esperado · otras', cobranzas: 'otras', modo: 'esperado', detalle: 'Cobranzas' },
        ],
      },
      {
        nombre: 'Pagos al personal y cargas sociales', signo: -1,
        lineas: [
          { nombre: 'Jornales de obra', rubro: 'Nómina · Jornales de obra' },
          // ═══ RESUELTO: ERA GENTE QUE FALTABA, NO UNA FÓRMULA MAL (01/08) ═══
          //
          // El 31/07 esta línea salía de Compras y acá decía que no se podía elegir entre las dos
          // fuentes sin inventar, porque la diferencia de $10M largos podía ser "gente que la planilla
          // no tiene". Era exactamente eso: Compras tiene CINCO personas y la planilla DOS. Los tres
          // que faltaban son los retiros de Dirección — Jorge Echegaray, Rodrigo Echegaray y Jorge
          // Corona— que no estaban en ninguna planilla.
          //
          // Ahora las dos mitades viven en "Jornales por Quincena" y esta línea las suma
          // (formulaAdministracion). Compras pasó a ser el MEMO de abajo: sigue cargado, ya no suma.
          { nombre: 'Sueldos de administración', rubro: 'Nómina · Sueldos administración', detalle: 'Jornales por Quincena' },
          { nombre: 'Sueldo anual complementario', rubro: 'Nómina · SAC' },
          { nombre: 'Cargas sociales (F931)', rubro: 'Nómina · Cargas sociales' },
          { nombre: 'Aportes y contribuciones gremiales', rubro: 'Nómina · Gremiales' },
          { nombre: 'Planes de pago de deuda previsional', rubro: 'Deuda previsional (planes de pago)' },
        ],
      },
      {
        // MEMO, NO CAJA — signo 0, igual que las cobranzas esperadas. Son las dos MITADES de la línea
        // que sí suma, más la otra fuente del mismo concepto, para que se pueda ver de dónde sale cada
        // peso sin contarlo dos veces:
        //
        //   Oficina (planilla)  +  Dirección (retiros)  =  "Sueldos de administración" de arriba
        //   Compras                                     =  lo cargado a mano, que ya NO suma
        //
        // Mientras Compras y la suma de las dos mitades no coincidan, la brecha se ve en el cuadro en
        // vez de vivir en la cabeza de alguien. Se invirtió el 01/08: hasta ese día la que sumaba era
        // Compras y el memo era la planilla.
        // UNA SOLA LÍNEA, PARA QUE EL SUBTOTAL SIGNIFIQUE ALGO. La primera versión ponía tres
        // —Oficina, Dirección y Compras— y el subtotal del grupo sumaba las dos mitades MÁS la otra
        // fuente de esas mismas mitades: $19.323.125 en agosto, un número que no es nada y que se lee
        // como el costo de la administración del mes. Un número que parece un total y no lo es es peor
        // que no mostrarlo. Las dos mitades se ven abiertas en "Jornales por Quincena", que es donde
        // está su detalle y adonde lleva el vínculo de la línea que sí suma.
        nombre: 'ℹ La misma nómina de administración, según Compras (control, no suma al flujo)', signo: 0,
        lineas: [
          { nombre: 'Sueldos de administración cargados a mano en Compras', rubro: 'Nómina · Sueldos administración', desdeCompras: true, detalle: 'Compras' },
        ],
      },
      {
        nombre: 'Pagos a proveedores de obra', signo: -1,
        lineas: [
          { nombre: 'Materiales e insumos de obra civil', rubro: 'Materiales Civil' },
          { nombre: 'Materiales de mantenimiento', rubro: 'Materiales Mantenimiento' },
          // Se abre en dos: mismo criterio anti-doble-conteo (sólo lo que NO está en Compras), misma
          // fórmula (formulaChequesSinFactura por instrumento), pero el dueño ve el cheque y la cuota
          // de tarjeta por separado. La suma de las dos = lo que antes era una sola línea: no hay plata
          // nueva. La de tarjeta lee "Tarjeta de Credito" col E (monto) por col H (fecha de pago).
          { nombre: 'Cheques sin factura cargada', cheques: true, inst: 'cheques', detalle: 'Cheques Emitidos' },
          { nombre: 'Cuotas de tarjeta sin factura cargada', cheques: true, inst: 'tarjeta', detalle: 'Tarjeta de Credito' },
        ],
      },
      {
        nombre: 'Gastos de estructura y servicios', signo: -1,
        lineas: [
          // Estructura MENOS los bienes de uso, que se van a la sección de inversión. Las dos
          // líneas juntas suman el rubro completo, así que el control del pie sigue cerrando.
          { nombre: 'Gastos de estructura y administración', rubro: 'Estructura', excluirSub: SUB_BIENES_DE_USO },
          { nombre: 'Servicios recurrentes', rubro: 'Servicios recurrentes' },
        ],
      },
      {
        nombre: 'Pagos de impuestos', signo: -1,
        lineas: [
          { nombre: 'Impuestos nacionales y provinciales', rubro: 'Impuestos' },
          // NO sale de Compras: el IVA/IIBB neto a pagar no está cargado ahí. Lo trae el calendario
          // de "Impuestos y Financieros" (fila "⇒ IVA a pagar" + "⇒ IIBB a pagar"), imputado al mes.
          {
            nombre: 'IVA e Ingresos Brutos a pagar',
            calendarioImpuestos: true,
            detalle: 'Impuestos y Financieros',
            nota: 'IVA e IIBB del calendario fiscal, no de Compras',
          },
        ],
      },
    ],
  },
  {
    actividad: 'ACTIVIDADES DE INVERSIÓN',
    nota: 'Compra y venta de bienes de uso. Una moto o una grúa no son gasto del mes: se usan durante años y por eso la norma las saca de la operación. Mezclarlas hacía parecer que la estructura costaba el doble.',
    grupos: [
      {
        nombre: 'Adquisición de bienes de uso', signo: -1,
        lineas: [
          { nombre: 'Equipos, rodados y maquinaria', soloSub: SUB_BIENES_DE_USO, detalle: 'Estructura' },
        ],
      },
    ],
  },
  {
    actividad: 'ACTIVIDADES DE FINANCIACIÓN',
    nota: 'Deuda financiera tomada y devuelta. Acá va la cuota del crédito prendario, que antes estaba entre los gastos y hacía ver como operativo un compromiso que no lo es.',
    grupos: [
      {
        nombre: 'Servicio de deuda financiera', signo: -1,
        lineas: [
          { nombre: 'Cuotas de crédito prendario y gastos bancarios', rubro: 'Financiero' },
          // NO SALE DE COMPRAS: se calcula con la tasa del acuerdo sobre el saldo con el que
          // arranca cada mes. Ver costo-descubierto.mjs — el modelo reproduce al centavo el cargo
          // que el banco hizo el 14/07, así que no es una estimación de escritorio.
          {
            nombre: 'Intereses del acuerdo en descubierto (proyectados)',
            descubierto: true,
            nota: 'TNA 55% sobre el saldo con el que arranca el mes, con IVA e impuestos (×1,12). Es un PISO: no cobra la deuda que se toma dentro del mismo mes, así que el mes en que la caja se da vuelta muestra $0.',
          },
          // Tampoco sale de Compras: el banco lo debita solo, sin factura, sobre cada movimiento de
          // la cuenta. 0,6% de cada lado — verificado al 99,1% contra el extracto (impuesto-cheque.mjs).
          // Tampoco sale de Compras, y por la misma razón que el impuesto al cheque: el banco lo
          // debita solo, sin factura. La línea de arriba ("Cuotas de crédito prendario y gastos
          // bancarios") dice "gastos bancarios" pero lee el rubro Financiero de COMPRAS, donde no hay
          // ni una comisión — y no las va a haber. Ver COMISIONES arriba: $381.649,64 medidos en el
          // mes y medio del extracto que el cuadro proyectaba como $0.
          {
            nombre: 'Comisiones y gastos bancarios (Santander)',
            comisionesBancarias: true,
            nota: 'Comisión de servicio de cuenta, de clearing, de cuenta en dólares y de compensación de cheques, cada una con su IVA 21% y su percepción RG 2408 al 3% — todo lo que el banco debita sin factura. Sale del extracto (_BANCO_RAW), no de Compras. Los meses sin extracto proyectan el promedio de los que sí tienen: base de DOS meses, y julio incluye $145.888,44 de compensación de cheques que no es mensual, así que el promedio queda por encima del gasto recurrente (~$122.000/mes). Es un PISO declarado.',
          },
          {
            nombre: 'Impuesto al cheque (Ley 25.413, 0,6% de cada lado)',
            impuestoCheque: true,
            nota: '0,6% de todo lo que entra más 0,6% de todo lo que sale. Verificado al 99,1% contra el extracto. SOBREESTIMA cuando hay cobros o pagos en efectivo que no pasan por el banco: sólo se tributa sobre movimientos de cuenta.',
          },
        ],
      },
      {
        // ═══ LO QUE SALIÓ DEL BANCO Y EL CUADRO NO TIENE (01/08) ═══
        //
        // El dueño: "esos conceptos sí están en el Sheet, buscalos y consolidalos donde corresponden".
        // Medido contra la réplica del extracto: de los $14,1M, tres conceptos el cuadro ya los cuenta
        // AL PESO (prendario $1.282.811, comisiones $381.650, descubierto $282.621) y tres no:
        //
        //     AFIP                            $6.368.462   la línea de impuestos dice $0
        //     Compras con tarjeta de débito   $4.077.785   no hay ninguna línea que lo contenga
        //     Débitos automáticos (seguros)     $675.494   idem
        //
        // Misma causa las tres: salieron de la cuenta y NO tienen comprobante cargado en Compras. El
        // cuadro suma Compras, así que no los ve. El banco prueba que salieron.
        //
        // NO SUMA, Y ESO ES LO IMPORTANTE. Sumarlas cerraría el total hoy y el día que alguien cargue
        // la factura del seguro ese gasto quedaría contado DOS veces —una por el banco y otra por
        // Compras— con el control del pie cerrando igual, porque las dos salen del mismo lado. Se
        // muestran al lado, como las cobranzas esperadas: la plata deja de ser invisible sin arriesgar
        // contarla dos veces, y cuando se carguen las facturas estas líneas bajan solas a cero.
        nombre: 'ℹ Salió del banco y no está cargado en Compras (control, no suma al flujo)', signo: 0,
        lineas: [
          { nombre: 'AFIP — pagos debitados de la cuenta', bancoNat: 'AFIP', detalle: 'Impuestos y Financieros' },
          { nombre: 'Consumos con tarjeta de débito', bancoNat: 'Compras con tarjeta de débito', detalle: 'Compras' },
          { nombre: 'Débitos automáticos (seguros)', bancoNat: 'Débitos automáticos (seguros)', detalle: 'Recurrentes' },
        ],
      },
    ],
  },
]

/**
 * NÚCLEO PURO: verifica que el cuadro contable cubra TODOS los rubros de Compras, exactamente una vez.
 *
 * Es la misma propiedad que defiende rubro-caja.mjs, un nivel más arriba. Sin este chequeo, agregar
 * un rubro nuevo y olvidarse de ubicarlo en una actividad lo dejaría fuera del estado de flujo EN
 * SILENCIO — que es el bug que este archivo entero vino a matar, ahora con más lugares donde
 * esconderse.
 * @returns {{lineas:Array, rubrosUsados:Array<string>}}
 */
export function verificarCuadro() {
  const lineas = CUADRO.flatMap((a) => a.grupos.flatMap((g) => g.lineas))
  // ═══ UN MEMO NO OCUPA EL RUBRO, PERO TIENE QUE SER UN MEMO DE VERDAD (01/08) ═══
  //
  // "Sueldos de administración" aparece dos veces a propósito: la línea que SUMA lee la planilla de
  // nómina y la de abajo lee Compras para que la brecha entre las dos fuentes se vea. La segunda no
  // suma, así que no duplica plata y no puede consumir el rubro.
  //
  // Pero "no suma" no es una promesa: es una propiedad del grupo donde vive (`signo: 0`). Si alguien
  // mueve esa línea a un grupo con signo −1, el cuadro contaría el sueldo dos veces y el control del
  // pie —que compara contra el total de Compras— seguiría cerrando, porque las dos líneas salen del
  // mismo lado. Por eso se verifica acá, que es donde se puede ver el grupo.
  const memoFueraDeMemo = CUADRO.flatMap((a) => a.grupos.flatMap(
    (g) => g.lineas.filter((l) => l.desdeCompras && g.signo !== 0).map((l) => `${l.nombre} (grupo "${g.nombre}")`)))
  if (memoFueraDeMemo.length) throw new Error(`cash-flow-lineas: líneas de control que SÍ suman al flujo — contarían dos veces el mismo rubro: ${memoFueraDeMemo.join(', ')}`)
  const usados = lineas.filter((l) => !l.desdeCompras).map((l) => l.rubro).filter(Boolean)
  const dup = usados.filter((r, i) => usados.indexOf(r) !== i)
  if (dup.length) throw new Error(`cash-flow-lineas: rubros repetidos en el cuadro: ${dup.join(', ')}`)
  const faltan = RUBROS.filter((r) => !usados.includes(r))
  if (faltan.length) throw new Error(`cash-flow-lineas: rubros sin ubicar en ninguna actividad: ${faltan.join(', ')}`)
  const sobran = usados.filter((r) => !RUBROS.includes(r))
  if (sobran.length) throw new Error(`cash-flow-lineas: el cuadro nombra rubros que no existen: ${sobran.join(', ')}`)
  // El corte de bienes de uso sólo cierra si alguien se queda con el resto de ese rubro.
  const soloSub = lineas.filter((l) => l.soloSub).map((l) => l.soloSub)
  const excl = lineas.filter((l) => l.excluirSub).map((l) => l.excluirSub)
  for (const s of soloSub) {
    if (!excl.includes(s)) throw new Error(`cash-flow-lineas: "${s}" se muestra aparte pero nadie lo excluye de su rubro — se contaría dos veces`)
  }
  return { lineas, rubrosUsados: usados }
}

/** El total de un rubro sobre Compras entera, para el control del pie. PURA. */
export function formulaTotalRubro(rubro) {
  return `SUMIF(${COL_RUBRO};"${rubro}";${COL_TOTAL})`
}

/**
 * NÚCLEO PURO: la expresión del monto REAL de una línea del cuadro, en una ventana de fechas.
 * Una sola función para los cinco casos, para que no vuelva a haber una fórmula por pestaña.
 * @param {object} l línea del CUADRO
 * @param {string} desde expresión de inicio · @param {string} hasta límite EXCLUYENTE
 * @returns {string} fórmula es-AR SIN el "=" inicial
 */
export function expresionReal(l, desde, hasta) {
  // La línea de cheques y tarjeta NO tiene fórmula: el cruce por número de comprobante hay que
  // normalizarlo de los dos lados ("0001-000036" vs "1-36") y eso en fórmula sería ilegible. La
  // llena el script con VALORES y el agente la reescribe cada 2 horas. Devolver null es la señal.
  // La de IVA/IIBB tampoco: su fórmula (mensual/semanal) la arma el generador con las filas ubicadas.
  if (l.cheques || l.calendarioImpuestos) return null
  if (l.cobranzas) return formulaCobranzas(l.cobranzas, desde, hasta, l.modo).slice(1)
  if (l.rubro === 'Nómina · Jornales de obra') return formulaJornales(desde, hasta).slice(1)
  // `desdeCompras` es la marca del MEMO: la misma línea, leída de la otra fuente, para que la brecha
  // entre la planilla y lo cargado en Compras se vea en el cuadro. Sin esta marca las dos líneas
  // darían el mismo número y el control no controlaría nada.
  if (l.rubro === 'Nómina · Sueldos administración' && !l.desdeCompras) return formulaAdministracion(desde, hasta).slice(1)
  // El control banco↔cuadro: lo que salió de la cuenta por esa naturaleza. Vive SIEMPRE en un grupo
  // con signo 0 (lo exige verificarCuadro), así que no puede duplicar plata del cuadro.
  if (l.bancoNat) return formulaBancoPorNaturaleza(l.bancoNat, desde, hasta).slice(1)
  if (l.oficina) return formulaOficina(desde, hasta).slice(1)
  const ventana = `${COL_FECHA};">="&${desde};${COL_FECHA};"<"&${hasta}`
  // Los bienes de uso salen por su SUB-rubro (columna AF), no por el rubro: son una parte de
  // Estructura que la norma manda mostrar en otra actividad.
  if (l.soloSub) return `SUMIFS(${COL_TOTAL};${COL_SUB};"${l.soloSub}";${ventana})`
  const total = `SUMIFS(${COL_TOTAL};${COL_RUBRO};"${l.rubro}";${ventana})`
  // ...y el resto del rubro se muestra acá, restando lo que se fue a inversión. Las dos líneas
  // juntas dan el rubro completo: por eso el control del pie sigue cerrando en $0.
  if (l.excluirSub) return `(${total}-SUMIFS(${COL_TOTAL};${COL_SUB};"${l.excluirSub}";${ventana}))`
  return total
}

/**
 * NÚCLEO PURO: la fórmula de una línea en un MES, con proyección si el mes todavía no pasó.
 * @param {object} l línea del CUADRO
 * @param {string} colMes letra de la columna del mes · @param {string} colTabla la equivalente en la pestaña de detalle
 * @param {number} filaCab fila del encabezado con las fechas
 */
export function formulaLineaMes(l, colMes, colTabla, filaCab, filasTabla = {}) {
  if (l.cheques || l.calendarioImpuestos) return null
  const mes = `${colMes}$${filaCab}`
  const real = expresionReal(l, mes, `EOMONTH(${mes};0)+1`)
  // Un bien de uso no tiene ritmo: comprar una moto en enero no significa comprar una por mes. Es
  // el mismo error que el SAC, y la misma regla lo mata.
  const p = l.soloSub ? null : PROYECCION[l.rubro]
  // LA OFICINA YA VIENE PROYECTADA HASTA DICIEMBRE en su propio bloque (ajustada por inflación, mes por
  // mes). Volver a proyectarla acá sobre el ritmo de los últimos tres meses sería contar dos veces la
  // misma proyección — y encima con una fórmula que buscaría por un rubro que esta línea no tiene.
  if (p === null || l.cobranzas || l.oficina) return `=${real}`
  let proy
  if (p?.tipo === 'tabla') {
    const fila = filasTabla[p.pestaña]
    if (!fila) throw new Error(`cash-flow-lineas: no sé en qué fila de "${p.pestaña}" está "${p.rotulo}" — sin eso la referencia sería a una fila muerta`)
    proy = `${p.pestaña}!${colTabla}$${fila}`
  } else {
    // LOS TRES MESES CERRADOS, SIN EL MES EN CURSO. La ventana anterior llegaba hasta el fin del
    // mes corriente y dividía por 3: metía un mes a medio transcurrir en el promedio, así que el
    // ritmo salía más bajo cuanto más temprano se miraba. Un mes que todavía no terminó no es una
    // observación completa. Además ahora coincide exactamente con la ventana del núcleo Postgres,
    // que es la condición para que la web y la planilla digan lo mismo.
    const ventana = `${expresionReal(l, 'EOMONTH(TODAY();-4)+1', 'EOMONTH(TODAY();-1)+1')}/3`
    const factor = `IFERROR(INDEX(Parámetros!$C$74:$C$90;MATCH(EOMONTH(${mes};0);ARRAYFORMULA(EOMONTH(Parámetros!$A$74:$A$90;0));0));1)`
    const mesesConGasto = `SUMPRODUCT(--(COUNTIFS(${COL_RUBRO};"${l.rubro}";${COL_FECHA};">="&${MESES_CAB};${COL_FECHA};"<"&EOMONTH(${MESES_CAB};0)+1)>0))`
    proy = `IF(${mesesConGasto}<${MIN_MESES};0;${ventana}*${factor})`
  }
  return `=IF(EOMONTH(${mes};0)<=EOMONTH(TODAY();0);${real};MAX(${real};${proy}))`
}

/**
 * NÚCLEO PURO: el interés del descubierto de UNA SEMANA, para las columnas del Cash Flow Semanal.
 *
 * POR QUÉ EXISTE (item del dueño). El mensual ya calcula el interés del descubierto (formulaInteresMes,
 * en costo-descubierto.mjs) pero el semanal lo dejaba VACÍO. El dueño pidió que también se calcule por
 * semana. Esta función NO inventa un cálculo nuevo: es el MISMO modelo verificado del mensual —importa
 * TASAS y el contrato REAL de costo-descubierto.mjs, no los redefine— con la ÚNICA diferencia de la
 * VENTANA: siete días en vez de DAY(EOMONTH(...)), y el rango del interés ya cobrado acotado a la semana.
 *
 * SOBRE EL SALDO CON EL QUE ARRANCA LA SEMANA. El interés se proyecta sobre "Efectivo al inicio" de esa
 * misma columna, que es el cierre de la semana anterior —ya resuelto cuando le toca el turno a esta—:
 * no hay circularidad (el interés no referencia el cierre de su propia semana). Es un PISO, igual que el
 * mensual: no cobra la deuda que se toma dentro de la misma semana, y lo que el banco YA cobró en la
 * semana manda (MAX contra el real de _BANCO_RAW).
 *
 * @param {string} saldoInicial celda "Efectivo al inicio" de la columna de la semana (cierre de la anterior)
 * @param {string} desde expresión de la fecha del lunes de la semana (ej. 'B$3')
 * @param {string} hasta expresión del límite superior EXCLUYENTE (ej. 'B$3+7')
 * @returns {string} fórmula es-AR
 */
export function formulaInteresSemana(saldoInicial, desde, hasta) {
  const diaria = `${TASAS.tna}/${TASAS.base}`
  const conImp = `*(1+${TASAS.iva}+${TASAS.percepcion})`
  const DIAS = 7 // una semana; el mensual usa DAY(EOMONTH(mes;0)). Es la única diferencia con el modelo mensual.
  const proyectado = `IF(N(${saldoInicial})>=0;0;-${saldoInicial}*${diaria}*${DIAS}${conImp})`
  const R = REAL_DESCUBIERTO
  const rango = (c) => `${R.hoja}!$${c}$4:$${c}`
  // Lo que el banco YA cobró DENTRO de la semana [desde, hasta): ventana semi-abierta, igual que las
  // demás columnas del semanal. En el mensual la ventana es del mes; acá, de la semana. Mismo dato.
  const real = `SUMIFS(${rango(R.importe)};${rango(R.naturaleza)};"${R.marca}";${rango(R.fecha)};">="&${desde};${rango(R.fecha)};"<"&${hasta})`
  return `=MAX(${proyectado};IFERROR(-${real};0))`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS COMISIONES DEL BANCO — EL COSTO QUE NO TENÍA LÍNEA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE (31/07). El cuadro tenía una línea "Cuotas de crédito prendario y gastos bancarios"
// que lee el rubro "Financiero" de COMPRAS. Ahí no hay ni una comisión bancaria, y no las va a haber
// nunca: el banco no factura el mantenimiento de cuenta, lo debita solo. Resultado: los $381.649,64
// que el Santander se llevó en el mes y medio del extracto no estaban en ninguna línea del cash flow,
// y encima se leían como pagos a proveedores porque `clasificarMovimiento` los dejaba caer en su cajón
// de sastre. Un costo fijo de ~$122.000/mes que el cuadro proyectaba como $0.
//
// LA LÍNEA LEE EL BANCO, COMO EL DESCUBIERTO Y EL IMPUESTO AL CHEQUE. Son las tres cosas que el cuadro
// no puede sacar de una pestaña de gastos porque no pasan por una factura. El único registro es el
// extracto, replicado en _BANCO_RAW con su naturaleza en la columna F.
//
// LA PROYECCIÓN DE LOS MESES SIN EXTRACTO: el promedio de los meses que SÍ tienen, calculado sobre la
// propia réplica —no sobre la fila del cuadro, que sería circular—. Los meses con dato se cuentan con
// el mismo SUMPRODUCT/COUNTIFS que usa el resto del archivo contra la espina de doce meses, así que
// cuando entre el extracto de agosto la proyección se corrige sola.
//
// LA BASE ES FINA Y SE DECLARA: dos meses, y uno de ellos (julio) trae $145.888,44 de comisión de
// compensación de cheques que NO es mensual. El promedio queda por encima del gasto recurrente. En un
// costo, sobreestimar es el error barato — es la misma decisión que en el descubierto.

/** De dónde salen las comisiones del banco. Es contrato con banco-raw-pestana.mjs y con NAT.comisiones. */
export const COMISIONES = {
  hoja: '_BANCO_RAW',
  fecha: 'A',
  importe: 'C',
  naturaleza: 'F',
  marca: 'Comisiones y gastos bancarios',
}

const rangoCom = (c) => `${COMISIONES.hoja}!$${c}$4:$${c}`

/**
 * NÚCLEO PURO: las comisiones que el banco YA cobró en una ventana [desde, hasta).
 * En POSITIVO: el extracto las trae negativas y el cuadro muestra los egresos en positivo dentro de
 * su categoría (la categoría entra restando al flujo).
 * @returns {string} expresión es-AR SIN el "=" inicial
 */
export function expresionComisiones(desde, hasta) {
  return `-SUMIFS(${rangoCom(COMISIONES.importe)};${rangoCom(COMISIONES.naturaleza)};"${COMISIONES.marca}"`
    + `;${rangoCom(COMISIONES.fecha)};">="&${desde};${rangoCom(COMISIONES.fecha)};"<"&${hasta})`
}

/**
 * NÚCLEO PURO: el promedio mensual de comisiones sobre los meses que tienen extracto.
 * No referencia la fila del cuadro: sale entera de la réplica, así que no puede ser circular.
 */
export function expresionComisionesPromedio() {
  const total = `-SUMIFS(${rangoCom(COMISIONES.importe)};${rangoCom(COMISIONES.naturaleza)};"${COMISIONES.marca}")`
  const meses = `SUMPRODUCT(--(COUNTIFS(${rangoCom(COMISIONES.naturaleza)};"${COMISIONES.marca}"`
    + `;${rangoCom(COMISIONES.fecha)};">="&${MESES_CAB};${rangoCom(COMISIONES.fecha)};"<"&EOMONTH(${MESES_CAB};0)+1)>0))`
  return `IF(${meses}=0;0;${total}/${meses})`
}

/**
 * NÚCLEO PURO: la línea de comisiones bancarias de UN MES.
 * Mes cerrado o en curso → lo que el banco cobró. Mes futuro → el mayor entre lo cobrado (puede haber
 * un cargo adelantado) y el promedio de los meses con extracto. Es un PISO, igual que el descubierto.
 * @param {string} celdaMes celda con el primer día del mes (ej. 'B$3')
 */
export function formulaComisionesMes(celdaMes) {
  const real = expresionComisiones(celdaMes, `EOMONTH(${celdaMes};0)+1`)
  return `=IF(EOMONTH(${celdaMes};0)<=EOMONTH(TODAY();0);${real};MAX(${real};${expresionComisionesPromedio()}))`
}

/**
 * NÚCLEO PURO: la línea de comisiones bancarias de UNA SEMANA.
 *
 * EL BANCO LAS COBRA A FIN DE MES, NO SEMANA A SEMANA — verificado en el extracto: el 29/06, el 29/07
 * y el 30/07. Repartir el promedio mensual entre las ~4,3 semanas daría el total del mes bien y el
 * timing mal, y el semanal existe justamente para el timing. Así que la proyección cae íntegra en la
 * semana que CONTIENE el último día del mes; las demás semanas futuras muestran sólo lo real.
 * @param {string} desde expresión del lunes de la semana · @param {string} hasta límite EXCLUYENTE
 */
export function formulaComisionesSemana(desde, hasta) {
  const real = expresionComisiones(desde, hasta)
  // ¿el cierre del mes del lunes cae dentro de [desde, hasta)? Entonces es la semana del cargo.
  const esLaSemanaDelCierre = `(EOMONTH(${desde};0)>=${desde})*(EOMONTH(${desde};0)<${hasta})`
  return `=MAX(${real};${esLaSemanaDelCierre}*${expresionComisionesPromedio()})`
}

/**
 * De dónde sale la proyección de una línea, para explicarlo en el Sheet. PURA.
 *
 * ═══ CORTAS A PROPÓSITO ═══
 *
 * Estas frases viven en una columna de 276px, donde entran unos 48 caracteres. Las que había medían
 * 90 y se cortaban a mitad de palabra en diecisiete filas: la explicación de por qué un número es lo
 * que es quedaba ilegible justo en el cuadro que se mira para decidir.
 *
 * La regla que se aplicó: la celda dice QUÉ, en una línea que entra; el POR QUÉ completo vive en la
 * nota de la celda, que la pone reparar-textos.mjs. Nada se perdió — cambió de lugar.
 */
export function origenLinea(l) {
  if (l.nota) return l.nota
  if (l.cobranzas) return 'cobros ya facturados, con su fecha de cobro'
  if (l.cheques) return 'cheques y tarjeta YA emitidos: fecha cierta'
  if (l.soloSub) return 'no se proyecta: es una decisión, no un ritmo'
  return origenProyeccion(l.rubro)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// TRAZABILIDAD DE UN CLICK — LA ETIQUETA DE CADA SUBCONCEPTO A SU ORIGEN
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE (27/07). El dueño pidió "la mayor certeza": que al abrir el +/- de una categoría, la
// ETIQUETA de cada subconcepto (columna A) sea un vínculo que lleve exactamente a la pestaña!rango de
// donde sale ese número. El VALOR de la línea sigue siendo fórmula viva —regla de oro, nunca un número
// pegado—: el HYPERLINK envuelve SÓLO la etiqueta, el segundo argumento es el texto del rótulo, no un
// importe. Los importes de las columnas B..N no se tocan.
//
// EL GID NO SE ADIVINA. La fórmula lleva un placeholder GID{Nombre de la pestaña} que el script
// (cash-flow-rehacer) reemplaza por el sheetId real leído de getSheetMeta. Es la misma mecánica del
// atajo "IR A LA SEMANA DE HOY" (que usa el placeholder SEMGID para su propia pestaña), extendida a
// OTRAS pestañas destino. Si la pestaña destino no existe en getSheetMeta, la línea NO se hiperlinkea
// —queda etiqueta simple— y el script lo reporta. Nunca un gid ni un range inventado.

/** En qué pestaña vive el detalle de un rubro. Sale de REGLAS: una sola definición (la misma que usa
 * la sección "DÓNDE ESTÁ EL DETALLE" del Sheet, para no duplicar el criterio). PURA. */
export const detalleDeRubro = (rubro) => REGLAS.find((x) => x.rubro === rubro)?.detalle ?? 'Compras'

/** Valores de `detalle` que NO son un tab único: prosa que nombra DOS pestañas. Un HYPERLINK necesita
 * un destino único, así que estas líneas (materiales, que salen de Compras por rubro) caen a su origen
 * cierto en Compras. El resto de los `detalle` (Estructura, Recurrentes, Cargas Sociales, Jornales por
 * Quincena, Impuestos y Financieros) SÍ son pestañas reales y se hiperlinkean a ellas. */
const DETALLE_MULTI_PESTAÑA = new Set(['Proveedores y Materiales'])

/** La sangría con la que se escribe un subconcepto en la columna A. Una sola definición para que la
 * etiqueta sea idéntica quede como texto simple (fallback) o envuelta en HYPERLINK. */
export const SANGRIA_DETALLE = '    '

/** Un rango "'Pestaña'!$C$1:$C$9" → "C1:C9" (sin pestaña ni $), para el fragmento range= del HYPERLINK. PURA. */
const soloRango = (r) => String(r).split('!')[1].replace(/\$/g, '')

/**
 * NÚCLEO PURO: a qué pestaña!rango apunta el vínculo de trazabilidad de una línea de detalle.
 * Devuelve el destino MÁS específico que se puede garantizar CON CERTEZA, o null si la línea no tiene
 * pestaña de origen (las que el propio cuadro calcula sobre sus celdas —intereses del descubierto,
 * impuesto al cheque— no salen de ninguna pestaña, así que no se hiperlinkean).
 * @param {object} l línea del CUADRO
 * @param {Object<string,number>} filasTabla {pestaña: filaDelTotal} ubicada por rótulo (Estructura/Recurrentes)
 * @returns {{pestaña:string, rango:string}|null}
 */
export function destinoDetalle(l, filasTabla = {}, filasCal = {}) {
  // Las que el cuadro calcula sobre sus propias celdas: no hay pestaña de origen que mostrar. Las
  // comisiones bancarias tampoco: su origen es la RÉPLICA del extracto (_BANCO_RAW), que es una hoja
  // técnica y no una pestaña de trabajo del dueño — hiperlinkear ahí no ayuda a nadie a decidir.
  if (l.descubierto || l.impuestoCheque || l.comisionesBancarias) return null
  // IVA/IIBB: apunta a la fila "⇒ IVA a pagar" del calendario si ya se ubicó; si no, a la pestaña.
  if (l.calendarioImpuestos) {
    return { pestaña: CALENDARIO_IMPUESTOS.pestaña, rango: filasCal?.iva ? `A${filasCal.iva}` : 'A1' }
  }
  // Cheques y tarjeta (abiertas en dos líneas): cada una a la columna de monto de SU pestaña.
  if (l.cheques) {
    const inst = INSTRUMENTOS[l.inst] ?? INSTRUMENTOS.cheques
    return { pestaña: inst.pestaña, rango: soloRango(rangoInstrumento(inst, inst.colMonto)) }
  }
  // Cobranzas: la columna de monto (M) de la pestaña Cobranzas — la fuente exacta de las tres líneas de ingreso.
  if (l.cobranzas) return { pestaña: 'Cobranzas', rango: soloRango(cobRango(COB_COBERTURA.monto)) }
  // Bienes de uso (equipos y rodados): su monto sale del sub-rubro de Compras (columna AF).
  if (l.soloSub) return { pestaña: 'Compras', rango: soloRango(COL_SUB) }
  // Rubros cuya proyección la calcula su propia pestaña con una fila de TOTAL ubicada por rótulo: se
  // apunta a esa fila (el número de esta línea ES ese total). Sin la fila ubicada no se inventa una
  // celda: se cae a la columna fuente de Compras, abajo.
  const p = PROYECCION[l.rubro]
  if (p?.tipo === 'tabla' && filasTabla[p.pestaña]) return { pestaña: p.pestaña, rango: `A${filasTabla[p.pestaña]}` }
  // Resto de rubros: si el detalle es una pestaña DEDICADA real (una sola, que existe y de donde SALE
  // el número —nómina/cargas/impuestos referencian su propia pestaña), se apunta ahí. "Proveedores y
  // Materiales" NO es una pestaña: es prosa que nombra DOS (Proveedores y Materiales); esas líneas
  // salen de Compras por rubro, así que su origen cierto es la columna fuente del monto (O), igual que
  // SAC/sueldos y el fallback genérico. Nunca un destino adivinado ni un tab inexistente.
  // EL MEMO APUNTA A SU PROPIA FUENTE, NO A LA DEL RUBRO (01/08). La línea de control lee Compras
  // justamente porque el rubro ya NO se paga desde ahí: si el vínculo siguiera la regla del rubro,
  // llevaría a la pestaña de nómina —lo que la línea controla— y el control mandaría a leer el mismo
  // número que dice controlar.
  if (l.desdeCompras) return { pestaña: 'Compras', rango: soloRango(COL_TOTAL) }
  const tab = detalleDeRubro(l.rubro)
  if (tab && tab !== 'Compras' && !DETALLE_MULTI_PESTAÑA.has(tab)) return { pestaña: tab, rango: 'A1' }
  return { pestaña: 'Compras', rango: soloRango(COL_TOTAL) }
}

/**
 * NÚCLEO PURO: la fórmula HYPERLINK de la ETIQUETA de un subconcepto → su origen. El gid queda como
 * placeholder GID{pestaña} para que el script lo resuelva contra getSheetMeta (nunca se adivina).
 * Devuelve null cuando la línea no tiene pestaña de origen (ver destinoDetalle).
 * @param {object} l línea del CUADRO · @param {Object<string,number>} filasTabla
 * @returns {{formula:string, destino:string, rango:string}|null}
 */
export function hipervinculoDetalle(l, filasTabla = {}, filasCal = {}) {
  const dest = destinoDetalle(l, filasTabla, filasCal)
  if (!dest) return null
  // Las comillas del rótulo se duplican: si un nombre trajera una, cerraría la cadena de la fórmula.
  const etiqueta = `${SANGRIA_DETALLE}${l.nombre}`.replace(/"/g, '""')
  // URL COMPLETA (URLID{} = fileId, GID{} = getSheetMeta, los resuelve el script). La fila final del
  // rango la TOPA el script al tamaño real de la pestaña destino: Google da "El rango no es válido" si
  // el rango excede la grilla (Cobranzas tiene 358 filas y un M5:M400 se pasaba) y un rango abierto
  // (O4:O) tampoco navega. La función pura deja el rango tal cual; el resolver lo acota con getSheetMeta.
  const formula = `=HYPERLINK("URLID{}#gid=GID{${dest.pestaña}}&range=${dest.rango}";"${etiqueta}")`
  return { formula, destino: dest.pestaña, rango: dest.rango }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// --force NO DESTRUCTIVO — LA FUSIÓN QUE PRESERVA LO DEL DUEÑO SIGUE SIEMPRE ACTIVA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE. Para aplicar un cambio de ESTRUCTURA (mover filas, agregar/quitar líneas), el
// generador corre con --force. La tentación era que --force escribiera la grilla CRUDA, salteando la
// fusión celda a celda —y con eso pisaba ediciones del dueño—. El problema real que motivaba el atajo
// NO era la fusión en sí (que ancla al TEXTO del rótulo, no a la posición), sino un caso puntual: un
// BORRADO registrado (reemplazo vacío) —posiblemente falso o viejo— que, al cambiar el tamaño de la
// grilla, terminaba borrando un header que el generador SÍ quiere escribir.
//
// LA SOLUCIÓN, SIN APAGAR LA FUSIÓN. Bajo --force la fusión sigue, pero sólo se aplican las ediciones
// del dueño con CONTENIDO REAL (un renombre: "Jornales" → "Jornales LA ESTRELLA"). Los borrados
// (reemplazo vacío) NO se aplican en la corrida forzada: así un cambio de estructura no puede perder un
// header del generador por un borrado que apunta a texto vacío. El borrado real del dueño no se olvida
// —se sigue persistiendo el registro completo— y se re-detecta en la próxima corrida NORMAL, de a uno.

/**
 * NÚCLEO PURO: se queda sólo con las ediciones del dueño que tienen CONTENIDO REAL (renombres), y
 * descarta los borrados (reemplazo vacío o sólo espacios). Se usa en la corrida --force para que un
 * cambio de tamaño de la grilla no borre un header del generador vía un borrado falso/viejo.
 * @param {Map<string,string>} ediciones texto mío → texto del dueño ('' = borrado)
 * @returns {Map<string,string>} el subconjunto con reemplazo no vacío
 */
export function edicionesConContenidoReal(ediciones = new Map()) {
  return new Map([...ediciones].filter(([, v]) => String(v ?? '').trim() !== ''))
}
