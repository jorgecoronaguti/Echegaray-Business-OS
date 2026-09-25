// LO QUE ESTAS PRUEBAS IMPIDEN: que la pantalla diga «Pagado» sobre una factura impaga, y que diga
// «en Sheet» sobre algo que el worker todavía no escribió.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  estadoEnSheet, frasePago, leyendaDeSheet, pagadoDe, saldoDe, sePuedePagar, sinTramoLibre,
} from './pagoDeCompra.ts'

const fila = (e = {}) => ({
  total: 121000, monto_pagado: 0, monto_parcial_2: 0, pago_total_o_parcial: null, tipo_pago: null,
  estado: 'Pendiente', fecha_prevista_2: null, saldo_pendiente: 121000, anulada: false, ...e,
})

test('«Monto Parcial 1» no suma: es =T-O y contaría el pago dos veces', () => {
  // Una fila con 50.000 pagados: U vale −71.000 y NO entra en la cuenta.
  assert.equal(pagadoDe(fila({ monto_pagado: 50000 }) as never), 50000)
  assert.equal(saldoDe(fila({ monto_pagado: 50000 }) as never), 71000)
  assert.equal(pagadoDe(fila({ monto_pagado: 50000, monto_parcial_2: 71000 }) as never), 121000)
})

test('la frase sale de la ARITMÉTICA, no de la columna Estado: en 114 filas el texto la contradice', () => {
  // El Sheet dice «Pagado» y los tramos dicen que falta todo: la pantalla no repite el texto.
  assert.deepEqual(frasePago(fila({ estado: 'Pagado' }) as never), { texto: 'Sin pagar', tono: 'falta' })
  assert.equal(frasePago(fila({ monto_pagado: 121000, estado: 'Pendiente' }) as never).texto, 'Pagado')
  assert.equal(frasePago(fila({ monto_pagado: 50000 }) as never).texto, 'Parcial')
  assert.equal(frasePago(fila({ anulada: true }) as never).texto, 'anulada')
  assert.equal(frasePago(fila({ total: 0 }) as never).texto, 'sin total')
  // Un peso de diferencia se considera saldado: es la tolerancia de la propia fórmula del Sheet.
  assert.equal(frasePago(fila({ monto_pagado: 120999.5 }) as never).texto, 'Pagado')
})

test('no se ofrece pagar lo que no se puede pagar', () => {
  assert.equal(sePuedePagar(fila() as never), true)
  assert.equal(sePuedePagar(fila({ monto_pagado: 121000 }) as never), false)
  assert.equal(sePuedePagar(fila({ anulada: true }) as never), false)
  assert.equal(sePuedePagar(fila({ total: null }) as never), false)
  // Los dos tramos usados: se puede deber plata y aun así no haber dónde registrarla.
  assert.equal(sinTramoLibre(fila({ total: 200000, monto_pagado: 50000, monto_parcial_2: 50000 }) as never), true)
  assert.equal(sinTramoLibre(fila({ monto_pagado: 50000 }) as never), false)
})

test('la leyenda nunca afirma un efecto que no ocurrió', () => {
  assert.equal(leyendaDeSheet('sin_pedido'), null)
  assert.equal(leyendaDeSheet('pendiente')?.texto, 'pendiente de Sheet')
  assert.equal(leyendaDeSheet('procesando')?.texto, 'escribiéndose en el Sheet')
  assert.equal(leyendaDeSheet('en_sheet')?.texto, '✓ en Sheet')
  assert.equal(leyendaDeSheet('en_sheet')?.tono, 'ok')
  // Un rechazo muestra el MOTIVO tal cual: un «no se pudo» genérico esconde el caso que importa.
  assert.equal(leyendaDeSheet('rechazado', 'la celda cambió')?.texto, 'la celda cambió')
  assert.equal(leyendaDeSheet('rechazado', '  ')?.texto, 'el Sheet no aceptó el cambio')
})

test('lo que la base llama «aplicado», la pantalla lo llama «en Sheet»', () => {
  assert.equal(estadoEnSheet({ estado: 'aplicado' }), 'en_sheet')
  assert.equal(estadoEnSheet({ estado: 'pendiente' }), 'pendiente')
  assert.equal(estadoEnSheet({ estado: 'error' }), 'rechazado')
  assert.equal(estadoEnSheet(null), 'sin_pedido')
})

// «DESHACER PAGO» NO REVIERTE UNA IMPUTACIÓN (24/09/2026). La base escribe `imputar ER-nnnn` / `desimputar` en
// `valor_nuevo`; un pago de la app escribe `total` / `parcial` / `deshacer`. Sólo los primeros se frenan.
test('deshacer pago reconoce el cambio de una imputación a una entrega de efectivo', async () => {
  const { esCambioDeImputacion } = await import('./pagoDeCompra.ts')
  assert.equal(esCambioDeImputacion('imputar ER-0020'), true)
  assert.equal(esCambioDeImputacion('desimputar'), true)
  for (const v of ['total', 'parcial', 'deshacer', null, undefined, '', 'imputarX']) assert.equal(esCambioDeImputacion(v), false, String(v))
})
