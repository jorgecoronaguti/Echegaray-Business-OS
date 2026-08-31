// LA HUELLA REPRESENTA EL ESTADO ECONÓMICO — UNA DIMENSIÓN POR VEZ, CON ESCRITURAS REALES.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO VIGILA ═══
//
// Tres corridas con costos directos `null`, $4.947.000 y $5.535.000 firmaban con la MISMA huella:
// `huellaDeEntradas` no incluía `aprendizajes`, `estructuraIndirecta`, `politicaEfectiva` ni
// `estadosDeComposicion`. Dos ofertas con precios distintos y la misma firma.
//
// ═══ LA DIRECCIÓN QUE IMPORTA ═══
//
// `correr(e).huella === correr(e).huella` es una TAUTOLOGÍA: hashea dos veces el mismo objeto. Con
// la huella rota también estaba verde. Acá todo va al revés: entradas DISTINTAS tienen que dar
// huellas DISTINTAS, una dimensión por vez, y al revertir la huella tiene que volver al original.
//
// ═══ LA MUTACIÓN, EJECUTADA (31/08/2026) ═══
//
// Se le sacaron `estadosDeComposicion` y `estructuraIndirecta` a `huellaDeEntradas` y se corrió
// `orquestador/scripts/xsas-freeze-huella.mjs`: CUATRO dimensiones —composicion, hh, indirecto y
// override— pasaron a firmar todas con el mismo sha `2b4d7ab7580c1d68…`. Restaurado el archivo,
// 9/9 verde. El negativo no está declarado: está corrido.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { huellaDeEntradas } from './freeze.mjs'
import { crearBorradorValido } from '../../scripts/xsas-freeze-fixture.mjs'
import { DIMENSIONES, correrDimension } from '../../scripts/xsas-freeze-huella.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** La entrada mínima que sirve de piso para las cuatro entradas que el defecto omitía. */
const BASE = Object.freeze({
  hoy: '2026-08-31',
  partidas: [{ codigo: 'P1', cantidad: 10, unidad: 'm3' }],
  precios: [{ recursoCodigo: 'R1', precio: 1000, moneda: 'ARS', observadoEn: '2026-08-01', fuente: 'remito' }],
})

test('las cuatro entradas que el defecto omitía mueven la huella', () => {
  const base = huellaDeEntradas(BASE).sha256

  // Cada una por separado: si alguna vuelve a quedar afuera de `partes`, sólo ESA se pone roja y el
  // mensaje dice cuál. Un único test con las cuatro juntas diría «algo cambió» y nada más.
  const casos = [
    ['aprendizajes', { ...BASE, aprendizajes: [['rendimiento:P1', '0.85']] }],
    ['estructuraIndirecta', { ...BASE, estructuraIndirecta: { version: 3, conceptos: [1, 2], costoDirectoAnual: 5e8 } }],
    ['politicaEfectiva', { ...BASE, politicaEfectiva: { versionReferenciada: 7, valores: { pctBeneficio: 0.12 } } }],
    ['estadosDeComposicion', { ...BASE, estadosDeComposicion: [['R1', 'EXTRAIDO']] }],
  ]
  for (const [nombre, entrada] of casos) {
    assert.notEqual(huellaDeEntradas(entrada).sha256, base,
      `«${nombre}» NO entra en la huella: dos corridas que difieren sólo en eso firman igual`)
  }

  // Y dos valores distintos de la MISMA entrada tampoco pueden coincidir. Sin esto, bastaría con
  // que la clave existiera en `partes` con un valor constante para que el test de arriba pasara.
  const a = huellaDeEntradas({ ...BASE, estadosDeComposicion: [['R1', 'EXTRAIDO']] }).sha256
  const b = huellaDeEntradas({ ...BASE, estadosDeComposicion: [['R1', 'HISTORICO']] }).sha256
  assert.notEqual(a, b, 'la clave está en la huella pero su VALOR no: EXTRAIDO e HISTORICO firman igual')
})

test('el orden no cambia la huella, pero el contenido sí', () => {
  const uno = huellaDeEntradas({ ...BASE, precios: [
    { recursoCodigo: 'A', precio: 1, moneda: 'ARS', observadoEn: '2026-01-01', fuente: 'f' },
    { recursoCodigo: 'B', precio: 2, moneda: 'ARS', observadoEn: '2026-01-01', fuente: 'f' }] }).sha256
  const otro = huellaDeEntradas({ ...BASE, precios: [
    { recursoCodigo: 'B', precio: 2, moneda: 'ARS', observadoEn: '2026-01-01', fuente: 'f' },
    { recursoCodigo: 'A', precio: 1, moneda: 'ARS', observadoEn: '2026-01-01', fuente: 'f' }] }).sha256
  assert.equal(uno, otro, 'recorrer las mismas partidas en otro orden cambió la huella')
})

test('cada dimensión económica mueve la huella, y al revertir vuelve', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const fx = await crearBorradorValido(c)
    for (let i = 0; i < DIMENSIONES.length; i++) {
      const d = DIMENSIONES[i]
      await t.test(`dimensión ${d.dim} · ${d.porQue}`, async () => {
        const r = await correrDimension(c, fx, d, i)
        assert.equal(r.cambio, true, `«${d.dim}» cambió el estado económico y la huella NO se movió: ${r.base}`)
        assert.equal(r.revierte, true, `revertida «${d.dim}», la huella no volvió al original`)
      })
    }
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
