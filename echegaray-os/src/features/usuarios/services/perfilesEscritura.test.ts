import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// EL CANARIO DE `perfiles`: NINGÚN `upsert` PARCIAL SOBRE UNA TABLA CON COLUMNAS NOT NULL.
//
// ═══ EL DEFECTO QUE VIGILA (19/08/2026) ═══
//
// `editarUsuario` guardaba el nombre con `upsert({ id, nombre })`. `upsert` es `insert … on
// conflict do update`, y Postgres valida los NOT NULL sobre la fila PROPUESTA antes de resolver el
// conflicto: la fila propuesta traía `rol` en `null` y saltaba
// `23502 null value in column "rol" … violates not-null constraint`, aunque el perfil existiera y
// el update fuera inocuo. Cambiar el nombre de cualquier cuenta estuvo roto desde siempre.
//
// Reproducido contra la base real el 19/08, con `rollback`: la forma vieja falla con 23502; el
// `update` deja `rol` intacto.
//
// Se prueba sobre el TEXTO y no ejecutando, a propósito: ejercitar esto de verdad necesita un
// Postgres con `auth.users` (hay FK), y el defecto es de FORMA. Un test que corre siempre y atrapa
// la forma vale más que uno perfecto que se saltea.

const fuente = readFileSync(
  fileURLToPath(new URL('./usuariosActions.ts', import.meta.url)), 'utf8')

/** Los `upsert` sobre `perfiles`, con su cuerpo entre llaves. */
function upsertsDePerfiles(texto: string): string[] {
  return [...texto.matchAll(/\.from\('perfiles'\)\s*\.upsert\(\s*(\{[^}]*\})/g)].map((m) => m[1])
}

test('todo upsert sobre `perfiles` incluye `rol`: la fila propuesta no puede quedar sin rol', () => {
  for (const cuerpo of upsertsDePerfiles(fuente)) {
    assert.match(cuerpo, /\brol\b/,
      `este upsert no manda \`rol\` y la base lo rechaza con 23502: ${cuerpo}`)
  }
})

test('editar los datos de una cuenta usa `update`, y comprueba que tocó una fila', () => {
  const cuerpo = fuente.slice(fuente.indexOf('export async function editarUsuario'))
    .slice(0, fuente.slice(fuente.indexOf('export async function editarUsuario')).indexOf('\n}\n') + 3)
  assert.match(cuerpo, /\.from\('perfiles'\)\.update\(/,
    'volvió a escribir el perfil con upsert: eso rompe con 23502')
  assert.match(cuerpo, /\.select\('id'\)/,
    'sin pedir las filas afectadas, un update sobre cero filas responde «guardado» sin guardar')
})

test('el error crudo de la base no viaja a la pantalla', () => {
  assert.match(fuente, /function enCastellano/,
    'se perdió la traducción del error técnico')
  const editar = fuente.slice(fuente.indexOf('export async function editarUsuario'))
  const primeraFalla = editar.slice(0, editar.indexOf('revalidatePath'))
  assert.doesNotMatch(primeraFalla, /error:\s*error\.message/,
    'el mensaje de Postgres vuelve a mostrarse tal cual al usuario')
})
