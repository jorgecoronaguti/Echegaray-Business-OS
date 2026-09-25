// Criterios de aceptación de la serie B (ESPECIFICACION-jerarquia-mo.md) que se prueban sin navegador:
//   2. cargar/editar/borrar el costo de una historia recalcula el peso de TODO el árbol;
//   3. historias sin costo: «sin costo de MO · no pesa», fuera del denominador, nunca 0 %;
//   4. contenedores vacíos: «sin hijas»;
//   5. subtareas: no pesan ni cuentan en el promedio; con «pasos» definen el avance de la tarea;
//   6. dividir en frentes conserva la suma exacta de la cantidad.
// Los números de B04/B07 son los del diseño.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  avanceDeHistorias, avanceDeLaObra, textoDeFuenteCosto, avancePorPasos, celdasDePeso, pesosDeLaObra, resumenMO, rotuloPeso,
  type ItemMO,
} from './pesoMO.ts'
import { repartirCantidad, conservaLaCantidad } from './panelTarea.ts'
import { vistaPreviaFrentes } from './estructura.ts'
import { separarPlanYSubtareas } from './subtareas.ts'

// B04 · Obra gruesa › Preparación de terreno {Demolición $1.775.059, Movimiento de suelo sin costo, Replanteo $150.402}
//        › Excavaciones {Base $725.793, Zanjas sin costo} › Fundaciones {Base sin costo, Vigas sin costo} › Muro (sin hijas)
const b04 = (): ItemMO[] => [
  { id: 'R', padre_id: null, nivel: 'rubro', costo_mo: null },
  { id: 'E1', padre_id: 'R', nivel: 'epica', costo_mo: null },
  { id: 'H1', padre_id: 'E1', nivel: 'historia', costo_mo: 1_775_059 },
  { id: 'H2', padre_id: 'E1', nivel: 'historia', costo_mo: null },
  { id: 'H3', padre_id: 'E1', nivel: 'historia', costo_mo: 150_402 },
  { id: 'E2', padre_id: 'R', nivel: 'epica', costo_mo: null },
  { id: 'H4', padre_id: 'E2', nivel: 'historia', costo_mo: 725_793 },
  { id: 'H5', padre_id: 'E2', nivel: 'historia', costo_mo: null },
  { id: 'E3', padre_id: 'R', nivel: 'epica', costo_mo: null },
  { id: 'H6', padre_id: 'E3', nivel: 'historia', costo_mo: null },
  { id: 'E5', padre_id: 'R', nivel: 'epica', costo_mo: null },
]

test('B04: el peso sale del costo; los rubros y épicas suman lo suyo', () => {
  const p = pesosDeLaObra(b04())
  assert.equal(rotuloPeso(p.get('R')!.peso!), '100 %')
  assert.equal(p.get('R')!.costo, 2_651_254)
  assert.equal(rotuloPeso(p.get('E1')!.peso!), '72,6 %')
  assert.equal(p.get('E1')!.costo, 1_925_461)
  assert.equal(rotuloPeso(p.get('H1')!.peso!), '67 %')
  assert.equal(rotuloPeso(p.get('H3')!.peso!), '5,7 %')
  assert.equal(rotuloPeso(p.get('E2')!.peso!), '27,4 %')
})

test('criterio 3: sin costo no pesa, no entra al denominador y nunca es 0 %', () => {
  const p = pesosDeLaObra(b04())
  assert.equal(p.get('H2')!.peso, null)
  assert.equal(p.get('H2')!.estado, 'no_pesa')
  const c = celdasDePeso('historia', p.get('H2'))
  assert.deepEqual(c.costo, { texto: 'sin costo de MO', tono: 'warn' })
  assert.deepEqual(c.peso, { texto: 'no pesa', tono: 'warn' })
  // Una épica con historias pero ninguna con costo: tampoco pesa (no «0 %»).
  assert.deepEqual(celdasDePeso('epica', p.get('E3')).peso, { texto: 'no pesa', tono: 'warn' })
  // El denominador es sólo lo cargado: las que pesan suman 100.
  const suma = ['H1', 'H3', 'H4'].reduce((s, id) => s + p.get(id)!.peso!, 0)
  assert.ok(Math.abs(suma - 1) < 1e-12)
})

