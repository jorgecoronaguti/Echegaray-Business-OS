// Cableado del panel del rodado: lee el código fuente porque lo que se rompió fue QUÉ puerta abre cada fila,
// y eso no lo ve ninguna función pura. Si alguien vuelve a abrir la ficha vieja desde Mantenimiento, rojo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (f: string) => readFileSync(new URL(`../components/${f}`, import.meta.url), 'utf8')

test('Mantenimiento abre PanelRodado para rodados y máquinas, vengan de la tabla que vengan', () => {
  const v = leer('VistaMantenimiento.tsx')
  assert.match(v, /seRevisa\(panelDe\)/)
  assert.match(v, /<PanelRodado/)
  assert.doesNotMatch(v, /<FichaRevision/)
})

test('el panel ofrece reportar una falla, cargar cada revisión y el historial junto', () => {
  const p = leer('PanelRodado.tsx')
  assert.match(p, /<FormularioFalla/)
  assert.match(p, /<FormularioRevision[^>]*tipoFijo/)
  assert.match(p, /<LibroDeVida[\s\S]{0,400}alReportar=/)
  assert.match(p, /historialDeRodado\(/)
  assert.match(p, /TIPOS_POR_CLASE\[a\.clase\]/)
})

test('cada formulario guarda por su acción de siempre, sin tabla nueva', () => {
  assert.match(leer('FormularioFalla.tsx'), /reportarProblemaAction\(/)
  const f = leer('FormularioRevision.tsx')
  assert.match(f, /registrarRevisionAction\(/)
  assert.match(f, /valoresParaEnviar\(/)
  assert.match(f, /faltaParaGuardar\(/)
})

test('el formulario de falla no deja guardar sin elegir estado ni contar qué le pasa', () => {
  const f = leer('FormularioFalla.tsx')
  assert.match(f, /Elegí si sigue en uso/)
  assert.match(f, /Contá en una línea/)
})
