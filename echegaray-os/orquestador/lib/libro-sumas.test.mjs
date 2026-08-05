// EL CONTRATO ENTRE LAS VISTAS Y EL LIBRO — si la pestaña y este mapa divergen, acá se rompe.
//
// La trampa que este archivo mata: LIBRO.col es una COPIA del ENCABEZADO que escribe
// libro-movimientos-pestana.mjs (el script no se puede importar: ejecuta main() al cargarse). Una
// copia sin test es una segunda fuente de verdad — si alguien inserta una columna en la pestaña,
// todas las vistas leerían la columna corrida SIN UN SOLO ERROR, que es el modo de falla más caro
// del repo. El test lee el fuente del script y compara posición por posición.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIBRO, rangoLibro, terminoLibro, formulaLibro } from './libro-sumas.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

test('LIBRO.col espeja el ENCABEZADO real de libro-movimientos-pestana.mjs, posición por posición', () => {
  const fuente = fs.readFileSync(path.join(AQUI, '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  const m = fuente.match(/const ENCABEZADO = \[([\s\S]*?)\]/)
  assert.ok(m, 'no encontré el ENCABEZADO en el script — si lo renombraron, este contrato quedó ciego')
  const encabezado = m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1))
  const esperado = ['Fecha', 'Signo', 'Importe', 'Moneda', 'Concepto', 'Rubro', 'Actividad', 'Estado',
    'Instrumento', 'Contraparte', 'CUIT', 'Comprobante', 'Obra', 'Origen', 'Fila', 'Clave']
  assert.deepEqual(encabezado, esperado, 'el ENCABEZADO de la pestaña cambió: hay que actualizar LIBRO.col y TODAS las vistas que leen el libro')
  // Y las letras del mapa apuntan a esas posiciones exactas.
  const letra = (i) => String.fromCharCode(65 + i)
  const posiciones = { fecha: 0, signo: 1, importe: 2, rubro: 5, estado: 7, instrumento: 8, obra: 12, origen: 13 }
  for (const [campo, i] of Object.entries(posiciones)) {
    assert.equal(LIBRO.col[campo], letra(i), `LIBRO.col.${campo} tiene que ser la columna ${letra(i)} ("${esperado[i]}")`)
  }
})

test('rango abierto: sin tope de fila, para que el libro pueda crecer sin dejar celdas afuera', () => {
  assert.equal(rangoLibro('A'), "_MOVIMIENTOS!$A$2:$A")
  assert.ok(!/\$A\$\d+:\$A\$\d+/.test(rangoLibro('A')), 'un tope escrito hoy es la fila 200 de Cobranzas de nuevo')
})

test('el término lleva SIEMPRE la guarda ISNUMBER(fecha): una celda vacía compara como serial 0', () => {
  const t = terminoLibro({ desde: '0', signo: -1 })
  assert.ok(t.includes('ISNUMBER(_MOVIMIENTOS!$A$2:$A)'), t)
})

test('ventana + signo + estados: la forma que usan las tres vistas', () => {
  const t = terminoLibro({ desde: 'B$3', hasta: 'B$3+7', signo: 1, estados: ['PROYECTADO', 'VENCIDO'] })
  assert.equal(t,
    'SUMPRODUCT(ISNUMBER(_MOVIMIENTOS!$A$2:$A)'
    + '*(_MOVIMIENTOS!$A$2:$A>=B$3)'
    + '*(_MOVIMIENTOS!$A$2:$A<B$3+7)'
    + '*(_MOVIMIENTOS!$B$2:$B=1)'
    + '*((_MOVIMIENTOS!$H$2:$H="PROYECTADO")+(_MOVIMIENTOS!$H$2:$H="VENCIDO"))'
    + '*N(_MOVIMIENTOS!$C$2:$C)*N(_MOVIMIENTOS!$B$2:$B))')
})

test('medida: neto multiplica por el signo, magnitud no — y neto es el default', () => {
  assert.ok(terminoLibro({}).endsWith('*N(_MOVIMIENTOS!$C$2:$C)*N(_MOVIMIENTOS!$B$2:$B))'))
  assert.ok(terminoLibro({ medida: 'magnitud' }).endsWith('*N(_MOVIMIENTOS!$C$2:$C))'))
})

test('formulaLibro es el término con su =, sin nada más', () => {
  const f = formulaLibro({ signo: -1 })
  assert.ok(f.startsWith('=SUMPRODUCT('))
  assert.equal(f.slice(1), terminoLibro({ signo: -1 }))
})
