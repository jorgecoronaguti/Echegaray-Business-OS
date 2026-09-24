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
//    `destinoDeLaHome`— es `/administracion`. Y al jefe de obra le pasaba lo mismo. Volver a
//    escribir ese ternario —o inventar acá una segunda tabla de inicios— pone en rojo
//    «HAY UNA SOLA DEFINICIÓN DE INICIO».
//
// 2. El `?volver=` que el middleware guarda al rebotar a `/login` no lo leía nadie: medido contra el
//    servidor el 08/09/2026, `/login?volver=/mi-cuenta` aterrizaba en `/obras` con el jefe y en
//    `/hoy` con campo, y los tres pueden abrir `/mi-cuenta`. Devolver `inicio` sin mirar el `volver`
//    pone en rojo los tres casos de «se respeta».
//
// Y la mitad de seguridad: un `volver` es entrada de usuario. Los casos de trampolín
// (`//evil.com`, `/\evil.com`, `https://…`) están abajo y ninguno puede salir del sitio.

// ── 1 · EL INICIO DE CADA ROL ES EL DE LA HOME, NO OTRO

test('HAY UNA SOLA DEFINICIÓN DE INICIO: el ingreso y la home coinciden en LOS CUATRO roles', () => {
  // ═══ LA DECISIÓN DEL DUEÑO, 08/09/2026 ═══
  //
  // La primera versión de `aterrizaje.ts` traía su propia tabla y divergía en un rol —mandaba al
  // jefe de obra a `/obras` mientras la home lo mandaba a `/administracion`—. El dueño lo cerró:
  // UNA definición, y la fuente es `destinoDeLaHome`, que sostiene la decisión del 19/08 «jefe de
  // obra ES Administración».
  //
  // ÉSTE ES EL TEST DEL DEFECTO ORIGINAL Y TAMBIÉN DE SU REINCIDENCIA. Se pone en rojo tanto si
  // alguien vuelve a escribir `redirect(rol === 'campo' ? '/hoy' : '/obras')` como si alguien
  // reintroduce un mapa propio acá: cualquier tabla paralela va a diferir en algún rol.
  for (const rol of ['direccion', 'administracion', 'jefe_obra', 'campo'] as const) {
    assert.equal(
      inicioDeRol(rol), destinoDeLaHome(rol),
      `el rol ${rol} tiene DOS inicios: ${inicioDeRol(rol)} al entrar, ${destinoDeLaHome(rol)} en la home`,
    )
    assert.equal(aterrizajeDeIngreso(rol, null), destinoDeLaHome(rol))
  }
})

// ═══ CAMBIO DE CONTRATO (dueño, 24/09/2026) ═══
// Hasta hoy el jefe entraba por Administración (→ Personal) salvo que el navegador se declarara
// teléfono. El dueño fijó UN inicio por nivel, sin mirar el aparato: el del jefe es su obra (J01).
test('el jefe de obra entra por su obra (J01), en cualquier aparato', () => {
  assert.equal(inicioDeRol('jefe_obra'), '/obra/hoy')
  assert.equal(aterrizajeDeIngreso('jefe_obra', null), '/obra/hoy')
})

test('el cliente no aterriza adentro del OS ni cuando entra por la puerta de adentro', () => {
  // No tiene contraseña, pero sí puede tener `auth.users` y `perfiles.rol = 'cliente'`. Antes caía
  // en `/obras` y el middleware lo rebotaba: un salto de más para llegar a lo mismo.
  assert.equal(inicioDeRol('cliente'), '/portal')
  assert.equal(aterrizajeDeIngreso('cliente', '/reportes'), '/portal')
})

test('cada rol aterriza donde el dueño lo pidió', () => {
  assert.equal(aterrizajeDeIngreso('campo', null), '/hoy')
  // 24/09/2026: el jefe a su obra; quien administra a Obras, la primera de su barra de gestión.
  assert.equal(aterrizajeDeIngreso('jefe_obra', null), '/obra/hoy')
  assert.equal(aterrizajeDeIngreso('administracion', null), '/obras')
  assert.equal(aterrizajeDeIngreso('direccion', null), '/obras')
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
  assert.equal(aterrizajeDeIngreso('direccion', '/clientes/abc'), '/clientes/abc')
  assert.equal(aterrizajeDeIngreso('campo', '/mi-cuenta'), '/mi-cuenta')
  // La query sobrevive entera: `/obras?estado=activas` es la vista que se quiso abrir, no `/obras`.
  assert.equal(aterrizajeDeIngreso('direccion', '/obras?estado=activas'), '/obras?estado=activas')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/obra/tareas?obra=quattropani'), '/obra/tareas?obra=quattropani')
})

test('NO se respeta el volver cuando el rol NO puede ver esa ruta: se aterriza en su inicio', () => {
  // Sin esto hay una CADENA — login → /reportes → middleware → /obras— que el router del cliente no
  // termina de recorrer: el redirect de una Server Action viaja por RSC y la barra se queda en la
  // ruta que no se puede abrir.
  assert.equal(puedeVerRuta('jefe_obra', '/reportes'), false)
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/reportes'), '/obra/hoy')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/administracion/usuarios'), '/obra/hoy')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/presupuestos'), '/obra/hoy')
  // EL «LISTADO GIGANTE» (24/09/2026): si la sesión vencía estando en la cartera, el jefe volvía a
  // entrar y aterrizaba otra vez en `/obras`. La cartera ya no es suya: vuelve a su obra.
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/obras'), '/obra/hoy')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/obras?archivadas=1'), '/obra/hoy')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/campo'), '/obra/hoy')
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
  assert.equal(aterrizajeDeIngreso('direccion', '/portal'), '/obras')
  assert.equal(aterrizajeDeIngreso('direccion', '/portal/login'), '/obras')
  assert.equal(aterrizajeDeIngreso('campo', '/portal/obra/x'), '/hoy')
  // `/portales` NO es el portal: se compara el segmento, no el prefijo de texto.
  assert.equal(aterrizajeDeIngreso('direccion', '/portales'), '/portales')
})

test('volver a la propia puerta es un bucle y no se hace', () => {
  for (const puerta of ['/login', '/recuperar', '/contrasena-nueva', '/callback', '/callback?code=x']) {
    assert.equal(
      aterrizajeDeIngreso('direccion', puerta), '/obras',
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
      aterrizajeDeIngreso('direccion', trampa), '/obras',
      `«${trampa}» se aceptó como destino después de entrar`,
    )
  }
})

// ═══ EL APARATO YA NO VIAJA CON EL ATERRIZAJE (24/09/2026) ═══
//
// Del 23/09 al 24/09 `inicioDeRol` y `aterrizajeDeIngreso` recibían «¿es un teléfono?». Se retiró con
// la decisión del dueño de un inicio por nivel; si vuelve el parámetro, estos lo nombran.
test('el ingreso no recibe el aparato', () => {
  assert.equal(inicioDeRol.length, 1)
  assert.equal(aterrizajeDeIngreso.length, 2)
  // El `volver` sigue ganando cuando el rol puede abrirlo: el deep link no se pierde.
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/mi-cuenta'), '/mi-cuenta')
  assert.equal(aterrizajeDeIngreso('jefe_obra', '/administracion/personas'), '/administracion/personas')
})
