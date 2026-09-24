import test from 'node:test'
import assert from 'node:assert/strict'
import {
  comoQuedaLaObra, correrDiasHabiles, diasTeoricos, filasDePonderacion, millones, motivoMetodoApagado,
  nivelDe, nivelDeHijaNueva, porId, quedanPorRepartir, razonesParaDividir, repartir, resumenDeEstructura,
  rotuloPlan, rotuloProblema, sumaPonderacion, textoDeFrentes, textoDePasos, tituloPonderacion,
  vistaPreviaFrentes, pesoEnElAbuelo, type Ponderaciones,
} from './estructura.ts'
import type { NodoObra } from './wbs.ts'

const nodo = (n: Partial<NodoObra> & { id: string; nivel: number; padre_id: string | null }): NodoObra => ({
  camino: n.id, es_contenedor: false, tiene_hijas: false, nombre: n.id, tipo: 'tarea', rol_estructura: null,
  partida_codigo: null, unidad: null, cantidad_objetivo: null, cantidad_ejecutada: null, hh_plan: null, hh_real: null,
  metodo_avance: 'cantidad', avance_pct: null, inicio_plan: null, fin_plan: null, responsable: null, cuadrilla: null,
  subcontratista: null, es_subcontrato: false, estado: null, impedimentos_abiertos: 0, n_pasos: 0, n_pasos_hechos: 0,
  peso_pasos: null, analisis_id: null, tarea_tipo_id: null, cotizacion_partida_id: null, tope_frente: null,
  dotacion_prevista: null, cuadrilla_id: null, tiempo_tecnico: false, dias_plan: null, es_critica: false, ...n,
} as NodoObra)

// Obra gruesa › Fundaciones › { Platea, Vigas, Bases, Murete } · Estructura metálica (sin hijas)
const ARBOL: NodoObra[] = [
  nodo({ id: 'R', nivel: 0, padre_id: null, nombre: 'Obra gruesa', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'E', nivel: 1, padre_id: 'R', nombre: 'Fundaciones', es_contenedor: true, tipo: 'resumen', tiene_hijas: true }),
  nodo({ id: 'H1', nivel: 2, padre_id: 'E', nombre: 'Platea', es_contenedor: true, tipo: 'resumen', tiene_hijas: true, hh_plan: 430, inicio_plan: '2026-08-31', fin_plan: '2026-09-07', cotizacion_partida_id: 'p1' }),
  nodo({ id: 'H2', nivel: 2, padre_id: 'E', nombre: 'Vigas de fundación', es_contenedor: true, tipo: 'resumen', hh_plan: 210, dias_plan: 4, cotizacion_partida_id: 'p2' }),
  nodo({ id: 'H3', nivel: 2, padre_id: 'E', nombre: 'Bases de columnas', es_contenedor: true, tipo: 'resumen', dias_plan: 3 }),
  nodo({ id: 'H4', nivel: 2, padre_id: 'E', nombre: 'Murete perimetral', es_contenedor: true, tipo: 'resumen', hh_plan: 96, dias_plan: 2 }),
  nodo({ id: 'T1', nivel: 3, padre_id: 'H1', nombre: 'Excavación', unidad: 'm³', cantidad_objetivo: 62, inicio_plan: '2026-08-31', fin_plan: '2026-09-02' }),
  nodo({ id: 'T2', nivel: 3, padre_id: 'H1', nombre: 'Armadura', unidad: 'kg', cantidad_objetivo: 1840, partida_codigo: '01.05', tiene_hijas: true }),
  nodo({ id: 'S1', nivel: 4, padre_id: 'T2', nombre: 'Malla inferior' }),
  nodo({ id: 'R2', nivel: 0, padre_id: null, nombre: 'Estructura metálica', es_contenedor: true, tipo: 'resumen', metodo_avance: null as unknown as 'manual' }),
]
const PONDS: Ponderaciones = {
  E: { ponderacion: 40, costo_mo: null },
  H1: { ponderacion: 45, costo_mo: 3_000_000 }, H2: { ponderacion: 20, costo_mo: 1_000_000 },
  H3: { ponderacion: 0, costo_mo: null }, H4: { ponderacion: 0, costo_mo: null },
}

