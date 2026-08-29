// EL PUENTE BASE → COTIZADOR: que traduzca, y que no complete nada.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { estadoDesdeFilas, issuesDePartidas, partidaDesdeFila, cascadaDesdeFila } from './desde-base.mjs'
import { ESTADO } from './contrato.mjs'

/** Una fila de `cotizacion_cascada` como la devuelve PostgREST: `numeric` puede venir string. */
const PRESUPUESTO = {
  id: 'p1', numero: 'COT-2026-018', version: 2,
  pct_gastos_generales: 0.27, pct_beneficio: 0.15, pct_financiero: 0.02, factor_financiero: 0.5,
  pct_iibb: 0.035, pct_ganancias: 0.015, pct_cheque: 0.012, pct_iva: 0.21,
  costo_directo: '100000000', venta_sin_iva: '168000000', venta_final: '203280000',
  iva: '35280000', coeficiente_sin_iva: '1.68',
}

const fila = (x) => ({
  partida_id: 'x', codigo: null, descripcion: 'algo', rubro: null, unidad: 'm2',
  cantidad: 100, costo_unitario: 1000, subtotal: 100000, hh: 10, tarea_tipo_id: null,
  subcontratada: false, precio_subcontrato: null, sin_analisis: false, congelada: false, ...x,
})

describe('traduce sin recalcular', () => {
  test('los numeric que PostgREST manda como string llegan como número', () => {
    const c = cascadaDesdeFila(PRESUPUESTO)
    assert.equal(c.ventaSinIva, 168000000)
    assert.equal(c.costoDirecto, 100000000)
    assert.equal(c.estado, ESTADO.CALCULADO)
  })

  test('sin precio de venta la cascada queda en FALTA_DATO, no en cero', () => {
    const c = cascadaDesdeFila({ ...PRESUPUESTO, venta_sin_iva: null })
    assert.equal(c.ventaSinIva, null, 'convirtió un null en cero')
    assert.equal(c.estado, ESTADO.FALTA_DATO)
    assert.ok(c.porQue)
  })

  test('el alcance NO se inventa: una partida sin alcance declarado no es INCLUIDO', () => {
    assert.equal(partidaDesdeFila(fila({})).alcance, null)
  })

  test('una partida no subcontratada no tiene objeto de subcontrato', () => {
    assert.equal(partidaDesdeFila(fila({})).subcontrato, null)
  })
})

describe('los huecos salen de las filas, no de una suposición', () => {
  test('sin cantidad → CANTIDAD_CRITICA_AUSENTE, con impacto null y NO cero', () => {
    const [i] = issuesDePartidas([partidaDesdeFila(fila({ cantidad: null, codigo: '01.01' }))])
    assert.equal(i.type, 'CANTIDAD_CRITICA_AUSENTE')
    assert.equal(i.impact, null, 'escribió cero donde no sabe')
    assert.equal(i.recommended_action, 'update_quantity')
  })

  test('subcontratada sin precio → SUBCONTRATO_SIN_PRECIO, nunca $0 (§14)', () => {
    const [i] = issuesDePartidas([partidaDesdeFila(fila({ subcontratada: true, precio_subcontrato: null, codigo: '03.01' }))])
    assert.equal(i.type, 'SUBCONTRATO_SIN_PRECIO')
    assert.equal(i.impact, null)
  })

  test('subcontratada CON precio no genera issue', () => {
    assert.equal(issuesDePartidas([partidaDesdeFila(fila({ subcontratada: true, precio_subcontrato: 8500000 }))]).length, 0)
  })

  test('una partida completa no genera ningún issue inventado', () => {
    assert.deepEqual(issuesDePartidas([partidaDesdeFila(fila({}))]), [])
  })
})

describe('el gate dice POR QUÉ no, no un booleano opaco (§24)', () => {
  test('con una cantidad ausente, el gate no está listo y nombra el bloqueo', () => {
    const e = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: [fila({ codigo: '01.01', cantidad: null })] })
    assert.equal(e.gate.ready, false)
    assert.ok(e.gate.blocking_issues.length > 0)
    assert.equal(e.gate.blocking_issues[0].entidad, '01.01')
    assert.match(e.gate.porQue, /NO se congela/)
  })

  test('sin partidas y sin precio calculable tampoco se congela, aunque la cola esté vacía', () => {
    const e = estadoDesdeFilas({ presupuesto: { ...PRESUPUESTO, venta_sin_iva: null }, partidas: [] })
    assert.equal(e.cola.total, 0)
    assert.equal(e.gate.ready, false, 'una cola vacía dijo que todo estaba bien')
    assert.ok(e.gate.blocking_issues.some((b) => b.tipo === 'SIN_PRECIO_CALCULABLE'))
  })

  test('todo en orden: el gate sí deja congelar', () => {
    const e = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: [fila({ codigo: '01.01' })] })
    assert.equal(e.gate.ready, true, e.gate.porQue)
  })
})

