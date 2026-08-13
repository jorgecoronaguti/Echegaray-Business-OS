// EL EXTRACTOR DE CONTRATOS Y LA MONEDA — CONTRA LAS 91 FILAS DEL ARCHIVO REAL.
//
// Cada test de acá está escrito contra un DEFECTO concreto, no contra el código: si se afloja el
// marcador, si se suman los contratos repetidos, si se toma uno solo cuando la obra está partida o si
// el `0` de la col AA se trata como moneda, alguno se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contratoDeclarado, contratoDeObra, filasDeObra, normalizarMoneda, monedasDesconocidas,
  sumaConUSD, MARCADOR_CONTRATO,
} from './cobranzas-contrato.mjs'
import { FILAS, comoFilas, DESDE } from './cobranzas-fixture.mjs'

const COLS = { cliente: 6, concepto: 8, oc: 7, moneda: 26 }
const filas = comoFilas()
const SF = ['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ']

test('el contrato sale de la Orden de Compra, en las cuatro redacciones que usa el archivo', () => {
  assert.equal(contratoDeclarado('Anticipo inicio obra 50% $ 47.590.272 Cotización n°'), 47_590_272)
  assert.equal(contratoDeclarado('Resto 50% s/ total 47.590.272 — certificación quincenal 1/4'), 47_590_272)
  assert.equal(contratoDeclarado('Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9'), 97_650_000)
  assert.equal(contratoDeclarado('Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra'), 8_758_810)
  // El `$` pegado al número, que es como está escrito Playón.
  assert.equal(contratoDeclarado('Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. Cargar OC'), 65_000_000)
})

test('UN NÚMERO DE ORDEN DE COMPRA NO ES UN CONTRATO: sin marcador, no hay contrato', () => {
  // ESTE ES EL TEST QUE SOSTIENE TODO EL EXTRACTOR. La misma columna guarda números de OC de ocho
  // dígitos. Sin exigir el marcador, "OC 53239034" declararía un contrato de $53.239.034 en una fila
  // de ARCOR que no tiene contrato ninguno, y el saldo pendiente saldría creíble y falso — que es la
  // peor clase de defecto de este repo, porque no da error.
  for (const t of ['OC 53239034', 'OC 53241303 - 50%', '53312775 6A', '02-00002097', '00002-00001864',
    '53357412', 'Certificado 2', 'Certificado 3', 'Anticipo 50% inicio obra', 'SERVICIO DE METALURGIA', '']) {
    assert.equal(contratoDeclarado(t), null, `"${t}" no declara contrato`)
  }
  // Y contra el archivo entero: las 91 filas, sin excepción declarada a mano.
  const conNumeroSuelto = FILAS.filter(([, , , oc]) => /\d/.test(String(oc)) && !MARCADOR_CONTRATO.test(String(oc)))
  assert.ok(conNumeroSuelto.length >= 25, 'el archivo tiene números de OC de sobra para que esto signifique algo')
  for (const [n, , , oc] of conNumeroSuelto) assert.equal(contratoDeclarado(oc), null, `fila ${n}: "${oc}"`)
})

test('el punto es separador de miles y no decimal: es-AR o el contrato sale 47,59', () => {
  assert.equal(contratoDeclarado('s/ total 47.590.272'), 47_590_272)
  assert.notEqual(contratoDeclarado('s/ total 47.590.272'), 47.590272)
})

test('cinco filas que repiten el MISMO contrato declaran UNO, no cinco', () => {
  // Las 4 certificaciones de Pisos Industriales más su anticipo dicen las cinco $47.590.272. Sumarlas
  // daría $237.951.360 sobre un contrato de $47.590.272: un saldo pendiente de $190M inventado.
  const r = contratoDeObra(filas, COLS, { variantes: SF, needle: 'Pisos Industriales' }, DESDE)
  assert.equal(r.valores.length, 5, 'las cinco filas lo declaran')
  assert.equal(r.contrato, 47_590_272)
  assert.equal(r.partido, false)
  assert.deepEqual(r.valores.map((v) => v.fila), [66, 71, 72, 73, 74], 'y se sabe de qué filas salió')
})

test('una obra PARTIDA suma sus partes: Playón es blanco 65M + negro 37,5M', () => {
  // Quedarse con uno —el primero, el máximo— publicaría $65.000.000 de contrato sobre una obra de
  // $102.500.000 y un saldo pendiente de −$37.500.000 que no existe.
  const r = contratoDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'Playon Azufre' }, DESDE)
  assert.equal(r.contrato, 102_500_000)
  assert.equal(r.partido, true, 'y queda marcado como partido para que se pueda mirar')
  assert.deepEqual([...r.distintos].sort((a, b) => b - a), [65_000_000, 37_500_000])
  assert.equal(r.valores.length, 6, 'las seis filas de la obra lo declaran')
})

test('una obra sin contrato declarado da null, NUNCA cero', () => {
  // BSA no lo declara en ninguna de sus filas. Un 0 afirmaría que el contrato vale cero y el saldo
  // saldría −$14.120.243; null hace que la pestaña publique "—" y no afirme nada.
  const r = contratoDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'BSA' }, DESDE)
  assert.equal(r.contrato, null)
  assert.notEqual(r.contrato, 0)
  assert.deepEqual(r.valores, [])
})

