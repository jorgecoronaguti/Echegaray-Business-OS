import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pedidos, ARCA, CAJA, ESPECIE, especieDe, desalineados, esSerialDeFecha, publicar,
  aRescatar, retirar, mientenPorEspecie, aRetirarPorMentir,
} from './rangos-nombrados.mjs'

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL EMPATE PERMANENTE: NI EL DESTINO NUEVO CONVENCE NI EL VIEJO SE MUEVE (14/08/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Medido en el archivo vivo: los doce `ARCA_*` sobre `Proveedores!B124:C129`, la tabla de
// comprobantes faltantes. `desalineados` los denunciaba a los doce cada dos horas; `publicar` no los
// movía porque el destino calculado tampoco daba; y el rescate no los tomaba porque preguntaba
// "¿está VACÍA la celda actual?" y un CUIT no está vacío. Diez días clavados sobre basura, sin
// ninguna corrida capaz de sanarlos: el fail-closed convertido en candado sobre el error.

test('el rescate toma el nombre cuya celda ACTUAL miente, no sólo el que apunta a una celda vacía', () => {
  const SHEET = 7
  const existentes = [
    // Lo que devolvió getNamedRanges del archivo vivo: B128 con un CUIT adentro.
    { name: ARCA.faltanN, namedRangeId: 'r1', range: { sheetId: SHEET, startRowIndex: 127, startColumnIndex: 1 } },
    // Y uno cuya celda actual sí tiene lo que promete: ése NO se toca aunque el destino nuevo falle.
    { name: ARCA.faltanMonto, namedRangeId: 'r2', range: { sheetId: SHEET, startRowIndex: 180, startColumnIndex: 2 } },
  ]
  const celda = { '128|2': '30-56736337-2', '181|3': 13837030.5 }
  const leer = (r) => celda[`${r.startRowIndex + 1}|${r.startColumnIndex + 1}`]
  const malApuntados = [
    { name: ARCA.faltanN, espera: 'entero' },
    { name: ARCA.faltanMonto, espera: 'importe' },
  ]
  assert.deepEqual(aRescatar(malApuntados, existentes, SHEET, leer), [ARCA.faltanN],
    'el que hoy publica un CUIT se mueve igual; el que hoy publica plata se queda donde está')
})

test('el rescate sigue tomando la celda VACÍA y la que quedó FUERA del rectángulo leído', () => {
  const SHEET = 7
  const existentes = [
    { name: ARCA.faltanN, namedRangeId: 'r1', range: { sheetId: SHEET, startRowIndex: 9, startColumnIndex: 1 } },
    { name: ARCA.faltanMonto, namedRangeId: 'r2', range: { sheetId: SHEET, startRowIndex: 900, startColumnIndex: 2 } },
  ]
  // La vacía (el caso ANEXO_* del 07/08) y la que cayó fuera de lo leído tras una compactación.
  const leer = (r) => (r.startRowIndex === 9 ? '' : undefined)
  const mal = [{ name: ARCA.faltanN, espera: 'entero' }, { name: ARCA.faltanMonto, espera: 'importe' }]
  assert.deepEqual(aRescatar(mal, existentes, SHEET, leer), [ARCA.faltanN, ARCA.faltanMonto])
})

test('un nombre que NO existe no se CREA sobre contenido dudoso, ni se mueve el de otra pestaña', () => {
  const existentes = [{ name: ARCA.faltanMonto, namedRangeId: 'r2', range: { sheetId: 999, startRowIndex: 3, startColumnIndex: 2 } }]
  const mal = [{ name: ARCA.faltanN, espera: 'entero' }, { name: ARCA.faltanMonto, espera: 'importe' }]
  assert.deepEqual(aRescatar(mal, existentes, 7, () => ''), [],
    'el ausente no se crea (caso ARCA 05/08) y el que vive en otra pestaña puede estar bien ahí')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RETIRAR: UN NOMBRE QUE DEJA DE PUBLICARSE NO SE BORRA SOLO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('retirar borra sólo los que existen: un id inventado hace fallar el batch entero', () => {
  const existentes = [
    { name: ARCA.ventasN, namedRangeId: 'a' },
    { name: ARCA.ventasMonto, namedRangeId: 'b' },
  ]
  assert.deepEqual(retirar([ARCA.ventasN, ARCA.ventasMonto, ARCA.notasN], existentes), [
    { deleteNamedRange: { namedRangeId: 'a' } },
    { deleteNamedRange: { namedRangeId: 'b' } },
  ])
  assert.deepEqual(retirar([ARCA.notasN], existentes), [], 'el que ya no está no se pide borrar de nuevo')
  assert.deepEqual(retirar([], existentes), [])
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL BARRIDO DEL LIBRO ENTERO: NO SI HAY ALGO, SINO SI ES LO QUE PROMETE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `auditar-rangos-fosilizados.mjs` preguntaba si la celda estaba vacía. Los doce `ARCA_*` sobre la
// tabla de faltantes tenían dato en todas, así que para ese auditor estaban impecables — y
// ARCA_FALTAN_MONTO le pasaba "0038-00025483" a Materiales!B53.

test('mientenPorEspecie caza el CUIT bajo un contador y el comprobante bajo un importe', () => {
  const mienten = mientenPorEspecie([
    { nombre: ARCA.faltanN, hoja: 'Proveedores', valor: '30-56736337-2' },
    { nombre: ARCA.faltanMonto, hoja: 'Proveedores', valor: '0038-00025483' },
    { nombre: CAJA.total, hoja: 'CAJA', valor: 18676946 },
    { nombre: CAJA.fecha, hoja: 'CAJA', valor: 46248 },
  ])
  assert.deepEqual(mienten.map((m) => m.nombre), [ARCA.faltanN, ARCA.faltanMonto])
  assert.equal(mienten[0].hoja, 'Proveedores')
  assert.equal(mienten[1].espera, 'importe')
  assert.equal(mienten[1].encontro, 'texto')
})

test('un nombre SIN especie declarada no se juzga: inventar el criterio no es auditar', () => {
  assert.equal(ESPECIE.PROV_LIBRETA, undefined)
  assert.deepEqual(mientenPorEspecie([{ nombre: 'PROV_LIBRETA', hoja: 'Proveedores', valor: 'una nota del dueño' }]), [])
})

// ═══ LOS TRECE RANGOS DE ARCA, TAL COMO ESTABAN EN EL ARCHIVO EL 14/08/2026 ═══
//
// No es un ejemplo: son las coordenadas y los valores leídos del archivo real. Las filas 127-132 de
// "Proveedores" son HOY el cuerpo de la lista de comprobantes de ARCA —columna B = CUIT, columna C =
// N° de comprobante— y el bloque de control del que estos nombres cuelgan ya no vive ahí. Cada uno
// promete un importe o un contador y publica un CUIT o un comprobante, y el daño no se ve en esta
// pestaña: se ve en Recurrentes, Estructura, Materiales y el Cash Flow Mensual, que muestran lo que
// haya en esa celda.
const ARCA_EN_EL_ARCHIVO = [
  { name: ARCA.total, fila: 127, col: 3, valor: '0008-00021938' },
  { name: ARCA.comprobantes, fila: 127, col: 2, valor: '30-71170927-0' },
  { name: ARCA.notasMonto, fila: 128, col: 3, valor: '2470-01608263' },
  { name: ARCA.notasN, fila: 128, col: 2, valor: '30-67881435-7' },
  { name: ARCA.enComprasMonto, fila: 129, col: 3, valor: '2470-01545411' },
  { name: ARCA.sinNumeroMonto, fila: 130, col: 3, valor: '0006-00006997' },
  { name: ARCA.sinNumeroN, fila: 130, col: 2, valor: '30-71135522-3' },
  { name: ARCA.faltanMonto, fila: 131, col: 3, valor: '0038-00025483' },
  { name: ARCA.faltanN, fila: 131, col: 2, valor: '30-56736337-2' },
  { name: ARCA.ventasMonto, fila: 132, col: 3, valor: '0007-00002477' },
  { name: ARCA.ventasN, fila: 132, col: 2, valor: '23-36911157-4' },
]

test('EL DEFECTO · un nombre que promete plata sobre un comprobante no puede pasar por sano', () => {
  const leer = (d) => ARCA_EN_EL_ARCHIVO.find((x) => x.name === d.name)?.valor
  const mal = desalineados(ARCA_EN_EL_ARCHIVO, leer)
  assert.equal(mal.length, ARCA_EN_EL_ARCHIVO.length,
    'los once tienen que salir marcados: ninguno apunta a lo que su nombre promete')
  for (const m of mal) {
    assert.ok(m.espera === 'importe' || m.espera === 'entero')
    assert.equal(m.encontro, 'texto', `${m.name}: un CUIT y un comprobante son TEXTO, no plata`)
  }
})

test('un CUIT no cuenta como entero aunque parezca un número', () => {
  // "30-56736337-2" tiene guiones: si `especieDe` los ignorara, un CUIT pasaría por contador.
  assert.equal(especieDe('30-56736337-2'), 'texto')
  assert.equal(especieDe('0038-00025483'), 'texto', 'los ceros a la izquierda delatan un comprobante')
  assert.equal(especieDe('433'), 'entero', 'el 433 de "cargados en Compras" sí es un contador')
})

test('el nombre emigrado a otra pestaña que tampoco convence se RETIRA, no se deja mintiendo', () => {
  const SHEET = 5
  // ARCA_FALTAN_MONTO vive en Materiales (sheetId 9) sobre un comprobante; su destino calculado en
  // Proveedores tampoco confirmó. No queda ninguna celda de la que se pueda afirmar que dice la verdad.
  const existentes = [
    { name: ARCA.faltanMonto, namedRangeId: 'r1', range: { sheetId: 9, startRowIndex: 52, startColumnIndex: 1 } },
    { name: ARCA.faltanN, namedRangeId: 'r2', range: { sheetId: SHEET, startRowIndex: 130, startColumnIndex: 1 } },
  ]
  const mal = [{ name: ARCA.faltanMonto, espera: 'importe' }, { name: ARCA.faltanN, espera: 'entero' }]
  assert.deepEqual(aRetirarPorMentir(mal, existentes, SHEET, []), [ARCA.faltanMonto],
    'el que vive en otra pestaña se retira; el que vive acá lo resuelve aRescatar')
})

test('lo que se va a rescatar no se retira: sería borrar lo que se está por arreglar', () => {
  const existentes = [{ name: ARCA.faltanMonto, namedRangeId: 'r1', range: { sheetId: 9, startRowIndex: 52, startColumnIndex: 1 } }]
  const mal = [{ name: ARCA.faltanMonto, espera: 'importe' }]
  assert.deepEqual(aRetirarPorMentir(mal, existentes, 5, [ARCA.faltanMonto]), [])
})

test('un nombre que todavía no existe no se retira ni se crea sobre contenido dudoso', () => {
  assert.deepEqual(aRetirarPorMentir([{ name: ARCA.faltanN, espera: 'entero' }], [], 5, []), [])
})
