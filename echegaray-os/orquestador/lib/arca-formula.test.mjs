import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcaPorCuit, arcaPorComprobante, totalLibro } from './arca-formula.mjs'

test('lo facturado por ARCA sale de _ARCA_RAW, no de un número pegado', () => {
  const f = arcaPorCuit('$B31')
  assert.match(f, /^=/)
  assert.match(f, /_ARCA_RAW/)
  // El CUIT de la pestaña lleva guiones y el de la réplica no.
  assert.match(f, /SUBSTITUTE\(\$B31;"-";""\)/)
  // Sólo el libro de COMPRAS: mezclar ventas duplicaría el concepto.
  assert.match(f, /\$B\$4:\$B="Compras"/)
  // Un proveedor sin CUIT no inventa un número: queda vacío.
  assert.match(f, /IF\(\$B31="";""/)
})

test('un comprobante se identifica por CUIT + número + SIGNO', () => {
  // POR QUÉ EL SIGNO: la nota de crédito 0010-00000001 de PEREZ GARCIA tiene el MISMO punto de venta
  // y número que la factura que anula. Sin el signo la fórmula sumaba +21.781 y −21.781 y devolvía
  // $0 — un importe real desaparecido sin ningún error a la vista.
  assert.match(arcaPorComprobante('"23369111574"', '$B110', '-1'), /\$F\$4:\$F=-1/)
  assert.match(arcaPorComprobante('$B134', '$C134', '1'), /\$F\$4:\$F=1/)
})

test('el importe lleva el signo del comprobante, nunca el valor absoluto', () => {
  // Sumar las notas de crédito como compras costó $41,9M de error una vez. No se repite.
  for (const f of [arcaPorCuit('$B31'), totalLibro('Compras'), arcaPorComprobante('$B1', '$C1', '1')]) {
    assert.match(f, /ISNUMBER\(_ARCA_RAW!\$F\$4:\$F\)/)
  }
})

test('la clave del comprobante repone los ceros que la réplica no guarda', () => {
  assert.match(arcaPorComprobante('$B1', '$C1', '1'), /TEXT\(_ARCA_RAW!\$G\$4:\$G;"0000"\)&"-"&TEXT\(_ARCA_RAW!\$H\$4:\$H;"00000000"\)/)
})
