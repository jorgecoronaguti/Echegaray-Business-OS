import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsearConsulta, responderConsulta, renderConsulta, interpretarFecha, elegirCandidato,
  MOTIVO_CONSULTA, MAX_DIAS,
} from './asistencia-consultas.mjs'
import {
  fakeGoogleJornales, formula, idxCol, FECHA_HOY, FECHA_INEXISTENTE,
} from './jornales-fixture.mjs'

/** 30/07/2026 12:00 en San Juan (UTC-3): la fecha operativa es el 30. */
const AHORA = new Date('2026-07-30T15:00:00Z')

const parsear = (texto) => parsearConsulta(texto, { isoContexto: FECHA_HOY })

async function responder(texto, { google, consulta } = {}) {
  const g = google ?? fakeGoogleJornales()
  const q = consulta ?? parsear(texto)
  const r = await responderConsulta(g, q, { ahora: AHORA })
  return { g, q, r }
}

// ── PARSEO: lo que el dueño escribe de verdad ───────────────────────────────

test('«asistencia» sola es el comando de REGISTRO: la consulta no se lo roba', () => {
  assert.equal(parsear('asistencia'), null)
  assert.equal(parsear('@os asistencia'), null)
  // el registro con fecha también sigue siendo del otro flujo
  assert.equal(parsear('asistencia 29/07'), null)
  assert.equal(parsear('presentismo'), null)
})

test('los comandos del formulario de registro nunca son consultas', () => {
  for (const t of [
    'confirmar', 'confirmá sobrescribir', 'cancelar', '3 ausente', 'obra 2', '5 parcial 5,5',
    // marcar horas extra en el formulario NO es preguntar por horas extra
    '1 extra 2', '2 extra', 'extra 3',
  ]) {
    assert.equal(parsear(t), null, t)
  }
})

test('texto que no es de asistencia devuelve null (no secuestra la conversación)', () => {
  for (const t of ['', 'hola cómo va', 'cuánto pagamos la quincena', 'estado del sistema']) {
    assert.equal(parsear(t), null, t)
  }
})

test('«de hoy», «de ayer» y una pregunta suelta se entienden como consulta de hoy', () => {
  assert.deepEqual(
    parsear('asistencia de hoy'),
    {
      tipo: 'asistencia', alcance: 'todo', fecha: FECHA_HOY, desde: null, hasta: null,
      obra: null, trabajador: null, alcance_ambiguo: false, fecha_ilegible: null,
    },
  )
  assert.equal(parsear('quién trabajó hoy').fecha, FECHA_HOY)
  assert.equal(parsear('asistencia de ayer').fecha, '2026-07-29')
})

test('la fecha se entiende en número y en letras, con el año de contexto', () => {
  assert.equal(parsear('asistencia del 29/07').fecha, '2026-07-29')
  assert.equal(parsear('asistencia del 29-7').fecha, '2026-07-29')
  assert.equal(parsear('asistencia del 29 de julio').fecha, '2026-07-29')
  assert.equal(parsear('asistencia del 29 de julio de 2025').fecha, '2025-07-29')
  assert.equal(interpretarFecha('16 de enero', FECHA_HOY), '2026-01-16')
})

test('los períodos se entienden en sus tres formas y por mes completo', () => {
  for (const t of [
    'asistencia de Aguero del 16/07 al 30/07',
    'asistencia de Aguero entre el 16/7 y el 30/7',
    'asistencia de Aguero desde el 16/7 hasta el 30/7',
  ]) {
    const q = parsear(t)
    assert.equal(q.desde, '2026-07-16', t)
    assert.equal(q.hasta, '2026-07-30', t)
    assert.equal(q.fecha, null, t)
    assert.equal(q.trabajador, 'aguero', t)
  }
  const mes = parsear('horas extra de julio')
  assert.equal(mes.desde, '2026-07-01')
  assert.equal(mes.hasta, '2026-07-31')
})

