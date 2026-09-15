// QUÉ DEFECTOS ATRAPAN ESTOS TESTS
//
//   1. El semáforo de `Compras!Z` vuelve a publicarse con un glifo que el PDF no dibuja (el defecto
//      original: 846 celdas con señal invisible en el papel con el que se da una pestaña por buena).
//   2. Se cambia el glifo y NO se actualiza `residuo-propio`: las filas del semáforo dejan de
//      reconocerse como generadas y su residuo se vuelve inmortal. Es el arrastre que obliga a que
//      las dos cosas viajen en el mismo commit.
//   3. La fórmula se escribe con comas: en locale es_AR la coma es el decimal y entra rota.
//   4. Se pierde el reconocimiento de lo YA publicado (emoji, y emoji con `#REF!`): sin eso el
//      script no puede probar que la celda es la que cree y pisaría a ciegas.
//   5. Vuelve el `#REF!` a las 38 fórmulas que lo tenían.
//   6. El lector del libro deja de ver pagada una compra por culpa del glifo nuevo: sería $407M
//      cambiando de estado en silencio.
//   7. La normalización de `U` toca una de las dos filas en otra moneda, o toca un importe real.

import test from 'node:test'
import assert from 'node:assert/strict'
import { glifosInvisibles, SEMAFORO, SEMAFORO_HEREDADO } from './glifos.mjs'
import { formaDeGenerador, filaTieneAncla, residuosPropios } from './residuo-propio.mjs'
import { estaPagada } from './libro-extractores-compras.mjs'
import {
  FILA0, FILAS_EN_OTRA_MONEDA, columnasValores, GUION_TIPEADO, ROTULO, esSemaforoConocido, filasConGuion,
  formulaEstadoPago, formulaEstadoPagoHeredada, referenciaAColumna, tramosContiguos,
} from './compras-valores.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'

/** Las letras del layout de hoy, resueltas por rótulo como las resuelve el script. */
const COL = columnasValores(COMPRAS_2508)

/** Los cuatro rótulos que el semáforo puede dejar escritos en una celda. */
const ROTULOS = (g) => [`${g.pagado} Pagado`, `${g.vencido} Vencido`, `${g.porVencer} Por vencer`, `${g.vigente} Vigente`]

test('EL DEFECTO ORIGINAL: ningún estado del semáforo lleva un glifo que el PDF pierda', () => {
  for (const r of ROTULOS(SEMAFORO)) {
    assert.deepEqual(glifosInvisibles(r), [], `"${r}" publica un glifo que el exportador no embebe`)
  }
  // Y la fórmula entera, que es lo que de verdad se escribe en la celda.
  assert.deepEqual(glifosInvisibles(formulaEstadoPago(4, COL)), [])
  // El control mira algo: los cuatro glifos publicados SÍ se pierden. Sin esta mitad, un detector
  // apagado haría pasar el test de arriba sin haber verificado nada.
  for (const r of ROTULOS(SEMAFORO_HEREDADO)) assert.ok(glifosInvisibles(r).length, `"${r}" debería perderse`)
})

test('los cuatro estados son DISTINGUIBLES entre sí: un semáforo colapsado no informa', () => {
  const g = Object.values(SEMAFORO)
  assert.equal(new Set(g).size, 4, 'dos estados comparten glifo: se perdió la distinción que es el dato')
})

test('EL ARRASTRE: la guarda de borrado sigue reconociendo las filas del semáforo', () => {
  // Si esto se pone rojo, el generador no puede limpiar su propio residuo en esas filas y cada
  // corrida deja una copia más — el defecto que documenta el encabezado de `residuo-propio.mjs`.
  for (const marca of [SEMAFORO.pagado, SEMAFORO.vencido, SEMAFORO.porVencer, SEMAFORO_HEREDADO.porVencer, SEMAFORO_HEREDADO.pagado]) {
    const rotulo = `${marca} Por vencer`
    assert.equal(formaDeGenerador(rotulo), true, `formaDeGenerador no reconoce "${rotulo}"`)
    assert.equal(filaTieneAncla([rotulo]), true, `filaTieneAncla no ancla en "${rotulo}"`)
  }
  // Una fila entera del semáforo, con su importe al lado, se puede limpiar completa.
  const { vaciables, ancladas } = residuosPropios([[`${SEMAFORO.porVencer} Por vencer`, '$ 1.000']])
  assert.equal(ancladas, 1)
  assert.equal(vaciables.size, 2)
})

