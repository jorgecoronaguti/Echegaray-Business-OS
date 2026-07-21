// LA ESCALA SALARIAL DEL CONVENIO, LEÍDA DE LA RÉPLICA Y NO PEGADA A MANO.
//
// POR QUÉ EXISTE (21/07). El cuadro "ESCALA UOCRA — CCT 76/75" de la pestaña Jornales tenía once
// números escritos a mano: $6.800 el Oficial Especializado, $5.817 el Oficial, $4.948 el Ayudante.
// Ningún script lo escribía — es contenido HUÉRFANO, como lo fue el bloque de SAC: alguien lo pegó
// en julio y ahí quedó.
//
// Y ya estaba viejo. La réplica del convenio (_UOCRA_RAW) que vive en el mismo archivo trae la
// escala de AGOSTO (+1,9%: $7.420 el Oficial Especializado) desde el Acuerdo Mayo 2026. El cuadro
// que sirve para saber si estamos pagando por encima o por debajo del convenio comparaba contra una
// escala vencida, y nada lo avisaba. Un jornal por debajo del convenio es deuda laboral, no ahorro.
//
// ═══ POR QUÉ LA RÉPLICA NO SE PUEDE CONSULTAR DIRECTO ═══
//
// _UOCRA_RAW es una copia fiel del acuerdo, con la forma del acuerdo: el mes aparece UNA vez, en la
// primera de las cinco filas del grupo, y viene con el porcentaje pegado y saltos de línea adentro
// ("Julio\n+2%", "Febrero\n(1,8%\ns/Ene)"). Las otras cuatro filas tienen la columna de mes vacía.
//
// NO SE TOCA LA RÉPLICA PARA ARREGLAR ESO. Es un dato de origen y la reescribe una persona pegando
// el acuerdo nuevo; agregarle columnas calculadas las perdería en el próximo pegado. Se resuelve del
// lado del que consulta: se ubica la fila del mes por su nombre y se baja por un desplazamiento
// fijo, que es el orden de categorías del convenio y no cambia entre acuerdos.

/** El orden de las categorías dentro de cada mes de la escala. Es la estructura del convenio. */
export const CATEGORIAS = ['Oficial Especializado', 'Oficial', 'Medio Oficial', 'Ayudante', 'Sereno']

/** Dónde vive cada dato en la réplica. La zona la fija la empresa: San Juan es ZONA A. */
export const COL = { mes: 'A', categoria: 'B', unidad: 'C', basico: 'D', zonaA: 'H' }
export const HOJA = '_UOCRA_RAW'

/**
 * NÚCLEO PURO: el desplazamiento de una categoría dentro de su grupo mensual.
 * @param {string} categoria
 * @returns {number} 0..4
 */
export function offsetCategoria(categoria) {
  const i = CATEGORIAS.indexOf(categoria)
  if (i < 0) throw new Error(`categoría fuera del convenio: ${categoria}`)
  return i
}

/**
 * NÚCLEO PURO: la expresión que ubica la fila del mes vigente dentro de la réplica.
 *
 * EL COMODÍN NO ES PEREZA: el rótulo real es "Julio\n+2%" y el mes hay que reconocerlo por su
 * nombre, no por igualdad. TEXT(...;"mmmm") devuelve el mes en el idioma del archivo —"julio"— y
 * MATCH no distingue mayúsculas, así que "julio*" encuentra "Julio\n+2%".
 *
 * LA TABLA ESTÁ EN ORDEN DESCENDENTE (agosto arriba) y MATCH devuelve la PRIMERA coincidencia: el
 * día que la réplica tenga dos años cargados, gana el acuerdo más nuevo. Es lo que corresponde.
 *
 * @param {string} fecha expresión de la fecha con la que se decide el mes vigente
 * @returns {string}
 */
export function expresionFilaDelMes(fecha = 'TODAY()') {
  return `MATCH(TEXT(${fecha};"mmmm")&"*";${HOJA}!$${COL.mes}$1:$${COL.mes};0)`
}

/**
 * NÚCLEO PURO: la fórmula del valor de una categoría para el mes vigente.
 *
 * SI EL MES NO ESTÁ EN LA RÉPLICA NO DEVUELVE CERO. Un cero acá diría "el convenio paga $0" y el
 * cuadro de comparación mostraría que pagamos infinitamente por encima. Devuelve vacío, y el aviso
 * de más abajo dice que la escala se quedó sin actualizar.
 *
 * @param {string} categoria una de CATEGORIAS
 * @param {string} col columna de la réplica (COL.zonaA por defecto: San Juan es Zona A)
 * @param {string} fecha expresión de fecha
 * @returns {string} fórmula es-AR
 */
export function formulaValor(categoria, col = COL.zonaA, fecha = 'TODAY()') {
  const off = offsetCategoria(categoria)
  const suma = off ? `+${off}` : ''
  return `=IFERROR(INDEX(${HOJA}!$${col}$1:$${col};${expresionFilaDelMes(fecha)}${suma});"")`
}

/**
 * NÚCLEO PURO: el aviso de vigencia. Dice QUÉ mes de la escala se está mostrando y grita si el mes
 * en curso no está cargado en la réplica.
 *
 * Sin esto, una escala vencida se ve exactamente igual que una al día — que es como el cuadro pasó
 * de julio a agosto sin que nadie se enterara.
 *
 * @param {string} fecha expresión de fecha
 * @returns {string}
 */
export function formulaVigencia(fecha = 'TODAY()') {
  return `=IFERROR(INDEX(${HOJA}!$${COL.mes}$1:$${COL.mes};${expresionFilaDelMes(fecha)})&"";`
    + `"⚠ el mes en curso NO está en "&"${HOJA}"&": la escala que se muestra quedó vencida. Cargar el acuerdo nuevo.")`
}
