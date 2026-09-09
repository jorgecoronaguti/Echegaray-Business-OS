import test from 'node:test'
import assert from 'node:assert/strict'

import { filasOcupadas, TITULO_RESPALDO, ubicarRespaldo } from './proveedores-respaldo-fiscal.mjs'
import { ALTO_BLOQUE, bloqueControlArca, FILA_BLOQUE } from '../lib/control-arca-bloque.mjs'
import { RUBROS_COMERCIALES } from '../lib/cruce-arca-compras.mjs'
import { esProsa } from '../lib/diseno-unificado.mjs'
import { nSeccion } from '../lib/proveedores-frontera.mjs'
import { ROTULO_TOTAL_COMERCIALES } from '../lib/proveedores-seccion2-pie.mjs'

/** Una pestaña de mentira: la sección 3 cierra donde se diga, y el bloque va donde se diga. */
function pestana({ filaTotal = 60, filaBloque = 0, sucia = 0 } = {}) {
  const f = Array.from({ length: 120 }, () => [])
  f[0] = ['Proveedores']
  f[filaTotal - 1] = [ROTULO_TOTAL_COMERCIALES, null, 209_231_271, 105]
  if (filaBloque) f[filaBloque - 1] = [`${nSeccion('respaldoFiscal')} · ${TITULO_RESPALDO}`]
  if (sucia) f[sucia - 1] = ['algo de otro dueño']
  return f
}

test('el bloque se ancla al rótulo con el que cierra la sección 3, con UNA fila de aire', () => {
  const s = ubicarRespaldo(pestana({ filaTotal: 60 }))
  assert.equal(s.filaTotal, 60)
  assert.equal(s.fila0, 62, 'una fila vacía entre el TOTAL y el título del bloque')
  assert.equal(s.existe, false)
  assert.equal(s.mueve, 0)
})

// ═══ SIN ANCLA NO SE ESCRIBE: ES LA MISMA REGLA DE LAS OTRAS DOS SECCIONES DE ESTA PESTAÑA ═══
//
// La sección 3 es una dinámica y su alto cambia con cada proveedor nuevo. Un bloque que se ubica por
// un número de fila escribe encima del cuadro el primer día que aparece un proveedor.
test('sin el cierre de la sección 3 NO se escribe: una posición supuesta pisa la dinámica', () => {
  assert.throws(() => ubicarRespaldo([['Proveedores'], ['x']]), /NO escribo/)
  assert.throws(() => ubicarRespaldo([]), /no encontré/)
})

test('un bloque ARRIBA del cierre de la sección 3 frena la corrida en vez de escribir al revés', () => {
  assert.throws(() => ubicarRespaldo(pestana({ filaTotal: 60, filaBloque: 30 })), /ARRIBA del cierre/)
})

test('IDEMPOTENTE: si ya está donde va, no mueve una sola fila', () => {
  const s = ubicarRespaldo(pestana({ filaTotal: 60, filaBloque: 62 }))
  assert.equal(s.existe, true)
  assert.equal(s.mueve, 0)
})

// ═══ EL AIRE SE DEVUELVE, NO SE ACUMULA (es el defecto que ya tuvo la sección 2) ═══
//
// La dinámica de arriba se achica y el bloque queda flotando quince filas más abajo. Si nadie mide
// esa distancia, la pestaña se lee con un agujero — que es exactamente lo que el dueño reporta como
// "roto" — y el agujero sólo puede crecer.
test('la dinámica se achica y el bloque devuelve el aire que quedó de más', () => {
  const s = ubicarRespaldo(pestana({ filaTotal: 60, filaBloque: 75 }))
  assert.equal(s.mueve, -13, 'sobran 13 filas de aire: quedan 14 en blanco y tiene que quedar 1')
  assert.equal(s.fila0, 62)
})

test('la dinámica crece y el bloque se corre: se inserta el aire que falta', () => {
  // El pie de la dinámica quedó pegado al título del bloque: cero filas de aire.
  const s = ubicarRespaldo(pestana({ filaTotal: 60, filaBloque: 61 }))
  assert.equal(s.mueve, 1)
})

test('NO se escribe encima de otro dueño: la primera corrida mira las ocho filas antes de tocarlas', () => {
  const limpia = pestana({ filaTotal: 60 })
  assert.deepEqual(filasOcupadas(limpia, { fila0: 62 }), [])
  const conAlgo = pestana({ filaTotal: 60, sucia: 65 })
  assert.deepEqual(filasOcupadas(conAlgo, { fila0: 62 }), [65])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNA DEFINICIÓN, TRES PESTAÑAS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el bloque es el MISMO de Materiales y Estructura, con el universo comercial de esta pestaña', () => {
  const filas = bloqueControlArca({
    titulo: `${nSeccion('respaldoFiscal')} · ${TITULO_RESPALDO}`,
    rubros: [...RUBROS_COMERCIALES], fila0: 62,
  })
  assert.equal(filas.length, ALTO_BLOQUE)
  assert.equal(filas[FILA_BLOQUE.titulo][0], '4 · RESPALDO FISCAL — contra el libro de IVA de ARCA')
  // Los cuatro rubros comerciales, cada uno con su SUMIFS. Uno que falte deja plata afuera del
  // control sin dar error: da un número más chico.
  const universo = filas[FILA_BLOQUE.universo][1]
  for (const r of RUBROS_COMERCIALES) assert.ok(universo.includes(`"${r}"`), `falta el rubro ${r}: ${universo}`)
  // El pie es un control con su número, no un veredicto en prosa.
  assert.ok(filas[FILA_BLOQUE.veredicto][0].startsWith('⇒ '), filas[FILA_BLOQUE.veredicto][0])
})

test('ni una celda del bloque publica prosa: el contrato de la pestaña no la admite', () => {
  const filas = bloqueControlArca({
    titulo: `${nSeccion('respaldoFiscal')} · ${TITULO_RESPALDO}`,
    rubros: [...RUBROS_COMERCIALES], fila0: 62,
  })
  for (const fila of filas) {
    for (const celda of fila) {
      const p = esProsa(celda)
      assert.equal(p, null, `el bloque publica prosa: ${JSON.stringify(p)}`)
    }
  }
})
