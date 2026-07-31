import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretar, interpretarDeterministico, PREGUNTA_TIPO } from './interpretar.mjs'
import { CAPACIDAD, INTENCION } from './contratos.mjs'
import { fetchProhibido, fetchAnthropic } from './dobles-de-prueba.mjs'

// VIERNES 31/07/2026, 12:00 en San Juan. Fijo: una prueba de fechas con `new Date()` real
// pasa hoy y falla el martes que viene.
const AHORA = new Date('2026-07-31T12:00:00-03:00')
const leer = (t) => interpretarDeterministico(t, { ahora: AHORA })

// ── Clasificación ────────────────────────────────────────────────────────────

test('el voseo no rompe la gramática (el \\b va sólo al inicio de la raíz)', () => {
  // Este es el bug que ya mordió en schedule-intent.mjs: en JS `\b` es ASCII y no cierra
  // después de una vocal acentuada. Si alguien "arregla" las regex agregando \b al final,
  // estas líneas se ponen en rojo.
  for (const t of ['recordá comprar cemento mañana', 'recordame comprar cemento mañana',
    'recordámelo mañana', 'avisá mañana que viene el inspector']) {
    assert.equal(leer(t)?.intencion, CAPACIDAD.RECORDATORIO_CREAR, t)
  }
  assert.equal(leer('agendá la visita el jueves a las 10')?.intencion, CAPACIDAD.CALENDAR_EVENTO_CREAR)
  assert.equal(leer('agenda la visita el jueves a las 10')?.intencion, CAPACIDAD.CALENDAR_EVENTO_CREAR)
})

test('recordatorio, evento y tarea son TRES cosas distintas y se distinguen por el verbo', () => {
  assert.equal(leer('recordame el lunes a las 8 pagar IERIC')?.intencion, CAPACIDAD.RECORDATORIO_CREAR)
  assert.equal(leer('avisale a Rodrigo que mañana viene el inspector')?.intencion, CAPACIDAD.RECORDATORIO_CREAR)
  assert.equal(leer('agendá reunión con Rodrigo el jueves a las 10')?.intencion, CAPACIDAD.CALENDAR_EVENTO_CREAR)
  assert.equal(leer('poné en el calendario la inspección del martes 9hs')?.intencion, CAPACIDAD.CALENDAR_EVENTO_CREAR)
  assert.equal(leer('creá una tarea: presentar el F931')?.intencion, CAPACIDAD.TASKS_TAREA_CREAR)
  assert.equal(leer('agregá como tarea pedir el remito')?.intencion, CAPACIDAD.TASKS_TAREA_CREAR)
})

test('buscar un archivo necesita el verbo Y el objeto: "buscá a Juan" no es Drive', () => {
  assert.equal(leer('buscame el contrato de la Estrella')?.intencion, CAPACIDAD.DRIVE_BUSCAR)
  assert.equal(leer('necesito la planilla de flujo de caja')?.intencion, CAPACIDAD.DRIVE_BUSCAR)
  assert.equal(leer('pasame la factura de Cerámica San Juan')?.intencion, CAPACIDAD.DRIVE_BUSCAR)
  assert.equal(leer('buscá a Juan'), null)
})

test('la ayuda se pide de muchas formas y todas caen en la misma capacidad', () => {
  for (const t of ['¿qué sabés hacer?', '¿en qué me podés ayudar?', '¿qué funciones tenés?',
    '¿qué puedo pedirte?', 'ayuda']) {
    assert.equal(leer(t)?.intencion, CAPACIDAD.AYUDA, t)
  }
})

test('NO reclama lo que es de otro especialista', () => {
  // Vocabulario real de Personal IA y de consultas de dominio: si el asistente los reclamara,
  // le secuestraría el mensaje a quien sí sabe atenderlo.
  for (const t of ['3 ausente', 'quién trabajó ayer', 'horas extra del 17/01', 'asistencia',
    'cuánta caja tengo hoy', 'estado del sistema', 'qué sabés de la obra La Estrella']) {
    assert.equal(leer(t), null, t)
  }
})

// ── Parámetros ───────────────────────────────────────────────────────────────

test('la fecha la resuelve tiempo.mjs y el contenido queda limpio', () => {
  const r = leer('recordame el lunes a las 8 pagar IERIC')
  assert.equal(r.parametros.cuando, '2026-08-03T08:00:00-03:00')
  assert.equal(r.parametros.contenido, 'pagar IERIC')
  assert.equal(r.parametros.cadencia, null)
})

test('un día suelto NO es una recurrencia (el error clásico de reusar parseCadence crudo)', () => {
  assert.equal(leer('recordame el lunes a las 8 pagar IERIC').parametros.cadencia, null)
  assert.equal(leer('recordame todos los lunes a las 8 revisar cobranzas').parametros.cadencia, 'weekly:lun:08:00')
})

test('la frase de recurrencia no queda pegada al contenido', () => {
  assert.equal(leer('recordame todos los lunes a las 8 revisar cobranzas').parametros.contenido, 'revisar cobranzas')
})

test('el destinatario sale del pedido, sin resolverse todavía', () => {
  assert.equal(leer('avisale a Rodrigo que mañana viene el inspector').parametros.destinatario, 'Rodrigo')
  assert.equal(leer('avisale a Juan Pablo que el viernes hay que entregar el remito').parametros.destinatario, 'Juan Pablo')
  assert.equal(leer('recordame mañana comprar cemento').parametros.destinatario, null, 'para mí mismo')
  // El intérprete NO inventa identidades: eso lo hace el router contra la tabla.
  assert.equal(leer('avisale a Rodrigo que mañana viene el inspector').parametros.destinatarioUserId, null)
})

