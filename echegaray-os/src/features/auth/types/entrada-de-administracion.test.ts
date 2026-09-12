// `/administracion` NO PUEDE RESOLVERSE CON UN META REFRESH.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO ATRAPA (12/09/2026) ═══
//
// La ruta no dibuja nada: manda a `/clientes`. Eso estaba escrito como `redirect('/clientes')` dentro
// del Server Component, y ahí llegaba TARDE. `(main)/layout.tsx` es síncrono y cuelga el header de un
// `<Suspense>` a propósito, así que el documento ya salió por streaming cuando la página corre: Next
// no puede contestar un 307 con los encabezados afuera y se cae a su plan B, que es meter
// `<meta http-equiv="refresh" content="1;url=/clientes">` en el HTML.
//
// Medido en producción leyendo el documento real, y con `PERF_TRAZA=1` en un servidor propio: un
// hueco de 1.046 ms entre el último viaje del documento de `/administracion` y el primero de
// `/clientes`, más un documento entero de 20 kB con 13 chunks de JavaScript que no dibuja nada. Es el
// aterrizaje de ingreso de dirección, administración y jefe de obra: se paga en cada entrada.
//
// ═══ POR QUÉ SE LEE EL FUENTE DEL MIDDLEWARE ═══
//
// La garantía no es «existe una constante con el destino» —eso ya lo cubre el primer test— sino «la
// redirección se decide ANTES de que haya un byte de respuesta». El único lugar del repo donde eso es
// cierto es el middleware, y que esté cableado ahí no se puede comprobar llamando a una función pura.
// Si alguien vuelve a dejar la decisión sólo en el `page.tsx`, el meta refresh vuelve y nadie lo nota:
// la pantalla final es la misma, sólo tarda un segundo más. Por eso se mira el fuente.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AREA_HREF, ENTRADA_DE_ADMINISTRACION, entradaDeArea } from './areas.ts'

test('la entrada del área manda a Clientes, y sólo el path exacto', () => {
  assert.equal(entradaDeArea('/administracion'), ENTRADA_DE_ADMINISTRACION)
  assert.equal(ENTRADA_DE_ADMINISTRACION, '/clientes')
  // Las pantallas de verdad del área no se tocan: si `entradaDeArea` las atrapara, Compras y Personal
  // dejarían de existir y el middleware las mandaría a Clientes.
  for (const ruta of [
    '/administracion/compras', '/administracion/personas', '/administracion/proveedores',
    '/administracion/asistencia', '/administracion/usuarios', '/administracion/',
  ]) {
    assert.equal(entradaDeArea(ruta), null, `${ruta} no es la entrada del área`)
  }
  // La barra de navegación sigue apuntando a `/administracion`: el destino lo resuelve el middleware,
  // no el link. Si esto cambiara, habría dos opiniones sobre cuál es la entrada del área.
  assert.equal(AREA_HREF.administracion, '/administracion')
})

test('el middleware es el que redirige: la decisión NO vuelve a quedar sólo en el page.tsx', () => {
  const src = readFileSync(new URL('../../../middleware.ts', import.meta.url), 'utf8')
  assert.match(
    src, /entradaDeArea/,
    'el middleware dejó de usar `entradaDeArea`: /administracion volvió al meta refresh de 1 s',
  )
  // Y el redirect tiene que salir del middleware, no sólo importarse: un import sin
  // `NextResponse.redirect` al lado sería la constante leída y tirada.
  const bloque = src.slice(src.indexOf('const entrada = entradaDeArea('))
  assert.match(
    bloque.slice(0, 700), /NextResponse\.redirect\(url\)/,
    'el middleware calcula la entrada del área pero no redirige',
  )
})

test('el page.tsx se queda como red y lee la MISMA constante, no un literal propio', () => {
  const src = readFileSync(new URL('../../../app/(main)/administracion/page.tsx', import.meta.url), 'utf8')
  assert.match(src, /ENTRADA_DE_ADMINISTRACION/, 'la red de /administracion volvió a clavar el destino')
  // Dos literales `/clientes` en dos archivos son dos definiciones del mismo concepto, y el día que el
  // dueño mueva la entrada del área una de las dos se queda vieja sin avisar.
  assert.doesNotMatch(src, /redirect\('\/clientes'\)/, 'el destino quedó clavado en el page.tsx')
})
