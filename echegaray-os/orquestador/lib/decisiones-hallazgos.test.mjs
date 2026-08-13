// EL REGISTRO DE DECISIONES DEL DUEÑO — que libere lo decidido y NADA más.
//
// Los tres defectos que estos tests atrapan, en orden de gravedad:
//   1. que un hallazgo con decisión siga rompiendo el paso (el aviso siempre rojo que nadie lee);
//   2. que un hallazgo SIN decisión deje de romperlo (el registro convertido en alfombra);
//   3. que una decisión vieja se siga aplicando después de que el dato cambió (lo mismo, más sutil).

import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  CONTROLES, AUTORIDADES, formaDe, normalizarValor, problemasDe, veredicto,
  aplicarDecisiones, explicarDecisiones, leerRegistro, decidir, decisionesDe, rotuloDecision,
} from './decisiones-hallazgos.mjs'
import { auditar } from '../scripts/decisiones-hallazgos.mjs'

const CONTROL = CONTROLES.ventasSinCobranza

const DECISION = {
  control: CONTROL,
  clave: '0001-00000208',
  forma: { importe: 75000000, cuit: '30716490498' },
  decision: 'no considerarlas',
  quien: 'dueño',
  cuando: '2026-08-13',
}
const registro = (...ds) => ({ decisiones: ds })
const hallazgo = (clave, forma) => ({ clave, forma })

// ══ 1 · LO DECIDIDO NO ROMPE EL PASO ═════════════════════════════════════════════════════════════

