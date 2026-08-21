// LA FICHA DEL PROVEEDOR, PROBADA CONTRA LOS CASOS QUE LA HACEN MENTIR.
//
// Ninguno de estos tests describe lo que el código hace: cada uno reproduce una forma concreta de
// publicar un número falso en la pantalla de un proveedor. Si se revierte la línea que lo evita,
// el test se pone rojo.
//
// Los datos son los reales de `costos_obra` (medido el 21/08/2026): el concepto viene como
// «Galpon 7 — ART PLOMERIA», el total puede ser `null`, hay notas de crédito y hay filas cuya
// `obra_texto` no es una obra.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  comprasPorObra, conceptosProvistos, resumirProveedor, textosCrudosDe,
  type ComprobanteProveedor,
} from './fichaProveedor.ts'

const c = (p: Partial<ComprobanteProveedor> = {}): ComprobanteProveedor => ({
  id: Math.random().toString(36).slice(2),
  fecha: '2026-03-04', comprobante: '0003-00018497', tipo: 'F A',
  obra_texto: 'LA ESTRELLA', concepto: 'Galpon 7 — ART PLOMERIA', modalidad: 'Pago',
  total: 1000, ...p,
})

test('un proveedor sin comprobantes no compró $ 0: no compró nada que se sepa', () => {
  const r = resumirProveedor([])
  assert.equal(r.comprado, null, 'inventó un cero donde no hay dato')
  assert.equal(r.comprobantes, 0)
  assert.equal(r.ultima, null)
})

test('un comprobante SIN IMPORTE no suma cero al total: se cuenta aparte y se puede decir', () => {
  const r = resumirProveedor([c({ total: 500 }), c({ total: null }), c({ total: null })])
  assert.equal(r.comprado, 500, 'los remitos sin importe se colaron como $ 0 en el total')
  assert.equal(r.sinImporte, 2, 'el total de arriba no puede tapar que dos no tienen importe')
  assert.equal(r.comprobantes, 3)
})

test('la última compra es la fecha MÁXIMA, aunque las filas lleguen desordenadas', () => {
  // Esto es lo que `proveedoresService.getComprasDelProveedor` declaraba como imposible: la vista
  // `proveedor_nombre_resuelto` publica comprobantes y total, pero no la fecha. Leyendo
  // `costos_obra` directo la fecha existe — y tiene que salir del máximo, no de la primera fila.
  const r = resumirProveedor([
    c({ fecha: '2026-02-10' }), c({ fecha: '2026-08-21' }), c({ fecha: '2026-05-01' }),
  ])
  assert.equal(r.ultima, '2026-08-21', 'tomó la fecha de la primera fila en vez de la más nueva')
  assert.equal(r.primera, '2026-02-10')
})

test('una nota de crédito RESTA y no se descarta por ser negativa', () => {
  const r = resumirProveedor([c({ total: 1000 }), c({ total: -300, tipo: 'N C' })])
  assert.equal(r.comprado, 700, 'la nota de crédito se sumó como compra o se tiró a la basura')
})

test('los comprobantes sin obra imputada se cuentan: es la excepción que la ficha tiene que decir', () => {
  const r = resumirProveedor([c(), c({ obra_texto: null }), c({ obra_texto: '   ' })])
  assert.equal(r.sinImputar, 2, 'una obra vacía de espacios pasó como obra imputada')
})

test('la obra sin imputar aparece en el desglose, no se esconde para que "cierre"', () => {
  const filas = [c({ obra_texto: 'LA ESTRELLA', total: 800 }), c({ obra_texto: null, total: 200 })]
  const porObra = comprasPorObra(filas)
  assert.equal(porObra.length, 2, 'se perdió la fila sin obra y la suma dejó de dar el total')
  const suelta = porObra.find((o) => o.obra === null)
  assert.ok(suelta, 'la fila sin obra desapareció del desglose')
  assert.equal(suelta.total, 200)
  assert.equal(
    porObra.reduce((a, o) => a + (o.total ?? 0), 0),
    resumirProveedor(filas).comprado,
    'el desglose no suma lo mismo que el titular',
  )
})

test('la participación es una fracción 0–100 aun con notas de crédito de por medio', () => {
  // Con el neto como base, una obra con crédito neto negativo daba una barra de ancho negativo y
  // otra de 400%: la barra es lo único que la regla del sistema permite dibujar SI el número es una
  // fracción, y una fracción fuera de 0–100 no es una fracción.
  const porObra = comprasPorObra([
    c({ obra_texto: 'A', total: 1000 }),
    c({ obra_texto: 'B', total: 500 }),
    c({ obra_texto: 'B', total: -1200 }),
  ])
  for (const o of porObra) {
    if (o.participacion === null) continue
    assert.ok(Number.isFinite(o.participacion), `participación no finita en ${o.obra}`)
    assert.ok(o.participacion >= 0 && o.participacion <= 100, `${o.obra} quedó fuera de 0–100`)
  }
})

test('sin ningún importe cargado no hay participación: no se dibuja una barra inventada', () => {
  const porObra = comprasPorObra([c({ obra_texto: 'A', total: null })])
  assert.equal(porObra[0].participacion, null, 'dibujó una barra sobre una división por cero')
  assert.equal(porObra[0].total, null, 'un importe ausente se volvió $ 0')
})

test('el concepto se agrupa VERBATIM: no se parte por el guión para inventar un rubro', () => {
  const lista = conceptosProvistos([
    c({ concepto: 'Galpon 7 — ART PLOMERIA', fecha: '2026-01-02' }),
    c({ concepto: 'Galpon 7 — ART PLOMERIA', fecha: '2026-06-30' }),
    c({ concepto: 'Galpon 7 — TERMOTANQUE', fecha: '2026-02-02' }),
    c({ concepto: '   ' }),
  ])
  assert.equal(lista.length, 2, 'agrupó por la izquierda del guión, que a veces es un lugar')
  assert.equal(lista[0].concepto, 'Galpon 7 — ART PLOMERIA')
  assert.equal(lista[0].comprobantes, 2)
  assert.equal(lista[0].ultima, '2026-06-30', 'la última vez no es la de la primera fila')
})

test('el cruce con Compras usa la normalización de la base, no una comparación de texto', () => {
  // El Sheet trae el nombre a mano: mayúsculas cambiadas, espacios de más, espacios al final.
  // `normalizar_nombre_proveedor` en Postgres hace upper + trim + colapso de espacios, y este
  // módulo tiene que dar exactamente lo mismo o el comprobante queda huérfano en la ficha.
  const crudos = ['  corralon   progreso ', 'Corralon Progreso', 'CORRALON DEL CENTRO', null]
  const encontrados = textosCrudosDe(['CORRALON PROGRESO'], crudos)
  assert.equal(encontrados.length, 2, 'una grafía distinta del mismo proveedor quedó afuera')
  assert.ok(encontrados.includes('  corralon   progreso '))
  assert.ok(!encontrados.includes('CORRALON DEL CENTRO'), 'trajo comprobantes de OTRO proveedor')
})

test('sin nombres vinculados no se traen comprobantes: un filtro vacío traería los de todos', () => {
  assert.deepEqual(textosCrudosDe([], ['Corralon Progreso']), [])
  assert.deepEqual(textosCrudosDe(['   '], ['Corralon Progreso']), [])
})
