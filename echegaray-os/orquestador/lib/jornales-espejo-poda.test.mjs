// LA PODA DEL ESPEJO, CONTRA EL DEFECTO MEDIDO EL 14/09/2026.
//
// El dueño insertó 2 filas arriba en «Obreros 26» y el bloque 01–15/09 pasó de la fila 558 a la 560:
// el UPSERT por posición dejó vivas las filas del 558 y la quincena quedó duplicada. Estos tests
// simulan la tabla en memoria —UPSERT por (pestaña, bloque, fila) + la poda— sobre dos lecturas.
//
// LAS MUTACIONES QUE LOS PONEN ROJOS: no podar (el bloque viejo sobrevive), podar sin exigir que la
// pestaña se haya leído con al menos un bloque (la lectura vacía borra todo), podar sin tope (la
// lectura rota borra media pestaña), o no proteger los bloques descartados.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDePoda, TOPE_PODA } from './jornales-espejo-poda.mjs'

/** Un bloque de `n` personas que empieza en `fila`, con la forma que devuelve `espejoDeGrid`. */
function bloque(pestana, fila, n, { desde = '2026-09-01', hasta = '2026-09-15' } = {}) {
  return {
    pestana, bloque_fila1: fila, desde, hasta,
    personas: Array.from({ length: n }, (_, i) => ({ fila1: fila + 1 + i })),
  }
}

let seq = 0
/** El UPSERT de `SQL_UPSERT`, en memoria: la clave es la posición. */
function upsert(tabla, bloques) {
  for (const b of bloques) {
    for (const p of b.personas) {
      const ya = tabla.find((t) => t.pestana === b.pestana && t.bloque_fila1 === b.bloque_fila1 && t.fila1 === p.fila1)
      if (!ya) {
        tabla.push({ id: `id-${++seq}`, pestana: b.pestana, bloque_fila1: b.bloque_fila1, fila1: p.fila1,
          quincena_desde: b.desde, quincena_hasta: b.hasta })
      }
    }
  }
}

/** Una corrida del script: plan sobre lo que hay, borrar lo que el plan diga, UPSERT. */
function corrida(tabla, bloques, { leidas, hallazgos = [], lecturaCompleta = true } = {}) {
  const lei = leidas ?? [...new Set(bloques.map((b) => b.pestana))].map((pestana) => ({
    pestana, bloques: bloques.filter((b) => b.pestana === pestana).length,
  }))
  const plan = planDePoda({ existentes: [...tabla], leidas: lei, bloques, hallazgos, lecturaCompleta })
  const ids = new Set(plan.borrar.map((f) => f.id))
  const quedan = tabla.filter((t) => !ids.has(t.id))
  upsert(quedan, bloques)
  return { tabla: quedan, plan }
}

/** La pestaña real tiene muchas quincenas: un bloque corrido es una fracción chica de ella. */
const historia = () => [
  bloque('Obreros 26', 400, 15, { desde: '2026-08-03', hasta: '2026-08-15' }),
  bloque('Obreros 26', 480, 15, { desde: '2026-08-17', hasta: '2026-08-31' }),
  bloque('Obreros 26', 520, 15, { desde: '2026-07-01', hasta: '2026-07-15' }),
]

test('el bloque corrido 2 filas no deja las filas viejas: la quincena queda una sola vez', () => {
  let tabla = []
  ;({ tabla } = corrida(tabla, [...historia(), bloque('Obreros 26', 558, 15)]))
  assert.equal(tabla.length, 60)

  // El dueño inserta 2 filas arriba: todo lo de abajo baja 2.
  const r = corrida(tabla, [...historia(), bloque('Obreros 26', 560, 15)])
  const dela0109 = r.tabla.filter((t) => t.quincena_desde === '2026-09-01')
  assert.equal(dela0109.length, 15, 'la quincena 01–15/09 tiene que quedar con 15 filas, no 30')
  assert.deepEqual([...new Set(dela0109.map((t) => t.bloque_fila1))], [560])
  assert.equal(r.plan.borrar.length, 15)
  assert.deepEqual(r.plan.porPestana[0].quincenas, ['2026-09-01..2026-09-15 f558'])
})

test('una segunda corrida idéntica no borra nada (idempotente)', () => {
  const bloques = [...historia(), bloque('Obreros 26', 558, 15)]
  let { tabla } = corrida([], bloques)
  const r = corrida(tabla, bloques)
  assert.equal(r.plan.borrar.length, 0)
  assert.equal(r.tabla.length, 60)
})

