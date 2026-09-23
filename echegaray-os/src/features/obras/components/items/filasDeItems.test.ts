import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparFilas, contarItems, diasHabilesEntre, estadoDerivado, filasDeItems, filtrarPorTexto, gruposTelefono, textoPlan,
} from './filasDeItems.ts'
import type { NodoObra } from '../../services/wbs.ts'

const nodo = (n: Partial<NodoObra> & { id: string; nivel: number; padre_id: string | null }): NodoObra => ({
  camino: n.id, es_contenedor: false, tiene_hijas: false, nombre: n.id, tipo: 'tarea', rol_estructura: null,
  partida_codigo: null, unidad: null, cantidad_objetivo: null, cantidad_ejecutada: null, hh_plan: null, hh_real: null,
  metodo_avance: 'cantidad', avance_pct: null, inicio_plan: null, fin_plan: null, responsable: null, cuadrilla: null,
  subcontratista: null, es_subcontrato: false, estado: null, impedimentos_abiertos: 0, n_pasos: 0, n_pasos_hechos: 0,
  peso_pasos: null, analisis_id: null, tarea_tipo_id: null, cotizacion_partida_id: null, tope_frente: null,
  dotacion_prevista: null, cuadrilla_id: null, tiempo_tecnico: false, dias_plan: null, es_critica: false, ...n,
} as NodoObra)

// Rubro › Épica › Historia (2 tareas, una con 2 subtareas) · Historia sin costo (1 tarea)
const ARBOL: NodoObra[] = [
  nodo({ id: 'R', nivel: 0, padre_id: null, nombre: 'Obra gruesa', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'E', nivel: 1, padre_id: 'R', nombre: 'Preparación', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'H1', nivel: 2, padre_id: 'E', nombre: 'Demolición', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'T1', nivel: 3, padre_id: 'H1', nombre: 'Demolición existente', unidad: 'un', cantidad_objetivo: 4, inicio_plan: '2026-09-08', fin_plan: '2026-09-12', tiene_hijas: true }),
  nodo({ id: 'S1', nivel: 4, padre_id: 'T1', nombre: 'sacar escuadras' }),
  nodo({ id: 'S2', nivel: 4, padre_id: 'T1', nombre: 'marcar con cal' }),
  nodo({ id: 'T2', nivel: 3, padre_id: 'H1', nombre: 'Retiro de escombros', unidad: 'un', cantidad_objetivo: 14, inicio_plan: '2026-09-15', fin_plan: '2026-09-15', responsable: 'R. Quiroga', metodo_avance: null as unknown as 'manual' }),
  nodo({ id: 'H2', nivel: 2, padre_id: 'E', nombre: 'Movimiento de suelo', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'T3', nivel: 3, padre_id: 'H2', nombre: 'Desmonte', dias_plan: 3, impedimentos_abiertos: 1 }),
]
const HISTORIAS = [
  { actividad_id: 'H1', costo_mo: 800000, peso: 0.8, sin_costo: false, avance_pct: 0, n_medidas: 0, n_hojas: 2 },
  { actividad_id: 'H2', costo_mo: null, peso: null, sin_costo: true, avance_pct: 0, n_medidas: 0, n_hojas: 1 },
]
const PARTES = [
  { actividad_id: 'T1', fraccion_acumulada: 1, dias_reales: 3, ultimo_parte: '2026-09-10', parte_hoy: false },
  { actividad_id: 'T2', fraccion_acumulada: 0.4, dias_reales: 2, ultimo_parte: '2026-09-16', parte_hoy: true },
]

test('el estado se deriva de los partes: sin parte · en progreso · completado', () => {
  assert.deepEqual(estadoDerivado(undefined), { estado: 'sin_parte', pct: null })
  assert.deepEqual(estadoDerivado({ actividad_id: 'x', fraccion_acumulada: 0.4, dias_reales: 1, ultimo_parte: null, parte_hoy: false }), { estado: 'en_progreso', pct: 40 })
  assert.equal(estadoDerivado({ actividad_id: 'x', fraccion_acumulada: 1, dias_reales: 1, ultimo_parte: null, parte_hoy: false }).estado, 'completado')
})

test('plan y días: «08/09–12/09», un solo día, y los hábiles lunes–viernes', () => {
  assert.equal(textoPlan('2026-09-08', '2026-09-12'), '08/09–12/09')
  assert.equal(textoPlan('2026-09-15', '2026-09-15'), '15/09')
  assert.equal(textoPlan(null, null), null)
  // 08/09/2026 es martes: martes → sábado son 4 hábiles.
  assert.equal(diasHabilesEntre('2026-09-08', '2026-09-12'), 4)
  assert.equal(diasHabilesEntre('2026-09-07', '2026-09-11'), 5)
  assert.equal(diasHabilesEntre('2026-09-11', '2026-09-14'), 2)
})

