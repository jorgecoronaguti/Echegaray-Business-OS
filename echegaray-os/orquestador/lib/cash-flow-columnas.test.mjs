import test from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_META, columnasMeta, indiceMeta, anchoConMeta, bandasMeta } from './cash-flow-columnas.mjs'

test('la geometría se pide, no se calcula: el primer metadato va después de A + períodos + total', () => {
  // Semanal con 13 semanas: A(0) · B..N los períodos (1..13) · O el total (14) · P el primer metadato.
  assert.equal(indiceMeta('semanal', 'naturaleza', 13), 15)
  assert.equal(indiceMeta('semanal', 'donde', 13), 16)
  // Mensual con 12 meses: A(0) · B..M (1..12) · N el total (13) · O en adelante los metadatos.
  assert.equal(indiceMeta('mensual', 'naturaleza', 12), 14)
  assert.equal(indiceMeta('mensual', 'origen', 12), 18)
})

test('el ancho del rectángulo sale de la misma lista que los índices', () => {
  for (const periodo of ['semanal', 'mensual']) {
    for (const n of [8, 12, 13, 53]) {
      const cols = columnasMeta(periodo)
      assert.equal(anchoConMeta(periodo, n), n + 2 + cols.length)
      // El último índice tiene que caer justo adentro del rectángulo. Uno de más y la piel pinta la
      // nada; uno de menos y la última columna queda sin formato declarado.
      assert.equal(indiceMeta(periodo, cols.at(-1).clave, n), anchoConMeta(periodo, n) - 1)
    }
  }
})

test('una clave que no existe rompe, no devuelve -1', () => {
  // Un -1 escribiría al final del array y el defecto aparecería tres pasos más allá, con la columna
  // equivocada llena de glosas. Que reviente acá es la única forma de que se vea dónde está.
  assert.throws(() => indiceMeta('semanal', 'real', 13), /no existe/)
  assert.throws(() => columnasMeta('trimestral'), /no hay columnas/)
})

test('toda columna declara especie y ancho, y el texto nunca entra en 96 px', () => {
  for (const [periodo, cols] of Object.entries(COLUMNAS_META)) {
    const claves = new Set()
    for (const c of cols) {
      assert.ok(['texto', 'moneda'].includes(c.tipo), `${periodo}/${c.clave}: especie "${c.tipo}" desconocida`)
      assert.ok(c.titulo && c.px > 0, `${periodo}/${c.clave}: sin título o sin ancho`)
      // 96 px es el ancho de una columna de período. Una glosa de la naturaleza mide ~43 caracteres:
      // ahí nacían los "texto_cortado". Una columna de texto tiene que pedir su lugar.
      if (c.tipo === 'texto') assert.ok(c.px >= 250, `${periodo}/${c.clave}: ${c.px} px cortan la glosa`)
      assert.ok(!claves.has(c.clave), `${periodo}: la clave "${c.clave}" está dos veces`)
      claves.add(c.clave)
    }
  }
})

test('bandasMeta devuelve exactamente lo que la piel necesita, sin recalcular nada', () => {
  const b = bandasMeta('mensual', 12)
  assert.deepEqual(b.map((x) => x.indice), [14, 15, 16, 17, 18])
  assert.deepEqual(b.map((x) => x.tipo), ['texto', 'texto', 'moneda', 'moneda', 'texto'])
  // El semanal no lleva Real/Proyectado: sus 13 columnas son todas presente o futuro, así que separar
  // "lo real del año" no significa nada ahí.
  assert.deepEqual(bandasMeta('semanal', 13).map((x) => x.clave), ['naturaleza', 'donde'])
})