test('una lectura vacía NO borra: un control que no pudo mirar no dice «no está»', () => {
  const { tabla } = corrida([], [...historia(), bloque('Obreros 26', 558, 15)])
  // La pestaña se leyó (la API contestó) pero no trajo ningún bloque.
  const vacia = corrida(tabla, [], { leidas: [{ pestana: 'Obreros 26', bloques: 0 }] })
  assert.equal(vacia.plan.borrar.length, 0)
  assert.equal(vacia.tabla.length, 60)
  assert.equal(vacia.plan.porPestana[0].estado, 'sin_lectura')
  // Y una pestaña que no apareció en la lectura tampoco.
  const otra = corrida(tabla, [bloque('Oficina 26', 10, 2)])
  assert.equal(otra.tabla.filter((t) => t.pestana === 'Obreros 26').length, 60)
})

test('otra pestaña leída bien no autoriza a podar la que no se leyó', () => {
  const { tabla } = corrida([], [...historia(), bloque('Oficina 26', 20, 3)])
  const r = corrida(tabla, [bloque('Oficina 26', 22, 3)], {
    leidas: [{ pestana: 'Obreros 26', bloques: 0 }, { pestana: 'Oficina 26', bloques: 1 }],
  })
  assert.equal(r.tabla.filter((t) => t.pestana === 'Obreros 26').length, 45)
})

test('una corrida recortada por ventana no poda', () => {
  const { tabla } = corrida([], [...historia(), bloque('Obreros 26', 558, 15)])
  const r = corrida(tabla, [bloque('Obreros 26', 560, 15)], { lecturaCompleta: false })
  assert.equal(r.plan.borrar.length, 0)
  assert.equal(r.plan.porPestana[0].estado, 'lectura_recortada')
})

test(`el tope del ${TOPE_PODA * 100} % frena: no borra nada de esa pestaña y lo marca`, () => {
  const { tabla } = corrida([], [...historia(), bloque('Obreros 26', 558, 15)])
  // Una lectura que sólo reconoce 1 de 4 bloques: podaría 45 de 60 (75 %).
  const r = corrida(tabla, [bloque('Obreros 26', 558, 15)])
  assert.equal(r.plan.frenada, true)
  assert.equal(r.plan.borrar.length, 0)
  assert.equal(r.plan.porPestana[0].estado, 'tope')
  assert.equal(r.plan.porPestana[0].aBorrar, 45)
  assert.equal(r.tabla.length, 60)
})

test('el tope es por pestaña: justo en el 30 % borra, un poco más no', () => {
  const diez = (f) => bloque('Oficina 26', f, 10)
  const { tabla } = corrida([], [diez(10), diez(30), diez(50)])  // 30 filas
  // Sobran 9 de 30 = 30 %: borra.
  const ok = planDePoda({
    existentes: tabla, leidas: [{ pestana: 'Oficina 26', bloques: 3 }],
    bloques: [diez(10), diez(30), { ...diez(50), personas: diez(50).personas.slice(0, 1) }],
  })
  assert.equal(ok.borrar.length, 9)
  // Sobran 10 de 30: frena.
  const no = planDePoda({
    existentes: tabla, leidas: [{ pestana: 'Oficina 26', bloques: 2 }], bloques: [diez(10), diez(30)],
  })
  assert.equal(no.frenada, true)
  assert.equal(no.borrar.length, 0)
})

test('un bloque descartado por la lectura protege sus filas', () => {
  const { tabla } = corrida([], [...historia(), bloque('Obreros 26', 558, 15)])
  const r = corrida(tabla, historia(), {
    hallazgos: [{ tipo: 'bloque_descartado', pestana: 'Obreros 26', fila1: 558, detalle: 'fechas repetidas' }],
  })
  assert.equal(r.plan.borrar.length, 0)
  assert.equal(r.tabla.length, 60)
})

test('dos bloques legítimos de la misma quincena no se tocan si la planilla los tiene', () => {
  // «Oficina 26»: 02/02 en las filas 23 y 39. Si la lectura trae los dos, los dos quedan.
  const q = { desde: '2026-02-02', hasta: '2026-02-15' }
  const bl = [bloque('Oficina 26', 23, 2, q), bloque('Oficina 26', 39, 2, q)]
  const { tabla } = corrida([], bl)
  const r = corrida(tabla, bl)
  assert.equal(r.plan.borrar.length, 0)
  assert.equal(r.tabla.length, 4)
})
