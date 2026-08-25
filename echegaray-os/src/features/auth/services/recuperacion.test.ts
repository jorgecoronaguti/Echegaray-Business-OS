// LO QUE SE PUEDE PROBAR DE LA RECUPERACIÓN SIN MANDAR UN CORREO.
//
// El envío del mail no se prueba acá y no se puede: dispararlo manda un correo real. Lo que sí se
// prueba es lo que rompe el flujo EN SILENCIO, que es donde estaban los dos defectos posibles:
//
//   · una URL de vuelta mal armada — el enlace del correo lleva a un 404 y la persona queda afuera
//     sin ningún error visible en ningún lado;
//   · un `next` que apunte a otro dominio — la URL del OS se convierte en un trampolín, y encima
//     con la sesión recién creada.
//
// Si alguien saca la validación del destino, el tercer bloque se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RUTA_CONTRASENA_NUEVA, destinoSeguro, urlDeRecuperacion,
} from './recuperacion.ts'

test('la URL del correo apunta al callback y trae el destino', () => {
  const url = urlDeRecuperacion('https://app.ecsas.com.ar')
  assert.equal(url, 'https://app.ecsas.com.ar/callback?next=%2Fcontrasena-nueva')
})

test('una barra final en la base NO produce una doble barra', () => {
  // `https://…//callback` no coincide con ninguna Redirect URL de Supabase: el enlace del correo
  // termina en el Site URL por defecto y la persona nunca llega a la pantalla de contraseña.
  assert.equal(
    urlDeRecuperacion('https://app.ecsas.com.ar/'),
    'https://app.ecsas.com.ar/callback?next=%2Fcontrasena-nueva',
  )
  assert.equal(
    urlDeRecuperacion('http://localhost:3000///'),
    'http://localhost:3000/callback?next=%2Fcontrasena-nueva',
  )
})

test('el destino después del canje NUNCA sale de este dominio', () => {
  for (const hostil of [
    '//evil.com',
    '//evil.com/robar',
    '/\\evil.com',
    'https://evil.com',
    'http://evil.com',
    'evil.com',
    '',
    null,
    undefined,
  ]) {
    assert.equal(
      destinoSeguro(hostil),
      RUTA_CONTRASENA_NUEVA,
      `«${hostil}» pasó como destino: la recuperación quedó convertida en un trampolín`,
    )
  }
})

test('una ruta interna legítima sí pasa', () => {
  assert.equal(destinoSeguro('/contrasena-nueva'), '/contrasena-nueva')
  assert.equal(destinoSeguro('/mi-cuenta/seguridad'), '/mi-cuenta/seguridad')
})

test('un destino hostil tampoco se cuela por la URL del correo', () => {
  // La URL del correo la arma el servidor, pero el helper es público: que valide en las dos puertas
  // es lo que impide que alguien lo llame con un destino de afuera y lo mande en un mail.
  assert.equal(
    urlDeRecuperacion('https://app.ecsas.com.ar', '//evil.com'),
    'https://app.ecsas.com.ar/callback?next=%2Fcontrasena-nueva',
  )
})
