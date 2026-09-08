import test from 'node:test'
import assert from 'node:assert/strict'
import { aterrizajeDeIngreso, inicioDeRol } from './aterrizaje.ts'
import { destinoDeLaHome } from './navegacion.ts'
import { puedeVerRuta } from './areas.ts'
import { esRutaCampoPermitida } from './index.ts'

// EL ATERRIZAJE DEL INGRESO — la regla que estaba repartida entre una Server Action y nadie.
//
// ═══ LOS DOS DEFECTOS QUE ESTO ATRAPA ═══
//
// 1. `loginAction` hacía `redirect(rol === 'campo' ? '/hoy' : '/obras')`. Dirección y Administración
//    entraban por `/obras`, pero su inicio —el que abre el isotipo del header, vía `/` y
//    `destinoDeLaHome`— es `/administracion`. Volver a escribir ese ternario pone en rojo
//    «el inicio del ingreso es EL MISMO que el de la home».
//
// 2. El `?volver=` que el middleware guarda al rebotar a `/login` no lo leía nadie: medido contra el
//    servidor el 08/09/2026, `/login?volver=/mi-cuenta` aterrizaba en `/obras` con el jefe y en
//    `/hoy` con campo, y los tres pueden abrir `/mi-cuenta`. Devolver `inicio` sin mirar el `volver`
//    pone en rojo los tres casos de «se respeta».
//
// Y la mitad de seguridad: un `volver` es entrada de usuario. Los casos de trampolín
// (`//evil.com`, `/\evil.com`, `https://…`) están abajo y ninguno puede salir del sitio.

// ── 1 · EL INICIO DE CADA ROL ES EL DE LA HOME, NO OTRO

test('el inicio del ingreso es EL MISMO que el de la home — salvo la divergencia declarada', () => {
  // Éste es el test del defecto #1: Dirección y Administración entraban por `/obras` y su isotipo
  // los llevaba a `/administracion`. Volver a escribir `redirect(rol === 'campo' ? '/hoy' : '/obras')`
  // lo pone en rojo para los dos.
  for (const rol of ['direccion', 'administracion', 'campo'] as const) {
    assert.equal(inicioDeRol(rol), destinoDeLaHome(rol), `el rol ${rol} tiene dos inicios distintos`)
    assert.equal(aterrizajeDeIngreso(rol, null), destinoDeLaHome(rol))
  }
})

test('LA DIVERGENCIA DEL JEFE DE OBRA — declarada, no arreglada en silencio', () => {
  // Las dos funciones NO coinciden para `jefe_obra` y hace falta que se vea:
  //
  //   `destinoDeLaHome`   → /administracion   «su área es Administración, no Obras» (27/08/2026)
  //   `inicioDeRol`       → /obras            la instrucción de la unificación del login (08/09/2026)
  //
  // Cuál de las dos es el inicio del jefe de obra es una decisión de producto del dueño. Este test
  // no la toma: la FIJA para que el día que alguien la resuelva tenga que borrar esta línea, y no
  // pueda unificarlas por accidente creyendo que no había nada decidido del otro lado.
  assert.equal(destinoDeLaHome('jefe_obra'), '/administracion')
  assert.equal(inicioDeRol('jefe_obra'), '/obras')
  assert.notEqual(inicioDeRol('jefe_obra'), destinoDeLaHome('jefe_obra'))
})

test('el cliente no aterriza adentro del OS ni cuando entra por la puerta de adentro', () => {
  // No tiene contraseña, pero sí puede tener `auth.users` y `perfiles.rol = 'cliente'`. Antes caía
  // en `/obras` y el middleware lo rebotaba: un salto de más para llegar a lo mismo.
  assert.equal(inicioDeRol('cliente'), '/portal')
  assert.equal(aterrizajeDeIngreso('cliente', '/reportes'), '/portal')
})

test('cada rol aterriza donde el dueño lo pidió', () => {
  assert.equal(aterrizajeDeIngreso('campo', null), '/hoy')
  assert.equal(aterrizajeDeIngreso('jefe_obra', null), '/obras')
  // La pantalla que la navegación trata como inicio para estos dos: `solapasDeNav()[0]`, la solapa
  // que la barra pinta como activa al entrar. NO es `/obras`, que es donde caían hasta hoy.
  assert.equal(aterrizajeDeIngreso('administracion', null), '/administracion')
  assert.equal(aterrizajeDeIngreso('direccion', null), '/administracion')
})

