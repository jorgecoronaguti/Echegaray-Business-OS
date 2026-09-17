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

// QA DE PRODUCCIÓN (15/09/2026): Ctrl+Z fuera de un input, sin nada que deshacer, mostraba «Nada para deshacer»
// durante segundos. Con la pila vacía el atajo no pinta nada.
test('PILA VACÍA + ATAJO: NO SE RENDERIZA NINGÚN AVISO', () => {
  const d = leer('shared/components/deshacer/DeshacerProvider.tsx')
  assert.match(d, /if \(!tomado\) return\n/)
  assert.ok(!/Nada para (deshacer|rehacer)/.test(d), 'MUTACIÓN: volver a avisar con la pila vacía')
})

test('INLINEEDIT GUARDA POR EL HOOK, Y TODOS SUS CONSUMIDORES LO HEREDAN', () => {
  const i = leer('shared/components/ds/InlineEdit.tsx')
  assert.match(i, /useGuardadoDeshacible\(\{/)
  // `aGuardar` DESDE EL 15/09/2026: es lo tecleado —la CUENTA si empieza con `=`, el número si no—. Lo que
  // se protege sigue siendo lo mismo: que el guardado pase por el hook y no por `guardar` directo.
  assert.match(i, /await guardarDeshacible\(aGuardar\)/, 'MUTACIÓN: llamar a `guardar` directo saltea la pila')
  assert.ok(!/await guardar\(v\)|await guardar\(aGuardar\)/.test(i), 'ningún guardado directo')
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

// ═══ 17/09/2026 — LAS SUPERFICIES QUE NO SON `InlineEdit` ═══
//
// Dueño: *«así como está el deshacer cmd+z (que tiene que estar en toda la plataforma) tiene que estar el
// rehacer en toda la plataforma»*. Hasta hoy sólo registraban paso las pantallas que editan con `InlineEdit`
// o con `useDeshacer`: en Presupuestos, Compras, Clientes → Documentos y Pedidos de Materiales, Cmd+Z no
// hacía nada y el dueño creía que sí. Cada una de estas celdas escribe UN campo, sabe su valor anterior y
// puede volver a llamar a su propia acción: son las que se pueden ofrecer con honestidad.
//
// MUTACIÓN QUE LO PONE ROJO: que cualquiera de estas celdas vuelva a llamar a su acción directo.

const CELDAS_CABLEADAS: Array<{ archivo: string; accionDirecta: RegExp; que: string }> = [
  {
    archivo: 'features/presupuestos/components/CeldaEditable.tsx',
    // La acción se llama UNA sola vez, dentro de `escribir`, que es lo que recibe el hook. Un segundo
    // `editarCampoPartida(` en el archivo sería el `onBlur` guardando por su cuenta otra vez.
    accionDirecta: /editarCampoPartida\([\s\S]*editarCampoPartida\(/,
    que: 'Presupuestos → partidas (código, descripción, unidad, cantidad, hs/un.)',
  },
  {
    archivo: 'features/administracion/components/ObraEnLinea.tsx',
    accionDirecta: /asignarObraDeCompra\([\s\S]*asignarObraDeCompra\(/,
    que: 'Compras y ficha del proveedor → la obra de la fila',
  },
  {
    archivo: 'features/administracion/components/EditorObraDeCompra.tsx',
    accionDirecta: /asignarObraDeCompra\([\s\S]*asignarObraDeCompra\(/,
    que: 'Compras → panel de la compra, la obra',
  },
  {
    archivo: 'features/integraciones/components/SelectEstadoPedido.tsx',
    accionDirecta: /setEstadoPedidoAction\([\s\S]*setEstadoPedidoAction\(/,
    que: 'Pedidos de materiales → el estado del pedido',
  },
  {
    archivo: 'features/integraciones/components/SelectActividad.tsx',
    accionDirecta: /alElegir\(v\)[\s\S]*await alElegir\(/,
    que: 'Pedidos de materiales → la actividad del pedido',
  },
  {
    archivo: 'features/obras/components/TabOperacion.tsx',
    accionDirecta: /await alElegir\(e\.target\.value\)/,
    que: 'Obra → Operación → la actividad del pedido',
  },
  {
    archivo: 'features/clientes/components/SelectRolDocumento.tsx',
    accionDirecta: /startTransition\(\(\) => ejecutar\(form\)\)/,
    que: 'Clientes → Documentos, el rol del archivo',
  },
]

test('CADA SUPERFICIE NUEVA GUARDA POR LA PILA COMPARTIDA, NO POR UNA SEGUNDA IMPLEMENTACIÓN', () => {
  for (const { archivo, accionDirecta, que } of CELDAS_CABLEADAS) {
    const f = leer(archivo)
    assert.match(f, /useGuardadoDeshacible\(\{/, `${que}: no apila el paso`)
    assert.match(f, /useCeldaViva\(/, `${que}: sin celda viva, el deshacer no ve el conflicto ni pinta el valor`)
    assert.match(f, /await guardarDeshacible\(/, `${que}: no guarda por el hook`)
    assert.ok(!accionDirecta.test(f), `${que}: MUTACIÓN — llamar a la acción directo saltea la pila`)
    // La pila es una sola: nadie importa su propio proveedor ni su propia pila.
    assert.match(f, /from '@\/shared\/components\/deshacer\/DeshacerProvider'/, `${que}: usa otro deshacer`)
  }
})

test('CADA FILA TIENE SU PROPIA CLAVE: CMD+Z NO RESTAURA LA FILA DE AL LADO', () => {
  // Una lista de 214 documentos con una sola clave compartida haría que el deshacer pise el archivo
  // equivocado — el paso se busca por `clave`, no por posición.
  const rol = leer('features/clientes/components/SelectRolDocumento.tsx')
  assert.match(rol, /clave: string/, 'la clave es obligatoria, no derivada del testid compartido')
  assert.match(leer('features/clientes/components/BloqueDocumentos.tsx'), /clave=\{`rol-del-documento-\$\{d\.drive_file_id\}`\}/)
  assert.match(leer('features/integraciones/components/PedidosGlobal.tsx'), /clave=\{`actividad-del-pedido-\$\{p\.id_pedido\}`\}/)
  assert.match(leer('features/obras/components/TabOperacion.tsx'), /clave=\{`actividad-del-pedido-\$\{p\.id_pedido\}`\}/)
  assert.match(leer('features/administracion/components/ObraEnLinea.tsx'), /const clave = `obra-de-la-compra-\$\{fila\}`/)
  assert.match(leer('features/presupuestos/components/CeldaEditable.tsx'), /const clave = testid \?\? `partida-\$\{partidaId\}-\$\{campo\}`/)
})

test('LA OBRA DE UNA COMPRA SE DESHACE CON `esperado`: NO PISA A QUIEN LA MOVIÓ EN EL MEDIO', () => {
  for (const archivo of [
    'features/administracion/components/ObraEnLinea.tsx',
    'features/administracion/components/EditorObraDeCompra.tsx',
  ]) {
    const f = leer(archivo)
    assert.match(f, /guardar: \(v, contexto\) => escribir\(v, contexto\?\.esperado\)/, `${archivo}: ignora el esperado`)
  }
})

test('EL AVISO DICE CÓMO SE TECLEA REHACER (antes sólo estaba el botón, y nadie sabía el atajo)', () => {
  const d = leer('shared/components/deshacer/DeshacerProvider.tsx')
  assert.match(d, /textoDelAtajoDeRehacer\(/, 'MUTACIÓN: sacar la tecla del aviso')
  // El texto sale del teclado de quien mira: el componente pinta la variable, no una cadena clavada.
  assert.match(d, /data-testid="aviso-deshacer-atajo"[^>]*>\{atajoRehacer\}<\/kbd>/)
})
