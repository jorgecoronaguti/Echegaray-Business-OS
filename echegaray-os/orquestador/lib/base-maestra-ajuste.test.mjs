// EL 1450 DE `Presupuesto!G37` ES UN TIPO DE CAMBIO, Y LOS OTROS TRES COEFICIENTES NO SE SABE.
//
// Los cuatro casos son literales del libro. Lo que estos tests defienden es la ASIMETRÍA: el único
// que se clasifica es el único que se puede probar, y los otros tres se quedan en `UNKNOWN`
// aunque suene razonable llamarlos «alcance». Si alguien afloja esa regla para subir la cobertura,
// «un ajuste UNKNOWN no se aplica» se pone en rojo.
import assert from 'node:assert/strict'
import test from 'node:test'
import { CONFIANZA, MONEDA } from './base-maestra-moneda.mjs'
import { TIPO_AJUSTE, aplicarAjuste, clasificarAjuste, repasoDeAjustes } from './base-maestra-ajuste.mjs'

/** `Recursos!341` — la única cotización que el libro declara. */
const TC = Object.freeze({ valor: 1500, fecha: '2025-10-01', fuente: 'BCO NACION', origen: 'Recursos!341 · DOLAR BCO NACION - VENTA' })
const EN_USD = Object.freeze({ moneda: MONEDA.USD, homogenea: true, porque: 'las 6 líneas están en USD' })
const EN_ARS = Object.freeze({ moneda: MONEDA.ARS, homogenea: true, porque: 'las 12 líneas están en ARS' })
const MIXTA = Object.freeze({ moneda: 'MIXTA', homogenea: false, porque: 'la composición mezcla USD y ARS' })

test('coeficiente 1 es NEUTRO y no requiere que nadie decida nada', () => {
  const a = clasificarAjuste({ coeficiente: 1, composicion: EN_ARS, tipoDeCambio: TC, donde: 'Presupuesto!G10' })
  assert.equal(a.tipo, TIPO_AJUSTE.NEUTRO)
  assert.equal(a.requiereDecision, false)
})

test('EL CASO: 1450 sobre una composición entera en USD es FX', () => {
  const a = clasificarAjuste({ coeficiente: 1450, composicion: EN_USD, tipoDeCambio: TC, donde: 'Presupuesto!G37' })
  assert.equal(a.tipo, TIPO_AJUSTE.FX)
  assert.equal(a.confianza, CONFIANZA.ALTA)
  assert.equal(a.evidencia.cotizacionDelLibro.valor, 1500)
  assert.equal(a.evidencia.cotizacionDelLibro.fuente, 'BCO NACION')
  assert.equal(a.donde, 'Presupuesto!G37')
})

test('el desvío contra la cotización del libro viaja como dato y pide decisión', () => {
  // El libro cotiza el dólar a 1500 y aplica 1450. Cincuenta pesos que nadie miraba.
  const a = clasificarAjuste({ coeficiente: 1450, composicion: EN_USD, tipoDeCambio: TC })
  assert.equal(a.evidencia.desvioContraLaCotizacion, -50)
  assert.equal(a.requiereDecision, true)
})

test('un FX que coincide exacto con la cotización no pide decisión', () => {
  const a = clasificarAjuste({ coeficiente: 1500, composicion: EN_USD, tipoDeCambio: TC })
  assert.equal(a.tipo, TIPO_AJUSTE.FX)
  assert.equal(a.requiereDecision, false)
})

test('EL DEFECTO: 1450 sobre una composición en PESOS no es FX', () => {
  // Es el caso que separa «convertir» de «multiplicar por mil cuatrocientos cincuenta porque sí».
  const a = clasificarAjuste({ coeficiente: 1450, composicion: EN_ARS, tipoDeCambio: TC, donde: 'Presupuesto!G37' })
  assert.equal(a.tipo, TIPO_AJUSTE.UNKNOWN)
  assert.equal(a.implausible, true)
})

test('una composición MIXTA tampoco alcanza para afirmar FX', () => {
  const a = clasificarAjuste({ coeficiente: 1450, composicion: MIXTA, tipoDeCambio: TC })
  assert.equal(a.tipo, TIPO_AJUSTE.UNKNOWN)
})

test('sin cotización en el libro, un 1450 sobre USD sigue siendo UNKNOWN', () => {
  // No se infiere el tipo de cambio desde el propio coeficiente: eso sería probar la hipótesis
  // con la hipótesis.
  const a = clasificarAjuste({ coeficiente: 1450, composicion: EN_USD, tipoDeCambio: null })
  assert.equal(a.tipo, TIPO_AJUSTE.UNKNOWN)
  assert.match(a.porque, /no declara ninguna cotización/)
})

