// EL PLAN DE ESCRITURA Y EL RBAC — las dos reglas de la conversación que deciden algo con plata.
//
// El plan se prueba PEGADO AL MOTOR REAL: se corre `conversar()` con el `mutar` que arma el plan,
// igual que la server action, y se mira qué plan salió. Probar `planDe()` con un `validado` escrito
// a mano verificaría que la función hace lo que hace, no que el motor le entrega lo que espera —
// que es donde puede romperse.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { planDe, paraElMotor, rolDeContrato, type Plan, type Intencion, type Validado } from './conversacionPlan.ts'
import { conversar } from '../../../../orquestador/lib/cotizador/conversacion.mjs'
import { estadoDesdeFilas } from '../../../../orquestador/lib/cotizador/desde-base.mjs'
import type { PartidaValorizada, PresupuestoCascada } from '../types/index.ts'

const PRESUPUESTO = {
  id: '11111111-1111-1111-1111-111111111111', numero: 'COT-2026-018', version: 1,
  pct_gastos_generales: 0.27, pct_beneficio: 0.15, pct_financiero: 0.02, factor_financiero: 0.5,
  pct_iibb: 0.035, pct_ganancias: 0.015, pct_cheque: 0.012, pct_iva: 0.21,
  costo_directo: 100000000, venta_sin_iva: 168000000,
} as unknown as PresupuestoCascada

const partida = (x: Partial<PartidaValorizada>) => ({
  partida_id: 'aaa', cotizacion_id: PRESUPUESTO.id, orden: 1, rubro: 'Albañileria',
  codigo: '01.01', descripcion: 'Mamposteria de ladrillo hueco', cantidad: 480, unidad: 'm2',
  tarea_tipo_id: null, analisis_id: null, metodo_medicion: null, subcontratada: false,
  precio_subcontrato: null, congelada: false, costo_unitario: 25000, hs_unitarias: 1,
  subtotal: 12000000, hh: 480, sin_analisis: false, ...x,
}) as PartidaValorizada

const LISTA = [
  partida({}),
  partida({ partida_id: 'bbb', codigo: '03.01', descripcion: 'Instalacion sanitaria', unidad: 'gl', cantidad: 1, costo_unitario: null, subtotal: null, sin_analisis: true }),
]

/** Corre un turno igual que la server action y devuelve el plan que salió. */
async function turnoConPlan(texto: string, rol: string) {
  const estado = estadoDesdeFilas({ presupuesto: PRESUPUESTO, partidas: LISTA })
  const caja: { plan: Plan | null } = { plan: null }
  const t = await conversar({
    texto, rol, actor: 'test', usarModelo: false, confirmado: true,
    estado: { ...estado, partidas: paraElMotor(LISTA) },
    mutar: ({ intent, validado }: { intent: Intencion; validado: Validado }) => {
      caja.plan = planDe(intent, validado, PRESUPUESTO.id)
      return estado
    },
  })
  return { turno: t, plan: caja.plan }
}

describe('el plan sale del motor, no de una suposición', () => {
  test('«la mamposteria son 520 m2» actualiza la fila de esa partida y nada más', async () => {
    const { plan } = await turnoConPlan('la mamposteria son 520 m2', 'DUENO')
    assert.ok(plan?.ok)
    assert.equal(plan.plan.tabla, 'cotizacion_partida')
    assert.equal(plan.plan.id, 'aaa', 'apuntó a otra fila')
    assert.deepEqual(plan.plan.columnas, { cantidad: 520 })
  })

  test('«beneficio 19%» se guarda en FRACCIÓN, no en 19', async () => {
    const { plan } = await turnoConPlan('beneficio 19%', 'DUENO')
    assert.ok(plan?.ok)
    assert.equal(plan.plan.tabla, 'cotizaciones')
    assert.equal(plan.plan.id, PRESUPUESTO.id, 'el presupuesto lo eligió la intención y no el servidor')
    // 19 en la columna daría un beneficio de 1.900 %, y como todos los escalones se multiplican por
    // la misma base el precio saldría «coherente»: mal en todos lados a la vez.
    assert.deepEqual(plan.plan.columnas, { pct_beneficio: 0.19 })
  })

  test('un subcontrato con proveedor marca la partida y guarda el precio', async () => {
    const { plan } = await turnoConPlan('la sanitaria la hace perez por 8,5M', 'DUENO')
    assert.ok(plan?.ok)
    assert.deepEqual(plan.plan.columnas, { subcontratada: true, precio_subcontrato: 8500000 })
  })

  test('«sanitaria 8,5M» sin proveedor NO llega a producir plan', async () => {
    const { turno, plan } = await turnoConPlan('sanitaria 8,5M', 'DUENO')
    assert.equal(turno.salida.ok, false)
    assert.equal(plan, null, 'armó un plan de escritura para un subcontrato que nadie confirmó')
  })
})

