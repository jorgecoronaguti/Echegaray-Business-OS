/**
 * EL E2E NO PUEDE QUEDARSE VIEJO EN SILENCIO.
 *
 * `tests/liquidacion-fidelidad.spec.ts` enumera A MANO los rótulos que espera ver en el cuadro de
 * la quincena. Cada vez que el dueño pide una columna —«Efect. red.» el 16/09, «Saldo red.» el
 * 16/09— o que se retira otra —«Adelanto banco / embargos», «Adelanto efectivo», «Total efectivo»
 * el 15/09— esa lista queda mintiendo. Un E2E que enumera rótulos que ya no existen no protege
 * nada: falla por viejo, y un test que falla por viejo termina apagado.
 *
 * ESTE CONTROL CRUZA DOS ARTEFACTOS INDEPENDIENTES:
 *   fuente de verdad → los rótulos que el componente REALMENTE dibuja (`PLATA`, `cifra(…)`, bandas)
 *   seguidor         → los literales que el spec dice esperar
 * No es circular: ninguno de los dos lados se genera desde el otro. El componente lo escribe el
 * trabajo del producto; la lista del spec la escribe una persona. Este control existe justamente
 * para que separarse duela.
 *
 * PUEDE DAR ROJO, Y SE LO VIO DAR ROJO: contra el estado del repo al 16/09/2026 fallaba con los
 * cuatro rótulos retirados y los seis que faltaban. MUTACIÓN: sacar cualquier rótulo de `PLATA`
 * y este test se pone en rojo sin tocar el spec.
 *
 * LO QUE ESTE CONTROL NO PRUEBA: que el E2E pase en un navegador. Eso necesita la app viva y
 * Playwright. Prueba que el spec habla de columnas que existen y no se olvida de ninguna.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const GRILLA = leer('../GrillaEspejoQuincena.tsx')
const SPEC = leer('../../../../../../tests/liquidacion-fidelidad.spec.ts')

/** Los rótulos de las columnas, del propio `PLATA`. El ✎ es un adorno de edición, no parte del nombre. */
function rotulosDelCuadro() {
  const plata = GRILLA.slice(GRILLA.indexOf('const PLATA'), GRILLA.indexOf('const ANCHO_DE_BANDA'))
  const rs = [...plata.matchAll(/rotulo: '([^']+)'/g)].map((m) => m[1].replace(' ✎', '').trim())
  assert.ok(rs.length >= 10, `se esperaban las columnas del cuadro, se leyeron ${rs.length}`)
  return rs
}

/** Lo que el pie sabe dibujar, de las llamadas a `cifra(…)`. */
const rotulosDelPie = () => [...GRILLA.matchAll(/cifra\('([^']+)'/g)].map((m) => m[1])

/** El bloque del spec que enumera el encabezado y el pie del cuadro. */
function bloqueDelCuadro() {
  const i = SPEC.indexOf("const tabla = page.getByTestId('espejo-encabezado')")
  assert.notEqual(i, -1, 'no se encontró el bloque del encabezado en el spec')
  const j = SPEC.indexOf('espejo-total', i)
  return SPEC.slice(i, j === -1 ? i + 3000 : j)
}

/** Los literales del spec: la lista del encabezado, la del pie y los `i('…')` del orden. */
function literalesDelSpec() {
  const b = bloqueDelCuadro()
  const listas = [...b.matchAll(/for \(const \w+ of \[([^\]]+)\]\)/g)]
    .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
  const ordenes = [...b.matchAll(/\bi\('([^']+)'\)/g)].map((m) => m[1])
  return { listas, ordenes, todos: [...new Set([...listas, ...ordenes])] }
}

// «Persona» y los días son columnas fijas fuera de `PLATA`; el spec puede nombrarlas.
const FUERA_DE_PLATA = ['Persona', 'Días', 'Dias']

test('el spec no espera NINGÚN rótulo que el cuadro ya no dibuja', () => {
  const legales = new Set([...rotulosDelCuadro(), ...rotulosDelPie(), ...FUERA_DE_PLATA, 'Blanco · recibo', 'Negro'])
  const { todos } = literalesDelSpec()
  const fantasmas = todos.filter((t) => ![...legales].some((l) => l === t || l.startsWith(t)))
  assert.deepEqual(fantasmas, [], `el spec espera rótulos que el componente ya no dibuja: ${fantasmas.join(' · ')}`)
})

test('el spec no se olvida de NINGUNA columna del cuadro', () => {
  const { listas } = literalesDelSpec()
  const dichos = new Set(listas)
  const faltantes = [...new Set(rotulosDelCuadro())].filter((r) => !dichos.has(r))
  assert.deepEqual(faltantes, [], `columnas que el cuadro dibuja y el spec no verifica: ${faltantes.join(' · ')}`)
})

test('las aserciones de orden comparan columnas que existen (si no, comparan contra -1 y mienten)', () => {
  const legales = new Set([...rotulosDelCuadro(), ...FUERA_DE_PLATA])
  const { ordenes } = literalesDelSpec()
  const rotas = ordenes.filter((o) => ![...legales].some((l) => l === o || l.startsWith(o)))
  assert.deepEqual(rotas, [], `i('…') sobre rótulos inexistentes devuelve -1 y la comparación no prueba nada: ${rotas.join(' · ')}`)
})
