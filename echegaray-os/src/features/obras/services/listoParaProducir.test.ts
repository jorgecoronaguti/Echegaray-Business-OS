import test from 'node:test'
import assert from 'node:assert/strict'
import { listoParaProducir, type InsumosProducir } from './listoParaProducir.ts'
import type { NodoObra } from './wbs.ts'

const nodo = (n: Partial<NodoObra> & { id: string; nivel: number; padre_id: string | null }): NodoObra => ({
  camino: n.id, es_contenedor: false, tiene_hijas: false, nombre: n.id, tipo: 'tarea', rol_estructura: null,
  partida_codigo: null, unidad: null, cantidad_objetivo: null, cantidad_ejecutada: null, hh_plan: null, hh_real: null,
  metodo_avance: 'cantidad', avance_pct: null, inicio_plan: null, fin_plan: null, responsable: null, cuadrilla: null,
  subcontratista: null, es_subcontrato: false, estado: null, impedimentos_abiertos: 0, n_pasos: 0, n_pasos_hechos: 0,
  peso_pasos: null, analisis_id: null, tarea_tipo_id: null, cotizacion_partida_id: null, tope_frente: null,
  dotacion_prevista: null, cuadrilla_id: null, tiempo_tecnico: false, dias_plan: null, es_critica: false, ...n,
} as NodoObra)

const ARBOL: NodoObra[] = [
  nodo({ id: 'R', nivel: 0, padre_id: null, nombre: 'Obra gruesa', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'E', nivel: 1, padre_id: 'R', nombre: 'Fundaciones', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'H', nivel: 2, padre_id: 'E', nombre: 'Platea', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'T1', nivel: 3, padre_id: 'H', nombre: 'Excavación', hh_plan: 96, analisis_id: 'an', cotizacion_partida_id: 'p', inicio_plan: '2026-08-31', fin_plan: '2026-09-02' }),
  nodo({ id: 'T2', nivel: 3, padre_id: 'H', nombre: 'Armadura', hh_plan: 210, metodo_avance: null as unknown as 'manual' }),
  nodo({ id: 'R2', nivel: 0, padre_id: null, nombre: 'Estructura metálica', es_contenedor: true, tipo: 'resumen' }),
]

const base = (o: Partial<InsumosProducir> = {}): InsumosProducir => ({
  obraId: 'qp', clienteNombre: 'Quattropani', nOrdenes: 0, jefeObra: 'J. Paredes',
  inicioPlan: '2026-08-24', finPlan: '2026-09-22', diasHabilesPlan: 21,
  nodos: ARBOL, ponds: { E: { ponderacion: 100, costo_mo: null }, H: { ponderacion: 65, costo_mo: 6_000_000 }, T1: { ponderacion: 50, costo_mo: null }, T2: { ponderacion: 50, costo_mo: null } },
  avancePct: null, costoTeorico: null, metodo: 'manual', ...o,
})

test('nueve líneas, cada una con su faltante concreto y su puerta', () => {
  const p = listoParaProducir(base())
  assert.equal(p.total, 9)
  assert.deepEqual(p.lineas.map((l) => [l.clave, l.listo]), [
    ['cliente', true], ['responsable', true], ['fechas', true], ['estructura', true], ['ponderacion', false],
    ['metodo', false], ['fechas_item', false], ['hh_plan', true], ['partida', false],
  ])
  assert.equal(p.titulo, 'Preparación · 5 de 9')
  assert.equal(p.lineas[0].detalle, 'Quattropani · sin OC')
  assert.equal(p.lineas[2].detalle, '24/08 → 22/09 · 21 días hábiles')
  assert.equal(p.lineas[2].detalleCorto, '24/08 → 22/09 · 21 hábiles')
  assert.equal(p.lineas[3].detalle, '2 ítems en 4 niveles · 2 rubros')
  assert.equal(p.lineas[4].detalle, 'Fundaciones suma 65 % · Estructura metálica sin hijas')
  assert.equal(p.lineas[4].detalleCorto, 'Fundaciones 65 %')
  assert.equal(p.lineas[4].accion?.href, '/obras/qp?vista=tareas&sub=arbol&act=E&panel=ponderacion')
  assert.equal(p.lineas[5].detalle, '1 tarea sin método: no se pueden medir')
  assert.equal(p.lineas[6].detalle, '1 ítem sin fechas')
  assert.equal(p.lineas[7].detalle, '1 de 2 del análisis · 1 a mano')
  assert.equal(p.lineas[8].detalle, '1 de 2 · 1 sin partida no entran al costo teórico')
  assert.equal(p.nota, 'Sellar está apagado: 4 pendientes. Al sellar, la obra pasa de Previo a Desarrollo y el plan de hoy queda como lo prometido.')
  assert.equal(p.obra.manoDeObra, '$ 6,00 M')
  assert.equal(p.obra.hhPlan, '306')
  assert.equal(p.obra.avance, null)
})

test('sin estructura las líneas lo dicen y enlazan a crearla; sin cliente ni fechas no se afirma nada', () => {
  const p = listoParaProducir(base({ nodos: [], ponds: {}, clienteNombre: null, inicioPlan: null, finPlan: null, nOrdenes: null }))
  assert.equal(p.lineas[0].detalle, 'sin cliente · OC sin leer')
  assert.equal(p.lineas[2].detalle, 'sin plazo cargado')
  assert.equal(p.lineas[3].detalle, 'sin estructura')
  assert.equal(p.lineas[3].accion?.label, 'Crear')
  assert.equal(p.hechas, 1)
  assert.equal(p.obra.manoDeObra, null)
})

test('con todo cerrado, sellar se enciende', () => {
  const nodos = ARBOL.filter((x) => x.id !== 'R2').map((x) => x.id === 'T2'
    ? { ...x, metodo_avance: 'cantidad' as const, analisis_id: 'an', cotizacion_partida_id: 'p2', inicio_plan: '2026-09-01', fin_plan: '2026-09-04' }
    : x)
  const p = listoParaProducir(base({ nodos, ponds: { E: { ponderacion: 100, costo_mo: null }, H: { ponderacion: 100, costo_mo: null }, T1: { ponderacion: 50, costo_mo: null }, T2: { ponderacion: 50, costo_mo: null } } }))
  assert.equal(p.pendientes, 0)
  assert.match(p.nota, /^Todo listo/)
})

test('serie B · por costo de MO la línea es «historias sin costo», no «suma 100 %»', () => {
  const p = listoParaProducir(base({ metodo: 'costo_mo', ponds: {
    E: { ponderacion: null, costo_mo: null, nivel: 'epica' }, H: { ponderacion: null, costo_mo: 6_000_000, nivel: 'historia' },
    T1: { ponderacion: null, costo_mo: null, nivel: 'tarea' }, T2: { ponderacion: null, costo_mo: null, nivel: 'tarea' },
  } }))
  const l = p.lineas.find((x) => x.clave === 'ponderacion')!
  assert.equal(l.titulo, 'Costo de MO')
  assert.equal(l.listo, true)
  const sin = listoParaProducir(base({ metodo: 'costo_mo', ponds: { H: { ponderacion: null, costo_mo: null, nivel: 'historia' } } })).lineas.find((x) => x.clave === 'ponderacion')!
  assert.equal(sin.listo, false)
  assert.equal(sin.detalleCorto, '1 sin costo de MO')
  assert.equal(sin.accion?.href, '/obras/qp?vista=tareas&sub=arbol&panel=ponderacion')
})