describe('lo que no se puede escribir dice QUÉ falta, y no finge', () => {
  test('«saca pintura» no escribe y explica por qué', async () => {
    const { plan } = await turnoConPlan('saca la mamposteria', 'DUENO')
    assert.ok(plan && !plan.ok)
    assert.match(plan.porQue, /alcance/, `el motivo no dice qué falta: «${plan.porQue}»`)
  })

  test('un precio en dólares se rechaza en vez de guardarse como pesos (§11)', () => {
    const p = planDe(
      { action: 'set_subcontract', target: 'x', value: 12000, supplier: 'Perez' },
      { partida: { id: 'aaa', codigo: '01.01' }, valor: 12000, moneda: 'USD', proveedor: 'Perez' },
      PRESUPUESTO.id,
    )
    assert.equal(p.ok, false)
    assert.match((p as { porQue: string }).porQue, /USD|moneda/)
  })

  test('sin partida resuelta no se inventa un id de fila', () => {
    const p = planDe({ action: 'update_quantity', target: 'x', value: 1 }, {}, PRESUPUESTO.id)
    assert.equal(p.ok, false)
  })
})

describe('RBAC: el jefe de obra no toca lo comercial ni ve el valor (§40)', () => {
  test('el mapeo de roles no asciende a nadie', () => {
    assert.equal(rolDeContrato('direccion'), 'DUENO')
    assert.equal(rolDeContrato('administracion'), 'ADMINISTRACION')
    assert.equal(rolDeContrato('jefe_obra'), 'JEFE_DE_OBRA')
    assert.equal(rolDeContrato('campo'), 'LECTOR')
    assert.equal(rolDeContrato('cliente'), 'LECTOR')
    assert.equal(rolDeContrato(null), 'LECTOR', 'una sesión sin perfil quedó con permisos')
  })

  test('«beneficio 19%» de un jefe de obra no produce plan y el motivo no dice 19', async () => {
    const { turno, plan } = await turnoConPlan('beneficio 19%', 'JEFE_DE_OBRA')
    assert.equal(turno.salida.ok, false)
    assert.equal(turno.salida.etapaQueParo, 'AUTORIZACION')
    assert.equal(plan, null)
    assert.ok(!/19/.test(JSON.stringify(turno.respuesta)), 'el error le contó el valor')
  })

  test('un LECTOR no puede ni cambiar una cantidad', async () => {
    const { turno, plan } = await turnoConPlan('la mamposteria son 520 m2', 'LECTOR')
    assert.equal(turno.salida.ok, false)
    assert.equal(turno.salida.etapaQueParo, 'AUTORIZACION')
    assert.equal(plan, null)
  })

  test('el jefe de obra SÍ puede cambiar una cantidad: no se le cierra de más', async () => {
    const { plan } = await turnoConPlan('la mamposteria son 520 m2', 'JEFE_DE_OBRA')
    assert.ok(plan?.ok)
  })
})

describe('el estado que se le pasa al motor lleva el id de fila', () => {
  test('sin `id` el plan no podría apuntar a ninguna fila', () => {
    const m = paraElMotor(LISTA)
    assert.equal(m[0].id, 'aaa')
    assert.equal(m[0].unidad, 'm2')
    assert.equal(m[1].sinAnalisis, true)
  })
})
