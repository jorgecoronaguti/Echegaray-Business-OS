// LA MARCA DE BORRADO TIENE QUE SOBREVIVIR A LA CORRIDA SIGUIENTE.
//
// Es el punto donde el diseño se rompe si se hace mal: `guardarHuellas` barre las huellas del layout
// viejo, y si barriera también las marcas de borrado la celda volvería sola a la corrida siguiente —
// exactamente lo que el dueño pidió que no pasara. Los tests puros de `huella-celda.test.mjs` no
// pueden ver esto porque el barrido vive en SQL.
//
// SE AUTOLIMPIA: usa un file_id sintético y borra todo lo que crea. Si no hay base, se salta (no
// inventa un verde).
import test from 'node:test'
import assert from 'node:assert/strict'
import { guardarHuellas, leerHuellas, claveCelda } from './huella-celda.mjs'
import { query } from './db.mjs'

const FILE = `TEST_HUELLA_${process.pid}`
const TAB = 'Pestaña de prueba'

const hayBase = await query('select 1').then(() => true).catch(() => false)
const limpiar = () => query('delete from public.sheet_huella_celda where file_id = $1', [FILE]).catch(() => {})

test('la marca de borrado sobrevive al barrido; una huella del layout viejo no', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  // Corrida 1: escribo dos celdas.
  await guardarHuellas(FILE, TAB, [['TOTAL', '$ 100,00']], { fila0: 1, col0: 0 })
  const h1 = await leerHuellas(FILE, TAB)
  assert.equal(h1.size, 2)

  // Corrida 2: el dueño vació A1 (la suprimo) y sigo escribiendo B1 con otro importe.
  await guardarHuellas(FILE, TAB, [['', '$ 250,00']], {
    fila0: 1,
    col0: 0,
    suprimidas: [{ fila: 1, col: 0, filaHoy: 1, colHoy: 0, forma: 'total', huella: 'abc' }],
  })
  const h2 = await leerHuellas(FILE, TAB)
  assert.equal(h2.get(claveCelda(1, 0))?.borrada, true, 'la marca de borrado del dueño NO se barre')
  assert.equal(h2.get(claveCelda(1, 1))?.borrada, false)

  // Corrida 3: la celda del dueño sigue vacía y yo sigo sin escribirla. La marca tiene que seguir.
  await guardarHuellas(FILE, TAB, [['', '$ 250,00']], {
    fila0: 1,
    col0: 0,
    suprimidas: [{ fila: 1, col: 0, filaHoy: 1, colHoy: 0, forma: 'total', huella: 'abc' }],
  })
  assert.equal((await leerHuellas(FILE, TAB)).get(claveCelda(1, 0))?.borrada, true, 'sigue marcada dos corridas después')
})

test('el barrido se limita a la ventana escrita: dos bloques en la misma pestaña no se pisan', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  // Bloque A (fila 1) y bloque B (fila 50): dos escrituras distintas sobre la misma pestaña, como
  // hacen CAJA (segunda pasada sobre orígenes) y Proveedores (dos cuadros).
  await guardarHuellas(FILE, TAB, [['bloque de arriba']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['bloque de abajo']], { fila0: 50, col0: 0 })
  const h = await leerHuellas(FILE, TAB)
  assert.equal(h.size, 2, 'el segundo bloque no barrió la huella del primero')
  assert.ok(h.has(claveCelda(1, 0)) && h.has(claveCelda(50, 0)))
})

test('leerHuellas acotado a la ventana no trae las huellas del otro bloque', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  await guardarHuellas(FILE, TAB, [['arriba']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['abajo']], { fila0: 50, col0: 0 })
  const soloArriba = await leerHuellas(FILE, TAB, { fila0: 1, col0: 0, alto: 1, ancho: 1 })
  assert.equal(soloArriba.size, 1)
  assert.ok(soloArriba.has(claveCelda(1, 0)))
})

test('una celda que vuelve a tener contenido pierde la marca: el candado no es eterno', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  await guardarHuellas(FILE, TAB, [['TOTAL']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['']], { fila0: 1, col0: 0, suprimidas: [{ fila: 1, col: 0, filaHoy: 1, colHoy: 0, forma: 'total', huella: 'abc' }] })
  assert.equal((await leerHuellas(FILE, TAB)).get(claveCelda(1, 0))?.borrada, true)
  // El dueño volvió a poner algo ahí y el generador la escribe de nuevo: la marca se levanta.
  await guardarHuellas(FILE, TAB, [['TOTAL']], { fila0: 1, col0: 0 })
  assert.equal((await leerHuellas(FILE, TAB)).get(claveCelda(1, 0))?.borrada, false)
})

/**
 * EL BARRIDO NO PUEDE TIRAR LA EVIDENCIA DE UN JUICIO QUE NO SE HIZO (14/08).
 *
 * Barrer significa "esto ya lo juzgué y es un layout que dejé atrás". Cuando el mapa de posición no
 * alinea —el estado en el que queda una pestaña recién rediseñada— no se juzgó NADA por coordenada, y
 * el barrido borraba igual la huella de la corrida anterior: la única prueba de que esa celda era del
 * OS. La corrida siguiente encontraba `!mia && ocupada` y preservaba el residuo. Para siempre.
 *
 * Es el paso que volvía INMORTAL al residuo de rediseño en «Jornales por Quincena».
 */
test('sin mapa de posición no se barre: la huella del layout anterior sobrevive para juzgarla después',
  { skip: !hayBase && 'sin base' }, async (t) => {
    t.after(limpiar)
    await limpiar()
    // Corrida 1: el layout viejo escribe dos celdas.
    await guardarHuellas(FILE, TAB, [['Básico convenio', 'Banco']], { fila0: 80, col0: 6 })
    assert.equal((await leerHuellas(FILE, TAB)).size, 2)

    // Corrida 2: la pestaña se rediseñó, la huella NO decidió y esas celdas ya no llevan contenido.
    await guardarHuellas(FILE, TAB, [['', '']], { fila0: 80, col0: 6, barrer: false })
    const h = await leerHuellas(FILE, TAB)
    assert.equal(h.size, 2, 'la evidencia sigue disponible para la corrida que sí pueda juzgarla')
    assert.equal(h.get(claveCelda(80, 6))?.forma, 'básico convenio')

    // Y cuando la huella SÍ decide, el barrido vuelve a correr: no se acumula un layout muerto.
    await guardarHuellas(FILE, TAB, [['', '']], { fila0: 80, col0: 6 })
    assert.equal((await leerHuellas(FILE, TAB)).size, 0, 'con mapa, el layout viejo sí se barre')
  })
