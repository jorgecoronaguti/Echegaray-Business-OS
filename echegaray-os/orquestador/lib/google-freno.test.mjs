// LA SUPERFICIE DEL BYPASS — qué entradas de escritura acepta la confirmación humana y cuáles no.
//
// El dueño decidió (03/08) que una persona identificada que confirma en el chat pueda escribir con el
// freno de mano puesto. Lo que este archivo fija es que esa puerta sea **una sola**: `batchUpdateValues`,
// que es la que usa la asistencia. `updateSheetValues`, `appendSheetValues`, `clearValues` y
// `batchUpdate` (estructura/formato) mantienen el freno DURO aunque se les pase la misma opción.
//
// Por qué importa que sea mínima: el freno existe porque el Sheet lo escriben muchos caminos y una
// lista de servicios apagados es una defensa por enumeración. Si la opción la aceptaran las cinco
// entradas, cualquier generador que "sepa" que hubo una persona la copiaría, y el freno volvería a
// depender de la buena fe de cada llamador. Se amplía cuando haya un caso, no antes.
//
// Hermético: sin credenciales, sin red, sin Postgres. El token y el fetch entran inyectados.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONFIRMADA = { actor: 'jcorona', motivo: 'asistencia del 03/08/2026 confirmada en el chat por jcorona' }

// LA MARCA SE PONE UNA SOLA VEZ, ANTES DEL PRIMER IMPORT, Y NO SE BORRA HASTA EL FINAL.
// `RUTA_MARCA` se evalúa al importar `congelador-sheets.mjs`, y ese módulo se cachea aunque a
// `google.mjs` se lo re-importe con query. Un temporal por test dejaba la ruta apuntando a un
// directorio ya borrado desde el segundo test: el freno "no frenaba" y los tests pasaban en verde
// sin haber ejercitado nada. Es exactamente el defecto que este archivo tiene que poder detectar.
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'freno-google-'))
const RUTA = path.join(DIR, 'SHEETS-CONGELADOS')
fs.writeFileSync(RUTA, 'congelado por pedido del dueño el 02/08')
process.env.ORQ_SHEETS_MARCA = RUTA
delete process.env.ORQ_SHEETS_DESCONGELAR
process.on('exit', () => fs.rmSync(DIR, { recursive: true, force: true }))

const { makeGoogleClient } = await import('./google.mjs')

/** Un cliente de Google con la marca de congelamiento PUESTA y sin salida a la red. */
async function conFreno(fn) {
  const llamadas = []
  const fetchImpl = async (url, opts = {}) => {
    llamadas.push({ url: String(url), metodo: opts.method ?? 'GET' })
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ properties: { locale: 'es_AR' }, values: [], valueRanges: [] }),
      text: async () => '{}',
    }
  }
  const cliente = makeGoogleClient({ fetchImpl, getToken: async () => 'token-de-prueba' })
  return fn(cliente, llamadas)
}

test('el arnés es válido: la marca está puesta y el freno frena de verdad', async () => {
  const { congelado } = await import('./congelador-sheets.mjs')
  assert.ok(congelado(), 'sin marca activa, todo lo que sigue pasaría en verde sin probar nada')
})

const RANGO = "'JORNALES'!AA26"

test('las OTRAS CUATRO entradas de escritura siguen frenadas aunque se les pase la confirmación', async () => {
  await conFreno(async (g, llamadas) => {
    const intentos = [
      ['updateSheetValues', () => g.updateSheetValues('FILE', RANGO, [[9]], { confirmacion: CONFIRMADA })],
      ['appendSheetValues', () => g.appendSheetValues('FILE', RANGO, [[9]], { confirmacion: CONFIRMADA })],
      ['clearValues', () => g.clearValues('FILE', RANGO, { confirmacion: CONFIRMADA })],
      ['spreadsheetBatchUpdate', () => g.spreadsheetBatchUpdate('FILE', [{ repeatCell: {} }], { confirmacion: CONFIRMADA })],
    ]
    for (const [nombre, correr] of intentos) {
      const r = await correr()
      assert.equal(r?.protegido, true, `${nombre} tiene que quedar frenada`)
      assert.equal(r?.congelado, true, `${nombre} tiene que decir que fue el FRENO, no un candado de pestaña`)
    }
    assert.deepEqual(llamadas, [], 'ninguna de las cuatro puede haber mandado un solo byte a Google')
  })
})

test('batchUpdateValues SÍ pasa con actor + motivo: es la entrada que usa la asistencia', async () => {
  await conFreno(async (g, llamadas) => {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [[9]] }], { confirmacion: CONFIRMADA })
    assert.notEqual(r?.congelado, true, 'con la confirmación humana el freno no puede ser el motivo del rechazo')
    assert.ok(llamadas.length > 0, 'la escritura tiene que haber llegado a la API')
  })
})

test('batchUpdateValues SIN confirmación sigue frenada — el default no cambió', async () => {
  await conFreno(async (g, llamadas) => {
    const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [[9]] }])
    assert.equal(r?.congelado, true)
    assert.deepEqual(llamadas, [])
  })
})

test('batchUpdateValues con una confirmación incompleta sigue frenada', async () => {
  await conFreno(async (g) => {
    const flojas = [
      { actor: '', motivo: CONFIRMADA.motivo },
      { actor: 'jcorona', motivo: 'ok' },
      { actor: 'jcorona' },
      true,
    ]
    for (const c of flojas) {
      const r = await g.batchUpdateValues('FILE', [{ range: RANGO, values: [[9]] }], { confirmacion: c })
      assert.equal(r?.congelado, true, `${JSON.stringify(c)} no puede levantar el freno`)
    }
  })
})
