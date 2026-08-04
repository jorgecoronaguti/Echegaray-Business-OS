// LO QUE EL DUEÑO BORRA A MANO NO PUEDE VOLVER EN LA CORRIDA SIGUIENTE.
//
// Estas pruebas atacan defectos de PRESENTACIÓN que sí estaban en la pestaña viva el 04/08/2026 y que
// se ven en el PDF de las dos pestañas: prosa derramada sobre las columnas de período, y el prefijo
// "ℹ" duplicado en los dos grupos de control.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, semanas, meses } from './cash-flow-rehacer.mjs'

const arma = (periodo) => grilla(periodo, [], null, null,
  // Las tablas de proyección y el calendario fiscal se ubican por rótulo contra el Sheet; para una
  // prueba de FORMA alcanza con una fila cualquiera: no se evalúa ninguna fórmula.
  { Estructura: 10, Recurrentes: 10, 'Materiales y Proveedores': 10 },
  { iva: 20, iibb: 21 })

for (const periodo of ['semanal', 'mensual']) {
  test(`${periodo}: ninguna fila del cuadro escribe prosa al lado de los números`, () => {
    const { filas, meta } = arma(periodo)
    // EL DEFECTO: `push([act.actividad, act.nota])` metía un párrafo de 200+ caracteres en la columna B
    // de la fila de cada actividad. Como esa fila no tiene nada a su derecha, Sheets lo derrama sobre
    // las primeras doce columnas de período — el cuadro abría con un muro de itálica encima de los
    // meses cerrados. El dueño lo prohibió explícitamente: "prohibida la columna de prosa por fila".
    for (const f of meta.actividades) {
      const fila = filas[f - 1]
      assert.equal(fila.length, 1, `la actividad "${fila[0]}" escribe ${fila.length} celdas: la 2ª es prosa`)
    }
  })

  test(`${periodo}: el subtítulo entra en una línea`, () => {
    const { filas } = arma(periodo)
    const sub = String(filas[1][1] ?? '')
    assert.ok(sub.length > 0, 'la fila 2 tiene que decir qué es el cuadro')
    assert.ok(sub.length <= 110, `el subtítulo mide ${sub.length} caracteres: se derrama sobre los períodos`)
  })

  test(`${periodo}: el marcador de "no suma" aparece una sola vez`, () => {
    const { filas } = arma(periodo)
    // EL DEFECTO: el rótulo del grupo memo ya empieza con "ℹ" en CUADRO, y el generador le agregaba
    // otro. Salía "ℹ ℹ La misma nómina…", que en pantalla se lee como una barra doble.
    for (const fila of filas) {
      const a = String(fila?.[0] ?? '')
      assert.ok(!a.includes('ℹ ℹ'), `prefijo duplicado en "${a}"`)
      assert.ok(!/^ℹ.*ℹ/.test(a), `dos marcadores en "${a}"`)
    }
    // Y los grupos de control siguen marcados: la corrección no puede haberlo borrado.
    assert.ok(filas.some((f) => String(f?.[0] ?? '').startsWith('ℹ')), 'los grupos memo perdieron su marca')
  })

  test(`${periodo}: la grilla viaja con sus fechas, para que la piel no las recalcule`, () => {
    const g = arma(periodo)
    assert.equal(g.periodo, periodo)
    assert.equal(g.fechas.length, g.n)
    assert.deepEqual(g.fechas, periodo === 'semanal' ? semanas() : meses())
  })

  test(`${periodo}: el cierre existe y es la última fila del estado`, () => {
    const { meta } = arma(periodo)
    // Es el ancla del cuadro: sin ella no se puede contestar qué día la caja no alcanza.
    assert.ok(meta.cierre > meta.inicio)
    assert.ok(meta.inicio > meta.variacion)
    assert.ok(meta.variacion > Math.max(...meta.subtotales))
  })
}
