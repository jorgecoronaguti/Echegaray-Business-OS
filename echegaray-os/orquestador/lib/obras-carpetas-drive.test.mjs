import test from 'node:test'
import assert from 'node:assert/strict'
import { carpetaDeObraDe, vincularCarpetas, FUENTES } from './obras-carpetas-drive.mjs'

// LOS DATOS SON LOS REALES DEL DRIVE DE ECHEGARAY (11/09/2026). Los dos casos difíciles existen:
// la carpeta «BSA - DEMOLICION Y PILETA DE CONTENCION» la DECLARAN dos obras —la madre y su
// adicional—, y «PLATEA DE HORMIGON - Playon de azufre» tiene adentro papeles de las dos.

const R = 'administracion/PRESUPUESTOS - CLIENTES'
const MESSINA = 'cli-messina'
const carpeta = (ruta, id) => ({ drive_file_id: id, name: ruta.split('/').pop(), path: `${R}/${ruta}`, depth: `${R}/${ruta}`.split('/').length - 1 })
const OBRAS = [
  { id: 'messina-bsa', nombre: 'ME - BSA', cliente_id: MESSINA, obra_padre_id: null, drive_carpeta_id: 'f-bsa' },
  { id: 'bsa-adicional', nombre: 'BSA - Adicional', cliente_id: MESSINA, obra_padre_id: 'messina-bsa', drive_carpeta_id: 'f-bsa' },
  { id: 'messina-playon-azufre', nombre: 'ME - PLAYÓN DE AZUFRE', cliente_id: MESSINA, obra_padre_id: null, drive_carpeta_id: null },
  { id: 'messina-adicional-tercer-muro', nombre: 'ME - ADICIONAL TERCER MURO', cliente_id: MESSINA, obra_padre_id: 'messina-playon-azufre', drive_carpeta_id: null },
  { id: 'messina-pisos-120-rampa', nombre: 'ME - PISOS 120 M² Y RAMPA', cliente_id: MESSINA, obra_padre_id: null, drive_carpeta_id: null },
]
const CARPETAS = [
  carpeta('MESSINA/BSA - DEMOLICION Y PILETA DE CONTENCION', 'f-bsa'),
  carpeta('MESSINA/PLATEA DE HORMIGON - Playon de azufre', 'f-azufre'),
  carpeta('MESSINA/PLATEA DE HORMIGON - Playon de azufre/Cotizaciones', 'f-azufre-cot'),
  carpeta('MESSINA/PISOS INDUSTRIALES 120m2', 'f-pisos'),
]
const ALIAS = [{ alias: 'playon azufre', obra_id: 'messina-playon-azufre' }, { alias: 'pisos 120m2', obra_id: 'messina-pisos-120-rampa' }]
const clienteDe = () => MESSINA
const correr = (extra = {}) => vincularCarpetas({
  carpetas: CARPETAS, anclas: [], obras: OBRAS, alias: ALIAS, nivelObra: 4, clienteDe, ...extra,
})
const de = (r, ruta) => r.vinculos.find((v) => v.ruta === `${R}/${ruta}`)

test('la carpeta de obra de un papel es la de PRIMER nivel, no la subcarpeta donde lo guardaron', () => {
  // «Cotizaciones», «PRESUPUESTO - OC» y «ARCHIVOS VIEJOS» se repiten en todas las obras: no
  // identifican ninguna.
  assert.equal(carpetaDeObraDe(`${R}/MESSINA/PLATEA DE HORMIGON - Playon de azufre/Cotizaciones/ADICIONAL MURO.pdf`, 4),
    `${R}/MESSINA/PLATEA DE HORMIGON - Playon de azufre`)
  // Un archivo suelto en la carpeta del CLIENTE no deduce ninguna carpeta de obra.
  assert.equal(carpetaDeObraDe(`${R}/MESSINA/Nota Rodrigo.jpg`, 4), null)
})

test('dos obras SIN parentesco declaran la misma carpeta: no se vincula, se reporta', () => {
  const sinPadre = OBRAS.map((o) => ({ ...o, obra_padre_id: null }))
  const r = vincularCarpetas({ carpetas: CARPETAS, anclas: [], obras: sinPadre, alias: ALIAS, nivelObra: 4, clienteDe })
  assert.equal(de(r, 'MESSINA/BSA - DEMOLICION Y PILETA DE CONTENCION'), undefined,
    'se quedó con el vínculo de la primera obra que apareció, que es decidir por orden de lectura')
  assert.ok(r.dudas.some((d) => d.tipo === 'carpeta-declarada-por-dos-obras'))
})

