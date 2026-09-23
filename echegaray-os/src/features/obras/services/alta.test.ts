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
import { debeFijarMonto, columnasDelPaso, montoAnterior } from './alta.ts'

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

// ═══ LA LECTURA QUE FALLA NO ES UN CONTRATO VACÍO (13/09/2026) ═══
//
// Regresión de `20260912T1600`: la acción leía el monto de la tabla con la sesión del usuario, la
// columna quedó cerrada, el «permission denied» se ignoraba y `antes` valía null. Si alguien vuelve
// a tratar el error como null, los dos primeros tests se ponen rojos.
test('un error al leer el monto de antes NO se convierte en «sin contrato»', () => {
  const r = montoAnterior({ data: null, error: { message: 'permission denied for table obra_canonica' } })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.error : '', /permission denied/)
})

test('los dos daños de la regresión: con el error como null se decidía al revés', () => {
  // Lo que la base tiene: un contrato de $7,5 M. Lo que el código creía: null.
  const real = montoAnterior({ data: '7500000', error: null })
  assert.ok(real.ok)
  const antes = real.ok ? real.antes : null
  // Vaciar el contrato ES una orden: con el monto leído bien, se llama.
  assert.equal(debeFijarMonto(true, antes, null), true)
  assert.equal(debeFijarMonto(true, null, null), false, 'con el null inventado la orden se tiraba')
  // Guardar sin tocar NO es un cambio: con el monto leído bien, no se llama.
  assert.equal(debeFijarMonto(true, antes, 7500000), false)
  assert.equal(debeFijarMonto(true, null, 7500000), true, 'con el null inventado se auditaba un cambio falso')
})

test('sin contrato cargado es null legítimo; una forma rara es error, no null', () => {
  assert.deepEqual(montoAnterior({ data: null, error: null }), { ok: true, antes: null })
  assert.deepEqual(montoAnterior({ data: 0, error: null }), { ok: true, antes: 0 })
  assert.equal(montoAnterior({ data: { monto_contratado: 1 }, error: null }).ok, false)
})

test('el paso «contrato» ya no devuelve columna para el update', () => {
  // Si alguien la reintrodujera, el UPDATE volvería a chocar contra el GRANT revocado de la 5000 —
  // o peor, entraría por una vía sin portero económico si el GRANT se aflojara.
  assert.deepEqual(columnasDelPaso('contrato', { monto_contratado: 7500000 }), {})
  assert.deepEqual(columnasDelPaso('drive', { drive_carpeta_id: 'abc' }), { drive_carpeta_id: 'abc' })
})

test('la banda tilda los pasos que ya tienen su dato, nunca «confirmar» ni los visitados sin dato', async () => {
  const { pasosHechos } = await import('./alta.ts')
  assert.deepEqual([...pasosHechos(null)], [])
  const base = {
    jefe_obra: null, fecha_inicio_plan: null, fecha_fin_plan: null, drive_carpeta_id: null,
    personasAsignadas: 0, actividades: 0,
  }
  assert.deepEqual([...pasosHechos(base)], ['informacion'])
  assert.deepEqual(
    [...pasosHechos({ ...base, jefe_obra: 'D. Olivera', fecha_inicio_plan: '2026-10-06', drive_carpeta_id: 'abc', personasAsignadas: 2, actividades: 3, monto_contratado: 100 })],
    ['informacion', 'responsable', 'fechas', 'contrato', 'drive', 'equipo', 'cronograma'],
  )
  // Sin ver el contrato (undefined) el paso no se tilda; un $0 tipeado SÍ es un dato.
  assert.equal(pasosHechos({ ...base, monto_contratado: undefined }).has('contrato'), false)
  assert.equal(pasosHechos({ ...base, monto_contratado: 0 }).has('contrato'), true)
})