test('los invitados de un evento son nombres, no emails, y no se comen la frase temporal', () => {
  const r = leer('reunión con Rodrigo y Juan Pablo mañana a las 9 de 2 horas')
  assert.deepEqual(r.parametros.invitados, ['Rodrigo', 'Juan Pablo'])
  assert.deepEqual(r.parametros.participantes, [], 'los emails los resuelve el router')
  assert.equal(r.parametros.duracionMin, 120)
  assert.equal(r.parametros.inicio, '2026-08-01T09:00:00-03:00')
})

test('un recordatorio sin cuándo declara el faltante en vez de inventar una hora', () => {
  const r = leer('recordame comprar cemento')
  assert.equal(r.intencion, CAPACIDAD.RECORDATORIO_CREAR)
  assert.deepEqual(r.faltantes, ['cuando'])
})

// ── Ambigüedades declaradas ──────────────────────────────────────────────────

test('"creá algo para el jueves" no se adivina: se pregunta de qué tipo', () => {
  const r = leer('programame algo para el jueves a las 9')
  assert.equal(r.intencion, INTENCION.DESCONOCIDO)
  assert.equal(r.ambiguedad, PREGUNTA_TIPO)
  assert.equal(r.parametros.cuando, '2026-08-06T09:00:00-03:00', 'lo entendido no se tira')
})

test('un día con dos lecturas viaja como ambigüedad, con las dos opciones', () => {
  // Hoy es viernes: "el sábado que viene" puede ser mañana o dentro de ocho días.
  const r = leer('recordame el sábado que viene a las 10 llamar al contador')
  assert.ok(r.ambiguedad, 'la ambigüedad se declara')
  assert.equal(r.opcionesTiempo.length, 2)
  assert.notEqual(r.opcionesTiempo[0].valor, r.opcionesTiempo[1].valor)
})

// ── Costo: el modelo es la excepción ─────────────────────────────────────────

test('si el camino determinístico alcanzó, NO se llama al modelo', async () => {
  const fetchImpl = fetchProhibido()
  for (const t of ['recordame mañana comprar cemento', 'buscame el contrato de la Estrella',
    '¿qué sabés hacer?', 'agendá la visita el jueves a las 10']) {
    const r = await interpretar(t, { ahora: AHORA, apiKey: 'sk-test', fetchImpl, catalogo: 'x: y' })
    assert.equal(r.via, 'deterministico', t)
  }
})

test('sin clave de API, lo que la gramática no reconoce queda en desconocido (no se adivina)', async () => {
  const r = await interpretar('che, fijate eso del otro día', { ahora: AHORA, apiKey: null, catalogo: 'x: y' })
  assert.equal(r.intencion, INTENCION.DESCONOCIDO)
})

test('cuando el modelo interviene, la fecha la sigue calculando el OS', async () => {
  const fetchImpl = fetchAnthropic(JSON.stringify({
    intencion: CAPACIDAD.RECORDATORIO_CREAR,
    // El modelo devuelve la FRASE, no una fecha: si devolviera "2026-01-01" no se usaría.
    frase_temporal: 'el jueves a las 15', destinatario: null,
    contenido: 'mandar la documentación', confianza: 0.8,
  }))
  const r = await interpretar('che, lo de la documentación el jueves a las 15', {
    ahora: AHORA, apiKey: 'sk-test', fetchImpl, catalogo: `${CAPACIDAD.RECORDATORIO_CREAR}: recordarte algo`,
    idsHabilitados: [CAPACIDAD.RECORDATORIO_CREAR],
  })
  assert.equal(r.via, 'modelo')
  assert.equal(r.parametros.cuando, '2026-08-06T15:00:00-03:00')
  assert.equal(r.parametros.contenido, 'mandar la documentación')
  assert.equal(fetchImpl.llamadas.length, 1, 'una sola llamada')
})

test('al modelo se le manda el mensaje y el catálogo, nunca el historial ni datos de la empresa', async () => {
  const fetchImpl = fetchAnthropic('{"intencion":"desconocido"}')
  await interpretar('algo raro', {
    ahora: AHORA, apiKey: 'sk-test', fetchImpl, quienPide: 'Jorge',
    catalogo: 'ayuda: decirte qué sé hacer', idsHabilitados: ['ayuda'],
    // Ruido que NO tiene que viajar aunque venga en el contexto.
    historial: ['mensaje viejo del canal'], saldoCaja: 17_690_000,
  })
  const { body } = fetchImpl.llamadas[0]
  const prompt = body.messages[0].content
  assert.ok(prompt.includes('algo raro') && prompt.includes('ayuda: decirte qué sé hacer'))
  assert.equal(prompt.includes('mensaje viejo del canal'), false)
  assert.equal(prompt.includes('17690000'), false)
  assert.ok(body.max_tokens <= 300 && body.temperature === 0)
  assert.ok(prompt.length < 1200, `el prompt tiene que ser chico, mide ${prompt.length}`)
})

test('una salida del modelo que no valida NO se convierte en una capacidad adivinada', async () => {
  for (const salida of ['no es json', '{"intencion":"borrar_todo"}', '{"intencion":"drive.buscar"}']) {
    const r = await interpretar('algo raro', {
      ahora: AHORA, apiKey: 'sk-test', fetchImpl: fetchAnthropic(salida),
      catalogo: 'ayuda: x', idsHabilitados: ['ayuda'],
    })
    assert.equal(r.intencion, INTENCION.DESCONOCIDO, salida)
  }
})
