import test from 'node:test'
import assert from 'node:assert/strict'
import { frenteDeCamino, ultimoTramoDelCamino } from './frente.ts'

// ═══ EL CHEVRON QUE QUEDABA COLGANDO (24/08/2026) ═══
//
// El avance masivo limpiaba la cola del camino con `[\s·/>]+$`. El separador de `obra_wbs` no es el
// «mayor que» ASCII sino '›' (U+203A), así que la limpieza se comía el espacio y dejaba el chevron:
// bajo cada actividad de la tabla se leía «Estructura ›». Si se revierte el arreglo, este test se
// pone rojo.
test('el frente no se queda con el separador del camino', () => {
  assert.equal(
    frenteDeCamino('Estructura › Eje 5–8 › Columna de encadenado H17', 'Columna de encadenado H17'),
    'Estructura › Eje 5–8',
  )
  assert.equal(frenteDeCamino('Estructura › Columna', 'Columna'), 'Estructura')
})

test('una actividad de la raíz no tiene frente, y eso no es una etiqueta vacía', () => {
  assert.equal(frenteDeCamino('Vallado de obra', 'Vallado de obra'), null)
  assert.equal(frenteDeCamino('  ›  ', 'x'), null)
})

// El panel de la tarea publica el frente INMEDIATO en su sub-línea; con la rama entera esa línea
// se corta y el dato que identifica el trabajo («Eje 5–8») es justo el que se pierde.
test('el último tramo es el frente inmediato, no la rama entera', () => {
  assert.equal(
    ultimoTramoDelCamino('Estructura › Eje 5–8 › Columna de encadenado H17', 'Columna de encadenado H17'),
    'Eje 5–8',
  )
  assert.equal(ultimoTramoDelCamino('Vallado de obra', 'Vallado de obra'), null)
})
