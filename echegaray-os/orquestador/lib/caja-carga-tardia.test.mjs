// EL PARCIAL QUE CRECE SOBRE UNA FILA VIEJA — el caso exacto del dueño, como test.
//
// El defecto que estos tests atrapan: hoy la ventana por fecha económica deja pasar un pago en efectivo
// cargado sobre una fila de marzo, y el cajón queda sobreestimado sin que nada lo diga.

import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoCargaTardia, cargaTardia, invisibleParaLaVentana } from './caja-carga-tardia.mjs'

// Seriales de Sheets: 46258 = 15/08/2026. Marzo cae ~160 días antes.
const CONTEO_DIA = 46258
const CONTEO = new Date(2026, 7, 15, 10, 0, 0)
const MARZO = 46100
const HOY = CONTEO_DIA

const celda = (o) => ({ referencia: 'Compras!T125', valor: 0, valorPrevio: 0, vistoDesde: CONTEO, fecha: MARZO, primera: false, ...o })

test('EL CASO DEL DUEÑO: $500.000 cargados hoy sobre una fila de marzo', () => {
  // "si el dueño paga hoy $500.000 en efectivo aumentando el parcial de una fila fechada en marzo, la
  // ventana por fecha NO lo ve y el cajón queda sobreestimado". Esto es esa frase, medida.
  const r = cargaTardia([
    celda({ valorPrevio: 1000000, valor: 1500000, vistoDesde: new Date(2026, 7, 15, 16, 0, 0) }),
  ], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
  assert.equal(r.medible, true)
  assert.equal(r.sobreestimado, 500000)
  assert.equal(r.detalle[0].referencia, 'Compras!T125')
  assert.match(avisoCargaTardia(r), /500\.000/)
  assert.match(avisoCargaTardia(r), /por encima del real/)
})

test('una fila POSTERIOR al conteo no cuenta: la ventana ya la mira, contarla sería restar dos veces', () => {
  const r = cargaTardia([
    celda({ fecha: HOY + 1, valorPrevio: 0, valor: 800000, vistoDesde: new Date(2026, 7, 16, 9, 0, 0) }),
  ], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
  assert.equal(r.sobreestimado, 0)
  assert.equal(avisoCargaTardia(r), null, 'un aviso que se emite siempre no avisa nada')
})

test('el MISMO DÍA del conteo tampoco: para una salida, la ventana lo incluye', () => {
  // El criterio del empate ya está decidido en caja-ancla-por-instante y vive en un solo lado: las
  // salidas del día del conteo ENTRAN a la ventana. Contarlas acá las restaría por segunda vez.
  assert.equal(invisibleParaLaVentana(CONTEO_DIA, CONTEO_DIA), false)
  assert.equal(invisibleParaLaVentana(MARZO, CONTEO_DIA), true)
  assert.equal(invisibleParaLaVentana(null, CONTEO_DIA), true, 'sin fecha no entra a ninguna ventana: es el mismo hueco')
})

test('un cambio ANTERIOR al conteo no cuenta: ya estaba adentro de lo que el dueño contó', () => {
  const r = cargaTardia([
    celda({ valorPrevio: 0, valor: 900000, vistoDesde: new Date(2026, 7, 15, 8, 0, 0) }),
  ], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
  assert.equal(r.sobreestimado, 0)
})

test('LA PRIMERA MIRADA NO ES EVIDENCIA — si no, la puesta en marcha reportaría la columna entera', () => {
  // El defecto más caro posible de este detector: en la primera corrida TODAS las celdas son nuevas
  // para el centinela. Contarlas daría una alerta de cientos de millones sobre una caja sana, y una
  // alerta así se apaga a mano y no se vuelve a mirar nunca.
  const r = cargaTardia([
    celda({ primera: true, valorPrevio: null, valor: 5000000, vistoDesde: new Date(2026, 7, 15, 16, 0, 0) }),
    celda({ referencia: 'Compras!T126', primera: true, valorPrevio: null, valor: 3000000, vistoDesde: new Date(2026, 7, 15, 16, 0, 0) }),
  ], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
  assert.equal(r.sobreestimado, 0)
  assert.equal(r.sembrando, 2)
  assert.equal(r.miradas, 0)
  assert.equal(avisoCargaTardia(r), null)
})

test('SIN ANCLA NO DEVUELVE CERO: dice que no pudo medir', () => {
  // Un cero devuelto cuando no se pudo medir se lee como "está todo bien". Es el mismo modo de falla
  // que el techo del efectivo sin sello por renglón: un control mudo se lee como un control en verde.
  const r = cargaTardia([celda({})], { anclaDia: NaN, anclaInstante: null })
  assert.equal(r.medible, false)
  assert.equal(r.sobreestimado, 0)
  assert.match(avisoCargaTardia(r), /NO PUDE MEDIR/)
})

test('los dos sentidos se informan por separado: mover un pago de una fila a otra no se compensa solo', () => {
  const r = cargaTardia([
    celda({ referencia: 'Compras!T10', valorPrevio: 0, valor: 400000, vistoDesde: new Date(2026, 7, 15, 16, 0, 0) }),
    celda({ referencia: 'Compras!T11', valorPrevio: 400000, valor: 0, vistoDesde: new Date(2026, 7, 15, 16, 0, 0) }),
  ], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
  assert.equal(r.sobreestimado, 400000)
  assert.equal(r.subestimado, 400000)
  assert.match(avisoCargaTardia(r), /sentido contrario/)
})

test('el aviso NOMBRA la celda que manda: "algo por $X" manda a buscar a seis lados', () => {
  const r = cargaTardia([
    celda({ referencia: 'Compras!T10', etiqueta: 'FERRETERÍA SUR', valorPrevio: 0, valor: 120000, vistoDesde: new Date(2026, 7, 15, 16, 0, 0) }),
    celda({ referencia: 'Compras!T44', etiqueta: 'CORRALÓN', valorPrevio: 0, valor: 900000, vistoDesde: new Date(2026, 7, 15, 16, 0, 0) }),
  ], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
  assert.equal(r.detalle[0].referencia, 'Compras!T44', 'ordenado por tamaño del delta')
  assert.match(avisoCargaTardia(r), /Compras!T44 \(CORRALÓN\)/)
})

test('UN CERO MEDIDO NO ES UN CERO POR NO HABER MIRADO: se cuentan por separado', () => {
  // La distinción es la que hace que este control signifique algo. Una celda cuyo valor el centinela
  // ya veía ANTES del conteo está PROBADA: lo que tiene adentro ya estaba a la vista cuando el dueño
  // contó los billetes. Una que apareció después no prueba nada. Un total único las mezclaba y el
  // mensaje se leía como "está todo bien" en los dos casos.
  const r = cargaTardia([
    celda({ referencia: 'Compras!T10', vistoDesde: new Date(2026, 7, 14, 9, 0, 0), valorPrevio: 0, valor: 0 }),
    celda({ referencia: 'Compras!T11', vistoDesde: new Date(2026, 7, 15, 16, 0, 0), valorPrevio: null, primera: true, valor: 700000 }),
  ], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
  assert.equal(r.cubiertas, 1, 'la que ya estaba antes del conteo se puede afirmar')
  assert.equal(r.sembrando, 1, 'la que apareció después no')
  assert.equal(r.sobreestimado, 0)
})

test('una celda que YA cambió después del conteo se sigue reportando en las corridas siguientes', () => {
  // El delta no es un evento que se consume: mientras el conteo sea el mismo, ese pago sigue afuera de
  // la ventana y el cajón sigue sobreestimado. Si el aviso apareciera una sola vez, el número quedaría
  // mal hasta el próximo conteo y nadie se enteraría.
  const yaCambio = celda({ valorPrevio: 200000, valor: 700000, vistoDesde: new Date(2026, 7, 15, 12, 0, 0) })
  for (const corrida of [1, 2, 3]) {
    const r = cargaTardia([yaCambio], { anclaDia: CONTEO_DIA, anclaInstante: CONTEO })
    assert.equal(r.sobreestimado, 500000, `corrida ${corrida}: el hueco sigue abierto`)
  }
})
