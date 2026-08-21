import test from 'node:test'
import assert from 'node:assert/strict'
import { rollup, type NodoObra } from './wbs.ts'
import { contenedores, estadoDeFila, filasVisibles } from './vistaArbol.ts'

const nodo = (id: string, extra: Partial<NodoObra> = {}): NodoObra => ({
  id, padre_id: null, nivel: 0, camino: id, es_contenedor: false, tiene_hijas: false,
  nombre: id, tipo: 'tarea', rol_estructura: null, partida_codigo: null, unidad: null,
  cantidad_objetivo: null, cantidad_ejecutada: null, hh_plan: null, hh_real: null,
  metodo_avance: 'manual', avance_pct: null, fin_plan: null, responsable: null,
  es_subcontrato: false, estado: null, impedimentos_abiertos: 0, n_pasos: 0, n_pasos_hechos: 0,
  peso_pasos: null, analisis_id: null, tope_frente: null, dotacion_prevista: null,
  es_critica: false, ...extra,
})
const contenedor = (id: string, extra: Partial<NodoObra> = {}): NodoObra =>
  nodo(id, { tipo: 'resumen', es_contenedor: true, tiene_hijas: true, ...extra })

/** El árbol de las pruebas: dos rubros, uno con dos actividades y otro con una. */
const ARBOL: NodoObra[] = [
  contenedor('Estructura'),
  nodo('Encofrado de piso', { padre_id: 'Estructura', nivel: 1, avance_pct: 40, hh_plan: 10 }),
  nodo('Hormigonado', { padre_id: 'Estructura', nivel: 1, avance_pct: 0, hh_plan: 10 }),
  contenedor('Terminaciones'),
  nodo('Pintura', { padre_id: 'Terminaciones', nivel: 1, avance_pct: 100, hh_plan: 5 }),
]
const ver = (o: Parameters<typeof filasVisibles>[2]) =>
  filasVisibles(ARBOL, rollup(ARBOL), o).map((f) => f.nodo.id)

// BUSCAR SIN EL CAMINO NO SIRVE. Seis filas sueltas sin su rubro dejan al que mira sin saber a qué
// sector pertenece cada una: el antepasado de una coincidencia se conserva aunque él no coincida.
test('el rubro de una coincidencia se mantiene aunque el rubro no coincida', () => {
  assert.deepEqual(ver({ vista: 'todo', query: 'pintura', plegados: new Set() }),
    ['Terminaciones', 'Pintura'])
})

test('la búsqueda ignora acentos y mayúsculas: se escribe como se escribe en obra', () => {
  assert.deepEqual(ver({ vista: 'todo', query: 'HORMIGONADO', plegados: new Set() }),
    ['Estructura', 'Hormigonado'])
})

// EL COLAPSO SE APLICA DESPUÉS DEL FILTRO. Al revés, buscar algo escondido dentro de un rubro
// cerrado devolvería «nada coincide» teniendo la fila delante.
test('buscar encuentra lo que está dentro de un rubro plegado', () => {
  const plegados = new Set(['Estructura'])
  assert.deepEqual(ver({ vista: 'todo', query: '', plegados }),
    ['Estructura', 'Terminaciones', 'Pintura'])
  assert.deepEqual(ver({ vista: 'todo', query: 'encofrado', plegados: new Set() }),
    ['Estructura', 'Encofrado de piso'])
})

// «EN CURSO» ES AVANCE MAYOR QUE CERO Y MENOR QUE CIEN. Ni lo que no arrancó ni lo terminado.
test('la vista En curso deja afuera lo que no arrancó y lo terminado', () => {
  assert.deepEqual(ver({ vista: 'en_curso', query: '', plegados: new Set() }),
    ['Estructura', 'Encofrado de piso'])
})

test('la vista Con problema junta la deuda de carga, el subcontrato y lo que no tiene responsable', () => {
  const arbol: NodoObra[] = [
    contenedor('R'),
    nodo('ok', { padre_id: 'R', nivel: 1, hh_plan: 4, responsable: 'Cuadrilla 1' }),
    nodo('sin-analisis', { padre_id: 'R', nivel: 1, responsable: 'Cuadrilla 1' }),
    nodo('sub', { padre_id: 'R', nivel: 1, hh_plan: 4, responsable: 'Yeseros', es_subcontrato: true }),
    nodo('sin-nadie', { padre_id: 'R', nivel: 1, hh_plan: 4 }),
  ]
  const ids = filasVisibles(arbol, rollup(arbol), { vista: 'problema', query: '', plegados: new Set() })
    .map((f) => f.nodo.id)
  assert.deepEqual(ids, ['R', 'sin-analisis', 'sub', 'sin-nadie'])
})

test('el caret sólo se dibuja donde quedan hijas después de filtrar', () => {
  const filas = filasVisibles(ARBOL, rollup(ARBOL), { vista: 'todo', query: 'pintura', plegados: new Set() })
  assert.equal(filas.find((f) => f.nodo.id === 'Terminaciones')?.plegable, true)
  assert.equal(filas.find((f) => f.nodo.id === 'Pintura')?.plegable, false)
})

test('«Colapsar» toca los contenedores con hijas, no las actividades', () => {
  assert.deepEqual(contenedores(ARBOL), ['Estructura', 'Terminaciones'])
})

// UN HECHO LE GANA A UNA DEUDA DE CARGA. Una actividad terminada sigue terminada aunque nadie haya
// cargado su análisis: pintarla «Sin análisis» manda a buscar trabajo donde ya no hay.
test('el estado pone el hecho por encima de la deuda de carga, y el impedimento por encima de todo', () => {
  assert.equal(estadoDeFila(nodo('a'), 100).clave, 'hecha')
  assert.equal(estadoDeFila(nodo('a', { impedimentos_abiertos: 1 }), 100).clave, 'impedimento')
  assert.equal(estadoDeFila(nodo('a'), 40).clave, 'en_curso')
  assert.equal(estadoDeFila(nodo('a', { es_critica: true }), 40).clave, 'en_curso_critica')
  assert.equal(estadoDeFila(nodo('a'), null).clave, 'sin_analisis')
  assert.equal(estadoDeFila(nodo('a', { hh_plan: 4 }), null).clave, 'sin_cuadrilla')
  assert.equal(estadoDeFila(nodo('a', { hh_plan: 4, responsable: 'Cuadrilla 1' }), null).clave, 'sin_plan')
  assert.equal(
    estadoDeFila(nodo('a', { hh_plan: 4, responsable: 'Cuadrilla 1', fin_plan: '2026-09-01' }), null).clave,
    'pendiente')
})

// UN AVANCE DE 0 NO ES «SIN AVANCE». El cero lo declaró alguien; el nulo es que nadie lo midió.
test('el cero declarado no se confunde con la ausencia de avance', () => {
  assert.equal(estadoDeFila(nodo('a', { hh_plan: 4, responsable: 'C1', fin_plan: '2026-09-01' }), 0).clave, 'pendiente')
  assert.equal(estadoDeFila(nodo('a', { hh_plan: 4, responsable: 'C1', estado: 'en_curso' }), 0).clave, 'en_curso')
})
