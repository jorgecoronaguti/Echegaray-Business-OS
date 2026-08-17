// EL PARSER DEL CRONOGRAMA. Cada test de acá nació de un defecto real cometido el 17/08/2026
// leyendo el archivo vivo — no de imaginar qué podría salir mal.

import test from 'node:test'
import assert from 'node:assert/strict'
import { parsearCronograma, parsePct, serialAIso, padreDe, ubicarColumnas } from './obra-cronograma.mjs'

const grilla = (encabezado, ...filas) => [encabezado, ...filas]
const ENC_EN = ['#', 'Activity', 'CUADRILLA', 'Start', 'End', 'Days', 'Status', '% Done', 'COMENTARIOS']
const ENC_ES = ['#', 'Activity', 'Comment', 'Comienzo', 'Fin', 'Days', 'Status', 'Dias Reales', '% Done']

// ── FECHAS ───────────────────────────────────────────────────────────────────

test('el serial de Sheets se convierte a la fecha que es', () => {
  assert.equal(serialAIso(46195), '2026-06-22')
  assert.equal(serialAIso(46246), '2026-08-12')
})

test('un texto NO se adivina como fecha: se devuelve null', () => {
  // Leer fechas formateadas y adivinar el locale ya le costó a este repo 699 filas excluidas en
  // silencio. Preferimos una fecha faltante —visible— a una fecha inventada.
  assert.equal(serialAIso('22-jun-26'), null)
  assert.equal(serialAIso(''), null)
  assert.equal(serialAIso(0), null)
})

test('un serial fuera de rango humano es un error de lectura, no un dato', () => {
  assert.equal(serialAIso(3), null)
  assert.equal(serialAIso(9_999_999), null)
})

// ── PORCENTAJE: el defecto que publicaba una obra terminada como si estuviera al 1% ──

test('leyendo SIN FORMATO, 1 es 100% — no 1%', () => {
  // `avance-fisico.mjs` lee la hoja formateada y recibe "100%". Este módulo lee sin formato para
  // poder traer las fechas como serial, y entonces la MISMA celda llega como el número 1.
  assert.equal(parsePct(1), 100)
  assert.equal(parsePct(0.85), 85)
  assert.equal(parsePct(0), 0)
})

test('un porcentaje mayor a 1 se toma como ya expresado en 0-100', () => {
  assert.equal(parsePct(85), 85)
  assert.equal(parsePct('85%'), 85)
})

test('vacío y negativo no son cero: son null', () => {
  assert.equal(parsePct(''), null)
  assert.equal(parsePct(null), null)
  assert.equal(parsePct(-1), null)
})

// ── ENCABEZADOS: dos idiomas, ninguno "el correcto" ──────────────────────────

test('reconoce «Start» y también «Comienzo»', () => {
  // San Francisco y LE-* dicen Start/End; Messina y Quattropani dicen Comienzo/Fin. Con la primera
  // versión, Messina entera se descartaba con "no es un cronograma".
  assert.ok(ubicarColumnas(grilla(ENC_EN)))
  assert.ok(ubicarColumnas(grilla(ENC_ES)))
})

test('una pestaña sin columna de actividad no es un cronograma', () => {
  const { actividades, motivo } = parsearCronograma(grilla(['Nombre', 'Legajo', 'Jornal']))
  assert.equal(actividades.length, 0)
  assert.match(motivo, /no es un cronograma/)
})

// ── HITOS: el defecto que dejó una obra sin una sola barra ───────────────────

test('una tarea de UN día NO es un hito', () => {
  // En estos trackers una tarea de un día tiene Comienzo y Fin el mismo día. La primera versión
  // marcaba `inicio === fin → hito`: 24 de las 32 actividades de LE-Comedor se publicaban como
  // rombos sin duración y el Gantt de esa obra quedaba sin una sola barra.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['1', 'Replanteo', '', 46195, 46195, 1, 'Completado', 1, '']))
  assert.equal(actividades[0].tipo, 'tarea')
})

test('un hito es duración CERO, y nada más', () => {
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['1', 'Entrega de frente', '', 46195, 46195, 0, '', 0, '']))
  assert.equal(actividades[0].tipo, 'hito')
})

