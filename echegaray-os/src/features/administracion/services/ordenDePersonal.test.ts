// EL ORDEN DEL MÓDULO PERSONAL, PROBADO DONDE SE ROMPÍA.
//
// El dueño (10/09/2026): «te pedí uniformidad en las pantallas; acá estoy en la sección y es
// distinto a las demás». LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que una pantalla ordene alfabéticamente y mande a los jefes al final (Pagos, hasta hoy).
//  2. Que el alfabético se haga con `<` en vez de `localeCompare(…, 'es')`: con el orden binario la
//     Ñ cae después de la Z y los acentos ordenan al final del alfabeto.
//  3. Que el cuadro de Oficina se publique DESPUÉS del de Obreros, al revés que Plantel y Horas.
//  4. Que un cuadro de liquidaciones finales se rotule «Obreros · N»: son subcontratistas y gente
//     que ya se fue (dueño, 31/08/2026), no el plantel.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORDEN_DE_CUADROS, ordenarComoPersonal, ordenarCuadros, seccionesDePersonal,
} from './ordenDePersonal.ts'

interface P { nombre: string; esJefe: boolean }
const nombreDe = (p: P) => p.nombre
const esJefeDe = (p: P) => p.esJefe

test('JEFES PRIMERO Y ALFABÉTICO EN ESPAÑOL DENTRO DE CADA GRUPO', () => {
  const gente: P[] = [
    { nombre: 'Zogbe Ramos Walter', esJefe: false },
    { nombre: 'Nievas Villegas Juan Pablo', esJefe: true },
    { nombre: 'Aguero Cristian', esJefe: false },
    { nombre: 'Maldonado Batista Emiliano', esJefe: true },
  ]
  const r = ordenarComoPersonal(gente, nombreDe, esJefeDe).map(nombreDe)
  // EL DEFECTO QUE ATRAPA: el alfabético puro deja a Maldonado y Nievas en el medio y a nadie
  // arriba. Con la regla del módulo, los dos jefes encabezan la lista.
  assert.deepEqual(r, [
    'Maldonado Batista Emiliano', 'Nievas Villegas Juan Pablo',
    'Aguero Cristian', 'Zogbe Ramos Walter',
  ])
})

test('LA Ñ Y LOS ACENTOS ORDENAN COMO EN ESPAÑOL, NO POR CÓDIGO', () => {
  const gente: P[] = [
    { nombre: 'Zapata', esJefe: false },
    { nombre: 'Núñez', esJefe: false },
    { nombre: 'Nunez', esJefe: false },
  ]
  assert.deepEqual(ordenarComoPersonal(gente, nombreDe, esJefeDe).map(nombreDe),
    ['Nunez', 'Núñez', 'Zapata'])
})

test('EL ORDEN ES ESTABLE: dos nombres iguales conservan el orden de llegada', () => {
  const gente = [
    { nombre: 'Gonzalez', esJefe: false, id: 'a' },
    { nombre: 'Gonzalez', esJefe: false, id: 'b' },
  ]
  assert.deepEqual(
    ordenarComoPersonal(gente, (p) => p.nombre, (p) => p.esJefe).map((p) => p.id), ['a', 'b'])
})

test('LOS CUADROS SALEN OFICINA → OBREROS → FINALES', () => {
  // EL DEFECTO QUE ATRAPA: `['obreros','oficina','final']`, que es lo que publicaba Pagos.
  assert.deepEqual([...ORDEN_DE_CUADROS], ['oficina', 'obreros', 'final'])
  const cuadros = [{ grupo: 'final' as const }, { grupo: 'obreros' as const }, { grupo: 'oficina' as const }]
  assert.deepEqual(ordenarCuadros(cuadros).map((c) => c.grupo), ['oficina', 'obreros', 'final'])
})