test('«extra» es lo que distingue una consulta de horas extra de una de asistencia', () => {
  assert.equal(parsear('asistencia de hoy').tipo, 'asistencia')
  assert.equal(parsear('horas extra de hoy').tipo, 'horas_extra')
  assert.equal(parsear('cuántas horas extras hizo Aguero').tipo, 'horas_extra')
})

test('«de la obra X» y «en X» son alcance de OBRA, sin ambigüedad', () => {
  const a = parsear('asistencia de la obra Messinas')
  assert.equal(a.alcance, 'obra')
  assert.equal(a.obra, 'messinas')
  assert.equal(a.alcance_ambiguo, false)
  assert.equal(parsear('asistencia en Taller').obra, 'taller')
})

test('un «de X» suelto queda declarado como ambiguo: puede ser persona u obra', () => {
  const q = parsear('asistencia de Aguero')
  assert.equal(q.alcance, 'trabajador')
  assert.equal(q.trabajador, 'aguero')
  assert.equal(q.alcance_ambiguo, true, 'el lenguaje no lo distingue: lo resuelve la planilla')
  assert.equal(parsear('cuánto trabajó Aguero Cristian').trabajador, 'aguero cristian')
})

test('elegirCandidato prefiere la coincidencia exacta antes que la parcial', () => {
  const c = [
    { clave: 'A', etiqueta: 'Aguero Cristian', buscables: ['AGUERO CRISTIAN'] },
    { clave: 'B', etiqueta: 'Aguero', buscables: ['AGUERO'] },
  ]
  assert.equal(elegirCandidato(c, 'aguero').elegida.clave, 'B')
  assert.equal(elegirCandidato(c, 'cristian').elegida.clave, 'A')
})

// ── EJECUCIÓN contra la planilla (fixture, sin red) ─────────────────────────

test('asistencia de una obra en una fecha: presentes, ausentes, normales, extra y total', async () => {
  const { r } = await responder('asistencia de la obra Messinas')
  assert.equal(r.ok, true)
  assert.equal(r.datos.resumen.presentes, 1)
  assert.equal(r.datos.resumen.ausentes, 0)
  assert.equal(r.datos.resumen.sin_cargar, 0)
  assert.equal(r.datos.resumen.horas_normales, 9)
  assert.equal(r.datos.resumen.horas_extra, 0)
  assert.equal(r.datos.resumen.horas_total, 9)
  assert.match(r.texto, /Presentes: 1 · Ausentes: 0 · Sin cargar: 0/)
  assert.match(r.texto, /\*\*Total: 9\*\*/)
  assert.match(r.texto, /Reta Sebastian/)
})

test('las horas extra se separan de las normales y el total las incluye', async () => {
  // 16/07: Quiroga tiene `=8+6` (8 normales + 6 extra); los otros 5 tienen jornada plena
  const { r } = await responder('asistencia del 16/07')
  assert.equal(r.datos.resumen.presentes, 6)
  assert.equal(r.datos.resumen.horas_normales, 53)
  assert.equal(r.datos.resumen.horas_extra, 6)
  assert.equal(r.datos.resumen.horas_total, 59)
  assert.match(r.texto, /Quiroga Sebastian — 8 \+ 6 extra = 14 h/)
})

test('la consulta de horas extra lista quién las hizo y cuándo', async () => {
  const { r } = await responder('horas extra de Quiroga del 16/07 al 30/07')
  assert.equal(r.datos.resumen.horas_extra, 6)
  assert.equal(r.datos.resumen.horas_normales, 87)
  assert.equal(r.datos.resumen.horas_total, 93)
  assert.deepEqual(r.datos.horas_extra_detalle, [
    { fecha: '2026-07-16', nombre: 'Quiroga Sebastian', normales: 8, extras: 6, total: 14 },
  ])
  assert.match(r.texto, /\*\*Horas extra\*\*/)
  assert.match(r.texto, /16\/07 — Quiroga Sebastian/)
})

