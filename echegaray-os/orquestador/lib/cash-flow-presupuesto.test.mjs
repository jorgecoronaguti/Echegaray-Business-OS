// LA PESTAÑA DE CARGA — acá lo que se puede perder es trabajo de una persona, no un cuadro que se
// recalcula solo. Todos estos tests protegen lo mismo: que una corrida del generador no pise ni borre
// lo que el dueño tipeó, y que un mes sin cargar no se confunda con un mes presupuestado en cero.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaPresupuesto, rescatarPresupuesto, mesDeCelda, FILA0, NOMBRES } from './cash-flow-presupuesto.mjs'

test('la corrida en frío deja las doce filas con las celdas de carga VACÍAS, no en cero', () => {
  const { filas, cargados } = grillaPresupuesto({ anio: 2026 })
  assert.equal(cargados, 0)
  const datos = filas.slice(FILA0 - 1)
  assert.equal(datos.length, 12)
  for (const f of datos) {
    assert.equal(f[1], '', 'un cero acá se leería como un presupuesto de cero')
    assert.equal(f[2], '')
  }
})

test('lo cargado se rescata y se vuelve a escribir: una corrida no puede pisarlo', () => {
  const previo = [
    ['Presupuesto mensual 2026'],
    ['subtítulo'],
    [],
    ['Mes', 'Ingresos presupuestados', 'Egresos presupuestados', 'Nota'],
    ['1/1/2026', 1000, 800, 'arranque'],
    ['1/2/2026', 2000, 1500, ''],
  ]
  const { filas, cargados } = grillaPresupuesto({ anio: 2026, cargado: rescatarPresupuesto(previo) })
  assert.equal(cargados, 2)
  assert.deepEqual(filas[FILA0 - 1].slice(1), [1000, 800, 'arranque'])
  assert.deepEqual(filas[FILA0].slice(1), [2000, 1500, ''])
})

test('el rescate encuentra el mes aunque el bloque se haya movido de fila', () => {
  const previo = [[], [], ['1/3/2026', 555, 111, ''], [], ['1/1/2026', 999, 222, '']]
  const { filas } = grillaPresupuesto({ anio: 2026, cargado: rescatarPresupuesto(previo) })
  assert.equal(filas[FILA0 - 1][1], 999, 'enero tiene que traer lo suyo aunque estuviera en otra fila')
  assert.equal(filas[FILA0 + 1][1], 555, 'marzo idem: se busca por fecha, nunca por posición')
})

test('el mes se reconoce como serial y como texto: de cómo se leyó no puede depender que se pierda', () => {
  assert.equal(mesDeCelda(46023), '2026-01') // serial del 1/1/2026
  assert.equal(mesDeCelda('1/1/2026'), '2026-01')
  assert.equal(mesDeCelda('01/12/2026'), '2026-12')
  assert.equal(mesDeCelda('Agosto 2026'), '2026-08')
  assert.equal(mesDeCelda(''), null)
  assert.equal(mesDeCelda('Mes'), null)
})

test('los tres nombres cubren doce filas y no son abiertos', () => {
  const { destinos } = grillaPresupuesto({ anio: 2026 })
  assert.deepEqual(destinos.map((d) => d.name), [NOMBRES.meses, NOMBRES.ingresos, NOMBRES.egresos])
  for (const d of destinos) {
    assert.equal(d.filas, 12)
    assert.equal(d.fila, FILA0)
    assert.ok(!d.abierto, 'un rango abierto dejaría entrar como un mes cualquier cosa escrita bajo diciembre')
  }
})