test('el nivel sale de la profundidad, y lo que cuelga de una tarea es subtarea', () => {
  const mapa = porId(ARBOL)
  assert.equal(nivelDe(mapa.get('R')!, mapa), 'rubro')
  assert.equal(nivelDe(mapa.get('E')!, mapa), 'epica')
  assert.equal(nivelDe(mapa.get('H1')!, mapa), 'historia')
  assert.equal(nivelDe(mapa.get('T1')!, mapa), 'tarea')
  assert.equal(nivelDe(mapa.get('S1')!, mapa), 'subtarea')
  assert.equal(nivelDeHijaNueva(null, mapa), 'rubro')
  assert.equal(nivelDeHijaNueva(mapa.get('H1')!, mapa), 'tarea')
  assert.equal(nivelDeHijaNueva(mapa.get('T1')!, mapa), 'subtarea')
})

test('C05 · las filas traen días teóricos, HH y el peso cargado; el reparto cierra en 100', () => {
  const filas = filasDePonderacion(ARBOL, PONDS, 'E')
  assert.deepEqual(filas.map((f) => f.nombre), ['Platea', 'Vigas de fundación', 'Bases de columnas', 'Murete perimetral'])
  assert.equal(filas[0].diasTeoricos, 6)
  assert.equal(filas[2].hhPlan, null)
  assert.equal(sumaPonderacion(repartir(filas, 'mano')!), 65)
  const parejo = repartir(filas, 'parejo')!
  assert.equal(sumaPonderacion(parejo), 100)
  const dias = repartir(filas, 'dias_teoricos')!
  assert.equal(sumaPonderacion(dias), 100)
  assert.equal(dias.H1, 40)
  const hh = repartir(filas, 'hh_plan')!
  assert.equal(sumaPonderacion(hh), 100)
  assert.equal(hh.H3, 0)
  assert.equal(motivoMetodoApagado(filas, 'costo_mo'), 'Costo teórico: 2 de 4 sin partida → apagado')
  assert.equal(motivoMetodoApagado(filas, 'hh_plan'), null)
  assert.equal(repartir(filas.map((f) => ({ ...f, costoMo: null })), 'costo_mo'), null)
})

test('C05 · el título dice cuánto pesan y cuánto falta; el aside dice cómo queda cada contenedor', () => {
  const mapa = porId(ARBOL)
  assert.equal(tituloPonderacion(mapa.get('E')!, 'historia', 65), 'Las historias de Fundaciones pesan 65 %. Faltan 35.')
  assert.equal(tituloPonderacion(mapa.get('E')!, 'historia', 100), 'Las historias de Fundaciones pesan 100 %.')
  assert.equal(pesoEnElAbuelo(ARBOL, PONDS, 'E'), '40 % de Obra gruesa')
  const como = comoQuedaLaObra(ARBOL, PONDS)
  assert.deepEqual(como.map((c) => [c.nombre, c.suma, c.tono]), [
    ['Obra gruesa', 40, 'warn'], ['Fundaciones', 65, 'warn'], ['Estructura metálica', null, 'sin'],
  ])
  const editado = comoQuedaLaObra(ARBOL, PONDS, { padreId: 'E', valores: { H1: 45, H2: 20, H3: 20, H4: 15 } })
  assert.equal(editado[1].tono, 'pos')
  assert.equal(quedanPorRepartir(ARBOL, PONDS, 'E'), 35)
  assert.equal(quedanPorRepartir(ARBOL, PONDS, null), 100)
})