test('sin horas extra en el período se dice, no se muestra un cero solo', async () => {
  const { r } = await responder('horas extra de hoy')
  assert.equal(r.datos.resumen.horas_extra, 0)
  assert.match(r.texto, /No hay horas extra registradas/)
})

test('un 0 escrito es AUSENTE; una celda vacía es SIN CARGAR y no inventa una ausencia', async () => {
  const conCero = await responder('asistencia del 22/07 de la obra revoque')
  assert.equal(conCero.r.datos.resumen.ausentes, 1, 'Emanuel tiene un 0 explícito')
  assert.equal(conCero.r.datos.resumen.presentes, 2)
  assert.equal(conCero.r.datos.resumen.sin_cargar, 0)
  assert.equal(conCero.r.datos.resumen.horas_total, 18)
  assert.match(conCero.r.texto, /Emanuel Alaniz — ausente \(0\)/)

  const vacio = await responder('asistencia de la obra revoque')
  assert.equal(vacio.r.datos.resumen.ausentes, 0, 'vacío NO es ausente')
  assert.equal(vacio.r.datos.resumen.sin_cargar, 3)
})

test('sin nada cargado, lo dice: no devuelve un informe que parezca completo', async () => {
  const { r } = await responder('asistencia de la obra revoque')
  assert.equal(r.ok, true)
  assert.equal(r.datos.resumen.presentes, 0)
  assert.equal(r.datos.resumen.horas_total, 0)
  assert.match(r.texto, /Todavía no hay nada cargado/)
})

test('una jornada parcial se informa con sus horas reales, no como jornada completa', async () => {
  // sábado 18/07: sólo Pastran tiene 4 h; su compañero de obra está sin cargar
  const { r } = await responder('asistencia de la obra oficinas del 18/07')
  assert.equal(r.datos.resumen.presentes, 1)
  assert.equal(r.datos.resumen.sin_cargar, 1)
  assert.equal(r.datos.resumen.horas_normales, 4)
  assert.equal(r.datos.resumen.horas_total, 4)
  assert.match(r.texto, /Pastran Marcelo — 4 h/)
  assert.match(r.texto, /Petina Jairo — sin cargar/)
})

test('la jornada sale de la planilla: enero es de 8 h y julio de 9 h', async () => {
  const enero = await responder('asistencia del 05/01')
  assert.equal(enero.r.datos.resumen.horas_total, 24, '3 personas × 8 h')
  const julio = await responder('asistencia del 20/07 de la obra revoque')
  assert.equal(julio.r.datos.resumen.horas_total, 27, '3 personas × 9 h')
})

test('el total de un trabajador en un período suma sólo los días cargados', async () => {
  const { r } = await responder('asistencia de Aguero del 16/07 al 30/07')
  assert.equal(r.datos.alcance, 'trabajador')
  assert.equal(r.datos.etiqueta, 'Aguero Cristian')
  assert.equal(r.datos.resumen.personas, 1)
  assert.equal(r.datos.resumen.presentes, 10)
  assert.equal(r.datos.resumen.sin_cargar, 3, 'dos sábados y el día de hoy todavía sin cargar')
  assert.equal(r.datos.resumen.horas_total, 88)
  assert.match(r.texto, /16\/07\/2026 al 30\/07\/2026/)
  assert.match(r.texto, /\*\*Por día\*\*/)
})

test('los domingos no tienen columna: se saltean y se aclara al final', async () => {
  const { r } = await responder('asistencia de Aguero del 16/07 al 30/07')
  assert.deepEqual(r.datos.fechas_sin_datos.map((s) => s.fecha), ['2026-07-19', '2026-07-26'])
  assert.match(r.texto, /Sin columna en la planilla/)
  assert.match(r.texto, /19\/07, 26\/07/)
})

