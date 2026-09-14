// EL CASH FLOW ARMA SUS FÓRMULAS CON EL ENCABEZADO DE ANTES Y CON EL DE DESPUÉS DE INSERTAR «OBRA».
//
// El defecto que se prueba no da error: una fórmula que suma `Compras!$AC` cuando el rubro pasó a la AD
// es válida, cuadra consigo misma y suma la columna de al lado. Por eso cada generador del grupo se
// arma con los dos layouts y se exige que TODA referencia a Compras o Cobranzas caiga en una columna
// del layout con el que se armó.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CUADRO, expresionReal, formulaCobranzas, bloqueControl, destinoDetalle, SUB_BIENES_DE_USO } from './cash-flow-lineas.mjs'
import { sumandosEnVentana } from './calendario-egresos.mjs'
import { formulaLineaSemana } from './cash-flow-horizonte.mjs'
import { CRITERIO, celdasDelAnio } from './estructura-filas.mjs'
import { RANGOS_ANTES, RANGOS_DESPUES } from './cash-flow-rangos-referencia.mjs'
import { COMPRAS, columnasDe } from './columnas-por-encabezado.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'
import { grilla as grillaCashFlow } from '../scripts/cash-flow-rehacer.mjs'
import { grilla as grillaRecurrentes } from '../scripts/recurrentes-pestana.mjs'

/**
 * Las columnas de Compras y Cobranzas que una fórmula cita, como letras — LAS DOS PUNTAS de un rango de
 * varias columnas (el QUERY de `cash-flow-tesoreria.mjs` lee `Cobranzas!$G$5:$P$400`).
 */
const citadas = (texto, pestana) => new Set([...String(texto).matchAll(new RegExp(`'?${pestana}'?!\\$([A-Z]{1,3})\\$\\d+(?::\\$([A-Z]{1,3}))?`, 'g'))]
  .flatMap((m) => [m[1], m[2]].filter(Boolean)))
const letrasDe = (rg, lado) => new Set(Object.values(rg[lado]).map((r) => /\$([A-Z]{1,3})\$/.exec(r)[1]))

const LAYOUTS = [['antes', RANGOS_ANTES], ['después', RANGOS_DESPUES]]
const lineas = CUADRO.flatMap((a) => a.grupos.flatMap((g) => g.lineas))

for (const [cuando, rg] of LAYOUTS) {
  test(`cash flow (${cuando}): toda línea cita sólo columnas resueltas con ESE encabezado`, () => {
    const compras = letrasDe(rg, 'compras')
    const cobranzas = letrasDe(rg, 'cobranzas')
    for (const l of lineas) {
      const f = expresionReal(rg, l, 'B$3', 'C$3')
      if (f === null) continue
      for (const c of citadas(f, 'Compras')) assert.ok(compras.has(c), `${l.nombre}: cita Compras!${c} fuera de ${[...compras]}`)
      for (const c of citadas(f, 'Cobranzas')) assert.ok(cobranzas.has(c), `${l.nombre}: cita Cobranzas!${c} fuera de ${[...cobranzas]}`)
    }
  })

  test(`cash flow (${cuando}): la grilla mensual y el semanal completos no citan una columna ajena`, () => {
    const compras = letrasDe(rg, 'compras')
    const cobranzas = letrasDe(rg, 'cobranzas')
    for (const periodo of ['mensual', 'semanal']) {
      const g = grillaCashFlow(rg, periodo, [], null, null, { Estructura: 10, Recurrentes: 10 }, { iva: 20, iibb: 21 }, new Date(Date.UTC(2026, 7, 4)))
      const todo = g.filas.flat().join('\n')
      assert.ok(citadas(todo, 'Compras').size >= 4, `${periodo}: el cuadro dejó de leer Compras — el test no probaría nada`)
      for (const c of citadas(todo, 'Compras')) assert.ok(compras.has(c), `${periodo}: Compras!${c}`)
      for (const c of citadas(todo, 'Cobranzas')) assert.ok(cobranzas.has(c), `${periodo}: Cobranzas!${c}`)
    }
  })
}

