// EL PAPEL TIENE QUE MULTIPLICAR BIEN.
//
// Un presupuesto donde `cantidad × unitario` no da el subtotal impreso se lo desarma el comprador
// con una calculadora. En los tres presupuestos que la empresa ya mandó eso pasaba en dos
// renglones —faltaban $100.000 exactos en cada uno— y nadie lo objetó. Repetirlo a sabiendas sería
// otra cosa. Estas pruebas fijan que no vuelva a salir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cuadrar, pesos, fechaLarga } from './formato-echegaray.mjs'
import { ITEMS, APROBADO_SIN_IVA, NOTAS, PLAZO } from '../../scripts/cotizacion-arcor-23050969.mjs'

test('cada renglón multiplica: cantidad × unitario es el subtotal impreso', () => {
  const c = cuadrar(ITEMS)
  for (const f of c.filas) {
    assert.equal(Math.round(f.unitario * f.cantidad * 100) / 100, f.subtotal,
      `«${f.tarea}»: ${f.cantidad} × ${f.unitario} no da ${f.subtotal}`)
  }
})

test('el cuadro cierra consigo mismo: subtotal + IVA = total', () => {
  const c = cuadrar(ITEMS)
  assert.equal(Math.round((c.subtotal + c.iva) * 100) / 100, c.total)
  assert.equal(c.iva, Math.round(c.subtotal * 21) / 100)
})

test('el precio es EL APROBADO — derivar el unitario no puede mover el total', () => {
  const c = cuadrar(ITEMS)
  // El único movimiento admitido es el redondeo de los unitarios a dos decimales. Un peso de
  // tolerancia sobre casi seis millones: si esto se pone rojo, alguien tocó un precio.
  assert.ok(Math.abs(c.subtotal - APROBADO_SIN_IVA) <= 1,
    `el subtotal ${c.subtotal} se apartó del aprobado ${APROBADO_SIN_IVA}`)
})

test('las notas y el plazo entran en un renglón', () => {
  // El formulario NO parte las notas en dos líneas: un texto largo se sale de la hoja y el defecto
  // no grita. El tope de 100 caracteres es un sustituto del ancho real, calibrado contra el PDF
  // generado: la nota más larga medida ocupó 496,3 pt de los 543,2 disponibles.
  for (const [i, n] of NOTAS.entries()) {
    assert.ok(n.length <= 100, `la nota ${i + 1} mide ${n.length} caracteres y se sale de la hoja`)
  }
  assert.ok(PLAZO.length <= 100, `el plazo mide ${PLAZO.length} caracteres`)
})

test('los importes salen en es-AR: punto de miles y coma decimal', () => {
  assert.equal(pesos(5759101.99), '5.759.101,99')
  assert.equal(pesos(0), '0,00')
})

test('la fecha se escribe como la escribe el original', () => {
  assert.equal(fechaLarga(new Date(2026, 0, 30)), 'San Juan, 30 de enero de 2026')
  assert.equal(fechaLarga(new Date(2026, 7, 21)), 'San Juan, 21 de agosto de 2026')
})
