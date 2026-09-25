import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDelArbol, filasVisiblesDelArbol } from './arbolEstructura.ts'
import { nivelDe, nivelDeHijaNueva, porId, type Ponderaciones } from './estructura.ts'
import type { NodoObra } from './wbs.ts'

const nodo = (n: Partial<NodoObra> & { id: string; nivel: number; padre_id: string | null }): NodoObra => ({
  camino: n.id, es_contenedor: false, tiene_hijas: false, nombre: n.id, tipo: 'tarea', rol_estructura: null,
  partida_codigo: null, unidad: null, cantidad_objetivo: null, cantidad_ejecutada: null, hh_plan: null, hh_real: null,
  metodo_avance: 'cantidad', avance_pct: null, inicio_plan: null, fin_plan: null, responsable: null, cuadrilla: null,
  subcontratista: null, es_subcontrato: false, estado: null, impedimentos_abiertos: 0, n_pasos: 0, n_pasos_hechos: 0,
  peso_pasos: null, analisis_id: null, tarea_tipo_id: null, cotizacion_partida_id: null, tope_frente: null,
  dotacion_prevista: null, cuadrilla_id: null, tiempo_tecnico: false, dias_plan: null, es_critica: false, ...n,
} as NodoObra)
const C = { es_contenedor: true, tipo: 'resumen' as const }

// B06 · Obra gruesa › Excavaciones › Base ($ 725.793, un·22) › {B1, B0 (2 subtareas)} · Zanjas (sin costo) · Muro (sin hijas)
const ARBOL: NodoObra[] = [
  nodo({ id: 'R', nivel: 0, padre_id: null, nombre: 'Obra gruesa', ...C }),
  nodo({ id: 'E', nivel: 1, padre_id: 'R', nombre: 'Excavaciones', ...C }),
  nodo({ id: 'H1', nivel: 2, padre_id: 'E', nombre: 'Base', ...C, unidad: 'un', cantidad_objetivo: 22 }),
  nodo({ id: 'T1', nivel: 3, padre_id: 'H1', nombre: 'B1', unidad: 'un', cantidad_objetivo: 11, inicio_plan: '2026-09-01', fin_plan: '2026-09-04' }),
  nodo({ id: 'T2', nivel: 3, padre_id: 'H1', nombre: 'B0', unidad: 'un', cantidad_objetivo: 9, metodo_avance: 'pasos' }),
  nodo({ id: 'S1', nivel: 4, padre_id: 'T2', nombre: 'Vibrado', metodo_avance: 'manual' }),
  nodo({ id: 'S2', nivel: 4, padre_id: 'T2', nombre: 'Platina', metodo_avance: 'manual' }),
  nodo({ id: 'H2', nivel: 2, padre_id: 'E', nombre: 'Zanjas', ...C, unidad: 'ml', cantidad_objetivo: 86 }),
  nodo({ id: 'E2', nivel: 1, padre_id: 'R', nombre: 'Muro', ...C }),
  // Obra cargada antes de la serie B: una tarea colgada del rubro.
  nodo({ id: 'R2', nivel: 0, padre_id: null, nombre: 'Portones', ...C }),
  nodo({ id: 'L1', nivel: 1, padre_id: 'R2', nombre: 'Colocación de motor' }),
]
const PONDS: Ponderaciones = {
  R: { ponderacion: null, costo_mo: null, nivel: 'rubro' }, E: { ponderacion: null, costo_mo: null, nivel: 'epica' },
  H1: { ponderacion: null, costo_mo: 725_793, nivel: 'historia' }, T1: { ponderacion: null, costo_mo: null, nivel: 'tarea' },
  T2: { ponderacion: null, costo_mo: null, nivel: 'tarea' },
  S1: { ponderacion: null, costo_mo: null, nivel: 'subtarea', estado: 'hecha' }, S2: { ponderacion: null, costo_mo: null, nivel: 'subtarea', estado: 'pendiente' },
  H2: { ponderacion: null, costo_mo: null, nivel: 'historia' }, E2: { ponderacion: null, costo_mo: null, nivel: 'epica' },
  R2: { ponderacion: null, costo_mo: null, nivel: 'rubro' }, L1: { ponderacion: null, costo_mo: null, nivel: 'tarea' },
}

