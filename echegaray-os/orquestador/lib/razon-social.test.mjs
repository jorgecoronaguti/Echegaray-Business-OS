import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegir, necesitaRed, normNombre, extraerDeTexto, confianzaDe } from './razon-social.mjs'

const BALANZ = '30710630670'

test('el dato propio le gana a internet', () => {
  // Aunque internet conteste primero en el array, manda la fuente de mayor confianza.
  const r = elegir(BALANZ, [
    { fuente: 'internet', nombre: 'Balanz Capital Valores SAU' },
    { fuente: 'comprobantes_arca', nombre: 'BALANZ CAPITAL VALORES S.A.U.' },
  ])
  assert.equal(r.fuente, 'comprobantes_arca')
  assert.equal(r.confianza, 'alta')
  assert.equal(r.razon_social, 'BALANZ CAPITAL VALORES S.A.U.')
})

test('dos fuentes que dicen lo mismo se marcan como coincidentes', () => {
  const r = elegir(BALANZ, [
    { fuente: 'comprobantes_arca', nombre: 'BALANZ CAPITAL VALORES S.A.U.' },
    { fuente: 'internet', nombre: 'Balanz Capital Valores SAU' },
  ])
  assert.equal(r.coincide, true, 'la forma societaria no las hace distintas')
})

test('dos fuentes que se contradicen NO se promedian: se informa', () => {
  const r = elegir(BALANZ, [
    { fuente: 'comprobantes_arca', nombre: 'BALANZ CAPITAL VALORES S.A.U.' },
    { fuente: 'internet', nombre: 'OTRA COSA S.R.L.' },
  ])
  assert.equal(r.coincide, false)
  assert.equal(r.candidatos.length, 2, 'los dos quedan a la vista para poder decidir')
})

test('sin candidatos no se inventa un nombre', () => {
  const r = elegir(BALANZ, [])
  assert.equal(r.razon_social, null)
  assert.equal(r.confianza, 'desconocida')
  assert.equal(r.valido, true, 'el juicio aritmético sigue estando aunque nadie conteste')
})

test('un CUIT inválido se reporta como typo, no como "no encontrado"', () => {
  const r = elegir('30710630671', [])
  assert.equal(r.valido, false)
  assert.match(r.problema, /dígito verificador/)
})

test('no sale a la red si una fuente local ya contestó', () => {
  assert.equal(necesitaRed([{ fuente: 'proveedores', nombre: 'ALUMETAL S.A.' }]), false)
  assert.equal(necesitaRed([{ fuente: 'proveedores', nombre: '' }]), true, 'una fila vacía no es una respuesta')
  assert.equal(necesitaRed([]), true)
  assert.equal(necesitaRed([{ fuente: 'internet', nombre: 'X S.A.' }]), true, 'internet no evita internet')
})

test('normNombre iguala las formas societarias y los acentos', () => {
  assert.equal(normNombre('BALANZ CAPITAL VALORES S.A.U.'), normNombre('Balanz Capital Valores SAU'))
  assert.equal(normNombre('Construcciónes S.R.L.'), 'CONSTRUCCIONES')
})

test('extrae la razón social del texto de una búsqueda', () => {
  const texto = 'Balanz Capital Valores S. A. U. - CUIT 30-71063067-0 - Full profile | Dateas.com'
  assert.match(extraerDeTexto(texto, BALANZ), /Balanz Capital Valores/)
})

test('prefiere no contestar antes que inventar', () => {
  assert.equal(extraerDeTexto('no encontré información sobre ese número', BALANZ), null)
  assert.equal(extraerDeTexto('', BALANZ), null)
})

test('una fuente que no está declarada no se cree', () => {
  assert.equal(confianzaDe('un_blog_cualquiera'), 'desconocida')
  assert.equal(elegir(BALANZ, [{ fuente: 'un_blog_cualquiera', nombre: 'X' }]).razon_social, null)
})
