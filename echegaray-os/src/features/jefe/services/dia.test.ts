import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frentesAbiertos, frentesDelDia, problemasDelDia } from './dia.ts'
import type { ActividadDelJefe, HHDelDia, Impedimento } from './jefeService.ts'
import type { NodoArbol } from './frentes.ts'

const a = (p: Partial<ActividadDelJefe> & { actividad_id: string }): ActividadDelJefe => ({
  obra_id: 'o', nombre: p.actividad_id, tipo: 'tarea', rubro: null, metodo_avance: 'partes',
  avance_pct: 0, origen_avance: 'partes', estado_operativo: 'en_curso', impedimentos_abiertos: 0,
  n_pasos: 0, n_pasos_hechos: 0, cuadrilla_prevista: null, hh_plan: null, hh_real: null, inicio_plan: null,
  fin_plan: null, fin_real: null, ultimo_parte: null, unidad: null, cantidad_objetivo: null,
  inicio_real: null, forecast_fin: null, estado_fecha: null,
  cantidad_ejecutada: null, ...p,
})
const imp = (p: Partial<Impedimento> & { id: string }): Impedimento => ({
  descripcion: 'Falta hierro', tipo: 'material', actividad_id: null, creado_en: null,
  responsable: null, fecha_necesidad: null, fecha_compromiso: null, ...p,
})
const nodo = (p: Partial<NodoArbol> & { actividad_id: string }): NodoArbol => ({
  actividad_padre_id: null, nombre: p.actividad_id, camino: p.actividad_id, nivel: 0,
  archivada: false, es_contenedor: false, ...p,
})

test('LA GENTE SIN MARCA NUNCA SE LLAMA AUSENTE', () => {
  // El defecto que atrapa: llamar «ausencia» a la falta de marca fabrica una novedad de
  // liquidación. Un operario sin teléfono y uno que faltó se ven igual desde acá.
  const p = problemasDelDia({ actividades: [], impedimentos: [], sinRegistrar: 2, hoy: '2026-08-21' })
  assert.equal(p.length, 1)
  assert.equal(p[0].titulo, '2 personas sin registrar')
  assert.doesNotMatch(p[0].titulo + p[0].detalle, /ausen|falt(ó|o)\b/i)
})

test('SIN NADIE SIN MARCA NO SE DIBUJA EL RENGLÓN', () => {
  const p = problemasDelDia({ actividades: [], impedimentos: [], sinRegistrar: 0, hoy: '2026-08-21' })
  assert.deepEqual(p, [])
})

test('EL IMPEDIMENTO NOMBRA LA TAREA QUE FRENA', () => {
  const p = problemasDelDia({
    actividades: [a({ actividad_id: 'x', nombre: 'Columna de encadenado' })],
    impedimentos: [imp({ id: 'i1', actividad_id: 'x' })],
    sinRegistrar: 0, hoy: '2026-08-21',
  })
  assert.equal(p[0].detalle, 'Frena Columna de encadenado')
  assert.equal(p[0].tono, 'neg')
})

test('UNA TAREA TERMINADA NO ES UN ATRASO aunque su plan haya vencido', () => {
  // El defecto que atrapa: listar como problema lo que ya se hizo. La pantalla del día se llena de
  // trabajo cerrado y deja de servir para decidir.
  const p = problemasDelDia({
    actividades: [a({ actividad_id: 'x', fin_plan: '2026-01-01', estado_operativo: 'hecha' })],
    impedimentos: [], sinRegistrar: 0, hoy: '2026-08-21',
  })
  assert.deepEqual(p, [])
})

test('EL CONTENEDOR NO ENTRA COMO TAREA ATRASADA: se completa con sus hijas', () => {
  const p = problemasDelDia({
    actividades: [a({ actividad_id: 'g', tipo: 'resumen', fin_plan: '2026-01-01' })],
    impedimentos: [], sinRegistrar: 0, hoy: '2026-08-21',
  })
  assert.deepEqual(p, [])
})