test('un hallazgo con decisión del dueño sale de los vivos: no ocupa la línea de aviso', () => {
  const r = aplicarDecisiones(CONTROL, [hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498' })], registro(DECISION))
  assert.equal(r.vivos.length, 0, 'con decisión cargada el paso tiene que pasar en verde')
  assert.equal(r.silenciados.length, 1)
  assert.equal(r.silenciados[0].decision.decision, 'no considerarlas')
})

test('lo silenciado se sigue contando y listando, y NUNCA lleva ⚠ — liberar no es callar', () => {
  const r = aplicarDecisiones(CONTROL, [hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498' })], registro(DECISION))
  const salida = []
  explicarDecisiones(r, (t) => salida.push(t))
  const texto = salida.join('\n')
  assert.match(texto, /1 hallazgo\(s\) con decisión del dueño/)
  assert.match(texto, /"no considerarlas"/, 'el texto textual del dueño queda a la vista')
  assert.match(texto, /dueño, 13\/08\/2026/, 'quién decidió y cuándo')
  // El ⚠ es lo que el pipeline levanta de la salida para reportar el paso entre los que no cierran.
  assert.ok(!texto.includes('⚠'), `un hallazgo liberado no puede llevar ⚠:\n${texto}`)
})

// ══ 2 · LO NO DECIDIDO SIGUE ROMPIENDO ═══════════════════════════════════════════════════════════

test('un hallazgo SIN decisión sigue vivo: se silencia el comprobante, nunca el control', () => {
  const r = aplicarDecisiones(CONTROL, [
    hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498' }),
    hallazgo('0001-00000999', { importe: 3000000, cuit: '30716490498' }),
  ], registro(DECISION))
  assert.deepEqual(r.vivos.map((h) => h.clave), ['0001-00000999'])
  assert.equal(r.silenciados.length, 1)
})

test('la decisión de un control NO libera el hallazgo homónimo de otro control', () => {
  const r = aplicarDecisiones(CONTROLES.cobroDuplicado, [hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498' })], registro(DECISION))
  assert.equal(r.vivos.length, 1)
})

// ══ 3 · SI EL DATO CAMBIA, LA DECISIÓN VIEJA NO APLICA ═══════════════════════════════════════════

test('cambia el importe → la decisión vieja NO aplica y el hallazgo vuelve a gritar', () => {
  const r = aplicarDecisiones(CONTROL, [hallazgo('0001-00000208', { importe: 90000000, cuit: '30716490498' })], registro(DECISION))
  assert.equal(r.vivos.length, 1, 'el dueño decidió sobre $75M, no sobre $90M')
  assert.equal(r.silenciados.length, 0)
  assert.equal(r.caducadas.length, 1, 'y se dice que HABÍA una decisión que ya no vale')
  assert.match(r.caducadas[0].porQue, /importe=75000000/)
  assert.match(r.caducadas[0].porQue, /importe=90000000/)
})

test('la caducidad SÍ lleva ⚠: es trabajo nuevo, no ruido viejo', () => {
  const r = aplicarDecisiones(CONTROL, [hallazgo('0001-00000208', { importe: 90000000, cuit: '30716490498' })], registro(DECISION))
  const salida = []
  explicarDecisiones(r, (t) => salida.push(t))
  assert.match(salida.join('\n'), /⚠ la decisión del dueño sobre .* YA NO APLICA/)
})

test('si el control empieza a mirar un campo más, las decisiones viejas caducan solas', () => {
  const conMasDatos = hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498', moneda: 'ARS' })
  const r = aplicarDecisiones(CONTROL, [conMasDatos], registro(DECISION))
  assert.equal(r.vivos.length, 1, 'la identidad ya no es la misma: hay que volver a preguntar')
})

test('una decisión con plazo vencido deja de aplicar', () => {
  const conPlazo = { ...DECISION, hasta: '2026-08-31' }
  const h = [hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498' })]
  assert.equal(aplicarDecisiones(CONTROL, h, registro(conPlazo), '2026-08-20').silenciados.length, 1)
  const tarde = aplicarDecisiones(CONTROL, h, registro(conPlazo), '2026-09-01')
  assert.equal(tarde.vivos.length, 1)
  assert.match(tarde.caducadas[0].porQue, /valía hasta el 2026-08-31/)
})

// ══ 4 · QUIÉN PUEDE DECIDIR ══════════════════════════════════════════════════════════════════════

test('un agente NO puede liberar su propio control', () => {
  const deUnAgente = { ...DECISION, quien: 'orquestador' }
  const r = aplicarDecisiones(CONTROL, [hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498' })], registro(deUnAgente))
  assert.equal(r.vivos.length, 1, 'la autoridad es la persona, no el que produce el aviso')
  assert.equal(r.rotas.length, 1)
  assert.match(r.rotas[0].problemas.join(' '), /no puede decidir/)
  assert.deepEqual([...AUTORIDADES], ['dueño'])
})

test('una decisión sin forma del dato no se puede usar: se aplicaría para siempre', () => {
  const sinForma = { ...DECISION }
  delete sinForma.forma
  assert.ok(problemasDe(sinForma).some((p) => /sin forma del dato/.test(p)))
  const r = aplicarDecisiones(CONTROL, [hallazgo('0001-00000208', { importe: 75000000 })], registro(sinForma))
  assert.equal(r.vivos.length, 1)
})

test('una decisión sin el texto del dueño, o sin fecha, tampoco se puede usar', () => {
  assert.ok(problemasDe({ ...DECISION, decision: '  ' }).some((p) => /sin el texto/.test(p)))
  assert.ok(problemasDe({ ...DECISION, cuando: '13/08/2026' }).some((p) => /YYYY-MM-DD/.test(p)))
  assert.deepEqual(problemasDe(DECISION), [])
})

// ══ 5 · LA COMPARACIÓN DE FORMAS ═════════════════════════════════════════════════════════════════

test('la forma no se rompe por el tipo ni por mayúsculas, pero sí por la magnitud', () => {
  assert.equal(normalizarValor(75000000), normalizarValor('75000000'))
  assert.equal(normalizarValor(' LA  Estrella '), 'la estrella')
  assert.notEqual(normalizarValor(75000000), normalizarValor(75000001))
  assert.equal(formaDe({ b: 1, a: 2 }), formaDe({ a: 2, b: 1 }), 'el orden de las claves no cambia la forma')
})

// ══ 6 · EL REGISTRO REAL, EL QUE VA A CORRER EL PIPELINE ═════════════════════════════════════════

test('las tres decisiones del 13/08 están cargadas, son usables y apuntan a controles vivos', () => {
  const filas = auditar(leerRegistro())
  const rotas = filas.filter((f) => f.problemas.length)
  assert.deepEqual(rotas.map((r) => `${r.decision.clave}: ${r.problemas.join(' · ')}`), [])
  const claves = filas.map((f) => `${f.decision.control}||${f.decision.clave}`)
  assert.ok(claves.includes(`${CONTROLES.ventasSinCobranza}||0001-00000208`))
  assert.ok(claves.includes(`${CONTROLES.ventasSinCobranza}||0001-00000213`))
  assert.ok(claves.includes(`${CONTROLES.cobroDuplicado}||fila 39`))
  assert.ok(claves.includes(`${CONTROLES.vencimientoVencido}||iibb·2026-06`))
  assert.ok(claves.includes(`${CONTROLES.vencimientoVencido}||iva·2026-06`))
  for (const f of filas) {
    assert.equal(f.decision.quien, 'dueño')
    assert.equal(f.decision.cuando, '2026-08-13')
    assert.ok(String(f.decision.porque).length > 80, `${f.decision.clave} tiene que explicar por qué para releerlo en tres meses`)
  }
})

test('el auditor detecta una decisión que apunta a un control que ya no existe', () => {
  const filas = auditar(registro({ ...DECISION, control: 'proveedores-materiales-pestana · nombre viejo' }))
  assert.match(filas[0].problemas.join(' '), /no existe/)
})

test('las decisiones REALES del dueño liberan las dos facturas que él nombró, y sólo ésas', () => {
  const r = decidir(CONTROLES.ventasSinCobranza, [
    { clave: '0001-00000208', forma: { importe: 75000000, cuit: '30716490498' } },
    { clave: '0001-00000213', forma: { importe: 40000000, cuit: '30716490498' } },
    { clave: '0001-00000300', forma: { importe: 1234567, cuit: '30716490498' } },
  ])
  assert.deepEqual(r.silenciados.map((h) => h.clave), ['0001-00000208', '0001-00000213'])
  assert.deepEqual(r.vivos.map((h) => h.clave), ['0001-00000300'])
})

// ══ 7 · SIN REGISTRO NO SE SILENCIA NADA ═════════════════════════════════════════════════════════

test('registro ausente o roto → todos los hallazgos vuelven a avisar (fallar cerrado es ruido, no silencio)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dec-'))
  const roto = path.join(dir, 'roto.json')
  writeFileSync(roto, '{ esto no es json')
  assert.equal(leerRegistro(roto).decisiones.length, 0)
  assert.ok(leerRegistro(path.join(dir, 'no-existe.json'))._error)
  const r = decidir(CONTROL, [hallazgo('0001-00000208', { importe: 75000000, cuit: '30716490498' })], { ruta: roto })
  assert.equal(r.vivos.length, 1)
  assert.equal(decisionesDe(CONTROL, { ruta: roto }).length, 0)
})

test('el rótulo que va adentro de una pestaña dice quién, cuándo y su palabra, sin ⚠', () => {
  const t = rotuloDecision(DECISION)
  assert.match(t, /13\/08\/2026/)
  assert.match(t, /dueño/)
  assert.match(t, /"no considerarlas"/)
  assert.ok(!t.includes('⚠'))
})

test('veredicto sobre un control sin ninguna decisión cargada', () => {
  assert.equal(veredicto(CONTROL, hallazgo('x', { a: 1 }), registro()).estado, 'sin-decision')
})
