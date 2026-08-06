import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pedidos, ARCA, CAJA, ESPECIE, especieDe, desalineados, esSerialDeFecha, publicar } from './rangos-nombrados.mjs'

test('crea el nombre cuando no existe', () => {
  const [p] = pedidos(7, [{ name: 'ARCA_COMPRAS_N', fila: 10, col: 4 }], [])
  assert.ok(p.addNamedRange)
  assert.deepEqual(p.addNamedRange.namedRange.range, {
    sheetId: 7, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 3, endColumnIndex: 4,
  })
})

test('ACTUALIZA el que ya existe en vez de duplicarlo', () => {
  // La API no falla al repetir un nombre: se queda con dos rangos homónimos y las fórmulas empiezan
  // a leer el equivocado, sin ningún error visible.
  const [p] = pedidos(7, [{ name: 'ARCA_COMPRAS_N', fila: 20, col: 4 }], [{ name: 'ARCA_COMPRAS_N', namedRangeId: 'abc' }])
  assert.ok(p.updateNamedRange)
  assert.equal(p.updateNamedRange.namedRange.namedRangeId, 'abc')
  assert.equal(p.updateNamedRange.namedRange.range.startRowIndex, 19, 'apunta a la fila nueva')
})

test('cada nombre apunta a UNA sola celda', () => {
  for (const p of pedidos(1, Object.values(ARCA).map((name, i) => ({ name, fila: i + 2, col: 3 })), [])) {
    const r = p.addNamedRange.namedRange.range
    assert.equal(r.endRowIndex - r.startRowIndex, 1)
    assert.equal(r.endColumnIndex - r.startColumnIndex, 1)
  }
})

test('los nombres del contrato son únicos', () => {
  const v = Object.values(ARCA)
  assert.equal(v.length, new Set(v).size)
})

test('sin destinos no manda ningún pedido', () => {
  assert.deepEqual(pedidos(1, [], []), [])
})

// ═══ UN NOMBRE PUEDE CUBRIR UN BLOQUE ABIERTO (31/07) ═══
//
// La libreta de proveedores —la tabla proveedor → comentario que el dueño extiende hacia abajo— tiene
// que quedar cubierta por su nombre AUNQUE él agregue una fila. Un rango con fila final la dejaría
// afuera y el VLOOKUP que la mira devolvería vacío: la nota desaparece de la tabla de deuda sin que nada
// dé error. Es el mismo defecto que este archivo evita en las fórmulas, un nivel más abajo.

test('con `abierto` el rango NO lleva fila final: en la API eso significa hasta el final de la hoja', () => {
  const [p] = pedidos(7, [{ name: 'PROV_LIBRETA', fila: 120, col: 1, cols: 2, abierto: true }], [])
  const r = p.addNamedRange.namedRange.range
  assert.equal(r.startRowIndex, 119)
  assert.equal(r.endRowIndex, undefined, 'sin endRowIndex el rango sigue creciendo con la hoja')
  assert.equal(r.startColumnIndex, 0)
  assert.equal(r.endColumnIndex, 2, 'dos columnas: proveedor y comentario')
})

test('sin `abierto` el comportamiento no cambia: una celda, como los doce nombres de ARCA', () => {
  const [p] = pedidos(7, [{ name: 'X', fila: 10, col: 4 }], [])
  const r = p.addNamedRange.namedRange.range
  assert.equal(r.endRowIndex - r.startRowIndex, 1)
  assert.equal(r.endColumnIndex - r.startColumnIndex, 1)
})

test('un nombre abierto que YA existe se ACTUALIZA, no se duplica', () => {
  const [p] = pedidos(7, [{ name: 'PROV_LIBRETA', fila: 130, col: 1, cols: 2, abierto: true }],
    [{ name: 'PROV_LIBRETA', namedRangeId: 'zz' }])
  assert.ok(p.updateNamedRange, 'la API no falla al duplicar un nombre: se queda con dos y las fórmulas leen el equivocado')
  assert.equal(p.updateNamedRange.namedRange.range.startRowIndex, 129)
  assert.equal(p.updateNamedRange.namedRange.range.endRowIndex, undefined)
})