test('LAS ATRASADAS SE ORDENAN POR ATRASO Y SE CORTAN EN CINCO', () => {
  const actividades = Array.from({ length: 8 }, (_, i) =>
    a({ actividad_id: `t${i}`, fin_plan: `2026-08-${String(20 - i).padStart(2, '0')}` }))
  const p = problemasDelDia({ actividades, impedimentos: [], sinRegistrar: 0, hoy: '2026-08-21' })
  assert.equal(p.length, 5)
  assert.equal(p[0].titulo, 't7')
})

test('EL AVANCE SIN MEDIR SE ESCRIBE ASÍ, no como 0 %', () => {
  const p = problemasDelDia({
    actividades: [a({ actividad_id: 't', fin_plan: '2026-08-11', avance_pct: null })],
    impedimentos: [], sinRegistrar: 0, hoy: '2026-08-21',
  })
  assert.match(p[0].detalle, /avance sin medir/)
})

test('LA GENTE DEL FRENTE SALE DE LAS HH IMPUTADAS a sus tareas, sin contar dos veces', () => {
  // El defecto que atrapa: sumar filas de `registros_hh` cuenta a la misma persona una vez por
  // imputación —normales y extras van en filas separadas— y el frente publica ocho personas
  // cuando hay cuatro.
  const arbol = [
    nodo({ actividad_id: 'g2', es_contenedor: true }),
    nodo({ actividad_id: 't1', actividad_padre_id: 'g2', nivel: 1 }),
    nodo({ actividad_id: 't2', actividad_padre_id: 'g2', nivel: 1 }),
  ]
  const hh: HHDelDia[] = [
    { persona_id: 'p1', actividad_id: 't1', horas: 8, tipo_hora: 'normal' },
    { persona_id: 'p1', actividad_id: 't1', horas: 2, tipo_hora: 'extra_50' },
    { persona_id: 'p1', actividad_id: 't2', horas: 1, tipo_hora: 'normal' },
    { persona_id: 'p2', actividad_id: 't2', horas: 4, tipo_hora: 'normal' },
  ]
  const f = frentesDelDia(arbol, [a({ actividad_id: 't1' }), a({ actividad_id: 't2' })], hh, '2026-08-21')[0]
  assert.equal(f.personasHoy, 2)
  assert.equal(f.hhHoy, 15)
})

test('EL FRENTE TERMINADO SALE DE LA PANTALLA DEL DÍA, no del sistema', () => {
  const arbol = [
    nodo({ actividad_id: 'g2', es_contenedor: true }),
    nodo({ actividad_id: 't1', actividad_padre_id: 'g2', nivel: 1 }),
  ]
  const f = frentesDelDia(arbol, [a({ actividad_id: 't1', estado_operativo: 'hecha' })], [], '2026-08-21')
  assert.equal(f[0].abiertas, 0)
  assert.deepEqual(frentesAbiertos(f), [])
})

test('LO MÁS ATRASADO VA ARRIBA: es lo que fija la fecha de fin', () => {
  const arbol = [
    nodo({ actividad_id: 'a', es_contenedor: true }), nodo({ actividad_id: 'ta', actividad_padre_id: 'a', nivel: 1 }),
    nodo({ actividad_id: 'b', es_contenedor: true }), nodo({ actividad_id: 'tb', actividad_padre_id: 'b', nivel: 1 }),
  ]
  const acts = [a({ actividad_id: 'ta', fin_plan: '2026-08-20' }), a({ actividad_id: 'tb', fin_plan: '2026-08-01' })]
  const orden = frentesAbiertos(frentesDelDia(arbol, acts, [], '2026-08-21')).map((f) => f.frente.id)
  assert.deepEqual(orden, ['b', 'a'])
})

test('UN FRENTE VACÍO NO SE DIBUJA: no hay nada que mirar', () => {
  const arbol = [nodo({ actividad_id: 'g', es_contenedor: true })]
  assert.deepEqual(frentesAbiertos(frentesDelDia(arbol, [], [], '2026-08-21')), [])
})