test('con el parentesco declarado, la carpeta es de la obra MAYOR', () => {
  // Es el caso real: `bsa-adicional` y `messina-bsa` apuntan a la misma carpeta y una es adicional
  // de la otra. La carpeta es de la madre; el adicional muestra igual sus papeles atados.
  const r = correr()
  assert.equal(de(r, 'MESSINA/BSA - DEMOLICION Y PILETA DE CONTENCION').obra_id, 'messina-bsa')
  assert.equal(de(r, 'MESSINA/BSA - DEMOLICION Y PILETA DE CONTENCION').fuente, FUENTES.DECLARADA)
  assert.equal(r.dudas.filter((d) => d.tipo === 'carpeta-declarada-por-dos-obras').length, 0)
})

test('un papel de la obra adentro vincula la carpeta, aunque el nombre no diga nada', () => {
  const r = correr({
    anclas: [{ obra_id: 'messina-pisos-120-rampa', drive_file_id: 'a1', que: 'obra_contrato', path: `${R}/MESSINA/PISOS INDUSTRIALES 120m2/COTIZACION.pdf` }],
  })
  const v = de(r, 'MESSINA/PISOS INDUSTRIALES 120m2')
  assert.equal(v.obra_id, 'messina-pisos-120-rampa')
  assert.equal(v.fuente, FUENTES.ANCLA)
})

test('el nombre NO vincula por parecido: sin evidencia, la carpeta queda para el dueño', () => {
  // «PISOS INDUSTRIALES 120m2» no resuelve a «ME - PISOS 120 M² Y RAMPA» por alias ni por nombre, y
  // está bien: un enlace equivocado pone los papeles de una obra abajo de otra.
  const r = correr()
  assert.equal(de(r, 'MESSINA/PISOS INDUSTRIALES 120m2'), undefined)
  assert.ok(r.dudas.some((d) => d.tipo === 'carpeta-sin-obra' && d.ruta.endsWith('PISOS INDUSTRIALES 120m2')))
  assert.ok(r.sinCarpeta.includes('messina-pisos-120-rampa'))
})

test('una duda que una regla posterior resolvió no se le muestra al dueño', () => {
  // La carpeta del Playón tiene anclas de la madre Y del adicional (empate), pero su NOMBRE nombra
  // a la madre: queda resuelta y no se reporta.
  const sinPadre = OBRAS.map((o) => ({ ...o, obra_padre_id: null }))
  const anclas = [
    { obra_id: 'messina-playon-azufre', drive_file_id: 'a1', que: 'obra_contrato', path: `${R}/MESSINA/PLATEA DE HORMIGON - Playon de azufre/Cotizaciones/PLATEA.pdf` },
    { obra_id: 'messina-adicional-tercer-muro', drive_file_id: 'a2', que: 'cliente_orden', path: `${R}/MESSINA/PLATEA DE HORMIGON - Playon de azufre/OC_2256.pdf` },
  ]
  const r = vincularCarpetas({ carpetas: CARPETAS, anclas, obras: sinPadre, alias: ALIAS, nivelObra: 4, clienteDe })
  assert.equal(de(r, 'MESSINA/PLATEA DE HORMIGON - Playon de azufre').obra_id, 'messina-playon-azufre')
  assert.equal(r.dudas.filter((d) => d.ruta?.endsWith('Playon de azufre')).length, 0)
})

test('la subcarpeta genérica no es candidata: sus archivos ya cuelgan de la carpeta de la obra', () => {
  const r = correr()
  assert.equal(de(r, 'MESSINA/PLATEA DE HORMIGON - Playon de azufre/Cotizaciones'), undefined)
  assert.equal(r.dudas.filter((d) => d.ruta?.endsWith('/Cotizaciones')).length, 0,
    'la lista del dueño se llenó de subcarpetas genéricas que no identifican ninguna obra')
})

test('la carpeta de un cliente que no existe en el OS se separa de las dudas de verdad', () => {
  const r = vincularCarpetas({
    carpetas: [carpeta('VUELO PLACO/2024-6-5', 'f-vp')], anclas: [], obras: OBRAS, alias: ALIAS,
    nivelObra: 4, clienteDe: () => null,
  })
  assert.deepEqual(r.vinculos, [])
  assert.ok(r.dudas.some((d) => d.tipo === 'cliente-sin-obras-en-el-os'))
  // Y la carpeta declarada que el índice de Drive no conoce también se dice: un `drive_carpeta_id`
  // que apunta a una carpeta que no está indexada es un vínculo que nadie puede usar.
  assert.ok(r.dudas.some((d) => d.tipo === 'carpeta-declarada-no-indexada'))
})
