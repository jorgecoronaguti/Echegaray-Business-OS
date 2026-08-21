import test from 'node:test'
import assert from 'node:assert/strict'
import { rollup, sinAnalisis, totalObra, type NodoObra } from './wbs.ts'

/** Un nodo con todo en null: cada prueba enciende sólo lo que le importa. */
const nodo = (id: string, extra: Partial<NodoObra> = {}): NodoObra => ({
  id,
  padre_id: null,
  nivel: 0,
  camino: id,
  es_contenedor: false,
  tiene_hijas: false,
  nombre: id,
  tipo: 'tarea',
  rol_estructura: null,
  partida_codigo: null,
  unidad: null,
  cantidad_objetivo: null,
  cantidad_ejecutada: null,
  hh_plan: null,
  hh_real: null,
  metodo_avance: 'manual',
  avance_pct: null,
  fin_plan: null,
  responsable: null,
  es_subcontrato: false,
  estado: null,
  impedimentos_abiertos: 0,
  n_pasos: 0,
  n_pasos_hechos: 0,
  peso_pasos: null,
  analisis_id: null,
  tope_frente: null,
  dotacion_prevista: null,
  es_critica: false,
  ...extra,
})

const contenedor = (id: string, extra: Partial<NodoObra> = {}): NodoObra =>
  nodo(id, { tipo: 'resumen', es_contenedor: true, tiene_hijas: true, ...extra })

// EL AVANCE DE UN CONTENEDOR SE PONDERA POR HH Y NO SE PROMEDIA. Una actividad de 900 HH al 0% y
// una de 100 HH al 100% no dan 50%: dan 10%. El promedio simple es exactamente la manera de que un
// rubro diga que va por la mitad cuando lo pesado no arrancó.
test('el rollup pondera por HH: lo pesado manda', () => {
  const arbol = [
    contenedor('r'),
    nodo('a', { padre_id: 'r', nivel: 1, hh_plan: 900, avance_pct: 0 }),
    nodo('b', { padre_id: 'r', nivel: 1, hh_plan: 100, avance_pct: 100 }),
  ]
  const ag = rollup(arbol).get('r')
  assert.equal(ag?.avance_pct, 10)
  assert.equal(ag?.ponderacion, 'hh')
  assert.equal(ag?.hh_plan, 1000)
})

// SIN UNA SOLA HH CARGADA —que es el estado real de las tres obras al 21/08/2026— el ponderado no
// tiene base. Devolver `null` dejaría los 148 contenedores diciendo «sin base»; devolver un
// promedio SIN DECIRLO haría pasar por ponderado un número que no lo es. Se promedia y se declara.
test('sin HH en ninguna hija se promedia en partes iguales, y el criterio queda declarado', () => {
  const arbol = [
    contenedor('r'),
    nodo('a', { padre_id: 'r', nivel: 1, avance_pct: 0 }),
    nodo('b', { padre_id: 'r', nivel: 1, avance_pct: 100 }),
  ]
  const ag = rollup(arbol).get('r')
  assert.equal(ag?.avance_pct, 50)
  assert.equal(ag?.ponderacion, 'iguales')
  assert.equal(ag?.hh_plan, null, 'cero HH diría que el rubro no lleva mano de obra')
})

// UNA HIJA SIN AVANCE NO ES UNA HIJA AL 0%. Si entrara al promedio como cero, cargar una actividad
// nueva en un rubro terminado lo bajaría del 100% sin que nadie haya desandado un solo trabajo.
test('la hija sin avance no entra al ponderado, y no lo baja', () => {
  const arbol = [
    contenedor('r'),
    nodo('a', { padre_id: 'r', nivel: 1, hh_plan: 100, avance_pct: 100 }),
    nodo('nueva', { padre_id: 'r', nivel: 1, hh_plan: 100, avance_pct: null }),
  ]
  assert.equal(rollup(arbol).get('r')?.avance_pct, 100)
})

test('un contenedor sin ninguna hija con avance no tiene avance: es null, no 0', () => {
  const arbol = [contenedor('r'), nodo('a', { padre_id: 'r', nivel: 1 })]
  const ag = rollup(arbol).get('r')
  assert.equal(ag?.avance_pct, null)
  assert.equal(ag?.ponderacion, null)
})

// EL ÁRBOL TIENE N NIVELES DESDE EL 21/08/2026: el techo de tres se retiró de la base. Un rollup
// que sólo mirara a las hijas directas dejaría al sector sin ver el trabajo de sus frentes.
test('el rollup sube por N niveles: sector › frente › actividad', () => {
  const arbol = [
    contenedor('sector'),
    contenedor('frente', { padre_id: 'sector', nivel: 1 }),
    nodo('a', { padre_id: 'frente', nivel: 2, hh_plan: 40, avance_pct: 50 }),
    nodo('b', { padre_id: 'frente', nivel: 2, hh_plan: 60, avance_pct: 100 }),
  ]
  const ag = rollup(arbol)
  assert.equal(ag.get('frente')?.avance_pct, 80)
  assert.equal(ag.get('sector')?.avance_pct, 80)
  assert.equal(ag.get('sector')?.hh_plan, 100)
})

// EL PLAZO DE UN CONTENEDOR ES EL MÁXIMO DE SUS HIJAS: un rubro termina cuando termina la última.
test('el fin de un contenedor es la fecha más tardía de sus hijas', () => {
  const arbol = [
    contenedor('r'),
    nodo('a', { padre_id: 'r', nivel: 1, fin_plan: '2026-09-01' }),
    nodo('b', { padre_id: 'r', nivel: 1, fin_plan: '2026-10-15' }),
    nodo('c', { padre_id: 'r', nivel: 1, fin_plan: null }),
  ]
  assert.equal(rollup(arbol).get('r')?.fin_plan, '2026-10-15')
})

// SIN ANÁLISIS ES DEUDA DE CARGA, Y SE CUENTA HACIA ARRIBA: el pie de la pantalla publica cuántas
// actividades no se pueden dimensionar, que es lo que hay que ir a cargar.
test('las actividades sin análisis se cuentan en el contenedor y en la obra', () => {
  const arbol = [
    contenedor('r'),
    nodo('a', { padre_id: 'r', nivel: 1 }),
    nodo('b', { padre_id: 'r', nivel: 1, hh_plan: 10 }),
    nodo('suelta'),
  ]
  const ag = rollup(arbol)
  assert.equal(ag.get('r')?.n_sin_analisis, 1)
  assert.equal(ag.get('r')?.n_actividades, 2)
  const total = totalObra(arbol, ag)
  assert.equal(total.n_actividades, 3, 'la actividad colgada de la raíz también cuenta')
  assert.equal(total.n_sin_analisis, 2)
})

test('un contenedor nunca está «sin análisis»: no se mide, se agrega', () => {
  assert.equal(sinAnalisis(contenedor('r')), false)
  assert.equal(sinAnalisis(nodo('a', { cantidad_objetivo: 12 })), false)
  assert.equal(sinAnalisis(nodo('a')), true)
})
