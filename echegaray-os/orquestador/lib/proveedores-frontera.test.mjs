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
  assert.equal(nSeccion('respaldoFiscal'), 4)
  // LAS TRES SECCIONES DE LA CAPA FÓSIL YA NO EXISTEN (09/09/2026). Las escribía el generador
  // retirado el 14/08 y el dueño firmó el borrado de esas filas. Declararlas seguía numerando hasta
  // 6 una pestaña que tiene 4: si alguna vuelve a la lista sin volver al archivo, esto se pone rojo.
  assert.throws(() => nSeccion('notasCredito'), /sección desconocida/)
  assert.throws(() => nSeccion('faltanEnCompras'), /sección desconocida/)
  assert.throws(() => nSeccion('control'), /sección desconocida/)
  // Materiales es una pestaña propia: sus secciones arrancan en 1.
  assert.equal(nSeccion('familiaMes', SECCIONES_MATERIALES), 1)
  assert.equal(nSeccion('obra', SECCIONES_MATERIALES), 2)
  // Una clave que no existe no devuelve un número cualquiera: falla.
  assert.throws(() => nSeccion('inventada'), /sección desconocida/)
  assert.equal(SECCIONES_PROVEEDORES.length, 4)
})

test('las ventas y "la plomería" ya no son secciones de esta pestaña', () => {
  // "7 · FACTURAS EMITIDAS" era ventas dentro del cuadro de lo que la empresa DEBE, y su propio
  // título lo admitía. "6 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer" declaraba que no
  // había que leerla. Si alguna vuelve a la lista, este test se pone rojo.
  assert.ok(!SECCIONES_PROVEEDORES.includes('emitidas'))
  assert.ok(!SECCIONES_PROVEEDORES.includes('arca'))
  assert.throws(() => nSeccion('emitidas'), /sección desconocida/)
  assert.throws(() => nSeccion('arca'), /sección desconocida/)
  // Y la numeración queda consecutiva y sin huecos: 1..4, ni un salto.
  assert.deepEqual(SECCIONES_PROVEEDORES.map((c) => nSeccion(c)), [1, 2, 3, 4])
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

// ═══ EL 30/09/2026: UN SCRIPT RETIRADO PIDIÓ SECCIONES QUE LA LISTA YA NO TIENE ═══
//
// `proveedores-materiales-pestana.mjs` (retirado el 14/08) siguió llamando `nSeccion('faltanEnCompras')`
// y `nSeccion('control')` después de que `0f86ca036` (09/09) las sacó de SECCIONES_PROVEEDORES, y
// buscaba una frontera «NOTAS DE CRÉDITO» que el diseño vigente ya no escribe (fila 131 = «4 · RESPALDO
// FISCAL»). Nadie lo vio porque el pipeline no lo corre y su test se había borrado. Estos tests miden
// las dos cosas: (1) ningún script que corre pide una clave que no está en su lista, y (2) el que
// quedó retirado NO puede arrancar a mano, y lo dice ANTES de abrir Google.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { frenoDeRetiro, estaRetirado, PASOS, PASOS_RETIRADOS } from './flujo-caja-pasos.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(AQUI, '..')

/** Cada `nSeccion('clave'[, LISTA])` literal de un fuente, con la lista que usa. Sin comentarios. */
function clavesPedidas(fuente) {
  const sinComentarios = String(fuente).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out = []
  for (const m of sinComentarios.matchAll(/\bnSeccion\(\s*'([^']+)'\s*(?:,\s*([A-Za-z_]+)\s*)?\)/g)) {
    out.push({ clave: m[1], lista: m[2] ?? 'SECCIONES_PROVEEDORES' })
  }
  return out
}
const LISTAS = { SECCIONES_PROVEEDORES, SECCIONES_MATERIALES }
const desconocidas = (fuente) => clavesPedidas(fuente)
  .filter(({ clave, lista }) => !(LISTAS[lista] ?? []).includes(clave))

test('el explorador de claves ve el defecto de hoy: una clave fuera de su lista se reporta', () => {
  const roto = "const b6 = push([`${nSeccion('faltanEnCompras')} · X`])\n"
    + "const b3 = push([`${nSeccion('familiaMes', SECCIONES_MATERIALES)} · Y`])\n"
    + "const b9 = push([`${nSeccion('familiaMes')} · Z`])   // familiaMes NO es de Proveedores\n"
    + "// nSeccion('comentada') no cuenta\n"
  assert.deepEqual(desconocidas(roto).map((d) => d.clave), ['faltanEnCompras', 'familiaMes'])
  assert.deepEqual(desconocidas("nSeccion('respaldoFiscal') + nSeccion('obra', SECCIONES_MATERIALES)"), [])
})

test('todo script o lib que CORRE pide sólo secciones que existen en su lista', () => {
  const dirs = [path.join(RAIZ, 'scripts'), path.join(RAIZ, 'lib')]
  const archivos = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .map((f) => ({ f, ruta: path.join(d, f) })))
  let revisados = 0
  for (const { f, ruta } of archivos) {
    if (f === 'proveedores-frontera.mjs' || estaRetirado(f)) continue   // los retirados: ver el test de abajo
    const malas = desconocidas(readFileSync(ruta, 'utf8'))
    if (clavesPedidas(readFileSync(ruta, 'utf8')).length) revisados++
    assert.deepEqual(malas, [], `${f} pide secciones que no están en la lista: ${malas.map((d) => d.clave).join(', ')} `
      + `(hay: ${SECCIONES_PROVEEDORES.join(', ')} · ${SECCIONES_MATERIALES.join(', ')})`)
  }
  assert.ok(revisados >= 3, `el explorador debe encontrar a los que sí usan nSeccion (encontró ${revisados})`)
})

test('un script retirado que pide claves ya inexistentes NO PUEDE ARRANCAR: se frena antes de abrir Google', () => {
  const RETIRADO = 'proveedores-materiales-pestana.mjs'
  const ruta = path.join(RAIZ, 'scripts', RETIRADO)
  const fuente = readFileSync(ruta, 'utf8')
  // Es la condición del defecto: sigue pidiendo claves que no existen. Si algún día se arregla de
  // verdad (vuelve a PASOS declarando SUS secciones), este `if` se apaga solo y el test de arriba
  // pasa a exigirle lo mismo que a cualquiera.
  if (!estaRetirado(RETIRADO)) {
    assert.deepEqual(desconocidas(fuente), [], `${RETIRADO} volvió a correr y sigue pidiendo secciones que no existen`)
    return
  }
  const iFreno = fuente.indexOf(`frenoDeRetiro('${RETIRADO}')`)
  const iMain = fuente.indexOf('async function main()')
  const iGoogle = fuente.indexOf('makeGoogleClient({', iMain)
  assert.ok(iFreno > iMain, 'main() tiene que consultar frenoDeRetiro')
  assert.ok(iFreno < iGoogle, 'y tiene que hacerlo ANTES de crear el cliente de Google, no después de leer medio archivo')
  assert.match(fuente.slice(iFreno, iGoogle), /throw new Error\(retiro\)/, 'y cortar la corrida, no sólo imprimir')
})

test('frenoDeRetiro: dice desde cuándo, por qué y qué se mide para volver; los pasos vivos no se frenan', () => {
  for (const p of PASOS_RETIRADOS) {
    const m = frenoDeRetiro(p.script)
    assert.match(m, /RETIRADO/)
    assert.ok(m.includes(p.desde) && m.includes(p.vuelve.slice(0, 40)), `${p.script}: el mensaje tiene que traer la fecha y el criterio de vuelta`)
    assert.match(m, /NO se escribió nada/)
  }
  assert.equal(frenoDeRetiro('proveedores-respaldo-fiscal.mjs'), null)
  assert.equal(frenoDeRetiro('materiales-pestana.mjs'), null)
  for (const [s] of PASOS) assert.equal(frenoDeRetiro(s), null, `${s} está en PASOS y también retirado`)
})

test('el lanzador manual de proveedores también se frena ante el retirado que invoca', () => {
  const f = readFileSync(path.join(RAIZ, 'scripts', 'refrescar-proveedores.mjs'), 'utf8')
  const iFreno = f.indexOf("frenoDeRetiro('proveedores-materiales-pestana.mjs')")
  assert.ok(iFreno > 0, 'refrescar-proveedores lanza el script retirado: tiene que frenarse antes')
  assert.ok(iFreno < f.indexOf('await tomarSnapshot('), 'y antes de tocar Google (el snapshot)')
})

test('el orden de las secciones y lo que la pestaña real muestra en la frontera coinciden: la sección 4 es el respaldo fiscal', () => {
  // La pestaña viva tiene en la fila 131 «4 · RESPALDO FISCAL — …» y NO «NOTAS DE CRÉDITO». El número
  // sale de la lista, y el que escribe ese bloque es `proveedores-respaldo-fiscal.mjs`.
  assert.equal(SECCIONES_PROVEEDORES[nSeccion(PRIMERA_GENERADA) - 1], 'respaldoFiscal')
  assert.equal(normalizarTitulo('4 · RESPALDO FISCAL — contra el libro de IVA de ARCA'),
    normalizarTitulo('RESPALDO FISCAL — contra el libro de IVA de ARCA'))
  assert.throws(() => buscarFrontera([['4 · RESPALDO FISCAL — contra el libro de IVA de ARCA']], 'NOTAS DE CRÉDITO'), /no encontré/)
})
