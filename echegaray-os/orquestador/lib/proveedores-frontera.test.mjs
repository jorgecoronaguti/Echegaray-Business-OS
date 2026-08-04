// LOS TRES DEFECTOS QUE ESTA LIB TIENE QUE ATRAPAR
//
//   (a) la frontera no aparece → error, NUNCA una escritura a ciegas en la fila que uno supone;
//   (b) la frontera cae dentro de una tabla dinámica → error, porque escribir ahí la mata;
//   (c) el bloque nuevo es más angosto que el viejo → el sobrante se LIMPIA (es el resto de la nota
//       de crédito de Trielec que quedó en "Anula la factura" / "La reemplaza").
//
// Si se revierte cualquiera de los tres arreglos, uno de estos tests se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SECCIONES_PROVEEDORES, SECCIONES_MATERIALES, PRIMERA_GENERADA, nSeccion,
  normalizarTitulo, esTituloDeSeccion, buscarFrontera, finDeDinamica, anclasDeDinamicas,
  verificarFronteraBajoDinamicas, anchoALimpiar, aAnchoCompleto,
} from './proveedores-frontera.mjs'
import { fusionar, VACIO } from './preservar-anotaciones.mjs'

/** Una pestaña como la ve el dueño: cabecera, posición, dos dinámicas, y abajo lo del generador. */
const pestana = ({ filasDinamica1 = 3, filasDinamica2 = 2 } = {}) => {
  const f = [
    ['PROVEEDORES Y MATERIALES 2026'],
    ['Las mismas filas de Compras vistas de los dos lados…'],
    [],
    ['POSICIÓN DE PROVEEDORES · importes en vivo'],
    ['DEUDA CON PROVEEDORES COMERCIALES', 13715178],
    [],
    ['1 · QUÉ SE DEBE Y CUÁNDO'],
  ]
  const anclaUno = f.length + 1
  for (let i = 0; i < filasDinamica1; i++) f.push([`Proveedor ${i + 1}`, 1000 * (i + 1)])
  f.push([])
  f.push(['2 · CUENTA CORRIENTE POR PROVEEDOR'])
  const anclaDos = f.length + 1
  for (let i = 0; i < filasDinamica2; i++) f.push([`Proveedor ${i + 1}`, '30-1111-1', 12])
  f.push([])
  const frontera = f.length + 1
  f.push(['3 · NOTAS DE CRÉDITO'])
  f.push(['Una nota de crédito puede significar dos cosas opuestas…'])
  f.push(['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', 'Qué es', 'Anula la factura', 'La reemplaza'])
  return { filas: f, anclaUno, anclaDos, frontera }
}

test('la numeración sale de UNA lista: las dinámicas son 1 y 2, y lo generado arranca en 3', () => {
  assert.equal(nSeccion('deuda'), 1)
  assert.equal(nSeccion('cuentaCorriente'), 2)
  assert.equal(nSeccion(PRIMERA_GENERADA), 3)
  assert.equal(nSeccion('faltanEnCompras'), 4)
  assert.equal(nSeccion('control'), 5)
  assert.equal(nSeccion('arca'), 6)
  assert.equal(nSeccion('emitidas'), 7)
  // Materiales es una pestaña propia: sus secciones arrancan en 1.
  assert.equal(nSeccion('familiaMes', SECCIONES_MATERIALES), 1)
  assert.equal(nSeccion('obra', SECCIONES_MATERIALES), 2)
  // Una clave que no existe no devuelve un número cualquiera: falla.
  assert.throws(() => nSeccion('inventada'), /sección desconocida/)
  assert.equal(SECCIONES_PROVEEDORES.length, 7)
})

test('el título se compara SIN su número y SIN tildes: "5 · NOTAS DE CRÉDITO" ≡ "3 · Notas de credito"', () => {
  assert.equal(normalizarTitulo('5 · NOTAS DE CRÉDITO'), 'NOTAS DE CREDITO')
  assert.equal(normalizarTitulo('3 · Notas de credito'), 'NOTAS DE CREDITO')
  assert.ok(esTituloDeSeccion('3 · NOTAS DE CRÉDITO'))
  assert.ok(!esTituloDeSeccion('TOTAL ACREDITADO'))
})

test('LA FRONTERA SE MUEVE SOLA: la dinámica crece y el título sigue siendo la referencia', () => {
  const chica = pestana({ filasDinamica1: 3 })
  const grande = pestana({ filasDinamica1: 9 })
  assert.equal(buscarFrontera(chica.filas, 'NOTAS DE CRÉDITO'), chica.frontera)
  assert.equal(buscarFrontera(grande.filas, 'NOTAS DE CRÉDITO'), grande.frontera)
  // Seis proveedores más arriba = seis filas más abajo. Una frontera fija habría escrito adentro.
  assert.equal(grande.frontera - chica.frontera, 6)
})

test('(a) SIN FRONTERA NO SE ESCRIBE: el título no está → error, no una fila supuesta', () => {
  const sinTitulo = pestana().filas.filter((f) => !/NOTAS DE CRÉDITO/.test(String(f?.[0] ?? '')))
  assert.throws(() => buscarFrontera(sinTitulo, 'NOTAS DE CRÉDITO'), /NO escribo/)
  assert.throws(() => buscarFrontera([], 'NOTAS DE CRÉDITO'), /no encontré/)
})