test('un rol ausente o desconocido cae al nivel menos privilegiado, no al del dinero', () => {
  // El modo de fallar de un default permisivo acá es aterrizar a alguien en la pantalla equivocada
  // con la sesión ya abierta.
  assert.equal(aterrizajeDeIngreso(null, null), '/obras')
  assert.equal(aterrizajeDeIngreso(undefined, null), '/obras')
  assert.equal(aterrizajeDeIngreso(null, '/reportes'), '/obras')
})

// ── 2 · EL `volver` SE RESPETA SÓLO SI ESE ROL PUEDE VER ESA RUTA

test('se respeta el volver cuando el rol PUEDE ver esa ruta', () => {
  assert.equal(aterrizajeDeIngreso('direccion', '/reportes'), '/reportes')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/clientes/abc'), '/clientes/abc')
  assert.equal(aterrizajeDeIngreso('campo', '/mi-cuenta'), '/mi-cuenta')
  // La query sobrevive entera: `/obras?estado=activas` es la vista que se quiso abrir, no `/obras`.
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/obras?estado=activas'), '/obras?estado=activas')
})

test('NO se respeta el volver cuando el rol NO puede ver esa ruta: se aterriza en su inicio', () => {
  // Sin esto hay una CADENA — login → /reportes → middleware → /obras— que el router del cliente no
  // termina de recorrer: el redirect de una Server Action viaja por RSC y la barra se queda en la
  // ruta que no se puede abrir.
  assert.equal(puedeVerRuta('jefe_obra', '/reportes'), false)
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/reportes'), '/obras')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/administracion/usuarios'), '/obras')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/presupuestos'), '/obras')
})

test('el nivel campo tiene su propia lista y también manda acá', () => {
  // `/obras` no está en `CAMPO_RUTAS_PERMITIDAS`: el middleware lo rebotaría a `/hoy` igual, y el
  // rebote llega tarde —en la próxima navegación con documento—, así que se decide antes.
  assert.equal(esRutaCampoPermitida('/obras'), false)
  assert.equal(aterrizajeDeIngreso('campo', '/obras'), '/hoy')
  assert.equal(aterrizajeDeIngreso('campo', '/clientes/abc'), '/hoy')
  assert.equal(aterrizajeDeIngreso('campo', '/mi-trabajo'), '/mi-trabajo')
})

// ── 3 · LO QUE NUNCA ES UN DESTINO VÁLIDO

test('el portal del cliente NUNCA es el aterrizaje de alguien de adentro', () => {
  // Un empleado dentro de /portal ve la pantalla vacía —las consultas filtran por
  // `cliente_de_sesion()`, que para él es NULL— y concluye que el cliente no tiene nada cargado.
  assert.equal(aterrizajeDeIngreso('direccion', '/portal'), '/administracion')
  assert.equal(aterrizajeDeIngreso('direccion', '/portal/login'), '/administracion')
  assert.equal(aterrizajeDeIngreso('campo', '/portal/obra/x'), '/hoy')
  // `/portales` NO es el portal: se compara el segmento, no el prefijo de texto.
  assert.equal(aterrizajeDeIngreso('direccion', '/portales'), '/portales')
})

test('volver a la propia puerta es un bucle y no se hace', () => {
  for (const puerta of ['/login', '/recuperar', '/contrasena-nueva', '/callback', '/callback?code=x']) {
    assert.equal(
      aterrizajeDeIngreso('direccion', puerta), '/administracion',
      `${puerta} devolvió a la persona a la puerta que acaba de cruzar`,
    )
  }
})

test('un volver que sale del sitio cae al inicio: la URL no es un trampolín', () => {
  // Con la sesión recién creada en el bolsillo. `//evil.com` y `/\evil.com` son protocol-relative:
  // el navegador las resuelve como HOST externo aunque empiecen con barra.
  for (const trampa of [
    '//evil.com', '/\\evil.com', 'https://evil.com', 'http://evil.com',
    'evil.com', 'javascript:alert(1)', '',
  ]) {
    assert.equal(
      aterrizajeDeIngreso('direccion', trampa), '/administracion',
      `«${trampa}» se aceptó como destino después de entrar`,
    )
  }
})
