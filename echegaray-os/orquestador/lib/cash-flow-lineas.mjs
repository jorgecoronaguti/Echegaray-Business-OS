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

import { REGLAS } from './rubro-caja.mjs'

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
  const q = "'Jornales por Quincena'"
  // Bloque 1: quincenas reales (B3:B16 = desde, J = total pagado).
  const real = `SUMPRODUCT(ISNUMBER(${q}!$B$3:$B$16)*(${q}!$B$3:$B$16>=${desde})*(${q}!$B$3:$B$16<${hasta})*IF(ISNUMBER(${q}!$J$3:$J$16);${q}!$J$3:$J$16;0))`
  // Bloque 2: quincenas proyectadas (B24:B33 = desde, G = total estimado).
  const proy = `SUMPRODUCT(ISNUMBER(${q}!$B$24:$B$33)*(${q}!$B$24:$B$33>=${desde})*(${q}!$B$24:$B$33<${hasta})*IF(ISNUMBER(${q}!$G$24:$G$33);${q}!$G$24:$G$33;0))`
  return `=${real}+${proy}`
}

/**
 * NÚCLEO PURO: las tres líneas de ingreso, leyendo Cobranzas.
 * La fecha de cobro es la real (columna Q) si ya se cobró, si no la de vencimiento (P): es la mejor
 * estimación disponible de CUÁNDO entra la plata. Cash flow es percibido, nunca devengado.
 * @returns {string} fórmula es-AR
 */
export function formulaCobranzas(tipo, desde, hasta) {
  const C = 'Cobranzas'
  const fecha = `IF(ISNUMBER(${C}!$Q$5:$Q$200);${C}!$Q$5:$Q$200;IF(ISNUMBER(${C}!$P$5:$P$200);${C}!$P$5:$P$200;0))`
  const monto = `IF(ISNUMBER(${C}!$M$5:$M$200);${C}!$M$5:$M$200;0)`
  const uni = `LOWER(${C}!$F$5:$F$200)`
  const filtro = tipo === 'otras'
    ? `(${uni}<>"civil")*(${uni}<>"mantenimiento")*(${C}!$F$5:$F$200<>"")`
    : `(${uni}="${tipo}")`
  return `=SUMPRODUCT(${filtro}*(${fecha}>=${desde})*(${fecha}<${hasta})*${monto})`
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
  const rangoRubros = `$A${filaPrimerEgreso}:$A${filaUltimoEgreso}`
  return [
    {
      etiqueta: 'Compras — total cargado',
      formula: `=SUM(${COL_TOTAL})`,
      nota: 'Todo lo que hay en la pestaña Compras, sin filtrar.',
    },
    {
      etiqueta: 'Suma de las líneas de egreso (a valores de Compras)',
      formula: `=SUMPRODUCT(SUMIF(${COL_RUBRO};${rangoRubros};${COL_TOTAL}))`,
      nota: 'Cada línea de arriba, sumada sobre Compras entera. Si una línea faltara, esto daría menos.',
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
      etiqueta: 'Jornales: Compras (estimado) vs planilla real',
      formula: `=SUMIF(${COL_RUBRO};"Nómina · Jornales de obra";${COL_TOTAL})`,
      nota: 'El cash flow NO usa este número: usa el real de Jornales por Quincena. Por eso el total de egresos del año no coincide con el total de Compras, y está bien que no coincida.',
    },
  ]
}
