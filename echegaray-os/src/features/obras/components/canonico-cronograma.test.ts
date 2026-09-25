import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// EL CRONOGRAMA DEL DISEÑO ERP OBRAS (05 · M07 · C06 · MC7, dueño 23/09/2026): las medidas y los
// textos del .html, leídos en el .tsx. Un solo cronograma; ver y editar son la misma pantalla.

const fuente = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
const tab = () => fuente('TabCronograma.tsx')

test('la 05 es una grilla 270 px | 1fr con filas de 36 px, sobre padding 26/30/32', () => {
  const src = tab()
  assert.match(src, /gridTemplateColumns: '270px minmax\(0,1fr\)'/)
  assert.match(src, /const ALTO_FILA = 36/)
  assert.match(src, /padding: '26px 30px 32px'/)
})

test('las barras: clara plan (6 px, radio 3), llena ejecutado en grafito o neg, técnico punteado, rayada la proyección', () => {
  const src = tab()
  assert.match(src, /height: '6px', borderRadius: '3px', background: C\.borde/)
  assert.match(src, /border: `1px dashed \$\{C\.bordeFuerte\}`/)
  assert.match(src, /repeating-linear-gradient\(45deg, \$\{C\.neg\}/)
  assert.equal(/#[0-9A-Fa-f]{6}/.test(src), false, 'apareció un hex suelto en el JSX')
})

test('la leyenda va en una línea al pie con el texto literal y la precedencia a la derecha', () => {
  const src = tab()
  assert.match(src, /Barra clara: plan · llena: ejecutado · roja: atrasada · punteada: tiempo técnico/)
  assert.match(src, /textoPrecedencia\(filas, dependencias\)/)
})

test('Semana · Mes · Trimestre en la banda; hoy es una línea amarilla', () => {
  const src = tab()
  assert.match(src, /ESCALAS_VISTA\.map/)
  assert.match(src, /background: C\.marca \}\} \/>/)
})

test('la M07 lleva la lista 112 px | 1fr con barras de 14 px y el pie de línea base y dependencias', () => {
  const src = tab()
  assert.match(src, /gridTemplateColumns: '112px 1fr', gap: '8px', height: '44px'/)
  assert.match(src, /top: '15px', height: '14px', borderRadius: '3px'/)
  assert.match(src, /Línea base: /)
  assert.match(src, /Dependencias: \{nDeps\} de \{actos\.length\}/)
})

test('la C06 edita en días hábiles: 300 px | repeat(n), filas de 40, barras de 16 con extremos, y sellar apagado con motivo', () => {
  const src = tab()
  assert.match(src, /gridTemplateColumns: '300px 1fr', height: `\$\{ALTO_FILA_EDITOR\}px`/)
  assert.match(src, /const ALTO_FILA_EDITOR = 40/)
  assert.match(src, /top: '12px', height: '16px'/)
  assert.match(src, /sin fechas · arrastrá para fijar/)
  assert.match(src, /motivoSellarApagado\(filas\)/)
  assert.match(src, /Los extremos se arrastran; la duración es en días hábiles de esta obra\./)
  assert.match(src, /La línea base se escribe una sola vez; después mover fechas mide desvío\./)
  assert.match(src, /Guardar fechas/)
})

test('la MC7 tiene dos fechas de 76×44 en mono por ítem (40 en el diseño; 44 de toque en el teléfono, dueño 24/09) y la primaria de 48 sobre la barra', () => {
  const src = tab()
  assert.match(src, /width: '76px', height: '44px'/)
  assert.match(src, /height: '48px'/)
  assert.match(src, /Con fechas <b/)
})

test('el editor no asume lunes a viernes: las columnas salen de los días hábiles y el calendario de la obra', () => {
  const src = tab()
  assert.match(src, /diasHabilesDelEditor\(pares\(filas\), hoy, isodows, setFeriados\)/)
  assert.equal(/\[1, 2, 3, 4, 5\]/.test(src), false)
})

test('hay UN solo cronograma: la vista y el editor viven en el mismo archivo y la página monta CronogramaDeObra', () => {
  const src = fuente('CronogramaDeObra.tsx')
  assert.match(src, /<TabCronograma/)
  assert.match(src, /getDependencias\(supabase, obraId\)/)
})
