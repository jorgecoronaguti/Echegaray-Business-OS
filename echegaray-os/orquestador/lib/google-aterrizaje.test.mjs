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
  const fila = [[313, '05/08/2026', 'Acreditación fondo desempleo']]
  const llego = armarCliente({ [RANGO]: [['313,00', 'otra cosa', 'Acreditación fondo desempleo']] })
  try {
    const r = await llego.g.batchUpdateValues('FILE', [{ range: RANGO, values: fila }])
    assert.equal(r.noAterrizo, undefined, 'el número localizado no puede tapar al testigo que sí llegó')
  } finally { llego.soltar() }
  const perdio = armarCliente({ [RANGO]: [['313,00', 'contenido viejo']] })
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

test('si la relectura falla, la guarda no verifica — y no acusa una pérdida que no vio', async () => {
  const { g, avisos, soltar } = armarCliente({ [RANGO]: [['contenido viejo']] }, { relecturaCae: true })
  try {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [['debitado x canje interno']] }])
    assert.equal(r.noAterrizo, undefined, 'no poder mirar no es lo mismo que haber visto la pérdida')
    assert.deepEqual(avisos, [])
  } finally { soltar() }
})