test('una carga que no se puede separar en normal/extra suma al TOTAL y se declara', async () => {
  // `=9-2,5+2` es una corrección real del archivo: el total lo calcula el Sheet, la
  // composición no es inequívoca. Se inyecta en la celda de hoy de Aguero.
  const g = fakeGoogleJornales({
    alLeer(grid) { grid.filas[20][idxCol('R')] = formula('=9-2,5+2', 8.5) },
  })
  const { r } = await responder('asistencia de Aguero', { google: g })
  assert.equal(r.ok, true)
  assert.equal(r.datos.resumen.no_separables, 1)
  assert.equal(r.datos.resumen.horas_total, 8.5, 'el total sí se cuenta')
  assert.equal(r.datos.resumen.horas_normales, 0, 'el desglose no se inventa')
  assert.equal(r.datos.resumen.horas_extra, 0)
  assert.equal(r.datos.resumen.presentes, 1)
  assert.match(r.texto, /no se puede separar en normal y extra/)
  assert.ok(!/9-2,5/.test(r.texto), 'no se filtra la fórmula de la planilla')
})

test('una celda con texto en lugar de horas no entra en ningún total y se avisa', async () => {
  const { r } = await responder('asistencia del 31/07')
  assert.equal(r.datos.resumen.con_texto, 1)
  assert.equal(r.datos.resumen.presentes, 0)
  assert.equal(r.datos.resumen.ausentes, 0)
  assert.equal(r.datos.resumen.horas_total, 0)
  assert.deepEqual(r.datos.con_texto_detalle, [{ fecha: '2026-07-31', nombre: 'Emanuel Alaniz' }])
  assert.match(r.texto, /texto en lugar de horas/)
  assert.ok(!/NO SE TOCA/.test(r.texto), 'no se repite el texto crudo de la celda')
})

test('una fecha que todavía no existe en la planilla se informa sin culpar al usuario', async () => {
  const { g, r } = await responder(`asistencia del ${FECHA_INEXISTENTE.slice(8)}/08`)
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO_CONSULTA.FECHA_NO_EN_JORNALES)
  assert.match(r.texto, /todavía no existe en la planilla/)
  assert.match(r.texto, /no se creó ninguna columna/)
  assert.equal(g.escrituras.length, 0)
})

test('un período más largo que el máximo se rechaza ANTES de leer la planilla', async () => {
  const g = fakeGoogleJornales()
  const r = await responderConsulta(g, {
    tipo: 'asistencia', alcance: 'todo', fecha: null, desde: '2026-01-05', hasta: '2026-07-30',
    obra: null, trabajador: null,
  }, { ahora: AHORA })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO_CONSULTA.RANGO_DEMASIADO_LARGO)
  assert.match(r.texto, new RegExp(`máximo por consulta es ${MAX_DIAS}`))
  assert.equal(g.lecturas, 0, 'no se lee el Sheet para rechazar un rango imposible')
})

test('una obra que no existe se rechaza listando las que sí', async () => {
  const { r } = await responder('asistencia de la obra Taller')
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO_CONSULTA.OBRA_DESCONOCIDA)
  assert.ok(r.opciones.includes('MESSINAS · BASES DE TANQUE'))
  assert.match(r.texto, /No encontré una obra/)
})

test('un nombre que no está ni como persona ni como obra se dice con las dos listas', async () => {
  const { r } = await responder('asistencia de Perez')
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO_CONSULTA.SIN_COINCIDENCIA)
  assert.match(r.texto, /ni una persona ni una obra/)
  assert.ok(r.opciones.includes('Aguero Cristian'))
  assert.ok(r.opciones.includes('MESSINAS · BASES DE TANQUE'))
})

test('un nombre ambiguo NO se resuelve por cuenta propia: se piden las opciones', async () => {
  const { r } = await responder('asistencia de Sebastian')
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO_CONSULTA.TRABAJADOR_AMBIGUO)
  assert.deepEqual(r.opciones, ['Quiroga Sebastian', 'Reta Sebastian'])
  assert.match(r.texto, /¿Cuál\?/)
})

