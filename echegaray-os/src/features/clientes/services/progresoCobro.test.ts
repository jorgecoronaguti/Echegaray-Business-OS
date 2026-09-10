import test from 'node:test'
import assert from 'node:assert/strict'
import { progresoDeCobro, tituloDeCobro } from './progresoCobro.ts'

test('sin contratado NO hay barra: una obra sin precio no está cobrada al 0 %', () => {
  // EL DEFECTO QUE ATRAPA: una barra vacía afirma que se midió y dio cero. Sobre una obra sin
  // precio en OBRAS eso se lee «no cobramos nada de esta obra», que es una afirmación comercial
  // sacada de un hueco de datos.
  assert.equal(progresoDeCobro(1000, null), null)
  assert.equal(progresoDeCobro(1000, 0), null)
  assert.equal(progresoDeCobro(1000, -5), null)
  assert.equal(progresoDeCobro(1000, undefined), null)
})

test('sin cobranza imputada tampoco hay barra, y el motivo NO es «no cobró»', () => {
  assert.equal(progresoDeCobro(null, 1000), null)
  assert.match(
    tituloDeCobro({ cobrado: null, contratado: 156174253 }),
    /Cobranzas registra el cobro por cliente, no por obra/,
  )
})

test('cero cobrado SÍ es una barra en cero: es una medición, no un hueco', () => {
  const p = progresoDeCobro(0, 1000)
  assert.deepEqual(p, { pct: 0, excede: false, exceso: null })
})

test('el porcentaje es el cobrado sobre el contratado, redondeado', () => {
  assert.equal(progresoDeCobro(500, 1000)?.pct, 50)
  assert.equal(progresoDeCobro(90579117.31, 156174253)?.pct, 58)
  // Se redondea, no se trunca: 1 de 3 es 33 %, no 0 %.
  assert.equal(progresoDeCobro(1, 3)?.pct, 33)
})

test('cobrado de más se dibuja lleno y el exceso se dice con palabras', () => {
  // Pasa con adicionales que se cobraron y no entraron al precio de OBRAS. Una barra al 137 % se
  // sale de su pista y se lee como un error de la pantalla.
  const p = progresoDeCobro(13700, 10000)
  assert.deepEqual(p, { pct: 100, excede: true, exceso: 3700 })
  assert.match(tituloDeCobro({ cobrado: 13700, contratado: 10000 }), /\$3\.700 por encima de lo contratado/)
})

test('el título dice las dos plata y, si existe, el facturado APARTE', () => {
  // Facturado es DEVENGADO y la barra es PERCIBIDO: se nombra y no se mezcla en la cuenta.
  assert.equal(
    tituloDeCobro({ cobrado: 500000, contratado: 1000000, facturado: 750000 }),
    'cobrado $500.000 de $1.000.000 contratado · facturado $750.000 (devengado)',
  )
  assert.equal(
    tituloDeCobro({ cobrado: 500000, contratado: 1000000 }),
    'cobrado $500.000 de $1.000.000 contratado',
  )
  assert.match(tituloDeCobro({ cobrado: 1, contratado: null }), /no hay contra qué medir/)
})

// ═══ LA BARRA DEL CLIENTE NO ES LA DE LA OBRA (H1, 10/09/2026) ═══
//
// En la fila del CLIENTE los dos números son acumulados y del cliente entero: el cobro sale de
// `cliente_economia.cobrado_neto_total` porque `cobranzas` lo anota contra el cliente y no contra
// la obra. Si el título no dijera de qué universo habla, el % del cliente se leería como el de su
// obra en marcha, y son cosas distintas.

test('el título del cliente dice que es de TODAS sus obras y que el cobro es neto', () => {
  const t = tituloDeCobro({ cobrado: 90_579_117, contratado: 156_174_253, ambito: 'cliente' })
  assert.match(t, /sin IVA/)
  assert.match(t, /todas sus obras/)
  // Y NO dice «de esta obra», que es lo que decía antes de tener ámbito.
  assert.doesNotMatch(t, /esta obra/)
})

test('sin cobranzas del cliente no se dice «esta obra», que sería falso', () => {
  const t = tituloDeCobro({ cobrado: null, contratado: 156_174_253, ambito: 'cliente' })
  assert.match(t, /Sin cobranzas registradas para este cliente/)
  assert.doesNotMatch(t, /esta obra/)
  // NO ES «no cobró nada»: es que ninguna fila quedó atada a su ficha.
  assert.match(t, /No es que no haya cobrado/)
})

test('el ámbito por defecto sigue siendo la obra: ninguna llamada vieja cambia de frase', () => {
  assert.equal(
    tituloDeCobro({ cobrado: null, contratado: 1000 }),
    tituloDeCobro({ cobrado: null, contratado: 1000, ambito: 'obra' }),
  )
})
