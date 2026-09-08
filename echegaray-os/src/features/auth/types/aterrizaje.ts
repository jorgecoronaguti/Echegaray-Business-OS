// A DÓNDE CAE QUIEN ACABA DE ENTRAR — UNA SOLA REGLA PARA LAS CUATRO IDENTIDADES DE ADENTRO.
//
// ═══ LO QUE ESTABA MEZCLADO (08/09/2026) ═══
//
// El dueño: *"hay un problema con el login, está mezclando todos los inicios que hay posibles como
// jefe de obra, clientes, obrero, admin"*. Medido contra el servidor real antes de tocar nada:
//
//   · `loginAction` hacía `redirect(rol === 'campo' ? '/hoy' : '/obras')`. O sea que Dirección y
//     Administración entraban por `/obras`, pero su INICIO —el que dibuja el isotipo del header, que
//     apunta a `/` y de ahí a `destinoDeLaHome()`— es `/administracion`. Dos «inicios» distintos
//     para la misma persona: uno al entrar y otro al tocar la marca.
//   · El `?volver=` que pone el middleware NO LO LEÍA NADIE. Comprobado con las tres identidades:
//     `/login?volver=/mi-cuenta` aterrizaba en `/obras` (jefe, admin) y en `/hoy` (campo), aunque
//     los tres pueden abrir `/mi-cuenta`. El deep link se perdía siempre — la mitad del guard de
//     sesión estaba escrita y sin consumidor.
//
// ═══ UNA SOLA DEFINICIÓN DE «INICIO», Y NO ES DE ESTE ARCHIVO ═══
//
// `inicioDeRol()` delega en `destinoDeLaHome()`, la que ya usaban `/` y el isotipo del header. Acá
// no hay una segunda tabla: tenerla es el mismo defecto que este archivo vino a arreglar.
//
// ═══ POR QUÉ ES UNA FUNCIÓN PURA Y NO DOS `if` EN LA SERVER ACTION ═══
//
// Es la regla de aterrizaje del sistema entero y tiene que poder probarse sin levantar Next, igual
// que `destinoPorRol` del portal. Y porque el `volver` es ENTRADA DE USUARIO: viaja en la URL, lo
// elige quien llama, y decidir con él dentro de una acción que además autentica mezcla la puerta con
// la cerradura.
//
// ═══ EL `volver` SE RESPETA SÓLO SI ESE ROL PUEDE VER ESA RUTA ═══
//
// Sin esta comprobación, mandar a alguien a la ruta guardada produce una CADENA de redirecciones —
// login → `/reportes` → middleware → `/obras`— que en el navegador se ve como un parpadeo y en el
// router del cliente, medido el 20/08, ni siquiera llega: el redirect de una Server Action viaja por
// RSC y la barra se queda en la ruta que no puede abrir. Se decide UNA vez, acá, con el MISMO
// portero que el middleware (`puedeVerRuta` + `esRutaCampoPermitida`), y se aterriza donde
// corresponde a la primera.
//
// ESTO ES LA PUERTA, NO LA CERRADURA. Que los datos de `/reportes` no salgan para un jefe de obra lo
// decide el RLS en Postgres; acá sólo se decide qué pantalla se dibuja primero.

import { esRutaCampoPermitida, type Rol } from './index.ts'
import { puedeVerRuta } from './areas.ts'
import { destinoDeLaHome } from './navegacion.ts'
import { RUTA_PORTAL, esRutaPortal } from '../../portal/rutas.ts'

/**
 * Las rutas sin sesión. Volver a cualquiera de ellas después de entrar es un bucle: la persona
 * acaba de autenticarse y la mandaríamos otra vez a la puerta.
 */
const RUTAS_DE_PUERTA = ['/login', '/recuperar', '/contrasena-nueva', '/callback']

