// LO QUE ESTAS PRUEBAS IMPIDEN: que la pantalla de cobranzas AFIRME una deuda que no es.
//
// Cada caso está atado a un defecto concreto, y varios ya se pagaron en este repo con otra
// pantalla: un vacío publicado como cero, un documento que el filtro no pudo mirar y desapareció
// sin decirlo, y una barra cuyo ancho no coincide con la tabla que tiene debajo.
//
// Los números de antigüedad son los MEDIDOS en «28 · Cliente Cobranzas.dc.html»: si alguien
// «simplifica» el reparto de anchos a una proporción pelada, tres de estas se ponen rojas.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  anchoDeAtraso, bandaDe, bandasAntiguedad, comportamientoDePago, planDeCobranza, previsionSemanal,
} from './reglasCobranza.ts'
import type { CertificadoCliente, EstadoCertificado } from '../types/cobranzas.ts'

const HOY = '2026-08-24'

function doc(p: Partial<CertificadoCliente> & { monto: number }): CertificadoCliente {
  return {
    id: p.numero ?? String(p.monto), cliente_id: 'c1', obra_id: null, obra_nombre: null,
    numero: p.numero ?? 'Certificado', factura: null, reparo: null, emitido_at: null,
    vence: null, cobrado_at: null, estado: 'a_vencer' as EstadoCertificado, observacion: null,
    cobranza_fila: null, ...p,
  }
}

test('la banda se corta en 30 y en 60 días exactos, no «cerca»', () => {
  assert.equal(bandaDe('2026-09-17', HOY), 'por_vencer')  // todavía no venció
  assert.equal(bandaDe(HOY, HOY), 'por_vencer')           // vence hoy: NO está vencido
  assert.equal(bandaDe('2026-08-23', HOY), 'd1_30')       // un día
  assert.equal(bandaDe('2026-07-25', HOY), 'd1_30')       // 30 días justos
  assert.equal(bandaDe('2026-07-24', HOY), 'd31_60')      // 31
  assert.equal(bandaDe('2026-06-25', HOY), 'd31_60')      // 60 justos
  assert.equal(bandaDe('2026-06-24', HOY), 'd61_90')      // 61
  assert.equal(bandaDe('2026-05-25', HOY), 'd90')         // 91
})

test('sin fecha de vencimiento NO se asume que vence hoy', () => {
  // El defecto que atrapa: tratar `null` como «vencido hoy» mete la plata en «por vencer» y el
  // total cierra igual — nadie lo nota hasta que alguien reclama un documento que no vencía.
  assert.equal(bandaDe(null, HOY), null)
  const { bandas, sinVencimiento } = bandasAntiguedad([doc({ monto: 1_000_000 })], HOY)
  assert.equal(sinVencimiento, 1_000_000)
  assert.equal(bandas.reduce((s, b) => s + b.monto, 0), 0)
})

test('los anchos de la barra son los medidos en el mockup 28, con 2 % para el tramo vacío', () => {
  const documentos = [
    doc({ monto: 3_100_000, vence: '2026-09-17' }),
    doc({ monto: 6_200_000, vence: '2026-09-04' }),
    doc({ monto: 5_800_000, vence: '2026-08-04', estado: 'vencido' }),
    doc({ monto: 2_400_000, vence: '2026-07-15', estado: 'en_disputa' }),
  ]
  const { bandas } = bandasAntiguedad(documentos, HOY)
  assert.deepEqual(bandas.map((b) => b.monto), [9_300_000, 5_800_000, 2_400_000, 0, 0])
  // 51 · 32 · 13 · 2 · 2 son los `width:` literales de `28:121`–`28:129`. Una proporción pelada
  // daría 53 · 33 · 14 · 0 · 0 y los dos tramos sin deuda desaparecerían de la barra.
  assert.deepEqual(bandas.map((b) => b.ancho), [51, 32, 13, 2, 2])
})

