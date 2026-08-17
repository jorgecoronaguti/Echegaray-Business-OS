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

test('una fila SIN código pero con fecha entra igual', () => {
  // El tracker de Quattropani no numera ninguna fila. Descartar la fila sin código perdía esa obra
  // entera y el script informaba "sin actividades" sobre 30 renglones cargados a mano.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['', 'Excavación', '', 46195, 46200, 5, '', 0, '']))
  assert.equal(actividades.length, 1)
  assert.equal(actividades[0].codigo, null)
  assert.equal(actividades[0].clave, 'raiz/excavacion')
})

test('el MISMO código en dos filas distintas ya no descarta una actividad', () => {
  // En San Francisco la columna `#` arranca como código (1,01…1,08) y a la mitad pasa a ser una
  // CANTIDAD: `2` aparece en tres filas, `3` en dos. Con el código como clave, la regla "gana el
  // primero" borraba actividades reales del cronograma sin decirlo.
  const { actividades } = parsearCronograma(grilla(ENC_EN,
    ['2', 'Colocacion de cancamo', '', 46195, 46200, 5, '', 0.5, ''],
    ['2', 'Corte de paneles al sur', '', 46201, 46205, 5, '', 1, '']))
  assert.equal(actividades.length, 2)
  assert.deepEqual(actividades.map((a) => a.clave), ['raiz/colocacion-de-cancamo', 'raiz/corte-de-paneles-al-sur'])
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

test('un título de sección con «% Done» en CERO sigue siendo resumen', () => {
  // ═══ EL TEST DE ARRIBA ESTABA VERDE CON UN CASO QUE EL ARCHIVO NUNCA PRODUCE ═══
  //
  // Usaba la celda de porcentaje VACÍA. En el archivo real esas celdas traen **0**, y con la regla
  // vieja (`pct == null`) el título entraba como tarea al 0%. Efecto medido: Quattropani con CERO
  // resúmenes sobre 108 filas, y San Francisco publicado al 33% cuando el resto del OS decía 85%,
  // porque cada título de sección pesaba en el promedio como una tarea sin hacer.
  //
  // Con el código anterior este test FALLA. Es la diferencia entre probar la intención y probar el
  // efecto, y es la razón por la que el auditor no firmó.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['3', 'TRABAJOS PREVIOS', '', '', '', '', '', 0, '']))
  assert.equal(actividades[0].tipo, 'resumen')
})

test('una tarea REAL sin fechas pero con duración no se confunde con un título', () => {
  // La regla mira fechas y duración, no el porcentaje: una tarea planificada en días que todavía no
  // tiene fecha asignada es trabajo, no un rótulo.
  const { actividades } = parsearCronograma(grilla(ENC_EN, ['4', 'Pintura general', '', '', '', 3, '', 0, '']))
  assert.equal(actividades[0].tipo, 'tarea')
})

// ── IDENTIDAD: MOVER FILAS NO PUEDE MOVER DATOS DE UNA ACTIVIDAD A OTRA ──────
//
// El sincronizador hace `on conflict (obra_id, clave) do update`. Si la clave dependiera de la
// posición —como dependía hasta el 17/08/2026, en 248 de 325 actividades— insertar una fila arriba
// en el tracker haría que cada actividad escriba sus fechas SOBRE LA VECINA, y que el candado
// `editado_a_mano` proteja a la actividad equivocada. No hay error visible: hay fechas cambiadas.
//
// Estos tests son la demostración que faltaba. La propiedad que se prueba es una sola: **una clave
// que aparece antes y después de tocar las filas tiene que seguir señalando a la MISMA actividad**.

const PISOS = [
  ENC_EN,
  ['1', 'TAREA DE LA SEMANA', '', '', '', '', '', '', ''],
  ['1,01', 'Muro G 1/2 de 5m', '', 46195, 46200, 5, '', 1, ''],
  ['', 'PISOS', '', '', '', '', '', 0, ''],
  ['', 'GALPÓN 5 - 1000m2', '', '', '', '', '', 0, ''],
  ['', 'Relleno', '', 46240, 46240, 1, '', 1, ''],
  ['', 'Compactación', '', 46241, 46241, 1, '', 0.5, ''],
  ['', 'GALPÓN 4', '', '', '', '', '', 0, ''],
  ['', 'Relleno', '', 46241, 46241, 1, '', 0.7, ''],
  ['', 'Compactación', '', 46244, 46244, 1, '', 0.5, ''],
]
const porClave = (rows) => new Map(parsearCronograma(rows).actividades.map((a) => [a.clave, a]))
/** La identidad no migró: toda clave compartida sigue siendo la misma actividad. */
function identidadEstable(antes, despues) {
  let compartidas = 0
  for (const [clave, a] of antes) {
    const b = despues.get(clave)
    if (!b) continue
    compartidas++
    assert.equal(b.nombre, a.nombre, `la clave ${clave} pasó de "${a.nombre}" a "${b.nombre}"`)
    assert.equal(b.seccion, a.seccion, `la clave ${clave} cambió de sección`)
    assert.equal(b.pct, a.pct, `la clave ${clave} se quedó con el avance de otra actividad`)
    assert.equal(b.inicio_plan, a.inicio_plan, `la clave ${clave} se quedó con la fecha de otra actividad`)
  }
  return compartidas
}

test('el mismo Relleno de dos galpones distintos son DOS actividades', () => {
  const m = porClave(PISOS)
  assert.ok(m.has('galpon-5-1000m2/relleno') && m.has('galpon-4/relleno'))
  assert.equal(m.get('galpon-5-1000m2/relleno').pct, 100)
  assert.equal(m.get('galpon-4/relleno').pct, 70)
})

test('INSERTAR una fila arriba no le cambia la identidad a ninguna actividad', () => {
  const conFilaNueva = [PISOS[0], ['', 'Reunión de arranque', '', 46190, 46190, 1, '', 1, ''], ...PISOS.slice(1)]
  assert.equal(identidadEstable(porClave(PISOS), porClave(conFilaNueva)), 9)
})

test('BORRAR una fila del medio no le pasa sus datos a la de abajo', () => {
  const sinRelleno5 = PISOS.filter((r) => r !== PISOS[5])
  const despues = porClave(sinRelleno5)
  assert.ok(!despues.has('galpon-5-1000m2/relleno'), 'la actividad borrada tiene que desaparecer, no heredarse')
  assert.equal(identidadEstable(porClave(PISOS), despues), 8)
})

test('REORDENAR dentro de la sección no mueve datos de una actividad a otra', () => {
  const dadoVuelta = [...PISOS]
  ;[dadoVuelta[5], dadoVuelta[6]] = [dadoVuelta[6], dadoVuelta[5]]
  assert.equal(identidadEstable(porClave(PISOS), porClave(dadoVuelta)), 9)
})

test('renombrar una actividad NO la pisa: crea otra y la vieja queda huérfana', () => {
  // Es la contracara honesta de la clave por contenido. El sync reporta las huérfanas y no borra
  // nada, así que un renombre se ve — en vez de propagarse solo sobre la fila de al lado.
  const renombrada = PISOS.map((r) => (r === PISOS[5] ? ['', 'Relleno (2da etapa)', '', 46240, 46240, 1, '', 1, ''] : r))
  const despues = porClave(renombrada)
  assert.ok(!despues.has('galpon-5-1000m2/relleno'))
  assert.ok(despues.has('galpon-5-1000m2/relleno-2da-etapa'))
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
