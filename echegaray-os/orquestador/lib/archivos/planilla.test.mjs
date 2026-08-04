// LA CONVERSIÓN QUE SE PUEDE HACER MAL SIN QUE NADA GRITE.
//
// El caso que gobierna este archivo: una celda de Excel con el número 1234.56 volcada cruda da la
// cadena "1234.56", y el parser del extracto —que lee a la argentina— la entiende como 123.456. No
// da error. Da un importe MIL VECES más grande y un saldo que no cierra. Lo mismo con las fechas: un
// Date volcado en formato ISO se lee como otra cosa, o no se lee.
//
// Y el segundo caso: NO todo lo que tiene fechas y números es un extracto bancario. Una lista de
// pedidos de materiales también. Anunciar "leí 3 movimientos bancarios" sobre una lista de materiales
// sería inventar.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  numeroEsAr, fechaEsAr, celdaATexto, filasATexto, filasDeTexto, leerPlanilla, pareceExtractoBancario,
} from './planilla.mjs'

test('LA TRAMPA DEL NÚMERO: un número de Excel se escribe en es-AR, no crudo', () => {
  assert.equal(numeroEsAr(1234.56), '1.234,56')
  assert.equal(numeroEsAr(-234567.89), '-234.567,89')
  // Y la prueba de que importa: el parser del extracto lee eso y da el número correcto.
  assert.equal(celdaATexto(1234.56), '1.234,56')
})

test('LA TRAMPA DE LA FECHA: un Date se escribe DD/MM/AAAA y en UTC', () => {
  // `cellDates` de xlsx construye la fecha en UTC. Leerla en hora local corre un día para cualquiera
  // al oeste de Greenwich, o sea para toda la Argentina.
  assert.equal(fechaEsAr(new Date(Date.UTC(2026, 6, 22))), '22/07/2026')
  assert.equal(fechaEsAr(new Date(Date.UTC(2026, 0, 5))), '05/01/2026')
  assert.equal(fechaEsAr('no soy una fecha'), '')
})

test('un `;` adentro de una celda no puede partir la fila en dos columnas', () => {
  assert.equal(celdaATexto('Pago a Juan; y a Pedro').includes(';'), false)
  assert.match(celdaATexto('Pago a Juan; y a Pedro'), /^Pago a Juan\s+y a Pedro$/)
})

test('filasATexto arma el CSV es-AR que el motor del extracto ya sabe leer', () => {
  const t = filasATexto([
    ['Fecha', 'Referencia', 'Concepto', 'Importe', 'Saldo'],
    [new Date(Date.UTC(2026, 6, 22)), '000008689', 'Transferencia recibida', 1234567.89, 5000000],
    [null, null, null, null, null], // una fila vacía no aporta y no se propaga
  ])
  assert.match(t, /22\/07\/2026;000008689;Transferencia recibida;1\.234\.567,89;5\.000\.000,00/)
  assert.equal(t.split('\n').length, 2, 'la fila vacía se descarta')
})

test('EL CASO DEL DUEÑO, de punta a punta: el CSV del homebanking se reconoce como extracto', () => {
  const csv = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '22/07/2026;0133;CENTRO;001;000008689;Transferencia recibida - Quattropani;1.000.000,00;5.000.000,00',
    '23/07/2026;0133;CENTRO;002;000008690;Pago proveedores;(500.000,00);4.500.000,00',
  ].join('\n')
  const r = pareceExtractoBancario(csv)
  assert.equal(r.esExtracto, true)
  assert.equal(r.movimientos.length, 2)
  // Los paréntesis son un DÉBITO: sin eso el egreso entra positivo y el saldo no cierra.
  assert.equal(r.movimientos[1].importe, -500000)
  // La referencia se normaliza sin ceros a la izquierda: es la clave con la que se deduplica, y la
  // base la guarda así. Comparadas crudas, "000008689" y "8689" serían dos movimientos distintos.
  assert.equal(r.movimientos[0].referencia, '8689')
  assert.equal(r.cadena.ok, true, 'la cadena de saldos cierra: 5.000.000 − 500.000 = 4.500.000')
})

