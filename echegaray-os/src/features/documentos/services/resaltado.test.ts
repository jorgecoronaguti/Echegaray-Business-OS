// EL DEFECTO QUE ATRAPA: que el resaltado corte el texto por el lugar equivocado.
//
// Partir por las posiciones de `plano()` —que colapsa los separadores seguidos— desplaza el corte y
// resalta media palabra de al lado. Y un acento descompuesto en NFD agrega un carácter: sin el mapeo
// uno a uno, «Tracción» se resalta hasta «Tracció» y la í queda afuera.

import test from 'node:test'
import assert from 'node:assert/strict'
import { aplanarConservandoPosiciones, hayCoincidencia, tramosResaltados } from './resaltado.ts'
import { migajaDe } from './documentos.ts'

const pintado = (texto: string, tokens: string[]) =>
  tramosResaltados(texto, tokens).filter((t) => t.coincide).map((t) => t.texto)

const entero = (texto: string, tokens: string[]) =>
  tramosResaltados(texto, tokens).map((t) => t.texto).join('')

test('el aplanado conserva el largo, carácter por carácter', () => {
  for (const s of ['DNI - Capelli.pdf', 'Vision / Tracción', 'Diseño  del   Año', '2026-08-31 · MASS']) {
    assert.equal(aplanarConservandoPosiciones(s).length, s.length, s)
  }
  assert.equal(aplanarConservandoPosiciones('Diseño'), 'diseño', 'la ñ es una letra, no un acento')
  assert.equal(aplanarConservandoPosiciones('Tracción'), 'traccion')
})

test('resalta las palabras que coinciden y deja el texto intacto', () => {
  const nombre = 'DNI - Capelli.pdf'
  assert.deepEqual(pintado(nombre, ['dni', 'capelli']), ['DNI', 'Capelli'])
  assert.equal(entero(nombre, ['dni', 'capelli']), nombre, 'el texto mostrado no puede cambiar')
})

test('el acento no desplaza el corte', () => {
  assert.deepEqual(pintado('Vision / Tracción', ['traccion']), ['Tracción'])
})

test('se resalta la palabra ENTERA, no el prefijo singular del token', () => {
  // El token es «actividad» porque el tokenizador singulariza. Pintar «ACTIVIDAD» y dejar «ES»
  // apagado se lee como un error de la pantalla.
  assert.deepEqual(pintado('ECHEGARAY_REPORTE ACTIVIDADES MASS Agosto.V003.pdf', ['actividad', 'agosto']),
    ['ACTIVIDADES', 'Agosto'])
})

test('sin tokens no hay más que un tramo: la lista sin búsqueda se dibuja igual que siempre', () => {
  assert.deepEqual(tramosResaltados('DNI - Capelli.pdf', []), [{ texto: 'DNI - Capelli.pdf', coincide: false }])
  assert.deepEqual(tramosResaltados('', ['dni']), [])
  assert.equal(hayCoincidencia('DNI - Capelli.pdf', []), false)
})

test('una palabra que sólo CONTIENE el token no se resalta', () => {
  // El peldaño de la escalera compara por token completo o por prefijo; resaltar «caja» adentro de
  // «encajado» diría que la fila entró por algo que no la hizo entrar.
  assert.deepEqual(pintado('Planilla encajada', ['caja']), [])
})

test('entre dos carpetas que coinciden, la migaja muestra la MÁS PROFUNDA', () => {
  // Medido en la pantalla: buscando «dni de capelli», la raíz del legajo se llama «PERSONAL: ALTAS -
  // BAJAS - HM - EPP - DNI» y coincide con «dni». Mostrar esa —genérica y larga, se corta en la
  // columna— en vez de «CAPELLI CESAR» es no decir nada.
  const ruta = 'administracion/PERSONAL: ALTAS - BAJAS - HM - EPP - DNI/2. INACTIVOS/CAPELLI CESAR/RECIBOS/x.pdf'
  assert.equal(migajaDe(ruta, 3, ['dni', 'capelli']), '… / CAPELLI CESAR / RECIBOS')
})

test('la migaja NO elide la carpeta que coincidió', () => {
  const ruta = 'administracion/PERSONAL: ALTAS - BAJAS/2. INACTIVOS/CAPELLI CESAR/RECIBOS DE SUELDO/DNI - Capelli.pdf'
  // Sin tokens, la carpeta del apellido cae justo en el «…» y la fila no muestra por qué está.
  assert.equal(migajaDe(ruta), 'administracion / … / RECIBOS DE SUELDO')
  assert.equal(migajaDe(ruta, 3, ['capelli']), '… / CAPELLI CESAR / RECIBOS DE SUELDO')
  assert.ok(hayCoincidencia(migajaDe(ruta, 3, ['capelli']), ['capelli']))
})

test('la migaja corta no cambia por tener tokens', () => {
  const corta = 'archivo-fiscal/2025/931/2025-08 F.931.pdf'
  assert.equal(migajaDe(corta, 3, ['931']), 'archivo-fiscal / 2025 / 931')
})
