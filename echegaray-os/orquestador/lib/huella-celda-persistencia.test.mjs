// LA MARCA DE BORRADO TIENE QUE SOBREVIVIR A LA CORRIDA SIGUIENTE.
//
// Es el punto donde el diseño se rompe si se hace mal: `guardarHuellas` barre las huellas del layout
// viejo, y si barriera también las marcas de borrado la celda volvería sola a la corrida siguiente —
// exactamente lo que el dueño pidió que no pasara. Los tests puros de `huella-celda.test.mjs` no
// pueden ver esto porque el barrido vive en SQL.
//
// ═══ TODO ADENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK (25/09/2026) ═══
//
// Este archivo escribía COMMITEADO en la base productiva (`declararEscrituraEnPrueba`) con un
// `file_id` sintético y un `t.after` que lo borraba — el mismo patrón que dejó 500 filas
// `TEST_CENTINELA_*` en `caja_conteo_observado` cuando el proceso murió antes de llegar a su límpieza.
// «La marca sobrevive a la corrida siguiente» es una propiedad del SQL (el barrido no toca
// `borrada_en`/`abandonada_en`), y se prueba igual adentro de una transacción: una «corrida siguiente»
// adentro del mismo test es sólo la sentencia siguiente sobre el mismo cliente, que ve lo que la misma
// transacción ya escribió. Muera el proceso donde muera, no queda una fila. Ver `conexion-prestable.mjs`
// y `huella-celda-db.mjs` (la conexión la comparten `huella-celda.mjs` y `huella-footprint.mjs`).
import test from 'node:test'
import assert from 'node:assert/strict'
import { guardarHuellas, leerHuellas, claveCelda, conConexion } from './huella-celda.mjs'
import { getPool, query } from './db.mjs'

const FILE = `TEST_HUELLA_${process.pid}`
const TAB = 'Pestaña de prueba'
const hayBase = await query('select 1').then(() => true).catch(() => false)

/** El cuerpo corre con TODAS las lecturas/escrituras de `sheet_huella_celda` por una conexión en
 *  transacción, y se deshace — el mismo helper que `caja-conteo-centinela-persistencia.test.mjs`. */
async function enRollback(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    return await conConexion(c, fn)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

test('la marca de borrado sobrevive al barrido; una huella del layout viejo no', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
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
}))

test('el barrido se limita a la ventana escrita: dos bloques en la misma pestaña no se pisan', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  // Bloque A (fila 1) y bloque B (fila 50): dos escrituras distintas sobre la misma pestaña, como
  // hacen CAJA (segunda pasada sobre orígenes) y Proveedores (dos cuadros).
  await guardarHuellas(FILE, TAB, [['bloque de arriba']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['bloque de abajo']], { fila0: 50, col0: 0 })
  const h = await leerHuellas(FILE, TAB)
  assert.equal(h.size, 2, 'el segundo bloque no barrió la huella del primero')
  assert.ok(h.has(claveCelda(1, 0)) && h.has(claveCelda(50, 0)))
}))

