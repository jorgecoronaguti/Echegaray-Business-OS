// CONTRATO ESTRATÉGICO DEL PLAN DE TESORERÍA (24/07).
//
// Verifica que el plan dejó de ser una lista de tareas operativas y pasó a ser un PLAN DE COORDINACIÓN:
// cada decisión expone los 9 puntos estratégicos (qué coordina / optimiza / alternativas / por qué /
// beneficio / impacto en liquidez futura / costo financiero / relaciones / qué cambió vs el plan
// anterior), y cada horizonte trae su resumen estratégico. Todo con datos SINTÉTICOS — no toca el Sheet.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPlan } from './plan-tesoreria.mjs'

const HOY = new Date(2026, 6, 24) // 24/07/2026
const dia = (fecha, movimientos) => ({ fecha, saldo_inicial: 0, movimientos })

// Los 9 puntos que el spec exige en CADA decisión del plan.
const PUNTOS = [
  'coordina', 'optimiza', 'alternativas', 'por_que', 'beneficio_esperado',
  'impacto_liquidez_futura', 'impacto_costo_financiero', 'impacto_relaciones', 'cambio_vs_plan_anterior',
]

test('cada acción del plan trae la capa estratégica con los 9 puntos', () => {
  const dias = [
    dia('2026-07-24', [
      { tipo: 'ingreso', monto: 500000, cliente: 'Cliente A' },
      { tipo: 'egreso', monto: 200000, proveedor: 'Corralón' },
    ]),
  ]
  const { acciones } = construirPlan({ dias, cajaInicial: 300000, hoy: HOY })
  assert.ok(acciones.length > 0)
  for (const a of acciones) {
    assert.ok(a.estrategia && typeof a.estrategia === 'object', `${a.tipo} debe traer estrategia`)
    for (const p of PUNTOS) assert.ok(p in a.estrategia, `${a.tipo} debe declarar "${p}"`)
    assert.ok(String(a.estrategia.coordina).length > 0)
    assert.ok(String(a.estrategia.optimiza).length > 0)
  }
})

test('cobrar: coordina el ingreso y optimiza liquidez (capital de trabajo propio)', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'ingreso', monto: 800000, cliente: 'Cliente A' }])]
  const { acciones } = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  const cobrar = acciones.find((a) => a.tipo === 'cobrar')
  assert.match(cobrar.estrategia.optimiza, /liquidez/i)
  assert.match(cobrar.estrategia.impacto_liquidez_futura, /800\.000|800000/)
  assert.equal(Array.isArray(cobrar.estrategia.alternativas), true)
})

test('financiar: las alternativas evaluadas salen del comparador (reuso, no recálculo)', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 1000000, proveedor: 'Gruas San Blas', vencida: true }])]
  const { acciones } = construirPlan({ dias, cajaInicial: 200000, hoy: HOY })
  const fin = acciones.find((a) => a.tipo === 'financiar')
  assert.ok(fin, 'debe haber financiamiento')
  const alts = fin.estrategia.alternativas
  assert.ok(Array.isArray(alts) && alts.length > 0, 'debe listar alternativas evaluadas')
  // Exactamente una alternativa marcada como elegida, y coincide con la vía usada.
  assert.equal(alts.filter((x) => x.elegida).length, 1)
  // El comparador devuelve caja propia, descubierto y esperar como mínimo.
  assert.ok(alts.some((x) => /descubierto/i.test(x.opcion)))
  // El costo financiero informado en la estrategia refleja el costo de la acción, no un número nuevo.
  assert.match(fin.estrategia.impacto_costo_financiero, /\$/)
  assert.match(fin.estrategia.optimiza, /costo financiero/i)
})

test('postergar: la estrategia muestra que pagar hoy y financiar NO fueron elegidas, y por qué', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 1000000, proveedor: 'Ferretería X' }])]
  const { acciones } = construirPlan({ dias, cajaInicial: 200000, liquidezMinima: 0, hoy: HOY })
  const post = acciones.find((a) => a.tipo === 'postergar')
  assert.ok(post)
  const alts = post.estrategia.alternativas
  const elegida = alts.find((x) => x.elegida)
  assert.match(elegida.opcion, /postergar|negociar/i)
  assert.ok(alts.some((x) => /pagar hoy/i.test(x.opcion) && x.elegida === false))
  assert.match(post.estrategia.impacto_relaciones, /Ferretería X/)
})

