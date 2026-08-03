// EL SUBTÍTULO DE "CARGAS SOCIALES" CRUZA UNA FUENTE VIVA CON UNA CONGELADA.
//
// Compras se mueve todos los días; el F931 sale de los PDF del data room y se queda en el último
// período presentado. Un MAX sobre las dos —el arreglo "obvio" cuando se sacó la fecha de la
// corrida— es PEOR que el texto estampado: pone la fecha de Compras arriba del cuadro "declarado en
// las DDJJ F931", que hace un mes y medio que no cambia. Eso es lo que estos tests impiden.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla } from './cargas-sociales-pestana.mjs'

const periodos = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const conceptos = [
  { codigo: '301', rotulo: 'Aportes de Seguridad Social (301)', corto: 'Aportes de Seguridad Social' },
  { codigo: '351', rotulo: 'Contribuciones de Seguridad Social (351)', corto: 'Contribuciones de Seguridad Social' },
]
const C = {
  total: 'O', cliente: 'F', detalle: 'G', fecha: 'AD', rubro: 'K', proveedor: 'E', fechaFactura: 'C',
}
const g = grilla({ periodos, conceptos, ps: [], C })
const subtitulo = String(g.filas[1][0])

test('el subtítulo es una FÓRMULA: un texto queda clavado en el día de la corrida', () => {
  assert.ok(subtitulo.startsWith('='), `el subtítulo volvió a ser texto: ${subtitulo.slice(0, 80)}`)
})

test('no hay ninguna fecha estampada adentro', () => {
  assert.doesNotMatch(subtitulo.replace(/"dd\/mm"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/)
})

test('cada fuente declara SU fecha: no hay un MAX que le preste frescura a la congelada', () => {
  assert.match(subtitulo, /"DDJJ F931 al "/, 'el F931 tiene que declarar la suya')
  assert.match(subtitulo, /"Compras al "/, 'y Compras la suya')
  // El defecto que esto ataja: una sola fecha para las dos.
  assert.doesNotMatch(subtitulo, /"al "&TEXT\(MAX\(/, 'volvió a resumir las dos fuentes en una sola fecha')
})

test('el F931 declara su PERÍODO, no el día en que se leyó el PDF', () => {
  // Una DDJJ de junio presentada el 16/07 habla de junio: decir "al 16/07" sería declarar frescura
  // de la gestión administrativa, no del dato.
  assert.match(subtitulo, /EOMONTH\(/, 'el período tiene que declararse como el último día que cubre')
  assert.match(subtitulo, /_F931_RAW!\$A\$4:\$A/)
  // Y sin DATEVALUE: en un libro es-AR puede leer el ISO como dd/mm y devolver otro mes SIN error.
  // Se mira sólo el tramo del F931 — en el de Compras el DATEVALUE es correcto y necesario, porque
  // esa columna sí trae fechas tipeadas "dd/mm/aaaa" que un MAX crudo ignoraría en silencio.
  const tramoF931 = subtitulo.split('&" · "&').find((t) => t.includes('_F931_RAW')) ?? ''
  assert.doesNotMatch(tramoF931, /DATEVALUE/, 'el período del F931 no puede depender del locale del libro')
  assert.match(tramoF931, /DATE\(VALUE\(LEFT\(/)
})

test('la fuente mensual avisa con su propio umbral, o el ⚠ estaría prendido siempre', () => {
  assert.match(subtitulo, />45;/, 'el F931 tiene que usar el umbral mensual')
  assert.match(subtitulo, />7;/, 'y Compras el diario')
})

test('la columna de fecha de Compras se coacciona: mezcla serial y texto tipeado', () => {
  // Un MAX crudo ignora el texto EN SILENCIO y se queda con la última fecha que por casualidad entró
  // como número — justo las filas cargadas a mano quedan afuera.
  assert.match(subtitulo, /IFERROR\(DATEVALUE\(Compras!\$AD\$4:\$AD&""\);N\(Compras!\$AD\$4:\$AD\)\)/)
})

test('la fuente sin datos lo dice, y no muestra el 31/01/1900 que da EOMONTH(0;0)', () => {
  assert.match(subtitulo, /"DDJJ F931 sin datos"/)
})

test('separador es-AR en la parte calculada: una coma parte la fórmula', () => {
  const soloCalculo = subtitulo.replace(/"(?:[^"]|"")*"/g, '')
  assert.doesNotMatch(soloCalculo, /,/, `hay una coma separando argumentos: ${soloCalculo}`)
})