test('EL RÓTULO DEL CUADRO ES EL DE PERSONAL CUANDO TODAS SUS LÍNEAS SON DE ESE ROL', () => {
  const oficina: P[] = [
    { nombre: 'Nievas Villegas Juan Pablo', esJefe: true },
    { nombre: 'Maldonado Batista Emiliano', esJefe: true },
  ]
  const s = seccionesDePersonal('oficina', 'Oficina · mensual', oficina, nombreDe, esJefeDe)
  assert.equal(s.length, 1)
  assert.equal(s[0].rotulo, 'Jefes de obra · 2', 'el mismo texto que Plantel y Asistencia')
  assert.deepEqual(s[0].lineas.map(nombreDe),
    ['Maldonado Batista Emiliano', 'Nievas Villegas Juan Pablo'])

  const obreros: P[] = [{ nombre: 'Tello Juan', esJefe: false }, { nombre: 'Aguero Cristian', esJefe: false }]
  assert.equal(seccionesDePersonal('obreros', 'Obreros · quincenal', obreros, nombreDe, esJefeDe)[0].rotulo,
    'Obreros · 2')
})

test('UN EMPLEADO DE OFICINA QUE NO ES JEFE NO CHOCA CON EL CUADRO DE OBREROS', () => {
  // EL DEFECTO QUE ATRAPA (auditoría 10/09/2026): la sección salía con `clave: 'obreros'` —la misma
  // que el cuadro de obreros—, así que React recibía dos `key` iguales, había dos
  // `data-testid="seccion-obreros"` y el título «Oficina · mensual» desaparecía de la pantalla.
  const oficina: P[] = [{ nombre: 'Perez Administrativa', esJefe: false }]
  const obreros: P[] = [{ nombre: 'Aguero Cristian', esJefe: false }]
  const sOficina = seccionesDePersonal('oficina', 'Oficina · mensual', oficina, nombreDe, esJefeDe)
  const sObreros = seccionesDePersonal('obreros', 'Obreros · quincenal', obreros, nombreDe, esJefeDe)
  assert.notEqual(sOficina[0].clave, sObreros[0].clave)
  assert.equal(sOficina[0].clave, 'oficina-obreros')
  assert.equal(sObreros[0].clave, 'obreros-obreros')
  // Y el rótulo del cuadro de Oficina sigue diciendo de qué cuadro es: «Obreros · 1» ahí sería falso.
  assert.equal(sOficina[0].rotulo, 'Oficina · mensual')
  assert.equal(sObreros[0].rotulo, 'Obrero · 1', 'singular con uno solo: la regla ya vivía en vocabularioPersona')
})

test('EL NOMBRE DEL CUADRO MANDA CUANDO EL ROL NO DESCRIBE A LA LISTA', () => {
  // Liquidaciones finales: subcontratistas de Gerson Castro y gente que se fue. Rotularlos
  // «Obreros · 2» afirmaría que son del plantel.
  const finales: P[] = [{ nombre: 'Castro Galvan Gerson', esJefe: false }, { nombre: 'Avila Alejandro', esJefe: false }]
  const s = seccionesDePersonal('final', 'Liquidaciones finales', finales, nombreDe, esJefeDe)
  assert.equal(s[0].rotulo, 'Liquidaciones finales')
  assert.equal(s[0].clave, 'final-obreros')
  assert.deepEqual(s[0].lineas.map(nombreDe), ['Avila Alejandro', 'Castro Galvan Gerson'])

  // Un cuadro con los dos roles mezclados tampoco puede llevar el rótulo de uno solo.
  const mezcla: P[] = [{ nombre: 'Nievas', esJefe: true }, { nombre: 'Aguero', esJefe: false }]
  assert.equal(seccionesDePersonal('obreros', 'Obreros · quincenal', mezcla, nombreDe, esJefeDe)[0].rotulo,
    'Obreros · quincenal')
})

test('UNA LISTA VACÍA NO PRODUCE UNA SECCIÓN CON RÓTULO Y SIN NADIE', () => {
  assert.deepEqual(seccionesDePersonal('final', 'Liquidaciones finales', [], nombreDe, esJefeDe), [])
})
