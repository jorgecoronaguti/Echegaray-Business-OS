import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rangosDe, ultimaFilaDeTabla, contarConDato } from './auditar-rangos-fosilizados.mjs'
import { clasificarNombrados } from '../lib/rangos-con-nombre.mjs'
import { mientenPorEspecie } from '../lib/rangos-nombrados.mjs'
import { PASOS, esReporte } from '../lib/flujo-caja-pasos.mjs'

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

// ═══ LA SEGUNDA MITAD DEL AUDITOR: LOS RANGOS CON NOMBRE (03/08) ═══
test('cuenta las celdas con dato de un rango con nombre, y la fórmula cuenta como dato', () => {
  const grilla = { filas: [[{ valor: 'Banco' }], [{ formula: '=1' }], [{ valor: '' }], [{}]] }
  // Filas 2-4 (0-based 1..3): una fórmula, una cadena vacía y una celda sin nada.
  assert.deepEqual(contarConDato(grilla, { startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }),
    { con: 1, total: 3 })
})

test('UN RANGO CIEGO DA CERO CELDAS CON DATO — es el caso de OFICINA_BANCO', () => {
  const grilla = { filas: [[{ valor: 'Banco' }], [{}], [{}], [{}]] }
  assert.deepEqual(contarConDato(grilla, { startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }),
    { con: 0, total: 3 })
})

test('UN RANGO FUERA DEL TRAMO LEÍDO NO SE DECLARA VACÍO: devuelve null', () => {
  // La trampa del auditor que se cree omnisciente. Si no se miró, la única respuesta honesta es "no
  // verificable" — decir "está vacío" sobre algo que no se leyó es fabricar un hallazgo.
  const grilla = { filas: [[{ valor: 'x' }]] }
  assert.equal(contarConDato(grilla, { startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 1 }), null)
  assert.equal(contarConDato(grilla, { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 90, endColumnIndex: 95 }), null)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA MITAD DE LA PREGUNTA QUE ESTE AUDITOR NO HACÍA (14/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// "Ciego" caza el nombre que apunta a celdas VACÍAS. El defecto de agosto es el gemelo: el nombre que
// apunta a celdas LLENAS DE OTRA COSA. Los doce `ARCA_*` vivían sobre `Proveedores!B124:C129` —la
// tabla de comprobantes faltantes— y para `contarConDato` estaban impecables: 1 de 1 celda con dato.

test('una celda CON dato de otra especie pasa el control de "ciego": por eso hace falta el de especie', () => {
  const grilla = { filas: [[], [], [], [{ valor: '30-56736337-2' }]] }
  const cuenta = contarConDato(grilla, { startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 })
  assert.deepEqual(cuenta, { con: 1, total: 1 }, 'un CUIT es "dato": el auditor viejo lo daba por bueno')
  assert.deepEqual(
    clasificarNombrados([{ nombre: 'ARCA_SIN_CARGAR_N', hoja: 'Proveedores', conDato: 1, celdas: 1 }], ['=ARCA_SIN_CARGAR_N&" comprobantes"'])
      .map((n) => n.estado),
    ['ok'], 'y lo clasificaba OK aunque la fórmula que lo lee muestre un CUIT')

  // La pregunta que faltaba, sobre el MISMO dato.
  const mienten = mientenPorEspecie([{ nombre: 'ARCA_SIN_CARGAR_N', hoja: 'Proveedores', valor: '30-56736337-2' }])
  assert.deepEqual(mienten.map((m) => m.nombre), ['ARCA_SIN_CARGAR_N'])
  assert.equal(mienten[0].espera, 'entero')
})

test('el auditor sale con código ≠0 cuando un nombre miente, no sólo cuando está ciego', () => {
  const SRC = readFileSync(new URL('./auditar-rangos-fosilizados.mjs', import.meta.url), 'utf8')
  assert.match(SRC, /if \(ciegos\.length \|\| mienten\.length\) process\.exitCode = 1/,
    'un nombre que publica un CUIT donde promete plata tiene que poner el auditor en rojo')
  assert.match(SRC, /mientenPorEspecie\(conValor\)/)
})

test('el auditor CORRE en el pipeline y es un REPORTE: si hay que tipearlo, no existe', () => {
  assert.ok(PASOS.some(([s]) => s === 'auditar-rangos-fosilizados.mjs'),
    'un control que hay que acordarse de correr tiene la misma disponibilidad que el defecto que persigue')
  assert.equal(esReporte('auditar-rangos-fosilizados.mjs'), true,
    'su ≠0 es "encontré rangos que mienten", no "no pude generar los datos": no puede dejar el servicio en rojo ni frenar la frescura')
})
