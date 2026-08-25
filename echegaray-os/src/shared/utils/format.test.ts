import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cantidad, desvio, hh, horas, money, moneyK, pct, plata, plataCorta, porcentaje } from './format.ts'
import { diaMesAnioISO, diaMesISO, diaMesAnioLocal, diaMesLocal } from './fecha.ts'
import * as obras from '../../features/obras/components/formato.ts'
import * as integraciones from '../../features/integraciones/components/formato.ts'

// ═══ EL DEFECTO QUE ATRAPA (21/08/2026) ═══
//
// El formato de Obras y el de Integraciones se mudaron a `shared/utils`. Una mudanza de formato no
// tiene manera de fallar ruidosamente: si una función cambia un separador, un espacio o un signo, la
// pantalla sigue compilando y sigue mostrando un número — otro. Estos asserts fijan la salida LETRA
// POR LETRA de cada función movida, que es lo único que prueba que la mudanza no cambió nada.
//
// El segundo bloque fija lo contrario: que `plata`/`money`, `porcentaje`/`pct` y `plataCorta`/
// `moneyK` NO son la misma función. Conviven a propósito, y el día que alguien las quiera fusionar
// «porque están duplicadas», se pone rojo acá.

test('la plata de Obras: sin decimales, sin espacio, y el vacío no es cero', () => {
  assert.equal(plata(1234), '$1.234')
  assert.equal(plata(74_300_000), '$74.300.000')
  assert.equal(plata(1234.6), '$1.235')
  assert.equal(plata(0), '$0')
  assert.equal(plata(-1234), '$-1.234')
  assert.equal(plata(null), '—')
  assert.equal(plata(undefined), '—')
})

// El decimal aparece SÓLO por debajo de 10 unidades de la escala: `$8,4M` sí, `$74M` no. Con dos
// cifras enteras el decimal no cambia ninguna decisión y sí ocupa el ancho por el que existe la
// función. (El ejemplo del docstring decía `$74,3M`, que esta función nunca devolvió.)
test('la plata abreviada corta en k, M y MM, y el signo va pegado al peso', () => {
  assert.equal(plataCorta(74_300_000), '$74M')
  assert.equal(plataCorta(8_400_000), '$8,4M')
  assert.equal(plataCorta(1_500_000_000), '$1,5MM')
  assert.equal(plataCorta(48_000), '$48k')
  assert.equal(plataCorta(940), '$940')
  assert.equal(plataCorta(-2_400_000), '-$2,4M')
  assert.equal(plataCorta(null), '—')
})

test('el porcentaje de Obras lleva el espacio del es-AR, y el null NO es 0 %', () => {
  assert.equal(porcentaje(35), '35 %')
  assert.equal(porcentaje(12.55), '12,6 %')
  assert.equal(porcentaje(0), '0 %')
  assert.equal(porcentaje(null), null)
})

test('las horas y las HH: una con decimal y su unidad, la otra redondeada y sin unidad', () => {
  assert.equal(horas(12.5), '12,5 HH')
  assert.equal(horas(1200), '1.200 HH')
  assert.equal(horas(null), '—')
  assert.equal(hh(12.5), '13')
  assert.equal(hh(1200.4), '1.200')
  assert.equal(hh(null), null)
})

test('el desvío declara el signo cuando está por encima del plan', () => {
  assert.equal(desvio(12.5), '+12,5%')
  assert.equal(desvio(-8), '-8%')
  assert.equal(desvio(0), '0%')
  assert.equal(desvio(null), '—')
})

// LAS DOS COPIAS DE `cantidad` ERAN LA MISMA REGLA: la de Obras con unidad, la de Integraciones sin
// ella. Quedó una sola. Lo que se conservó de cada una: la unidad opcional, la coerción de Obras
// (un `numeric` de Postgres puede llegar como texto) y el descarte de lo no finito de Integraciones.
test('la cantidad: es-AR, hasta dos decimales, unidad opcional y el null sigue siendo null', () => {
  assert.equal(cantidad(2.84, 'm³'), '2,84 m³')
  assert.equal(cantidad(1200), '1.200')
  assert.equal(cantidad(18.5), '18,5')
  assert.equal(cantidad(0), '0')
  assert.equal(cantidad(2.5, null), '2,5')
  assert.equal(cantidad('2.5', 'm2'), '2,5 m2')
  assert.equal(cantidad(null, 'm³'), null)
  assert.equal(cantidad(Number.NaN), null)
})

test('las fechas de tabla: el ISO se lee como día calendario y no se corre', () => {
  assert.equal(diaMesAnioISO('2026-06-26'), '26/06/26')
  assert.equal(diaMesAnioISO('2026-06-26T23:30:00Z'), '26/06/26')
  assert.equal(diaMesAnioISO(null), '—')
  assert.equal(diaMesISO('2026-06-26'), '26/06')
  assert.equal(diaMesISO(null), null)
  assert.equal(diaMesLocal('2026-04-23'), '23/04')
  assert.equal(diaMesAnioLocal('2026-08-20T14:05:00'), '20/08/26')
})

// ═══ LAS DOS FAMILIAS NO SE FUSIONAN ═══

test('`money` y `plata` NO son la misma función, y tampoco `pct`/`porcentaje` ni `moneyK`/`plataCorta`', () => {
  assert.notEqual(money(1234), plata(1234), 'money usa Intl currency: lleva espacio duro')
  // `pct` recibe la FRACCIÓN y `porcentaje` el porcentaje ya en escala 0–100.
  assert.equal(pct(0.153), '15,3%')
  assert.equal(porcentaje(15.3), '15,3 %')
  assert.notEqual(moneyK(1_250_000), plataCorta(1_250_000))
  assert.equal(moneyK(0), '', 'moneyK apaga el cero; plataCorta lo escribe')
  assert.equal(plataCorta(0), '$0')
})

// LOS RE-EXPORTS SON LA MISMA FUNCIÓN, NO UNA COPIA. Si alguien «arregla» el archivo viejo
// volviendo a escribir el cuerpo ahí, esto se pone rojo y el duplicado no vuelve en silencio.
test('los archivos viejos re-exportan la función canónica, no otra', () => {
  assert.equal(obras.plata, plata)
  assert.equal(obras.plataCorta, plataCorta)
  assert.equal(obras.porcentaje, porcentaje)
  assert.equal(obras.horas, horas)
  assert.equal(obras.hh, hh)
  assert.equal(obras.desvio, desvio)
  assert.equal(obras.cantidad, cantidad)
  assert.equal(obras.fecha, diaMesAnioISO)
  assert.equal(obras.fechaCorta, diaMesISO)
  assert.equal(integraciones.cantidad, cantidad)
  assert.equal(integraciones.dm, diaMesLocal)
  assert.equal(integraciones.dmHora, diaMesAnioLocal)
})
