// Intención de CREAR/COTIZAR un presupuesto — GUARD DE COSTO. Antes se detectaba con
// /presupuest|cotiz|c[oó]mputo|.../ que matchea el SUSTANTIVO "presupuesto" en cualquier
// lado → un READ de consulta ("mostrame el presupuesto de Messina", "qué gasto hay en el
// presupuesto", "cuánto cotizamos") subía a sonnet + cargaba el método de presupuestación +
// desactivaba el caché (probe local: 7/7 reads fugaban). Presupuestar de verdad SÍ vale
// sonnet; consultar un presupuesto existente es una lectura barata.
//
// Distinción: presupuestar es una ACCIÓN. Detectamos (a) el VERBO propio de la acción en
// forma de orden/infinitivo/gerundio — cotizá/cotizar/presupuestá/presupuestar/valorizá —
// (NO su sustantivo "cotización" ni su pasado "cotizamos/cotizado"); o (b) un verbo de CREAR
// (armá/hacé/necesito/prepará/confeccioná/elaborá/completá) cerca de un sustantivo de
// presupuesto. Un simple "presupuesto/cómputo/oferta" sin verbo de crear = lectura.

const N = 'presupuest|c[oó]mputo|oferta|cotizaci[oó]n|\\bapu\\b|precios? unitario|an[aá]lisis de precio|metro cuadrado'
const V = 'arm[aá]|hac[eé]|hag|necesit|prepar|confeccion|elabor|complet'
// cotiz/valoriz EXIGEN á acentuada (o -ar/-ando/-ame): su 'a' plana es sustantivo o pasado
// ("cotización/cotizamos/cotizado", "valorización/valorizado") = lectura, no orden de cotizar.
// presupuest conserva [aá] porque su sustantivo termina en -o ("presupuesto"), no colisiona.
const ACCION = 'cotiz(?:á|ar|ando|ame)|presupuest(?:[aá]|ar|ando)|valoriz(?:á|ar|ando|ame)'

export const BUDGETING_CREATE_RE = new RegExp(
  `\\b(?:${ACCION})` +                                   // el verbo de la acción (cotizá/presupuestar/valorizá)
  `|\\b(?:${V})[^.?!\\n]{0,40}?\\b(?:${N})`,             // crear + sustantivo de presupuesto, en ese orden
  'i',
)

/** true si el pedido es CREAR/cotizar un presupuesto (no consultar uno existente). */
export function isBudgetingIntent(text) {
  return BUDGETING_CREATE_RE.test(String(text || ''))
}
