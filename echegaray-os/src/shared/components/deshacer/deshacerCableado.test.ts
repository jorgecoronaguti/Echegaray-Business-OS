// EL DESHACER ESTÁ CABLEADO EN TODA LA PLATAFORMA (dueño, 15/09/2026: «Deshacer con Cmd/Ctrl+Z … en TODA la
// plataforma»).
//
// La pila y el atajo se prueban puros (`src/shared/lib/pilaDeDeshacer.test.ts`). Acá, sobre la fuente:
//   · el proveedor se monta UNA vez en el layout principal;
//   · el atajo mira el foco ANTES de prevenir (dentro de un input deshace el navegador);
//   · `InlineEdit` guarda por el hook, así que TODOS sus consumidores heredan el deshacer, y ninguno lo esquiva;
//   · las celdas propias de Liquidación que no son `InlineEdit` registran su guardado;
//   · el servidor no pisa lo que cambió desde la edición (la misma acción, con `esperado`).
//
// MUTACIÓN QUE LO PONE ROJO: que `InlineEdit` vuelva a llamar a `guardar` directo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../../../', import.meta.url))
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? archivos(p) : (p.endsWith('.tsx') ? [p] : [])
  })
}

test('EL PROVEEDOR SE MONTA UNA VEZ EN EL LAYOUT PRINCIPAL', () => {
  const layout = leer('app/(main)/layout.tsx')
  assert.match(layout, /<DeshacerProvider>/)
  assert.equal((layout.match(/<DeshacerProvider>/g) ?? []).length, 1)
})

test('EL ATAJO MIRA EL FOCO ANTES DE PREVENIR, Y EL AVISO TIENE «REHACER»', () => {
  const d = leer('shared/components/deshacer/DeshacerProvider.tsx')
  assert.match(d, /atajoDeDeshacer\(\{[^}]*enEditable: destinoEditable\(document\.activeElement/)
  const atajo = d.indexOf('atajoDeDeshacer(')
  assert.ok(atajo > 0 && atajo < d.indexOf('e.preventDefault()'), 'se decide antes de prevenir')
  assert.match(d, />Rehacer</)
  assert.match(d, /sinPasosDeOtraRuta\(/)
})

test('INLINEEDIT GUARDA POR EL HOOK, Y TODOS SUS CONSUMIDORES LO HEREDAN', () => {
  const i = leer('shared/components/ds/InlineEdit.tsx')
  assert.match(i, /useGuardadoDeshacible\(\{/)
  assert.match(i, /await guardarDeshacible\(v\)/, 'MUTACIÓN: llamar a `guardar` directo saltea la pila')
  assert.ok(!/await guardar\(v\)/.test(i), 'ningún guardado directo')
  // Ningún consumidor de InlineEdit apaga el deshacer.
  const consumidores = archivos(SRC).filter((p) => /<InlineEdit\b/.test(readFileSync(p, 'utf8')))
  assert.ok(consumidores.length >= 6, `consumidores encontrados: ${consumidores.length}`)
  for (const p of consumidores) {
    assert.ok(!/sinDeshacer/.test(readFileSync(p, 'utf8')), `${p} esquiva el deshacer`)
  }
})

test('LAS CELDAS PROPIAS DE LIQUIDACIÓN REGISTRAN SU GUARDADO', () => {
  const celdas = leer('features/administracion/components/liquidacion/CeldasDeLiquidacion.tsx')
  assert.match(celdas, /deshacer\?\.registrar\(\{[\s\S]{0,500}guardarEfectivoRedondeado\(/, 'CeldaRedondeo')
  assert.match(celdas, /esperado: contexto\?\.esperado/, 'CeldaEditable manda el valor esperado')
  assert.match(leer('features/administracion/components/liquidacion/cuadro/CeldaTarifa.tsx'), /deshacer\?\.registrar\(/, 'CeldaTarifa')
})

test('HORAS: MOVER A ALGUIEN DE OBRA SE DESHACE CON LA MISMA ACCIÓN', () => {
  const g = leer('features/administracion/components/GrillaAsistenciaObra.tsx')
  assert.match(g, /deshacer\?\.registrar\(\{[\s\S]{0,400}cambiarObraActual\(\{ persona_id: fila\.persona\.id, obra_id: v \|\| null \}\)/)
  assert.match(g, /const anterior = mostrada\(fila\)/)
})

test('EL SERVIDOR NO PISA LO QUE CAMBIÓ DESDE LA EDICIÓN', () => {
  const a = leer('features/administracion/services/liquidacionActions.ts')
  assert.equal((a.match(/esperado: z\.union\(\[z\.literal\(''\), z\.coerce\.number\(\)\.finite\(\)\]\)\.optional\(\)/g) ?? []).length, 2)
  assert.ok((a.match(/MENSAJE_CONFLICTO/g) ?? []).length >= 3, 'celda y redondeo verifican con el mismo mensaje')
})