// ═══ UN NOMBRE PUBLICADO NO ES UN NOMBRE QUE APUNTA A ALGO (05/08) ═══
//
// Los valores de abajo son los que estaban de verdad en el archivo el 05/08, leídos del Sheet: doce
// nombres publicados con 200 de la API, apuntando a celdas de la LISTA de comprobantes faltantes.
// La consecuencia se veía cuatro pestañas más allá y nadie la ataba a la publicación.

test('un número de comprobante NO es un importe, y un CUIT NO es un contador', () => {
  assert.equal(especieDe('0001-00000204'), 'texto', 'los ceros a la izquierda y el guión lo delatan')
  assert.equal(especieDe('30-71647696-7'), 'texto')
  assert.equal(especieDe(209231271), 'entero')
  assert.equal(especieDe(-21359123.26), 'numero', 'una nota de crédito resta: el negativo es plata igual')
  assert.equal(especieDe(''), 'vacio')
  assert.equal(especieDe(null), 'vacio')
  assert.equal(especieDe('#REF!'), 'texto')
})

test('EL DEFECTO: los doce nombres apuntan a la lista de faltantes y se DENUNCIAN uno por uno', () => {
  const destinos = [
    { name: ARCA.comprobantes, fila: 199, col: 2 }, { name: ARCA.total, fila: 199, col: 3 },
    { name: ARCA.notasN, fila: 200, col: 2 }, { name: ARCA.notasMonto, fila: 200, col: 3 },
    { name: ARCA.faltanN, fila: 203, col: 2 }, { name: ARCA.faltanMonto, fila: 203, col: 3 },
  ]
  // Lo que devolvían esas celdas en el archivo vivo.
  const vivo = {
    [`199|2`]: 521, [`199|3`]: '0001-00000204',
    [`200|2`]: 16, [`200|3`]: '0001-00000205',
    [`203|2`]: '30-71647696-7', [`203|3`]: '0001-00000211',
  }
  const mal = desalineados(destinos, (d) => vivo[`${d.fila}|${d.col}`])
  assert.deepEqual(mal.map((m) => m.name).sort(), [
    ARCA.faltanMonto, ARCA.faltanN, ARCA.notasMonto, ARCA.total,
  ].sort(), 'los contadores que sí eran enteros (521, 16) no se denuncian; los otros cuatro sí')
  const total = mal.find((m) => m.name === ARCA.total)
  assert.equal(total.espera, 'importe')
  assert.equal(total.encontro, 'texto')
  assert.equal(total.valor, '0001-00000204')
})

test('una celda VACÍA bajo un nombre publicado también es un nombre mal apuntado', () => {
  // Es el caso de "el nombre se reapuntó a una grilla que todavía no se escribió": tan mudo como el
  // texto y tan equivocado. La pestaña que lo lee muestra un cero que parece un dato.
  const mal = desalineados([{ name: ARCA.ventasMonto, fila: 204, col: 3 }], () => '')
  assert.equal(mal.length, 1)
  assert.equal(mal[0].encontro, 'vacio')
})

test('con la celda correcta debajo, no se denuncia nada', () => {
  const destinos = Object.values(ARCA).map((name, i) => ({ name, fila: 199 + i, col: 3 }))
  assert.deepEqual(desalineados(destinos, (d) => (/_N$/.test(d.name) ? 42 : 209231271.5)), [])
})

test('los doce nombres de ARCA declaran qué especie prometen', () => {
  for (const n of Object.values(ARCA)) assert.ok(ESPECIE[n], `${n} no declara especie: nadie lo verifica`)
})

// ═══ `publicar` RELEE: el 200 de la API no es la evidencia ═══

/** Un Google de mentira que acepta todo y devuelve lo que haya en la pestaña. */
const googleFalso = (celdas) => ({
  getNamedRanges: async () => [],
  spreadsheetBatchUpdate: async () => ({ ok: true }),
  readSheetValues: async (_id, rango, opts) => {
    assert.equal(opts?.render, 'UNFORMATTED_VALUE', 'formateado, un importe y un comprobante son los dos strings')
    assert.match(rango, /^Proveedores!B199:C204$/, 'una sola lectura, el rectángulo que cubre todo')
    return celdas
  },
})

