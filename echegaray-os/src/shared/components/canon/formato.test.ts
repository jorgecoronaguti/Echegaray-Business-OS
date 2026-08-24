import test from 'node:test'
import assert from 'node:assert/strict'
import { diaMes, entero, millones, pesos, pesosConCentavos, porcentajeCanon } from './formato.ts'

// EL DEFECTO QUE ATRAPA ESTE ARCHIVO: que una ausencia se escriba como cero.
//
// Es el que más veces costó plata en este repo (`notas-credito-arca-signo`, `caja-$384M-falsa`), y
// en una cartera de presupuestos se vería así: un presupuesto sin partidas mostrando `$ 0,0 M` en
// la columna TOTAL, o sea la empresa ofertando gratis. Cada función devuelve `null` y NUNCA un cero
// de relleno; el segundo bloque de tests es el que se pone rojo si alguien «arregla» eso.

test('millones escribe la escala de la cartera con UN decimal siempre', () => {
  // Los cuatro valores son los del `14 · Presupuestos Cartera.dc.html`.
  assert.equal(millones(34_200_000), '$ 34,2 M')
  assert.equal(millones(96_500_000), '$ 96,5 M')
  assert.equal(millones(8_900_000), '$ 8,9 M')
  // Redondo: el decimal NO se cae. Sin él la columna deja de alinear en la coma.
  assert.equal(millones(184_000_000), '$ 184,0 M')
  assert.equal(millones(0), '$ 0,0 M')
})

test('debajo del millón NO se escribe «$ 0,4 M»: un importe real no puede leerse como cero', () => {
  // EL DEFECTO: al pie de la letra, la escala «M» del mockup convierte $ 400.000 en «$ 0,4 M», que
  // empieza con «$ 0» y a un ojo que recorre la columna se lee como cero. El mockup nunca tuvo el
  // caso —su presupuesto más chico es de $ 8,9 M— y hay un e2e vivo que exige que ninguna fila de
  // la cartera diga «$ 0». Si alguien «corrige» esto para que sea literal, este test se pone rojo.
  assert.equal(millones(400_000), '$ 400.000')
  assert.equal(millones(912_000), '$ 912.000')
  assert.equal(millones(999_999), '$ 999.999')
  assert.ok(!millones(400_000)!.startsWith('$ 0'))

  // Desde el millón, la escala del mockup.
  assert.equal(millones(1_000_000), '$ 1,0 M')
  assert.equal(millones(1_450_000), '$ 1,5 M')

  // Un cero DE VERDAD sí se escribe como cero: es un dato, no una ausencia.
  assert.equal(millones(0), '$ 0,0 M')

  // Negativos (una nota de crédito, un ajuste): el signo no se pierde ni cambia de escala.
  assert.equal(millones(-400_000), '$ -400.000')
  assert.equal(millones(-2_000_000), '$ -2,0 M')
})

test('millones acepta el numeric de Postgres en texto', () => {
  // PostgREST emite `numeric` como número o como texto según por dónde entró (columna directa vs.
  // embebido en JSONB). Si sólo aceptara `number`, la mitad de las filas diría «sin cotizar».
  assert.equal(millones('34200000'), '$ 34,2 M')
  assert.equal(millones('34200000.49'), '$ 34,2 M')
})

test('pesos escribe la escala transaccional con separador de miles es-AR', () => {
  assert.equal(pesos(912_000), '$ 912.000')
  assert.equal(pesos(1_750_000), '$ 1.750.000')
  assert.equal(pesos(3_500_000), '$ 3.500.000')
})

test('el precio de un insumo lleva dos decimales: el centavo por unidad mueve la partida', () => {
  // `16`: 1.240 m² × un centavo de diferencia por m² son $ 12,40 en la partida. A nivel de cartera
  // eso es ruido; a nivel de análisis de precio es el dato.
  assert.equal(pesosConCentavos(924), '$ 924,00')
  assert.equal(pesosConCentavos(4200.5), '$ 4.200,50')
})

test('el porcentaje lleva el espacio antes del signo, como en las nueve pantallas', () => {
  assert.equal(porcentajeCanon(16.8), '16,8 %')
  assert.equal(porcentajeCanon(9.8), '9,8 %')
  assert.equal(porcentajeCanon(17, 0), '17 %')
})

test('entero y diaMes: HH y fechas cortas de tabla', () => {
  assert.equal(entero(3240), '3.240')
  assert.equal(entero(2140.6), '2.141')
  assert.equal(diaMes('2026-08-18'), '18/08')
  assert.equal(diaMes('2026-08-18T14:30:00Z'), '18/08')
})

// ═══ LA AUSENCIA NUNCA ES CERO ═══

test('null, undefined y vacío devuelven null — nunca «$ 0,0 M» ni «0 %»', () => {
  for (const f of [millones, pesos, pesosConCentavos, porcentajeCanon, entero]) {
    assert.equal(f(null), null, `${f.name} inventó un valor para null`)
    assert.equal(f(undefined), null, `${f.name} inventó un valor para undefined`)
    assert.equal(f(''), null, `${f.name} inventó un valor para vacío`)
    assert.equal(f('   '), null, `${f.name} inventó un valor para espacios`)
  }
  assert.equal(diaMes(null), null)
  assert.equal(diaMes(''), null)
})

test('un texto que no es número no se convierte en cero', () => {
  // El caso real: una columna que llega como «sin cargar» desde una vista. `Number('sin cargar')`
  // es NaN, y un NaN que se cuela en `toLocaleString` imprime «NaN» en la pantalla del dueño.
  assert.equal(millones('sin cargar'), null)
  assert.equal(pesos('—'), null)
  assert.equal(entero(NaN), null)
  assert.equal(millones(Infinity), null)
})

test('una fecha ilegible devuelve null y no «Invalid Date»', () => {
  assert.equal(diaMes('no es una fecha'), null)
  assert.equal(diaMes('2026-13-45'), null)
})
