// LO QUE ESTAS PRUEBAS IMPIDEN: publicarle al cliente un plan de pagos que no cierra contra el
// contrato, o dejar un cambio sin publicar creyendo que salió.
//
// El caso de la grilla no es decorativo: un calendario corrido una fila pone el pago del 17 en el
// 16, y esa fecha es la que termina en la columna Q de la pestaña Cobranzas.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cambiosDelEsquema, cambiosSinPublicar, cuadreDelContrato, detalleDePago, estadoVigente,
  grillaDelMes, marcaDelPago, montoBloqueado, nuevaReprogramacion, pagosDelDia, totalEsquema,
} from './reglasEsquema.ts'
import { montoConMoneda } from './cobranzaFormato.ts'
import type { PagoEsquema } from '../types/cobranzas.ts'

const HOY = '2026-08-24'

function pago(p: Partial<PagoEsquema> & { monto: number }): PagoEsquema {
  return {
    id: p.concepto ?? String(p.monto), cliente_id: 'c1', obra_id: null, obra_nombre: null,
    cobranza_fila: null, concepto: p.concepto ?? 'Pago', fecha: null, reparo: null,
    moneda: 'ARS', factura_numero: null, recibo_numero: null,
    estado: 'a_vencer', medio: null, visible_portal: true, aviso_dias: null,
    mostrar_reprogramaciones: false, nota_interna: null, reprogramaciones: [], publicado_at: null,
    cambio_pendiente: false, orden: 0, ...p,
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
  assert.equal(cambios[1].detalle, 'publicado · RE')
  // ═══ EL MOTIVO VIAJA APARTE, Y POR ESO LA FALTA SE PUEDE PINTAR ═══
  //
  // Estaba pegado adentro de `detalle`, así que un movimiento sin motivo simplemente no lo
  // mencionaba: el historial no distinguía «se movió por la promesa de Sosa» de «se movió y nadie
  // dijo por qué». La segunda es la que hay que ir a completar, y va en ámbar.
  assert.equal(cambios[0].motivo, null)
  assert.equal(cambios[1].motivo, 'promesa de Sosa')
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

test('el monto se bloquea cuando lo impone un comprobante, y no antes', () => {
  // No es una columna de la tabla: `esquema_pago` no tiene `monto_bloqueado`. El bloqueo ES tener
  // fila en Cobranzas. Guardarlo aparte dejaba dos verdades sobre lo mismo, y la que se editaba a
  // mano le habilitaba a la administración cambiar el importe de una factura ya emitida.
  assert.equal(montoBloqueado(pago({ monto: 1, cobranza_fila: 62 })), true)
  assert.equal(montoBloqueado(pago({ monto: 1, cobranza_fila: null })), false)
})

test('el renglón de detalle se arma con lo que la fila ya dice', () => {
  assert.equal(
    detalleDePago(pago({ monto: 1, estado: 'cobrado', fecha: '2026-07-06', medio: 'transferencia' })),
    'cobrado 06/07 · transferencia',
  )
  assert.equal(detalleDePago(pago({ monto: 1, estado: 'previsto' })), 'previsto · todavía sin emitir')
  // Un pago a vencer y sin medio elegido no tiene nada que agregar: `null`, no una frase vacía ni
  // un « · » suelto. La pantalla cae al nombre de la obra.
  assert.equal(detalleDePago(pago({ monto: 1, estado: 'a_vencer' })), null)
  assert.equal(detalleDePago(pago({ monto: 1, estado: 'a_vencer', medio: 'cheque' })), 'cheque')
})

// ── UN ESQUEMA EN DOS MONEDAS ────────────────────────────────────────────────────────────────
//
// El contrato de Quattropani es en dólares por ajuste alzado y sus nueve certificados están en U$S.
// Con el total sumando todo, esos 38.115 dólares entraban como treinta y ocho mil pesos: un total
// que se lee bien y está mal. Estos tres tests se ponen ROJOS si se vuelve a sumar sin mirar.

test('el total NO suma los pagos en otra moneda, y dice cuántos dejó afuera', () => {
  const mezcla = [
    pago({ concepto: 'Anticipo', monto: 65_678_419, estado: 'cobrado' }),
    pago({ concepto: 'Certificado 1', monto: 4_235, moneda: 'USD' }),
    pago({ concepto: 'Certificado 2', monto: 4_235, moneda: 'USD' }),
  ]
  const t = totalEsquema(mezcla)
  assert.equal(t.monto, 65_678_419, 'los dólares no entran al total en pesos')
  assert.equal(t.sinSumar, 2)
})

test('con pagos en otra moneda NO se afirma cuánto falta asignar', () => {
  // El total en pesos deja afuera esas filas: decir «falta asignar $ X» contaría como faltante algo
  // que ya está asignado, sólo que en dólares.
  const mezcla = [pago({ monto: 1_000_000 }), pago({ monto: 4_235, moneda: 'USD' })]
  assert.equal(cuadreDelContrato(50_000_000, mezcla).estado, 'sin_contrato')
})

test('un monto en dólares NO se escribe con la escala de millones de pesos', () => {
  // `montoM(4235)` da «$ 0,00 M»: dibuja en cero un pago que existe, y le pone `$` a lo que no es.
  assert.equal(montoConMoneda(4_235, 'USD'), 'U$S 4.235')
  assert.equal(montoConMoneda(8_200_000, 'ARS'), '$ 8,20 M')
  assert.equal(montoConMoneda(null, 'USD'), '—')
})


// ── LA MARCA DE LA TARJETA: TRES AUSENCIAS, TRES FRASES ─────────────────────────────────────────
//
// ═══ EL DEFECTO QUE ATRAPAN ═══
//
// La RLS del portal exige `visible_portal` Y `publicado_at is not null`. Si las tres ausencias se
// dicen con la misma palabra, la pantalla no distingue entre «el cliente nunca vio este pago» y
// «el cliente está viendo la fecha VIEJA», que es la peligrosa: hay un plan comprometido distinto
// del que se está mirando.

const publicado = (p: Partial<PagoEsquema> & { monto: number }) =>
  pago({ publicado_at: '2026-05-02T10:00:00Z', ...p })

test('«nunca publicado» no es lo mismo que «sin publicar»', () => {
  assert.deepEqual(marcaDelPago(pago({ monto: 1 })), { texto: 'nunca publicado', tono: 'warn' })
  assert.deepEqual(
    marcaDelPago(publicado({ monto: 1, cambio_pendiente: true })),
    { texto: 'sin publicar', tono: 'warn' },
  )
})

test('«oculto al cliente» es a propósito y no reclama: va apagado, no en ámbar', () => {
  const m = marcaDelPago(publicado({ monto: 1, visible_portal: false }))
  assert.deepEqual(m, { texto: 'oculto al cliente', tono: 'apagado' })
})

test('un cambio sin publicar gana sobre el oculto: es lo que el cliente NO está viendo', () => {
  const m = marcaDelPago(publicado({ monto: 1, visible_portal: false, cambio_pendiente: true }))
  assert.equal(m?.texto, 'sin publicar')
})

test('UNA reprogramación se dice «2ª fecha»: la original no está en el historial', () => {
  const m = marcaDelPago(publicado({
    monto: 1,
    reprogramaciones: [{ de: '2026-08-15', a: '2026-09-15', at: '2026-08-06T00:00:00Z', por: null, motivo: null, publicado: false }],
  }))
  assert.deepEqual(m, { texto: '2ª fecha', tono: 'neg' })
})

test('un pago publicado, visible y sin movimientos NO lleva marca', () => {
  // Una marca siempre encendida deja de leerse.
  assert.equal(marcaDelPago(publicado({ monto: 1 })), null)
})

// ── EL HISTORIAL SE ESCRIBE SIEMPRE ─────────────────────────────────────────────────────────────

test('la reprogramación se guarda aunque nadie escriba el motivo', () => {
  // El hecho —cuántas veces se movió el cobro— no puede esperar a la explicación. Es lo que decide
  // si a ese cliente se le vuelve a cotizar con el mismo plazo de pago.
  const r = nuevaReprogramacion({ de: '2026-08-15', a: '2026-09-15', at: '2026-09-04T12:00:00Z' })
  assert.equal(r.de, '2026-08-15')
  assert.equal(r.a, '2026-09-15')
  assert.equal(r.motivo, null)
  assert.equal(r.publicado, false, 'mover la fecha no se la muestra al cliente')
})

test('un motivo en blanco queda NULL, no como cadena vacía', () => {
  // Una cadena vacía se lee como «tiene motivo» y la pantalla dejaría de pedirlo en ámbar.
  assert.equal(nuevaReprogramacion({ de: null, a: '2026-09-15', at: 'x', motivo: '   ' }).motivo, null)
  assert.equal(nuevaReprogramacion({ de: null, a: '2026-09-15', at: 'x', motivo: ' tarde ' }).motivo, 'tarde')
})

test('ninguna fila del calendario es una semana entera de días ajenos', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // El handoff describe la regla como «se construye mientras el LUNES de la semana siga cayendo
  // dentro del mes». Una grilla de seis filas fijas —o un `+1` de más en el cálculo— agrega una
  // séptima semana con siete días del mes siguiente: 104px de alto por columna de calendario
  // vacío, y un pago del mes que viene dibujado como si fuera de éste.
  //
  // Se barren 48 meses en vez de uno: el caso malo aparece sólo cuando el mes empieza domingo o
  // tiene 31 días, y probar septiembre de 2026 no lo toca nunca.
  for (let anio = 2024; anio <= 2027; anio++) {
    for (let mes = 1; mes <= 12; mes++) {
      const g = grillaDelMes(anio, mes)
      const ajenas = g.filter((semana) => semana.every((d) => !d.delMes))
      assert.deepEqual(ajenas, [], `${anio}-${mes}: hay una fila sin ningún día del mes`)
      // Y ninguna fila puede faltar: los días del mes tienen que estar todos dibujados.
      const delMes = g.flat().filter((d) => d.delMes).length
      assert.equal(delMes, new Date(Date.UTC(anio, mes, 0)).getUTCDate(), `${anio}-${mes}: faltan días`)
    }
  }
})