test('lo cobrado y lo retenido no son deuda vencida', () => {
  // El fondo de reparo tiene su propia cifra arriba: sumarlo acá acusa al cliente de una mora por
  // plata que el contrato dice que todavía no se puede pedir.
  const documentos = [
    doc({ monto: 5_800_000, vence: '2026-08-04', estado: 'vencido' }),
    doc({ monto: 4_100_000, vence: '2026-07-02', estado: 'cobrado', cobrado_at: '2026-07-06' }),
    doc({ monto: 840_000, vence: '2026-09-28', estado: 'retenido' }),
  ]
  const { bandas } = bandasAntiguedad(documentos, HOY)
  assert.equal(bandas.reduce((s, b) => s + b.monto, 0), 5_800_000)
})

test('sin deuda la barra no queda invisible', () => {
  const { bandas } = bandasAntiguedad([], HOY)
  assert.deepEqual(bandas.map((b) => b.ancho), [20, 20, 20, 20, 20])
})

test('las ocho semanas arrancan mañana y lo vencido no se dibuja en el futuro', () => {
  const documentos = [
    doc({ monto: 6_200_000, vence: '2026-09-04' }),
    doc({ monto: 3_100_000, vence: '2026-09-17' }),
    doc({ monto: 5_800_000, vence: '2026-08-04', estado: 'vencido' }),
  ]
  const { semanas, vencidoSinFecha } = previsionSemanal(documentos, HOY)
  assert.deepEqual(semanas.map((s) => s.desde.slice(5)), [
    '08-25', '09-01', '09-08', '09-15', '09-22', '09-29', '10-06', '10-13',
  ])
  assert.equal(semanas[1].monto, 6_200_000)
  assert.equal(semanas[3].monto, 3_100_000)
  // Lo vencido NO se reparte en una semana futura: se declara aparte. Ubicarlo «donde promete
  // pagar» sería inventar una promesa que el OS no guarda.
  assert.equal(vencidoSinFecha, 5_800_000)
  assert.equal(semanas.reduce((s, x) => s + x.monto, 0), 9_300_000)
})

test('un cliente sin cobros no «paga a tiempo el 0 %»', () => {
  // NULL ≠ 0: un 0 % acá es una acusación, y sale de no tener historia, no de pagar mal.
  const c = comportamientoDePago([doc({ monto: 1, vence: '2026-09-01' })])
  assert.equal(c.pagaATiempoPct, null)
  assert.equal(c.atrasoPromedioDias, null)
})

test('el atraso promedio no se compensa con los pagos adelantados', () => {
  const documentos = [
    doc({ monto: 1, vence: '2026-07-01', estado: 'cobrado', cobrado_at: '2026-07-11' }), // 10 d
    doc({ monto: 1, vence: '2026-07-01', estado: 'cobrado', cobrado_at: '2026-06-21' }), // −10 d
  ]
  const c = comportamientoDePago(documentos)
  // Con resta, el promedio daría 0 días de atraso sobre un cliente que atrasó diez.
  assert.equal(c.atrasoPromedioDias, 5)
  assert.equal(c.pagaATiempoPct, 50)
  assert.equal(anchoDeAtraso(9), 30)
  assert.equal(anchoDeAtraso(90), 100)
})

test('el plan pone primero lo trabado, después lo vencido, y explica con datos', () => {
  const documentos = [
    doc({ numero: 'C4', monto: 3_100_000, vence: '2026-09-17' }),
    doc({ numero: 'C2', monto: 5_800_000, vence: '2026-08-04', estado: 'vencido' }),
    doc({
      numero: 'Cfinal', monto: 2_400_000, vence: '2026-07-15', estado: 'en_disputa',
      observacion: 'diferencia de medición',
    }),
  ]
  const plan = planDeCobranza(documentos, HOY)
  assert.deepEqual(plan.map((i) => i.documento.numero), ['Cfinal', 'C2', 'C4'])
  assert.deepEqual(plan.map((i) => i.rotulo), [
    'Coordinar remedición', 'Enviar recordatorio', 'Programar aviso',
  ])
  assert.match(plan[0].motivo, /40 días vencido y observado por el cliente · diferencia de medición/)
  assert.match(plan[1].motivo, /20 días vencido/)
  assert.match(plan[2].motivo, /Vence en 24 días/)
})

test('lo cobrado no entra al plan del día', () => {
  const plan = planDeCobranza(
    [doc({ monto: 1, vence: '2026-07-02', estado: 'cobrado', cobrado_at: '2026-07-06' })], HOY,
  )
  assert.deepEqual(plan, [])
})