test('criterio 4: un contenedor sin hijas dice «sin hijas», no 0 %', () => {
  const p = pesosDeLaObra(b04())
  assert.equal(p.get('E5')!.estado, 'sin_hijas')
  assert.deepEqual(celdasDePeso('epica', p.get('E5')).peso, { texto: 'sin hijas', tono: 'falta' })
})

test('criterio 2: cargar, editar y borrar un costo recalcula el peso de todo el árbol', () => {
  const items = b04()
  const antes = pesosDeLaObra(items)
  // cargar: Movimiento de suelo pasa a costar lo mismo que Demolición
  const cargado = items.map((i) => (i.id === 'H2' ? { ...i, costo_mo: 1_775_059 } : i))
  const despues = pesosDeLaObra(cargado)
  assert.ok(despues.get('H1')!.peso! < antes.get('H1')!.peso!, 'Demolición pierde peso')
  assert.ok(despues.get('H4')!.peso! < antes.get('H4')!.peso!, 'una historia de OTRA épica también')
  assert.equal(despues.get('H2')!.peso, despues.get('H1')!.peso)
  assert.ok(despues.get('E1')!.peso! > antes.get('E1')!.peso!)
  // editar
  const editado = cargado.map((i) => (i.id === 'H4' ? { ...i, costo_mo: 0 } : i))
  assert.equal(pesosDeLaObra(editado).get('H4')!.peso, 0, 'costo 0 cargado a propósito es 0, distinto de NULL')
  // borrar: vuelve exactamente al principio
  const borrado = cargado.map((i) => (i.id === 'H2' ? { ...i, costo_mo: null } : i))
  assert.deepEqual(pesosDeLaObra(borrado), antes)
})

test('B03: la primera historia con costo pesa 100 % hasta que otra cargue', () => {
  const p = pesosDeLaObra([
    { id: 'R', padre_id: null, nivel: 'rubro', costo_mo: null },
    { id: 'E', padre_id: 'R', nivel: 'epica', costo_mo: null },
    { id: 'H', padre_id: 'E', nivel: 'historia', costo_mo: 1_775_059 },
  ])
  assert.equal(rotuloPeso(p.get('H')!.peso!), '100 %')
})

test('rotuloPeso: dos decimales por debajo de 0,1 % (B07 «0,03 %»)', () => {
  assert.equal(rotuloPeso(5_812 / 18_766_718), '0,03 %')
  assert.equal(rotuloPeso(0.095), '9,5 %')
})

test('las tareas no pesan; su parte efectiva es la de la historia repartida entre hermanas (04b)', () => {
  const items: ItemMO[] = [...b04(),
    { id: 'T1', padre_id: 'H4', nivel: 'tarea', costo_mo: null },
    { id: 'T2', padre_id: 'H4', nivel: 'tarea', costo_mo: null },
    { id: 'S1', padre_id: 'T1', nivel: 'subtarea', costo_mo: null },
  ]
  const p = pesosDeLaObra(items)
  assert.equal(p.get('T1')!.peso, null)
  assert.equal(p.get('T1')!.estado, 'no_aplica')
  assert.ok(Math.abs(p.get('T1')!.pesoEfectivo! - p.get('H4')!.peso! / 2) < 1e-12)
  assert.equal(p.get('S1')!.pesoEfectivo, null, 'una subtarea no pesa')
})

