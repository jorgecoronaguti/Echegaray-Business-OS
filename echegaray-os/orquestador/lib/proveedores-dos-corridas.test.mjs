// DOS CORRIDAS SEGUIDAS CON LOS MISMOS DATOS TIENEN QUE DEJAR LA MISMA PESTAÑA.
//
// ═══ QUÉ MIDE ESTE ARCHIVO, Y POR QUÉ EXISTE (14/08/2026) ═══
//
// `proveedores-materiales-pestana.mjs` se retiró del pipeline porque apilaba una capa por corrida.
// Medido contra el archivo real, dos corridas seguidas con los MISMOS datos:
//   · "Proveedores" pasó de 249 a 265 filas;
//   · el bloque de cobertura de ARCA cayó 17 filas sin que cambiara un solo dato;
//   · y el barrido de residuo propio informaba `0 vaciada(s) · 0 conservada(s) · 0 limpiada(s)`.
//
// El criterio para reactivarlo (`PASOS_RETIRADOS.vuelve`) es exactamente eso al revés: una corrida
// vacía celdas > 0 Y la pestaña no crece entre dos corridas seguidas. Este archivo es ese criterio
// hecho ejecutable, en frío: una pestaña en memoria y las funciones REALES que deciden dónde arranca
// el bloque (`fronteraSegura`, `finDeDinamica`) y qué se borra (`protegerBorrado`, `residuosPropios`).
// No toca Google: el cliente es un doble que guarda una grilla y contesta rangos A1 como contesta la
// API — que es donde estaba escondido el defecto.
//
// LAS DOS CAUSAS QUE ATRAPA, y las dos se ponen rojas si se revierte el arreglo:
//
//   1. LA GUARDA RELEÍA EL ANCLA, NO EL FOOTPRINT. Una escritura anclada en `A121` con una grilla de
//      100×16 escribe A121:P220, y `no-borrar.mjs` releía `'Proveedores'!A121` — una celda. Medido
//      contra el archivo real: `'Proveedores'!A121 → 1 fila × 1 col`. Con un destino de una celda no
//      se preserva nada y no se barre nada: de ahí sale el `0 · 0 · 0` del log.
//   2. EL FIN DE LA DINÁMICA SE MEDÍA EN LA FILA ENTERA. Como el ancla de respaldo de la frontera es
//      "fin de la última dinámica + 2", cualquier resto del propio generador pegado al pie de la
//      dinámica bajaba el fin, bajaba la frontera, y el bloque se escribía más abajo dejando una capa
//      nueva en la fila que la corrida siguiente vuelve a leer. Un ancla que depende de la basura que
//      ella misma produce no converge.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { anclasDeDinamicas, finDeDinamica, fronteraSegura } from './proveedores-frontera.mjs'
import { footprintDeRango, protegerBorrado, VACIO, topeDelPedido, TOPE_VACIADO, TOPE_VACIADO_MAX } from './no-borrar.mjs'

// ── EL DOBLE DEL SHEET ────────────────────────────────────────────────────────────────────────────
// Contesta rangos A1 como la API: un ancla ("A121") devuelve UNA celda; un rango con fin devuelve el
// rectángulo. Esa diferencia no es un detalle del doble: es el defecto que este archivo prueba.
const nCol = (s) => [...s].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0)

function hojaEnMemoria(filas = []) {
  const g = filas.map((f) => [...(f || [])])
  const at = (i, j) => (g[i] ?? [])[j] ?? ''
  return {
    grid: g,
    leer(range) {
      const celdas = String(range).slice(String(range).lastIndexOf('!') + 1)
      const [a, b] = celdas.split(':')
      const ma = /^([A-Z]+)(\d+)$/.exec(a)
      if (!ma) throw new Error(`rango no soportado por el doble: ${range}`)
      const c0 = nCol(ma[1]) - 1; const f0 = Number(ma[2]) - 1
      const mb = b ? /^([A-Z]+)(\d+)$/.exec(b) : null
      const c1 = mb ? nCol(mb[1]) - 1 : c0
      const f1 = mb ? Number(mb[2]) - 1 : f0
      const out = []
      for (let i = f0; i <= f1; i++) out.push(Array.from({ length: c1 - c0 + 1 }, (_, k) => at(i, c0 + k)))
      // La API recorta las filas y columnas vacías del final; el doble también, o el test probaría
      // contra una comodidad que en producción no existe.
      while (out.length && out[out.length - 1].every((v) => String(v ?? '') === '')) out.pop()
      return out.map((f) => { const r = [...f]; while (r.length && String(r[r.length - 1] ?? '') === '') r.pop(); return r })
    },
    escribir(range, values) {
      const celdas = String(range).slice(String(range).lastIndexOf('!') + 1)
      const m = /^([A-Z]+)(\d+)/.exec(celdas)
      const c0 = nCol(m[1]) - 1; const f0 = Number(m[2]) - 1
      values.forEach((fila, i) => {
        const dest = (g[f0 + i] ??= [])
        ;(fila || []).forEach((v, j) => { dest[c0 + j] = v === VACIO ? '' : v })
      })
    },
  }
}