test('una celda de días VACÍA no vale cero días', () => {
  // `Number('')` es 0, y cero días es la definición de hito. Con esa cuenta aparecieron 101 "hitos"
  // en Quattropani y 40 en San Francisco: eran renglones vacíos debajo del cronograma.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['1', 'Muro', '', 46195, 46200, '', '', 0.5, '']))
  assert.equal(actividades[0].tipo, 'tarea')
  assert.equal(actividades[0].dias_plan, null)
})

// ── ADMISIÓN DE FILAS ────────────────────────────────────────────────────────

test('una fila con nombre pero sin código, ni fecha, ni avance NO entra', () => {
  // Debajo del cronograma hay renglones de la grilla diaria y notas sueltas. Tener texto en la
  // columna de nombre no alcanza para ser una actividad.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['', 'nota suelta', '', '', '', '', '', '', '']))
  assert.equal(actividades.length, 0)
})

test('una fila SIN código pero con fecha entra igual, con código por posición', () => {
  // El tracker de Quattropani no numera ninguna fila. Descartar la fila sin código perdía esa obra
  // entera y el script informaba "sin actividades" sobre 30 renglones cargados a mano.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['', 'Excavación', '', 46195, 46200, 5, '', 0, '']))
  assert.equal(actividades.length, 1)
  assert.equal(actividades[0].codigo, 'f2')
})

test('el mismo código dos veces no duplica: gana el primero', () => {
  const { actividades } = parsearCronograma(grilla(ENC_EN,
    ['1', 'Primera', '', 46195, 46200, 5, '', 1, ''],
    ['1', 'Repetida', '', 46201, 46205, 5, '', 0, '']))
  assert.equal(actividades.length, 1)
  assert.equal(actividades[0].nombre, 'Primera')
})

// ── JERARQUÍA ────────────────────────────────────────────────────────────────

test('el código con coma o punto cuelga de su padre', () => {
  assert.equal(padreDe('1,02'), '1')
  assert.equal(padreDe('2.03'), '2')
  assert.equal(padreDe('1'), null)
})

test('la fila que tiene hijas es un RESUMEN', () => {
  const { actividades } = parsearCronograma(grilla(ENC_EN,
    ['2', 'ESTRUCTURA', '', 46195, 46230, 35, '', 0.5, ''],
    ['2,01', 'Columnas', '', 46195, 46210, 15, '', 1, '']))
  assert.equal(actividades[0].tipo, 'resumen')
  assert.equal(actividades[1].tipo, 'tarea')
  assert.equal(actividades[1].codigo_padre, '2')
})

test('un título de sección sin fechas ni avance también es resumen', () => {
  // "PILON", "TRABAJOS PREVIOS": el tracker las escribe como renglón suelto. Publicarlas como tarea
  // las dibujaría como una barra de duración desconocida.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['3', 'PILON', '', '', '', '', '', '', '']))
  assert.equal(actividades[0].tipo, 'resumen')
})

// ── LO QUE NO SE INVENTA ─────────────────────────────────────────────────────

test('NUNCA se deduce una dependencia de las fechas', () => {
  // Que una actividad empiece el día que termina otra no prueba que dependa de ella. El archivo no
  // tiene columna de predecesoras y el parser no devuelve ni un campo de dependencia.
  const { actividades } = parsearCronograma(grilla(ENC_EN,
    ['1', 'Encofrado', '', 46195, 46200, 5, '', 1, ''],
    ['2', 'Llenado', '', 46200, 46205, 5, '', 0, '']))
  for (const a of actividades) {
    assert.ok(!('dependencias' in a) && !('predecesora' in a))
  }
})

test('una actividad sin fechas entra con las fechas en null, no en una fecha cualquiera', () => {
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['7', 'Pendiente de definir', '', '', '', '', '', 0, '']))
  assert.equal(actividades.length, 1)
  assert.equal(actividades[0].inicio_plan, null)
  assert.equal(actividades[0].fin_plan, null)
})

test('el parser no devuelve NINGÚN campo de línea base: eso se sella aparte', () => {
  // Si el sincronizador escribiera la baseline, el desvío contra baseline daría siempre cero y el
  // módulo entero perdería su sentido.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['1', 'Muro', '', 46195, 46200, 5, '', 1, '']))
  assert.ok(!('inicio_base' in actividades[0]))
  assert.ok(!('fin_base' in actividades[0]))
})
