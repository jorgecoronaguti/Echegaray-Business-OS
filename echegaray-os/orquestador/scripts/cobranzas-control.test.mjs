// LA MARCA POR FILA DE COBRANZAS — que el cobro que el dueño ya revisó deje de gritar, y sólo ése.
//
// Este archivo también prueba algo que no es de este control y se pagó hoy: que importar el script
// NO corra la pestaña. Sin la guarda `import.meta.url`, este mismo test escribiría el Sheet real cada
// vez que alguien lo corra — que es exactamente lo que pasó al probar `marcaPorFila` desde el nodo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { marcaPorFila } from './cobranzas-control.mjs'
import { CONTROLES, decisionesDe } from '../lib/decisiones-hallazgos.mjs'
import { esCobroYaRevisado } from '../lib/cobranzas-duplicado.mjs'

const LA_ESTRELLA = {
  control: CONTROLES.cobroDuplicado,
  clave: 'fila 39',
  forma: { fila: 39, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', importe: 10000000 },
  decision: 'no es duplicado',
  quien: 'dueño',
  cuando: '2026-08-13',
}

const balanceada = (f) => (f.match(/\(/g) || []).length === (f.match(/\)/g) || []).length

test('sin decisiones, la marca es la de siempre: el ⚠ del indistinguible sigue primero', () => {
  const f = marcaPorFila([])
  assert.ok(balanceada(f), f)
  assert.match(f, /⚠ Otro cobro con el MISMO cliente/)
  assert.ok(!f.includes('lo revisó el'), 'sin decisión no hay nada que liberar')
})

test('con la decisión del dueño, la fila 39 deja de llevar ⚠ y dice quién la revisó', () => {
  const f = marcaPorFila([LA_ESTRELLA])
  assert.ok(balanceada(f), f)
  // La condición liberadora va ANTES que la del indistinguible: si fuera después, nunca ganaría.
  const iLibera = f.indexOf('lo revisó el dueño')
  const iAviso = f.indexOf('⚠ Otro cobro con el MISMO cliente')
  assert.ok(iLibera > 0 && iLibera < iAviso, 'la liberación tiene que ganarle al aviso')
  assert.match(f, /13\/08\/2026/)
  assert.match(f, /""no es duplicado""/, 'el texto textual del dueño, con las comillas escapadas para el Sheet')
})

test('la liberación exige fila Y cliente Y importe: la posición sola es una trampa conocida', () => {
  const f = marcaPorFila([LA_ESTRELLA])
  assert.ok(f.includes('(ROW(Cobranzas!$G$5:$G$200)=39)'), f.slice(0, 300))
  assert.ok(f.includes('(Cobranzas!$G$5:$G$200="LA ESTRELLA /ALIMENTOS DEL SUR SAS")'))
  assert.ok(f.includes('(Cobranzas!$M$5:$M$200=10000000)'))
})

test('si el importe de esa fila cambia, la condición ya no se cumple y la marca vuelve sola', () => {
  const c = esCobroYaRevisado(LA_ESTRELLA.forma, 'Cobranzas', 5, 200)
  // La condición es una multiplicación de tres igualdades: cambiar cualquiera la lleva a 0.
  assert.equal(c.split('*').length, 3)
  const otro = esCobroYaRevisado({ ...LA_ESTRELLA.forma, importe: 12000000 }, 'Cobranzas', 5, 200)
  assert.notEqual(c, otro)
})

test('el texto liberador nunca lleva ⚠, ni siquiera si el dueño lo escribiera con comillas', () => {
  const f = marcaPorFila([{ ...LA_ESTRELLA, decision: 'es el "adelanto", no un duplicado' }])
  assert.ok(balanceada(f), f)
  assert.match(f, /es el ""adelanto"", no un duplicado/)
  const liberador = f.slice(f.indexOf('lo revisó el dueño') - 40, f.indexOf('lo revisó el dueño') + 80)
  assert.ok(!liberador.includes('⚠'))
})

test('la fórmula que va al Sheet sale del registro REAL: hoy libera la fila 39 y ninguna otra', () => {
  const ds = decisionesDe(CONTROLES.cobroDuplicado)
  assert.deepEqual(ds.map((d) => d.clave), ['fila 39'])
  const f = marcaPorFila(ds)
  assert.ok(balanceada(f), f)
  assert.equal((f.match(/lo revisó el dueño/g) || []).length, 1)
  // La 40 es la gemela de la 39 y el dueño nombró sólo la 39: sigue marcada a propósito.
  assert.ok(!f.includes('=40)'), 'nadie liberó la fila 40')
})

test('importar este script NO corre la pestaña: la guarda de comando está puesta', () => {
  const src = readFileSync(new URL('./cobranzas-control.mjs', import.meta.url), 'utf8')
  assert.match(src, /if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{/)
})
