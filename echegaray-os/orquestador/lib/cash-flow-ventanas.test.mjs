// EL MEDIDOR DE VENTANAS — que no pueda decir que sí cuando la fórmula mezcla.
//
// El control que sostiene la regla del titular vive acá, así que tiene que probarse solo: si
// `ventanasDe` devolviera siempre una lista de uno, los tests de las dos vistas pasarían con
// cualquier tarjeta y nadie se enteraría. Un control que no puede decir que no es una constante.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ventanasDe, VENTANA_DEL_CONCEPTO } from './cash-flow-ventanas.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'

/** El mapa de filas del Mensual real, para no describir uno inventado. */
const FILA = grillaMeses({ anio: 2026, refs: {} }).meta.fila

test('ve las dos ventanas cuando la fórmula las mezcla, y una sola cuando no', () => {
  const T = (clave) => `$N$${FILA[clave]}`
  assert.deepEqual(ventanasDe(`=N(${T('ingresoReal')})-N(${T('egresoReal')})`, FILA), ['ya pasó'])
  assert.deepEqual(ventanasDe(`=N(${T('ingresoProyectado')})-N(${T('egresoProyectado')})`, FILA), ['proyección'])
  // LA MEZCLA — el defecto que el dueño rechazó: `ENTRA EN EL AÑO` sumaba lo cobrado con lo por cobrar.
  assert.deepEqual(ventanasDe(`=N(${T('ingresoReal')})+N(${T('ingresoProyectado')})`, FILA), ['ya pasó', 'proyección'])
})

test('un stock no pertenece a ninguna ventana, y una fila vecina no se confunde con otra', () => {
  // El saldo es una foto en un instante: no es ni lo que pasó ni lo que viene, y por eso no está en el
  // mapa. Si estuviera, la tarjeta del cierre daría "mezcla" contra su propia glosa.
  assert.deepEqual(ventanasDe(`=N($M$${FILA.saldoFinal})`, FILA), [])
  assert.deepEqual(ventanasDe('=N(CAJA_TOTAL_DISPONIBLE)', FILA), [])
  assert.deepEqual(ventanasDe('', FILA), [])
  // EL BORDE QUE ROMPERÍA TODO EN SILENCIO: la fila 9 no puede emparejar con la 90 ni con la 19. Sin
  // el `\b`, cualquier cuadro con más de nueve filas daría mezclas fantasma y el control sería ruido.
  const solaparia = { ingresoReal: 9, egresoProyectado: 90 }
  assert.deepEqual(ventanasDe('=N($N$90)', solaparia), ['proyección'])
  assert.deepEqual(ventanasDe('=N($N$9)', solaparia), ['ya pasó'])
  assert.deepEqual(ventanasDe('=N($N$19)', solaparia), [])
})

test('las cuatro filas del mapa son las que el cuadro llama reales y proyectadas, y ninguna más', () => {
  // Si mañana el tronco gana una fila de otra ventana y no entra acá, el medidor la ignora y el
  // titular puede mezclarla sin que nada se ponga rojo. El mapa es el contrato y se enumera.
  assert.deepEqual(Object.keys(VENTANA_DEL_CONCEPTO).sort(),
    ['egresoProyectado', 'egresoReal', 'ingresoProyectado', 'ingresoReal'])
  for (const clave of Object.keys(VENTANA_DEL_CONCEPTO)) {
    assert.ok(FILA[clave], `"${clave}" ya no es una fila del cuadro: el medidor está mirando un fantasma`)
  }
})