/** El cliente que `protegerBorrado` espera: sólo `readSheetValues`. */
const clienteDe = (hoja) => ({ readSheetValues: async (_id, range) => hoja.leer(range) })

/** Escribe pasando por la guarda real, como lo hace `batchUpdateValues`. */
async function escribirConGuarda(hoja, range, values, { mios = [], tope } = {}) {
  const nb = await protegerBorrado(clienteDe(hoja), 'x', [{ range, values }], { vaciarPropio: { mios, tope } })
  for (const d of nb.data) hoja.escribir(d.range, d.values)
  return nb
}

// ── LA PESTAÑA DE PRUEBA ──────────────────────────────────────────────────────────────────────────
// Una dinámica de 2 campos de fila + 2 de valor (A..D), como la sección 3 real, y debajo el bloque
// del generador de texto, que ocupa A..F. El sedimento es una capa anterior del MISMO generador.
const ANCLA = 5
const CUERPO = 6
const ANCHO_BLOQUE = 6

const gridConDinamica = () => ({
  sheets: [{ data: [{ startRow: 0, rowData: [{ values: [{}] }, { values: [{}] }, { values: [{}] }, { values: [{}] },
    { values: [{ pivotTable: { rows: [{}, {}], values: [{}, {}] } }] }] }] }],
})

/** El bloque que el generador emite: su título primero, y todo lo que no llena va con el centinela. */
function bloqueDelGenerador(alto = 12) {
  const filas = [['4 · NOTAS DE CRÉDITO', VACIO, VACIO, VACIO, VACIO, VACIO]]
  for (let i = 1; i < alto - 1; i++) {
    filas.push([`Proveedor ${i}`, `0001-0000000${i % 10}`, '14/08/2026', `$46.0${10 + i}`, VACIO, '▲ revisar'])
  }
  filas.push(['TOTAL ACREDITADO', VACIO, VACIO, '$1.000', VACIO, VACIO])
  return filas
}

/** Los rótulos que el generador registró como suyos: la prueba con la que la guarda decide. */
const MIOS = ['4 · NOTAS DE CRÉDITO', 'TOTAL ACREDITADO', '▲ revisar',
  ...Array.from({ length: 30 }, (_, i) => `Proveedor ${i + 1}`)]

/**
 * UNA CORRIDA COMPLETA, EN FRÍO: ubicarse, escribir el bloque, barrer la cola.
 * Devuelve dónde arrancó, cuánto alto ocupó y cuántas celdas barrió — las tres cifras del criterio.
 */
async function corrida(hoja, { alto = 12, cola = 40, tope } = {}) {
  const visible = hoja.leer('Prov!A1:BZ400')
  const dinamicas = anclasDeDinamicas(gridConDinamica())
    .map((a) => ({ ancla: a.fila, col: a.col, ancho: a.ancho, fin: finDeDinamica(visible, a.fila, { col: a.col, ancho: a.ancho }) }))
  const { fila: arranque } = fronteraSegura({ visible, titulo: 'NOTAS DE CRÉDITO', dinamicas })
  const bloque = bloqueDelGenerador(alto)
  const r1 = await escribirConGuarda(hoja, `Prov!A${arranque}`, bloque, { mios: MIOS, tope })
  const finBloque = arranque + bloque.length - 1
  const vacias = Array.from({ length: cola }, () => Array.from({ length: ANCHO_BLOQUE }, () => ''))
  const r2 = await escribirConGuarda(hoja, `Prov!A${finBloque + 1}`, vacias, { mios: MIOS, tope })
  return {
    arranque, alto: bloque.length, finDinamica: dinamicas[0].fin,
    vaciadas: r1.vaciadas + r2.vaciadas, preservadas: r1.preservadas + r2.preservadas,
  }
}

