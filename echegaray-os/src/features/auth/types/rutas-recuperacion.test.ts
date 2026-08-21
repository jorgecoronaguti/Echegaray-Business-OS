// LAS TRES PUERTAS DE LA RECUPERACIÓN DE CONTRASEÑA, Y LA QUE SE PASABA POR ALTO.
//
// El flujo cruza el middleware TRES veces y cada cruce puede matarlo en silencio:
//
//   1. `/recuperar`         lo abre alguien SIN sesión — es el problema que vino a resolver.
//   2. `/callback`          llega SIN sesión: la sesión la crea el canje que hace esa misma ruta.
//   3. `/contrasena-nueva`  llega CON sesión… y ahí estaba la trampa. Es una ruta con sesión, así
//      que no va en la lista blanca de rutas públicas — pero entonces le aplica el RBAC de campo, y
//      el rol `campo` es exactamente el que más usa esta pantalla: el operario que abre el OS desde
//      el teléfono, olvida la contraseña y no tiene a quién pedírsela. Sin la entrada en
//      `CAMPO_RUTAS_PERMITIDAS`, el middleware lo rebota a `/hoy` DESPUÉS de canjear el enlace: el
//      enlace se consume, la contraseña sigue siendo la vieja y no hay ningún error en ninguna
//      pantalla. Nada de eso lo ve el typecheck: un 307 no es un error de tipos.
//
// Si alguien saca cualquiera de las tres entradas, uno de estos assert se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { esRutaCampoPermitida, esRutaPublica } from './index.ts'
import { RUTA_CALLBACK, RUTA_CONTRASENA_NUEVA, RUTA_RECUPERAR } from '../services/recuperacion.ts'

test('pedir el enlace y volver del correo se hacen SIN sesión', () => {
  assert.equal(esRutaPublica(RUTA_RECUPERAR), true,
    'pedir recuperar la contraseña exigía sesión: justo lo que no tiene quien la pide')
  assert.equal(esRutaPublica(RUTA_CALLBACK), true,
    'el canje del enlace exigía sesión: la sesión la crea ese mismo canje')
})

test('las tres rutas de la recuperación las abre el nivel campo CON sesión', () => {
  // Ser pública no exime del RBAC de campo: son dos reglas distintas del middleware y se aplican
  // las dos. El operario deja la sesión abierta en el teléfono —el OS no lo desloguea— así que
  // llega a `/callback` CON sesión: sin la entrada, el rebote a `/hoy` ocurre ANTES del canje, el
  // enlace se quema y la contraseña sigue siendo la vieja, sin un solo error a la vista.
  for (const r of [RUTA_RECUPERAR, RUTA_CALLBACK, RUTA_CONTRASENA_NUEVA]) {
    assert.equal(esRutaCampoPermitida(r), true,
      `${r}: el operario con sesión abierta queda rebotado a /hoy y nunca cambia la contraseña`)
  }
})

test('la contraseña nueva NO es pública: ahí ya hay sesión', () => {
  assert.equal(esRutaPublica(RUTA_CONTRASENA_NUEVA), false,
    'se abrió sin sesión una pantalla que sólo tiene sentido con la sesión del canje')
})

test('abrir la recuperación no abrió nada más', () => {
  for (const r of ['/recuperar-todo', '/callbackeo', '/contrasena', '/contrasena-nueva-de-otro']) {
    assert.equal(esRutaPublica(r), false, `${r} quedó pública sin que nadie lo decidiera`)
  }
})
