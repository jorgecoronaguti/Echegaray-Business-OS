#!/usr/bin/env node
// EL REGISTRO DE TOOLS SE CONSTRUYE AUNQUE NO HAYA CUENTA DE GOOGLE. Hermético, 0 red.
//
// EL DEFECTO (31/08, encontrado por el auditor): `driveReadTools`/`driveWriteTools` armaban la
// capacidad AL CONSTRUIR el registro, y la capacidad lanza si no hay cliente. `os.mjs` documenta
// el contrato opuesto en su `googleClient()`: "Si nadie autorizó, devuelve null y las capacidades
// de Drive lo dicen en vez de fallar raro" — y `construirRegistro()` hace `...driveReadTools(google)`
// dentro de un objeto con las otras 73 capacidades.
//
// Medido con la misma línea de comandos y la base inalcanzable:
//     main:  node orquestador/os.mjs list  →  79 capacidad(es)
//     rama:  node orquestador/os.mjs list  →  Falló: la capacidad de Drive necesita un cliente Google
//
// Se caían las 79, no las 6 de Drive: jornales, caja, cobranzas, impuestos, obligaciones. Es
// decir: un OAuth de Google vencido dejaba a XSAS entero sin contestar por CLI, en el trabajo
// cuyo criterio es "si Claude desaparece, XSAS sigue".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { driveReadTools } from './drive.mjs'
import { driveWriteTools } from './drive-write.mjs'
import { CODIGO } from '../drive/errores.mjs'

test('con google=null el registro se construye igual, y con todas sus capacidades', () => {
  const lectura = driveReadTools(null)
  const escritura = driveWriteTools(null)
  assert.equal(Object.keys(lectura).length, 6, 'faltan tools de lectura en el registro')
  assert.ok(Object.keys(escritura).length >= 16, 'faltan tools de escritura en el registro')
  // Y cada una sigue teniendo su schema: es lo que `os.mjs list` enumera.
  for (const [slug, t] of Object.entries({ ...lectura, ...escritura })) {
    assert.ok(t.schema?.name, `${slug} quedó sin schema`)
    assert.ok(t.capability, `${slug} quedó sin capability`)
  }
})

test('el objeto expandido —que es como lo usa os.mjs— no explota', () => {
  // La forma exacta de `construirRegistro()`: si la factoría lanza, se lleva el registro entero.
  const registro = { ...driveReadTools(null), ...driveWriteTools(null), otra: { schema: { name: 'jornales' } } }
  assert.ok(registro.otra, 'las capacidades ajenas a Drive sobrevivieron')
  assert.ok(Object.keys(registro).length > 20)
})

test('la falta de cuenta aparece AL EJECUTAR, con un código accionable', async () => {
  const lectura = driveReadTools(null)
  const escritura = driveWriteTools(null)
  for (const [slug, tool] of [
    ['drive.list', lectura['drive.list']],
    ['drive.navigate', lectura['drive.navigate']],
    ['drive.create', escritura['drive.create']],
    ['drive.move', escritura['drive.move']],
  ]) {
    const r = await tool.run({ folder_id: 'X', file_id: 'X', name: 'x', tipo: 'doc', new_name: 'y', query: 'x' })
    assert.equal(r.codigo, CODIGO.PERMISSION_REQUIRED, `${slug} no dijo qué falta: ${JSON.stringify(r)}`)
    assert.match(r.error, /cuenta de Google/, slug)
  }
})

test('con cliente, la capacidad se arma UNA sola vez y se reusa', async () => {
  let getMetas = 0
  const google = {
    async getMeta(id) { getMetas++; return { id, name: 'n', mimeType: 'application/pdf', parents: [], trashed: false } },
  }
  const reg = driveReadTools(google)
  await reg['drive.navigate'].run({ file_id: 'A' })
  await reg['drive.navigate'].run({ file_id: 'B' })
  assert.equal(getMetas, 2, 'la capacidad perezosa no debe rehacer trabajo de más')
})