/**
 * Una pestaña con la dinámica arriba y una capa vieja del generador debajo, como el archivo real.
 *
 * `restoFueraDeSusColumnas`: la fila pegada al pie de la dinámica trae un resto del generador de
 * texto en la F —columna que la dinámica NO ocupa—. Es la forma exacta que tienen en el archivo real
 * las filas de una capa vieja ("▲ revisar" en la F, con la A vacía) y es lo que estiraba el fin de la
 * dinámica, que es de donde sale la frontera de respaldo.
 */
function pestanaConSedimento({ restoFueraDeSusColumnas = false, notaDelDueno = null } = {}) {
  const filas = [['Proveedores'], [], [], ['Proveedor', 'CUIT', 'Comprado', 'Comprobantes']]
  filas[ANCLA - 1] = ['Alumetal', '30-56736337-2', '86.901.605', '25']
  for (let i = 1; i < CUERPO; i++) filas.push([`Prov ${i}`, `30-0000000${i}-1`, `${i}.000`, `${i}`])
  if (restoFueraDeSusColumnas) filas.push(['', '', '', '', '', '▲ revisar'])
  filas.push([])
  // La capa anterior del generador, con su título: es lo que la corrida nueva tiene que barrer.
  for (const f of bloqueDelGenerador(18)) filas.push(f.map((c) => (c === VACIO ? '' : c)))
  const hoja = hojaEnMemoria(filas)
  // Una anotación del dueño DENTRO del ancho que el barrido va a limpiar: lo que la guarda protege.
  if (notaDelDueno) hoja.grid[notaDelDueno.fila - 1] = ['', '', '', notaDelDueno.texto]
  return hoja
}

// ── LO QUE SE PRUEBA ──────────────────────────────────────────────────────────────────────────────

describe('el rango que la guarda relee', () => {
  test('un ANCLA se expande al footprint de lo que se escribe — es lo que la guarda tiene que mirar', () => {
    assert.equal(footprintDeRango(`'Proveedores'!A121`, [[1, 2, 3], [4, 5, 6]]), `'Proveedores'!A121:C122`)
    assert.equal(footprintDeRango('Prov!C10', [[1]]), 'Prov!C10:C10')
    // Más de 26 columnas: la letra tiene que seguir contando bien o el rango releído queda corto.
    assert.equal(footprintDeRango('Prov!A1', [Array.from({ length: 30 }, (_, i) => i)]), 'Prov!A1:AD1')
  })

  test('un rango que YA declara su fin no se toca: el llamador dijo hasta dónde llega', () => {
    assert.equal(footprintDeRango(`'Prov'!A121:H160`, [[1, 2]]), `'Prov'!A121:H160`)
    assert.equal(footprintDeRango('Prov!A:H', [[1, 2]]), 'Prov!A:H')
    assert.equal(footprintDeRango('Prov!A1', []), 'Prov!A1')
  })

  test('LA GUARDA VE EL BLOQUE ENTERO, no la primera celda: preserva lo que no puede probar suyo', async () => {
    const hoja = hojaEnMemoria([['mío'], ['UNA NOTA DEL DUEÑO'], ['otra nota']])
    // Una escritura anclada que dejaría vacías las filas 2 y 3. Sin footprint, la guarda no las veía.
    const nb = await escribirConGuarda(hoja, 'Prov!A1', [['mío'], [''], ['']], { mios: [] })
    assert.equal(nb.preservadas, 2, 'las dos notas del dueño tienen que contarse como conservadas')
    assert.equal(hoja.grid[1][0], 'UNA NOTA DEL DUEÑO')
    assert.equal(hoja.grid[2][0], 'otra nota')
  })
})

describe('el tope de vaciado', () => {
  test('sigue existiendo: por defecto 200, y nadie puede pedir más que el techo', () => {
    assert.equal(topeDelPedido(null), TOPE_VACIADO)
    assert.equal(topeDelPedido({ mios: [] }), TOPE_VACIADO)
    assert.equal(topeDelPedido({ tope: 50 }), TOPE_VACIADO, 'un tope menor no afloja ni endurece: manda el global')
    assert.equal(topeDelPedido({ tope: 400 }), 400)
    assert.equal(topeDelPedido({ tope: 5000 }), TOPE_VACIADO_MAX, 'el techo no se puede pasar')
  })
})

