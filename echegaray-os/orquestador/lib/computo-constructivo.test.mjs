import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASE, RESPALDO, DEFINE, computarExcavacion, volumenPrisma, rubroDe, cadenaDeCosto, huecosDe, esHueco,
} from './computo-constructivo.mjs'

// ═══ (K) LA EXCAVACIÓN X × Y × Z ═══
//
// El defecto que atrapa: que el volumen salga sin unidad, redondeado a ojo, o —peor— que alguien
// reemplace la multiplicación por una llamada a un modelo. Si el número deja de ser exactamente
// X·Y·Z con `m3` pegado, este test se pone rojo.

test('(K) excavación: ancho × largo × profundidad da el volumen determinístico CON unidad', () => {
  const r = computarExcavacion({ ancho: 0.6, largo: 12, profundidad: 1.2 })
  assert.equal(r.volumenBanco.valor, 8.64)
  assert.equal(r.volumenBanco.unidad, 'm3')
  assert.equal(r.volumenBanco.clase, CLASE.CALCULADO)
  assert.equal(r.volumenBanco.respaldo, RESPALDO.NORMA)
  // LA TRAZA ES PARTE DEL RESULTADO: sin ella el número es una afirmación sin evidencia.
  assert.equal(r.volumenBanco.formula, 'ancho × largo × profundidad')
  assert.deepEqual(r.volumenBanco.entradas, { ancho: 0.6, largo: 12, profundidad: 1.2 })
})

test('(K) el ruido de coma flotante no llega al resultado', () => {
  // 2,5 × 0,4 × 0,3 en binario da 0,30000000000000004. Impreso en una planilla parece un error.
  const r = computarExcavacion({ ancho: 2.5, largo: 0.4, profundidad: 0.3 })
  assert.equal(r.volumenBanco.valor, 0.3)
})

test('(K) sin profundidad NO hay volumen cero: hay un faltante con nombre', () => {
  const r = computarExcavacion({ ancho: 0.6, largo: 12 })
  assert.equal(r.volumenBanco, null)
  assert.deepEqual(r.faltantes, ['profundidad'])
})

test('(K) una dimensión negativa no produce un volumen que parece bueno', () => {
  const r = computarExcavacion({ ancho: 0.6, largo: -12, profundidad: 1.2 })
  assert.equal(r.volumenBanco, null)
  assert.equal(r.imposibles.length, 1)
  assert.match(r.imposibles[0], /largo/)
})

test('(K) el esponjamiento NO se supone: sin coeficiente el volumen suelto es un hueco con dueño', () => {
  const r = computarExcavacion({ ancho: 0.6, largo: 12, profundidad: 1.2 })
  assert.ok(esHueco(r.volumenSuelto))
  assert.equal(r.volumenSuelto.valor, null)
  assert.equal(r.volumenSuelto.requiereDefinicion.quienDefine, DEFINE.DUENO)
})

test('(K) con el coeficiente declarado el volumen suelto sale, y sale como EXPERIENCIA, no como norma', () => {
  const r = computarExcavacion({ ancho: 0.6, largo: 12, profundidad: 1.2, coeficienteEsponjamiento: 1.25 })
  assert.equal(r.volumenSuelto.valor, 10.8)
  assert.equal(r.volumenSuelto.respaldo, RESPALDO.EXPERIENCIA)
})

// ═══ EL RUBRO SALE DE LA BASE MAESTRA ═══

test('el rubro se trae de la Base Maestra cuando el tarea_tipo existe', () => {
  const base = [{ id: 'tt-1', codigo: 'EXC-ZANJA', division: 'MOVIMIENTO DE SUELOS' }]
  const r = computarExcavacion({ ancho: 1, largo: 1, profundidad: 1, tareaTipoCodigo: 'EXC-ZANJA' }, { baseMaestra: base })
  assert.equal(r.rubro.texto, 'MOVIMIENTO DE SUELOS')
  assert.equal(r.rubro.clase, CLASE.EXTRAIDO)
  assert.equal(r.rubro.tareaTipoId, 'tt-1')
})

