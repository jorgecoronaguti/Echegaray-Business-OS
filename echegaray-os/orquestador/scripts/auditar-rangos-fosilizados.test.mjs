import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rangosDe, ultimaFilaDeTabla } from './auditar-rangos-fosilizados.mjs'

const fila = (...celdas) => celdas
const anchas = (n, desde = 1) => Array.from({ length: n }, (_, i) => (i + 1 >= desde ? fila('a', 'b', 'c', 'd') : []))

test('corta antes del cuadro de control separado por un hueco', () => {
  // Reproduce Tarjeta de Credito: 31 filas de tabla, 2 filas casi vacías, y un cuadro de control
  // ancho debajo. La tabla termina en 31, no en 40.
  const filas = []
  for (let i = 0; i < 31; i++) filas.push(fila('16/1', '=A', 'Modica', '15', '$355'))
  filas.push(fila('', '=x'))       // 32: hueco
  filas.push(fila('', '=x'))       // 33: hueco
  filas.push(fila('CONTROL'))      // 34
  filas.push([]); filas.push([])
  filas.push(fila('Concepto', 'Según pestaña', 'Según banco', 'Diferencia', 'Qué significa')) // 37: ancha
  filas.push(fila('Cuotas', '$1', '$2', '$0', 'nota'))
  assert.equal(ultimaFilaDeTabla(filas, 4), 31)
})

test('un hueco de UNA sola fila no corta: puede ser un separador dentro de la tabla', () => {
  const filas = [...anchas(10), [], ...anchas(5)]
  assert.equal(ultimaFilaDeTabla(filas, 4), 16)
})

test('una tabla contigua sin control da su última fila', () => {
  assert.equal(ultimaFilaDeTabla(anchas(60), 4), 60)
})

test('rangosDe sólo devuelve rangos que recorren filas, no columnas de una fila', () => {
  assert.deepEqual(rangosDe('=SUM($X$61:$AA$61)', 'H'), [])
  const r = rangosDe("=SUMIFS(Compras!$O$4:$O$800;Compras!$AD$4:$AD$800;x)", 'CAJA')
  assert.ok(r.some((x) => x.hoja === 'Compras' && x.fin === 800))
})
