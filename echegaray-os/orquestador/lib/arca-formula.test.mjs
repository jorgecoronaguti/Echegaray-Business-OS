import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  arcaPorCuit, arcaPorComprobante, totalLibro,
  formulaDebitoArca, formulaCreditoArca, nuncaMenosQue,
} from './arca-formula.mjs'

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

// ── EL IVA DE UN PERÍODO: el insumo del cuadro 4 ─────────────────────────────────────────────────

test('el débito y el crédito del período salen de LIBROS DISTINTOS de la misma réplica', () => {
  // Cruzarlos daría una posición dada vuelta —crédito donde va débito— sin un solo error a la vista.
  assert.match(formulaDebitoArca('2026-07'), /\$B\$4:\$B="Ventas"/)
  assert.match(formulaCreditoArca('2026-07'), /\$B\$4:\$B="Compras"/)
  for (const f of [formulaDebitoArca('2026-07'), formulaCreditoArca('2026-07')]) {
    assert.match(f, /^=SUMPRODUCT\(/)
    assert.match(f, /_ARCA_RAW!\$A\$4:\$A="2026-07"/, 'el período se compara COMO TEXTO')
    assert.match(f, /_ARCA_RAW!\$L\$4:\$L/, 'la columna L es el IVA, no el total')
  }
})

test('el IVA del período también lleva el signo: una nota de crédito RESTA crédito fiscal', () => {
  // Si el IVA no restara, el crédito quedaría inflado y el OS declararía menos impuesto del que hay
  // que pagar. Del lado de Postgres ese mismo defecto valió $7,2M en siete meses.
  for (const f of [formulaDebitoArca('2026-08'), formulaCreditoArca('2026-08')]) {
    assert.match(f, /ISNUMBER\(_ARCA_RAW!\$F\$4:\$F\)/)
  }
})

test('locale es-AR: la fórmula se separa con ";" y no lleva una sola coma', () => {
  // Una coma de argumento escrita por API es un #ERROR en un archivo es_AR.
  const f = formulaCreditoArca('2026-08')
  assert.ok(f.includes(';'))
  assert.ok(!f.includes(','), f)
})

test('nuncaMenosQue combina las dos fórmulas sin dejar un "=" en el medio', () => {
  // Un segundo "=" adentro de MAX() es un #ERROR de sintaxis, y el mes en curso quedaría en rojo.
  const f = nuncaMenosQue('=SUMPRODUCT(A)', '=(N(X))*0,21')
  assert.equal(f, '=MAX(SUMPRODUCT(A);(N(X))*0,21)')
  assert.equal((f.match(/=/g) ?? []).length, 1)
})