test('una cadena de saldos ROTA se detecta y se declara', () => {
  const csv = [
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '22/07/2026;0133;C;001;000001;Transferencia recibida;1.000.000,00;5.000.000,00',
    '23/07/2026;0133;C;002;000002;Pago proveedores;(500.000,00);4.000.000,00',
  ].join('\n')
  const r = pareceExtractoBancario(csv)
  assert.equal(r.esExtracto, true)
  assert.equal(r.cadena.ok, false)
  assert.equal(r.cadena.cortes.length, 1)
})

test('UNA LISTA DE MATERIALES NO ES UN EXTRACTO, aunque tenga fechas e importes', () => {
  const materiales = [
    'Fecha;Material;Cantidad;Precio',
    '22/07/2026;Cemento Loma Negra;100;15.000,00',
    '23/07/2026;Hierro del 8;250;28.500,00',
  ].join('\n')
  const r = pareceExtractoBancario(materiales)
  // MEDIDO: el parser SÍ le saca movimientos (toma Cantidad y Precio como importe y saldo). Por eso
  // el criterio no puede ser "¿se parsearon movimientos?": tiene que nombrar una cuenta.
  assert.ok(r.movimientos.length > 0, 'el parser es tolerante y les saca filas: por eso hace falta el segundo control')
  assert.equal(r.esExtracto, false, 'no nombra saldo, banco ni movimiento de cuenta: no se da por extracto')
  assert.match(r.motivo, /no lo doy por extracto/)
})

test('un texto sin fechas ni importes tampoco', () => {
  const r = pareceExtractoBancario('Hola, te mando la nota de la obra.\nSaludos.')
  assert.equal(r.esExtracto, false)
  assert.equal(r.movimientos.length, 0)
})

test('filasDeTexto describe un CSV sin tener que abrirlo como Excel', () => {
  const filas = filasDeTexto('a;b;c\n1;2;3\n')
  assert.deepEqual(filas, [['a', 'b', 'c'], ['1', '2', '3']])
})

test('UN EXCEL DE VERDAD: se escribe uno, se lee, y sale un extracto reconocido', async () => {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Suc. Origen', 'Desc. Sucursal', 'Cod. Operativo', 'Referencia', 'Concepto', 'Importe', 'Saldo'],
    [new Date(Date.UTC(2026, 6, 22)), '0133', 'CENTRO', '001', '000008689', 'Transferencia recibida', 1000000, 5000000],
    [new Date(Date.UTC(2026, 6, 23)), '0133', 'CENTRO', '002', '000008690', 'Pago proveedores', -500000, 4500000],
  ])
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const p = await leerPlanilla(buf)
  assert.equal(p.ok, true)
  assert.equal(p.hoja, 'Movimientos')

  const r = pareceExtractoBancario(filasATexto(p.filas))
  assert.equal(r.esExtracto, true, 'un Excel del banco tiene que llegar al mismo motor que el CSV')
  assert.equal(r.movimientos.length, 2)
  assert.equal(r.movimientos[0].importe, 1000000, 'si el número se volcara crudo, acá saldría 1 o 100000000')
  assert.equal(r.movimientos[0].fecha, '2026-07-22')
  assert.equal(r.cadena.ok, true)
})

test('UNA PLANILLA CORRUPTA devuelve {ok:false} con su motivo, no una excepción', async () => {
  // Un xlsx truncado a mitad de camino: el contenedor ZIP arranca y adentro no hay nada válido. Es
  // el modo de falla real de una subida cortada.
  const r = await leerPlanilla(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('xl/workbook.xml basura')]))
  assert.equal(r.ok, false)
  assert.match(r.error, /no pude abrir la planilla/)
})
