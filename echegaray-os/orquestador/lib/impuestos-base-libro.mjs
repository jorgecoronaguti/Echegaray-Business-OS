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

import { terminoLibro } from './libro-sumas.mjs'

/** Los cuatro rubros del libro que dan crédito fiscal: compras con factura. */
export const RUBROS_CREDITO_LIBRO = ['Materiales Civil', 'Materiales Mantenimiento', 'Estructura', 'Servicios recurrentes']

/** La ventana de un mes, en expresiones de fecha del Sheet. Fin EXCLUIDO, como en todo el repo. */
export const ventanaDelMes = (anio, m) => ({ desde: `DATE(${anio};${m};1)`, hasta: `EOMONTH(DATE(${anio};${m};1);0)+1` })

/**
 * EL DÉBITO DEL MES: el IVA que las facturas emitidas ese mes YA DECLARAN.
 *
 * ═══ POR QUÉ NO SE DERIVA NI SE MIRA EL COBRO (03/09/2026) ═══
 *
 * El dueño: «lo indicado con B en cobranzas es lo que tiene que considerar SIEMPRE». Cobranzas ya
 * dice, fila por fila, cuánto IVA lleva cada factura (columna K). No hay nada que calcular: se suma
 * lo que está escrito. Derivarlo con `×alícuota/(1+alícuota)` sobre un importe **neto de
 * retenciones** mezclaba caja con base imponible y sólo coincidía por casualidad.
 *
 * Y VA POR FECHA DE EMISIÓN, no de cobro. El IVA débito se devenga cuando se emite la factura —
 * regla de oro 4, P&L devengado— y así es como se arma la DDJJ. Tomarlo por mes de cobro corría la
 * plata a otro período: septiembre mostraba **$15.139.582 a pagar cuando el propio bloque de control
 * de la pestaña decía $452.447**, porque en septiembre se cobran facturas emitidas meses antes.
 *
 * Las filas `N` no entran nunca: no llevan factura, su columna K está vacía en las treinta y tres, y
 * un cobro sin factura no devenga IVA. La plata sigue entera en la caja; lo que no existe es su IVA.
 *
 * Rangos ABIERTOS y lectura VIVA: si el dueño corrige una categoría o carga una factura, el número
 * se rehace solo al abrir la planilla, sin correr ningún generador.
 */
export const debitoFacturadoDelMes = (anio, m) => {
  const B = 'Cobranzas!$B$5:$B'
  const C = 'Cobranzas!$C$5:$C'
  const { desde, hasta } = ventanaDelMes(anio, m)
  return `SUMPRODUCT((${B}="B")*ISNUMBER(${C})*(${C}>=${desde})*(${C}<${hasta})*N(Cobranzas!$K$5:$K))`
}

/** NÚCLEO PURO: el mismo número que la fórmula, para exhibirlo en el `--dry`. Índices de `A5:K`. */
export function ivaDeclaradoPorMesDeEmision(filas = []) {
  const porMes = {}
  for (const f of filas) {
    if (String(f?.[1] ?? '').trim().toUpperCase() !== 'B') continue
    const s = Number(f?.[2])
    if (!Number.isFinite(s) || !s) continue
    const d = new Date(Date.UTC(1899, 11, 30))
    d.setUTCDate(d.getUTCDate() + s)
    const per = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    porMes[per] = (porMes[per] ?? 0) + (Number(f?.[10]) || 0)
  }
  return porMes
}

/** El término del CRÉDITO del mes: las compras con factura, netas de notas de crédito. */
export const creditoDeComprasDelMes = (anio, m) =>
  `-(${terminoLibro({ ...ventanaDelMes(anio, m), rubros: RUBROS_CREDITO_LIBRO })})`
