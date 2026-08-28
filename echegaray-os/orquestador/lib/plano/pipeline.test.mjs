// C3 · LA MISMA PIEZA VISTA EN DOS VISTAS ES UNA PIEZA, NO DOS.
//
// El defecto medido: la fusión deduplicaba por `String(e.id)` EXACTO y el id lo escribe el modelo
// mirando cada vista por separado. `PUERTA_BLINDEX` y `PUERTA-BLINDEX` difieren en un signo, y
// sobre la corrida real de Quattropani CINCO grupos llegaban a tener cantidad computada dos veces:
// cuatro puertas blindex donde hay dos, dos tanques, dos rampas, dos portones, dos garitas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fusionarElementos, parecidosSinFusionar, tipoObraDe } from './pipeline.mjs'
import { FUENTE } from './fuente.mjs'

const el = (id, nombre, dims = {}, vista = 'PLANTA', forma = 'conteo') => ({
  id, nombre, forma,
  dimensiones: Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, { valor: v, unidad: 'm' }])),
  evidencia: { vista, textoLiteral: `${nombre} en ${vista}` },
})

test('C3 · dos ids que difieren en un signo son UNA pieza, no dos', () => {
  const r = fusionarElementos([el('PUERTA_BLINDEX', 'Puerta Blindex', {}, 'CORTE B-B'), el('PUERTA-BLINDEX', 'Puerta Blindex', {}, 'PLANTA BAJA')])
  assert.equal(r.length, 1, 'contarlas dos veces son cuatro puertas donde hay dos')
  assert.deepEqual(r.ambiguos[0].ids, ['PUERTA-BLINDEX', 'PUERTA_BLINDEX'])
  assert.match(r.ambiguos[0].porQue, /Se computó UNA sola/)
})

test('C3 · la unión se PROPAGA: A≡B por nombre y B≡C por id hace que los tres sean uno', () => {
  const r = fusionarElementos([
    el('CORR140', 'Correas C140', {}, 'PLANTA'),
    el('correas-C140', 'Correas C140', {}, 'CORTE'),
    el('CORREAS-C140', 'Correa metálica C140', {}, 'DETALLE'),
  ])
  assert.equal(r.length, 1, 'sin propagar, con una sola clave, quedaban dos')
})

test('C3 · dos vistas parciales COMPLETAN una entera, y gana la que resolvió más', () => {
  const r = fusionarElementos([
    el('C1', 'Columna C1', { ancho: 0.3 }, 'PLANTA'),
    el('c1', 'Columna C1', { ancho: 0.3, alto: 0.5, largo: 3.5 }, 'PLANILLA'),
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].dimensiones.largo.valor, 3.5)
  assert.deepEqual(r[0].vistoEn, ['PLANILLA', 'PLANTA'])
})

test('C3 · el mismo id con nombres distintos SIGUE fusionando — cambiar de clave sin unir rompe esto', () => {
  const r = fusionarElementos([el('B1', 'Base B1', {}, 'PLANTA'), el('B1', 'Base de hormigón B1', {}, 'CORTE')])
  assert.equal(r.length, 1)
})

test('C3 · dos piezas que el plano separó a propósito NO se fusionan', () => {
  const r = fusionarElementos([el('VA1', 'Viga VA1'), el('VA2', 'Viga VA2')])
  assert.equal(r.length, 2, 'comparten todo menos un dígito, y ese dígito es la diferencia')
})

test('C3 · el resultado es TOTAL: dos órdenes distintos dan la misma lista', () => {
  const a = [el('T1', 'Tanque'), el('t-1', 'Tanque'), el('X', 'Otro')]
  assert.deepEqual(fusionarElementos(a).map((x) => x.id), fusionarElementos([...a].reverse()).map((x) => x.id))
})

test('C3 · los PARECIDOS por paráfrasis se declaran y NO se fusionan', () => {
  // Normalizar caza «PUERTA_BLINDEX» con «PUERTA-BLINDEX»; no caza «Tanque de reserva 600 litros»
  // con «Tanque de agua 600 litros». Fusionar dos piezas parecidas borraría una partida entera.
  const p = parecidosSinFusionar([
    { id: 'TANQUE', nombre: 'Tanque de reserva 600 litros', forma: 'conteo', evidencia: { vista: 'PLANTA' } },
    { id: 'TQ2', nombre: 'Tanque de agua 600 litros', forma: 'conteo', evidencia: { vista: 'CORTE' } },
  ])
  assert.equal(p.length, 1)
  assert.equal(p[0].fusionadas, false)
  assert.ok(p[0].parecido > 0.5)
  assert.match(p[0].porQue, /NO se fusionaron/)
})

test('C3 · dos piezas con numeración distinta NO entran al balde de parecidos', () => {
  const p = parecidosSinFusionar([
    { id: 'C1', nombre: 'Columna de hormigón C1', forma: 'prisma' },
    { id: 'C2', nombre: 'Columna de hormigón C2', forma: 'prisma' },
  ])
  assert.equal(p.length, 0, 'el proyectista las separó a propósito')
})

test('el tipo de obra sale del contenido antes que del nombre del archivo, y el nombre es INFERIDO', () => {
  const delPlano = tipoObraDe([{ proyecto: { destino: 'Galpón industrial' }, archivo: 'A.pdf' }])
  assert.equal(delPlano.fuente, FUENTE.EXTRAIDO_PLANO)
  const delNombre = tipoObraDe([], null, ['ESTRUCTURA Galpon FRANCO.dwg'])
  assert.equal(delNombre.fuente, FUENTE.INFERIDO)
  assert.equal(tipoObraDe([], null, ['algo.pdf']).esGalpon, false)
})
