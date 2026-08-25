// LA REGLA DE SUGERENCIA DE CATEGORÍA — los defectos que atrapa este archivo.
//
// 1. Que «art» adentro de «Parte diario» clasifique un parte como papel de Seguridad e higiene.
//    Es el defecto que convierte la sugerencia en una fuente de datos falsos: cuando se equivoca
//    seguido, la gente aprende a confirmar sin leer.
// 2. Que un nombre que dispara DOS reglas se resuelva por el orden del array. Un desempate
//    escondido es un criterio que nadie declaró.
// 3. Que se sugiera algo cuando no hay nombre — es decir, que se clasifique por el id de Drive.

import test from 'node:test'
import assert from 'node:assert/strict'
import { sugerirCategoria, textoSugerencia } from './documentosSugerencia.ts'
import { CATEGORIAS } from './documentosCategoria.ts'

test('la extensión de un plano sugiere Planos y documentación técnica', () => {
  assert.equal(sugerirCategoria('Estructura eje 6.dwg'), CATEGORIAS.PLANOS)
  assert.equal(sugerirCategoria('detalle.DXF'), CATEGORIAS.PLANOS)
  assert.equal(sugerirCategoria('Plano de encofrado.pdf'), CATEGORIAS.PLANOS)
})

test('contrato, presupuesto y orden caen en Contrato y cliente', () => {
  assert.equal(sugerirCategoria('Contrato de obra firmado.pdf'), CATEGORIAS.CONTRATO)
  assert.equal(sugerirCategoria('presupuesto-orica-rev2.xlsx'), CATEGORIAS.CONTRATO)
  assert.equal(sugerirCategoria('Orden de compra 114.pdf'), CATEGORIAS.CONTRATO)
})

test('art, seguro, nómina y f931 caen en Seguridad e higiene', () => {
  assert.equal(sugerirCategoria('ART Yeseros del Cuyo.pdf'), CATEGORIAS.SEGURIDAD)
  assert.equal(sugerirCategoria('Nómina de personal en obra.xlsx'), CATEGORIAS.SEGURIDAD,
    'la palabra con acento tiene que coincidir igual: la escriben las dos formas')
  assert.equal(sugerirCategoria('F931 07-2026.pdf'), CATEGORIAS.SEGURIDAD)
})

test('una imagen es evidencia de obra, por extensión o por mime', () => {
  assert.equal(sugerirCategoria('encofrado eje 6.jpg'), CATEGORIAS.EVIDENCIA)
  // Sin extensión y sin palabra: lo único que lo prueba es el mime que publica Drive.
  assert.equal(sugerirCategoria('IMG_0421', 'image/jpeg'), CATEGORIAS.EVIDENCIA)
})

// ═══ EL DEFECTO 1: «art» ADENTRO DE OTRA PALABRA ═══

test('«art» adentro de una palabra NO clasifica como seguridad', () => {
  assert.equal(sugerirCategoria('Parte diario 20-08.pdf'), null,
    'un parte diario quedó archivado como papel de ART')
  assert.equal(sugerirCategoria('Carta documento.pdf'), null)
  assert.equal(sugerirCategoria('Cuarto piso.pdf'), null)
})

test('«orden» adentro de otra palabra tampoco arrastra a Contrato', () => {
  assert.equal(sugerirCategoria('Bordenave relevamiento.pdf'), null)
})

// ═══ EL DEFECTO 2: DOS REGLAS QUE COINCIDEN ═══

test('cuando coinciden dos categorías no se elige ninguna', () => {
  // Una foto de un plano dispara Planos (palabra) y Evidencia (extensión). Elegir una sería
  // inventar una precedencia que nadie declaró.
  assert.equal(sugerirCategoria('plano de replanteo.jpg'), null)
  assert.equal(sugerirCategoria('contrato y nomina.pdf'), null)
})

// ═══ EL DEFECTO 3: SUGERIR SIN NOMBRE ═══

test('sin nombre no hay sugerencia', () => {
  assert.equal(sugerirCategoria(null), null, 'iba a clasificar por el id de Drive')
  assert.equal(sugerirCategoria('   '), null)
})

test('un nombre que no dispara ninguna regla no sugiere nada', () => {
  assert.equal(sugerirCategoria('Acta de medición 3.pdf'), null)
  assert.equal(sugerirCategoria('archivo.pdf'), null)
})

test('el texto de la sugerencia dice que es una sugerencia', () => {
  assert.match(textoSugerencia(CATEGORIAS.PLANOS), /^sugerido: /)
})
