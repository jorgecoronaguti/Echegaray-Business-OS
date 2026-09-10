import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hrefDeAsistencia, modoDeAsistencia, pareceTelefono } from './vistaDeAsistencia.ts'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const CHROME_ESCRITORIO = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// EL DEFECTO QUE ATRAPAN: el dueño abrió la asistencia con su usuario admin desde el teléfono y le
// salió la grilla de quincena de escritorio. Si esta función vuelve a decir 'quincena' para un
// teléfono, la pantalla vuelve al estado que él rechazó.

test('un teléfono Chromium se reconoce por sec-ch-ua-mobile', () => {
  assert.equal(pareceTelefono('?1', CHROME_ANDROID), true)
  assert.equal(modoDeAsistencia(undefined, '?1', CHROME_ANDROID), 'dia')
})

test('un iPhone se reconoce SIN client hints — Safari no manda sec-ch-ua-mobile', () => {
  assert.equal(pareceTelefono(null, SAFARI_IPHONE), true)
  assert.equal(modoDeAsistencia(undefined, null, SAFARI_IPHONE), 'dia')
})

test('el escritorio sigue viendo la grilla de quincena', () => {
  assert.equal(pareceTelefono('?0', CHROME_ESCRITORIO), false)
  assert.equal(pareceTelefono(null, CHROME_ESCRITORIO), false)
  assert.equal(modoDeAsistencia(undefined, '?0', CHROME_ESCRITORIO), 'quincena')
})

test('sin ninguna pista cae a escritorio, que es lo que la pantalla hacía hasta hoy', () => {
  assert.equal(pareceTelefono(null, null), false)
  assert.equal(modoDeAsistencia(undefined, null, null), 'quincena')
})

test('sec-ch-ua-mobile le gana al User-Agent: ?0 con un UA de teléfono NO es teléfono', () => {
  // EL DEFECTO: un iPad en «solicitar sitio de escritorio» manda `?0` y un UA que dice iPad. Si el
  // User-Agent ganara, la pantalla le discutiría al usuario lo que el usuario ya eligió.
  assert.equal(pareceTelefono('?0', SAFARI_IPHONE), false)
})

test('lo que pide la URL gana SIEMPRE — es la salida cuando la adivinanza falla', () => {
  assert.equal(modoDeAsistencia('quincena', '?1', CHROME_ANDROID), 'quincena')
  assert.equal(modoDeAsistencia('dia', '?0', CHROME_ESCRITORIO), 'dia')
  // Un valor que no es ninguno de los dos no fuerza nada: se vuelve a adivinar.
  assert.equal(modoDeAsistencia('cualquiera', '?1', CHROME_ANDROID), 'dia')
  assert.equal(modoDeAsistencia('', null, CHROME_ESCRITORIO), 'quincena')
})

// ═══ LOS ENLACES DE LA SOLAPA NO PIERDEN EL RECORTE (10/09/2026) ════════════════════════════════

const RUTA = '/administracion/personas'
const dec = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '))

test('CAMBIAR DE QUINCENA CONSERVA LA OBRA FILTRADA, EL TEXTO Y EL MODO', () => {
  // EL DEFECTO QUE ATRAPA: el filtro por obra duraba hasta el primer clic en «‹ anterior», porque
  // el enlace de quincena escribía la URL desde cero. El dueño veía la empresa entera sin pedirlo.
  const base = { quincena: '2026-09-01', q: 'gonzalez', modo: 'quincena', obra: 'ME - BSA' }
  assert.equal(dec(hrefDeAsistencia(RUTA, base, { quincena: '2026-08-16' })),
    `${RUTA}?vista=asistencia&quincena=2026-08-16&q=gonzalez&modo=quincena&obra=ME - BSA`)
})

test('UN `undefined` APAGA EL FILTRO — el mismo enlace que lo prendió', () => {
  const base = { quincena: '2026-09-01', obra: 'ME - BSA' }
  assert.equal(hrefDeAsistencia(RUTA, base, { obra: undefined }),
    `${RUTA}?vista=asistencia&quincena=2026-09-01`)
})

test('LO QUE NO ESTÁ PUESTO NO SE ESCRIBE: nada de `?q=` vacío en lo que se comparte', () => {
  assert.equal(hrefDeAsistencia(RUTA, { q: '', obra: undefined }), `${RUTA}?vista=asistencia`)
})
