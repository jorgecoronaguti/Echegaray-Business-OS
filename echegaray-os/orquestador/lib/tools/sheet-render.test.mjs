#!/usr/bin/env node
// Test de drive_render_tabla (sheet-render.mjs): el renderizador declarativo debe escribir
// TODO el bloque en UNA sola llamada a la API (valores+formato+merges+freeze). Hermético (mock
// del cliente Google), 0 API. Es la garantía de la mejora sistémica: no volver al poke-por-poke.
import { sheetRenderTools } from './sheet-render.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

async function main() {
  const calls = []
  const google = {
    async getSheetMeta() { return [{ sheetId: 42, title: 'RESUMEN' }] },
    async spreadsheetBatchUpdate(fid, reqs) { calls.push({ fid, reqs }); return { ok: true } },
  }
  const t = sheetRenderTools(google)['sheet.render']

  const out = await t.run({
    file_id: 'X', tab: 'RESUMEN', anclaje: 'A1', congelar_encabezado: true, filas: [
      [{ t: 'RESUMEN', estilo: 'titulo', combinar: 3 }],
      [{ t: 'Concepto', estilo: 'encabezado' }, { t: 'Ene', estilo: 'encabezado' }, { t: 'Feb', estilo: 'encabezado' }],
      [{ t: 'Ingresos', estilo: 'etiqueta' }, { n: 18150000, estilo: 'moneda' }, { n: 16277150, estilo: 'moneda' }],
      [{ t: 'Total', estilo: 'etiqueta' }, { f: '=SUM(B3:B3)', estilo: 'total' }, { f: '=SUM(C3:C3)', estilo: 'total' }],
    ],
  })

  check('devuelve ok', out.ok === true)
  // El CONTENIDO va en UNA sola llamada (no poke-por-poke). El freeze puede ir en una 2ª
  // llamada aparte (para que un freeze fallido no tire abajo la escritura) → ≤2 llamadas.
  // El CONTENIDO va en la 1ª llamada (no poke-por-poke). Merges y freeze pueden ir en llamadas
  // aparte best-effort (para que un fallo cosmético no tire la escritura) → ≤3 llamadas.
  check('contenido en UNA sola llamada (no poke-por-poke)', calls.length <= 3 && calls[0].reqs.filter((r) => r.updateCells).length >= 1)
  const reqs = calls[0].reqs
  check('un updateCells con todo el bloque', reqs.filter((r) => r.updateCells).length === 1)
  const rows = reqs.find((r) => r.updateCells).updateCells.rows
  check('texto → stringValue', rows[0].values[0].userEnteredValue.stringValue === 'RESUMEN')
  check('título en negrita (estilo aplicado)', rows[0].values[0].userEnteredFormat.textFormat.bold === true)
  check('número → numberValue con formato moneda', rows[2].values[1].userEnteredValue.numberValue === 18150000 && rows[2].values[1].userEnteredFormat.numberFormat.type === 'CURRENCY')
  check('total → FÓRMULA (no número pegado)', rows[3].values[1].userEnteredValue.formulaValue === '=SUM(B3:B3)')
  check('fórmula sin "=" se completa', (await (async () => { const c = []; const g = { async getSheetMeta() { return [{ sheetId: 1, title: 'T' }] }, async spreadsheetBatchUpdate(f, r) { c.push(r) } }; await sheetRenderTools(g)['sheet.render'].run({ file_id: 'x', tab: 'T', filas: [[{ f: 'A1+B1' }]] }); return c[0].find((r) => r.updateCells).updateCells.rows[0].values[0].userEnteredValue.formulaValue })()) === '=A1+B1')
  check('merge del título (combinar:3, en alguna llamada)', calls.some((c) => c.reqs.some((r) => r.mergeCells)))
  check('merge NO va en el batch de contenido (una tabla dinámica no tira la escritura)', !calls[0].reqs.some((r) => r.mergeCells))
  check('limpia merges previos (unmergeCells)', !!reqs.find((r) => r.unmergeCells))
  check('congela encabezado (en alguna llamada)', calls.some((c) => c.reqs.some((r) => r.updateSheetProperties)))
  check('freeze NO va en el batch de contenido (no puede tirar la escritura)', !calls[0].reqs.some((r) => r.updateSheetProperties))
  check('pestaña inexistente → error claro', (await sheetRenderTools(google)['sheet.render'].run({ file_id: 'x', tab: 'NOEXISTE', filas: [[{ t: 'a' }]] })).error != null)

  // limpiar_pestana debe ser NO DESTRUCTIVO: limpia SOLO las filas que reescribe (rango acotado
  // con startRowIndex/endRowIndex), NUNCA la pestaña entera a ciegas (range con solo sheetId).
  // Esto es lo que evita perder secciones si la tarea se corta a la mitad.
  {
    const c2 = []
    const g2 = { async getSheetMeta() { return [{ sheetId: 7, title: 'R' }] }, async spreadsheetBatchUpdate(f, r) { c2.push(r) } }
    await sheetRenderTools(g2)['sheet.render'].run({ file_id: 'x', tab: 'R', anclaje: 'A5', limpiar_pestana: true, filas: [[{ t: 'a' }], [{ t: 'b' }]] })
    const limpiezas = c2[0].filter((r) => r.updateCells && !r.updateCells.rows) // updateCells de limpieza (sin rows, solo range)
    const acotada = limpiezas.every((r) => r.updateCells.range.startRowIndex != null && r.updateCells.range.endRowIndex != null)
    check('limpiar_pestana limpia rango ACOTADO (no la pestaña entera)', limpiezas.length >= 1 && acotada)
    const anchoTotal = c2[0].some((r) => r.updateCells && !r.updateCells.rows && r.updateCells.range.startRowIndex === 4 && r.updateCells.range.endRowIndex === 6)
    check('limpiar_pestana respeta el anclaje (fila 5 → índice 4, solo 2 filas)', anchoTotal)
  }

  console.log(`\nsheet-render.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}
main()
