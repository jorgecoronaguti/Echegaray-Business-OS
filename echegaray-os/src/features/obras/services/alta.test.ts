// CUÁNDO SE TOCA EL MONTO CONTRATADO — la regla que decide si se llama al RPC con portero económico.
//
// Desde la migración 5000 `obra_canonica.monto_contratado` no es escribible por PostgREST: entra por
// `fijar_monto_contratado()`, que exige `ve_economia()` y deja rastro en `entidad_cambio`. Eso
// convirtió una asignación de columna en una LLAMADA que puede fallar por permisos, y ahí apareció
// un defecto que no existía antes: **decidir mal cuándo llamarla rompe a quien no tiene la culpa**.
//
// Los tres casos de abajo son los tres que se rompieron escribiendo esto, en este orden:
//
//   · el campo AUSENTE (el jefe de obra no lo ve, así que no lo manda) se leía como vacío → NULL →
//     una orden de borrar el contrato → «el monto lo fija Dirección» al guardar el NOMBRE;
//   · el campo sin cambios disparaba el RPC en cada guardado y auditaba un cambio inexistente;
//   · `'7500000'` (numeric traído como string) contra `7500000` (number del formulario) se leía
//     como distinto y disparaba el RPC siempre.
//
// Si se revierte `debeFijarMonto` a un `antes !== ahora` cualquiera, los tres se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { debeFijarMonto, columnasDelPaso } from './alta.ts'

test('el campo ausente no es un campo vacío: no se toca el monto', () => {
  // `vinoElCampo = false` es el POST de quien no ve economía. Antes hay contrato cargado.
  assert.equal(debeFijarMonto(false, 7500000, null), false)
  assert.equal(debeFijarMonto(false, null, null), false)
  // …y ni siquiera si por alguna vía llegara un valor: sin el campo en el formulario no hay orden.
  assert.equal(debeFijarMonto(false, 1, 2), false)
})

test('el vacío TIPEADO sí borra el contrato', () => {
  // La clave viajó con '' → `vacioANull` la convirtió en null → es una orden explícita.
  assert.equal(debeFijarMonto(true, 7500000, null), true)
})

test('sin cambio no se llama: ni permiso ni fila de auditoría', () => {
  assert.equal(debeFijarMonto(true, 7500000, 7500000), false)
  assert.equal(debeFijarMonto(true, null, null), false)
  // El numeric de Postgres puede llegar como string. Comparar por identidad diría «cambió» siempre.
  assert.equal(debeFijarMonto(true, '7500000', 7500000), false)
  assert.equal(debeFijarMonto(true, '7500000.00', 7500000), false)
})

test('cargar por primera vez y cambiar el valor sí llaman', () => {
  assert.equal(debeFijarMonto(true, null, 7500000), true)
  assert.equal(debeFijarMonto(true, 7500000, 8000000), true)
  assert.equal(debeFijarMonto(true, '7500000', 8000000), true)
})

test('CERO NO ES NULL en ninguna dirección', () => {
  // La distinción que todo el módulo defiende: «sin cargar» ≠ «contrato de $0». Si la comparación
  // convirtiera antes de resolver el NULL, `Number(null) === 0` diría que no cambió nada.
  assert.equal(debeFijarMonto(true, null, 0), true)
  assert.equal(debeFijarMonto(true, 0, null), true)
  assert.equal(debeFijarMonto(true, 0, 0), false)
})

test('el paso «contrato» ya no devuelve columna para el update', () => {
  // Si alguien la reintrodujera, el UPDATE volvería a chocar contra el GRANT revocado de la 5000 —
  // o peor, entraría por una vía sin portero económico si el GRANT se aflojara.
  assert.deepEqual(columnasDelPaso('contrato', { monto_contratado: 7500000 }), {})
  assert.deepEqual(columnasDelPaso('drive', { drive_carpeta_id: 'abc' }), { drive_carpeta_id: 'abc' })
})