test('cada historia pesa por su costo de MO y sus tareas se lo reparten parejo', () => {
  const filas = filasDeItems(ARBOL, HISTORIAS, PARTES, 'tarea')
  const por = new Map(filas.map((f) => [f.id, f]))
  assert.deepEqual(filas.map((f) => f.id), ['R', 'E', 'H1', 'T1', 'T2', 'H2', 'T3'])
  assert.deepEqual(filas.map((f) => f.nivel), ['rubro', 'epica', 'historia', 'tarea', 'tarea', 'historia', 'tarea'])
  assert.equal(por.get('R')!.codigo, '1')
  assert.equal(por.get('T2')!.codigo, '1.1.1.2')
  assert.equal(por.get('H1')!.costoMo, 800000)
  assert.equal(por.get('H1')!.peso, 0.8)
  assert.equal(por.get('T1')!.peso, 0.4)
  assert.equal(por.get('H2')!.sinCosto, true)
  assert.equal(por.get('T3')!.peso, null)
  // Estado y avance
  assert.equal(por.get('T1')!.estado, 'completado')
  assert.equal(por.get('T1')!.pctItem, 100)
  assert.ok(Math.abs(por.get('T1')!.avanceObra! - 40) < 1e-9)
  assert.equal(por.get('T2')!.estado, 'en_progreso')
  assert.ok(Math.abs(por.get('T2')!.avanceObra! - 16) < 1e-9)
  assert.equal(por.get('T2')!.parteHoy, true)
  assert.equal(por.get('T3')!.estado, 'sin_parte')
  assert.equal(por.get('T3')!.pctItem, null)
  assert.equal(por.get('T3')!.avanceObra, null)
  assert.equal(por.get('T3')!.bloqueada, true)
  // La historia y arriba agregan
  assert.ok(Math.abs(por.get('H1')!.avanceObra! - 56) < 1e-9)
  assert.equal(por.get('H1')!.pctItem, 70)
  assert.ok(Math.abs(por.get('R')!.avanceObra! - 56) < 1e-9)
  // Días, plan, uni·cant, subtareas plegadas
  assert.equal(por.get('T1')!.plan, '08/09–12/09')
  assert.equal(por.get('T1')!.diasTeoricos, 4)
  assert.equal(por.get('T1')!.diasReales, 3)
  assert.equal(por.get('T1')!.diasWarn, false)
  assert.equal(por.get('T2')!.diasTeoricos, 1)
  assert.equal(por.get('T2')!.diasWarn, true)
  assert.equal(por.get('T3')!.diasTeoricos, 3)
  assert.equal(por.get('T3')!.diasReales, null)
  assert.equal(por.get('T1')!.uniCant, 'un · 4')
  assert.equal(por.get('T3')!.uniCant, null)
  assert.deepEqual(por.get('T1')!.subtareas, ['sacar escuadras', 'marcar con cal'])
  assert.deepEqual(por.get('T2')!.medicion, { texto: 'sin método de medición', tono: 'warn' })
  assert.equal(por.get('T2')!.puedeMedir, false)
  assert.equal(por.get('T1')!.medicion.texto, 'Cantidad · 0/4 un')
  assert.equal(contarItems(filas), 5)
})

test('«Ver hasta» corta el árbol: Historia sin tareas, Subtarea con las subtareas como filas', () => {
  const hastaHistoria = filasDeItems(ARBOL, HISTORIAS, PARTES, 'historia')
  assert.deepEqual(hastaHistoria.map((f) => f.id), ['R', 'E', 'H1', 'H2'])
  const conSub = filasDeItems(ARBOL, HISTORIAS, PARTES, 'subtarea')
  assert.deepEqual(conSub.map((f) => f.id), ['R', 'E', 'H1', 'T1', 'S1', 'S2', 'T2', 'H2', 'T3'])
  assert.equal(conSub.find((f) => f.id === 'S1')!.nivel, 'subtarea')
  assert.deepEqual(conSub.find((f) => f.id === 'T1')!.subtareas, [])
})

test('el filtro conserva los ancestros; agrupar por responsable y estado arma cabeceras', () => {
  const filas = filasDeItems(ARBOL, HISTORIAS, PARTES, 'tarea')
  assert.deepEqual(filtrarPorTexto(filas, 'escombro').map((f) => f.id), ['R', 'E', 'H1', 'T2'])
  assert.deepEqual(filtrarPorTexto(filas, 'escuadras').map((f) => f.id), ['R', 'E', 'H1', 'T1'])
  const porResp = agruparFilas(filas, 'responsable')
  assert.deepEqual(porResp.map((f) => [f.nombre, f.profundidad]), [
    ['sin asignar', 0], ['Demolición existente', 1], ['Desmonte', 1], ['R. Quiroga', 0], ['Retiro de escombros', 1],
  ])
  const porEstado = agruparFilas(filas, 'estado')
  assert.deepEqual(porEstado.filter((f) => f.profundidad === 0).map((f) => f.nombre), ['Completado', 'En progreso', 'Sin parte'])
  assert.deepEqual(agruparFilas(filas, 'rubro').map((f) => f.id), filas.map((f) => f.id))
})

test('los grupos del teléfono: un rubro con sus hojas, el conteo y el %', () => {
  const g = gruposTelefono(filasDeItems(ARBOL, HISTORIAS, PARTES, 'tarea'))
  assert.equal(g.length, 1)
  assert.equal(g[0].nombre, 'Obra gruesa')
  assert.equal(g[0].n, 3)
  assert.deepEqual(g[0].filas.map((f) => f.id), ['T1', 'T2', 'T3'])
})
