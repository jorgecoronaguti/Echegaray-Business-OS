// LA ESCALERA DE LECTURA: barata por defecto, con un segundo par de ojos cuando la primera dudó.
//
// Sin red: `fetchImpl` está inyectado y devuelve lecturas fabricadas. Lo que se verifica es CUÁNDO
// se pide la segunda opinión, CÓMO se fusionan las dos, y que el prompt siga diciendo las cosas que
// están ahí por un defecto medido (lo manuscrito, la foto girada, los dos CUIT, el CAE).

import test from 'node:test'
import assert from 'node:assert/strict'
import { leerAdjunto, necesitaRevision, fusionar, bloqueImputacion, cuerpoDeLectura, PROMPT_LECTURA, MODELO_LECTURA, MODELO_REVISION } from './vision.mjs'

const ADJUNTO = { data: 'AAAA', mediaType: 'image/jpeg', nombre: 'f.jpg' }

/** Un `fetch` de mentira que contesta un JSON distinto por modelo y anota a quién se le preguntó. */
function apiFalsa(porModelo) {
  const llamados = []
  const fetchImpl = async (_url, opciones) => {
    const body = JSON.parse(opciones.body)
    llamados.push(body.model)
    const crudo = porModelo[body.model]
    if (!crudo) return { ok: false, status: 500 }
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(crudo) }] }) }
  }
  return { fetchImpl, llamados }
}

const BIEN = {
  emisor: 'Corralon Progreso', cuit: '23369111574', letra: 'A', numero: '0004-00003642',
  cae: '86316017919602', fecha: '30/07/2026', neto_gravado: '51.239,67', iva_21: '10.760,33',
  iva_105: '0', otros_tributos: '0', total: '62.000,00', anotacion_manuscrita: 'Messinas BSA',
  legible: true, dudas: [],
}

// ── Cuándo se escala ─────────────────────────────────────────────────────────

test('una lectura completa y que CIERRA no gasta una segunda llamada', async () => {
  assert.deepEqual(necesitaRevision(BIEN), [])
  const { fetchImpl, llamados } = apiFalsa({ [MODELO_LECTURA]: BIEN })
  const r = await leerAdjunto(ADJUNTO, { apiKey: 'k', fetchImpl })
  assert.equal(r.ok, true)
  assert.deepEqual(llamados, [MODELO_LECTURA], 'una sola llamada, al modelo barato')
})

test('los cuatro síntomas de la lectura que falló en producción disparan la revisión', () => {
  assert.match(necesitaRevision({ ...BIEN, legible: false }).join(), /ilegible/)
  assert.match(necesitaRevision({ ...BIEN, total: null }).join(), /total/)
  assert.match(necesitaRevision({ ...BIEN, anotacion_manuscrita: null }).join(), /manuscrita/)
  // El caso textual: copió el total en el lugar del neto y nada cierra.
  assert.match(necesitaRevision({ ...BIEN, neto_gravado: '62.000,00' }).join(), /no cierra con el total/)
})

test('la revisión usa un modelo distinto y las dos lecturas se FUSIONAN', async () => {
  const primera = { ...BIEN, numero: '0004-00036542', anotacion_manuscrita: null, legible: false }
  const segunda = { ...BIEN, emisor: 'MATERIALES DE CONSTRUCCION' }
  const { fetchImpl, llamados } = apiFalsa({ [MODELO_LECTURA]: primera, [MODELO_REVISION]: segunda })
  const r = await leerAdjunto(ADJUNTO, { apiKey: 'k', fetchImpl })
  assert.deepEqual(llamados, [MODELO_LECTURA, MODELO_REVISION])
  assert.equal(r.crudo.numero, '0004-00003642', 'manda lo que leyó la revisión')
  assert.equal(r.crudo.anotacion_manuscrita, 'Messinas BSA')
  assert.equal(r.crudo.emisor_alt, 'Corralon Progreso', 'el otro nombre se conserva: decide el desplegable')
  assert.equal(r.revision.hubo, true)
})

test('si la REVISIÓN falla, se devuelve la primera lectura en vez de no leer nada', async () => {
  const primera = { ...BIEN, anotacion_manuscrita: null }
  const { fetchImpl } = apiFalsa({ [MODELO_LECTURA]: primera }) // el de revisión devuelve 500
  const r = await leerAdjunto(ADJUNTO, { apiKey: 'k', fetchImpl })
  assert.equal(r.ok, true)
  assert.equal(r.crudo.numero, '0004-00003642')
  assert.match(r.revision.error, /falló/)
})