test('cada horizonte trae un resumen_estrategico: qué coordina, qué optimiza, la estrategia y qué cambió', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'ingreso', monto: 500000, cliente: 'A' },
    { tipo: 'egreso', monto: 200000, proveedor: 'X' },
  ])]
  const { resumen_estrategico } = construirPlan({ dias, cajaInicial: 100000, hoy: HOY })
  for (const k of ['que_coordina', 'que_optimiza', 'estrategia', 'impacto_liquidez_futura', 'impacto_costo_financiero', 'impacto_relaciones', 'cambios_vs_plan_anterior']) {
    assert.ok(k in resumen_estrategico, `falta ${k} en el resumen estratégico`)
  }
  assert.match(resumen_estrategico.que_coordina, /Administración|Comercial/i)
})

test('estrategia global: cuando hay que financiar críticos, el mensaje es minimizar días de rojo', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 1000000, proveedor: 'AFIP', vencida: true }])]
  const { resumen_estrategico } = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  assert.match(resumen_estrategico.estrategia, /rojo|línea más barata|cancelar/i)
})

test('estrategia global: cuando se excede la línea, ALERTA explícita — no se tapa', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 999999999, proveedor: 'Gruas', vencida: true }])]
  const { resumen_estrategico } = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  assert.match(resumen_estrategico.estrategia, /ALERTA/)
})

test('estrategia global: dentro de la caja propia, el mensaje es operar sin la línea', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'X' }])]
  const { resumen_estrategico } = construirPlan({ dias, cajaInicial: 1000000, hoy: HOY })
  assert.match(resumen_estrategico.estrategia, /caja propia|sin recurrir a la línea/i)
})

test('sin plan anterior, todo cambio se declara honestamente (no inventa comparación)', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'X' }])]
  const { acciones, resumen_estrategico } = construirPlan({ dias, cajaInicial: 1000000, hoy: HOY })
  assert.match(acciones[0].estrategia.cambio_vs_plan_anterior, /sin plan anterior/i)
  assert.match(String(resumen_estrategico.cambios_vs_plan_anterior), /sin plan anterior/i)
})

test('con plan anterior, marca NUEVA / reprogramada / sin cambios por acción y resume el conjunto', () => {
  const anteriores = construirPlan({
    dias: [dia('2026-07-24', [
      { tipo: 'egreso', monto: 100000, proveedor: 'Corralón' },
      { tipo: 'egreso', monto: 50000, proveedor: 'Ferretería Vieja' },
    ])],
    cajaInicial: 1000000, hoy: HOY,
  }).acciones

  // Plan nuevo: mantiene Corralón (sin cambios), suma un pago nuevo, elimina Ferretería Vieja.
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 100000, proveedor: 'Corralón' },
    { tipo: 'egreso', monto: 70000, proveedor: 'Proveedor Nuevo' },
  ])]
  const { acciones, resumen_estrategico } = construirPlan({ dias, cajaInicial: 1000000, hoy: HOY, accionesAnteriores: anteriores })

  const corralon = acciones.find((a) => /Corralón/.test(a.descripcion))
  const nuevo = acciones.find((a) => /Proveedor Nuevo/.test(a.descripcion))
  assert.match(corralon.estrategia.cambio_vs_plan_anterior, /sin cambios/i)
  assert.match(nuevo.estrategia.cambio_vs_plan_anterior, /NUEVA/i)

  const cambios = resumen_estrategico.cambios_vs_plan_anterior
  assert.equal(typeof cambios, 'object')
  assert.ok(cambios.agregadas.some((x) => /Proveedor Nuevo/.test(x.descripcion)))
  assert.ok(cambios.eliminadas.some((x) => /Ferretería Vieja/.test(x.descripcion)))
})

test('reprogramada: la misma acción en otra fecha se detecta como reprogramación', () => {
  const anteriores = construirPlan({
    dias: [dia('2026-07-24', []), dia('2026-07-25', [{ tipo: 'egreso', monto: 100000, proveedor: 'Corralón' }])],
    cajaInicial: 1000000, hoy: HOY,
  }).acciones
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'Corralón' }])]
  const { acciones } = construirPlan({ dias, cajaInicial: 1000000, hoy: HOY, accionesAnteriores: anteriores })
  const corralon = acciones.find((a) => /Corralón/.test(a.descripcion))
  assert.match(corralon.estrategia.cambio_vs_plan_anterior, /reprogramada/i)
})

test('retrocompatibilidad: la capa estratégica no rompe los campos que ya lee la web', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'ingreso', monto: 500000, cliente: 'A' },
    { tipo: 'egreso', monto: 1000000, proveedor: 'AFIP', vencida: true },
  ])]
  const { acciones } = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  for (const a of acciones) {
    for (const campo of ['id', 'fecha', 'tipo', 'descripcion', 'motivo', 'impacto_pesos', 'costo_financiero', 'efecto_liquidez', 'riesgos', 'dependencias', 'medio', 'linea', 'requiere_aprobacion']) {
      assert.ok(campo in a, `la web lee "${campo}" y debe seguir existiendo en ${a.tipo}`)
    }
  }
})
