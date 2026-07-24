// EL DISEÑADOR DE ESTRATEGIAS PIENSA COMO CFO (24/07).
//
// Verifica el contrato que pidió el dueño: el Financial Engineering NO planifica pagos primero — primero
// DISEÑA la mejor estrategia. Por cada horizonte genera ≥2 estrategias COMPLETAS (objetivo · razonamiento
// · alternativas descartadas · beneficios · riesgos · impacto sobre las 7 dimensiones), las COMPARA con un
// objetivo CFO explícito, ELIGE una justificando, y el plan operativo es la CONSECUENCIA de la elegida.
// Todo con datos SINTÉTICOS — no toca el Sheet ni ninguna fuente real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disenarEstrategias, POLITICAS } from './estrategias-tesoreria.mjs'

const HOY = new Date(2026, 6, 24) // 24/07/2026
const dia = (fecha, movimientos) => ({ fecha, saldo_inicial: 0, movimientos })

// Escenario base con TENSIÓN real de financiamiento: un crítico vencido que la caja no cubre + un no
// crítico grande. Es el que separa las tres posturas (costo mínimo posterga el no crítico; cumplimiento
// lo financia; caja protegida eleva el piso por el crítico). Sin tensión, las posturas coinciden.
const DIAS_TENSION = [dia('2026-07-24', [
  { tipo: 'egreso', monto: 2000000, proveedor: 'Gruas San Blas', vencida: true },
  { tipo: 'egreso', monto: 5000000, proveedor: 'Ferretería X' },
])]

const CAMPOS_ESTRATEGIA = ['clave', 'nombre', 'objetivo', 'razonamiento', 'palancas', 'metricas', 'beneficios', 'riesgos', 'impacto', 'plan', 'alternativas_descartadas']
const DIMENSIONES_IMPACTO = ['caja', 'liquidez', 'costo_financiero', 'obras', 'proveedores', 'clientes', 'obligaciones']

test('genera AL MENOS 2 (de hecho 3) estrategias completas, cada una con todos los campos del contrato', () => {
  const { estrategias } = disenarEstrategias({ dias: DIAS_TENSION, cajaInicial: 1000000, hoy: HOY })
  assert.ok(estrategias.generadas.length >= 2, 'debe generar al menos 2 estrategias')
  assert.equal(estrategias.generadas.length, POLITICAS.length)
  for (const e of estrategias.generadas) {
    for (const campo of CAMPOS_ESTRATEGIA) assert.ok(campo in e, `${e.clave} debe declarar "${campo}"`)
    assert.ok(String(e.objetivo).length > 0 && String(e.razonamiento).length > 0)
    assert.ok(Array.isArray(e.beneficios) && e.beneficios.length > 0, `${e.clave} debe listar beneficios`)
    assert.ok(Array.isArray(e.riesgos) && e.riesgos.length > 0, `${e.clave} debe listar riesgos`)
    for (const dim of DIMENSIONES_IMPACTO) assert.ok(dim in e.impacto, `${e.clave} debe declarar impacto sobre "${dim}"`)
  }
})

test('cada estrategia expone las alternativas DESCARTADAS (las otras posturas) con su diferencia', () => {
  const { estrategias } = disenarEstrategias({ dias: DIAS_TENSION, cajaInicial: 1000000, hoy: HOY })
  for (const e of estrategias.generadas) {
    assert.equal(e.alternativas_descartadas.length, POLITICAS.length - 1, `${e.clave} descarta las otras posturas`)
    for (const alt of e.alternativas_descartadas) {
      assert.ok(alt.clave && alt.nombre && alt.objetivo && alt.diferencia_vs_esta)
      assert.ok(alt.clave !== e.clave, 'una estrategia no se descarta a sí misma')
      assert.equal(typeof alt.es_la_elegida, 'boolean')
    }
  }
})

test('COMPARA las estrategias y ELIGE una con objetivo CFO explícito, ranking y justificación', () => {
  const { estrategias } = disenarEstrategias({ dias: DIAS_TENSION, cajaInicial: 1000000, hoy: HOY })
  const c = estrategias.comparacion
  assert.match(c.objetivo_cfo, /factibilidad.*costo financiero.*postergados/i, 'el objetivo CFO es lexicográfico y explícito')
  assert.equal(c.ranking.length, POLITICAS.length)
  assert.deepEqual(c.ranking.map((r) => r.puesto), [1, 2, 3])
  assert.equal(c.ranking[0].clave, estrategias.elegida, 'la elegida encabeza el ranking')
  assert.ok(String(c.justificacion).length > 0)
})

