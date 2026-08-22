// EL RUBRO — que el duplicado accidental no se convierta en tres grupos, y que el legítimo sobreviva.
//
// El caso que gobierna este archivo es real: en la base hay SEIS «Hormigonado» en San Francisco,
// porque el tracker repite el mismo paso en distintas partes de la obra. Una regla que los fusione
// destruye la estructura del plan; una que no detecte «MAMPOSTERIA» contra «Mampostería» deja tres
// rubros donde hay uno. Las dos cosas a la vez es lo que se prueba acá.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { cruzarBloques, normalizarRubro, rubroQueChoca, rubrosDe } from './rubros.ts'
import type { Actividad } from '../types/index.ts'

const act = (p: Partial<Actividad>): Actividad => ({
  id: p.id ?? 'a', obra_id: 'o', clave: 'k', seccion: null, codigo: null, codigo_padre: null,
  nombre: 'x', tipo: 'tarea', orden: 1, inicio_plan: null, fin_plan: null, dias_plan: null,
  inicio_real: null, fin_real: null, dias_real: null, inicio_base: null, fin_base: null, pct: null,
  estado: 'pendiente', cuadrilla: null, comentario: null, editado_a_mano: false,
  fuente_pestana: null, sellada_en: null, responsable_id: null, hh_plan: null, archivada: false,
  creada_en_web: false, rubro: null, unidad: null, cantidad_objetivo: null, metodo_avance: 'manual',
  cuadrilla_id: null, cuadrilla_prevista: null, partida_codigo: null, partida_cantidad: null,
  cantidad_ejecutada: null, n_partes: 0, ultimo_parte: null, hh_real: null, hh_extra: null,
  n_imputaciones: 0, impedimentos_abiertos: 0, avance_pct: null, origen_avance: null,
  estado_operativo: 'pendiente', productividad: null, consumo_hh_pct: null,
  actividad_padre_id: null, n_tareas: 0, n_tareas_hechas: 0, n_pedidos: 0,
  inicio_real_declarado: null, fin_real_declarado: null, origen_inicio_real: null,
  origen_fin_real: null, forecast_fin: null, base_del_forecast: null, dias_restantes: null,
  tiene_fecha: false, tiene_fecha_plan: false, estado_fecha: 'sin_fecha',
  desvio_plan_dias: null, desvio_forecast_dias: null,
  ...p,
})

test('el mismo rubro escrito de tres maneras es UNO', () => {
  const k = normalizarRubro('Mampostería')
  assert.equal(normalizarRubro('MAMPOSTERIA'), k)
  assert.equal(normalizarRubro('  Mampostería  '), k)
  assert.equal(normalizarRubro('Mamposteria'), k)
  assert.equal(normalizarRubro('Mampostería   interior'), normalizarRubro('mamposteria interior'))
})

test('dos rubros distintos no se pisan', () => {
  assert.notEqual(normalizarRubro('Mampostería'), normalizarRubro('Mampostería exterior'))
})

test('el choque devuelve el nombre REAL que ya está cargado, para poder nombrarlo', () => {
  assert.equal(rubroQueChoca('MAMPOSTERIA', ['Estructura', 'Mampostería']), 'Mampostería')
  assert.equal(rubroQueChoca('Instalaciones', ['Estructura', 'Mampostería']), null)
})

test('los rubros salen en el orden del cronograma, con la cabecera y el conteo', () => {
  const rs = rubrosDe([
    act({ id: 'r1', nombre: 'Estructura', tipo: 'resumen', orden: 1 }),
    act({ id: 'a1', nombre: 'Excavaciones', seccion: 'Estructura', orden: 2 }),
    act({ id: 'a2', nombre: 'Fundaciones', seccion: 'Estructura', orden: 3 }),
    act({ id: 'r2', nombre: 'Mampostería', tipo: 'resumen', orden: 4 }),
    act({ id: 'a3', nombre: 'Interior', seccion: 'Mampostería', orden: 5 }),
  ])
  assert.deepEqual(rs.map((r) => [r.nombre, r.n, r.cabeceraId]), [
    ['Estructura', 2, 'r1'],
    ['Mampostería', 1, 'r2'],
  ])
})

test('un rubro que sólo vive como `seccion` de sus hijas sigue siendo un rubro', () => {
  // Pasa en los datos reales: no toda obra trae la fila de resumen del tracker.
  const rs = rubrosDe([act({ id: 'a1', nombre: 'Revoques', seccion: 'Terminaciones', orden: 1 })])
  assert.deepEqual(rs.map((r) => [r.nombre, r.n, r.cabeceraId]), [['Terminaciones', 1, null]])
})

test('las TAREAS no cuentan como trabajo de un rubro', () => {
  // Pesarían doble: una vez en su actividad y otra por su cuenta.
  const rs = rubrosDe([
    act({ id: 'a1', nombre: 'Columnas', seccion: 'Estructura', orden: 1 }),
    act({ id: 't1', nombre: 'Armado', seccion: 'Estructura', orden: 1, actividad_padre_id: 'a1' }),
  ])
  assert.equal(rs[0].n, 1)
})

test('cruzar dos rubros NO renumera la obra: reparte los números que ya ocupaban', () => {
  // El `orden` del tracker tiene huecos —10, 11, 20, 21, 22— y renumerar de 1 a N tocaría todas las
  // filas de la obra. Acá se cruzan los dos bloques y ninguna otra fila cambia de número.
  const arriba = [{ id: 'a1', orden: 10 }, { id: 'a2', orden: 11 }]
  const abajo = [{ id: 'b1', orden: 20 }, { id: 'b2', orden: 21 }, { id: 'b3', orden: 22 }]
  const c = cruzarBloques(arriba, abajo)
  assert.deepEqual(c, [
    { id: 'b1', orden: 10 }, { id: 'b2', orden: 11 }, { id: 'b3', orden: 20 },
    { id: 'a1', orden: 21 }, { id: 'a2', orden: 22 },
  ])
})

test('sólo vuelven las filas que cambiaron de número', () => {
  // Dos bloques de un elemento cada uno con el mismo `orden` no se mueven: mandar la escritura
  // igual pisaría con el mismo valor algo que otro pudo haber corregido en el medio.
  assert.deepEqual(cruzarBloques([{ id: 'a', orden: 5 }], [{ id: 'b', orden: 5 }]), [])
})

test('el orden resultante nunca inventa un número que no estaba', () => {
  const arriba = [{ id: 'a', orden: 3 }]
  const abajo = [{ id: 'b', orden: 99 }]
  const c = cruzarBloques(arriba, abajo)
  assert.deepEqual(c.map((x) => x.orden).sort((x, y) => x - y), [3, 99])
})
