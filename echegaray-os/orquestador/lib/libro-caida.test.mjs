import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { avisoDeCaida, corridaVigente, evaluarContraVigente, SALTO_NETO } from './libro-caida.mjs'

// Las dos corridas de public.flujo_corrida del 17/09/2026: la de antes (≈1.306 · ≈ −$8M) y la de las 11:07.
const SANA = { movimientos: 1306, neto: -8_000_000 }
const ROTA = { movimientos: 435, neto: 419_749_338 }

describe('evaluarContraVigente', () => {
  it('EL CASO DEL 17/09: 435 movimientos contra 1.306 frena, y dice los dos motivos', () => {
    const e = evaluarContraVigente(ROTA, SANA)
    assert.equal(e.frena, true)
    assert.equal(e.motivos.length, 2)
    assert.match(e.motivos[0], /de 1306 a 435/)
    assert.match(e.motivos[1], /neto salta/)
    assert.match(avisoDeCaida(e, { donde: '_MOVIMIENTOS' }).join('\n'), /⛔ FRENO: _MOVIMIENTOS no publica/)
  })

  it('la corrida que REPARA la caída se publica: si no, el sistema queda congelado en la rota', () => {
    const e = evaluarContraVigente(SANA, ROTA)
    assert.equal(e.frena, false, e.motivos.join(' · '))
  })

  it('justo en el tope no frena; un movimiento por debajo, sí', () => {
    assert.equal(evaluarContraVigente({ movimientos: 900, neto: 0 }, { movimientos: 1000, neto: 0 }).frena, false)
    assert.equal(evaluarContraVigente({ movimientos: 899, neto: 0 }, { movimientos: 1000, neto: 0 }).frena, true)
  })

  it('el neto que salta sin que el libro gane movimientos frena aunque la cantidad no caiga', () => {
    const e = evaluarContraVigente({ movimientos: 1310, neto: SANA.neto + SALTO_NETO + 1 }, SANA)
    assert.equal(e.frena, true)
    assert.equal(evaluarContraVigente({ movimientos: 1310, neto: SANA.neto + 5_000_000 }, SANA).frena, false, 'el ruido diario no frena')
  })

  it('sin corrida vigente no hay contra qué: no frena', () => {
    assert.equal(evaluarContraVigente(ROTA, null).frena, false)
    assert.equal(evaluarContraVigente(ROTA, { movimientos: 0, neto: 0 }).frena, false)
  })

  it('la caída aceptada a mano exige un motivo con sustancia y queda en el aviso', () => {
    assert.equal(evaluarContraVigente(ROTA, SANA, { aceptada: 'sí' }).frena, true, 'un motivo vacío no es excepción')
    const e = evaluarContraVigente(ROTA, SANA, { aceptada: 'se retiró la fuente Recurrentes entera (07/09)' })
    assert.equal(e.frena, false)
    assert.match(avisoDeCaida(e, { donde: 'flujo_corrida' })[0], /ACEPTADO a mano: «se retiró/)
  })
})

describe('corridaVigente', () => {
  const fake = (tabla, filas) => async (sql) => (/to_regclass/.test(sql) ? { rows: [{ t: tabla }] } : { rows: filas })
  it('lee movimientos y neto de la vigente', async () => {
    assert.deepEqual(await corridaVigente(fake('public.flujo_corrida', [{ movimientos: '1306', neto: -8e6, corrida_en: 'x' }])),
      { movimientos: 1306, neto: -8e6, corrida_en: 'x' })
  })
  it('sin tabla o sin vigente devuelve null; un error de la base NO se traga', async () => {
    assert.equal(await corridaVigente(fake(null, [])), null)
    assert.equal(await corridaVigente(fake('public.flujo_corrida', [])), null)
    await assert.rejects(corridaVigente(async () => { throw new Error('conexión rechazada') }), /conexión rechazada/)
  })
})

describe('los dos escritores consultan el freno ANTES de escribir', () => {
  const src = (f) => readFileSync(join(import.meta.dirname, '..', 'scripts', f), 'utf8')
  it('libro-movimientos-pestana: evalúa antes de escribirYVerificar y sale sin escribir', () => {
    const s = src('libro-movimientos-pestana.mjs')
    const i = s.indexOf('evaluarContraVigente(')
    assert.ok(i > 0 && i < s.indexOf('await escribirYVerificar('), 'el libro escribe antes de mirar la caída')
    assert.match(s.slice(i, s.indexOf('await escribirYVerificar(')), /if \(caida\.frena\) \{ process\.exitCode = CODIGO_FRENO; return \}/)
  })
  it('sync-flujo-fondos: evalúa antes de abrir la corrida vigente', () => {
    const s = src('sync-flujo-fondos.mjs')
    const main = s.indexOf('async function main()')
    const i = s.indexOf('evaluarContraVigente(', main)
    assert.ok(i > main && i < s.indexOf('abrirCorrida(cli', main), 'flujo_corrida se publica antes de mirar la caída')
  })
})

describe('el umbral contra la historia real de flujo_corrida (17/09/2026)', () => {
  it('los saltos mayores observados sin caída (04/09 +$143M, 07/09 −$103M) no frenan; el defecto ($427M) sí', () => {
    assert.equal(evaluarContraVigente({ movimientos: 1176, neto: 177_514_426 }, { movimientos: 1176, neto: 34_394_225 }).frena, false)
    assert.equal(evaluarContraVigente({ movimientos: 1212, neto: 38_241_604 }, { movimientos: 1212, neto: 141_676_942 }).frena, false)
    assert.equal(evaluarContraVigente({ movimientos: 1306, neto: 419_749_339 }, { movimientos: 1306, neto: -7_858_342 }).frena, true,
      'aun sin caída de movimientos, el salto del defecto frena')
  })
})