describe('dos corridas seguidas con los mismos datos', () => {
  // EL CRITERIO DE `PASOS_RETIRADOS.vuelve`, PRIMERA MITAD: "una corrida informa celdas vaciadas > 0".
  // El número tiene que ser el de la capa entera, no el de la primera celda: con la guarda releyendo
  // el ancla el contador daba 0 ó 1 aunque la escritura borrara —a ciegas— todo lo de abajo.
  test('EL BARRIDO ENCUENTRA LAS CAPAS VIEJAS: informa la capa entera, no una celda', async () => {
    const hoja = pestanaConSedimento()
    const r = await corrida(hoja, { alto: 12, tope: 400 })
    assert.ok(r.vaciadas >= 20,
      `el barrido informó ${r.vaciadas} celdas vaciadas y la capa vieja son decenas: mientras esa cuenta no sea la real, nadie sabe si limpió`)
  })

  test('LO QUE INFORMA ES LO QUE PASÓ: las celdas que dice haber vaciado quedaron vacías', async () => {
    const hoja = pestanaConSedimento()
    const antes = hoja.grid.flat().filter((c) => String(c ?? '') !== '').length
    const r = await corrida(hoja, { alto: 12, tope: 400 })
    const despues = hoja.grid.flat().filter((c) => String(c ?? '') !== '').length
    // Lo que se escribió de nuevo entra con signo contrario, así que no se compara el neto: lo que se
    // exige es que el archivo haya perdido celdas y que el informe no sea mayor que lo que perdió.
    assert.ok(despues < antes, 'la pestaña no perdió una sola celda: no se limpió nada')
    assert.ok(r.vaciadas <= antes, 'el barrido informa más celdas de las que había')
  })

  // EL CRITERIO DE `PASOS_RETIRADOS.vuelve`, SEGUNDA MITAD: mismo alto y misma fila del bloque.
  test('LA FILA DE ARRANQUE NO SE MUEVE, y el alto tampoco', async () => {
    const hoja = pestanaConSedimento()
    const a = await corrida(hoja, { alto: 12, tope: 400 })
    const b = await corrida(hoja, { alto: 12, tope: 400 })
    assert.equal(b.arranque, a.arranque, 'la fila de arranque cambió entre dos corridas con los mismos datos')
    assert.equal(b.alto, a.alto, 'el alto del bloque cambió entre dos corridas con los mismos datos')
  })

  // ═══ EL ANCLA DE RESPALDO NO PUEDE DEPENDER DE LA BASURA QUE ELLA MISMA PRODUCE ═══
  //
  // Cuando el título no está en la columna A —pasó: el dueño lo borró y la pestaña se congeló días—,
  // la frontera es "el fin de la última dinámica + 2". Si ese fin se mide mirando la fila ENTERA,
  // un resto del propio generador pegado al pie de la dinámica lo baja, y con él baja el arranque:
  // el bloque se escribe más abajo y deja una capa nueva justo donde la próxima corrida vuelve a
  // leer. El resto va en la F, que la dinámica no ocupa — la forma que tiene en el archivo real.
  test('EL ARRANQUE DE RESPALDO NO LO CORRE UN RESTO PROPIO en una columna que no es de la dinámica', () => {
    const hoja = pestanaConSedimento({ restoFueraDeSusColumnas: true })
    const visible = hoja.leer('Prov!A1:BZ400')
    const [a] = anclasDeDinamicas(gridConDinamica())
    const conAncho = finDeDinamica(visible, a.fila, { col: a.col, ancho: a.ancho })
    const mirandoTodo = finDeDinamica(visible, a.fila)
    assert.equal(conAncho, ANCLA + CUERPO - 1, 'la dinámica termina donde termina su cuerpo, no donde termina mi resto')
    assert.equal(mirandoTodo, conAncho + 1, 'mirando la fila entera, el resto de la F estira la dinámica una fila')
    // Y esa fila de más es una fila de más en el arranque del bloque: el corrimiento por corrida.
    const sinTitulo = visible.map((f) => (String((f || [])[0] ?? '').includes('NOTAS DE CRÉDITO') ? [] : f))
    const conFix = fronteraSegura({ visible: sinTitulo, titulo: 'NOTAS DE CRÉDITO', dinamicas: [{ ancla: a.fila, fin: conAncho }] })
    const sinFix = fronteraSegura({ visible: sinTitulo, titulo: 'NOTAS DE CRÉDITO', dinamicas: [{ ancla: a.fila, fin: mirandoTodo }] })
    assert.equal(conFix.por, 'dinamicas')
    assert.equal(sinFix.fila - conFix.fila, 1, 'el arranque se corre exactamente lo que el resto estiró la dinámica')
  })

  test('LA PESTAÑA NO CRECE: la segunda corrida deja exactamente la misma grilla', async () => {
    const hoja = pestanaConSedimento()
    await corrida(hoja, { alto: 12, tope: 400 })
    const despuesDeUna = JSON.stringify(hoja.grid)
    await corrida(hoja, { alto: 12, tope: 400 })
    assert.equal(JSON.stringify(hoja.grid), despuesDeUna, 'la segunda corrida cambió la pestaña sin que cambiara un dato')
  })

  test('NO QUEDA UNA CAPA VIEJA DEBAJO: el título del bloque aparece UNA sola vez', async () => {
    const hoja = pestanaConSedimento()
    await corrida(hoja, { alto: 12, tope: 400 })
    const titulos = hoja.grid.filter((f) => String((f || [])[0] ?? '').includes('NOTAS DE CRÉDITO')).length
    assert.equal(titulos, 1, 'dos títulos = dos capas del mismo bloque conviviendo en la pestaña')
  })

  test('SI EL BLOQUE SE ACHICA, la cola de la corrida anterior se barre y no queda colgada', async () => {
    const hoja = pestanaConSedimento()
    await corrida(hoja, { alto: 20, tope: 400 })
    await corrida(hoja, { alto: 10, tope: 400 })
    const totales = hoja.grid.filter((f) => String((f || [])[0] ?? '') === 'TOTAL ACREDITADO').length
    assert.equal(totales, 1, 'el pie del bloque largo sobrevivió al bloque corto: es la cola huérfana')
  })

  // LA OTRA CARA DE LA MISMA GUARDA, Y LA MÁS CARA SI FALLA. Releyendo sólo el ancla, la escritura de
  // la cola —cuarenta filas de cadenas vacías— pasaba entera sin que nadie mirara el destino: no
  // "conservaba" nada porque no veía nada. La nota va en la D, DENTRO del ancho que se barre.
  test('LO DEL DUEÑO NO SE BARRE aunque caiga dentro de la cola que se limpia', async () => {
    const hoja = pestanaConSedimento({ notaDelDueno: { fila: 31, texto: 'llamar a Alumetal el martes' } })
    const r = await corrida(hoja, { alto: 12, tope: 400 })
    const suyas = hoja.grid.filter((f) => (f || []).includes('llamar a Alumetal el martes')).length
    assert.equal(suyas, 1, 'la nota del dueño se perdió: el barrido sólo puede tocar lo que prueba propio')
    assert.ok(r.preservadas > 0, 'la guarda no informó una sola celda conservada: no está mirando el destino')
  })
})