test('criterio 5: el avance de la historia es el promedio de sus TAREAS; subtareas afuera; frentes valen su tarea', () => {
  const items: ItemMO[] = [
    { id: 'H', padre_id: null, nivel: 'historia', costo_mo: 3_000_000 },
    { id: 'T1', padre_id: 'H', nivel: 'tarea', costo_mo: null },
    { id: 'S', padre_id: 'T1', nivel: 'subtarea', costo_mo: null },
    { id: 'T2', padre_id: 'H', nivel: 'tarea', tipo: 'resumen', costo_mo: null },
    { id: 'F1', padre_id: 'T2', nivel: 'tarea', costo_mo: null },
    { id: 'F2', padre_id: 'T2', nivel: 'tarea', costo_mo: null },
    { id: 'F3', padre_id: 'T2', nivel: 'tarea', costo_mo: null },
    { id: 'F4', padre_id: 'T2', nivel: 'tarea', costo_mo: null },
    { id: 'H2', padre_id: null, nivel: 'historia', costo_mo: 1_000_000 },
  ]
  const av = avanceDeHistorias(items, new Map([['T1', 100], ['S', 0], ['F1', 50], ['F4', 100]]))
  // (100 + prom(50, 0, 0, 100)) / 2 = 68,75 — el mismo número que dio la vista en el ensayo.
  assert.equal(av.get('H'), 68.75)
  assert.equal(av.get('H2'), null, 'sin tareas: null, no 0')
  const obra = avanceDeLaObra(pesosDeLaObra(items), av)
  assert.ok(Math.abs(obra! - 68.75 * 0.75) < 1e-9)
})

test('criterio 5: con método «pasos», 4 subtareas valen 25 % cada una; y no entran al Gantt', () => {
  assert.equal(avancePorPasos(1, 4), 25)
  assert.equal(avancePorPasos(0, 0), null)
  const filas = [
    { id: 'T', tipo: 'tarea', actividad_padre_id: 'H' },
    { id: 'H', tipo: 'resumen', actividad_padre_id: null },
    { id: 'S1', tipo: 'tarea', actividad_padre_id: 'T' },
    { id: 'S2', tipo: 'tarea', actividad_padre_id: 'T' },
  ]
  const { plan, subtareas } = separarPlanYSubtareas(filas)
  assert.deepEqual(plan.map((f) => f.id).sort(), ['H', 'T'])
  assert.equal(subtareas.get('T')!.length, 2)
})

test('criterio 6: dividir en frentes conserva la suma exacta (también con decimales que no cierran parejo)', () => {
  for (const [cant, n] of [[1840, 2], [13.23, 3], [0.5, 3], [258.77, 7], [1, 3]] as const) {
    const partes = repartirCantidad(cant, n)
    assert.equal(partes.length, n)
    assert.ok(conservaLaCantidad(partes, cant), `${cant} en ${n}`)
  }
  const v = vistaPreviaFrentes('Armadura', 1840, 'Eje 1–4, Eje 5–8')
  assert.deepEqual(v.filas.map((f) => f.cantidad), [920, 920])
})

test('cabecera B: ítems, rubros, épicas, historias sin costo y costo total', () => {
  const r = resumenMO(b04())
  assert.deepEqual(r, { nItems: 11, nRubros: 1, nEpicas: 4, nHistorias: 6, nSinCosto: 3, nTareas: 0, costoTotal: 2_651_254 })
})

test('la fuente del costo dice si es leído, calculado o a mano', () => {
  assert.equal(textoDeFuenteCosto(null), null)
  assert.equal(textoDeFuenteCosto({ origen: 'a_mano' }), 'cargado a mano')
  assert.equal(textoDeFuenteCosto({ origen: 'cotizacion_drive', archivo: 'Cotizacion.xlsm', partidas: [{}] }), 'costo de Cotizacion.xlsm · 1 partida')
  const calc = textoDeFuenteCosto({ origen: 'calculado', archivo: 'Cotizacion piso 120m2.xlsm', partidas: [{}], venta: { archivo: 'Rampa 19:2.pdf' } })
  assert.equal(calc, 'calculado: Análisis × PDF vendido · Rampa 19:2.pdf')
  assert.ok(!/costo de/.test(calc!), 'un cálculo no se presenta como dato leído')
})
