#!/usr/bin/env node
// Test de las tools de ESCRITURA (drive-write.mjs) — hermético: sin red, sin DB,
// con un cliente Google falso. Verifica que cada tool llame al método correcto,
// valide su input, y que drive_delete (Nivel F) nunca ejecute. exit 0 = OK.
import { driveWriteTools } from './drive-write.mjs'

let ok = 0, fail = 0
function check(n, c) { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

async function main() {
  const calls = []
  const google = {
    async updateSheetValues(fileId, range, values) { calls.push(['update', fileId, range, values]); return { updatedRange: range, updatedCells: values.flat().length } },
    async appendSheetValues(fileId, range, values) { calls.push(['append', fileId, range, values]); return { updates: { updatedRange: range, updatedRows: values.length } } },
    async createFile(meta) { calls.push(['create', meta]); return { id: 'NEW1', name: meta.name, webViewLink: 'http://x' } },
  }
  const reg = driveWriteTools(google)

  // update
  const u = await reg['drive.update'].run({ file_id: 'F1', range: 'RESUMEN!B4:B4', values: [['100']] })
  // startCell() colapsa el rango a su celda inicial (RESUMEN!B4:B4 -> RESUMEN!B4) para que
  // Sheets dimensione la escritura según la matriz de values y no tire el 400 "tried writing
  // to column/row X" que hacía loopear al modelo. El update_range refleja esa celda de inicio.
  check('update: llamó updateSheetValues con celda inicial', calls[0][0] === 'update' && calls[0][1] === 'F1' && calls[0][2] === 'RESUMEN!B4')
  check('update: ok con updated_range', u.ok === true && u.updated_range === 'RESUMEN!B4')
  check('update: capability drive.write', reg['drive.update'].capability === 'drive.write')

  // update sin values -> error, no llama a google
  const bad = await reg['drive.update'].run({ file_id: 'F1', range: 'A1' })
  check('update: input inválido -> error', !!bad.error && calls.length === 1)

  // append (normaliza una columna simple a matriz)
  const a = await reg['drive.append'].run({ file_id: 'F2', range: 'Caja!A:F', values: [['2026-07-14', 'Proveedor', '-5000']] })
  check('append: llamó appendSheetValues', calls[1][0] === 'append')
  check('append: appended_rows', a.ok === true && a.appended_rows === 1)

  // create doc
  const c = await reg['drive.create'].run({ name: 'Acta', tipo: 'doc' })
  check('create: mimeType documento', calls[2][1].mimeType === 'application/vnd.google-apps.document')
  check('create: devolvió id/link', c.ok === true && c.id === 'NEW1')

  // create tipo inválido -> error
  const cbad = await reg['drive.create'].run({ name: 'X', tipo: 'zip' })
  check('create: tipo inválido -> error', !!cbad.error)

  // delete (Nivel F): capability drive.delete y run NUNCA escribe
  check('delete: capability drive.delete', reg['drive.delete'].capability === 'drive.delete')
  const d = await reg['drive.delete'].run({ file_id: 'F9' })
  check('delete: run no ejecuta (mensaje forbidden)', !!d.error && /prohibido|Nivel F/i.test(d.error))
  check('delete: no tocó google', calls.length === 3)

  // Bug 4 (auditoría 18/07): pestaña inexistente -> error ÚTIL con las pestañas reales,
  // en vez del 400 crudo que hacía loopear al modelo.
  const gTabFail = {
    async updateSheetValues() { throw new Error('google api 400: { "message": "Unable to parse range: Sheet1!A1" }') },
    async listTabs() { return ['Compras', 'Caja', 'Cómputo'] },
  }
  const rTab = driveWriteTools(gTabFail)
  const t = await rTab['drive.update'].run({ file_id: 'F1', range: 'Sheet1!A1', values: [['x']] })
  check('range-fail: devuelve error, no throw', !!t.error)
  check('range-fail: lista las pestañas reales', /Compras/.test(t.error) && /Cómputo/.test(t.error))

  // Bug 3 (auditoría 18/07): fórmula que queda en #VALUE! -> el aviso nombra la causa TEXTO
  // y guía a ISNUMBER (diagnóstico barato), no solo "revisá el separador".
  const gErr = {
    async updateSheetValues(_f, range, values) { return { updatedRange: range, updatedCells: values.flat().length } },
    async readSheetValues() { return [['#VALUE!']] },
  }
  const rErr = driveWriteTools(gErr)
  const e = await rErr['drive.update'].run({ file_id: 'F1', range: 'H10', values: [['=G62*1,02']] })
  check('celda-error: ok=false', e.ok === false)
  check('celda-error: aviso menciona TEXTO e ISNUMBER', /texto/i.test(e.advertencia) && /ISNUMBER/i.test(e.advertencia))

  // F4 (auditoría 18/07): editar un Excel .xlsx/.xlsm -> 400 opaco. Ahora mensaje accionable
  // (leer sí, editar requiere convertir a Sheet nativo), sin reintentar a ciegas.
  const gOffice = {
    async updateSheetValues() { throw new Error('google api 400: This operation is not supported for this document. The document must not be an Office file.') },
    async listTabs() { return [] },
  }
  const rOff = driveWriteTools(gOffice)
  const o = await rOff['drive.update'].run({ file_id: 'XLSX1', range: 'A1', values: [['x']] })
  check('office: devuelve error, no throw', !!o.error)
  check('office: guía a convertir a Sheet nativo', /excel/i.test(o.error) && /convert/i.test(o.error))
  check('office: NO ofrece pestañas (no es problema de pestaña)', !/pesta/i.test(o.error))

  console.log(`\n${ok} ok, ${fail} fallas`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
