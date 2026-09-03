// LO QUE PRUEBA UNA ESCRITURA ES EL DATO LEÍDO EN SU DESTINO — la guarda de aterrizaje.
//
// El 05/08 la API contestó `totalUpdatedCells: 2` sobre "Cheques Emitidos" y la celda se quedó con
// su contenido viejo: una escritura perdida en silencio deja al generador felicitándose sobre datos
// viejos. `batchUpdateValues` ahora RELEE el destino y, si el dato no está, devuelve `noAterrizo`.
//
// Lo segundo que este archivo fija es igual de importante: la guarda NO puede gritar en falso. La
// primera versión comparaba el primer valor no vacío y explotó a la primera corrida real — un
// 67981.02 escrito con USER_ENTERED vuelve "67.981,02" y una fecha vuelve transformada. El testigo
// tiene que ser un TEXTO plano, que hace el viaje de ida y vuelta sin cambiar; si el lote no tiene
// ninguno, no se verifica y no se miente.
//
// Hermético: sin credenciales, sin red, sin Postgres. La marca del freno se apunta a una ruta
// inexistente ANTES del primer import — la real vive en ~/.config y está puesta.

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.ORQ_SHEETS_MARCA = path.join(os.tmpdir(), 'no-existe', 'SHEETS-CONGELADOS')
delete process.env.ORQ_SHEETS_DESCONGELAR

// ═══ Y LA BASE TAMBIÉN SE AÍSLA (03/09) ═══
//
// «Hermético: sin Postgres» decía este encabezado y no era cierto: `db.mjs` es el real, así que
// cuando la propiedad por celda se enchufó al portón estos tests empezaron a consultar —y a intentar
// escribir— la base PRODUCTIVA, y la guarda de escrituras en prueba los puso en rojo. Es la trampa
// que el repo ya tiene escrita: un test que "no toca la base" hasta que alguien agrega una guarda que
// sí la toca. Se intercepta el módulo, como hacen los tests del portón.
//
// La base falsa responde "no tengo ninguna huella de esta pestaña": es el estado real de las que
// escriben estos generadores, y hace que la huella no decida (primera corrida) en vez de congelar.
const { registerHooks } = await import('node:module')
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbAterrizaje(...a)' }
  },
})
globalThis.__dbAterrizaje = async (sql) => {
  if (/to_regclass/.test(String(sql))) return { rows: [{ t: 'public.sheet_huella_celda' }] }
  return { rows: [] }
}

const { makeGoogleClient } = await import('./google.mjs')

/**
 * Un cliente sin red: el batchUpdate contesta que sí (como la API real aquel día), y cada relectura
 * devuelve lo que `destino` diga para ese rango. `relecturaCae` hace fallar las lecturas DESPUÉS
 * del POST — antes tienen que andar, porque no-borrar relee el destino antes de cada escritura y
 * sin esa lectura descarta el rango: la escritura nunca ocurriría y el test probaría otra guarda.
 * El 404 es a propósito: un 5xx dispara la escalera de reintentos y el test se va a segundos.
 */
function armarCliente(destino = {}, { relecturaCae = false } = {}) {
  const avisos = []
  let escrito = false
  const warnOriginal = console.warn
  console.warn = (...a) => { avisos.push(a.join(' ')) }
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url)
    const responder = (json) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => json, text: async () => JSON.stringify(json) })
    if ((opts.method ?? 'GET') === 'GET' && u.includes('/values/')) {
      if (escrito && relecturaCae) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}), text: async () => 'se cayó la relectura' }
      const rango = decodeURIComponent(u.split('/values/')[1].split('?')[0])
      return responder({ values: destino[rango] ?? [] })
    }
    if (u.includes('values:batchUpdate')) escrito = true
    return responder({ properties: { locale: 'es_AR' }, totalUpdatedCells: 99, responses: [], values: [], valueRanges: [] })
  }
  const g = makeGoogleClient({ fetchImpl, getToken: async () => 'token-de-prueba' })
  return { g, avisos, soltar: () => { console.warn = warnOriginal } }
}

const RANGO = "'Cheques Emitidos'!B7"

test('una escritura que la API acepta y el destino no muestra se dice con nombre y apellido', async () => {
  const { g, avisos, soltar } = armarCliente({ [RANGO]: [['contenido viejo', 'q no es el escrito']] })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [['debitado x canje interno', 123]] }])
    assert.deepEqual(r.noAterrizo, [RANGO], 'el rango perdido tiene que venir señalado en la respuesta')
    assert.ok(avisos.some((a) => a.includes('NO ATERRIZÓ')), 'y avisado en el log, no sólo en el retorno')
  } finally { soltar() }
})

test('la misma escritura, cuando el destino SÍ la muestra, pasa en silencio', async () => {
  const { g, avisos, soltar } = armarCliente({ [RANGO]: [['debitado x canje interno', '123']] })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [['debitado x canje interno', 123]] }])
    assert.equal(r.noAterrizo, undefined)
    assert.deepEqual(avisos, [])
  } finally { soltar() }
})

test('EL FALSO POSITIVO PAGADO: un lote de solo números no grita aunque vuelvan localizados', async () => {
  // 67981.02 con USER_ENTERED vuelve "67.981,02": comparar eso como String era gritar en falso.
  // Sin un texto plano de testigo, la guarda no verifica — y tampoco miente diciendo que verificó.
  const { g, avisos, soltar } = armarCliente({ [RANGO]: [['67.981,02', '04/08/2026']] })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [[67981.02, '04/08/2026']] }])
    assert.equal(r.noAterrizo, undefined, 'un número localizado por el Sheet no es una escritura perdida')
    assert.deepEqual(avisos, [], 'una guarda que grita en falso se termina ignorando')
  } finally { soltar() }
})

