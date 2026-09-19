// QUE LA SEMANA ACTUAL ESTÉ A LA VISTA AL ABRIR — sin que haga falta ningún botón.
//
// El defecto del dueño: *"roto cash flow semanal en boton ir a la semana actual"*. Medido con un
// navegador real: el destino era CORRECTO y el gesto no existía. `HYPERLINK` no es un botón.
//
// Las trampas que estos tests mantienen muertas:
//   · plegar TODAS las columnas cuando hoy cae fuera del ejercicio → la matriz entera tapada (ya pasó
//     con un grupo de FILAS heredado: el Mensual amaneció con las filas 8 a 13 invisibles);
//   · plegar la columna en curso junto con el pasado;
//   · un pliegue calculado con `new Date()` adentro, que no se puede probar hasta el lunes;
//   · cambiar el rótulo del atajo y dejar al control del pipeline gritando en cada corrida — eso ya
//     rompió una vez, y un aviso que suena siempre deja de significar algo;
//   · plegar ANTES de formatear, cuando la piel desoculta el footprint entero.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  columnasDelPasado, indiceDeHoy, indiceDeLetra, requestsDePliegue,
  expresionRotulo, esApunteDelAtajo, rangoEnLetras,
} from './cash-flow-hoy.mjs'
import { COL, FILA, ROTULO_HOY, letra, ventanas } from './cash-flow-matriz.mjs'
import { grillaSemanal, vinculoHoy as vinculoSemanal } from './cash-flow-semanas.mjs'
import { grillaMeses, vinculoHoy as vinculoMensual } from './cash-flow-meses.mjs'

const ANIO = 2026
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const SEMANAS = ventanas('semana', { anio: ANIO })
const MESES = ventanas('mes', { anio: ANIO })
/** El día que el dueño reportó el defecto. La semana en curso era la del lunes 10/08 → columna AH. */
const HOY = new Date(Date.UTC(2026, 7, 13))
const AQUI = path.dirname(fileURLToPath(import.meta.url))

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// QUÉ SE PLIEGA, Y QUÉ NO SE PLIEGA NUNCA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el pasado se pliega hasta la columna en curso, que queda a la vista', () => {
  const r = columnasDelPasado(SEMANAS, HOY)
  // 13/08/2026: la semana en curso es la 33ª del ejercicio (índice 32) → columna AH.
  assert.equal(indiceDeHoy(SEMANAS, HOY), 32)
  assert.deepEqual(r, { inicio: COL.tiempo0, fin: COL.tiempo0 + 32 })
  assert.equal(rangoEnLetras(r), 'B..AG')
  // LA PRIMERA COLUMNA QUE QUEDA A LA VISTA ES EXACTAMENTE LA DE HOY. Si el pliegue se pasara de una,
  // la pestaña abriría escondiendo justo lo que se vino a mostrar.
  assert.equal(letra(r.fin), 'AH')
  assert.equal(r.fin, COL.tiempo0 + indiceDeHoy(SEMANAS, HOY))
})

test('la fecha se INYECTA: el 20/08 el pliegue se corre solo una columna', () => {
  // Sin este test el pliegue se podría calcular con `new Date()` adentro y nadie lo notaría hasta el
  // lunes siguiente — con la pestaña abriendo en la semana equivocada, que es peor que no plegar.
  const otro = columnasDelPasado(SEMANAS, new Date(Date.UTC(2026, 7, 20)))
  assert.deepEqual(otro, { inicio: COL.tiempo0, fin: COL.tiempo0 + 33 })
  assert.equal(letra(otro.fin), 'AI', 'la semana del 17/08 pasa a ser la actual y la del 10/08 al pasado')
})

test('la semana en curso NO entra en el pliegue ni siquiera el lunes a las 00:00', () => {
  // La ventana es semi-abierta [lunes, lunes+7): con `<=` del lado derecho el lunes caería en las dos.
  const lunes = new Date(Date.UTC(2026, 7, 10))
  const r = columnasDelPasado(SEMANAS, lunes)
  assert.equal(letra(r.fin), 'AH', 'el lunes 10/08 arranca la semana AH: se ve, no se pliega')
})

