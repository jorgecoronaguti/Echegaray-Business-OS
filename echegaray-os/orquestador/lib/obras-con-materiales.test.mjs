// EL DEFECTO: LA LISTA DE OBRAS ESTABA ESCRITA A MANO Y UN CLIENTE NUEVO NO APARECÍA NUNCA.
//
// El caso real: Quattropani · Melisa García SAS, $32.937.000 en tres comprobantes de Alumetal del
// 29/07/2026 (Compras filas 791-793, rubro "Materiales Civil"). Su plata entraba al total por familia
// pero no tenía columna en el desglose por obra, y la columna "Sin obra" mostraba exactamente esos
// $32.937.000 en el TOTAL POR OBRA. Con la lista escrita a mano, el primer test de acá se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { obrasConMateriales } from './obras-con-materiales.mjs'

const monto = (v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0
const MATERIALES = ['Materiales Civil', 'Materiales Mantenimiento']

/** Una fila de Compras con sólo lo que este cálculo mira: J (obra), O (importe), AC (rubro). */
const fila = (obra, total, rubro = 'Materiales Civil') => {
  const f = []
  f[9] = obra; f[14] = total; f[28] = rubro
  return f
}

// La foto de Compras al 04/08: las ocho asignaciones que el código tenía tipeadas, la novena que
// entró (Quattropani) y el ruido administrativo que NO tiene que generar columna.
const COMPRAS = [
  fila('LA ESTRELLA', '144824649'),
  fila('San Francisco', '32873533'),
  fila('MESSINA', '19903415'),
  fila('ARCOR', '9809137'),
  fila('Administracion', '2176883'),
  fila('Almacen', '1044199', 'Materiales Mantenimiento'),
  fila('Taller', '5534878', 'Materiales Mantenimiento'),
  fila('SAINT GOBAIN', '96800'),
  fila('Quattropani - Melisa García SAS', '1306000'),
  fila('Quattropani - Melisa García SAS', '14982000'),
  fila('Quattropani - Melisa García SAS', '16649000'),
  // Ruido: destinos que existen en la columna J pero nunca llevan material imputado.
  fila('F931', '90000000', 'Cargas sociales'),
  fila('Sueldos', '50000000', 'Nómina · Jornales de obra'),
  fila('UOCRA', '3000000', 'Gremiales'),
  fila('Credito Prendario', '8000000', 'Financiero'),
  fila('Vehiculos / Maquinas', '4000000', 'Estructura'),
]

test('un cliente nuevo con materiales aparece SOLO — es el defecto de Quattropani', () => {
  const obras = obrasConMateriales(COMPRAS, { rubros: MATERIALES, monto })
  assert.ok(obras.includes('Quattropani - Melisa García SAS'),
    'la obra nueva tiene que salir de los datos; con la lista tipeada no salía y el control quedaba en $32.937.000')
})

test('siguen estando las ocho que ya había: derivar no puede perder ninguna', () => {
  const obras = obrasConMateriales(COMPRAS, { rubros: MATERIALES, monto })
  for (const n of ['LA ESTRELLA', 'San Francisco', 'MESSINA', 'ARCOR', 'Administracion', 'Almacen', 'Taller', 'SAINT GOBAIN']) {
    assert.ok(obras.includes(n), `faltó "${n}"`)
  }
  assert.equal(obras.length, 9, 'las ocho de antes más Quattropani, y nada más')
})

test('el ruido administrativo NO genera columna, y el filtro es por rubro, no por lista negra', () => {
  const obras = obrasConMateriales(COMPRAS, { rubros: MATERIALES, monto })
  for (const n of ['F931', 'Sueldos', 'UOCRA', 'Credito Prendario', 'Vehiculos / Maquinas']) {
    assert.ok(!obras.includes(n), `"${n}" no tiene materiales imputados: no es una obra`)
  }
})

test('el orden es por monto: la obra que mueve la plata queda donde el ojo llega primero', () => {
  const obras = obrasConMateriales(COMPRAS, { rubros: MATERIALES, monto })
  assert.equal(obras[0], 'LA ESTRELLA')
  // Quattropani suma $32.937.000 entre sus tres comprobantes: va segunda, arriba de San Francisco.
  assert.equal(obras[1], 'Quattropani - Melisa García SAS')
  assert.equal(obras[2], 'San Francisco')
  assert.equal(obras.at(-1), 'SAINT GOBAIN')
})

test('una asignación escrita con dos grafías es UNA columna, no dos que suman lo mismo', () => {
  // SUMIFS no distingue mayúsculas: dos columnas "Taller" y "TALLER" mostrarían el mismo importe
  // duplicado y el total por obra saldría al doble.
  const obras = obrasConMateriales([fila('Taller', '100', 'Materiales Civil'), fila('TALLER', '900', 'Materiales Civil')],
    { rubros: MATERIALES, monto })
  assert.deepEqual(obras, ['Taller'], 'gana la primera grafía vista')
})

test('una fila de material sin obra imputada no inventa una columna vacía', () => {
  const obras = obrasConMateriales([fila('', '5000'), fila('   ', '5000'), fila('ARCOR', '1')], { rubros: MATERIALES, monto })
  assert.deepEqual(obras, ['ARCOR'])
})
