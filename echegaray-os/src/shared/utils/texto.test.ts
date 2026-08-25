import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oracion } from './texto.ts'

test('un nombre gritado se dibuja en oración, con sus tildes', () => {
  // El defecto que atrapa: la lista de Personal y la ficha 20 pintaban «CRISTIAN AGÜERO» tal como
  // vino del legajo. Una columna entera en versales es la que el canónico 19 no dibuja.
  assert.equal(oracion('CRISTIAN AGÜERO'), 'Cristian Agüero')
  assert.equal(oracion('EMANUEL ALANIZ'), 'Emanuel Alaniz')
  assert.equal(oracion('ISMAEL JOFRÉ'), 'Ismael Jofré')
})

test('las siglas y los tokens con dígito NO bajan', () => {
  // El defecto que atrapa: un title-case ingenuo escribe «Melisa García Sas» y «Cañería Pvc H17».
  // «Sas» deja de ser el tipo societario y «Pvc» deja de ser el material.
  assert.equal(oracion('MELISA GARCÍA SAS'), 'Melisa García SAS')
  assert.equal(oracion('CAÑERÍA PVC H17'), 'Cañería PVC H17')
  assert.equal(oracion('CUADRILLA 2'), 'Cuadrilla 2')
  assert.equal(oracion('CONSTRUCTORA DEL OESTE SRL'), 'Constructora del Oeste SRL')
  assert.equal(oracion('ALTA IERIC'), 'Alta IERIC')
  // La sigla con puntuación pegada sigue siendo la sigla.
  assert.equal(oracion('GARCÍA (SAS)'), 'García (SAS)')
})

test('lo que ya trae minúsculas vuelve INTACTO', () => {
  // El defecto que atrapa: pasar todo por el conversor rompe lo que una persona ya curó.
  // «McDonald» → «Mcdonald» y «Quattropani - Melisa García SAS» → otra cosa.
  assert.equal(oracion('La Estrella'), 'La Estrella')
  assert.equal(oracion('Quattropani - Melisa García SAS'), 'Quattropani - Melisa García SAS')
  assert.equal(oracion('McDonald'), 'McDonald')
  assert.equal(oracion('San Francisco (IMOTOR / Javier Sánchez)'), 'San Francisco (IMOTOR / Javier Sánchez)')
})

test('las partículas bajan salvo cuando abren el nombre', () => {
  assert.equal(oracion('JUAN DE LA CRUZ'), 'Juan de la Cruz')
  // Primera palabra: no es partícula, es el arranque del nombre.
  assert.equal(oracion('DE LA FUENTE'), 'De la Fuente')
})

test('los guiones y los apóstrofos capitalizan lo que sigue', () => {
  assert.equal(oracion('GARCÍA-LÓPEZ'), 'García-López')
  assert.equal(oracion("D'AGOSTINO"), "D'Agostino")
})

test('vacío, nulo y espacios no explotan ni inventan texto', () => {
  // El defecto que atrapa: un `.charAt(0)` sobre '' devolvía '' y el nombre desaparecía de la fila.
  assert.equal(oracion(null), '')
  assert.equal(oracion(undefined), '')
  assert.equal(oracion(''), '')
  assert.equal(oracion('   '), '   ')
  // Los espacios internos se conservan como vinieron: no es tarea de esta función normalizarlos.
  assert.equal(oracion('JUAN  TELLO'), 'Juan  Tello')
})
