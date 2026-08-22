import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorFrente, detalleDeTarea, filtrar, filtroDe, SIN_FRENTE } from './tareas.ts'
import type { ActividadDelJefe } from './jefeService.ts'

const a = (p: Partial<ActividadDelJefe> & { actividad_id: string }): ActividadDelJefe => ({
  obra_id: 'o', nombre: p.actividad_id, tipo: 'tarea', rubro: null, metodo_avance: 'partes',
  avance_pct: 0, origen_avance: 'partes', estado_operativo: 'en_curso', impedimentos_abiertos: 0,
  n_pasos: 0, n_pasos_hechos: 0, cuadrilla_prevista: 'Cuadrilla 2', hh_plan: null, hh_real: null, inicio_plan: null,
  fin_plan: null, fin_real: null, ultimo_parte: null, unidad: null, cantidad_objetivo: null,
  cantidad_ejecutada: null, ...p,
})

test('BUSCAR SIN TILDES ENCUENTRA CON TILDES', () => {
  // El defecto que atrapa: en el teclado del teléfono, en obra, nadie pone la tilde. «mamposteria»
  // no encontraba «Mampostería» y la pantalla decía que la tarea no existía.
  const l = [a({ actividad_id: '1', nombre: 'Mampostería ladrillón' })]
  assert.equal(filtrar(l, 'mamposteria', 'todas', '2026-08-21').length, 1)
  assert.equal(filtrar(l, '  MAMPOSTERÍA ', 'todas', '2026-08-21').length, 1)
})

test('SE BUSCA TAMBIÉN POR FRENTE Y POR CUADRILLA', () => {
  const l = [a({ actividad_id: '1', nombre: 'Relleno', rubro: 'GALPÓN 2', cuadrilla_prevista: 'Cuadrilla 3' })]
  assert.equal(filtrar(l, 'galpon 2', 'todas', '2026-08-21').length, 1)
  assert.equal(filtrar(l, 'cuadrilla 3', 'todas', '2026-08-21').length, 1)
})

test('EL CONTENEDOR NO ES UNA TAREA y no aparece en la lista', () => {
  const l = [a({ actividad_id: 'g', tipo: 'resumen' }), a({ actividad_id: 't' })]
  assert.deepEqual(filtrar(l, '', 'todas', '2026-08-21').map((x) => x.actividad_id), ['t'])
})

test('«CON PROBLEMA» SON TRES HECHOS REGISTRADOS, no una corazonada', () => {
  const l = [
    a({ actividad_id: 'frenada', impedimentos_abiertos: 1 }),
    a({ actividad_id: 'sin-metodo', metodo_avance: null }),
    a({ actividad_id: 'sin-cuadrilla', cuadrilla_prevista: null }),
    a({ actividad_id: 'sana' }),
  ]
  const ids = filtrar(l, '', 'problema', '2026-08-21').map((x) => x.actividad_id)
  assert.deepEqual(ids.sort(), ['frenada', 'sin-cuadrilla', 'sin-metodo'])
})

test('UNA TAREA TERMINADA SIN CUADRILLA NO ES UN PROBLEMA: ya se hizo', () => {
  const l = [a({ actividad_id: 'x', cuadrilla_prevista: null, estado_operativo: 'hecha' })]
  assert.deepEqual(filtrar(l, '', 'problema', '2026-08-21'), [])
})

test('«ATRASADAS» NO INCLUYE LO TERMINADO fuera de fecha', () => {
  const l = [
    a({ actividad_id: 'viva', fin_plan: '2026-08-01' }),
    a({ actividad_id: 'cerrada', fin_plan: '2026-08-01', estado_operativo: 'hecha' }),
  ]
  assert.deepEqual(filtrar(l, '', 'atrasadas', '2026-08-21').map((x) => x.actividad_id), ['viva'])
})

test('UN FILTRO INVENTADO NO VACÍA LA PANTALLA: cae a «todas»', () => {
  // El defecto que atrapa: `?filtro=basura` en la URL dejaba la lista en cero y se leía como
  // «esta obra no tiene tareas».
  assert.equal(filtroDe('basura'), 'todas')
  assert.equal(filtroDe(null), 'todas')
  assert.equal(filtroDe('atrasadas'), 'atrasadas')
})

test('LOS GRUPOS CONSERVAN EL ORDEN CONSTRUCTIVO, no el alfabético', () => {
  const l = [
    a({ actividad_id: '1', rubro: 'GALPÓN 2' }),
    a({ actividad_id: '2', rubro: 'GALPÓN 10' }),
    a({ actividad_id: '3', rubro: 'GALPÓN 2' }),
  ]
  const g = agruparPorFrente(l)
  assert.deepEqual(g.map((x) => x.nombre), ['GALPÓN 2', 'GALPÓN 10'])
  assert.equal(g[0].tareas.length, 2)
})

test('LA TAREA SIN FRENTE SE AGRUPA CON SU NOMBRE, no se pierde', () => {
  assert.equal(agruparPorFrente([a({ actividad_id: '1', rubro: null })])[0].nombre, SIN_FRENTE)
})

test('EL IMPEDIMENTO LE GANA AL ATRASO en el renglón: es lo que hay que destrabar', () => {
  const d = detalleDeTarea(a({ actividad_id: 'x', impedimentos_abiertos: 2, fin_plan: '2026-01-01' }), '2026-08-21')
  assert.equal(d.texto, '2 impedimentos abiertos')
  assert.equal(d.tono, 'neg')
})

test('SIN CUADRILLA SE DICE «SIN CUADRILLA ASIGNADA», no un vacío', () => {
  const d = detalleDeTarea(a({ actividad_id: 'x', cuadrilla_prevista: null }), '2026-08-21')
  assert.equal(d.texto, 'sin cuadrilla asignada')
  assert.equal(d.tono, 'warn')
})

test('UNA TAREA TERMINADA NO SE PINTA DE PROBLEMA POR NO TENER CUADRILLA', () => {
  // El defecto que atrapa: 60 de 89 tareas de esta obra están hechas y salían todas en ámbar con
  // «sin cuadrilla asignada». Un color que aparece en dos tercios de la lista deja de señalar.
  const d = detalleDeTarea(
    a({ actividad_id: 'x', cuadrilla_prevista: null, estado_operativo: 'hecha', fin_real: '2026-08-14' }),
    '2026-08-21')
  assert.equal(d.texto, 'terminada el 14/08')
  assert.equal(d.tono, 'muted')
})
