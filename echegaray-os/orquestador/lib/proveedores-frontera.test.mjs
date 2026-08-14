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
  verificarFronteraBajoDinamicas, anchoALimpiar, aAnchoCompleto, fronteraSegura,
  ANCHOS_PROVEEDORES, COL_AIRE, requestsDeAncho,
} from './proveedores-frontera.mjs'
import { detectar } from './defectos-pantalla.mjs'
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

test('la numeración sale de UNA lista: 1 y 3 son dinámicas, 2 es el cuadro por día, y lo generado arranca en 4', () => {
  assert.equal(nSeccion('deuda'), 1)
  assert.equal(nSeccion('salePorDia'), 2)
  assert.equal(nSeccion('cuentaCorriente'), 3)
  assert.equal(nSeccion(PRIMERA_GENERADA), 4)
  assert.equal(nSeccion('faltanEnCompras'), 5)
  assert.equal(nSeccion('control'), 6)
  // Materiales es una pestaña propia: sus secciones arrancan en 1.
  assert.equal(nSeccion('familiaMes', SECCIONES_MATERIALES), 1)
  assert.equal(nSeccion('obra', SECCIONES_MATERIALES), 2)
  // Una clave que no existe no devuelve un número cualquiera: falla.
  assert.throws(() => nSeccion('inventada'), /sección desconocida/)
  assert.equal(SECCIONES_PROVEEDORES.length, 6)
})