test('la inversión, los cobros y el endoso siguen a su columna cuando Compras y Cobranzas se corren', () => {
  const inv = lineas.find((l) => l.soloSub === SUB_BIENES_DE_USO)
  assert.ok(expresionReal(RANGOS_ANTES, inv, 'B$3', 'C$3').includes('Compras!$AF$4:$AF'))
  const despues = expresionReal(RANGOS_DESPUES, inv, 'B$3', 'C$3')
  assert.ok(despues.includes('Compras!$AG$4:$AG') && !despues.includes('$AF$'), despues)
  const cob = formulaCobranzas(RANGOS_DESPUES, 'civil', 'A1', 'B1', 'cobrado')
  assert.match(cob, /LOWER\(Cobranzas!\$P\$5:\$P\$400\)="cobrado"/, 'el estado pasó de la O a la P')
  assert.match(cob, /LEFT\(Cobranzas!\$BC\$5:\$BC\$400/, 'el endoso pasó de la BB a la BC')
  assert.deepEqual(destinoDetalle(RANGOS_DESPUES, inv, {}), { pestaña: 'Compras', rango: 'AG4:AG' })
  const civil = lineas.find((l) => l.cobranzas === 'civil')
  assert.deepEqual(destinoDetalle(RANGOS_DESPUES, civil, {}), { pestaña: 'Cobranzas', rango: 'N5:N400' })
})

test('el QUERY de concentración de cobranza cuenta sus ColN desde las columnas resueltas', () => {
  const fila = (rg) => grillaCashFlow(rg, 'mensual', [], null, null, { Estructura: 10, Recurrentes: 10 }, { iva: 20, iibb: 21 }, new Date(Date.UTC(2026, 7, 4)))
    .filas.find((f) => String(f[0]).startsWith('Cobranza pendiente de cobro'))[1]
  assert.ok(fila(RANGOS_ANTES).includes(`QUERY(Cobranzas!$G$5:$P$400;"select Col1,sum(Col7) where lower(Col9)<>'cobrado'`), fila(RANGOS_ANTES))
  assert.ok(fila(RANGOS_DESPUES).includes(`QUERY(Cobranzas!$G$5:$Q$400;"select Col1,sum(Col8) where lower(Col10)<>'cobrado'`), fila(RANGOS_DESPUES))
})

test('el control del pie y el calendario de CAJA, armados después de la inserción, suman el Total nuevo', () => {
  const ctrl = bloqueControl(RANGOS_DESPUES, 10, 20, 'B', 40)
  assert.equal(ctrl[0].formula, '=SUM(Compras!$P$4:$P)')
  const sale = sumandosEnVentana(RANGOS_DESPUES, -1, 'A1', 'B1', new Proxy({}, { get: () => () => '0' }))
  for (const s of sale) for (const c of citadas(s.expresion, 'Compras')) assert.ok(letrasDe(RANGOS_DESPUES, 'compras').has(c), `${s.nombre}: ${c}`)
  const est = lineas.find((l) => l.rubro === 'Estructura' && l.excluirSub)
  assert.ok(formulaLineaSemana(RANGOS_DESPUES, est, 'B$3', 'B$3+7', { Estructura: 10 }, 2026).includes('Compras!$AE$4:$AE'))
})

test('sin rangos no hay fórmula: ninguna función del cuadro cae en una letra por defecto', () => {
  const l = lineas.find((x) => x.rubro === 'Estructura')
  assert.throws(() => expresionReal(undefined, l, 'B$3', 'C$3'), /rangos de Compras/)
  assert.throws(() => formulaCobranzas({ compras: RANGOS_ANTES.compras }, 'civil', 'A1', 'B1'), /rangos de Cobranzas/)
  assert.throws(() => grillaCashFlow(undefined, 'mensual'), /rangos de Compras/)
  assert.throws(() => celdasDelAnio({ fila: 7, criterio: CRITERIO.subrubro, col: { mes0: 1, aux0: 17, nmeses: 14, prom: 15, filaCab: 5 }, letra: String }), /rangos de Compras/)
})

test('Estructura y Recurrentes (el constructor compartido) siguen al sub-rubro, la fecha y el Total', () => {
  const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
  const col = { mes0: 1, aux0: 17, nmeses: 14, prom: 15, filaCab: 5 }
  const aux = (rg, criterio) => celdasDelAnio({ rg, fila: 7, criterio, col, letra }).aux[0]
  assert.equal(aux(RANGOS_ANTES, CRITERIO.subrubro), '=SUMIFS(Compras!$O$4:$O;Compras!$AF$4:$AF;$A7;Compras!$AD$4:$AD;">="&B$5;Compras!$AD$4:$AD;"<"&EOMONTH(B$5;0)+1)')
  assert.equal(aux(RANGOS_DESPUES, CRITERIO.subrubro), '=SUMIFS(Compras!$P$4:$P;Compras!$AG$4:$AG;$A7;Compras!$AE$4:$AE;">="&B$5;Compras!$AE$4:$AE;"<"&EOMONTH(B$5;0)+1)')
  assert.ok(aux(RANGOS_DESPUES, CRITERIO.proveedor).includes('Compras!$AD$4:$AD;"Servicios recurrentes";Compras!$E$4:$E;$A7'))

  const antes = grillaRecurrentes(['Movistar'], columnasDe(COMPRAS_2508, COMPRAS, 'Compras')).filas.flat().join('\n')
  const despues = grillaRecurrentes(['Movistar'], columnasDe(COMPRAS_CON_OBRA, COMPRAS, 'Compras')).filas.flat().join('\n')
  // La C es la fecha de FACTURA del bloque de ARCA: está a la izquierda de la inserción y no se mueve.
  assert.deepEqual([...citadas(antes, 'Compras')].sort(), ['AC', 'AD', 'C', 'E', 'O'])
  assert.deepEqual([...citadas(despues, 'Compras')].sort(), ['AD', 'AE', 'C', 'E', 'P'])
})
