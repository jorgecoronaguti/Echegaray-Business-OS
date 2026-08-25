import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iniciales } from './iniciales.ts'

// EL AVATAR DEL HEADER NO PUEDE DECIR CUALQUIER COSA.
//
// Reemplazó al texto `[email · rol]` que estaba escrito en la barra: ahora las dos letras del
// círculo son lo ÚNICO que identifica al usuario sin abrir el menú. Si dicen «J@» o quedan vacías,
// el header perdió información en vez de ganar aire, que era el motivo del cambio.

test('con nombre cargado usa las dos primeras palabras', () => {
  assert.equal(iniciales('Jorge Corona', 'jorge@ecsas.com.ar'), 'JC')
  // Tres palabras: las DOS PRIMERAS, no la primera y la última. Un segundo nombre no es el apellido.
  assert.equal(iniciales('Ana Laura Vera', null), 'AL')
  assert.equal(iniciales('Jorge', null), 'J')
})

// EL DEFECTO QUE OBLIGÓ A ESCRIBIR LA FUNCIÓN.
//
// El usuario de prueba de este repo es `jorge.o.corona+direccion-test-1783513222134@gmail.com`.
// Con `nombre.split(' ').map(p => p[0])` sobre el correo, eso es UNA sola palabra de 54 caracteres
// y el avatar mostraba «j» — o, partiendo por `@`, la basura del sufijo. Si se revierte el
// tratamiento de `. _ + -` y del descarte de dígitos, esta prueba se pone roja.
test('sin nombre cargado saca las iniciales del correo, no de su basura', () => {
  assert.equal(iniciales(null, 'jorge.o.corona+direccion-test-1783513222134@gmail.com'), 'JO')
  assert.equal(iniciales('', 'ana.vera@ecsas.com.ar'), 'AV')
  assert.equal(iniciales(null, 'administracion@ecsas.com.ar'), 'A')
})

test('el espacio de más no inventa una inicial vacía', () => {
  assert.equal(iniciales('   Ana   Laura  ', null), 'AL')
  // Los dígitos no son un apellido: «Obra 2026» es «O», no «O2».
  assert.equal(iniciales('Obra 2026', null), 'O')
})

test('sin nada legible devuelve `?`, nunca una cadena vacía', () => {
  // Un avatar vacío parece un error de carga; `?` dice «no sé quién sos» y se ve igual de prolijo.
  assert.equal(iniciales(null, null), '?')
  assert.equal(iniciales('', ''), '?')
  assert.equal(iniciales('...', '123@456.com'), '?')
})

test('las iniciales van en mayúscula', () => {
  assert.equal(iniciales('jorge corona', null), 'JC')
})
