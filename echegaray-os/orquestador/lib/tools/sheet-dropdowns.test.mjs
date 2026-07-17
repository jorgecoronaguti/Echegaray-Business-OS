#!/usr/bin/env node
// Test de drive_desplegables (sheet-dropdowns.mjs): debe extraer, por columna con validación
// de lista, sus opciones válidas y el encabezado. Hermético (mock del cliente Google), 0 API.
import { sheetDropdownTools } from './sheet-dropdowns.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// dataValidation ONE_OF_LIST helper
const dv = (...opts) => ({ dataValidation: { condition: { type: 'ONE_OF_LIST', values: opts.map((o) => ({ userEnteredValue: o })) } } })

async function main() {
  // Mock: startColumn 0; encabezado en fila 1 (E=Proveedor, I=Unidad); validación en filas de datos.
  const google = {
    async readSheetValidations() {
      return [{ data: [{ startColumn: 0, rowData: [
        { values: [] }, // fila 1 (encabezados) sin validación
        { values: [ {}, {}, {}, {}, dv('Hormiserv', 'Herrajes San Juan', 'Alvarado Mariel Edith'), {}, {}, {}, dv('Civil', 'Estructura', 'Mantenimiento') ] },
      ] }] }]
    },
    async readSheetValues() {
      // fila 1 = encabezados
      return [['ID', 'Cat', 'Fecha', 'FechaMes', 'Proveedor', 'Modalidad', 'Tipo', 'Uni', 'Unidad de Negocio']]
    },
  }
  const t = sheetDropdownTools(google)['sheet.desplegables']

  const out = await t.run({ file_id: 'X', tab: 'Compras' })
  check('con_desplegable true', out.con_desplegable === true)
  check('detecta 2 columnas con desplegable', out.columnas.length === 2)
  const colE = out.columnas.find((c) => c.columna === 'E')
  const colI = out.columnas.find((c) => c.columna === 'I')
  check('columna E = Proveedor', colE && colE.encabezado === 'Proveedor')
  check('E trae las opciones de proveedor', colE && colE.opciones.includes('Hormiserv') && colE.opciones.length === 3)
  check('columna I = Unidad de Negocio', colI && colI.encabezado === 'Unidad de Negocio')
  check('I trae Civil/Estructura/Mantenimiento', colI && colI.opciones.join(',') === 'Civil,Estructura,Mantenimiento')

  // Sin desplegables → con_desplegable false, sin error
  const g2 = { async readSheetValidations() { return [{ data: [{ startColumn: 0, rowData: [{ values: [{}, {}] }] }] }] }, async readSheetValues() { return [['a', 'b']] } }
  const out2 = await sheetDropdownTools(g2)['sheet.desplegables'].run({ file_id: 'X', tab: 'T' })
  check('sin desplegables → con_desplegable false', out2.con_desplegable === false && !out2.error)

  // Pestaña inexistente (sin data) → error claro
  const g3 = { async readSheetValidations() { return [{}] }, async readSheetValues() { return [] } }
  const out3 = await sheetDropdownTools(g3)['sheet.desplegables'].run({ file_id: 'X', tab: 'NOEXISTE' })
  check('pestaña inexistente → error', out3.error != null)

  // Falta input → error
  check('falta tab → error', (await t.run({ file_id: 'X' })).error != null)

  console.log(`\nsheet-dropdowns.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}
main()