test('fechas, montos con símbolo, guiones y fórmulas no sirven de testigo', async () => {
  // Todos hacen el viaje de ida y vuelta TRANSFORMADOS: la fecha a número de serie, el monto al
  // formato del Sheet, la fórmula a su resultado. Ninguno puede decidir si la escritura aterrizó.
  const { g, avisos, soltar } = armarCliente({ [RANGO]: [[45873, '1234,56', '-', 55]] })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [['04/08/2026', '$ 1.234,56', '-', '=SUMA(A1;A2)']] }])
    assert.equal(r.noAterrizo, undefined)
    assert.deepEqual(avisos, [])
  } finally { soltar() }
})

test('el testigo es el primer TEXTO plano: los números de adelante no lo tapan', async () => {
  // La fila real mezcla números, fecha y texto. El número vuelve distinto (localizado) y NO tiene
  // que gritar; el texto es el que decide — presente, todo bien; ausente, se señala el rango.
  // El testigo está en la 3ª columna del lote, que arranca en B7: se relee D7 (13/08). Antes se
  // releía el rango mandado y el mock devolvía la fila entera — algo que la API real no hace con un
  // rango de una celda.
  const fila = [[313, '05/08/2026', 'Acreditación fondo desempleo']]
  const llego = armarCliente({ "'Cheques Emitidos'!D7": [['Acreditación fondo desempleo']] })
  try {
    const r = await llego.g.batchUpdateValues('FILE', [{ range: RANGO, values: fila }])
    assert.equal(r.noAterrizo, undefined, 'el número localizado no puede tapar al testigo que sí llegó')
  } finally { llego.soltar() }
  const perdio = armarCliente({ "'Cheques Emitidos'!D7": [['contenido viejo']] })
  try {
    const r = await perdio.g.batchUpdateValues('FILE', [{ range: RANGO, values: fila }])
    assert.deepEqual(r.noAterrizo, [RANGO], 'sin el texto en el destino, la escritura se perdió')
  } finally { perdio.soltar() }
})

test('dos rangos, uno perdido: se señala SOLO el perdido', async () => {
  const OTRO = "'Caja'!A1"
  const { g, soltar } = armarCliente({
    [RANGO]: [['contenido viejo']],
    [OTRO]: [['saldo declarado x extracto']],
  })
  try {
    const r = await g.batchUpdateValues('FILE', [
      { range: RANGO, values: [['debitado x canje interno']] },
      { range: OTRO, values: [['saldo declarado x extracto']] },
    ])
    assert.deepEqual(r.noAterrizo, [RANGO])
  } finally { soltar() }
})

test('EL FALSO POSITIVO DEL 13/08: un lote anclado se verifica donde quedó el dato, no en el ancla', async () => {
  // `escribirPreservando` manda el ANCLA con la matriz entera: range '_J_OBREROS!A201' + 200 filas.
  // La guarda leía A201 —una celda vacía— y buscaba ahí el testigo "UOCRA", que quedó en B202.
  // El espejo estaba perfecto y la corrida salía "NO ATERRIZÓ". Verificado contra el Sheet real:
  // las filas 201-206 de _J_OBREROS son idénticas a las de 'Obreros 26'.
  const values = [
    ['', '', '', '', '', 15, 17, 17],
    ['', 'UOCRA', 'enero'],
    ['', 'Oficial Especializado', '$5.470,00'],
  ]
  // Desde el 14/08 se miran VARIOS testigos repartidos (uno por fila con texto plano) en UNA sola
  // relectura del rectángulo que los cubre: con un testigo único, un lote que aterriza la cabecera y
  // descarta el cuerpo pasaba por bueno. Acá los dos aterrizaron y la guarda tiene que callarse.
  const { g, avisos, soltar } = armarCliente({
    '_J_OBREROS!A201': [],            // el ancla está vacía: leerla no prueba nada
    '_J_OBREROS!B202:B203': [['UOCRA'], ['Oficial Especializado']],
  })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: '_J_OBREROS!A201', values }])
    assert.equal(r.noAterrizo, undefined, 'el bloque aterrizó: la guarda no puede acusar una pérdida')
    assert.deepEqual(avisos, [], 'una alarma que grita en falso se termina ignorando')
  } finally { soltar() }
})

test('el mismo lote anclado, cuando el bloque de verdad se perdió, se señala con la celda que se miró', async () => {
  // La contracara: si la guarda dejara de verificar los lotes anclados, este caso pasaría en verde.
  const values = [['', '', ''], ['', 'UOCRA', 'enero']]
  const { g, avisos, soltar } = armarCliente({ '_J_OBREROS!B202': [['contenido viejo']] })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: '_J_OBREROS!A201', values }])
    assert.deepEqual(r.noAterrizo, ['_J_OBREROS!A201'])
    assert.ok(avisos.some((a) => a.includes('miré _J_OBREROS!B202') && a.includes('UOCRA')),
      'el aviso tiene que decir dónde miró y qué esperaba, no sólo el rango')
  } finally { soltar() }
})

test('si la relectura falla, la guarda no verifica — y no acusa una pérdida que no vio', async () => {
  const { g, avisos, soltar } = armarCliente({ [RANGO]: [['contenido viejo']] }, { relecturaCae: true })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [['debitado x canje interno']] }])
    assert.equal(r.noAterrizo, undefined, 'no poder mirar no es lo mismo que haber visto la pérdida')
    assert.deepEqual(avisos, [])
  } finally { soltar() }
})