test('NUNCA se pliega el cuadro entero: es el defecto que tapó la matriz del Mensual', () => {
  // Hoy DESPUÉS del ejercicio (la pestaña quedó vieja, o se mira un año cerrado). Plegar las 53
  // columnas dejaría una pestaña con la columna A y el TOTAL, y el generador escribiéndola igual.
  assert.equal(columnasDelPasado(SEMANAS, new Date(Date.UTC(2027, 5, 1))), null)
  // Y hoy ANTES del ejercicio: no hay pasado, no hay grupo. Un grupo de cero columnas devuelve 400.
  assert.equal(columnasDelPasado(SEMANAS, new Date(Date.UTC(2025, 5, 1))), null)
  assert.deepEqual(requestsDePliegue(7, null), [])
  assert.deepEqual(requestsDePliegue(7, { inicio: 1, fin: 1 }), [])
})

test('el Mensual pliega los meses YA CERRADOS, no el que corre', () => {
  const r = columnasDelPasado(MESES, HOY)
  // Enero a julio son siete meses cerrados → B..H; agosto (columna I) queda a la vista.
  assert.deepEqual(r, { inicio: COL.tiempo0, fin: COL.tiempo0 + 7 })
  assert.equal(rangoEnLetras(r), 'B..H')
  assert.equal(letra(r.fin), 'I')
})

test('el pliegue es UN grupo colapsado, no columnas ocultas a mano', () => {
  const req = requestsDePliegue(7, { inicio: 1, fin: 33 })
  assert.equal(req.length, 2)
  const range = { sheetId: 7, dimension: 'COLUMNS', startIndex: 1, endIndex: 33 }
  assert.deepEqual(req[0].addDimensionGroup.range, range)
  // `collapsed: true` es lo que hace que la pestaña ABRA plegada. Sin esto el grupo existe y no sirve.
  assert.equal(req[1].updateDimensionGroup.dimensionGroup.collapsed, true)
  assert.equal(req[1].updateDimensionGroup.fields, 'collapsed')
  assert.equal(req[1].updateDimensionGroup.dimensionGroup.depth, 1, 'los heredados ya se borraron: es el único')
})

test('las dos grillas PUBLICAN el pliegue en su meta: si no llega, no se pliega nada', () => {
  assert.deepEqual(grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS }).meta.plegar,
    { inicio: COL.tiempo0, fin: COL.tiempo0 + 32 })
  assert.deepEqual(grillaMeses({ anio: ANIO, refs: REFS, hoy: HOY }).meta.plegar,
    { inicio: COL.tiempo0, fin: COL.tiempo0 + 7 })
})

test('el generador pliega DESPUÉS de formatear: la piel desoculta el footprint entero', () => {
  // `desocultarFootprint` pone hiddenByUser:false en todo el footprint, y colapsar es ponerlo en true.
  // Plegar antes del formato dejaría el margen con el grupo colapsado y las columnas a la vista.
  const src = readFileSync(path.join(AQUI, '../scripts/cash-flow-vistas.mjs'), 'utf8')
  const piel = src.indexOf('...pielMatriz(')
  const pliegue = src.indexOf('await plegarElPasado(google, hoja.sheetId, meta)')
  assert.ok(piel > 0, 'el formato dejó de aplicarse')
  assert.ok(pliegue > 0, 'nadie llama al pliegue: la pestaña vuelve a abrir en enero')
  assert.ok(pliegue > piel, 'el pliegue tiene que ir DESPUÉS de la piel o el formato lo deshace')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL RÓTULO — QUE DIGA, NO QUE PROMETA. Y QUE EL CONTROL DEL PIPELINE LO SIGA ENCONTRANDO.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el rótulo se calcula en la hoja y no promete ningún clic', () => {
  const r = expresionRotulo(ROTULO_HOY.semana, 'ADDRESS(7;34;4)', 'TODAY()', 'd/mm')
  assert.ok(r.startsWith('"Semana actual: "&'), r)
  assert.ok(r.includes('TEXT(TODAY();"d/mm")'), 'la fecha del período, útil sin hacer clic')
  assert.ok(!/⏵|IR A/.test(r), 'ni ícono de botón ni imperativo: la celda informa')
  // La letra sale de recortar la fila del ADDRESS, no de un SUBSTITUTE: con "G7" el SUBSTITUTE del
  // "7" se comería la G y el rótulo diría "Semana actual: " a secas.
  assert.ok(r.includes(`LEN(ADDRESS(7;34;4))-${String(FILA.cabecera).length}`), r)
})