test('con la revisión apagada no se escala aunque haya motivos', async () => {
  const { fetchImpl, llamados } = apiFalsa({ [MODELO_LECTURA]: { ...BIEN, legible: false } })
  const r = await leerAdjunto(ADJUNTO, { apiKey: 'k', fetchImpl, modeloRevision: null })
  assert.equal(r.ok, true)
  assert.equal(llamados.length, 1)
  assert.equal(r.revision.hubo, false)
})

// ── La fusión ────────────────────────────────────────────────────────────────

test('la revisión no BORRA lo que la primera sí había leído', () => {
  const f = fusionar({ ...BIEN }, { numero: null, total: null, anotacion_manuscrita: 'Messinas BSA' })
  assert.equal(f.numero, '0004-00003642')
  assert.equal(f.total, '62.000,00')
})

test('un comprobante es legible sólo si NINGUNA de las dos pasadas dijo lo contrario', () => {
  assert.equal(fusionar({ legible: true }, { legible: false }).legible, false)
  assert.equal(fusionar({ legible: false }, { legible: true }).legible, false)
  assert.equal(fusionar({ legible: true }, { legible: true }).legible, true)
})

// ── El prompt: cada línea está por un defecto ───────────────────────────────

test('el prompt pide explícitamente lo manuscrito, en cualquier margen y con la foto girada', () => {
  assert.match(PROMPT_LECTURA, /ESCRITO A MANO/)
  assert.match(PROMPT_LECTURA, /cualquier margen/)
  assert.match(PROMPT_LECTURA, /GIRADA/)
  // LA TRANSCRIPCIÓN LITERAL SE MANTIENE APARTE de la imputación. Desde el 04/08 el modelo también
  // imputa —con las listas de las columnas delante—, pero "anotacion_manuscrita" sigue siendo lo que
  // el papel decía, sin corregir: si después hay que discutir a qué obra fue, está el original.
  assert.match(PROMPT_LECTURA, /TAL CUAL, letra por letra, sin corregirlo ni interpretarlo/)
  assert.match(PROMPT_LECTURA, /la transcripción literal viaja igual y aparte/)
})

// ═══ EL MODELO IMPUTA CON LAS LISTAS DELANTE, O NO IMPUTA (04/08) ═══
//
// Transcribía "HW DX 2018" y ahí terminaba: el matcheo de texto de después no encuentra ninguna obra
// que se llame así, porque eso no es una obra — es un VEHÍCULO. Una persona lo resuelve porque sabe
// que existe una obra "Vehiculos / Maquinas". Lo único que le faltaba al modelo era la lista.
test('el bloque de imputación trae las listas EXACTAS de las tres columnas', () => {
  const b = bloqueImputacion({
    obras: ['MESSINA', 'Vehiculos / Maquinas'],
    unidades: ['Civil', 'Mantenimiento'],
    detalles: { MESSINA: ['Camion - BSA'] },
  })
  assert.match(b, /MESSINA/)
  assert.match(b, /Vehiculos \/ Maquinas/)
  assert.match(b, /Mantenimiento/)
  assert.match(b, /Camion - BSA/)
  // LA REGLA QUE IMPIDE QUE ESTO SE VUELVA FABRICACIÓN: valor exacto de la lista, o null.
  assert.match(b, /EXACTO de las listas/)
  assert.match(b, /o poné null/)
  assert.match(b, /peor que uno\nsin imputar/)
  // Y le pide el porqué: una imputación que no se puede discutir no se puede corregir.
  assert.match(b, /por_que_esa_obra/)
})

test('sin listas no hay bloque de imputación: no se le pide elegir a ciegas', () => {
  assert.equal(bloqueImputacion({}), null)
  assert.equal(bloqueImputacion({ obras: [], unidades: [] }), null)
})

test('el prompt avisa que hay DOS CUIT y pide el CAE', () => {
  assert.match(PROMPT_LECTURA, /dos CUIT/)
  assert.match(PROMPT_LECTURA, /ECHEGARAY CONSTRUCCIONES/)
  assert.match(PROMPT_LECTURA, /CAE/)
})

