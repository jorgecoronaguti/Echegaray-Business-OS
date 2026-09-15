// «TODAS LAS CELDAS EDITABLES» (dueño, 15/09/2026): después de ea978cc5 las únicas derivadas del cuadro eran Horas (el
// total de la fila) y Hs negro. Pasan a override manual, con el mismo patrón que las demás.
//
// ═══ POR QUÉ `horas_manual` Y NO `horas` ═══
//
// `liquidacion_linea.horas` es la cifra SELLADA: `cerrarQuincena` la escribe en cada línea (274 de 274 cerradas la
// tienen, 0 de las abiertas, sondeo del 15/09/2026). Leerla como override hacía que, al reabrir una quincena, las
// horas selladas volvieran como «manual» sin que nadie las escribiera.
//
// MUTACIONES QUE LO PONEN ROJO: Hs negro manual ignorada; el recargo sumado a la manual; el aviso que nunca aparece;
// leer la sellada como override.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aplicarOverrides, CAMPOS_EDITABLES, COLUMNA_DE, horasNoCoincidenConLosDias, rechazoDelValorDeCelda,
} from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { sueldoBlancoNegro, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** Rosales Q2-08: 94 h en los días, recibo 50 h, neto $230.240,12, $/h negro $5.874. */
const RECIBO: ReciboDeSueldo = {
  personaId: 'rosales', cuil: null, periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348,
  horasBlanco: 50, bruto: 317400, neto: 230240.12, driveFileId: null,
}
const base = () => liquidarLinea({
  personaId: 'rosales', nombre: 'ROSALES', horas: 94,
  tarifa: { valorHora: 5874, netoMensual: null, desde: '2026-08-16', origen: 't' },
  adelanto: 0, yaTransferido: 0, reciboNeto: 230240.12, giroEnElLote: true,
}, 'obreros')
const conRecibo = { recibo: RECIBO, netoDeNomina: 230240.12, pisoCategoria: 6348, proporcion: null }
const sinRecibo = { recibo: null, netoDeNomina: null, pisoCategoria: 6348, proporcion: { cociente: 0.8, origen: 'plantel' as const, recibos: 10 } }
const linea = (ov: Parameters<typeof aplicarOverrides>[1], blanco: typeof conRecibo | typeof sinRecibo = conRecibo) =>
  aplicarOverrides(base(), ov, 'obreros', null, blanco)

test('LAS COLUMNAS: horas manual NO es la sellada; Hs negro tiene la suya', () => {
  assert.ok(CAMPOS_EDITABLES.includes('horasNegro'))
  assert.equal(COLUMNA_DE.horas, 'horas_manual', 'MUTACIÓN: leer/escribir `horas` (la sellada del cierre)')
  assert.equal(COLUMNA_DE.horasNegro, 'horas_negro_manual')
})

test('HORAS MANUAL RECALCULA Hs negro, negro y total (con recibo)', () => {
  const l = linea({ horas: 70 })
  assert.equal(l.horas, 70)
  assert.equal(l.manual.horas, true)
  assert.equal(l.sueldo?.horasNegro, 20, '70 − 50 del recibo')
  assert.equal(l.negro, 20 * 5874)
  assert.equal(l.cobra, 230240.12 + 117480)
})

test('HORAS MANUAL RECALCULA EL BLANCO ESTIMADO (sin recibo)', () => {
  const l = linea({ horas: 80 }, sinRecibo)
  assert.equal(l.horasRecibo, 40, 'la mitad de las horas manuales')
  assert.equal(l.porBanco, 203136, '40 × 6.348 × 0,8')
  assert.equal(l.negro, 40 * 5874)
  assert.equal(l.cobra, 203136 + 234960)
})

test('HORAS MANUAL NO PISA LO QUE YA ESTÁ MANUAL', () => {
  const l = linea({ horas: 70, negro: 100000, horasNegro: 5, porBanco: 1000 })
  assert.equal(l.negro, 100000, 'importe negro manual')
  assert.equal(l.horasNegro, 5, 'Hs negro manual')
  assert.equal(l.porBanco, 1000, 'banco manual')
})

test('AVISO ÁMBAR: horas manual distinta de la suma de los días', () => {
  assert.equal(horasNoCoincidenConLosDias(linea({ horas: 70 })), 94, 'MUTACIÓN: el aviso que nunca aparece')
  assert.equal(horasNoCoincidenConLosDias(linea({ horas: 94 })), null, 'coincide: sin aviso')
  assert.equal(horasNoCoincidenConLosDias(linea({})), null, 'sin manual: sin aviso')
})

test('HS NEGRO MANUAL: Importe negro = Hs negro manual × $/h negro, sin recargo, salvo Importe negro manual', () => {
  const l = linea({ horasNegro: 30 })
  assert.equal(l.horasNegro, 30)
  assert.equal(l.manual.horasNegro, true)
  assert.equal(l.negro, 30 * 5874, 'MUTACIÓN: Hs negro manual ignorada deja 44 × 5.874')
  assert.equal(l.cobra, 230240.12 + 176220)
  assert.equal(linea({ horasNegro: 30, negro: 50000 }).negro, 50000, 'el importe escrito gana')
  const s = sueldoBlancoNegro({ ...conRecibo, horas: 94, horasEquivalentes: 100, valorHoraNegro: 5874, manual: { horasNegro: 30 } })
  assert.equal(s.negro, 30 * 5874, 'MUTACIÓN: sumar el recargo de extras a las horas escritas')
  assert.equal(sueldoBlancoNegro({ ...conRecibo, horas: 94, horasEquivalentes: 100, valorHoraNegro: 5874 }).negro, 50 * 5874)
})

test('VACIAR VUELVE AL CALCULADO', () => {
  const l = linea({ horas: null, horasNegro: null })
  assert.equal(l.horas, 94)
  assert.equal(l.horasNegro, 44)
  assert.equal(l.manual.horas || l.manual.horasNegro, false)
})

test('LAS HORAS NO SE ESCRIBEN NEGATIVAS; LA PLATA SIGUE COMO ESTABA', () => {
  assert.equal(typeof rechazoDelValorDeCelda('horasNegro', -1), 'string')
  assert.equal(typeof rechazoDelValorDeCelda('horas', -0.5), 'string')
  assert.equal(rechazoDelValorDeCelda('horas', 0), null)
  assert.equal(rechazoDelValorDeCelda('horas', ''), null, 'vacío borra')
  assert.equal(rechazoDelValorDeCelda('adelanto', -5), null)
})

test('LECTURA: el override sale de `horas_manual`, nunca de la sellada; escalón propio si falta la migración', () => {
  // La decodificación de la fila guardada se mudó a `liquidacionGuardadas.ts` (15/09/2026: el servicio pasó
  // las 500 líneas al sumar el presentismo). El escalón de columnas sigue en el servicio.
  const g = fuente('./liquidacionGuardadas.ts')
  assert.match(g, /horas: overrideDe\(l\.horas_manual\)/)
  assert.match(g, /horasNegro: overrideDe\(l\.horas_negro_manual\)/)
  assert.ok(!/overrideDe\(l\.horas\)/.test(g), 'MUTACIÓN: la sellada vuelve como manual al reabrir')
  const s = fuente('./liquidacionQuincenaService.ts')
  assert.match(s, /'horas_manual', 'horas_negro_manual'/)
})

test('LA ACCIÓN VALIDA LAS HORAS Y NOMBRA LA MIGRACIÓN QUE FALTA', () => {
  const a = fuente('./liquidacionActions.ts')
  assert.match(a, /rechazoDelValorDeCelda\(campo, valor\)/)
  assert.match(a, /20260915T0510_liquidacion_horas_manual\.sql/)
})

test('LAS CELDAS: Horas y Hs negro se escriben en la abierta, con el aviso ámbar', () => {
  const e = fuente('../components/liquidacion/cuadro/CeldasDelEspejo.tsx')
  assert.match(e, /<Escribible campo="horas" unidad="horas"/)
  assert.match(e, /testid=\{`horas-no-coinciden-\$\{fila\.personaId\}`\}/)
  assert.match(e, /no coincide con los días: \$\{nHoras\(dias\)\} h/)
  const b = fuente('../components/liquidacion/cuadro/CeldasBlancoNegro.tsx')
  assert.match(b, /<Escribible campo="horasNegro" unidad="horas"/)
  const g = fuente('../components/liquidacion/GrillaEspejoQuincena.tsx')
  assert.match(g, /<CeldaHorasPagas fila=\{fila\} edicion=\{\{ quincena, camposEditables \}\} \/>/)
  assert.match(g, /<CeldaHorasNegro fila=\{fila\} edicion=\{\{ quincena, camposEditables \}\} \/>/)
})

test('LA MIGRACIÓN: dos columnas nullable, CHECK >= 0, y sin GRANT de UPDATE a authenticated', () => {
  const m = fuente('../../../../supabase/migrations/20260915T0510_liquidacion_horas_manual.sql')
  assert.match(m, /add column if not exists horas_manual numeric/)
  assert.match(m, /add column if not exists horas_negro_manual numeric/)
  assert.match(m, /check \(horas_manual is null or horas_manual >= 0\)/)
  assert.match(m, /check \(horas_negro_manual is null or horas_negro_manual >= 0\)/)
  assert.ok(!/^\s*grant\b/im.test(m), 'ningún GRANT')
})