test('una obra ambigua tampoco se elige sola', async () => {
  // "es" aparece en LA ESTRELLA y en MESSINAS/BASES: dos obras posibles.
  const { r } = await responder(null, {
    consulta: {
      tipo: 'asistencia', alcance: 'obra', fecha: FECHA_HOY, desde: null, hasta: null,
      obra: 'es', trabajador: null, alcance_ambiguo: false,
    },
  })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO_CONSULTA.OBRA_AMBIGUA)
  assert.equal(r.opciones.length, 2)
})

test('«de Messinas» se resuelve como OBRA aunque el parser lo trajo como persona', async () => {
  const q = parsear('asistencia de Messinas entre el 16/7 y el 30/7')
  assert.equal(q.alcance, 'trabajador')
  assert.equal(q.alcance_ambiguo, true)
  const { r } = await responder(null, { consulta: q })
  assert.equal(r.ok, true)
  assert.equal(r.datos.alcance, 'obra', 'la planilla desambigua lo que el lenguaje no puede')
  assert.equal(r.datos.etiqueta, 'MESSINAS · BASES DE TANQUE')
  assert.equal(r.datos.resumen.horas_total, 97)
})

test('un rango de 15 días lee la pestaña UNA sola vez, no una por día', async () => {
  const { g, r } = await responder('asistencia de Aguero del 16/07 al 30/07')
  assert.equal(r.ok, true)
  assert.equal(r.datos.dias, 13, '15 días de calendario, 13 con columna')
  assert.equal(g.lecturas, 1, 'los 14 bloques del año viven en la misma hoja')
})

test('una consulta NUNCA escribe en la planilla', async () => {
  for (const t of ['asistencia de hoy', 'horas extra de Quiroga del 16/07 al 30/07', 'asistencia del 05/01']) {
    const { g } = await responder(t)
    assert.equal(g.escrituras.length, 0, t)
  }
})

test('el texto no expone coordenadas de celda, pestañas, ids, rutas ni fórmulas', async () => {
  const textos = []
  for (const t of [
    'asistencia de hoy', 'asistencia del 16/07', 'asistencia de Aguero del 16/07 al 30/07',
    'horas extra de Quiroga del 16/07 al 30/07', 'asistencia de la obra Taller',
    'asistencia de Sebastian', 'asistencia del 31/07', 'asistencia del 10/08',
  ]) {
    textos.push((await responder(t)).r.texto)
  }
  const g = fakeGoogleJornales({ alLeer(grid) { grid.filas[20][idxCol('R')] = formula('=9-2,5+2', 8.5) } })
  textos.push((await responder('asistencia de Aguero', { google: g })).r.texto)

  for (const t of textos) {
    assert.ok(!/\b[A-Z]{1,2}\d{1,4}\b/.test(t), `coordenada de celda en: ${t}`)
    assert.ok(!/Obreros|Oficina 26|JORNALES \d/.test(t), `nombre de pestaña en: ${t}`)
    assert.ok(!/1s0KlEURR5Udi7vvy/.test(t), `id de spreadsheet en: ${t}`)
    assert.ok(!/orquestador|readSheetGrid|spreadsheet|supabase|\.mjs/i.test(t), `internals en: ${t}`)
    assert.ok(!/=[A-Z(]|=\d/.test(t), `fórmula de la planilla en: ${t}`)
  }
})

test('sin una consulta reconocible se devuelve la ayuda, no un error técnico', async () => {
  const r = await responderConsulta(fakeGoogleJornales(), null, { ahora: AHORA })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO_CONSULTA.NO_ES_CONSULTA)
  assert.match(r.texto, /Consultar asistencia/)
  assert.match(r.texto, /horas extra de hoy/)
})

// ── FECHA PEDIDA QUE NO SE ENTIENDE ─────────────────────────────────────────
// Encontrado validando contra el archivo real: "asistencia del 32/13" contestaba los
// números de HOY. Datos reales, día equivocado — el peor tipo de respuesta.