test('y NO se ensanchó la guarda: `○` queda afuera igual que el `🟢` que reemplaza', () => {
  // Reconocer de menos vuelve el residuo inmortal; reconocer de más amplía en silencio qué celda
  // puede borrar un generador. `🟢` nunca estuvo en la lista, así que su reemplazo tampoco entra.
  assert.equal(formaDeGenerador(`${SEMAFORO.vigente} Vigente`), false)
  assert.equal(formaDeGenerador(`${SEMAFORO_HEREDADO.vigente} Vigente`), false)
  // Y una anotación del dueño sigue sin ser "mía".
  assert.equal(formaDeGenerador('ojo con esto'), false)
})

test('LA FÓRMULA VA EN LOCALE es_AR: separador `;`, y ninguna coma fuera de un texto', () => {
  const f = formulaEstadoPago(4, COL)
  assert.ok(f.includes(';'), 'sin `;` la fórmula no es de este archivo')
  assert.equal(f.replace(/"[^"]*"/g, '').includes(','), false, 'una coma separadora entra como decimal')
})

test('la fórmula nombra SU fila y las columnas del contrato, no una posición fija', () => {
  const f = formulaEstadoPago(791, COL)
  for (const c of [COL.total, COL.estado, COL.prevista]) {
    assert.ok(f.includes(`${c}791`), `la fórmula de la fila 791 no referencia ${c}791`)
  }
  assert.equal(formulaEstadoPago(4, COL).includes('791'), false, 'la fórmula quedó anclada a otra fila')
})

test('EL `#REF!` NO VUELVE: la fórmula nueva apunta siempre a la fecha prevista', () => {
  // 38 de las 1.136 celdas vivas lo tienen. Se reconoce para poder pisarlo, y no se reescribe.
  assert.equal(formulaEstadoPago(697, COL).includes('#REF!'), false)
  assert.ok(formulaEstadoPagoHeredada(697, COL, { refRota: true }).includes('#REF!'))
  assert.ok(formulaEstadoPago(697, COL).includes(`${COL.prevista}697`))
})

test('se reconocen las TRES formas publicadas, y ninguna otra', () => {
  assert.equal(esSemaforoConocido(formulaEstadoPago(4, COL), 4, COL), true)
  assert.equal(esSemaforoConocido(formulaEstadoPagoHeredada(4, COL), 4, COL), true)
  assert.equal(esSemaforoConocido(formulaEstadoPagoHeredada(697, COL, { refRota: true }), 697, COL), true)
  assert.equal(esSemaforoConocido('', 4, COL), true, 'una celda vacía no es una fórmula ajena')
  // Fail-closed: la fórmula de OTRA fila no es la de ésta, y algo tipeado a mano tampoco.
  assert.equal(esSemaforoConocido(formulaEstadoPago(5, COL), 4, COL), false)
  assert.equal(esSemaforoConocido('=X4', 4, COL), false)
  assert.equal(esSemaforoConocido('Pagado', 4, COL), false)
})

test('EL LIBRO SIGUE VIENDO PAGADA UNA COMPRA con el glifo nuevo', () => {
  // `estaPagada` compara sólo lo alfabético, así que tolera la decoración. Si alguien la endurece,
  // toda compra pagada pasaría a PROYECTADO y el cash flow contaría plata que ya salió.
  for (const g of [SEMAFORO.pagado, SEMAFORO_HEREDADO.pagado]) assert.equal(estaPagada(`${g} Pagado`), true)
  assert.equal(estaPagada(`${SEMAFORO.porVencer} Por vencer`), false)
})

test('el guion tipeado se distingue de un importe de verdad', () => {
  for (const v of ['$ -', '-', ' $  - ', '—', '–']) assert.equal(GUION_TIPEADO.test(v), true, `no reconoce "${v}"`)
  for (const v of ['-1.300.000', '$ 318.988,59', '0', '', '=T700-O700', 'USD -']) {
    assert.equal(GUION_TIPEADO.test(v), false, `"${v}" no es un guion tipeado`)
  }
})

test('LAS DOS FILAS EN OTRA MONEDA NO SE NORMALIZAN: eso lo decide el dueño', () => {
  const col = []
  for (let i = 0; i < 320; i++) col[i] = ['']
  col[3 - 1] = [ROTULO.parcial1]        // el encabezado, arriba de FILA0
  col[10 - 1] = ['$ -']
  col[11 - 1] = [318988.59]
  col[268 - 1] = ['$ -']
  col[314 - 1] = ['$ -']
  col[316 - 1] = ['$ -']
  const { normalizar, excluidas } = filasConGuion(col)
  assert.deepEqual(normalizar, [10, 316])
  assert.deepEqual(excluidas, FILAS_EN_OTRA_MONEDA.slice())
  assert.equal(normalizar.includes(11), false, 'se metió un importe real en la normalización')
})

test('no se mira arriba de la primera fila de datos', () => {
  const col = [['$ -'], ['$ -'], ['$ -'], ['$ -']]
  assert.deepEqual(filasConGuion(col).normalizar, [FILA0])
})

test('EL DETECTOR DE REFERENCIAS ENCUENTRA ALGO: si no, "nadie la lee" es una frase vacía', () => {
  // Es el control del que cuelga borrar una columna entera. Un falso negativo acá borra una columna
  // viva, así que se prueban las dos mitades: lo que tiene que encontrar y lo que no.
  for (const f of ['=SUM($AG4:$AG)', '=AG4+1', '=IF($AG$4=1;"";"x")', '=COUNTIFS($AG$4:$AG;1)']) {
    assert.equal(referenciaAColumna(f, 'AG', { propia: true }), true, `no encuentra AG en ${f}`)
  }
  for (const f of ['=SUM(Compras!$AG$4:$AG)', "=SUMIFS('Compras'!AG4:AG;A1;1)"]) {
    assert.equal(referenciaAColumna(f, 'AG'), true, `no encuentra Compras!AG en ${f}`)
  }
  // Y no grita por lo que no es una referencia.
  for (const f of ['=SUM(PAGO4)', '=TEXT(C4;"ago-yy")', '=AH4', '=SUM($AH$4:$AH)', 'AG4', '=RANGO1']) {
    assert.equal(referenciaAColumna(f, 'AG', { propia: true }), false, `${f} no referencia AG`)
  }
  // Desde otra pestaña, una celda AG propia NO es una referencia a Compras.
  assert.equal(referenciaAColumna('=AG4', 'AG'), false)
})

test('los tramos contiguos agrupan sin perder ni inventar una fila', () => {
  assert.deepEqual(tramosContiguos([]), [])
  assert.deepEqual(tramosContiguos([10, 11, 12, 20, 30, 31]), [
    { desde: 10, hasta: 12 }, { desde: 20, hasta: 20 }, { desde: 30, hasta: 31 },
  ])
  const filas = [4, 5, 9, 10, 11, 40]
  const total = tramosContiguos(filas).reduce((a, t) => a + (t.hasta - t.desde + 1), 0)
  assert.equal(total, filas.length)
})

// ═══ «OBRA» INSERTADA EN COMPRAS L (14/09/2026): LA LETRA SALE DEL RÓTULO, ANTES Y DESPUÉS ═══
test('con «Obra» insertada, el semáforo compara el Estado, el Total y la fecha prevista que dicen su rótulo', () => {
  const antes = formulaEstadoPago(4, columnasValores(COMPRAS_2508))
  assert.ok(antes.startsWith('=IF(O4="";"";IF(X4="Pagado"'), antes.slice(0, 40))
  assert.ok(antes.includes('Q4<TODAY()'))
  const despues = formulaEstadoPago(4, columnasValores(COMPRAS_CON_OBRA))
  assert.ok(despues.startsWith('=IF(P4="";"";IF(Y4="Pagado"'), despues.slice(0, 40))
  assert.ok(despues.includes('R4<TODAY()'), 'la fecha prevista también se corre una letra')
  assert.deepEqual({ ...columnasValores(COMPRAS_CON_OBRA) }, { total: 'P', prevista: 'R', estado: 'Y', semaforo: 'AA', parcial1: 'V' })
  assert.throws(() => formulaEstadoPago(4), /resueltas por rótulo/)
})