test('un coeficiente fuera de la banda de la cotización no se fuerza a FX', () => {
  const a = clasificarAjuste({ coeficiente: 12000, composicion: EN_USD, tipoDeCambio: TC })
  assert.equal(a.tipo, TIPO_AJUSTE.UNKNOWN)
  assert.deepEqual(a.evidencia.banda, [750, 3000])
})

test('los otros tres coeficientes del libro quedan UNKNOWN, no SCOPE', () => {
  const casos = [
    { coeficiente: 2, donde: 'Presupuesto!G31' },   // T1058 INSTALACIÓN ELECTRICA
    { coeficiente: 3, donde: 'Presupuesto!G32' },   // T1059 INSTALACIÓN SANITARIA
    { coeficiente: 1.2, donde: 'Presupuesto!G42' }, // T1167 ENTREPISO
  ]
  for (const c of casos) {
    const a = clasificarAjuste({ ...c, composicion: EN_ARS, tipoDeCambio: TC })
    assert.equal(a.tipo, TIPO_AJUSTE.UNKNOWN, c.donde)
    assert.equal(a.implausible, false, c.donde)
    assert.equal(a.requiereDecision, true, c.donde)
  }
})

test('un coeficiente que no es número es UNKNOWN, no 1', () => {
  assert.equal(clasificarAjuste({ coeficiente: null }).tipo, TIPO_AJUSTE.UNKNOWN)
  assert.equal(clasificarAjuste({ coeficiente: '#REF!' }).tipo, TIPO_AJUSTE.UNKNOWN)
  assert.equal(clasificarAjuste({ coeficiente: undefined }).valor, null)
})

test('aplicar un FX convierte y deja escrito con qué', () => {
  const a = clasificarAjuste({ coeficiente: 1450, composicion: EN_USD, tipoDeCambio: TC })
  const r = aplicarAjuste({ costoUnitario: 38.27, moneda: MONEDA.USD, ajuste: a })
  assert.equal(r.aplicado, true)
  assert.equal(r.moneda, MONEDA.ARS)
  assert.equal(Number(r.valor.toFixed(2)), 55491.5)
  assert.match(r.comoSeHizo, /38\.27 USD × 1450/)
})

test('EL DEFECTO PRINCIPAL: un ajuste UNKNOWN NO se aplica', () => {
  // Aplicarlo igual «porque el Excel lo aplicaba» reproduce el número y pierde lo único nuevo:
  // que nadie sabe por qué está.
  const a = clasificarAjuste({ coeficiente: 2, composicion: EN_ARS, tipoDeCambio: TC })
  const r = aplicarAjuste({ costoUnitario: 1308480, moneda: MONEDA.ARS, ajuste: a })
  assert.equal(r.aplicado, false)
  assert.equal(r.valor, 1308480, 'el costo queda como estaba')
  assert.equal(r.sinResolver, true)
  assert.match(r.comoSeHizo, /NO se aplicó/)
})

test('un FX no es un markup: el mismo 1450 sobre pesos deja el costo intacto', () => {
  const comoFX = aplicarAjuste({ costoUnitario: 100, moneda: MONEDA.USD, ajuste: clasificarAjuste({ coeficiente: 1450, composicion: EN_USD, tipoDeCambio: TC }) })
  const comoMarkup = aplicarAjuste({ costoUnitario: 100, moneda: MONEDA.ARS, ajuste: clasificarAjuste({ coeficiente: 1450, composicion: EN_ARS, tipoDeCambio: TC }) })
  assert.equal(comoFX.valor, 145000)
  assert.equal(comoMarkup.valor, 100)
})

test('un ajuste NEUTRO deja el costo intacto y NO queda sin resolver', () => {
  const r = aplicarAjuste({ costoUnitario: 1219.74, ajuste: clasificarAjuste({ coeficiente: 1 }) })
  assert.equal(r.valor, 1219.74)
  assert.equal(r.sinResolver, false)
})

test('el repaso bloquea la cotización mientras quede un ajuste sin explicar', () => {
  const conocidos = [
    clasificarAjuste({ coeficiente: 1 }),
    clasificarAjuste({ coeficiente: 1450, composicion: EN_USD, tipoDeCambio: TC, donde: 'Presupuesto!G37' }),
  ]
  assert.equal(repasoDeAjustes(conocidos).bloquea, false)

  const conUnknown = [...conocidos, clasificarAjuste({ coeficiente: 2, composicion: EN_ARS, tipoDeCambio: TC, donde: 'Presupuesto!G31' })]
  const r = repasoDeAjustes(conUnknown)
  assert.equal(r.bloquea, true)
  assert.equal(r.total, 3)
  assert.deepEqual(r.sinResolver.map((x) => x.donde), ['Presupuesto!G31'])
  assert.equal(r.porTipo[TIPO_AJUSTE.FX], 1)
})
