// UN CAMBIO DE LAYOUT NO PUEDE DEJAR A CAJA SIN FORMATO.
//
// ═══ EL DEFECTO MEDIDO EL 04/09/2026 ═══
//
// El dueño, mirando la pestaña: *"las tarjetas en caja están rotas"*. Y lo estaban: el PDF exportado
// mostraba «CAJA INVERTI…» con el valor cortado en «$45.138.», y la tarjeta del medio publicando
// literalmente «($» — el número entero fuera de la vista.
//
// La causa no era el cálculo: los cinco importes eran correctos. Era el ANCHO de las columnas E a J,
// que se quedó en el del layout anterior. CAJA pasó de 55 a 68 filas y las cuatro filas de avisos
// volvieron; las huellas de formato se indexan por COORDENADA, así que en cada rango corrido la
// guarda encontró un formato que ella no había sellado ahí y contestó, seis veces seguidas:
//
//     🎨 "CAJA"!COLUMNS:4-5: no re-aplico el formato — ese rango ya tiene un formato que yo no puse
//
// Lo grave es que era PERMANENTE: un rango que no se re-aplica tampoco se re-sella, así que la
// corrida siguiente —y las de cada dos horas— encontraban exactamente lo mismo. Hubo que borrar las
// 18 huellas de formato de CAJA a mano en la base para que el generador pudiera volver a dibujar sus
// propias tarjetas. Un control que impide corregir un defecto lo vuelve eterno.
//
// El remedio ya existía y estaba cableado en UNA sola pestaña («Impuestos y Financieros»), por el
// mismo motivo y con el mismo lib. Este test fija que CAJA también lo tenga.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { elLayoutCambio } from '../lib/huella-formato-layout.mjs'

const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')

test('el generador de CAJA invalida sus huellas de formato cuando le cambia el layout', () => {
  assert.match(src, /import \{[^}]*elLayoutCambio[^}]*invalidarHuellasDeFormato[^}]*\} from '\.\.\/lib\/huella-formato-layout\.mjs'/,
    'sin este import la guarda deja las tarjetas cortadas para siempre')
  assert.match(src, /elLayoutCambio\(/, 'hay que PREGUNTAR si el layout cambió, no suponerlo')
  assert.match(src, /invalidarHuellasDeFormato\(/, 'y borrar las huellas viejas cuando cambió')
})

test('la invalidación va ANTES de la primera escritura de la corrida', () => {
  // El borrado de notas y el `unmergeCells` también son requests de formato: si la invalidación
  // fuera después, esos dos quedarían del lado bloqueado y las tarjetas seguirían fusionadas mal.
  const iInvalida = src.indexOf('invalidarHuellasDeFormato(')
  const iUnmerge = src.indexOf('unmergeCells:')
  assert.ok(iInvalida > 0 && iUnmerge > 0, 'los dos tienen que existir en el generador')
  assert.ok(iInvalida < iUnmerge,
    'la invalidación tiene que correr antes del unmerge, que también es un request de formato')
})

test('no invalida cuando el layout NO cambió — el formato del dueño se respeta', () => {
  // El lado que importa del control: si se disparara siempre, borraría las huellas en cada corrida y
  // la guarda dejaría de proteger el formato que puso el dueño. Un control que siempre da positivo
  // no controla nada.
  const filas = [['POSICIÓN DE CAJA'], ['CAJA DISPONIBLE'], [''], ['1 · DISTRIBUCIÓN POR CUENTAS']]
  assert.equal(elLayoutCambio(filas, filas.map((f) => [...f])).cambio, false)
})

test('SÍ invalida cuando vuelven las filas de avisos — el caso real de CAJA', () => {
  const antes = [['POSICIÓN DE CAJA'], ['1 · DISTRIBUCIÓN POR CUENTAS'], ['Total disponibilidades']]
  const ahora = [['POSICIÓN DE CAJA'], ['1 · DISTRIBUCIÓN POR CUENTAS'], ['Total disponibilidades'],
    ['3 · ALERTAS CRÍTICAS'], ['4 · ACCIONES RECOMENDADAS']]
  const r = elLayoutCambio(antes, ahora)
  assert.equal(r.cambio, true)
  assert.match(r.motivo, /3 a 5 filas/)
})