test('un rubro escrito a mano que no está en la Base Maestra queda REQUIERE_VALIDACION', () => {
  const r = rubroDe({ rubroDeclarado: 'Excavaciones' }, [])
  assert.equal(r.texto, 'Excavaciones')
  assert.equal(r.clase, CLASE.REQUIERE_VALIDACION)
  assert.ok(r.nota)
})

test('sin rubro ni tarea_tipo se dice que falta, no se inventa uno', () => {
  const r = rubroDe({}, [])
  assert.equal(r.texto, null)
  assert.ok(r.nota)
})

// ═══ LA PRIMITIVA ═══

test('volumenPrisma nombra las dimensiones que le pidieron nombrar', () => {
  const r = volumenPrisma(2, 3, 4, { nombres: ['b', 'h', 'L'] })
  assert.equal(r.volumen.valor, 24)
  assert.equal(r.volumen.formula, 'b × h × L')
})

// ═══ LA CADENA geometría → cantidad → insumo → HH → precio → costo ═══

const COMPOSICION = [
  { codigo: 'HA-H21', nombre: 'Hormigón H-21', unidad: 'm3', tipo: 'material', cantidad: 1.02, costoUnitario: 100000, desperdicio: 0.03, fechaPrecio: '2026-08-01' },
  { codigo: 'MO-OF', nombre: 'Oficial', unidad: 'h', tipo: 'mano_obra', cantidad: 4, costoUnitario: 5000 },
  { codigo: 'EQ-VIB', nombre: 'Vibrador', unidad: 'h', tipo: 'equipo', cantidad: 0.5, costoUnitario: 2000 },
]

test('la cadena lleva la cantidad hasta el costo y cada eslabón dice de dónde salió', () => {
  const r = cadenaDeCosto({ cantidad: 10, unidad: 'm3', composicionUnitaria: COMPOSICION })
  // material: 10 × 1,02 × 1,03 = 10,506
  assert.equal(r.insumos[0].cantidad.valor, 10.506)
  assert.equal(r.insumos[0].costo.valor, 1050600)
  assert.equal(r.hh.valor, 40)
  assert.equal(r.hh.unidad, 'HH')
  assert.equal(r.costo.valor, 1050600 + 200000 + 10000)
  assert.equal(r.costo.respaldo, RESPALDO.NORMA)
  assert.deepEqual(r.sinPrecio, [])
})

test('un recurso sin precio NO vale cero: el costo total sale null y se dice cuál falta', () => {
  const sinPrecio = COMPOSICION.map((l) => (l.codigo === 'EQ-VIB' ? { ...l, costoUnitario: null } : l))
  const r = cadenaDeCosto({ cantidad: 10, unidad: 'm3', composicionUnitaria: sinPrecio })
  assert.equal(r.costo, null)
  assert.deepEqual(r.sinPrecio, ['EQ-VIB'])
  // pero las cantidades sí salen: lo que falta es el precio, no el cómputo.
  assert.equal(r.insumos[2].cantidad.valor, 5)
})

test('una composición que viene de nuestras obras se marca EXPERIENCIA, no NORMA', () => {
  const r = cadenaDeCosto({ cantidad: 1, unidad: 'm3', composicionUnitaria: COMPOSICION, origenComposicion: 'experiencia_ecsas' })
  assert.equal(r.hh.respaldo, RESPALDO.EXPERIENCIA)
})

// ═══ LOS HUECOS SE PUEDEN LISTAR SIN CONOCER LA FORMA DEL CÓMPUTO ═══

test('huecosDe encuentra los huecos anidados con su ruta', () => {
  const r = computarExcavacion({ ancho: 0.6, largo: 12, profundidad: 1.2 })
  const h = huecosDe(r)
  assert.equal(h.length, 1)
  assert.equal(h[0].ruta, 'volumenSuelto')
})
