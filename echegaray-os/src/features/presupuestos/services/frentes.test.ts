// EL REPARTO ENTRE FRENTES Y EL CONTROL DE QUE LA CANTIDAD SE CONSERVA.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// `convertir_partida_a_plan` compara `round(Σ frentes, 4)` contra `round(cantidad, 4)` y, si no
// coinciden, NO GENERA NADA. Si la pantalla repartiera en punto flotante, «2,16 en 3 frentes»
// daría tres partes que suman 2,1599999999999997 y el control verde de la pantalla diría que
// cierra. Con esa cantidad puntual la base también redondearía a 2,16 y pasaría; con otra, no —y
// el usuario vería un error de Postgres después de haber visto un tilde verde.
//
// El segundo defecto es el número que anuncia el botón. «Generar 10 actividades» tiene que ser
// exactamente `v_n_act`: los contenedores (rubro y frentes) son `tipo = 'resumen'` y no se cuentan.
// Prometer 12 y crear 10 hace que el mensaje de éxito sea el primer dato falso de la obra.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  repartirIgual, sumaDeFrentes, controlDeCierre, actividadesPrevistas, metodoEfectivo,
  hhDelFrente, arbolPrevisto, nombresPorDefecto,
} from './frentes.ts'

test('el reparto suma EXACTAMENTE la cantidad, también cuando no divide justo', () => {
  for (const [cant, n] of [[2.16, 2], [2.16, 3], [2.16, 5], [1, 3], [100, 7], [0.0003, 4]] as const) {
    const partes = repartirIgual(cant, n)!
    assert.equal(partes.length, n)
    assert.equal(sumaDeFrentes(partes.map((c, i) => ({ nombre: `F${i}`, cantidad: c }))), cant,
      `${cant} en ${n} frentes no cerró`)
  }
})

test('el reparto NO redondea cada parte por su cuenta: así es como se pierde la cantidad', () => {
  // La implementación ingenua —dividir y redondear cada parte a 4 decimales— pierde la cantidad:
  // 1 en 3 frentes da 0,3333 × 3 = 0,9999, y el control de la base rechaza la conversión entera.
  const ingenuo = Array.from({ length: 3 }, () => Math.round((1 / 3) * 10000) / 10000)
  assert.notEqual(ingenuo.reduce((a, b) => a + b, 0), 1)

  const partes = repartirIgual(1, 3)!
  const r = controlDeCierre(partes.map((c, i) => ({ nombre: `F${i}`, cantidad: c })), 1)
  assert.equal(r.cierra, true)
  assert.equal(r.falta, 0)
})

test('la suma se compara con el mismo redondeo de 4 decimales que aplica Postgres', () => {
  // `0,1 + 0,2` en punto flotante da 0,30000000000000004, y una comparación directa contra 0,3
  // deja al usuario con un control en rojo sobre un reparto que la base va a aceptar.
  assert.notEqual(0.1 + 0.2, 0.3)
  assert.equal(sumaDeFrentes([{ nombre: 'A', cantidad: 0.1 }, { nombre: 'B', cantidad: 0.2 }]), 0.3)
  assert.equal(controlDeCierre([{ nombre: 'A', cantidad: 0.1 }, { nombre: 'B', cantidad: 0.2 }], 0.3).cierra, true)
})

test('el resto va a los PRIMEROS frentes y el resultado es el mismo cada vez que se corre', () => {
  assert.deepEqual(repartirIgual(1, 3), [0.3334, 0.3333, 0.3333])
  assert.deepEqual(repartirIgual(1, 3), repartirIgual(1, 3))
})

test('si los frentes no suman la partida, el control NO cierra y dice cuánto falta', () => {
  const r = controlDeCierre([{ nombre: 'A', cantidad: 1 }, { nombre: 'B', cantidad: 1 }], 2.16)
  assert.equal(r.cierra, false)
  assert.equal(r.falta, 0.16)
  assert.match(r.motivo!, /no se conserva/)
})

test('una partida SIN cómputo no se convierte, aunque la base la dejaría pasar', () => {
  const r = controlDeCierre([{ nombre: 'A', cantidad: 5 }], null)
  assert.equal(r.cierra, false)
  assert.match(r.motivo!, /sin cómputo|no tiene cómputo/i)
})

test('un frente en cero no es un frente', () => {
  const r = controlDeCierre([{ nombre: 'A', cantidad: 2.16 }, { nombre: 'B', cantidad: 0 }], 2.16)
  assert.equal(r.cierra, false)
  assert.match(r.motivo!, /0 no es un frente/)
})

test('sin frentes no hay nada que generar', () => {
  assert.equal(controlDeCierre([], 2.16).cierra, false)
})

test('el botón promete exactamente las actividades que crea la base (v_n_act)', () => {
  // REGLA 1 · obra chica: un frente y sin pasos → UNA actividad, no una por contenedor.
  assert.equal(actividadesPrevistas(1, 0), 1)
  // Varios frentes sin plantilla: una actividad por frente. Los frentes son contenedores y no cuentan.
  assert.equal(actividadesPrevistas(3, 0), 3)
  // Con plantilla: frentes × pasos. 2 frentes × 5 pasos = las 10 del contrato visual.
  assert.equal(actividadesPrevistas(2, 5), 10)
  assert.equal(actividadesPrevistas(0, 5), 0)
})

test('«Sin pasos» no puede quedar en método pasos: no habría pasos por los que avanzar', () => {
  assert.equal(metodoEfectivo('pasos', null, false), 'cantidad')
  assert.equal(metodoEfectivo('pasos', null, true), 'pasos')
  assert.equal(metodoEfectivo('manual', null, false), 'manual')
})

test('sin método elegido manda el de la partida, y si tampoco lo hay, la plantilla decide', () => {
  assert.equal(metodoEfectivo(null, 'manual', true), 'manual')
  assert.equal(metodoEfectivo(null, null, true), 'pasos')
  assert.equal(metodoEfectivo(null, null, false), 'cantidad')
})

test('sin rendimiento las HH del frente son NULL, nunca 0', () => {
  assert.equal(hhDelFrente(1.08, null), null)
  assert.equal(hhDelFrente(1.08, 34), 36.72)
})

test('un frente y sin pasos: el árbol NO dibuja un contenedor de frente', () => {
  const a = arbolPrevisto({ obra: 'Escuela', rubro: 'Fundaciones', descripcion: 'Columna H17',
    frentes: [{ nombre: 'Frente único', cantidad: 2.16 }], pasos: [] })
  assert.deepEqual(a.map((n) => n.texto), ['Escuela', 'Fundaciones', 'Columna H17'])
  assert.equal(a.filter((n) => n.tipo === 'tarea').length, actividadesPrevistas(1, 0))
})

test('con plantilla el árbol dibuja frente → pasos, y las tareas son las que promete el botón', () => {
  const a = arbolPrevisto({ obra: 'Escuela', rubro: null, descripcion: 'Columna H17',
    frentes: [{ nombre: 'Eje 1-4', cantidad: 1.08 }, { nombre: 'Eje 5-8', cantidad: 1.08 }],
    pasos: [{ nombre: 'Replanteo' }, { nombre: 'Armadura' }] })
  assert.equal(a[1].texto, 'Sin rubro')
  assert.equal(a.filter((n) => n.tipo === 'tarea').length, actividadesPrevistas(2, 2))
})

test('con un solo frente el nombre por defecto es «Frente único»', () => {
  assert.deepEqual(nombresPorDefecto(1), ['Frente único'])
  assert.deepEqual(nombresPorDefecto(3), ['Frente 1', 'Frente 2', 'Frente 3'])
})