describe('el fin de la dinámica, que es de dónde sale la frontera de respaldo', () => {
  test('un resto del generador en OTRA columna no estira la dinámica', () => {
    const filas = [['ancla', 'a', 'b', 'c'], ['x', 1, 2, 3], [], []]
    filas[3] = ['', '', '', '', '', 'resto de una capa vieja']   // fila 4: vacía en A..D
    assert.equal(finDeDinamica(filas, 1, { col: 0, ancho: 4 }), 2)
    // Sin el ancho declarado se vuelve al criterio viejo, que peca de largo (el lado seguro).
    assert.equal(finDeDinamica(filas, 1), 2, 'la fila 3 está vacía: corta igual')
  })

  test('un resto DENTRO de sus columnas sí la estira — y por eso el ancho tiene que ser el del spec', () => {
    const filas = [['ancla', 'a'], ['x', 1], ['', '', '0002-06532956', '$46.201']]
    assert.equal(finDeDinamica(filas, 1, { col: 0, ancho: 2 }), 2, 'con 2 columnas el resto de la C/D no cuenta')
    assert.equal(finDeDinamica(filas, 1, { col: 0, ancho: 4 }), 3, 'con 4 sí, y es correcto: son sus columnas')
    assert.equal(finDeDinamica(filas, 1), 3, 'mirando la fila entera cuenta siempre')
  })

  test('el ancho sale del spec de la API, no de una estimación', () => {
    const anclas = anclasDeDinamicas(gridConDinamica())
    assert.deepEqual(anclas, [{ fila: ANCLA, col: 0, ancho: 4 }])
    // Con campos de COLUMNA el ancho lo deciden los datos: se declara 0 = "no sé", no "cero".
    const conColumnas = { sheets: [{ data: [{ rowData: [{ values: [{ pivotTable: { rows: [{}], columns: [{}], values: [{}] } }] }] }] }] }
    assert.equal(anclasDeDinamicas(conColumnas)[0].ancho, 0)
  })
})

