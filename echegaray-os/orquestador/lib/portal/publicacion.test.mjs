// EL CONTROL DE COBROS OCULTOS TIENE QUE PODER DAR ROJO — y tiene que dar rojo por el caso real.
//
// El defecto que estos tests fijan: entre el 05/09 y el 07/09/2026 el portal de San Francisco
// publicaba $133.797.709,50 contra los $141.865.646 que Cobranzas declara cobrados en 2026. La fila
// que faltaba estaba en la base, con `estado = 'cobrado'`, y con `visible_portal = false` y
// `publicado_at = null` porque el sync la insertó sin declarar ninguna de las dos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cobrosOcultos, esCobroOculto, plataOculta, NACE_VISIBLE_AL_CLIENTE } from './publicacion.mjs'

/** Una fila de `esquema_pago` publicada al cliente. Cada test cambia sólo lo que prueba. */
const fila = (cambios = {}) => ({
  cliente_id: 'c1', cliente: 'Javier Sánchez - San Francisco - IMOTOR',
  concepto: 'Pisos Industriales — saldo del anticipo · 1ª de 2 cuotas',
  fecha: '2026-09-04', monto: 8067936.5, estado: 'cobrado',
  visible_portal: true, publicado_at: '2026-08-26T16:01:00Z',
  ...cambios,
})

test('una fila que el sync insertó SIN declarar visibilidad es un cobro oculto', () => {
  // Así nacían: `visible_portal boolean not null default false` y `publicado_at` sin valor.
  assert.equal(esCobroOculto(fila({ visible_portal: false, publicado_at: null })), true)
})

test('el predicado es el de la policy: las DOS condiciones, no una', () => {
  // Publicada pero apagada a mano por administración: el cliente NO la ve.
  assert.equal(esCobroOculto(fila({ visible_portal: false })), true)
  // Marcada visible pero el esquema todavía no se publicó: el cliente NO la ve.
  assert.equal(esCobroOculto(fila({ publicado_at: null })), true)
  assert.equal(esCobroOculto(fila()), false)
})

test('una línea PROYECTADA sin publicar no es un hallazgo: es trabajo pendiente', () => {
  // Si el control marcara esto, gritaría en cada corrida y nadie lo miraría más. El control existe
  // para la plata que YA entró y no se refleja.
  assert.equal(esCobroOculto(fila({ estado: 'a_vencer', visible_portal: false, publicado_at: null })), false)
  assert.equal(esCobroOculto(fila({ estado: 'previsto', visible_portal: false, publicado_at: null })), false)
})

test('EL CASO REAL: San Francisco, el 04/09 cobrado y no publicado', () => {
  // Las 12 filas publicadas del cliente más la que el sync sembró el 05/09 sin visibilidad.
  const publicadas = Array.from({ length: 12 }, (_, i) => fila({ monto: 1_000_000 + i }))
  const grupos = cobrosOcultos([...publicadas, fila({ visible_portal: false, publicado_at: null })])

  assert.equal(grupos.length, 1, 'un solo cliente afectado')
  assert.equal(grupos[0].n, 1)
  assert.equal(grupos[0].total, 8067936.5, 'la diferencia exacta entre Cobranzas y el portal')
  assert.equal(grupos[0].cliente, 'Javier Sánchez - San Francisco - IMOTOR')
})

test('sin cobros ocultos el control NO inventa un hallazgo', () => {
  assert.deepEqual(cobrosOcultos([fila(), fila({ monto: 12100000 })]), [])
  assert.equal(plataOculta([]), 0)
})

test('los clientes salen ordenados por plata oculta, de más a menos', () => {
  const oculta = (cambios) => fila({ visible_portal: false, publicado_at: null, ...cambios })
  const grupos = cobrosOcultos([
    oculta({ cliente_id: 'sf', cliente: 'San Francisco', monto: 8067936.5 }),
    oculta({ cliente_id: 'fq', cliente: 'Franco Quattropani', monto: 72808419.31 }),
    oculta({ cliente_id: 'le', cliente: 'La Estrella', monto: 25000000 }),
  ])
  assert.deepEqual(grupos.map((g) => g.cliente), ['Franco Quattropani', 'La Estrella', 'San Francisco'])
  // Los tres cobros ocultos medidos contra la base el 07/09/2026.
  assert.equal(Math.round(plataOculta(grupos) * 100) / 100, 105876355.81)
})

test('un monto que no es número NO se suma como cero', () => {
  // Sumarlo como 0 haría que el control informe MENOS plata oculta de la que hay: la dirección
  // equivocada para equivocarse en un control.
  const grupos = cobrosOcultos([
    fila({ visible_portal: false, publicado_at: null, monto: null }),
    fila({ visible_portal: false, publicado_at: null, monto: '8067936.50' }),
  ])
  assert.equal(grupos[0].n, 2, 'la fila sin monto se CUENTA aunque no se pueda sumar')
  assert.equal(grupos[0].total, 8067936.5, 'y el numeric que llega como string sí suma')
})

test('el criterio de nacimiento es el mismo que el del otro escritor de la tabla', () => {
  // `portal-sembrar.mjs` inserta `… 'sync_cobranzas', true, now()`. Si esta constante se pusiera en
  // `false`, los dos escritores de `esquema_pago` volverían a contradecirse — que es el defecto.
  assert.equal(NACE_VISIBLE_AL_CLIENTE, true)
})