test('el prompt PERMITE dudar: exigir un valor es cómo se fabricó un importe inventado', () => {
  assert.match(PROMPT_LECTURA, /DUDAR ESTÁ PERMITIDO; INVENTAR NO/)
})

// ── Optimización 26/09: no pagar el modelo grande por lo que el papel no puede tener ─────────

test('un PDF sin anotación manuscrita NO va a revisión; una foto sí', async () => {
  const sinMano = { ...BIEN, anotacion_manuscrita: null }
  assert.deepEqual(necesitaRevision(sinMano, { esImagen: false }), [])
  assert.match(necesitaRevision(sinMano).join(), /manuscrita/, 'por defecto se trata como foto')
  const pdf = { data: Buffer.from('%PDF-1.4 escaneado sin texto').toString('base64'), mediaType: 'application/pdf', nombre: 'x.pdf' }
  const { fetchImpl, llamados } = apiFalsa({ [MODELO_LECTURA]: sinMano, [MODELO_REVISION]: sinMano })
  const r = await leerAdjunto(pdf, { apiKey: 'k', fetchImpl })
  assert.equal(r.ok, true)
  assert.deepEqual(llamados, [MODELO_LECTURA], 'el PDF se lee una sola vez')
  const foto = apiFalsa({ [MODELO_LECTURA]: sinMano, [MODELO_REVISION]: sinMano })
  await leerAdjunto(ADJUNTO, { apiKey: 'k', fetchImpl: foto.fetchImpl })
  assert.deepEqual(foto.llamados, [MODELO_LECTURA, MODELO_REVISION], 'la foto sí busca la mano dos veces')
})

test('lo no gravado/exento entra en la identidad: DESPEGAR no escala ni frena', () => {
  // neto 100.000 + IVA 21.000 + tasa exenta 15.000 = 136.000
  const despegar = { ...BIEN, neto_gravado: '100.000,00', iva_21: '21.000,00', otros_tributos: '0', total: '136.000,00' }
  assert.match(necesitaRevision(despegar).join(), /no cierra/, 'sin el campo, no cierra')
  assert.deepEqual(necesitaRevision({ ...despegar, no_gravado_exento: '15.000,00' }), [])
  assert.match(PROMPT_LECTURA, /no_gravado_exento/)
})

test('26/09: las instrucciones van al system con caché; la foto sola en el mensaje; pelado sin caché', () => {
  const b = cuerpoDeLectura({ modelo: 'claude-sonnet-5', maxTokens: 6000, bloque: { type: 'image' }, prompt: PROMPT_LECTURA })
  assert.equal(b.system[0].text, PROMPT_LECTURA)
  assert.deepEqual(b.system[0].cache_control, { type: 'ephemeral' })
  assert.equal(b.messages[0].content[0].type, 'image')
  assert.doesNotMatch(b.messages[0].content[1].text, /anotacion_manuscrita/, 'el prompt no se duplica en el mensaje')
  assert.equal(b.temperature, undefined)
  const pelado = cuerpoDeLectura({ modelo: 'claude-sonnet-5', maxTokens: 6000, bloque: { type: 'image' }, prompt: PROMPT_LECTURA, pelado: true })
  assert.equal(pelado.system[0].cache_control, undefined)
  assert.equal(pelado.system[0].text, PROMPT_LECTURA, 'pelado conserva las instrucciones')
})

test('26/09: effort sólo a los modelos que lo aceptan, y el pelado lo saca', () => {
  const arg = { maxTokens: 6000, bloque: { type: 'image' }, prompt: 'x', effort: 'low' }
  assert.deepEqual(cuerpoDeLectura({ ...arg, modelo: 'claude-sonnet-5' }).output_config, { effort: 'low' })
  assert.deepEqual(cuerpoDeLectura({ ...arg, modelo: 'claude-opus-5' }).output_config, { effort: 'low' })
  assert.equal(cuerpoDeLectura({ ...arg, modelo: 'claude-haiku-4-5' }).output_config, undefined)
  assert.equal(cuerpoDeLectura({ ...arg, modelo: 'claude-sonnet-5', pelado: true }).output_config, undefined)
  assert.equal(cuerpoDeLectura({ ...arg, modelo: 'claude-sonnet-5', effort: null }).output_config, undefined)
})