// ═══ LA CAPA SUPERPUESTA QUE SOBREVIVIÓ A LA PRIMERA CORRIDA REAL (14/08/2026) ═══
//
// Con el footprint arreglado la pestaña dejó de crecer —265 → 261 filas, achicó por primera vez— y
// el tope viaja (`tope 400`). Pero el barrido seguía informando `0 vaciada(s) · 0 conservada(s)` y
// el sedimento seguía publicado. Leídas las filas 118-145 del archivo real, columna por columna, se
// ve QUÉ es exactamente ese sedimento:
//
//   119 | A=DUBOS UGARTE PEDRO LUIS RAUL  B=20-28773782-4  C=0011-00001262  D=26/2/2026
//         F=Qué es  G=Anula → la reemplaza
//
// Esa es LA FILA DE ENCABEZADO del cuadro 4 (`Proveedor · Nota de crédito · Fecha · Importe · ·
// Qué es · Anula → la reemplaza`) aterrizada con SÓLO la F y la G, sobre una fila de datos del
// layout ANTERIOR (proveedor · CUIT · comprobante · fecha, que es el layout de 7 campos que se
// retiró el 04/08). No son dos bloques mal ubicados: es UNA fila con dos dueños.
//
// La causa es un choque de vocabularios entre dos módulos que se llaman entre sí:
//   · `respetarEdiciones`: `''` = "el dueño borró este rótulo, la celda va vacía";
//   · `fusionar`:          `''` = "esta celda NO es mía: conservá lo que haya".
// Un borrado respetado no vaciaba la celda: le entregaba el control al sedimento. Y por eso el
// barrido informa 0 — cuando la guarda mira, la grilla ya trae los valores viejos escritos encima
// de los míos, así que no queda una sola celda vacía sobre contenido que barrer.

import { respetarEdiciones } from './respetar-ediciones.mjs'
// OJO: SON DOS CENTINELAS DISTINTOS CON EL MISMO NOMBRE. `no-borrar.VACIO` es `\0VACIO` y
// `preservar-anotaciones.VACIO` es `\0::VACIO::\0`. El que entiende `fusionar` —y por lo tanto el
// que un generador tiene que emitir para declarar "esta celda es mía y va vacía"— es el segundo; el
// primero vive del lado de la guarda. Importarlos con el mismo nombre en un mismo archivo es cómo se
// escribe un vaciado que no vacía, así que acá se nombran distinto a propósito.
import { fusionar, VACIO as VACIO_FUSION } from './preservar-anotaciones.mjs'

describe('un rótulo que el dueño borró', () => {
  /** La fila de encabezado del cuadro 4, y debajo lo que había: una fila del layout anterior. */
  const encabezado = () => ['Proveedor', 'Nota de crédito', 'Fecha', 'Importe', VACIO_FUSION, 'Qué es', 'Anula → la reemplaza']
  const sedimento = () => ['DUBOS UGARTE PEDRO LUIS RAUL', '20-28773782-4', '0011-00001262', '26/2/2026', '', '', '']

  test('SE DECLARA MÍA Y VACÍA, no "no es mía": si no, el borrado conserva el sedimento', () => {
    const borrados = new Map([['Proveedor', ''], ['Fecha', ''], ['Importe', '']])
    const { grid, respetadas } = respetarEdiciones([encabezado()], [sedimento()], borrados)
    assert.equal(respetadas.length, 3)
    for (const j of [0, 2, 3]) {
      assert.equal(grid[0][j], VACIO_FUSION,
        `la columna ${j} tiene que quedar declarada MÍA Y VACÍA; con '' la fusión conserva lo que haya debajo`)
    }
    // Y la prueba del efecto, que es la que importa: la fila fusionada no arrastra el layout viejo.
    const fusionada = fusionar(grid, [sedimento()])
    assert.deepEqual(fusionada[0].slice(0, 4), ['', 'Nota de crédito', '', ''],
      'la fila salió con datos del layout anterior en A/C/D y el encabezado nuevo en F/G: dos dueños en una fila')
    assert.equal(fusionada[0][5], 'Qué es')
  })

  test('si el dueño lo cambió POR OTRO TEXTO, se escribe el suyo — eso no cambia', () => {
    const { grid } = respetarEdiciones([['Importe']], [['x']], new Map([['Importe', 'Monto']]))
    assert.equal(grid[0][0], 'Monto')
  })

  test('y una celda vacía del generador que NADIE registró sigue significando "no es mía"', () => {
    const { grid } = respetarEdiciones([['Proveedor', '']], [['viejo', 'nota al margen']], new Map())
    assert.equal(fusionar(grid, [['viejo', 'nota al margen']])[0][1], 'nota al margen')
  })
})