/**
 * EL INICIO DE CADA ROL — la pantalla donde empieza su día.
 *
 *   campo          `/hoy`            dónde trabajo · qué hago · qué tengo pendiente
 *   jefe_obra      `/administracion` su área es Administración desde la decisión del 19/08
 *   administracion `/administracion` la primera solapa de su área, la que la barra pinta activa
 *   direccion      `/administracion` ídem
 *   cliente        `/portal`         es EXTERNO: no tiene solapas y no entra por esta puerta
 *
 * ═══ NO HAY UN MAPA PROPIO ACÁ, Y ÉSA ES LA DECISIÓN (08/09/2026) ═══
 *
 * La primera versión de este archivo traía su propia tabla de inicios, y divergía de
 * `destinoDeLaHome()` en un rol: mandaba al jefe de obra a `/obras` mientras la home lo mandaba a
 * `/administracion`. Se declaró como decisión abierta y el dueño la cerró en el acto: **UNA
 * definición de inicio por rol**, y la fuente es `destinoDeLaHome` — la misma que ya usaban `/` y el
 * isotipo del header, y la que sostiene la decisión del 19/08 («jefe de obra ES Administración»).
 *
 * Dos tablas para la misma pregunta es exactamente lo que el dueño llamó «está mezclando todos los
 * inicios». Arreglar el login inventando una segunda habría reproducido el defecto un nivel más
 * abajo y con mejor letra. Acá no se decide nada: se delega.
 */
export function inicioDeRol(rol: Rol | null | undefined): string {
  // EL CLIENTE NO ES UN EMPLEADO CON MENOS PERMISOS: es alguien de otra empresa, no tiene solapas, y
  // `destinoDeLaHome` —que resuelve por `solapasDeNav()[0]`— le daría una pantalla del OS. No tiene
  // contraseña (entra al portal con su mail) pero SÍ puede tener un `auth.users`, que crea
  // `/callback` al atarlo, y un `perfiles.rol = 'cliente'`. Sin esta línea caía en `/obras` y el
  // middleware lo rebotaba: un salto de más para llegar al mismo lugar. No cambia `destinoPorRol`,
  // que sigue siendo la cerradura del confinamiento.
  if (rol === 'cliente') return RUTA_PORTAL
  // Todo lo demás lo decide la ÚNICA definición de inicio del sistema. Sin rol, `destinoDeLaHome`
  // ya cae al nivel menos privilegiado: el modo de fallar de un default permisivo es aterrizar a
  // alguien en la pantalla del dinero con la sesión ya abierta.
  return destinoDeLaHome(rol)
}

/**
 * A DÓNDE VA QUIEN ACABA DE ENTRAR.
 *
 * `volver` es lo que el middleware guardó cuando rebotó a `/login`, y es entrada de usuario: sólo
 * pasa una ruta interna de este OS que ESE rol puede abrir. Cualquier otra cosa —una URL externa
 * disfrazada de ruta, el portal del cliente, la propia puerta, o una pantalla que el rol no ve—
 * cae al inicio de su rol en vez de rechazarse con un cartel: quien acaba de poner bien su
 * contraseña tiene que terminar adentro, no leyendo un error.
 */
export function aterrizajeDeIngreso(
  rol: Rol | null | undefined,
  volver: string | null | undefined,
): string {
  const inicio = inicioDeRol(rol)
  if (!volver) return inicio

  const limpio = volver.trim()
  // Una sola barra al principio y nada que un navegador pueda leer como autoridad: `//evil.com` y
  // `/\evil.com` son protocol-relative y salen del sitio. Mismo criterio que `destinoSeguro()` del
  // callback, que ya cuida el otro camino de entrada.
  if (!limpio.startsWith('/')) return inicio
  if (limpio.startsWith('//') || limpio.startsWith('/\\')) return inicio

  // Los porteros miran el PATH, no la query: `/obras?estado=activas` es `/obras`.
  const ruta = limpio.split('?')[0].split('#')[0]

  if (RUTAS_DE_PUERTA.some((r) => ruta === r || ruta.startsWith(`${r}/`))) return inicio
  // El portal es de otra empresa. Un empleado ahí adentro ve la pantalla vacía —las consultas
  // filtran por `cliente_de_sesion()`, que para él es NULL— y concluye que el cliente no tiene nada.
  if (esRutaPortal(ruta)) return inicio
  if (rol === 'campo' && !esRutaCampoPermitida(ruta)) return inicio
  if (!puedeVerRuta(rol, ruta)) return inicio

  return limpio
}