describe('dos partidas que se leen igual son dos issues distinguibles (QA visual, 29/08/2026)', () => {
  // El fixture del QA tenía «Instalación sanitaria completa» DOS VECES, sin código. `entity` cae a
  // la descripción cuando no hay código, así que los dos issues salían con la misma entidad: React
  // avisó por la key duplicada, pero lo grave era que en pantalla son dos huecos distintos que se
  // ven idénticos y no se puede saber a cuál ir.
  const dosIguales = [
    fila({ partida_id: 'p-1', codigo: null, descripcion: 'Instalacion sanitaria completa', sin_analisis: true }),
    fila({ partida_id: 'p-2', codigo: null, descripcion: 'Instalacion sanitaria completa', sin_analisis: true }),
  ]

  test('cada issue trae el id de SU fila, aunque se lean igual', () => {
    const issues = issuesDePartidas(dosIguales.map(partidaDesdeFila))
    assert.equal(issues.length, 2)
    assert.equal(issues[0].entity, issues[1].entity, 'el fixture ya no reproduce el caso')
    // MUTACIÓN QUE LO PONE ROJO: sacar `evidence: origen` de `issuesDePartidas`. La pantalla vuelve
    // a no tener con qué distinguir las dos filas y React vuelve a avisar por la key.
    assert.notEqual(issues[0].evidence?.partidaId, issues[1].evidence?.partidaId, 'los dos issues apuntan a la misma fila')
    assert.equal(issues[0].evidence.partidaId, 'p-1')
  })

  test('la cola conserva los dos y ninguno pisa al otro', () => {
    const e = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: dosIguales })
    const sanitarias = e.cola.issues.filter((i) => i.entity === 'Instalacion sanitaria completa')
    assert.equal(sanitarias.length, 2, 'la cola perdió uno de los dos huecos')
    assert.equal(new Set(sanitarias.map((i) => i.evidence.partidaId)).size, 2)
  })
})

describe('el alcance del §5 cambia lo que la cola pide', () => {
  const alcance = (patron, estado) => ({ patron, estado, fuente: 'CONVERSACION', texto_literal: null, decidido_por: null, motivo: null })

  test('una partida sin composición pide precio… hasta que se la excluye', () => {
    const partidas = [fila({ codigo: '02.01', descripcion: 'Pintura latex', sin_analisis: true })]
    const antes = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas })
    assert.ok(antes.cola.issues.some((i) => i.type === 'SIN_PRECIO'), 'no pidió el precio de la pintura')

    // MUTACIÓN QUE LO PONE ROJO: ignorar `alcance` en `estadoDesdeFilas`. La cola seguiría pidiendo
    // el precio de una partida que alguien sacó, que es lo que hace inútil el gesto de sacarla.
    const despues = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas, alcance: [alcance('pintura', 'EXCLUIDO')] })
    assert.equal(despues.cola.issues.some((i) => i.type === 'SIN_PRECIO'), false, 'sigue pidiendo el precio de algo excluido')
    assert.equal(despues.excluidas, 1)
  })

  test('excluir NO borra la partida: sigue en la lista, marcada', () => {
    const partidas = [fila({ codigo: '02.01', descripcion: 'Pintura latex' })]
    const e = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas, alcance: [alcance('pintura', 'EXCLUIDO')] })
    assert.equal(e.partidas.length, 1, 'la partida desapareció en vez de quedar marcada')
    assert.equal(e.partidas[0].alcance, 'EXCLUIDO')
  })

  test('sin ninguna decisión de alcance, nada queda excluido por su cuenta', () => {
    const e = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: [fila({})] })
    assert.equal(e.excluidas, 0)
  })
})

describe('la cola es PARCIAL y lo declara', () => {
  test('el estado dice que lo que se ve desde la base no es todo lo que hay', () => {
    const e = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: [fila({})] })
    assert.equal(e.parcial, true, 'declaró completa una cola que no ve las once etapas')
  })

  test('la política llega en camelCase, que es lo que lee la cascada del motor', () => {
    const e = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: [] })
    assert.equal(e.politica.pctBeneficio, 0.15)
    assert.equal(e.politica.factorFinanciero, 0.5)
  })
})