test('las ventas y "la plomería" ya no son secciones de esta pestaña', () => {
  // "7 · FACTURAS EMITIDAS" era ventas dentro del cuadro de lo que la empresa DEBE, y su propio
  // título lo admitía. "6 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer" declaraba que no
  // había que leerla. Si alguna vuelve a la lista, este test se pone rojo.
  assert.ok(!SECCIONES_PROVEEDORES.includes('emitidas'))
  assert.ok(!SECCIONES_PROVEEDORES.includes('arca'))
  assert.throws(() => nSeccion('emitidas'), /sección desconocida/)
  assert.throws(() => nSeccion('arca'), /sección desconocida/)
  // Y la numeración queda consecutiva y sin huecos: 1..6, ni un salto.
  assert.deepEqual(SECCIONES_PROVEEDORES.map((c) => nSeccion(c)), [1, 2, 3, 4, 5, 6])
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
  // `ancho` sale del mismo spec y es lo que le permite a `finDeDinamica` no contar como cuerpo de la
  // dinámica un resto de otro generador. Sin campos declarados es 0 = "no sé", y se mira la fila entera.
  assert.deepEqual(anclasDeDinamicas(grid), [{ fila: 2, col: 0, ancho: 0 }, { fila: 4, col: 0, ancho: 0 }])
  // Un rango que no arranca en la fila 1: la fila absoluta sale de startRow.
  const conOffset = { sheets: [{ data: [{ startRow: 10, rowData: [{ values: [{ pivotTable: {} }] }] }] }] }
  assert.deepEqual(anclasDeDinamicas(conOffset), [{ fila: 11, col: 0, ancho: 0 }])
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

// ═══ EL DEFECTO QUE CONGELÓ LA PESTAÑA ENTERA ═══
//
// El título ancla es un TEXTO de la columna A, y un texto se puede borrar. Se borró: el 04/08 la
// pestaña real no tenía "3 · NOTAS DE CRÉDITO" en ninguna fila, `buscarFrontera` tiraba, y el
// generador imprimía "⛔ no escribo" en un log que nadie mira. Resultado verificado contra el archivo
// vivo: de la fila 176 para abajo no se actualizaba nada, y lo que se veía era la superposición de
// dos corridas viejas (fechas dibujadas como "$46.184", comprobantes de ventas al lado de notas de
// crédito). Una pestaña rota que además se defendía de que la arreglaran.

test('sin el título ancla, la frontera se calcula debajo de la última dinámica (y no se congela)', () => {
  const { filas, frontera } = pestana()
  const dinamicas = [{ ancla: 8, fin: 10 }, { ancla: 13, fin: 14 }]
  // Con el título: manda el título.
  assert.deepEqual(fronteraSegura({ visible: filas, titulo: 'NOTAS DE CRÉDITO', dinamicas }),
    { fila: frontera, por: 'titulo' })
  // Sin el título —el dueño lo borró, o una corrida rota lo pisó— sigue habiendo dónde anclar.
  const sinTitulo = filas.map((f) => (/NOTAS DE CR/i.test(String(f?.[0] ?? '')) ? [] : f))
  const r = fronteraSegura({ visible: sinTitulo, titulo: 'NOTAS DE CRÉDITO', dinamicas })
  assert.equal(r.por, 'dinamicas')
  assert.equal(r.fila, 16, 'la fila siguiente a la última dinámica, con una fila de aire')
  // Y la frontera calculada así sigue pasando la guarda: no cae dentro de ninguna dinámica.
  verificarFronteraBajoDinamicas({ frontera: r.fila, dinamicas })
})

test('sin título Y sin dinámicas no hay dónde anclar: no se escribe', () => {
  // Es la única regla que no se toca. "No pude ubicarme" nunca es permiso para escribir en la fila
  // que uno supone: ahí es donde una escritura reemplaza una dinámica por texto y la mata en silencio.
  assert.throws(
    () => fronteraSegura({ visible: [['otra cosa']], titulo: 'NOTAS DE CRÉDITO', dinamicas: [] }),
    /no encontré "NOTAS DE CRÉDITO"/)
})

// ═══ EL TEXTO CORTADO: "Qué e", "$209.231.2", "⇒ Materiales que ninguna familia está mira" ═══
//
// El dueño lo vio en el render del 04/08. La causa era de PROPIEDAD: tres generadores escriben esta
// pestaña, dos fijaban anchos mirando sólo su propio bloque y el tercero se abstenía. Un ancho es de
// la columna entera, así que no hay "ancho por bloque" — hay un dueño o hay un choque.

test('los anchos son UNA definición, y la aplica un solo generador', () => {
  assert.equal(ANCHOS_PROVEEDORES.length, 8, 'A..H, las columnas que usan los tres bloques')
  assert.ok(Object.isFrozen(ANCHOS_PROVEEDORES), 'nadie la muta en caliente')
  const reqs = requestsDeAncho(123)
  assert.equal(reqs.length, 8)
  assert.deepEqual(reqs[0].updateDimensionProperties.range,
    { sheetId: 123, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 })
  assert.equal(reqs[0].updateDimensionProperties.properties.pixelSize, ANCHOS_PROVEEDORES[0])
  // Una columna por request: un rango de varias columnas les pone el mismo ancho a todas, que es
  // exactamente lo que no se quiere (la D mide 300 y la E 28).
  for (const [i, r] of reqs.entries()) {
    assert.equal(r.updateDimensionProperties.range.endIndex - r.updateDimensionProperties.range.startIndex, 1)
    assert.equal(r.updateDimensionProperties.range.startIndex, i)
  }
})

// ═══ LA COLUMNA E: 24 DE LOS 34 TEXTOS CORTADOS QUE QUEDABAN (05/08) ═══
//
// La E se declaró "aire, ninguna tabla la usa". Las tablas de TEXTO la saltean; la tabla DINÁMICA de
// la sección 1 no puede: un pivot ocupa columnas consecutivas desde su ancla y el cuadro de detalle
// llega hasta la G. Con 28px, "Transferencia" y "Tarjeta Crédito" salían cortados en 5 caracteres.
test('la columna E entra el tipo de pago más largo: el cuadro de detalle la ocupa, no es aire', () => {
  assert.equal(COL_AIRE, 4, 'la E sigue siendo la que saltean las tablas de TEXTO')
  // Los cinco valores reales de "Tipo pago" en Compras, medidos el 05/08.
  const TIPOS = ['Cheque', 'Efectivo', 'Echeq', 'Transferencia', 'Tarjeta Crédito']
  for (const t of TIPOS) {
    assert.ok(ANCHOS_PROVEEDORES[COL_AIRE] >= t.length * 10 * 0.57,
      `la E (${ANCHOS_PROVEEDORES[COL_AIRE]}px) corta "${t}" — es lo que reportaba el auditor 24 veces`)
  }
  // Y no se pasa de rosca: la E es la más angosta de las que llevan texto, sigue haciendo de aire.
  assert.ok(ANCHOS_PROVEEDORES[COL_AIRE] < ANCHOS_PROVEEDORES[1], 'más angosta que la B')
})

test('EL DEFECTO, medido con el auditor de verdad: con la E en 28px el tipo de pago se corta', () => {
  const fila = (anchos) => ({
    anchos,
    altos: [21],
    filas: [[
      { valor: 'Alumetal', formato: { numberFormat: { type: 'TEXT', pattern: '@' } } },
      { valor: '0001-00000211', formato: { numberFormat: { type: 'TEXT', pattern: '@' } } },
      { valor: '16/08/2026', formato: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } },
      { valor: 'LA ESTRELLA', formato: { numberFormat: { type: 'TEXT', pattern: '@' } } },
      { valor: 'Tarjeta Crédito', formato: { numberFormat: { type: 'TEXT', pattern: '@' }, wrapStrategy: 'CLIP' } },
      { valor: 'B', formato: { numberFormat: { type: 'TEXT', pattern: '@' } } },
      { valor: '$1.234', formato: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' } } },
    ]],
  })
  const viejos = [...ANCHOS_PROVEEDORES]
  viejos[COL_AIRE] = 28
  assert.equal(detectar(fila(viejos)).filter((d) => d.tipo === 'texto_cortado').length, 1)
  assert.deepEqual(detectar(fila([...ANCHOS_PROVEEDORES])), [], 'con el ancho declarado hoy, ni un defecto')
})

// ═══ LA NUMERACIÓN DE BLOQUES: CONSECUTIVA Y SIN HUECOS ═══
//
// La pestaña llegó a leerse "1, 2, 7, 5": la sección 7 era un resto de un diseño anterior que ningún
// generador reclamaba y la 3 y la 4 no existían. La skill del área lo prohíbe explícitamente —un
// cuadro que salta números parece que perdió bloques— y acá es medible: los números salen del ORDEN
// de esta lista, así que no pueden saltarse a menos que alguien saltee un elemento.
test('los números de sección son 1..N, consecutivos y sin huecos, en las dos pestañas', () => {
  for (const [nombre, orden] of [['Proveedores', SECCIONES_PROVEEDORES], ['Materiales', SECCIONES_MATERIALES]]) {
    const numeros = orden.map((c) => nSeccion(c, orden))
    assert.deepEqual(numeros, orden.map((_, i) => i + 1), `${nombre}: la numeración salta`)
    assert.equal(new Set(orden).size, orden.length, `${nombre}: una sección repetida`)
  }
  // Las dos dinámicas ocupan el 1 y el 2, así que el primer bloque que escribe el generador es el 3.
  assert.equal(nSeccion(PRIMERA_GENERADA), 4)
  // Y un número no puede salir de una clave inventada: eso es lo que producía el "7".
  assert.throws(() => nSeccion('emitidas'), /sección desconocida/)
})

test('cada columna tiene lugar para lo más ancho que le toca', () => {
  // A ~7px por carácter a fontSize 9-10. No es exacto — es el piso que evita el defecto de volver a
  // poner 60px en una columna que lleva "$209.231.271".
  const cabe = (col, texto) => assert.ok(ANCHOS_PROVEEDORES[col] >= texto.length * 7,
    `la columna ${String.fromCharCode(65 + col)} (${ANCHOS_PROVEEDORES[col]}px) corta "${texto}"`)
  cabe(0, 'Comprobantes de compra (neto de notas)')   // el rótulo más largo del control
  cabe(1, '30-71037035-0')                            // CUIT con guiones
  cabe(2, '$209.231.271')                             // el monto del control de cobertura
  cabe(5, 'REFACTURACIÓN — el costo sigue')           // "Qué es", en la F
  cabe(6, '0006-00003002 → 0004-00003445')            // la cadena anula → reemplaza, en la G
})
