// RANGOS CON NOMBRE — para que un número tenga UNA dirección estable en todo el archivo.
//
// POR QUÉ (21/07). El Cash Flow Mensual es una pestaña "calculada": la regla es que TODO tiene que
// ser fórmula, porque un número pegado no se puede auditar y el día que cambia el dato de origen
// miente sin avisar. Pero el bloque de cobertura mostraba las cifras de ARCA —cuántos comprobantes,
// por cuánto— y ésas no salen del Sheet: salen de Postgres. Las escribí pegadas y el auditor me lo
// marcó: 8 números a mano en la pestaña más importante del archivo.
//
// LA SALIDA NO ES RELAJAR LA REGLA, es darle a esos números un lugar donde SÍ corresponden. Viven
// en "Proveedores y Materiales", que es una pestaña RÉPLICA (su origen declarado es el libro de IVA
// de ARCA), y el Cash Flow los referencia por nombre. Así hay un solo lugar donde el número existe
// y cualquier otra pestaña lo mira.
//
// POR QUÉ POR NOMBRE Y NO POR CELDA. Las dos pestañas se reescriben enteras cada 2 horas y el
// bloque se corre de fila según cuántos proveedores o cuántas notas de crédito haya ese día. Una
// referencia 'Proveedores y Materiales'!D147 apunta a otra cosa mañana, en silencio. El nombre
// sobrevive porque el rango se actualiza junto con la pestaña.

/** Los números de ARCA que el resto del archivo puede mirar. El nombre es el contrato. */
export const ARCA = {
  comprobantes: 'ARCA_COMPRAS_N',
  total: 'ARCA_COMPRAS_TOTAL',
  notasN: 'ARCA_NOTAS_N',
  notasMonto: 'ARCA_NOTAS_MONTO',
  enComprasN: 'ARCA_EN_COMPRAS_N',
  enComprasMonto: 'ARCA_EN_COMPRAS_MONTO',
  sinNumeroN: 'ARCA_SIN_NUMERO_N',
  sinNumeroMonto: 'ARCA_SIN_NUMERO_MONTO',
  faltanN: 'ARCA_FALTAN_N',
  faltanMonto: 'ARCA_FALTAN_MONTO',
  ventasN: 'ARCA_VENTAS_N',
  ventasMonto: 'ARCA_VENTAS_MONTO',
}

/**
 * NÚCLEO PURO: los pedidos de la API para dejar un conjunto de nombres apuntando donde toca.
 * Actualiza el que ya existe en vez de crear otro — la API no falla al duplicar un nombre, se queda
 * con dos y las fórmulas empiezan a leer el equivocado.
 *
 * @param {Array<{name:string, fila:number, col:number}>} destinos fila y columna 1-indexadas
 * @param {Array<{name:string, namedRangeId:string}>} existentes lo que ya hay en el archivo
 */
export function pedidos(sheetId, destinos = [], existentes = []) {
  return destinos.map((d) => {
    const range = {
      sheetId,
      startRowIndex: d.fila - 1, endRowIndex: d.fila,
      startColumnIndex: d.col - 1, endColumnIndex: d.col,
    }
    const ya = existentes.find((r) => r.name === d.name)
    return ya
      ? { updateNamedRange: { namedRange: { namedRangeId: ya.namedRangeId, name: d.name, range }, fields: 'name,range' } }
      : { addNamedRange: { namedRange: { name: d.name, range } } }
  })
}

/** Publica los nombres. Falla silenciosamente NO: si no se puede, el que llama se entera. */
export async function publicar(google, fileId, sheetId, destinos = []) {
  if (!destinos.length) return { nombres: 0 }
  const existentes = await google.getNamedRanges(fileId).catch(() => [])
  await google.spreadsheetBatchUpdate(fileId, pedidos(sheetId, destinos, existentes))
  return { nombres: destinos.length }
}
