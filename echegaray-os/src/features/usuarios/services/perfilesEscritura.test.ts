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

// ═══ EL VÍNCULO CUENTA ↔ PERSONA: EL CANARIO DE «MI CUENTA» ═══
//
// `vincularPersona` es lo que le abre a alguien SU legajo, sus horas y sus documentos. Es el único
// camino que escribe `perfiles.persona_id`, y por eso las tres cosas que se vigilan acá no son de
// estilo: si alguna se afloja, la consecuencia es que una persona ve los papeles de otra.
//
// Comprobado contra la base real el 20/08 con `set local role authenticated` y rollback: un
// usuario común NO puede escribir esa columna («permission denied for table perfiles»), porque el
// `grant update` cubre sólo `nombre`, `telefono` y `avatar_url`. La cerradura es ésa; esto vigila
// que la puerta no se abra por otro lado.

const vincular = fuente.slice(fuente.indexOf('export async function vincularPersona'))
  .slice(0, fuente.slice(fuente.indexOf('export async function vincularPersona')).indexOf('\n}\n') + 3)

test('vincular una persona a una cuenta lo hace SÓLO Administración', () => {
  assert.notEqual(vincular, '', 'desapareció `vincularPersona`: sin ella «Mi cuenta» no se llena nunca')
  assert.match(vincular, /await soloAdministracion\(\)/,
    'quedó sin portero: cualquiera podría vincularse a sí mismo el legajo que quiera')
  assert.match(vincular, /if \(!puerta\.ok\) return \{ ok: false/,
    'llama al portero pero no corta cuando dice que no')
})

test('la persona que se vincula viene validada, no tal cual la mandó el formulario', () => {
  assert.match(vincular, /z\s*\n?\s*\.object\(\{ persona_id/,
    'el id de la persona entra sin validar: un valor cualquiera va derecho a la base')
})

test('que una persona ya esté tomada se dice en castellano, no con el nombre del índice', () => {
  assert.match(vincular, /'23505'/,
    'no se distingue la colisión del índice único: el usuario vería el nombre del índice de Postgres')
  assert.match(vincular, /ya está vinculada a otra cuenta/,
    'se perdió el mensaje que explica qué hacer cuando la persona ya tiene cuenta')
})