test('C07 · la vista previa reparte la cantidad y la suma se conserva', () => {
  const v = vistaPreviaFrentes('Armadura', 1840, 'Eje 1–4, Eje 5–8')
  assert.deepEqual(v.filas, [{ nombre: 'Armadura · Eje 1–4', cantidad: 920 }, { nombre: 'Armadura · Eje 5–8', cantidad: 920 }])
  assert.deepEqual(vistaPreviaFrentes('X', null, 'a,b').filas.map((f) => f.cantidad), [null, null])
  assert.equal(textoDeFrentes(1840, 'kg', true), 'Los 1.840 kg se reparten en partes iguales y la suma se conserva. La actividad pasa a contenedor: su avance sale de sus frentes.')
  const t2 = porId(ARBOL).get('T2')!
  const razones = razonesParaDividir(t2, 0, 0, true)
  assert.deepEqual(razones.map((r) => [r.ok, r.texto]), [
    [false, 'Ya tiene hijas'], [true, 'Sin avance registrado'], [true, 'Se mide por cantidad, no por pasos'],
    [true, 'Viene de partida 01.05 · la partida sigue en el contenedor'],
  ])
  assert.ok(razonesParaDividir({ ...t2, tiene_hijas: false }, 0, 0, true).every((r) => r.ok))
  assert.equal(razonesParaDividir({ ...t2, tiene_hijas: false, metodo_avance: 'pasos' }, 0, 0, false)[2].texto, 'Se mide por pasos')
  assert.equal(razonesParaDividir({ ...t2, metodo_avance: 'manual' }, 0, 0, true)[2].texto, 'Se mide a mano, no por pasos')
})

test('C08 · el texto de pasos y los rótulos de plan', () => {
  assert.equal(textoDePasos(4, true), 'Pasos: cada subtarea hecha suma su parte. Con 4 subtareas, 25 % cada una.')
  assert.equal(textoDePasos(4, false), 'Cada subtarea hecha suma 25 %.')
  assert.equal(rotuloPlan('2026-09-01', '2026-09-02'), '01/09 → 02/09')
  assert.equal(rotuloPlan('2026-09-04', '2026-09-04'), '04/09')
  assert.equal(rotuloPlan(null, null), null)
})

test('C09 · correr fechas salta el fin de semana en las dos direcciones', () => {
  assert.equal(correrDiasHabiles('2026-09-04', 1), '2026-09-07')
  assert.equal(correrDiasHabiles('2026-09-07', -1), '2026-09-04')
  assert.equal(correrDiasHabiles('2026-09-01', 5), '2026-09-08')
})

test('las cifras de la cabecera: ítems, sin método, sin fechas y el problema de ponderación', () => {
  const r = resumenDeEstructura(ARBOL, PONDS)
  assert.equal(r.nItems, 3)
  assert.equal(r.nRubros, 2)
  assert.equal(r.niveles, 5)
  assert.equal(r.sinFechas, 2)
  assert.equal(r.costoMo, 4_000_000)
  assert.equal(rotuloProblema(r.problemaPonderacion), 'Obra gruesa 40 %')
  assert.equal(rotuloProblema({ nombre: 'Estructura metálica', suma: null }), 'Estructura metálica sin hijas')
  assert.equal(millones(19_290_000), '$ 19,29 M')
  assert.equal(millones(null), null)
  assert.equal(diasTeoricos({ dias_plan: null, inicio_plan: '2026-08-31', fin_plan: '2026-09-07' }), 6)
})

test('C04 · las filas del árbol: código por posición, seis columnas y la suma de las hijas en warn', async () => {
  const { filasDelArbol, filasVisiblesDelArbol } = await import('./estructura.ts')
  const filas = filasDelArbol(ARBOL, PONDS)
  assert.deepEqual(filas.map((f) => [f.codigo, f.nivel]), [
    ['1', 'rubro'], ['1.1', 'epica'], ['1.1.1', 'historia'], ['1.1.2', 'historia'], ['1.1.3', 'historia'], ['1.1.4', 'historia'],
    ['1.1.1.1', 'tarea'], ['1.1.1.2', 'tarea'], ['', 'subtarea'], ['2', 'rubro'],
  ])
  assert.deepEqual(filas[1].pond, { texto: '65 %', tono: 'warn' })
  assert.deepEqual(filas[2].pond, { texto: '0 %', tono: 'warn' })
  assert.deepEqual(filas[3].pond, { texto: '20 %', tono: 'normal' })
  assert.equal(filas[2].plan, '31/08 → 07/09')
  assert.equal(filas[6].uniCant, 'm³ · 62')
  assert.equal(filas[6].dias, 3)
  assert.equal(filas[6].metodo, 'cantidad')
  assert.equal(filas[1].plan, '31/08 → 07/09')
  assert.equal(filas[9].plan, null)
  const visibles = filasVisiblesDelArbol(filas, new Set(['H1']))
  assert.ok(!visibles.some((f) => f.id === 'T1' || f.id === 'S1'))
  assert.ok(visibles.some((f) => f.id === 'H2'))
})
