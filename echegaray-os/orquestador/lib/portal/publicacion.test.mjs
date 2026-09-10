// EL CONTROL DE COBROS OCULTOS TIENE QUE PODER DAR ROJO — y tiene que dar rojo por el caso real.
//
// El defecto que estos tests fijan: entre el 05/09 y el 07/09/2026 el portal de San Francisco
// publicaba $133.797.709,50 contra los $141.865.646 que Cobranzas declara cobrados en 2026. La fila
// que faltaba estaba en la base, con `estado = 'cobrado'`, y con `visible_portal = false` y
// `publicado_at = null` porque el sync la insertó sin declarar ninguna de las dos.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cobrosOcultos, duplicadosPublicados, esCobroOculto, filasQueElSyncNoAlcanza, plataOculta,
  publicablesDelCliente, publicadaAlCliente, NACE_VISIBLE_AL_CLIENTE,
} from './publicacion.mjs'

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

test('las filas que el sync no puede mantener son las que NO tienen cobranza_fila', () => {
  // El sembrador concilia por (obra_id, orden) y no guarda la fila del Sheet: sus líneas quedan
  // fuera del alcance del sync y congeladas. Son las que el cliente ve.
  const filas = [
    { origen: 'sync_cobranzas', cobranza_fila: 94, concepto: 'del sync' },
    { origen: 'sync_cobranzas', cobranza_fila: null, concepto: 'saldo del anticipo · 1ª de 2 cuotas' },
    { origen: 'manual', cobranza_fila: null, concepto: 'cargada a mano, no es de ningún sync' },
  ]
  const huerfanas = filasQueElSyncNoAlcanza(filas)
  assert.equal(huerfanas.length, 1)
  assert.equal(huerfanas[0].concepto, 'saldo del anticipo · 1ª de 2 cuotas')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS DOS INVARIANTES DE DUPLICADO — con las filas reales que los rompieron.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Una fila publicada de `esquema_pago`. */
const pub = (c) => ({
  id: c.id ?? 'x', obra_id: null, cobranza_fila: null, moneda: 'ARS', orden: 0,
  visible_portal: true, publicado_at: '2026-08-26T12:00:00Z', ...c,
})

test('EL DEFECTO DE QUATTROPANI: el espejo en pesos de una fila en dólares no se publica', () => {
  // Las filas reales del 10/09/2026. El mismo cobro, escrito dos veces: la línea en dólares que el
  // cliente firmó y su espejo en pesos, que es lo que entró al banco. El pie decía «Pagados 6 ·
  // $72.808.419» sobre TRES cobros.
  const filas = [
    pub({ id: 'usd-11500', moneda: 'USD', monto: '13915', obra_id: 'quattropani',
      concepto: 'U$S 11.500 + IVA — 36,5 % del anticipo 50 % + Materiales' }),
    pub({ id: 'ars-61', cobranza_fila: 61, monto: '65678419.31',
      concepto: 'U$S 11.500 + IVA — 36,5 % del anticipo 50 % + Materiales' }),
    pub({ id: 'iva-220', cobranza_fila: 64, monto: '6510000', concepto: 'IVA de Factura 220' }),
  ]
  const visibles = publicablesDelCliente(filas).map((f) => f.id)
  assert.deepEqual(visibles, ['usd-11500', 'iva-220'], 'gana el dólar: es la moneda en que firmó')
  assert.equal(duplicadosPublicados(filas)[0]?.motivo, 'espejo_en_pesos')
})

test('el espejo apagado a mano no cambia nada: los nueve pares que YA estaban bien siguen igual', () => {
  const filas = [
    pub({ id: 'usd-1', moneda: 'USD', concepto: 'Certificación 1/9' }),
    { ...pub({ id: 'ars-78', cobranza_fila: 78, concepto: 'Salón Comercial - Certificación 1/9' }), visible_portal: false },
  ]
  assert.deepEqual(publicablesDelCliente(filas).map((f) => f.id), ['usd-1'])
  assert.deepEqual(duplicadosPublicados(filas), [], 'lo que ya está oculto no es un hallazgo')
})

test('DOS COBROS REALES CON EL MISMO CONCEPTO Y LA MISMA FECHA NO SE TOCAN', () => {
  // El riesgo caro del invariante 1. San Francisco tiene dos «Cobro» del 08/05 por $24.200.000 y
  // $20.000.000: son dos cobros distintos. Están los dos en PESOS, y por eso la regla —que exige
  // monedas distintas— no los alcanza. Si alguien la afloja a «mismo concepto», acá se pone rojo.
  const filas = [
    pub({ id: 'c1', cobranza_fila: 24, concepto: 'Cobro', monto: '24200000', fecha: '2026-05-08' }),
    pub({ id: 'c2', cobranza_fila: 25, concepto: 'Cobro', monto: '20000000', fecha: '2026-05-08' }),
  ]
  assert.deepEqual(publicablesDelCliente(filas).map((f) => f.id), ['c1', 'c2'])
})

test('UNA FILA DE COBRANZAS, UN PAGO VISIBLE: gana la que está vinculada a la obra', () => {
  // En San Francisco convivieron dos copias del saldo del anticipo de Pisos Industriales con
  // estados que se contradecían. El índice único de la base es PARCIAL: un `drop index` lo saca sin
  // que nada se ponga rojo, así que el invariante también se aplica acá.
  const filas = [
    pub({ id: 'huerfana', cobranza_fila: 94, concepto: 'Pisos Industriales — saldo del anticipo', estado: 'cobrado' }),
    pub({ id: 'vinculada', cobranza_fila: 94, obra_id: 'pisos-industriales', concepto: 'saldo del anticipo', estado: 'a_vencer' }),
  ]
  assert.deepEqual(publicablesDelCliente(filas).map((f) => f.id), ['vinculada'])
  assert.equal(duplicadosPublicados(filas)[0]?.motivo, 'misma_fila_de_cobranzas')
})

test('el predicado de publicación es UNO: lo que el control llama oculto es lo que el portal no muestra', () => {
  const oculta = pub({ id: 'o', estado: 'cobrado', visible_portal: false, publicado_at: null })
  assert.equal(publicadaAlCliente(oculta), false)
  assert.equal(esCobroOculto(oculta), true)
  assert.deepEqual(publicablesDelCliente([oculta]), [])
})