// ═══ EL 117 CONTRA EL 121: LA FRONTERA ES EL TÍTULO, Y EL RESPALDO NO LA CORRE ═══
//
// El log de la corrida real dijo `frontera … fila 121 ("NOTAS DE CRÉDITO") · la última dinámica
// termina en la fila 117`, y al terminar el pipeline el título estaba en la 117. No es un desfase
// del cálculo: son DOS SISTEMAS DE COORDENADAS. El log se emite ANTES de escribir, con el archivo
// como estaba (dinámica hasta 117 · colchón 118-120 · título 121); después de escribir, los
// generadores de la sección 1 devolvieron 4 filas de aire —sus dos dinámicas se achicaron 2 filas
// cada una— y todo lo de abajo subió 4. La misma geometría, corrida: dinámica hasta 113 · colchón
// 114-116 · título 117. Medido sobre el archivo de hoy: `fronteraSegura` devuelve 117 por título.
describe('la frontera contra el fin de la dinámica', () => {
  /** La pestaña como quedó: dinámica hasta 113, tres filas de aire, el título en la 117. */
  function comoQuedo() {
    const filas = Array.from({ length: 130 }, () => [])
    filas[64] = ['3 · CON QUIÉN SE GASTA']
    for (let f = 66; f <= 113; f++) filas[f - 1] = [`Prov ${f}`, '30-1', '1.000', '2']
    filas[116] = ['4 · NOTAS DE CRÉDITO']
    return filas
  }

  test('con el título puesto, la frontera es SU fila — el fin de la dinámica no la mueve', () => {
    const filas = comoQuedo()
    const fin = finDeDinamica(filas, 65, { col: 0, ancho: 4 })
    assert.equal(fin, 113, 'la dinámica termina en su cuerpo, no en el título de abajo')
    assert.equal(fronteraSegura({ visible: filas, titulo: 'NOTAS DE CRÉDITO', dinamicas: [{ ancla: 65, fin }] }).fila, 117)
    // Y aunque el fin viniera mal medido —más largo, más corto— el título sigue mandando.
    for (const finMalo of [100, 113, 119]) {
      assert.equal(fronteraSegura({ visible: filas, titulo: 'NOTAS DE CRÉDITO', dinamicas: [{ ancla: 65, fin: finMalo }] }).fila,
        117, `con fin=${finMalo} la frontera se movió: el título tiene que ser el único punto fijo`)
    }
  })

  test('el título NUNCA cuenta como cuerpo de la dinámica de arriba', () => {
    const filas = comoQuedo()
    // Sin la fila en blanco entre medio: la dinámica llega pegada al título.
    for (let f = 114; f <= 116; f++) filas[f - 1] = [`Prov ${f}`, '30-1', '1.000', '2']
    assert.equal(finDeDinamica(filas, 65, { col: 0, ancho: 4 }), 116, 'se comió el título del bloque de abajo')
  })

  test('SIN título, el respaldo NO puede aterrizar sobre la sección de otro: falla cerrado', () => {
    const filas = comoQuedo()
    filas[116] = []                       // el título ancla no está
    filas[118] = ['5 · CONTROL Y AUDITORÍA DE CARGA']
    assert.throws(
      () => fronteraSegura({ visible: filas, titulo: 'NOTAS DE CRÉDITO', dinamicas: [{ ancla: 65, fin: 117 }] }),
      /ahí ya empieza otra sección/,
    )
    // Con lugar libre debajo, el respaldo sí se usa: no se frena de gusto.
    filas[118] = []
    assert.deepEqual(fronteraSegura({ visible: filas, titulo: 'NOTAS DE CRÉDITO', dinamicas: [{ ancla: 65, fin: 113 }] }),
      { fila: 115, por: 'dinamicas' })
  })
})