test('leerHuellas acotado a la ventana no trae las huellas del otro bloque', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await guardarHuellas(FILE, TAB, [['arriba']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['abajo']], { fila0: 50, col0: 0 })
  const soloArriba = await leerHuellas(FILE, TAB, { fila0: 1, col0: 0, alto: 1, ancho: 1 })
  assert.equal(soloArriba.size, 1)
  assert.ok(soloArriba.has(claveCelda(1, 0)))
}))

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL FOOTPRINT DE LA CORRIDA ANTERIOR — la marca que el barrido se llevaba (14/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Éste es el defecto que hacía inmortal al residuo de "Jornales por Quincena": una celda escrita con
// el centinela `VACIO` no sella huella nueva, así que el barrido de la corrida se llevaba la vieja y
// con ella la única prueba de que esa celda fue del generador. Sin la marca de abandono, el test 2
// de abajo (la corrida que NO pudo decidir) borra el registro y el residuo queda sin dueño.

test('la marca de abandono sobrevive al barrido de la corrida que la creó', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await guardarHuellas(FILE, TAB, [['TOTAL DEL CUADRO VIEJO']], { fila0: 1, col0: 0 })
  // Corrida 2: el cuadro se achicó y esta celda ya no la ocupo. Se escribe vacía y se marca abandonada.
  await guardarHuellas(FILE, TAB, [['']], {
    fila0: 1,
    col0: 0,
    abandonadas: [{ fila: 1, col: 0, forma: 'total del cuadro viejo', huella: 'abc', filaMapa: 1 }],
  })
  const h = await leerHuellas(FILE, TAB)
  assert.equal(h.get(claveCelda(1, 0))?.abandonada, true, 'el footprint queda registrado')
  assert.equal(h.get(claveCelda(1, 0))?.forma, 'total del cuadro viejo', 'con la forma que dejé escrita')
  assert.equal(h.get(claveCelda(1, 0))?.borrada, false, 'y no como un borrado del dueño')
}))

test('el footprint sigue ahí después de una corrida que no pudo decidir', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await guardarHuellas(FILE, TAB, [['TOTAL DEL CUADRO VIEJO']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['']], { fila0: 1, col0: 0, abandonadas: [{ fila: 1, col: 0, forma: 'total del cuadro viejo' }] })
  // Corrida 3: la alineación no alcanzó el umbral, `aplicarHuella` no devolvió ninguna desocupada y
  // el generador escribe igual. El registro NO se puede barrer acá: es la corrida siguiente la que
  // lo necesita para probar de quién es el residuo.
  await guardarHuellas(FILE, TAB, [['']], { fila0: 1, col0: 0 })
  assert.equal((await leerHuellas(FILE, TAB)).get(claveCelda(1, 0))?.abandonada, true, 'dos corridas después sigue registrado')
}))

test('la celda que vuelve a ocuparse con contenido deja de estar abandonada', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await guardarHuellas(FILE, TAB, [['TOTAL']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['']], { fila0: 1, col0: 0, abandonadas: [{ fila: 1, col: 0, forma: 'total' }] })
  // El cuadro volvió a crecer y esta fila es otra vez del layout vivo: la marca se levanta sola, si no
  // el generador se quedaría sin poder escribir una celda que hoy sí ocupa.
  await guardarHuellas(FILE, TAB, [['TOTAL']], { fila0: 1, col0: 0 })
  const h = await leerHuellas(FILE, TAB)
  assert.equal(h.get(claveCelda(1, 0))?.abandonada, false)
  assert.equal(h.get(claveCelda(1, 0))?.borrada, false)
}))

test('una celda que vuelve a tener contenido pierde la marca: el candado no es eterno', { skip: !hayBase && 'sin base' }, () => enRollback(async () => {
  await guardarHuellas(FILE, TAB, [['TOTAL']], { fila0: 1, col0: 0 })
  await guardarHuellas(FILE, TAB, [['']], { fila0: 1, col0: 0, suprimidas: [{ fila: 1, col: 0, filaHoy: 1, colHoy: 0, forma: 'total', huella: 'abc' }] })
  assert.equal((await leerHuellas(FILE, TAB)).get(claveCelda(1, 0))?.borrada, true)
  // El dueño volvió a poner algo ahí y el generador la escribe de nuevo: la marca se levanta.
  await guardarHuellas(FILE, TAB, [['TOTAL']], { fila0: 1, col0: 0 })
  assert.equal((await leerHuellas(FILE, TAB)).get(claveCelda(1, 0))?.borrada, false)
}))

test('NO QUEDA NADA: después de las pruebas, cero filas de prueba en la tabla real', { skip: !hayBase && 'sin base' }, async () => {
  const n = await query(`select count(*)::int n from public.sheet_huella_celda where file_id like 'TEST_HUELLA_%'`)
  assert.equal(n.rows[0].n, 0, 'una fila TEST_HUELLA_* en producción es un test que escribió fuera de su transacción')
})
