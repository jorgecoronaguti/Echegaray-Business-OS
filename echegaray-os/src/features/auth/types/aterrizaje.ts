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
 *   jefe_obra      `/obras`          su cartera: es lo que administra
 *   administracion `/administracion` la primera solapa de su área, la que la barra pinta activa
 *   direccion      `/administracion` ídem
 *   cliente        `/portal`         nunca entra por acá, pero el mapa no puede tener un hueco
 *
 * ═══ HAY UNA DIVERGENCIA CONOCIDA CON `destinoDeLaHome`, Y ES DEL DUEÑO ═══
 *
 * `destinoDeLaHome('jefe_obra')` devuelve **`/administracion`**, con un test que lo fija desde el
 * 27/08/2026 y el argumento escrito al lado: *«su área es Administración, no Obras»* — el jefe de
 * obra pertenece al nivel Administración desde la decisión del 19/08 y su primera solapa es ésa.
 *
 * El ingreso lo manda a **`/obras`**, que es la instrucción de este trabajo y lo que hacía el login
 * desde el 17/08. Para los otros tres roles las dos funciones coinciden y se comprueba abajo, en
 * `aterrizaje.test.ts`, rol por rol.
 *
 * NO SE RESUELVE ACÁ. Cuál es el inicio del jefe de obra —su cartera o los maestros— es una decisión
 * de producto con un test aprobado del otro lado; cambiarla desde una unificación de login sería
 * revertir en silencio algo que alguien decidió. Queda declarada, con un test que la NOMBRA para que
 * nadie la "arregle" sin verla, y va al informe para que la firme el dueño.
 */
const INICIO: Record<Rol, string> = {
  campo: '/hoy',
  jefe_obra: '/obras',
  administracion: '/administracion',
  direccion: '/administracion',
  // El cliente no tiene contraseña —entra al portal con su mail— pero SÍ puede tener un
  // `auth.users` (lo crea `/callback` al atarlo) y un `perfiles.rol = 'cliente'`. Sin esta entrada
  // caía en `/obras` y el middleware lo rebotaba a `/portal`: un salto de más para llegar al mismo
  // lugar. No cambia `destinoPorRol`, que sigue siendo la cerradura del confinamiento.
  cliente: RUTA_PORTAL,
}

export function inicioDeRol(rol: Rol | null | undefined): string {
  // Sin rol se cae al nivel MENOS privilegiado, igual que la navegación: el modo de fallar de un
  // default permisivo es aterrizar a alguien en la pantalla del dinero con la sesión ya abierta.
  return (rol && INICIO[rol]) || destinoDeLaHome(null)
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
