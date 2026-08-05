// LO QUE EL DUEÑO BORRA A MANO NO PUEDE VOLVER EN LA CORRIDA SIGUIENTE.
//
// Estas pruebas atacan defectos de PRESENTACIÓN que sí estaban en la pestaña viva el 04/08/2026 y que
// se ven en el PDF de las dos pestañas: prosa derramada sobre las columnas de período, y el prefijo
// "ℹ" duplicado en los dos grupos de control.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, meses } from './cash-flow-rehacer.mjs'
import { semanasRodantes } from '../lib/cash-flow-horizonte.mjs'
import { columnasMeta, indiceMeta, anchoConMeta } from '../lib/cash-flow-columnas.mjs'

/** Un martes cualquiera, fijo: un horizonte rodante probado contra `new Date()` es un test que
 *  cambia de premisa todos los días y no se puede leer cuando falla. */
const HOY = new Date(Date.UTC(2026, 7, 4))

const arma = (periodo) => grilla(periodo, [], null, null,
  // Las tablas de proyección y el calendario fiscal se ubican por rótulo contra el Sheet; para una
  // prueba de FORMA alcanza con una fila cualquiera: no se evalúa ninguna fórmula.
  { Estructura: 10, Recurrentes: 10, 'Materiales y Proveedores': 10 },
  { iva: 20, iibb: 21 }, HOY)

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
    assert.deepEqual(g.fechas, periodo === 'semanal' ? semanasRodantes(HOY) : meses())
  })

  test(`${periodo}: el cierre existe y es la última fila del estado`, () => {
    const { meta } = arma(periodo)
    // Es el ancla del cuadro: sin ella no se puede contestar qué día la caja no alcanza.
    assert.ok(meta.cierre > meta.inicio)
    assert.ok(meta.inicio > meta.variacion)
    assert.ok(meta.variacion > Math.max(...meta.subtotales))
  })

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // EL CONTRATO DE COLUMNAS — los 42 defectos de pantalla, atacados donde nacen
  // ════════════════════════════════════════════════════════════════════════════════════════════════

  test(`${periodo}: el rectángulo mide exactamente lo que declara el contrato de columnas`, () => {
    const g = arma(periodo)
    const ancho = Math.max(...g.filas.map((f) => f.length))
    assert.equal(ancho, anchoConMeta(periodo, g.n),
      `el rectángulo mide ${ancho} y el contrato dice ${anchoConMeta(periodo, g.n)}`)
  })

  test(`${periodo}: cada columna de metadatos lleva SU título en SU índice`, () => {
    const g = arma(periodo)
    const cab = g.filas[g.meta.cabFila - 1]
    for (const c of columnasMeta(periodo)) {
      assert.equal(cab[indiceMeta(periodo, c.clave, g.n)], c.titulo,
        `el encabezado de "${c.clave}" no está en su índice: la banda de formato va a caer corrida`)
    }
  })

  test(`${periodo}: toda línea declara su naturaleza y de dónde sale — ninguna queda muda`, () => {
    const g = arma(periodo)
    const iNat = indiceMeta(periodo, 'naturaleza', g.n)
    const iDon = indiceMeta(periodo, 'donde', g.n)
    for (const d of g.meta.detalle) {
      assert.ok(String(g.filas[d.fila - 1][iNat] ?? '').length > 3, `fila ${d.fila}: sin naturaleza declarada`)
      const don = String(g.filas[d.fila - 1][iDon] ?? '')
      assert.ok(don.length > 3, `fila ${d.fila}: sin origen declarado`)
      // El defecto REAL que estaba en el Sheet vivo: `Compras, rubro "undefined"`. Un rótulo con la
      // palabra "undefined" es código que se filtró a la pantalla del dueño.
      assert.ok(!don.includes('undefined'), `fila ${d.fila}: "${don}"`)
    }
  })

  // ────────────────────────────────────────────────────────────────────────────────────────────────
  // LOS FANTASMAS DEL LAYOUT ANTERIOR
  //
  // Medido en el Sheet vivo el 05/08: B69, B76 y B83 —tres filas EN BLANCO que separan un bloque de
  // otro— tenían renglones del viejo bloque "DÓNDE ESTÁ EL DETALLE" ("Compras, rubro …", uno de ellos
  // con `rubro "undefined"`), y B36/B41 las notas de actividad que el dueño había borrado a mano. La
  // fusión que preserva sus ediciones no puede distinguir "él anotó acá" de "acá quedó lo que yo mismo
  // escribí en un layout anterior": el generador tiene que DECIR cuáles filas son suyas.

  test(`${periodo}: las filas en blanco están declaradas y están realmente en blanco`, () => {
    const g = arma(periodo)
    assert.ok(g.meta.vacias.length >= 5, 'ninguna fila separadora declarada: los fantasmas vuelven')
    for (const f of g.meta.vacias) {
      const fila = g.filas[f - 1] ?? []
      assert.deepEqual(fila.filter((c) => c !== '' && c != null), [],
        `la fila ${f} se declara vacía y tiene contenido`)
    }
  })

  test(`${periodo}: las filas de título no tienen nada a la derecha de la A`, () => {
    const g = arma(periodo)
    assert.ok(g.meta.soloColumnaA.length >= 6, 'faltan títulos declarados')
    for (const f of g.meta.soloColumnaA) {
      const fila = g.filas[f - 1] ?? []
      assert.ok(String(fila[0] ?? '').length > 0, `la fila ${f} se declara título y está vacía`)
      assert.deepEqual(fila.slice(1).filter((c) => c !== '' && c != null), [],
        `la fila ${f} es un título y tiene contenido a la derecha: no puede desbordar`)
    }
    const cruce = g.meta.soloColumnaA.filter((f) => g.meta.vacias.includes(f))
    assert.deepEqual(cruce, [], `filas declaradas separador Y título: ${cruce}`)
  })

  test(`${periodo}: el bloque "dónde está el detalle" ya no existe como tabla al pie`, () => {
    // Eran 23 filas que repetían el nombre de cada línea para decir de dónde salía, con la prosa en la
    // columna B de 96 px: de ahí salían 6 de los 8 "texto_cortado". La información no se perdió — es
    // ahora una columna, al lado del número.
    const g = arma(periodo)
    assert.ok(!g.filas.some((f) => String(f?.[0] ?? '').startsWith('DÓNDE ESTÁ EL DETALLE')))
  })
}
