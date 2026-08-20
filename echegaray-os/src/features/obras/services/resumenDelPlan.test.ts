import assert from 'node:assert/strict'
import { test } from 'node:test'
import { proximasDeLaObra, resumenDelPlan } from './resumenDelPlan.ts'
import type { Actividad, Restriccion } from '../types/index.ts'

const act = (x: Partial<Actividad>): Actividad => ({
  id: x.id ?? 'a', obra_id: 'o', clave: 'k', seccion: null, codigo: null, codigo_padre: null,
  nombre: 'x', tipo: 'tarea', orden: 1, inicio_plan: null, fin_plan: null, dias_plan: null,
  inicio_real: null, fin_real: null, dias_real: null, inicio_base: null, fin_base: null,
  pct: null, estado: 'pendiente', cuadrilla: null, comentario: null, editado_a_mano: false,
  fuente_pestana: null, sellada_en: null, responsable_id: null, hh_plan: null, archivada: false,
  creada_en_web: true, rubro: null, unidad: null, cantidad_objetivo: null, metodo_avance: 'manual',
  cuadrilla_id: null, cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null,
  cantidad_ejecutada: null, n_partes: 0, ultimo_parte: null, hh_real: null, hh_extra: null,
  n_imputaciones: 0, impedimentos_abiertos: 0, avance_pct: null, origen_avance: null,
  estado_operativo: 'pendiente', productividad: null, consumo_hh_pct: null,
  actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0, n_pedidos: 0, ...x,
})

const imp = (x: Partial<Restriccion>): Restriccion => ({
  id: 'i', obra_id: 'o', actividad_id: null, tipo: 'material', descripcion: 'x',
  responsable: null, fecha_necesidad: null, fecha_compromiso: null, fecha_liberacion: null,
  estado: 'abierta', ...x,
} as Restriccion)

test('el avance promedia sólo las actividades con fecha y con avance', () => {
  const r = resumenDelPlan([
    act({ id: '1', inicio_plan: '2026-08-01', avance_pct: 100 }),
    act({ id: '2', inicio_plan: '2026-08-01', avance_pct: 50 }),
    act({ id: '3', avance_pct: 0 }),            // sin fecha: no entra
    act({ id: '4', inicio_plan: '2026-08-01' }), // sin avance: no entra
  ], [], '2026-08-19')
  assert.equal(r.avance, 75)
})

test('sin ninguna actividad medida el avance es null, no cero', () => {
  assert.equal(resumenDelPlan([act({})], [], '2026-08-19').avance, null)
  assert.equal(resumenDelPlan([], [], '2026-08-19').avance, null)
})

test('EL DESVÍO DE HH NO EXISTE SIN LAS DOS PUNTAS', () => {
  const soloReal = resumenDelPlan([act({ hh_real: 40 })], [], '2026-08-19')
  assert.equal(soloReal.hhReal, 40)
  assert.equal(soloReal.hhPlan, null)
  // Cero diría «vamos justo» sobre una obra que nadie presupuestó en horas.
  assert.equal(soloReal.desvioHH, null)

  const ambas = resumenDelPlan([act({ hh_real: 138, hh_plan: 210 })], [], '2026-08-19')
  assert.equal(ambas.desvioHH, -72)
})

test('un impedimento liberado ya no cuenta, y el vencido se cuenta aparte', () => {
  const r = resumenDelPlan([], [
    imp({ id: '1' }),
    imp({ id: '2', fecha_compromiso: '2026-08-10' }),          // venció
    imp({ id: '3', fecha_compromiso: '2026-08-30' }),          // a tiempo
    imp({ id: '4', fecha_liberacion: '2026-08-15' }),          // resuelto
  ], '2026-08-19')
  assert.equal(r.impedimentosAbiertos, 3)
  assert.equal(r.impedimentosVencidos, 1)
})

test('«próximas» cuenta lo que arranca o lo que termina en la ventana, y no lo hecho', () => {
  const r = resumenDelPlan([
    act({ id: '1', inicio_plan: '2026-08-25' }),                       // arranca
    act({ id: '2', fin_plan: '2026-08-22' }),                          // hay que cerrarla
    act({ id: '3', inicio_plan: '2026-10-01' }),                       // lejos
    act({ id: '4', inicio_plan: '2026-08-20', estado_operativo: 'hecha' }), // ya está
  ], [], '2026-08-19')
  assert.equal(r.proximas, 2)
})

test('las de resumen y las archivadas no son trabajo', () => {
  const r = resumenDelPlan([
    act({ id: '1' }),
    act({ id: '2', tipo: 'resumen' }),
    act({ id: '3', archivada: true }),
  ], [], '2026-08-19')
  assert.equal(r.actividades, 1)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA VENTANA DEL RESUMEN DE OBRA (Design Handoff V2, 20/08/2026)
//
// «Próximas 2 semanas» vivía dentro de `TabResumen.tsx` y por eso nunca tuvo prueba: el runner no
// lee `.tsx`. El defecto que atrapan estos tests es de PUBLICACIÓN: una ventana que contara sólo
// los inicios escondería lo que hay que CERRAR esta quincena, y una que no filtrara lo hecho
// pondría trabajo terminado en la lista de lo que viene.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('próximas 2 semanas: entra lo que arranca Y lo que termina, y lo hecho no entra', () => {
  const r = proximasDeLaObra([
    act({ id: 'arranca', nombre: 'Mampostería exterior', inicio_plan: '2026-08-21', fin_plan: '2026-09-10' }),
    act({ id: 'cierra', nombre: 'Columnas', inicio_plan: '2026-07-01', fin_plan: '2026-08-26' }),
    act({ id: 'lejos', nombre: 'Pintura', inicio_plan: '2026-10-01', fin_plan: '2026-10-20' }),
    act({ id: 'pasada', nombre: 'Excavaciones', inicio_plan: '2026-07-01', fin_plan: '2026-07-20' }),
    act({ id: 'hecha', nombre: 'Fundaciones', inicio_plan: '2026-08-22', estado_operativo: 'hecha' }),
    act({ id: 'archivada', nombre: 'Vieja', inicio_plan: '2026-08-22', archivada: true }),
    act({ id: 'rubro', nombre: 'RUBRO', tipo: 'resumen', inicio_plan: '2026-08-22' }),
  ], '2026-08-19')
  // Ordenadas por la fecha que las metió en la ventana: primero lo que arranca el 21.
  assert.deepEqual(r.map((x) => x.id), ['arranca', 'cierra'])
  assert.equal(r[0].ancla, '2026-08-21')
  // La que ya venía en curso se ancla en su CIERRE: es lo que hay que cerrar esta quincena.
  assert.equal(r[1].ancla, '2026-08-26')
})

test('el hito se marca por su tipo, no por no tener duración', () => {
  const r = proximasDeLaObra([
    act({ id: 'h', nombre: 'Fin estructura', tipo: 'hito', inicio_plan: '2026-08-26', fin_plan: '2026-08-26' }),
    act({ id: 't', nombre: 'Tarea de un día', inicio_plan: '2026-08-25', fin_plan: '2026-08-25' }),
  ], '2026-08-19')
  assert.equal(r.find((x) => x.id === 'h')!.hito, true)
  assert.equal(r.find((x) => x.id === 't')!.hito, false)
})
