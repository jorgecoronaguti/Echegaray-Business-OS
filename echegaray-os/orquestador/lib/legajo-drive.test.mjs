// EL LEGAJO EN DRIVE. Cada test acá es un emparejamiento que ya salió mal en el archivo real.
import test from 'node:test'
import assert from 'node:assert/strict'
import { carpetaDe, papelesDe, periodoDeRecibo, tokensDe } from './legajo-drive.mjs'

const CARPETAS = ['AGUERO CRISTIAN', 'ALANIZ EMANUEL', 'EMILIANO MALDONADO', 'GONZALES TOBARES JUAN GUILLERMO',
  'GONZALEZ CARLOS SAMUEL', 'GONZALEZ TOBARES EMILIANO', 'NIEVAS JUAN PABLO', 'OCHOA EDUARDO', 'PASTRAN MARCELO',
  'Petina Jairo', 'QUIROGA ALEXANDER', 'QUIROGA SEBASTIAN ADOLFO', 'Reta Sebastian', 'ROSALES DIEGO JOSE',
  'TELLO JUAN', 'ZOGBE LEONARDO']

test('el orden del nombre no importa y los acentos tampoco', () => {
  assert.equal(carpetaDe('Emanuel Alaniz', CARPETAS).carpeta, 'ALANIZ EMANUEL')
  assert.equal(carpetaDe('Juan Pablo Nievas', CARPETAS).carpeta, 'NIEVAS JUAN PABLO')
  assert.deepEqual(tokensDe('Agüero, Cristián'), ['aguero', 'cristian'])
})

test('UN token en común NO es un emparejamiento — son los dos que ya fallaron', () => {
  // «Castillo Carlos» caía en «GONZALEZ CARLOS SAMUEL» y «Gonzalez Juan» en «TELLO JUAN».
  const c = carpetaDe('Castillo Carlos', CARPETAS)
  assert.equal(c.carpeta, null)
  assert.equal(c.seguro, false)
  assert.deepEqual(c.candidatos, ['GONZALEZ CARLOS SAMUEL'])
})

test('cuando dos carpetas empatan NO se elige la primera del array', () => {
  // «Gonzalez Juan» comparte «juan» con dos carpetas. Quedarse con una sería convertir el orden
  // alfabético en un criterio de identidad — y una de las dos es la persona equivocada.
  const g = carpetaDe('Gonzalez Juan', CARPETAS)
  assert.equal(g.carpeta, null)
  assert.equal(g.tokens, 1)
  assert.equal(g.candidatos.length, 5, 'cinco carpetas comparten un token con «Gonzalez Juan»')
  assert.ok(g.candidatos.includes('GONZALES TOBARES JUAN GUILLERMO'), 'la correcta está entre ellas, y no se puede elegir sola')
  assert.ok(g.candidatos.includes('TELLO JUAN'), 'la equivocada también')
})

test('una letra de diferencia en el apellido tampoco alcanza sola', () => {
  // «Zogber» contra «ZOGBE»: comparten sólo el nombre de pila.
  const z = carpetaDe('Zogber Leonardo', CARPETAS)
  assert.equal(z.seguro, false)
  assert.deepEqual(z.candidatos, ['ZOGBE LEONARDO'])
})

test('sin ningún token en común no se propone ningún candidato', () => {
  const s = carpetaDe('Sosa Raul', CARPETAS)
  assert.equal(s.carpeta, null)
  assert.deepEqual(s.candidatos, [])
  assert.equal(s.tokens, 0)
})

test('los cuatro papeles se detectan por su nombre, con o sin apellido pegado', () => {
  const p = papelesDe(['alta - quiroga s.pdf', 'HM - QUIROGA SEBASTIAN.pdf', 'DNI.pdf', 'Recibo 2026-08 Q1.pdf'])
  assert.equal(p.alta, true)
  assert.equal(p.libreta, true)
  assert.equal(p.dni, true)
  assert.equal(p.epp, false)
  assert.deepEqual(p.falta, ['EPP'])
})

test('«HM» es la libreta del IERIC y no se confunde con otra cosa que empiece igual', () => {
  assert.equal(papelesDe(['HMM raro.pdf']).libreta, false)
  assert.equal(papelesDe(['hm.pdf']).libreta, true)
})

test('el último recibo es el mayor período, no el último archivo de la lista', () => {
  const p = papelesDe(['Recibo 2026-08 Q2.pdf', 'Recibo 2025-12 Q1.pdf', 'Recibo 2026-01 Q1.pdf'])
  assert.equal(p.recibos, 3)
  assert.equal(p.ultimoRecibo, '2026-08 Q2')
})

test('una carpeta vacía dice que faltan los cuatro, no que esté todo bien', () => {
  assert.deepEqual(papelesDe([]).falta, ['Alta', 'Libreta IERIC', 'DNI', 'EPP'])
  assert.equal(papelesDe([]).ultimoRecibo, null)
})

test('un nombre de recibo sin período no inventa uno', () => {
  assert.equal(periodoDeRecibo('Recibo viejo.pdf'), null)
})