test('B06 · código por posición (las subtareas sin número), costo y peso por historia, chips', () => {
  const f = filasDelArbol(ARBOL, PONDS, { insumosPor: { T2: 3 } })
  const por = new Map(f.map((x) => [x.id, x]))
  assert.deepEqual(f.map((x) => [x.codigo, x.nivel]), [
    ['1', 'rubro'], ['1.1', 'epica'], ['1.1.1', 'historia'], ['1.1.1.1', 'tarea'], ['1.1.1.2', 'tarea'], ['', 'subtarea'], ['', 'subtarea'],
    ['1.1.2', 'historia'], ['1.2', 'epica'], ['2', 'rubro'], ['2.1', 'tarea'],
  ])
  assert.deepEqual(por.get('H1')!.costo, { texto: '$ 725.793', tono: 'normal' })
  assert.deepEqual(por.get('H1')!.peso, { texto: '100 %', tono: 'normal' })
  assert.deepEqual(por.get('R')!.peso, { texto: '100 %', tono: 'normal' })
  assert.deepEqual(por.get('H2')!.costo, { texto: 'sin costo de MO', tono: 'warn' })
  assert.deepEqual(por.get('H2')!.peso, { texto: 'no pesa', tono: 'warn' })
  assert.deepEqual(por.get('H2')!.plan, { texto: 'sin tareas', tono: 'falta' })
  assert.deepEqual(por.get('E2')!.peso, { texto: 'sin hijas', tono: 'falta' })
  assert.equal(por.get('T1')!.peso, null, 'las tareas no muestran peso')
  assert.equal(por.get('T2')!.nSubtareas, 2)
  assert.equal(por.get('T2')!.nInsumos, 3)
  assert.equal(por.get('S1')!.hecha, true)
  assert.equal(por.get('S1')!.plan, null)
  assert.equal(por.get('E')!.resumenHijas, '2 historias · 2 tareas')
  assert.equal(por.get('H1')!.resumenHijas, '2 tareas')
  assert.equal(por.get('T1')!.plan!.texto, '01/09 → 04/09')
  assert.equal(por.get('T1')!.dias, 4)
  assert.equal(por.get('L1')!.sinHistoria, true)
  assert.equal(por.get('T1')!.sinHistoria, false)
})

test('plegar una historia esconde sus tareas y subtareas', () => {
  const f = filasDelArbol(ARBOL, PONDS)
  const v = filasVisiblesDelArbol(f, new Set(['H1']))
  assert.ok(!v.some((x) => ['T1', 'T2', 'S1'].includes(x.id)))
  assert.ok(v.some((x) => x.id === 'H2'))
})

test('el nivel explícito manda sobre la profundidad; la hija nueva sigue la escalera', () => {
  const mapa = porId(ARBOL)
  assert.equal(nivelDe(mapa.get('L1')!, mapa, PONDS), 'tarea', 'a profundidad 1 pero es tarea')
  assert.equal(nivelDe(mapa.get('L1')!, mapa), 'tarea', 'sin nivel explícito: ejecutable es tarea')
  assert.equal(nivelDeHijaNueva(null, mapa, PONDS), 'rubro')
  assert.equal(nivelDeHijaNueva(mapa.get('R')!, mapa, PONDS), 'epica')
  assert.equal(nivelDeHijaNueva(mapa.get('E')!, mapa, PONDS), 'historia')
  assert.equal(nivelDeHijaNueva(mapa.get('H1')!, mapa, PONDS), 'tarea')
  assert.equal(nivelDeHijaNueva(mapa.get('T1')!, mapa, PONDS), 'subtarea')
})

test('costo cargado en otra historia: el peso de TODO el árbol cambia al recalcular', () => {
  const antes = new Map(filasDelArbol(ARBOL, PONDS).map((x) => [x.id, x]))
  const ponds2 = { ...PONDS, H2: { ...PONDS.H2, costo_mo: 725_793 } }
  const despues = new Map(filasDelArbol(ARBOL, ponds2).map((x) => [x.id, x]))
  assert.equal(antes.get('H1')!.peso!.texto, '100 %')
  assert.equal(despues.get('H1')!.peso!.texto, '50 %')
  assert.equal(despues.get('H2')!.peso!.texto, '50 %')
  assert.equal(despues.get('E')!.costo!.texto, '$ 1.451.586')
})
