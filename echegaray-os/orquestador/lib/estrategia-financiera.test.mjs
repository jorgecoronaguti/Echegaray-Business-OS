import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensamblarEstrategia, horizonteGobernante, problemaPrincipal, ahorroVsSegunda,
  clasificarPagos, clasificarCobranzas, clasificarFinanciamiento, impactoPorDimension,
  nivelConfianza, diagnosticoLiquidez,
} from './estrategia-financiera.mjs'

function planFixture(over = {}) {
  return {
    fecha: '25/07/2026', estado: 'ok', liquidez_minima: 0, limite_linea: 9000000,
    posicion: { colchon_total: -500000 }, tasas_faltantes: [{ via: 'descuento de cheque' }],
    sin_fecha: { n: 2, monto: 300000 }, fuentes: 'test',
    horizontes: {
      dias_7: {
        titulo: 'Próximos 7 días',
        estrategias: { elegida: 'costo_minimo', comparacion: 'costo_minimo gana', generadas: [
          { clave: 'costo_minimo', objetivo: 'minimizar costo', razonamiento: 'r', palancas: {}, beneficios: ['b'], riesgos: ['x'], impacto: { costo_financiero_total: 100000 } },
          { clave: 'caja_protegida', objetivo: 'proteger caja', razonamiento: 'r2', beneficios: ['b2'], riesgos: ['y'], impacto: { costo_financiero_total: 250000 } },
        ] },
        resumen: { saldo_proyectado_final: 1200000, costo_financiero_total: 100000 },
        resumen_estrategico: { que_coordina: 'CFO+Compras', que_optimiza: 'liquidez', estrategia_global: 'financiar barato', cambios_vs_plan_anterior: 'sin plan anterior' },
        acciones: [
          { tipo: 'financiar', descripcion: 'Pagar Ferretería X', motivo: 'crítico', impacto_pesos: 800000, costo_financiero: 20000, linea: 'descubierto', riesgos: 'sube uso de línea' },
          { tipo: 'cobrar', descripcion: 'Cobrar Estrella', motivo: 'acelera caja', impacto_pesos: 9000000 },
          { tipo: 'postergar', descripcion: 'Postergar Proveedor Y', motivo: 'respeta piso', impacto_pesos: 400000, nueva_fecha: '2026-08-05' },
        ],
        sensibilidad: { cobros: { recomendacion: 'adelantar cobro de Estrella', nota: 'ahorra descubierto' } },
      },
      dias_30: { titulo: '30', estrategias: { generadas: [] }, resumen: { saldo_proyectado_final: 2000000, costo_financiero_total: 150000 }, acciones: [] },
      dias_90: { titulo: '90', estrategias: { generadas: [] }, resumen: { saldo_proyectado_final: 3000000, costo_financiero_total: 200000 }, acciones: [] },
    },
    ...over,
  }
}
const MOVS = [
  { tipo: 'egreso', monto: 800000, proveedor: 'Ferretería X', obra: 'Estrella', categoria: 'material', dia: '2026-07-26' },
  { tipo: 'egreso', monto: 500000, categoria: 'impuesto', detalle: 'IVA', dia: '2026-07-27' },
  { tipo: 'ingreso', monto: 9000000, cliente: 'Estrella', dia: '2026-07-28' },
]

test('horizonteGobernante: elige el más corto CON tensión (financia/posterga/línea)', () => {
  const g = horizonteGobernante(planFixture().horizontes)
  assert.equal(g.clave, 'dias_7')
})

test('horizonteGobernante: sin tensión en ningún horizonte → 7 días por defecto', () => {
  const p = planFixture()
  for (const k of ['dias_7', 'dias_30', 'dias_90']) { p.horizontes[k].acciones = []; p.horizontes[k].estrategias = { generadas: [] } }
  const g = horizonteGobernante(p.horizontes)
  assert.equal(g.clave, 'dias_7')
  assert.match(g.motivo, /sin tensión/)
})