test('una dinámica ocupa desde su ancla hasta la última fila con algo, y se corta en el título siguiente', () => {
  const p = pestana({ filasDinamica1: 3, filasDinamica2: 2 })
  assert.equal(finDeDinamica(p.filas, p.anclaUno), p.anclaUno + 2)
  assert.equal(finDeDinamica(p.filas, p.anclaDos), p.anclaDos + 1)
  // Pegada al título de abajo, sin fila en blanco: la dinámica NO se come el título del generador.
  const pegada = [['x'], ['a', 1], ['b', 2], ['3 · NOTAS DE CRÉDITO'], ['más']]
  assert.equal(finDeDinamica(pegada, 2), 3)
})

test('(b) SI LA FRONTERA CAE DENTRO DE UNA DINÁMICA, SE ABORTA — escribir ahí la mataría', () => {
  const p = pestana()
  const dinamicas = [
    { ancla: p.anclaUno, fin: finDeDinamica(p.filas, p.anclaUno) },
    { ancla: p.anclaDos, fin: finDeDinamica(p.filas, p.anclaDos) },
  ]
  // El caso sano: la frontera está debajo de las dos.
  verificarFronteraBajoDinamicas({ frontera: p.frontera, dinamicas })
  // El caso enfermo: una detección que devuelve una fila del cuerpo de la dinámica.
  assert.throws(
    () => verificarFronteraBajoDinamicas({ frontera: p.anclaUno + 1, dinamicas }),
    /cae DENTRO de una tabla dinámica/,
  )
  // Y el borde exacto: la última fila de la dinámica tampoco es escribible.
  assert.throws(
    () => verificarFronteraBajoDinamicas({ frontera: dinamicas[1].fin, dinamicas }),
    /NO escribo/,
  )
})

test('las anclas salen del campo pivotTable, que es la única señal de que ahí hay una dinámica', () => {
  const grid = {
    sheets: [{ data: [{ rowData: [
      { values: [{}, {}] },
      { values: [{ pivotTable: { rows: [] } }] },
      { values: [{}] },
      { values: [{ pivotTable: { rows: [] } }] },
    ] }] }],
  }
  assert.deepEqual(anclasDeDinamicas(grid), [{ fila: 2, col: 0 }, { fila: 4, col: 0 }])
  // Un rango que no arranca en la fila 1: la fila absoluta sale de startRow.
  const conOffset = { sheets: [{ data: [{ startRow: 10, rowData: [{ values: [{ pivotTable: {} }] }] }] }] }
  assert.deepEqual(anclasDeDinamicas(conOffset), [{ fila: 11, col: 0 }])
  // Sin dinámicas —o con una respuesta vacía— la lista es vacía, no un error.
  assert.deepEqual(anclasDeDinamicas({}), [])
})

test('(c) EL BLOQUE NUEVO MÁS ANGOSTO QUE EL VIEJO: el sobrante se limpia, no sobrevive', () => {
  // La corrida vieja: la nota de crédito de Trielec decía qué factura anulaba y cuál la reemplazaba.
  const viejo = [
    ['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', 'Qué es', 'Anula la factura', 'La reemplaza'],
    ['TRIELEC', '0003-00000123', '12/05/2026', -50000, 'refacturación', '0003-00000100', '0003-00000131'],
  ]
  // La corrida nueva: la misma nota ya no anula nada (el cruce cambió), así que escribe MENOS columnas.
  const nuevo = [
    ['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', 'Qué es'],
    ['TRIELEC', '0003-00000123', '12/05/2026', -50000, 'devolución'],
  ]

  // EL BUG, tal como estaba: sin llevar las filas al ancho del bloque, la fusión conserva lo viejo.
  const conBug = fusionar(nuevo, viejo)
  assert.equal(conBug[1][5], '0003-00000100', 'así se veía el defecto: el reemplazo viejo sobrevivía')

  // EL FIX: el ancho a limpiar es el DECLARADO del bloque, no el de la fila más corta del día.
  const ancho = anchoALimpiar({ nuevas: nuevo, declarado: 9 })
  assert.equal(ancho, 9)
  const conFix = fusionar(aAnchoCompleto(nuevo, ancho, VACIO), viejo)
  assert.equal(conFix[1][5], '', 'la columna "Anula la factura" quedó limpia')
  assert.equal(conFix[1][6], '', 'la columna "La reemplaza" quedó limpia')
  assert.equal(conFix[1][4], 'devolución', 'y lo que el generador SÍ escribe, se escribe')
  assert.equal(conFix[1].length, 9)
})

test('el ancho a limpiar nunca encoge por debajo del declarado, ni recorta un bloque más ancho', () => {
  assert.equal(anchoALimpiar({ nuevas: [['a']], declarado: 9 }), 9)
  assert.equal(anchoALimpiar({ nuevas: [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']], declarado: 9 }), 10)
  assert.equal(anchoALimpiar({}), 0)
  // El relleno es el CENTINELA, no la cadena vacía: '' se preserva, el centinela se limpia.
  assert.deepEqual(aAnchoCompleto([['a']], 3, VACIO), [['a', VACIO, VACIO]])
})