test('en el escenario con tensión, elige COSTO MÍNIMO y lo justifica por menor costo financiero', () => {
  const { estrategias } = disenarEstrategias({ dias: DIAS_TENSION, cajaInicial: 1000000, hoy: HOY })
  assert.equal(estrategias.elegida, 'costo_minimo')
  assert.equal(estrategias.comparacion.criterio_decisivo, 'costo_financiero')
  const g = (k) => estrategias.generadas.find((e) => e.clave === k)
  // La tensión es REAL: cumplimiento no posterga nada pero cuesta más; defensiva guarda más caja pero
  // también cuesta más. La elegida es la que menos interés quema.
  assert.equal(g('cumplimiento').metricas.postergados, 0, 'cumplimiento honra todo (no posterga)')
  assert.equal(g('costo_minimo').metricas.postergados, 1, 'costo mínimo posterga el no crítico')
  assert.ok(g('cumplimiento').metricas.costo_financiero > g('costo_minimo').metricas.costo_financiero, 'cumplimiento cuesta más')
  assert.ok(g('caja_protegida').metricas.saldo_final > g('costo_minimo').metricas.saldo_final, 'la defensiva preserva más caja')
})

test('el PLAN OPERATIVO es la CONSECUENCIA de la estrategia elegida (mismo objeto), con contrato retrocompatible', () => {
  const d = disenarEstrategias({ dias: DIAS_TENSION, cajaInicial: 1000000, hoy: HOY })
  const elegida = d.estrategias.generadas.find((e) => e.clave === d.estrategias.elegida)
  assert.equal(d.plan_elegido, elegida.plan, 'el plan expuesto es exactamente el de la estrategia elegida')
  for (const clave of ['acciones', 'resumen', 'resumen_estrategico']) {
    assert.ok(clave in d.plan_elegido, `la web sigue leyendo "${clave}"`)
  }
  assert.ok(Array.isArray(d.plan_elegido.acciones) && d.plan_elegido.acciones.length > 0)
})

test('factibilidad primero: una postura que EXCEDE la línea queda última y nunca se elige', () => {
  // Un crítico enorme: la defensiva eleva el piso hasta que el faltante supera el límite del acuerdo.
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 20000000, proveedor: 'Gruas', vencida: true }])]
  const { estrategias } = disenarEstrategias({ dias, cajaInicial: 5000000, hoy: HOY })
  const ranking = estrategias.comparacion.ranking
  const ultima = ranking[ranking.length - 1]
  assert.equal(ultima.clave, 'caja_protegida')
  assert.equal(ultima.excede_limite, true, 'la que excede el límite queda última')
  assert.notEqual(estrategias.elegida, 'caja_protegida', 'nunca se elige una estrategia inviable')
})

test('NO inventa datos: el colchón defensivo se DERIVA de los críticos reales del horizonte', () => {
  const conCritico = disenarEstrategias({ dias: DIAS_TENSION, cajaInicial: 1000000, hoy: HOY })
  const def = conCritico.estrategias.generadas.find((e) => e.clave === 'caja_protegida')
  assert.equal(def.palancas.colchon_defensivo, 2000000, 'el colchón = suma de egresos críticos del horizonte')

  const sinCritico = disenarEstrategias({ dias: [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'X' }])], cajaInicial: 1000000, hoy: HOY })
  const def2 = sinCritico.estrategias.generadas.find((e) => e.clave === 'caja_protegida')
  assert.equal(def2.palancas.colchon_defensivo, 0, 'sin críticos, no hay colchón que inventar')
})

test('sin tensión de financiamiento, las posturas coinciden y se elige la conservadora sin fabricar diferencias', () => {
  // Caja de sobra: las tres pagan con caja propia, mismo plan. La comparación lo dice honestamente.
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'X' }])]
  const { estrategias } = disenarEstrategias({ dias, cajaInicial: 5000000, hoy: HOY })
  assert.equal(estrategias.comparacion.criterio_decisivo, 'empate')
  assert.match(estrategias.comparacion.justificacion, /empata/i)
  assert.equal(estrategias.elegida, 'costo_minimo')
})

test('cada estrategia lleva su propio plan operativo derivado (no comparten acciones)', () => {
  const { estrategias } = disenarEstrategias({ dias: DIAS_TENSION, cajaInicial: 1000000, hoy: HOY })
  const g = (k) => estrategias.generadas.find((e) => e.clave === k)
  // cumplimiento financia el no crítico → tiene una acción 'financiar' de más que costo mínimo
  const finCumpl = g('cumplimiento').plan.acciones.filter((a) => a.tipo === 'financiar').length
  const finCosto = g('costo_minimo').plan.acciones.filter((a) => a.tipo === 'financiar').length
  assert.ok(finCumpl > finCosto, 'cumplimiento financia más que costo mínimo — planes genuinamente distintos')
  assert.ok(g('costo_minimo').plan.acciones.some((a) => a.tipo === 'postergar'), 'costo mínimo posterga')
})