test('una fecha imposible NO se contesta por hoy: se dice que no se entendió', async () => {
  for (const texto of ['asistencia del 32/13', 'asistencia del 30/02', 'horas extra del 00/00']) {
    const q = parsear(texto)
    assert.ok(q, `${texto} sigue siendo una consulta`)
    assert.ok(q.fecha_ilegible, `${texto} marca la fecha como ilegible`)
    const r = await responderConsulta(fakeGoogleJornales(), q, { ahora: AHORA })
    assert.equal(r.ok, false, texto)
    assert.equal(r.motivo, MOTIVO_CONSULTA.FECHA_ILEGIBLE, texto)
    assert.match(r.texto, /No entend/)
    assert.doesNotMatch(r.texto, /Presentes:/, 'no puede colarse el resumen de otro día')
  }
})

test('la respuesta enseña el formato correcto y no filtra internals', async () => {
  const { r } = await responder('asistencia del 32/13')
  assert.match(r.texto, /29\/07|29 de julio|hoy/)
  assert.ok(!/1s0KlEURR5Udi7vvy|\.mjs|Obreros/.test(r.texto))
  assert.ok(r.texto.length < 200, 'breve, usable en el celular')
})

test('un rango con una punta ilegible tampoco se completa solo', async () => {
  const q = parsear('asistencia del 32/13 al 45/99')
  assert.ok(q?.fecha_ilegible)
  const r = await responderConsulta(fakeGoogleJornales(), q, { ahora: AHORA })
  assert.equal(r.motivo, MOTIVO_CONSULTA.FECHA_ILEGIBLE)
})

test('las fechas que SÍ se entienden siguen funcionando igual (sin falsos positivos)', async () => {
  for (const texto of ['asistencia de hoy', 'asistencia de ayer', 'asistencia del 29/07',
    'asistencia del 29 de julio', 'horas extra de julio', 'asistencia del 15/07 al 29/07']) {
    const q = parsear(texto)
    assert.ok(q, texto)
    assert.equal(q.fecha_ilegible, null, `${texto} NO debe marcarse ilegible`)
  }
})

test('el 31 de un mes de 30 días no se acepta en silencio', () => {
  assert.equal(interpretarFecha('31/04', FECHA_HOY), null)
  assert.ok(parsear('asistencia del 31/04')?.fecha_ilegible)
})

// ── CORRECCIONES DE PRODUCCIÓN ──────────────────────────────────────────────

test('una fórmula CON ERROR no se informa como ausencia ni como cero', async () => {
  const g = fakeGoogleJornales({ alLeer(grid) { grid.filas[20][idxCol('R')] = { valor: '#REF!', numero: null, formula: '=A1', derivada: false } } })
  const { r } = await responder('asistencia de hoy', { google: g })
  assert.equal(r.ok, true)
  assert.equal(r.datos.resumen.con_error, 1)
  assert.equal(r.datos.resumen.ausentes, 0, 'no se cuenta como ausencia')
  // La celda en error no aporta ni resta: el total del día es el mismo que sin ella.
  const base = await responder('asistencia de hoy')
  assert.equal(r.datos.resumen.horas_total, base.r.datos.resumen.horas_total)
  assert.equal(base.r.datos.resumen.con_error, 0)
  const t = renderConsulta({ consulta: parsear('asistencia de hoy'), datos: r.datos })
  assert.match(t, /VALOR NO INTERPRETABLE/)
  assert.doesNotMatch(t, /ausente \(0\)/)
})

test('las cargas normales siguen contándose igual con una celda en error al lado', async () => {
  const g = fakeGoogleJornales({ alLeer(grid) { grid.filas[20][idxCol('R')] = { valor: '#REF!', numero: null, formula: '=A1', derivada: false } } })
  const { r } = await responder('asistencia de hoy', { google: g })
  assert.ok(r.datos.resumen.personas >= 1)
  assert.equal(typeof r.datos.resumen.horas_normales, 'number')
})
