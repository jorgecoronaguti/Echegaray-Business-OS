// EL DEFECTO QUE ESTOS TESTS ATRAPAN.
//
// `Cobranzas!V5:V241` publica el estado de cada cobro con cinco emoji. El PDF no los dibuja, así que
// la columna que el dueño usa para saber qué está vencido se imprime sin una sola marca. Si alguien
// revierte la traducción —o la resuelve mapeando todo a `ALERTA`— estos tests se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { SEMAFORO, aGlifosQueDibujan, sinTraduccion, necesitaTraduccion } from './glifos-semaforo.mjs'
import { esInvisible, glifosInvisibles, ALERTA } from './glifos.mjs'

/** La fórmula REAL, transcrita de `Cobranzas!V5` el 15/08 con `render: FORMULA`. */
const V5 = '=IF(J5="";"";IF(O5="Cobrado";"✅ Cobrado";IF(O5="Vencido";"🔴 Vencido";'
  + 'IF(O5="Proyectado";"🔵 Proyectado";IF(Q5<TODAY();"🔴 Vencido";'
  + 'IF(Q5-TODAY()<=7;"🟠 Por vencer";"🟢 Vigente"))))))'

test('EL DEFECTO: los cinco glifos de la fórmula real se pierden al exportar', () => {
  const ciegos = glifosInvisibles(V5)
  assert.deepEqual(ciegos.sort(), ['✅', '🔴', '🔵', '🟠', '🟢'].sort(),
    'son cinco estados, no cuatro: `🔵 Proyectado` también está en la fórmula')
})

test('traducida, la fórmula no deja UN SOLO glifo que el PDF no dibuje', () => {
  assert.deepEqual(sinTraduccion(V5), [], 'quedó un glifo invisible sin traducir')
  for (const g of Object.values(SEMAFORO)) assert.equal(esInvisible(g), false, `${g} tampoco se dibuja`)
})

test('el reemplazo es TEXTUAL: sólo cambian los glifos, la fórmula del dueño queda intacta', () => {
  const salida = aGlifosQueDibujan(V5)
  // Lo que NO se puede tocar: los umbrales, los rangos y la forma de la cascada. Si un día esto se
  // "arregla" regenerando la fórmula, el `<=7` que el dueño eligió se pierde sin que nadie lo note.
  assert.ok(salida.includes('Q5-TODAY()<=7'), 'el umbral de 7 días es del dueño y tiene que sobrevivir')
  assert.ok(salida.includes('IF(J5="";"";'), 'la guarda de fila vacía tiene que sobrevivir')
  assert.equal(salida.split('IF(').length, V5.split('IF(').length, 'la cascada tiene que quedar igual de larga')
  // Y EL ÚNICO CAMBIO SON LOS GLIFOS: mismo texto contado por caracteres, uno por uno.
  // Contado en code points, no en `.length`: los emoji del semáforo son astrales y ocupan DOS
  // unidades UTF-16, así que la fórmula traducida mide 5 unidades menos sin haber perdido una letra.
  // Esa diferencia es la que hace que un texto con emoji se mida más ancho de lo que se ve.
  assert.equal([...salida].length, [...V5].length)
})

test('LOS CINCO ESTADOS SIGUEN SIENDO CINCO: `ALERTA` sola los colapsaría en uno', () => {
  const salida = aGlifosQueDibujan(V5)
  const marcas = [...salida.matchAll(/"(\S) ([A-Za-zÁ-ú ]+)"/g)].map((m) => `${m[1]} ${m[2]}`)
  assert.deepEqual([...new Set(marcas)], ['✓ Cobrado', `${ALERTA} Vencido`, '⊘ Proyectado', '⇒ Por vencer', '· Vigente'])
  const glifos = new Set([...new Set(marcas)].map((m) => m[0]))
  assert.equal(glifos.size, 5, 'cinco estados distintos necesitan cinco marcas distintas')
  assert.equal([...glifos].filter((g) => g === ALERTA).length, 1, 'sólo el vencido lleva la alerta')
})

test('el `⚠` publicado viaja con el semáforo: es la misma celda y el mismo PDF', () => {
  // El encabezado real de `Cobranzas!Z4`, escrito por el OS cuando reconstruyó los rótulos que él
  // mismo había pisado. Lleva `⚠` y se pierde igual que los emoji del semáforo.
  const z4 = 'Retención 2,5%/3,5% del neto ⚠ rótulo original perdido'
  assert.equal(aGlifosQueDibujan(z4), `Retención 2,5%/3,5% del neto ${ALERTA} rótulo original perdido`)
  assert.deepEqual(sinTraduccion(z4), [])
})

test('IDEMPOTENTE: correrlo dos veces da lo mismo que correrlo una', () => {
  const una = aGlifosQueDibujan(V5)
  assert.equal(aGlifosQueDibujan(una), una)
  assert.equal(necesitaTraduccion(una), false, 'ya traducida, no hay nada que escribir')
  assert.equal(necesitaTraduccion(V5), true)
})

test('un emoji que nadie mapeó NO se inventa un reemplazo: se nombra', () => {
  // La forma de que el reparador no afirme haber arreglado una celda que sigue rota.
  assert.deepEqual(sinTraduccion('🟡 En revisión'), ['🟡'])
  assert.equal(necesitaTraduccion('🟡 En revisión'), false, 'sin traducción, no hay nada que escribir')
})

test('el selector de variación se saca: es invisible y rompe una igualdad exacta', () => {
  assert.equal(aGlifosQueDibujan('✅️ Cobrado'), '✓ Cobrado')
})

test('ningún valor del mapa es una clave del mapa — la condición de la idempotencia', () => {
  const claves = new Set(Object.keys(SEMAFORO))
  for (const v of Object.values(SEMAFORO)) assert.equal(claves.has(v), false, `${v} se volvería a traducir`)
})
