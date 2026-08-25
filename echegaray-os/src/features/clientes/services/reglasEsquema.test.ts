// LO QUE ESTAS PRUEBAS IMPIDEN: publicarle al cliente un plan de pagos que no cierra contra el
// contrato, o dejar un cambio sin publicar creyendo que salió.
//
// El caso de la grilla no es decorativo: un calendario corrido una fila pone el pago del 17 en el
// 16, y esa fecha es la que termina en la columna Q de la pestaña Cobranzas.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cambiosDelEsquema, cambiosSinPublicar, cuadreDelContrato, estadoVigente, grillaDelMes,
  pagosDelDia, totalEsquema,
} from './reglasEsquema.ts'
import type { PagoEsquema } from '../types/cobranzas.ts'

const HOY = '2026-08-24'

function pago(p: Partial<PagoEsquema> & { monto: number }): PagoEsquema {
  return {
    id: p.concepto ?? String(p.monto), cliente_id: 'c1', obra_id: null, obra_nombre: null,
    cobranza_fila: null, concepto: p.concepto ?? 'Pago', detalle: null, fecha: null, reparo: null,
    estado: 'a_vencer', medio: null, visible_portal: true, aviso_dias: null,
    mostrar_reprogramaciones: false, nota_interna: null, reprogramaciones: [], publicado_at: null,
    cambio_pendiente: false, orden: 0, monto_bloqueado: false, ...p,
  }
}

// Los seis pagos del mockup 32, con sus montos literales.
const ESQUEMA = [
  pago({ concepto: 'Certificado 1', monto: 4_100_000, reparo: 220_000, estado: 'cobrado' }),
  pago({ concepto: 'Certificado 2', monto: 5_800_000, reparo: 310_000, fecha: '2026-09-22' }),
  pago({ concepto: 'Certificado 3', monto: 6_200_000, reparo: 330_000, fecha: '2026-09-04' }),
  pago({ concepto: 'Certificado 4', monto: 3_100_000, reparo: 160_000, fecha: '2026-09-17', cambio_pendiente: true }),
  pago({ concepto: 'Certificado 5', monto: 1_560_000, reparo: 80_000, fecha: '2026-09-30', estado: 'previsto', cambio_pendiente: true }),
  pago({ concepto: 'Fondo de reparo', monto: 1_320_000, fecha: '2027-02-12', estado: 'retenido' }),
]

test('el total del esquema y el faltante son los del mockup 32', () => {
  assert.equal(totalEsquema(ESQUEMA).monto, 22_080_000)   // «$ 22,08 M» en `32:286`
  const c = cuadreDelContrato(26_400_000, ESQUEMA)
  assert.deepEqual(c, { estado: 'falta', monto: 4_320_000 }) // «Falta asignar $ 4,32 M» en `32:290`
})

test('sin contrato cargado no se afirma que falte plata', () => {
  // NULL ≠ 0: con `contrato = null`, restar daría «falta asignar −$ 22,08 M», un cartel rojo
  // sobre un esquema perfecto.
  assert.deepEqual(cuadreDelContrato(null, ESQUEMA), { estado: 'sin_contrato' })
})

test('asignar MÁS que el contrato también se detecta', () => {
  assert.deepEqual(cuadreDelContrato(20_000_000, ESQUEMA), { estado: 'excede', monto: 2_080_000 })
  assert.deepEqual(cuadreDelContrato(22_080_000, ESQUEMA), { estado: 'cuadra' })
})

test('el contador de cambios sin publicar cuenta pagos, no reprogramaciones', () => {
  // «2 cambios sin publicar» (`32:26`) con dos pagos tocados. Contar reprogramaciones daría 3 si
  // uno de ellos se movió dos veces, y el cliente vería un número que no significa nada.
  assert.equal(cambiosSinPublicar(ESQUEMA), 2)
  assert.equal(cambiosSinPublicar(ESQUEMA.map((p) => ({ ...p, cambio_pendiente: false }))), 0)
})

test('el historial de cambios va del más nuevo al más viejo y dice si el cliente lo vio', () => {
  const cambios = cambiosDelEsquema([
    pago({
      concepto: 'Certificado 2', monto: 1, reprogramaciones: [
        { de: '2026-08-04', a: '2026-09-22', at: '2026-08-20T10:00:00Z', por: 'RE', motivo: 'promesa de Sosa', publicado: true },
      ],
    }),
    pago({
      concepto: 'Certificado 4', monto: 1, reprogramaciones: [
        { de: '2026-09-10', a: '2026-09-17', at: '2026-08-24T09:00:00Z', por: 'RE', motivo: null, publicado: false },
      ],
    }),
  ])
  assert.deepEqual(cambios.map((c) => c.texto), [
    'Certificado 4 movido al 17/09', 'Certificado 2 movido al 22/09',
  ])
  assert.equal(cambios[0].detalle, 'sin publicar · RE')
  assert.equal(cambios[1].detalle, 'publicado · RE · promesa de Sosa')
})

test('mover la fecha al futuro saca la fila de «vencido» sin esperar al sync', () => {
  const p = pago({ monto: 1, fecha: '2026-08-04', estado: 'vencido' })
  assert.equal(estadoVigente(p, HOY), 'vencido')
  assert.equal(estadoVigente({ ...p, fecha: '2026-09-22' }, HOY), 'a_vencer')
  // Lo cobrado y lo retenido NO se recalculan: un cobro no se «desvence» por mover una fecha.
  assert.equal(estadoVigente({ ...p, estado: 'cobrado', fecha: '2026-08-04' }, HOY), 'cobrado')
  assert.equal(estadoVigente({ ...p, estado: 'retenido', fecha: '2026-08-04' }, HOY), 'retenido')
})

test('la grilla de septiembre 2026 arranca el lunes 31/08 y tiene cinco filas', () => {
  const g = grillaDelMes(2026, 9)
  assert.equal(g.length, 5)
  assert.equal(g[0][0].iso, '2026-08-31')
  assert.equal(g[0][0].delMes, false)
  assert.equal(g[0][1].iso, '2026-09-01')   // martes 1, como en `32:307`
  assert.equal(g[0][1].delMes, true)
  assert.equal(g[4][2].iso, '2026-09-30')   // miércoles 30, con el Certificado 5
  assert.equal(g[4][3].delMes, false)       // 1/10 ya es relleno
  assert.equal(g.flat().length, 35)
})

test('la grilla no se corre un día por el huso', () => {
  // Febrero de un año bisiesto que arranca domingo es el caso donde un `new Date(anio, mes)` local
  // en un huso negativo devuelve el último día del mes anterior.
  const g = grillaDelMes(2026, 2)
  assert.equal(g[0][0].iso, '2026-01-26')
  assert.ok(g.flat().some((d) => d.iso === '2026-02-28' && d.delMes))
  assert.equal(g.flat().filter((d) => d.delMes).length, 28)
})

test('los pagos de un día salen en el orden del esquema', () => {
  const dia = pagosDelDia([
    pago({ concepto: 'B', monto: 2, fecha: '2026-09-17', orden: 2 }),
    pago({ concepto: 'A', monto: 1, fecha: '2026-09-17T00:00:00Z', orden: 1 }),
    pago({ concepto: 'C', monto: 3, fecha: '2026-09-18', orden: 0 }),
  ], '2026-09-17')
  assert.deepEqual(dia.map((p) => p.concepto), ['A', 'B'])
})
