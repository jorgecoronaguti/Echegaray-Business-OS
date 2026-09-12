// EL CENSO DE DUEÑOS LLAMABA HUÉRFANAS A DOS PESTAÑAS QUE TIENEN GENERADOR.
//
// Medido el 05/09/2026 contra el archivo vivo, la corrida decía:
//
//   ✖ Materiales    HUÉRFANA: ningún script la mantiene
//   ✖ Proveedores   HUÉRFANA: ningún script la mantiene
//
// Y es falso: las escribe `proveedores-materiales-pestana.mjs`, que está RETIRADO del pipeline a
// propósito desde el 14/08 —apilaba una capa por corrida— con su motivo y sus cuatro condiciones de
// vuelta escritas en `PASOS_RETIRADOS`. El costo de la confusión es concreto: manda a escribir de
// cero un generador que ya existe, y esconde lo que habría que medir para reactivar el que hay.
//
// Estos tests prueban las DOS direcciones. Sin la segunda, un `frenoDe` que devolviera siempre un
// objeto pasaría el primero y dejaría de reportar huérfanas de verdad.

import test from 'node:test'
import assert from 'node:assert/strict'
import { censar, frenoDe } from './auditar-duenos-pestanas.mjs'
import { PASOS_RETIRADOS } from '../lib/flujo-caja-pasos.mjs'

const TITULOS = ['Materiales', 'Proveedores', 'Estructura', '_LO_QUE_SEA']
// ═══ «MATERIALES» VOLVIÓ A TENER DUEÑO EL 09/09/2026, Y EL FIXTURE LO DICE (commit 3a2cd723) ═══
//
// Estuvo 26 días sin generador y por eso salía FRENADA: el freno de `proveedores-materiales-pestana`
// la declaraba en `dejoSinDueno`. `materiales-pestana.mjs` (385 líneas, contra las 2.852 del retirado)
// la escribe desde entonces, así que ya no es un costo del freno — es una pestaña con dueño, y lo que
// el freno sigue costando es MEDIA pestaña de Proveedores, que es lo único que quedó en `cuesta`.
// El paso entra al fixture porque el censo se mide contra los pasos que existen, no contra los que
// existían: sin él, este test afirmaría que Materiales no tiene dueño cuando sí lo tiene.
const PASOS_FALSOS = [
  ['estructura-pestana.mjs', 'Estructura', ['Estructura']],
  ['materiales-pestana.mjs', 'Materiales', ['Materiales']],
]

test('Proveedores sale FRENADA; Materiales ya no, porque volvió a tener generador', () => {
  const r = censar(TITULOS, PASOS_FALSOS, {})
  assert.deepEqual(r.frenadas.map((f) => f.pestana), ['Proveedores'])
  assert.deepEqual(r.huerfanas.map((f) => f.pestana), ['_LO_QUE_SEA'],
    'lo que NO tiene freno declarado sigue siendo huérfano: si esto se vacía, el censo dejó de servir')
  // Y NO PUEDE ESTAR EN LAS DOS LISTAS: una pestaña con dueño no es ni frenada ni huérfana. Si
  // mañana el censo la contara como las dos cosas, la corrida mandaría a escribir un generador que
  // ya existe — que es exactamente la confusión que este archivo vino a cerrar.
  for (const lista of ['frenadas', 'huerfanas']) {
    assert.ok(!r[lista].some((f) => f.pestana === 'Materiales'),
      `Materiales volvió a aparecer en ${lista} teniendo generador propio`)
  }
})

test('cada frenada llega con el criterio de vuelta, que es lo que hay que poder leer sin abrir el código', () => {
  const r = censar(TITULOS, PASOS_FALSOS, {})
  for (const f of r.frenadas) {
    assert.equal(f.freno.script, 'proveedores-materiales-pestana.mjs')
    assert.ok(String(f.freno.vuelve).length > 40, `el freno de "${f.pestana}" no dice qué hay que medir para volver`)
    assert.ok(String(f.freno.desde).match(/^\d{4}-\d{2}-\d{2}$/), 'un freno sin fecha no se puede envejecer')
  }
})

test('SIN el registro de frenos, las dos vuelven a ser huérfanas — la prueba de vida del mecanismo', () => {
  // Es el estado anterior al 05/09, reproducido. Sin este test, `frenoDe` podría estar devolviendo
  // el freno por casualidad (por ejemplo matcheando cualquier cosa) y nadie lo vería.
  const r = censar(TITULOS, PASOS_FALSOS, {}, [])
  assert.deepEqual(r.frenadas, [])
  // Materiales NO vuelve a la lista: la sostiene su generador, no el registro de frenos.
  assert.deepEqual(r.huerfanas.map((f) => f.pestana), ['Proveedores', '_LO_QUE_SEA'])
})

test('el vínculo freno → pestaña se lee de `cuesta`, y ese formato queda atado acá', () => {
  // `cuesta` es prosa ('Proveedores · de la frontera para abajo (…)') y el vínculo se resuelve
  // cortando en el primer '·'. Es frágil a propósito y por falta de algo mejor: un paso retirado no
  // figura en PASOS, así que no declara sus pestañas en ningún lado con estructura. Si alguien
  // reescribe `cuesta` con otra forma, este test se pone rojo ANTES de que el censo vuelva a mentir.
  const freno = PASOS_RETIRADOS.find((r) => r.script === 'proveedores-materiales-pestana.mjs')
  assert.ok(freno.cuesta.some((c) => c.split('·')[0].trim() === 'Proveedores'))
  // «Materiales» SALIÓ de `cuesta` el 09/09 y eso es el resultado que se buscaba: un freno cuesta
  // menos cuando alguien escribe el generador que faltaba. Se afirma la salida para que nadie la
  // vuelva a agregar «por prolijidad» y el censo vuelva a pedir un generador que ya existe.
  assert.ok(!freno.cuesta.some((c) => c.split('·')[0].trim() === 'Materiales'),
    'Materiales volvió a costar: ¿se retiró materiales-pestana.mjs? Entonces declaralo como paso retirado')
  assert.equal(frenoDe('Materiales'), null, 'Materiales tiene dueño: ningún freno puede reclamarla')
  assert.equal(frenoDe('Estructura'), null, 'una pestaña que ningún freno menciona no puede salir frenada')
})
