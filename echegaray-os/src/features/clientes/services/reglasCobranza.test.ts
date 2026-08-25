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
  bandaDe, bandasAntiguedad, comportamientoDePago, planDeCobranza, previsionSemanal,
  saldoSinCertificado, sinVencimiento,
} from './reglasCobranza.ts'
import type { CertificadoCliente, CuentaCorriente } from '../types/cobranzas.ts'

const HOY = '2026-08-24'

function doc(p: Partial<CertificadoCliente> & { monto: number }): CertificadoCliente {
  return {
    id: p.numero ?? String(p.monto), cliente_id: 'c1', obra_id: null, obra_nombre: null,
    numero: p.numero ?? 'Certificado', factura: null, periodo_desde: null, periodo_hasta: null,
    avance_periodo: null, reparo: null, emitido_at: null, vence: null, estado: 'emitido',
    observacion: null, cobranza_fila: null, detalle_rubros: null, ...p,
  }
}

/** Una fila de la vista. Los cinco tramos del aging entran por nombre; el resto en cero. */
function cta(p: Partial<CuentaCorriente> = {}): CuentaCorriente {
  return {
    cliente_id: 'c1', nombre_comercial: 'Cliente', saldo: 0, vencido: 0, por_vencer: 0,
    comprobantes_pendientes: 0, aging_por_vencer: 0, aging_1_30: 0, aging_31_60: 0,
    aging_61_90: 0, aging_mas_90: 0, facturado_90d: 0, cobrado_90d: 0, dso: null,
    efectividad_pct: null, dias_cobro_promedio: null, fondo_reparo: 0, ...p,
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
  assert.equal(sinVencimiento([doc({ monto: 1_000_000 })], HOY), 1_000_000)
  assert.equal(sinVencimiento([doc({ monto: 1_000_000, vence: '2026-09-01' })], HOY), 0)
})

test('un documento cobrado ya no cuenta como plata sin vencimiento', () => {
  // Si `sigueEnLaCalle` dejara pasar los cobrados, la pantalla acusaría de «sin fecha» a un cobro
  // hecho: la fila cobrada sin fecha de Q existe en el Sheet y es un cobro registrado a mano.
  assert.equal(sinVencimiento([doc({ monto: 900_000, estado: 'cobrado' })], HOY), 0)
})

test('los anchos de la barra son los medidos en el mockup 28, con 2 % para el tramo vacío', () => {
  const bandas = bandasAntiguedad(cta({
    aging_por_vencer: 9_300_000, aging_1_30: 5_800_000, aging_31_60: 2_400_000,
  }))
  assert.deepEqual(bandas.map((b) => b.monto), [9_300_000, 5_800_000, 2_400_000, 0, 0])
  // 51 · 32 · 13 · 2 · 2 son los `width:` literales de `28:121`–`28:129`. Una proporción pelada
  // daría 53 · 33 · 14 · 0 · 0 y los dos tramos sin deuda desaparecerían de la barra.
  assert.deepEqual(bandas.map((b) => b.ancho), [51, 32, 13, 2, 2])
})

test('la barra sale de la vista y NO de la lista de certificados', () => {
  // ÉSTE ES EL DEFECTO DE LA INTEGRACIÓN. Convivían dos agings del mismo cliente: el de la vista
  // (toda la cartera de Cobranzas) y uno recalculado sobre `certificado_cliente`, que es un
  // subconjunto. Si alguien vuelve a sumar los documentos acá, esta prueba se pone roja: los
  // certificados de abajo suman $1 M y la barra tiene que seguir mostrando los $12 M de la vista.
  const bandas = bandasAntiguedad(cta({ aging_1_30: 12_000_000 }))
  assert.equal(bandas[1].monto, 12_000_000)
  assert.equal(bandas.reduce((s, b) => s + b.monto, 0), 12_000_000)
})

test('lo que la barra muestra y la tabla no explica se declara, no se disimula', () => {
  // La vista suma toda la cartera; la tabla, sólo lo que el sync materializó como certificado.
  // Sin este número, el que mira suma la columna, le da menos que el saldo y cree que la pantalla
  // perdió filas.
  const documentos = [doc({ monto: 5_800_000, vence: '2026-08-04', estado: 'vencido' })]
  assert.equal(saldoSinCertificado(documentos, cta({ saldo: 9_300_000 })), 3_500_000)
  // Cuando la tabla explica todo el saldo, no hay nada que decir.
  assert.equal(saldoSinCertificado(documentos, cta({ saldo: 5_800_000 })), 0)
  // Ni cuando hay MÁS certificados que saldo: eso no es un faltante de la tabla.
  assert.equal(saldoSinCertificado(documentos, cta({ saldo: 1_000_000 })), 0)
  // Sin cuenta corriente no se afirma un faltante.
  assert.equal(saldoSinCertificado(documentos, null), 0)
})

test('un cobrado no cuenta contra el saldo de la barra', () => {
  const documentos = [
    doc({ monto: 5_800_000, vence: '2026-08-04', estado: 'vencido' }),
    doc({ monto: 4_100_000, vence: '2026-07-06', estado: 'cobrado' }),
  ]
  // Si `sigueEnLaCalle` contara el cobrado, el «no explicado» daría 0 y taparía un faltante real.
  assert.equal(saldoSinCertificado(documentos, cta({ saldo: 9_300_000 })), 3_500_000)
})

test('sin deuda la barra no queda invisible', () => {
  assert.deepEqual(bandasAntiguedad(cta()).map((b) => b.ancho), [20, 20, 20, 20, 20])
  // Y sin cuenta corriente tampoco: es un cliente sin movimientos, no una barra rota.
  assert.deepEqual(bandasAntiguedad(null).map((b) => b.ancho), [20, 20, 20, 20, 20])
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

test('un cliente sin cobros no «tarda 0 días en pagar»', () => {
  // NULL ≠ 0: un 0 acá diría que paga al instante, que es lo contrario de «no hay con qué medirlo».
  const c = comportamientoDePago([doc({ monto: 1, vence: '2026-09-01' })], cta())
  assert.equal(c.diasCobroPromedio, null)
  assert.equal(c.emitidos, 1)
})

test('el comportamiento de pago sale de la vista, no de restar una fecha contra sí misma', () => {
  // ÉSTE ES EL DEFECTO QUE ATRAPA. Se medía «paga a tiempo» comparando la fecha de cobro con la de
  // vencimiento; en esta fuente son LA MISMA CELDA (la columna Q se pisa con la fecha real al
  // cobrarse), así que el resultado era 100 % de puntualidad para cualquier cliente. Lo único
  // medible es lo que publica la vista: los días entre emitir y cobrar.
  const documentos = [
    doc({ monto: 1, emitido_at: '2026-07-01', vence: '2026-07-11', estado: 'cobrado' }),
    doc({ monto: 1, emitido_at: '2026-07-01', vence: '2026-09-30', observacion: 'faltan planos' }),
  ]
  const c = comportamientoDePago(documentos, cta({ dias_cobro_promedio: 47.5 }))
  assert.equal(c.diasCobroPromedio, 47.5)
  assert.equal(c.observados, 1)
  assert.equal(c.emitidos, 2)
  // Y no reaparece por la puerta de atrás: la función no mira `vence` de los cobrados.
  assert.equal(comportamientoDePago(documentos, cta()).diasCobroPromedio, null)
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
    [doc({ monto: 1, vence: '2026-07-06', estado: 'cobrado' })], HOY,
  )
  assert.deepEqual(plan, [])
})
