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
  check('update: llamó updateSheetValues', calls[0][0] === 'update' && calls[0][1] === 'F1')
  check('update: ok con updated_range', u.ok === true && u.updated_range === 'RESUMEN!B4:B4')
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

  console.log(`\n${ok} ok, ${fail} fallas`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
