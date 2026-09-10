import test from 'node:test'
import assert from 'node:assert/strict'
import { refrescarConCobranzas, conNumerosVivos, filaDeLaReplica } from './vivo.ts'
import { pagosDelEsquema } from './esquema.ts'
import type { FilaEsquema } from './esquema.ts'
import type { FilaCobranzaViva } from './vivo.ts'

// LO QUE ESTOS TESTS ATRAPAN: que el portal vuelva a publicar su COPIA del importe.
//
// Los números no son inventados. Son las filas reales de la pestaña Cobranzas y las filas reales de
// `esquema_pago` del 10/09/2026, el día en que el dueño miró el portal de Messina y dijo que no
// estaba bien. Si alguien saca el refresco, el primer test vuelve a decir $9.030.000.

/** Una fila de `esquema_pago` como la guardó el sync a las 15:18. */
function guardada(cambios: Partial<FilaEsquema> = {}): FilaEsquema {
  return {
    id: 'e1',
    obra_id: 'pilon',
    cobranza_fila: 32,
    concepto: 'PILON - Anticipo',
    fecha: '2026-05-07',
    monto: '9030000',
    reparo: null,
    estado: 'cobrado',
    medio: null,
    visible_portal: true,
    publicado_at: '2026-08-26T12:00:00Z',
    cambio_pendiente: false,
    orden: 1,
    ...cambios,
  }
}

/** La misma fila en la réplica de Cobranzas, ya corregida por el dueño. */
function viva(cambios: Partial<FilaCobranzaViva> = {}): FilaCobranzaViva {
  return {
    sheet_id: '28',                       // fila física 32 = 28 + FILA_BASE
    categoria: 'N',
    concepto: 'PILON - Pago parcial (07/05)',
    estado: 'Cobrado',
    fecha_cobro: '2026-05-07',
    monto_neto: '2330000',
    iva: null,
    total_bruto: '2330000',
    moneda: 'ARS',
    tipo_cambio: '1',
    ...cambios,
  }
}

const HOY = new Date('2026-09-10T12:00:00Z')

test('la fila del Sheet se resuelve a su fila FÍSICA, y una columna A vacía no apunta al encabezado', () => {
  assert.equal(filaDeLaReplica({ sheet_id: '28' }), 32)
  assert.equal(filaDeLaReplica({ sheet_id: null }), null)
  assert.equal(filaDeLaReplica({ sheet_id: '0' }), null)
})

test('EL DEFECTO DE MESSINA: el importe que ve el cliente es el de Cobranzas, no la copia', () => {
  const [p] = refrescarConCobranzas([guardada()], [viva()], HOY)
  assert.equal(Number(p.monto), 2_330_000, 'la copia decía $9.030.000')
  assert.equal(p.concepto, 'PILON - Pago parcial (07/05)')
  assert.equal(p.estado, 'cobrado')
})

test('EL DEFECTO DE MESSINA (2): la fecha también, y con ella cambia el estado', () => {
  // Pisos 120m2 — Anticipo 50 %: la copia decía $4.300.876,36 del 20/07; el Sheet dice
  // $4.234.267,49 cobrado el 04/08. Son el mismo cobro y ninguno de los dos números coincidía.
  const [p] = refrescarConCobranzas(
    [guardada({ obra_id: 'messina-pisos-120-rampa', cobranza_fila: 55, monto: '4300876.36', fecha: '2026-07-20' })],
    [viva({ sheet_id: '51', concepto: 'Pisos 120m2 -  Anticipo 50%', fecha_cobro: '2026-08-04',
      monto_neto: '3554443.27', iva: '746433.09', total_bruto: '4234267.49', categoria: 'B' })],
    HOY,
  )
  assert.equal(Number(p.monto), 4_234_267.49)
  assert.equal(p.fecha, '2026-08-04')
  assert.equal(Number(p.neto), 3_554_443.27)
  assert.equal(Number(p.iva), 746_433.09)
})

test('UN COBRO EN DÓLARES NO SE PUBLICA VALUADO: la fila 62 son U$S 15.400, no $23.288.249', () => {
  // `sync-cobranzas` valúa a pesos en `total_bruto` y guarda el nativo en `total_bruto_origen`. Con
  // el valuado, la pantalla pintaría el número de pesos con el signo de dólares: un error de tres
  // órdenes de magnitud en la cara del cliente.
  const p = conNumerosVivos(
    guardada({ obra_id: 'quattropani', cobranza_fila: 62, moneda: 'USD', monto: '15400' }),
    viva({ sheet_id: '58', concepto: 'U$S 20.000 — 63,5 % del anticipo', moneda: 'USD',
      tipo_cambio: '1512.22399', monto_neto: '23288249.446', total_bruto: '23288249.446',
      monto_neto_origen: '15400', total_bruto_origen: '15400', categoria: 'B' }),
    HOY,
  )
  assert.equal(Number(p.monto), 15_400)
  assert.equal(p.moneda, 'USD')
  // Y el IVA de una fila valuada se declara DESCONOCIDO: la réplica sólo lo tiene en pesos.
  assert.equal(p.iva, null)
})

test('el estado se DERIVA de la fecha con la regla del Sheet: una fecha futura no está vencida', () => {
  const aVencer = conNumerosVivos(guardada(), viva({ estado: 'Facturado', fecha_cobro: '2026-09-17' }), HOY)
  assert.equal(aVencer.estado, 'a_vencer')
  const vencida = conNumerosVivos(guardada(), viva({ estado: 'Facturado', fecha_cobro: '2026-09-01' }), HOY)
  assert.equal(vencida.estado, 'vencido')
  // «Proyectado» es previsión del dueño: no vence, porque no hay nada emitido que pueda vencer.
  const previsto = conNumerosVivos(guardada(), viva({ estado: 'Proyectado', fecha_cobro: '2026-01-01' }), HOY)
  assert.equal(previsto.estado, 'previsto')
})

test('una fila ANULADA en el Sheet desaparece del portal en vez de quedar congelada', () => {
  // `proyectar()` saltea las `CANCELAR`, así que la fila que se publicó antes no se vuelve a tocar
  // NUNCA: sin esto, el cliente sigue viendo un cobro que la empresa dio de baja.
  assert.deepEqual(refrescarConCobranzas([guardada()], [viva({ estado: 'CANCELAR' })], HOY), [])
})

test('una fila SIN cobranza_fila queda como estaba: no hay fuente viva que la contradiga', () => {
  const sembrada = guardada({ cobranza_fila: null, monto: '9034356.20' })
  const [p] = refrescarConCobranzas([sembrada], [viva()], HOY)
  assert.equal(Number(p.monto), 9_034_356.2)
  assert.equal(p.concepto, 'PILON - Anticipo')
})

test('LA COSTURA COMPLETA: el pago que llega a la pantalla ya trae el número vivo', () => {
  // El refresco tiene que estar ANTES de armar el cronograma, no después: si alguien lo mueve, este
  // test se pone rojo con el importe viejo.
  const [pago] = pagosDelEsquema(
    refrescarConCobranzas([guardada()], [viva()], HOY),
    new Map([['pilon', 'Pilón']]),
    () => true,
  )
  assert.equal(pago.monto, 2_330_000)
  assert.equal(pago.fechaPago, '2026-05-07')
  assert.equal(pago.rotulo, 'PILON - Pago parcial (07/05)')
})