test('publicar NO APUNTA un nombre a una celda que no tiene lo que el nombre promete', async () => {
  // ═══ EL TEST SE DIO VUELTA (05/08) ═══
  //
  // Pedía que `publicar` publicara los cuatro y DEVOLVIERA cuál había quedado mal apuntado. El aviso
  // servía —así apareció que cinco `ARCA_*` apuntaban a números de comprobante y CUITs— pero llegaba
  // DESPUÉS del daño: los nombres ya apuntando a basura, y Recurrentes, Estructura, Materiales y el
  // Cash Flow Mensual mostrando un número de comprobante donde prometen plata. Un aviso posterior al
  // daño es una autopsia.
  //
  // Las celdas ya están escritas cuando se llama acá; lo único que falta es a dónde apunta cada
  // nombre. Así que ahora se mira primero y se apunta después: el que no pasa se queda donde estaba.
  const destinos = [
    { name: ARCA.comprobantes, fila: 199, col: 2 }, { name: ARCA.total, fila: 199, col: 3 },
    { name: ARCA.ventasN, fila: 204, col: 2 }, { name: ARCA.ventasMonto, fila: 204, col: 3 },
  ]
  const filas = [[521, '0001-00000204'], [], [], [], [], [20, 315783920.5]]
  const g = googleFalso(filas)
  const pedidos = []
  const espia = { ...g, spreadsheetBatchUpdate: async (id, reqs) => { pedidos.push(...(reqs || [])); return {} } }
  const r = await publicar(espia, 'ID', 7, destinos, { titulo: 'Proveedores' })
  assert.equal(r.verificado, true)
  assert.deepEqual(r.malApuntados.map((m) => m.name), [ARCA.total])
  assert.deepEqual(r.noPublicados, [ARCA.total])
  // TRES publicados, no cuatro: el que apuntaba a "0001-00000204" no se apuntó a ninguna parte.
  assert.equal(r.nombres, 3)
  const nombresPedidos = pedidos.map((q) => q.addNamedRange?.namedRange?.name ?? q.updateNamedRange?.namedRange?.name)
  assert.ok(!nombresPedidos.includes(ARCA.total), 'se pidió apuntar el nombre a la celda con el comprobante')
  assert.equal(nombresPedidos.filter(Boolean).length, 3)
})

test('si no se puede releer, la respuesta es "no verificado" — nunca "salió bien"', async () => {
  const roto = { ...googleFalso([]), readSheetValues: async () => { throw new Error('429') } }
  const r = await publicar(roto, 'ID', 7, [{ name: ARCA.total, fila: 199, col: 3 }], { titulo: 'Proveedores' })
  assert.equal(r.verificado, false)
  assert.deepEqual(r.malApuntados, [])
})

test('EL DEFECTO DEL 06/08: la fecha del saldo apuntando a la celda de plata se DENUNCIA', () => {
  // CAJA_FECHA_SALDO quedó publicado sobre C13 (el total, $68M). Un importe es "entero" igual que un
  // serial de fecha, así que sin banda no había nada que gritara — y el piso MAX(fecha;TODAY()) de la
  // escalera se fue a 68 millones: todos los tramos futuros en $0, en la pestaña Y en el portón.
  const destinos = [
    { name: CAJA.total, fila: 13, col: 3 },
    { name: CAJA.fecha, fila: 13, col: 4 },
  ]
  const bien = desalineados(destinos, (d) => ({ '13|3': 68372941.82, '13|4': 46240 })[`${d.fila}|${d.col}`])
  assert.deepEqual(bien, [], 'total en plata y fecha en serial: nada que denunciar')

  const mal = desalineados(destinos, (d) => ({ '13|3': 68372941.82, '13|4': 68372941.82 })[`${d.fila}|${d.col}`])
  assert.deepEqual(mal.map((m) => m.name), [CAJA.fecha], 'la "fecha" de 68 millones se denuncia')

  // La banda: hoy sí, el año 1999 no, el 2101 no, y un string numérico entra igual (la API varía).
  assert.equal(esSerialDeFecha(46240), true)
  assert.equal(esSerialDeFecha(36525), false)
  assert.equal(esSerialDeFecha(73051), false)
  assert.deepEqual(desalineados([{ name: CAJA.fecha, fila: 1, col: 1 }], () => '46240'), [])
})
