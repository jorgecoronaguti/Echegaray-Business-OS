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
 * Los números de CAJA que el resto del archivo mira.
 *
 * POR QUÉ EXISTEN (21/07). El Cash Flow Mensual leía el saldo declarado con una referencia por
 * celda —`CAJA!$F$10:$F$14`— y el día que se insertó un bloque arriba en CAJA, esas celdas pasaron a
 * ser otra cosa: las dos filas más importantes del cuadro, "Efectivo al inicio" y "al cierre",
 * quedaron VACÍAS. Sin error, sin aviso.
 *
 * Peor todavía: el cash flow corre ANTES que CAJA en el agente, así que aunque recalcule la
 * referencia leyendo la pestaña, siempre está una corrida atrasado. Con un nombre, el orden deja de
 * importar: el nombre sigue a la celda aunque se mueva.
 */
export const CAJA = {
  total: 'CAJA_TOTAL_DISPONIBLE',
  fecha: 'CAJA_FECHA_SALDO',
}

/**
 * LO QUE LA PESTAÑA "Proveedores" LE OFRECE AL RESTO DEL ARCHIVO.
 *
 * `libreta` es la tabla proveedor → comentario que el dueño escribe a mano. La sección 1 —que desde el
 * 31/07 es un derrame de fórmula y se reordena sola en cada recálculo— la lee por nombre para traer
 * cada nota al lado de SU proveedor. Con la nota escrita al lado de la fila no alcanzaba: la fila se
 * mueve y la nota no, así que terminaba describiendo a otro proveedor.
 */
export const PROVEEDORES = {
  libreta: 'PROV_LIBRETA',
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
    // UN NOMBRE PUEDE CUBRIR UN BLOQUE, NO SÓLO UNA CELDA (31/07). La libreta de proveedores es una
    // TABLA de dos columnas que el dueño extiende hacia abajo, y su nombre tiene que seguirla: con
    // `abierto` se omite `endRowIndex`, que en la API de Sheets significa "hasta el final de la hoja".
    // Un rango con fila final se fosiliza —la fila que él agregue mañana queda afuera y el VLOOKUP que
    // lo mira devuelve vacío sin dar ningún error—, que es el mismo defecto que este archivo evita en
    // las fórmulas. Por defecto sigue siendo una celda: los doce nombres de ARCA no cambian.
    const range = {
      sheetId,
      startRowIndex: d.fila - 1,
      startColumnIndex: d.col - 1, endColumnIndex: d.col - 1 + (d.cols ?? 1),
    }
    if (!d.abierto) range.endRowIndex = d.fila - 1 + (d.filas ?? 1)
    const ya = existentes.find((r) => r.name === d.name)
    return ya
      ? { updateNamedRange: { namedRange: { namedRangeId: ya.namedRangeId, name: d.name, range }, fields: 'name,range' } }
      : { addNamedRange: { namedRange: { name: d.name, range } } }
  })
}

/**
 * NÚCLEO PURO: ¿el valor que devolvió el nombre es plausible para lo que ese nombre promete?
 *
 * ═══ POR QUÉ EXISTE (05/08) ═══
 *
 * `ARCA_FALTAN_MONTO` devolvió "0001-00000211" — un número de comprobante donde tenía que haber un
 * importe. Leídos los doce nombres del archivo, NINGUNO apuntaba a donde debía: el bloque de ARCA
 * vive en las filas 177–182 de Proveedores y los nombres apuntaban a 199–204, dentro de la LISTA de
 * faltantes. `ARCA_FALTAN_N` devolvía un CUIT.
 *
 * Nadie se enteró porque publicar un nombre siempre "funciona": la API acepta cualquier rango. Un
 * nombre que apunta a otra celda es peor que un nombre que no existe — el que no existe da #NAME? y
 * se ve; el que apunta mal devuelve un valor y se cree.
 *
 * El criterio es deliberadamente flojo: un nombre que promete plata (_MONTO, _TOTAL) no puede
 * devolver algo que parezca un comprobante o un CUIT, y uno que promete un recuento (_N) no puede
 * devolver texto. No valida que el número sea correcto —eso no se puede saber desde acá—, sólo que
 * no sea de otra especie.
 */
export function pareceSospechoso(name, valor) {
  const v = String(valor ?? '').trim()
  if (!v) return null
  const esComprobante = /^\d{3,5}-\d{6,10}$/.test(v)
  const esCuit = /^\d{2}-\d{7,8}-\d$/.test(v)
  if (esComprobante) return `"${v}" parece un N° de comprobante`
  if (esCuit) return `"${v}" parece un CUIT`
  if (/_(MONTO|TOTAL)$/.test(name) && !/\d/.test(v)) return `"${v}" no tiene un solo dígito`
  return null
}

/**
 * Publica los nombres Y LOS RELEE. Falla silenciosamente NO: si no se puede, el que llama se entera.
 *
 * La relectura es la evidencia del EFECTO. Escribir el nombre y confiar en que la API dijo que sí es
 * exactamente lo que dejó doce nombres apuntando a la lista equivocada durante quién sabe cuántas
 * corridas. La API de Sheets acepta un rango con nombre como rango de lectura, así que verificar
 * cuesta una llamada por nombre.
 *
 * NO tira: devuelve `sospechosos` para que el generador lo muestre. Un nombre mal apuntado no debería
 * frenar la escritura de una pestaña entera, pero tampoco puede pasar en silencio.
 */
export async function publicar(google, fileId, sheetId, destinos = [], { verificar = true } = {}) {
  if (!destinos.length) return { nombres: 0, sospechosos: [] }
  const existentes = await google.getNamedRanges(fileId).catch(() => [])
  await google.spreadsheetBatchUpdate(fileId, pedidos(sheetId, destinos, existentes))
  if (!verificar) return { nombres: destinos.length, sospechosos: [] }

  const sospechosos = []
  for (const d of destinos) {
    // Una lectura que falla no se convierte en "está bien": se declara como no verificada.
    const leido = await google.readSheetValues(fileId, d.name).catch(() => null)
    if (leido === null) { sospechosos.push(`${d.name}: no pude releerlo`); continue }
    const motivo = pareceSospechoso(d.name, leido?.[0]?.[0])
    if (motivo) sospechosos.push(`${d.name} → ${motivo}`)
  }
  return { nombres: destinos.length, sospechosos }
}
