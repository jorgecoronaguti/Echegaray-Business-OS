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
// entraban como si devengaran. `origenes` no es opcional acá: sin él, el número de fila del libro
// podría apuntar a otra pestaña y la comparación sería contra la fila equivocada de Cobranzas.

import { terminoLibro, COBRANZA_FACTURADA } from './libro-sumas.mjs'

/** Los cuatro rubros del libro que dan crédito fiscal: compras con factura. */
export const RUBROS_CREDITO_LIBRO = ['Materiales Civil', 'Materiales Mantenimiento', 'Estructura', 'Servicios recurrentes']

/** La ventana de un mes, en expresiones de fecha del Sheet. Fin EXCLUIDO, como en todo el repo. */
export const ventanaDelMes = (anio, m) => ({ desde: `DATE(${anio};${m};1)`, hasta: `EOMONTH(DATE(${anio};${m};1);0)+1` })

/** El término del DÉBITO del mes: sólo los cobros que llevan factura. */
export const debitoFacturadoDelMes = (anio, m) => terminoLibro({
  ...ventanaDelMes(anio, m), signo: 1, rubros: ['Cobranzas'], origenes: ['Cobranzas'],
  extra: [COBRANZA_FACTURADA], medida: 'magnitud',
})

/** El término del CRÉDITO del mes: las compras con factura, netas de notas de crédito. */
export const creditoDeComprasDelMes = (anio, m) =>
  `-(${terminoLibro({ ...ventanaDelMes(anio, m), rubros: RUBROS_CREDITO_LIBRO })})`
