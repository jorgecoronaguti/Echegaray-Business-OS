import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// EL ESPEJO Y SU TABLA TIENEN QUE SEGUIR HABLANDO DEL MISMO CONTRATO.
//
// Estos cuatro no prueban lógica: prueban que dos archivos que se escribieron juntos no se separen.
// Los cuatro modos de falla son silenciosos —ninguno tira error, todos publican mal— y por eso hacen
// falta acá y no en una revisión de código.

const script = readFileSync(new URL('../scripts/documentos-espejo.mjs', import.meta.url), 'utf8')
const migracion = readFileSync(
  new URL('../../supabase/migrations/20260826T2200_los_papeles_del_cliente_viven_en_el_os.sql', import.meta.url), 'utf8')

test('el ON CONFLICT del espejo apunta al índice único que la migración crea', () => {
  // Si divergen, el `on conflict` no infiere ningún índice y Postgres tira — o peor, infiere OTRO y
  // el espejo duplica los papeles del cliente en cada corrida sin que nada se queje.
  const clave = "(coalesce(obra_id, '_cliente'), drive_file_id)"
  const claveSinEspacio = "(coalesce(obra_id,'_cliente'), drive_file_id)"
  assert.ok(migracion.includes(`create unique index if not exists documento_cliente_ambito_drive_file_idx\n  on public.documento_cliente ${clave}`))
  assert.ok(script.includes(`on conflict ${claveSinEspacio} do update`))
})

test('una corrida del espejo NO vuelve a publicar lo que administración escondió', () => {
  // `visible_portal` es la decisión de una persona sobre ese papel. Que el generador la pise es el
  // mismo defecto que ya costó trabajo en este repo: lo editado a mano le gana al generador.
  const doUpdate = script.slice(script.indexOf('do update set'), script.indexOf('do update set') + 500)
  assert.ok(!doUpdate.includes('visible_portal'), 'el do update no puede tocar visible_portal')
})

test('el espejo NO borra: una corrida que falla no vacía los papeles del cliente', () => {
  // Un generador que borra y reescribe, el día que Drive no contesta, deja al cliente sin un papel.
  assert.ok(!/delete\s+from\s+documento_cliente/i.test(script))
  assert.ok(!/truncate/i.test(script))
})

test('el espejo NO escribe una sola celda en Google Sheets', () => {
  for (const prohibido of ['escribirRango', 'clearValues', 'batchUpdate', 'appendRow', 'spreadsheets']) {
    assert.ok(!script.includes(prohibido), `el espejo no puede llamar a ${prohibido}`)
  }
})

test('la clasificación no está duplicada: el espejo usa las reglas con test', () => {
  // Reimplementar el clasificador acá haría que la pantalla y el espejo publicaran cosas distintas
  // del mismo archivo, y sólo una de las dos copias tendría tests.
  assert.ok(script.includes("from '../../src/app/portal/papeles.ts'"))
  assert.ok(script.includes('veredicto') && script.includes('esCarpetaDelCliente') && script.includes('rutaEnBucket'))
})
