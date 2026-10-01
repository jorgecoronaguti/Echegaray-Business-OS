import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { entregaParaRendir } from './logica.ts'
import { entregaPedida, entregasElegibles, hrefDeRendir, puedeRendirContra, type QuienRinde } from './rendir-por.ts'
import type { EntregaSaldo } from './tipos.ts'

const RAIZ = new URL('../../../..', import.meta.url).pathname
const ANA = '11111111-1111-4111-8111-111111111111'
const LUIS = '22222222-2222-4222-8222-222222222222'
const entrega = (id: string, codigo: string, persona_id: string, estado = 'abierta') =>
  ({ id, codigo, persona_id, persona: 'X', estado, en_su_poder: 100, obra: 'O', obra_id: null, estructura: false }) as unknown as EntregaSaldo

const TODAS = [entrega('e1', 'ER-0001', ANA), entrega('e2', 'ER-0002', LUIS), entrega('e3', 'ER-0003', LUIS, 'cerrada')]
const admin: QuienRinde = { veEconomia: true, puedeRendir: true, personaPropia: ANA }
const jefe: QuienRinde = { veEconomia: false, puedeRendir: true, personaPropia: ANA }
const operario: QuienRinde = { veEconomia: false, puedeRendir: false, personaPropia: ANA }

test('Administración rinde contra la entrega de otra persona y contra la propia', () => {
  assert.equal(puedeRendirContra(admin, LUIS), true)
  assert.equal(puedeRendirContra(admin, ANA), true)
  assert.equal(puedeRendirContra({ ...admin, personaPropia: null }, LUIS), true)
})

test('el jefe de obra rinde sólo contra la suya: la ajena se rechaza', () => {
  assert.equal(puedeRendirContra(jefe, ANA), true)
  assert.equal(puedeRendirContra(jefe, LUIS), false)
  assert.equal(puedeRendirContra(jefe, null), false)
  assert.equal(puedeRendirContra({ ...jefe, personaPropia: null }, LUIS), false)
})

test('el operario no rinde ni contra la suya', () => {
  assert.equal(puedeRendirContra(operario, ANA), false)
  assert.equal(puedeRendirContra(operario, LUIS), false)
})

test('la lista para elegir: Administración ve las abiertas de todos, el jefe sólo las suyas, el operario ninguna', () => {
  assert.deepEqual(entregasElegibles(admin, TODAS).map((e) => e.codigo), ['ER-0001', 'ER-0002'])
  assert.deepEqual(entregasElegibles(jefe, TODAS).map((e) => e.codigo), ['ER-0001'])
  assert.deepEqual(entregasElegibles(operario, TODAS), [])
})

test('?entrega=ER-0002 viene preelegida (por código o por id) y una cerrada no se elige', () => {
  assert.equal(entregaPedida(TODAS, 'ER-0002')?.id, 'e2')
  assert.equal(entregaPedida(TODAS, 'er-0002')?.id, 'e2')
  assert.equal(entregaPedida(TODAS, 'e2')?.id, 'e2')
  assert.equal(entregaPedida(TODAS, 'ER-9999'), null)
  assert.equal(entregaPedida(TODAS, undefined), null)
  assert.equal(entregaParaRendir(TODAS, 'ER-0002')?.id, 'e2')
  assert.equal(entregaParaRendir(TODAS, 'ER-0003'), null)
})

test('el enlace al elegir lleva por= sólo si la entrega es de otra persona', () => {
  assert.equal(hrefDeRendir(TODAS[1], ANA), `/mi-informacion/efectivo/rendir?entrega=e2&por=${LUIS}`)
  assert.equal(hrefDeRendir(TODAS[0], ANA), '/mi-informacion/efectivo/rendir?entrega=e1')
  assert.equal(hrefDeRendir(TODAS[0], null), `/mi-informacion/efectivo/rendir?entrega=e1&por=${ANA}`)
})

test('el servidor aplica la regla antes de encolar y la ficha ofrece «Rendir con foto»', () => {
  const acciones = readFileSync(`${RAIZ}src/features/efectivo/campo/acciones.ts`, 'utf8')
  const fn = acciones.slice(acciones.indexOf('export async function rendirComprobantesAction'))
  assert.ok(fn.indexOf('puedeRendirContra(') > 0 && fn.indexOf('puedeRendirContra(') < fn.indexOf("rpc('rendir_comprobante'"))
  const ficha = readFileSync(`${RAIZ}src/features/efectivo/components/FichaEntrega.tsx`, 'utf8')
  assert.match(ficha, /rendir\?entrega=\$\{e\.id\}&por=\$\{e\.persona_id\}[\s\S]{0,200}Rendir con foto/)
})
