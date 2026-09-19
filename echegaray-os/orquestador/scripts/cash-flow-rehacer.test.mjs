// LO QUE EL DUEÑO BORRA A MANO NO PUEDE VOLVER EN LA CORRIDA SIGUIENTE.
//
// Estas pruebas atacan defectos de PRESENTACIÓN que sí estaban en la pestaña viva el 04/08/2026 y que
// se ven en el PDF de las dos pestañas: prosa derramada sobre las columnas de período, y el prefijo
// "ℹ" duplicado en los dos grupos de control.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, meses } from './cash-flow-rehacer.mjs'
import { semanasRodantes, SEMANAS_HORIZONTE } from '../lib/cash-flow-horizonte.mjs'

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

  test(`${periodo}: ningún rótulo de la columna A se corta en pantalla`, () => {
    // EL DEFECTO, medido por auditar-pantalla el 04/08: 4 texto_cortado en el Semanal y 7 en el
    // Mensual. La columna A mide 340px y a 9pt entran 66 caracteres; A10 tenía 73. Un rótulo
    // cortado no es un rótulo — y el que se cortaba era justamente el que dice que esa fila es
    // proyección. Se excluyen las celdas con fórmula: lo que se ve es su RESULTADO, no su texto.
    const { filas } = arma(periodo)
    for (const f of filas) {
      const a = String(f?.[0] ?? '')
      if (!a || a.startsWith('=')) continue
      assert.ok(a.length <= 66, `"${a}" mide ${a.length} caracteres: se corta`)
    }
  })

  test(`${periodo}: cada línea del cuadro declara su naturaleza al lado del total`, () => {
    // La regla absoluta de la skill de tesorería. Antes la única marca era la itálica de la
    // columna, que dice CUÁNDO y no QUÉ: un cobro esperado y un cheque ya firmado salían iguales.
    const { filas, meta, n } = arma(periodo)
    assert.equal(filas[meta.cabFila - 1][n + 2], 'Naturaleza del dato')
    for (const d of meta.detalle) {
      const glosa = filas[d.fila - 1][n + 2]
      assert.ok(glosa && glosa.length, `la línea "${d.linea.nombre}" no declara de dónde sale su número`)
    }
  })

  test(`${periodo}: el cuadro contesta la peor semana, la cobertura y la concentración`, () => {
    const { meta } = arma(periodo)
    const rotulos = meta.decision.filas.map((f) => f[0])
    assert.ok(rotulos.some((r) => /^Peor /.test(r)), 'la peor columna del horizonte')
    assert.ok(rotulos.some((r) => /explica/.test(r)), 'y qué la explica')
    assert.equal(rotulos.filter((r) => r.startsWith('Cobertura de obligaciones')).length, 3)
    assert.ok(rotulos.some((r) => /mayor cliente/.test(r)), 'concentración de cobranza')
    // La composición por naturaleza y su control de partición.
    assert.ok(meta.naturaleza.filas.some((f) => String(f[0]).startsWith('⇒ Control')))
    // Y el contraste contra lo que realmente ocurrió.
    assert.ok(meta.contraste, 'el contraste esperado/ocurrido tiene que estar en las dos pestañas')
  })

  test(`${periodo}: los bloques nuevos van DEBAJO del efectivo al cierre`, () => {
    // No es estética: hay consumidores que leen estas pestañas por posición de fila
    // (auditar-cobranzas-en-cashflow lee 'Cash Flow Mensual'!A3:N9 fijo). Correr el cuerpo hacia
    // abajo los rompería en silencio — devolviendo otro número, no un error.
    const { meta } = arma(periodo)
    assert.ok(meta.decision.titulo > meta.cierre)
    assert.ok(meta.naturaleza.titulo > meta.decision.titulo)
    assert.ok(meta.contraste.titulo > meta.naturaleza.titulo)
  })
}

test('el semanal mira 13 semanas rodantes; el mensual sigue mirando el año', () => {
  // EL DEFECTO: los dos cuadros contestaban "¿cuánto varía el efectivo en 2026?" y daban
  // $125.500.568 de diferencia con signo opuesto. El año tenía dos dueños; ahora tiene uno.
  assert.equal(arma('semanal').n, SEMANAS_HORIZONTE)
  assert.equal(arma('mensual').n, 12)
  assert.deepEqual(arma('semanal').fechas, semanasRodantes(HOY))
  assert.match(arma('semanal').filas[0][0], /las 13 semanas que vienen/)
})

test('ninguna línea contesta "de dónde salgo" con la palabra undefined', () => {
  // EL DEFECTO: las tres líneas que el OS calcula (descubierto, comisiones, impuesto al cheque) no
  // tienen rubro de Compras, y el bloque "DÓNDE ESTÁ EL DETALLE" les escribía literalmente
  // 'Compras, rubro "undefined"' — en el único lugar del cuadro que existe para contestar eso.
  for (const periodo of ['semanal', 'mensual']) {
    const { filas, filaRef } = arma(periodo)
    assert.ok(filaRef > 0, 'el bloque "dónde está el detalle" tiene que existir')
    for (let f = filaRef; f < filas.length; f++) {
      assert.ok(!String(filas[f]?.[1] ?? '').includes('undefined'), `${periodo}: fila ${f + 1} dice undefined`)
    }
  }
})

test('el semanal proyecta los egresos: un forecast que sólo proyecta cobros es optimista', () => {
  const { filas, meta } = arma('semanal')
  const mat = meta.detalle.find((d) => d.linea.rubro === 'Materiales Civil')
  for (let i = 1; i <= SEMANAS_HORIZONTE; i++) {
    const c = String(filas[mat.fila - 1][i])
    assert.ok(c.includes('MAX(0;'), `semana ${i}: sólo muestra lo ya cargado en Compras`)
  }
})
