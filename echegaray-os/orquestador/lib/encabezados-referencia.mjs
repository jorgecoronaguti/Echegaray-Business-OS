// LOS ENCABEZADOS REALES DE COMPRAS Y COBRANZAS — medidos, congelados y con la inserción de «Obra».
//
// ═══ POR QUÉ EXISTEN ═══
//
// El dueño decidió (14/09/2026) insertar la columna «Obra» AL LADO de la de obra que ya existe:
// Compras L (entre «Detalles / Obra» y «Concepto») y Cobranzas H (entre «Obra / Cliente» y «ORDEN DE
// COMPRA»). Todo lo que estaba a la derecha se corre una letra. El código tiene que funcionar ANTES y
// DESPUÉS de esa inserción, y la única forma de probarlo sin tocar el Sheet es tener los dos
// encabezados, textuales, y correr cada resolvedor contra los dos.
//
// Son también el layout de REFERENCIA de los exports estáticos que todavía existen (`CONTRATO`,
// `COL`, `GRUPOS_FORMULA`): los usan tests y scripts de diagnóstico. El que escribe resuelve contra
// la fila de rótulos VIVA (`columnas-por-encabezado.mjs`), nunca contra éstos.

/** Compras!A3:AN3, leído el 25/08/2026 (y sin cambios al 14/09/2026). */
export const COMPRAS_2508 = Object.freeze([
  'ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo',
  'N° Comprobante', 'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Concepto',
  'Importe', 'IVA', 'Total', 'Tipo pago', 'Fecha prevista de pago (día)',
  'Fecha prevista de pago (mes)', 'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1',
  'Fecha prevista de pago 2', 'Monto Parcial 2', 'Estado', 'Tipo de Costo', 'Estado pago',
  'Estado Carga', 'Rubro de caja', 'Rubro de caja', 'Fecha de caja', 'Familia de material',
  'Sub-rubro de estructura', 'Orden de pago (OS)', 'Orden de pago (OS)', 'Orden sin fecha (OS)',
  '¿Proveedor comercial? (OS)', '¿Comprobante repetido? (OS)', 'Saldo pendiente (OS)', 'CUIT (OS)',
  'Tramo de vencimiento (OS)',
])

/** Cobranzas!A4:AC4, leído el 14/09/2026. La AB vacía y la AC «Asignación» son del archivo real. */
export const COBRANZAS_1409 = Object.freeze([
  'ID', 'Categoría', 'Fecha de Venta', 'Factura', 'N° Comprobante', 'Unidad', 'Obra / Cliente',
  'ORDEN DE  COMPRA', 'Concepto', 'Monto neto', 'IVA', 'Retenciones / descuentos',
  'TOTAL a cobrar (neto de retenciones)', 'Forma de Cobro', 'Estado', 'Fecha de Factura', 'Fecha cobro',
  'Mes cobro (auto)', 'Probabilidad %', 'Monto ponderado', 'Días hasta vto.', 'Estado cobro', 'Notas',
  'Retención 16,8% del neto ▲ rótulo original perdido', 'Ret Ganancias',
  'Retención 2,5%/3,5% del neto ▲ rótulo original perdido', 'Moneda', null, 'Asignación',
])

/** El encabezado con «Obra» insertada inmediatamente después de `despuesDe`. */
export function conObraInsertada(encabezado, despuesDe) {
  const i = encabezado.indexOf(despuesDe)
  if (i < 0) throw new Error(`no encuentro «${despuesDe}» para insertar Obra a su derecha`)
  return Object.freeze([...encabezado.slice(0, i + 1), 'Obra', ...encabezado.slice(i + 1)])
}

/** Compras con L «Obra»: lo que la pestaña va a tener después de la inserción. */
export const COMPRAS_CON_OBRA = conObraInsertada(COMPRAS_2508, 'Detalles / Obra')
/** Cobranzas con H «Obra». */
export const COBRANZAS_CON_OBRA = conObraInsertada(COBRANZAS_1409, 'Obra / Cliente')
