import test from 'node:test'
import assert from 'node:assert/strict'
import {
  monto, fecha, partirRotuloDeObra, fechaCorta, imputarObra, palabrasDeObra, estadoDeCobranza, seDescarta,
} from './portal-siembra.mjs'

test('el importe es-AR: el punto es miles y el paréntesis es negativo', () => {
  assert.equal(monto('$ 47.590.271,50'), 47590271.5)
  assert.equal(monto('($ 96.800,00)'), -96800)
  assert.equal(monto('12.100.000'), 12100000)
  // «—» NO es cero: es que no hay dato. Devolverlo como 0 lo sumaría a un total.
  assert.equal(monto('—'), null)
  assert.equal(monto(''), null)
  assert.equal(monto(undefined), null)
})

test('la fecha dd/mm/aa; cualquier otra cosa es null, nunca una fecha inventada', () => {
  assert.equal(fecha('28/08/2026'), '2026-08-28')
  assert.equal(fecha('5/9/26'), '2026-09-05')
  assert.equal(fecha('sept-26'), null)
  assert.equal(fecha('—'), null)
})

test('el rótulo de OBRAS se parte en cliente, obra y las dos fechas', () => {
  assert.deepEqual(partirRotuloDeObra('3.1 · San Francisco — PISOS INDUSTRIALES · 05/08 → 30/09'),
    { cliente: 'San Francisco', obra: 'PISOS INDUSTRIALES', desde: '05/08', hasta: '30/09' })
  // El «▲» es una marca de aviso de la pestaña, no parte del nombre de la obra.
  assert.equal(partirRotuloDeObra('3.4 · San Francisco — MAMPOSTERÍA · 07/08 → 19/08 ▲').obra, 'MAMPOSTERÍA')
  assert.equal(partirRotuloDeObra('3.6 · MESSINA — BSA · 29/07 → 21/08 ▲').obra, 'BSA')
  assert.equal(partirRotuloDeObra('⇒ TOTAL — 7 OBRAS'), null, 'la fila de total no es una obra')
})

test('una fecha corta sin año no se completa sola', () => {
  assert.equal(fechaCorta('05/08', 2026), '2026-08-05')
  assert.equal(fechaCorta('05/08', null), null)
  assert.equal(fechaCorta(null, 2026), null)
})

test('las palabras salen del nombre, la entera primero', () => {
  assert.deepEqual(palabrasDeObra('PISOS INDUSTRIALES'), ['pisos industriales', 'pisos', 'industriales'])
  assert.deepEqual(palabrasDeObra('BSA'), ['bsa'], 'una sigla corta se usa entera')
})

const obras = [
  { id: 'pisos', palabras: palabrasDeObra('PISOS INDUSTRIALES') },
  { id: 'elec', palabras: palabrasDeObra('INSTALACIÓN ELÉCTRICA') },
  { id: 'entre', palabras: palabrasDeObra('ENTREPISO Y ESCALERA') },
]

test('cada cobranza cae en SU obra', () => {
  assert.equal(imputarObra({ detalle: 'Pisos Industriales' }, obras).obra.id, 'pisos')
  assert.equal(imputarObra({ detalle: 'Instalaciones Eléctricas — anticipo 1ª cuota' }, obras).obra.id, 'elec')
  assert.equal(imputarObra({ concepto: 'Entrepiso y escalera' }, obras).obra.id, 'entre')
})

test('las tildes no cambian la obra', () => {
  assert.equal(imputarObra({ detalle: 'INSTALACION ELECTRICA' }, obras).obra.id, 'elec')
})

test('una fila que no nombra su obra queda SIN IMPUTAR, no en la primera', () => {
  // «Anticipos San Francisco» abarca todas las obras del cliente. Mandarla a una pondría plata de
  // una obra en el cronograma de otra, y el cliente lo ve.
  assert.equal(imputarObra({ detalle: 'Anticipos San Francisco — quincenales' }, obras), null)
  assert.equal(imputarObra({ detalle: 'Saldo 50% de todas las obras' }, obras), null)
})

test('gana la coincidencia más larga', () => {
  // «entrepiso» contiene «piso»: sin la regla del más largo, el entrepiso caería en PISOS.
  assert.equal(imputarObra({ detalle: 'Entrepiso y escalera' }, obras).obra.id, 'entre')
})

test('lo marcado CANCELAR no se carga nunca', () => {
  assert.equal(seDescarta('CANCELAR'), true)
  assert.equal(seDescarta('Cobrado'), false)
})

test('cobrado es pagado; lo demás lo decide la fecha, como en el portal', () => {
  assert.equal(estadoDeCobranza('Cobrado', null), 'pagado')
  assert.equal(estadoDeCobranza('Pendiente', null), null)
  assert.equal(estadoDeCobranza('Facturado', null), null)
  assert.equal(estadoDeCobranza('Proyectado', null), 'sin_factura')
})

test('un cliente con UNA sola obra no tiene ambigüedad: todo cae ahí', () => {
  const una = [{ id: 'salon', palabras: palabrasDeObra('SALÓN COMERCIAL') }]
  // Sin esta regla, Quattropani —obra única— se quedaba con el cronograma vacío porque ninguna fila
  // de Cobranzas repite el nombre de la obra que ya es obvia.
  assert.equal(imputarObra({ concepto: 'Anticipo 50% inicio obra' }, una).obra.id, 'salon')
})

test('las tildes del Sheet no rompen la imputación', () => {
  const dos = [{ id: 'playon', palabras: palabrasDeObra('PLAYÓN DE AZUFRE') }, { id: 'bsa', palabras: palabrasDeObra('BSA') }]
  assert.equal(imputarObra({ detalle: 'Playon Azufre - Blanco' }, dos).obra.id, 'playon')
  assert.equal(imputarObra({ detalle: 'PLAYÓN DE AZUFRE' }, dos).obra.id, 'playon')
})
