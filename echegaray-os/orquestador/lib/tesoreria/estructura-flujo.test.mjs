// ¿ESTE LIBRO ES UN FLUJO DE FONDOS? — la guarda que evita el peor defecto posible acá.
//
// El lector está atado a una estructura. Apuntarlo a otro libro NO falla: `catch(() => [])` devuelve
// vacío, los parsers devuelven cero, y el agente informa "caja $0" con la misma cara con la que
// informaría un dato real. Un cero por falta de estructura es indistinguible de un cero verdadero —
// y sobre esa caja de mentira se calcularían el excedente y una recomendación de inversión.

import test from 'node:test'
import assert from 'node:assert/strict'
import { verificarEstructuraFlujo, idDeSheet, PESTANAS_REQUERIDAS } from './estructura-flujo.mjs'

const googleCon = (titulos) => ({ getSheetMeta: async () => titulos.map((t) => ({ title: t })) })
const googleQueFalla = (msg) => ({ getSheetMeta: async () => { throw new Error(msg) } })
const COMPLETO = ['Caja', 'Cobranzas', 'Compras', 'Cheques Emitidos', 'RESUMEN', 'Proveedores']

test('el dueño pega la URL, no el ID: las dos formas tienen que servir', () => {
  const id = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  assert.equal(idDeSheet(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id)
  assert.equal(idDeSheet(`https://docs.google.com/spreadsheets/d/${id}`), id)
  assert.equal(idDeSheet(id), id)
  assert.equal(idDeSheet('  ' + id + '  '), id)
})

test('lo que NO es un Sheet no se adivina', () => {
  // Adivinar acá es peor que preguntar: llevaría a leer un libro que no es el que el dueño quiso.
  for (const basura of ['', null, undefined, 'el flujo de fondos', 'https://google.com', 'abc']) {
    assert.equal(idDeSheet(basura), null, `${JSON.stringify(basura)} se tomó por un Sheet`)
  }
})

test('un libro con la estructura completa pasa', async () => {
  const r = await verificarEstructuraFlujo(googleCon(COMPLETO), 'un-id')
  assert.equal(r.ok, true)
})

test('faltando UNA pestaña se NIEGA, y dice cuál y por qué', async () => {
  for (const falta of PESTANAS_REQUERIDAS) {
    const r = await verificarEstructuraFlujo(googleCon(COMPLETO.filter((t) => t !== falta)), 'un-id')
    assert.equal(r.ok, false, `sin "${falta}" lo dio por bueno`)
    assert.deepEqual(r.faltantes, [falta])
    assert.match(r.motivo, /daría cero y parecería un dato real/, 'no explica por qué importa')
  }
})

test('un libro sin NINGUNA de las pestañas no se lee', async () => {
  // El caso realista: el dueño pega el enlace de otra planilla suya cualquiera.
  const r = await verificarEstructuraFlujo(googleCon(['Hoja 1', 'Presupuesto', 'Notas']), 'un-id')
  assert.equal(r.ok, false)
  assert.equal(r.faltantes.length, PESTANAS_REQUERIDAS.length)
})

test('los rótulos reales no vienen prolijos: se comparan sin tildes ni mayúsculas', async () => {
  const r = await verificarEstructuraFlujo(googleCon(['CAJA', 'cobranzas', 'Compras ', 'CHEQUES EMITIDOS']), 'un-id')
  assert.equal(r.ok, true, 'rechazó un libro válido por una mayúscula')
})

test('"no lo encuentro" y "no tengo permiso" piden cosas distintas', async () => {
  const noEsta = await verificarEstructuraFlujo(googleQueFalla('Requested entity was not found. 404'), 'x')
  assert.match(noEsta.motivo, /revisá el enlace/)
  const sinPermiso = await verificarEstructuraFlujo(googleQueFalla('The caller does not have permission 403'), 'x')
  assert.match(sinPermiso.motivo, /compartímelo/)
})

test('sin Sheet indicado no se inventa uno', async () => {
  const r = await verificarEstructuraFlujo(googleCon(COMPLETO), null)
  assert.equal(r.ok, false)
})

test('nunca lanza: no poder mirar el libro es un resultado, no una excepción', async () => {
  const r = await verificarEstructuraFlujo(googleQueFalla('la red se cayó'), 'x')
  assert.equal(r.ok, false)
  assert.match(r.motivo, /no pude abrir/)
})