test('EL CONTROL DEL PIPELINE SIGUE PARTIENDO LA FÓRMULA — esto ya rompió una vez', () => {
  // `flujo-caja-rehacer-todo.mjs` lee el atajo así: busca `&range="&` y `;"<ROTULO_HOY>` y se queda con
  // lo del medio. Cuando el rótulo cambió el 13/08 y el control no, gritaba "destino inválido" en CADA
  // corrida y en las DOS pestañas. Acá se corre EL MISMO algoritmo sobre la fórmula real.
  for (const [f, rotulo] of [
    [vinculoSemanal(1234, grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS }).meta), ROTULO_HOY.semana],
    [vinculoMensual(99, grillaMeses({ anio: ANIO, refs: REFS, hoy: HOY }).meta), ROTULO_HOY.mes],
  ]) {
    const i = f.indexOf('&range="&')
    const j = f.lastIndexOf(`;"${rotulo}`)
    assert.ok(i > 0 && j > i, `el control no puede partir la fórmula: ${f}`)
    const expresion = f.slice(i + 9, j)
    assert.ok(expresion.startsWith('ADDRESS(') && expresion.endsWith(')'),
      `lo que el control pega en la celda de apunte tiene que ser la expresión del destino, y es "${expresion}"`)
    assert.ok(/#gid=\d+/.test(f) && f.includes('https://docs.google.com/spreadsheets/d/'))
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL RESIDUO DEL APUNTE — probarlo propio, o conservarlo
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('"AH7" en la columna A se prueba residuo del apunte; casi nada más lo hace', () => {
  const meta = grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS }).meta
  const geo = { filaCabecera: meta.cab.fila, col0: meta.cab.col0, colFin: meta.cab.colTotal }
  assert.equal(esApunteDelAtajo('AH7', geo), true, 'lo que quedó a la vista en Cash Flow Semanal!A107')
  assert.equal(esApunteDelAtajo('I7', { ...geo, colFin: 13 }), true, 'y en Cash Flow Mensual!A109')
  // Todo lo demás se CONSERVA. El lado para equivocarse es no borrar: seis pérdidas de trabajo del
  // dueño en este repo salieron de scripts que borraron "lo que parecía suyo".
  assert.equal(esApunteDelAtajo('AH8', geo), false, 'otra fila: no es la del encabezado')
  assert.equal(esApunteDelAtajo(`${letra(meta.cab.colTotal)}7`, geo), false, 'la columna TOTAL no es un período')
  assert.equal(esApunteDelAtajo('ZZ7', geo), false, 'una columna que este cuadro no tiene')
  assert.equal(esApunteDelAtajo('pagar AH7', geo), false, 'una anotación que menciona la celda')
  assert.equal(esApunteDelAtajo('', geo), false)
  assert.equal(esApunteDelAtajo(1234, geo), false)
})

test('la letra de columna y su índice son inversas exactas: si no, se prueba la columna equivocada', () => {
  for (const i of [0, 1, 25, 26, 33, 54, 701]) assert.equal(indiceDeLetra(letra(i)), i)
})
