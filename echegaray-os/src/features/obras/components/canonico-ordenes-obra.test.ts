import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// EL BLOQUE «ORDEN DE COMPRA» DE LA FICHA DE OBRA, CONTRA SU PROPIO FUENTE.
//
// LO QUE ESTE TEST NO PRUEBA: que se vea bien. Eso es una captura autenticada y en 390px, y la
// mira quien no escribió esto. Prueba las tres cosas que se rompen solas al editar el archivo.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')

test('ningún color suelto: todo sale de los tokens medidos', () => {
  // La regla de diseño del OS: si aparece un hex en un componente, dejó de salir del token y la
  // pantalla empieza a tener su propia paleta.
  const src = fuente('OrdenesDeLaObra.tsx')
  assert.equal(src.match(/#[0-9a-fA-F]{3,8}\b/g), null)
  assert.match(src, /from '\.\/canon\/tokens'/)
})

test('el texto del vacío NO se escribe acá: lo decide el servicio', () => {
  // Dos definiciones del mismo texto es cómo la ficha de la obra y la del cliente terminan
  // diciendo cosas distintas sobre la misma obra. El componente dibuja `bloque.vacioOC`.
  const src = fuente('OrdenesDeLaObra.tsx')
  assert.ok(!src.includes('Sin OC registrada'), 'el texto del vacío está duplicado en el componente')
  assert.match(src, /\{bloque\.vacioOC\}/)
})

test('la fila es UN solo enlace: un `<a>` dentro de otro lo desarma el navegador', () => {
  const src = fuente('OrdenesDeLaObra.tsx')
  // Sólo la etiqueta de apertura del JSX (arranca renglón), no la mención en un comentario.
  assert.equal((src.match(/^\s*<a$/gm) ?? []).length, 1)
})

test('el número de la orden es lo más grande de la fila', () => {
  // Es la pregunta que trajo al dueño a esta pantalla: «no veo el número de OC». Si algún día el
  // importe o la fecha crecen por encima, el bloque deja de contestarla de un vistazo.
  const src = fuente('OrdenesDeLaObra.tsx')
  const tamanos = [...src.matchAll(/fontSize: '([\d.]+)px'/g)].map((m) => Number(m[1]))
  const rotulo = /fontSize: '15px', fontWeight: 600/.test(src)
  assert.ok(rotulo, 'el rótulo de la orden ya no va en 15px/600')
  assert.equal(Math.max(...tamanos), 15)
})

test('el importe está detrás de `veComercial`: la OC dice cuánto se vendió', () => {
  // El jefe de obra ve la ORDEN de su obra (RLS `cliente_orden_select`) pero no el precio de venta
  // — misma línea que ya trazan `ListaOrdenes` y el Resumen.
  const src = fuente('OrdenesDeLaObra.tsx')
  assert.match(src, /\{veComercial && \(/)
})