test('Quattropani SÍ declara contrato — en las certificaciones, no en el anticipo', () => {
  // El anticipo dice sólo "Anticipo 50% inicio obra", sin monto: mirar esa fila sola lleva a concluir
  // que la obra no tiene contrato. Las 9 certificaciones lo dicen completo.
  const r = contratoDeObra(filas, COLS, { variantes: ['Quattropani - Melisa García SAS'], unica: true }, DESDE)
  assert.equal(r.contrato, 97_650_000)
  assert.equal(r.valores.length, 9)
  assert.deepEqual(r.valores.map((v) => v.fila), [84, 85, 86, 87, 88, 89, 90, 91, 92])
})

test('la regla `unica` toma TODAS las filas del cliente; si no, manda el texto', () => {
  // Es la regla del dueño (13/08): un cliente con UNA obra declarada ES esa obra. Sin ella el
  // anticipo de Quattropani —que no la nombra en ninguna columna— quedaba afuera.
  const conUnica = filasDeObra(filas, COLS, { variantes: ['Quattropani - Melisa García SAS'], unica: true })
  const porTexto = filasDeObra(filas, COLS, { variantes: ['Quattropani - Melisa García SAS'], needle: 'Salón Comercial' })
  assert.equal(conUnica.length, 13)
  assert.equal(porTexto.length, 9, 'por texto se pierden las 3 filas del anticipo y la del IVA')
  // MESSINA tiene dos obras: ahí NO se puede usar `unica` sin robarle filas a la otra.
  const playon = filasDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'Playon Azufre' })
  const bsa = filasDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'BSA' })
  assert.equal(playon.filter((i) => bsa.includes(i)).length, 0, 'ninguna fila cae en las dos obras')
})

test('la obra se reconoce por el Concepto O por la Orden de Compra, indistinto de mayúsculas', () => {
  // El anticipo de Playón nombra la obra sólo en la OC ("Playon de Azufre"), y con otra redacción que
  // el Concepto ("Playon Azufre"). Mirar una sola columna dejaba media obra afuera.
  const r = filasDeObra(filas, COLS, { variantes: ['MESSINA'], needle: 'Playon Azufre' })
  assert.equal(r.length, 6)
})

test('la moneda vacía es PESOS, "USD" es dólares, y el 0 de formato NO es una moneda', () => {
  assert.equal(normalizarMoneda(''), 'ARS')
  assert.equal(normalizarMoneda(undefined), 'ARS')
  assert.equal(normalizarMoneda('USD'), 'USD')
  assert.equal(normalizarMoneda('usd'), 'USD')
  // Las filas ID 35 y 36 (LA ESTRELLA) tienen un 0 que la pestaña dibuja "$0,00": es formato de
  // moneda derramado sobre una columna categórica, y esas dos filas son en pesos.
  assert.equal(normalizarMoneda(0), 'ARS')
  assert.equal(normalizarMoneda('$0,00'), 'ARS')
})

test('una moneda que no se entiende NO se trata como pesos en silencio: se denuncia', () => {
  // Es la segunda mitad del defecto que se arregló. Repartir en "USD" y "todo lo demás" convierte al
  // segundo balde en un cajón de descarte: un "EUR" tipeado mañana entraría al total como pesos.
  assert.equal(monedasDesconocidas(filas, COLS.moneda, DESDE).length, 0, 'el archivo de hoy está limpio')
  const conEuro = filas.map((f, i) => (i === 3 ? Object.assign([...f], { 26: 'EUR' }) : f))
  const raras = monedasDesconocidas(conEuro, COLS.moneda, DESDE)
  assert.deepEqual(raras, [{ fila: DESDE + 3, valor: 'EUR' }])
})

test('el archivo real tiene UNA sola fila en dólares, y es la que el dueño señaló', () => {
  const enUSD = FILAS.filter(([, , , , , , , , , , , , m]) => normalizarMoneda(m) === 'USD')
  assert.equal(enUSD.length, 1)
  assert.equal(enUSD[0][0], 62, 'la fila 62 del archivo (ID 58): el anticipo de Quattropani')
  assert.equal(enUSD[0][5], 15_400, 'U$S 15.400 — "Son 15.400 dólares", textual del dueño')
})

test('la suma con dólares no usa `<>USD` ni el atajo `×(TC−1)`: sólo criterios positivos', () => {
  const f = sumaConUSD({ rango: 'J:J', criterios: 'G:G;"X"', moneda: 'AA:AA', tc: 'TIPO_CAMBIO_USD' })
  assert.equal(f, 'SUMIFS(J:J;G:G;"X")-SUMIFS(J:J;G:G;"X";AA:AA;"USD")+SUMIFS(J:J;G:G;"X";AA:AA;"USD")*TIPO_CAMBIO_USD')
  // `<>USD` dependería de si Sheets considera que una celda VACÍA lo cumple — y 88 de las 91 filas la
  // tienen vacía: si no lo cumpliera, la pestaña quedaría casi en cero.
  assert.ok(!f.includes('<>'), 'ningún criterio negativo sobre la moneda')
  // `×(TC−1)` da el mismo número con un SUMIFS menos y RESTA el importe si el TC queda en blanco.
  assert.ok(!f.includes('-1)'), 'ningún atajo que cambie el signo cuando falta el tipo de cambio')
  assert.equal(f.split('SUMIFS(').length - 1, 3, 'todo, menos los dólares mal contados, más los valuados')
})