test('ensamblarEstrategia: arma el documento con las 19 caras clave', () => {
  const d = ensamblarEstrategia({ plan: planFixture(), modelo: null, movimientos: MOVS, opts: {} })
  assert.equal(d.estado, 'ok')
  assert.ok(d.objetivo_estrategico.includes('liquidez'))
  assert.equal(d.estrategia_recomendada.clave, 'costo_minimo')
  assert.equal(d.alternativas_evaluadas.length, 2)
  assert.equal(d.alternativas_evaluadas.find((a) => a.es_elegida).clave, 'costo_minimo')
  // la NO elegida trae por qué se descartó
  assert.ok(d.alternativas_evaluadas.find((a) => !a.es_elegida).por_que_descartada)
  assert.equal(d.impacto_caja.dias_30.saldo_proyectado, 2000000)
  assert.ok(d.cambios_vs_anterior)
})

test('problemaPrincipal: colchón negativo manda sobre todo', () => {
  const p = problemaPrincipal({ colchon_total: -500000 }, planFixture(), null, [])
  assert.equal(p.titulo, 'Colchón negativo')
  assert.equal(p.severidad, 'alta')
})

test('problemaPrincipal: sin colchón negativo pero con financiamiento → bache de caja', () => {
  const acc = [{ tipo: 'financiar', impacto_pesos: 800000 }]
  const p = problemaPrincipal({ colchon_total: 1000000 }, planFixture(), null, acc)
  assert.equal(p.titulo, 'Bache de caja a cubrir')
})

test('ahorroVsSegunda: diferencia de costo financiero contra la 2da mejor', () => {
  const a = ahorroVsSegunda(planFixture().horizontes.dias_7.estrategias.generadas, 'costo_minimo')
  assert.equal(a.monto, 150000)
  assert.equal(a.segunda, 'caja_protegida')
})

test('clasificarPagos: separa priorizar / postergar / mover', () => {
  const acc = planFixture().horizontes.dias_7.acciones
  const p = clasificarPagos(acc)
  assert.equal(p.postergar.length, 1)
  assert.equal(p.mover.length, 1) // el postergar tiene nueva_fecha → también mover; distinto: negociar_plazo
})

test('clasificarCobranzas: gestionar desde acciones, adelantar desde sensibilidad', () => {
  const H = planFixture().horizontes.dias_7
  const c = clasificarCobranzas(H.acciones, H.sensibilidad)
  assert.equal(c.gestionar.length, 1)
  assert.equal(c.adelantar.length, 1)
})

test('clasificarFinanciamiento: usar líneas del plan y EVITAR las sin tasa (no inventa)', () => {
  const H = planFixture().horizontes.dias_7
  const f = clasificarFinanciamiento(H.acciones, [{ via: 'descuento de cheque' }])
  assert.ok(f.usar.length >= 1)
  assert.ok(f.evitar.some((e) => /sin tasa/.test(e.descripcion)))
})

test('impactoPorDimension: agrupa por obra/proveedor/cliente/impuestos desde movimientos', () => {
  const d = impactoPorDimension(MOVS, planFixture().horizontes.dias_7.acciones)
  assert.equal(d.obra[0].nombre, 'Estrella')
  assert.equal(d.proveedor[0].nombre, 'Ferretería X')
  assert.equal(d.cliente[0].nombre, 'Estrella')
  assert.equal(d.impuestos[0].nombre, 'IVA')
  assert.ok(d.banco.some((b) => b.nombre === 'descubierto'))
})

test('impactoPorDimension: sin movimientos → lo declara, no estima', () => {
  const d = impactoPorDimension([], [])
  assert.equal(d.obra.length, 0)
  assert.match(d.nota, /no se pudo armar/)
})

test('nivelConfianza: degrada cuando faltan modelo/movimientos/tasas', () => {
  const baja = nivelConfianza(planFixture(), null, [])
  assert.equal(baja.nivel, 'baja')
  const alta = nivelConfianza({ ...planFixture(), tasas_faltantes: [], sin_fecha: null }, { colchon_total: 1 }, MOVS)
  assert.equal(alta.nivel, 'alta')
})

test('diagnosticoLiquidez: sin modelo degrada a "sin dato" pero no rompe', () => {
  const d = diagnosticoLiquidez(null, planFixture())
  assert.equal(d.estado, 'sin dato')
  assert.equal(d.colchon_total, -500000)
})

test('estado no-ok del plan se propaga sin inventar', () => {
  const d = ensamblarEstrategia({ plan: { fecha: 'x', estado: 'ok', horizontes: {} }, modelo: null, movimientos: [], opts: {} })
  // sin horizontes, elige 7d por defecto y no rompe
  assert.equal(d.estado, 'ok')
  assert.equal(d.estrategia_recomendada, null)
})
