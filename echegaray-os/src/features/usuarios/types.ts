// LO QUE ES UN USUARIO PARA LA PANTALLA DE ADMINISTRACIÓN.
//
// El modelo del dueño (19/08/2026), textual: *"usuario → rol → obras asignadas → permisos
// efectivos"*. Los cuatro eslabones existen ya en la base y ninguno se inventa acá:
//
//   usuario           `auth.users`      — la identidad y el acceso (email, clave, bloqueo)
//   rol               `perfiles.rol`    — uno de los CUATRO literales que ya están en producción
//   obras asignadas   `usuario_obra`    — la tabla de la que dependen `ve_obra()` y todo el RLS
//   permisos efect.   —                 — DERIVADO de los tres de arriba, nunca guardado
//
// Los permisos efectivos no son una columna: son una lectura. Guardarlos crearía una segunda
// versión de la verdad que se desincroniza el primer día que alguien cambia un rol en la base.

// RUTAS RELATIVAS CON EXTENSIÓN en los imports de VALOR: `reglas.test.ts` ejercita
// `permisosEfectivos` con `node --test`, que no conoce el alias `@/`.
import type { Rol } from '@/features/auth/types'
import { veEconomia, type Area } from '../auth/types/areas.ts'
import { veTodasLasObras } from './services/reglas.ts'

/**
 * EL ESTADO NO ES UNA COLUMNA NUESTRA: ES EL BLOQUEO DE `auth.users`.
 *
 * `perfiles` no tiene ningún campo de estado, y agregarle uno habría dejado dos verdades: una
 * cuenta marcada «inactiva» que igual puede entrar no es una cuenta inactiva. Desactivar es
 * bloquear la identidad en el proveedor de auth — medido el 19/08 contra la base real: el login
 * pasa a devolver `user_banned` y el refresh de sesión también. Ver `usuariosActions.ts`.
 */
export type EstadoUsuario = 'activo' | 'sin_acceso'

/** Una obra que este usuario tiene asignada. `asignacionId` es la fila de `usuario_obra`. */
export interface ObraDeUsuario {
  asignacionId: string
  obraId: string
  obraNombre: string
  papel: string
}

export interface UsuarioGestion {
  id: string
  /** El nombre del perfil. Vacío cuando la cuenta existe en auth pero nadie le cargó perfil. */
  nombre: string | null
  email: string | null
  /** `null` = cuenta sin perfil: cae al nivel MENOS privilegiado, igual que en `areaDe()`. */
  rol: Rol | null
  area: Area
  estado: EstadoUsuario
  obras: ObraDeUsuario[]
  ultimoIngreso: string | null
}

/** Una obra elegible para asignar. Es el catálogo, no lo asignado. */
export interface ObraElegible {
  id: string
  nombre: string
  estado: string | null
}

/**
 * LOS PERMISOS EFECTIVOS, EN CASTELLANO Y EN UNA LÍNEA.
 *
 * Es exactamente lo que contestan `es_administracion()` y `ve_obra()` en la base, dicho para una
 * persona. Si las funciones cambian, esta frase cambia con ellas — por eso vive al lado del tipo y
 * no escrita a mano dentro de un componente.
 */
export function permisosEfectivos(u: UsuarioGestion): string {
  if (u.estado === 'sin_acceso') return 'No puede entrar al sistema.'

  // DOS PREGUNTAS SEPARADAS, PORQUE LA BASE LAS CONTESTA POR SEPARADO: `ve_obra()` decide a qué
  // obras entra y `es_administracion()`/el rol deciden si ve el PRECIO. Esta frase decía «Ve todas
  // las obras, los clientes y la economía» para todo el área de navegación Administración — y un
  // jefe de obra está en esa área y NO ve la economía. La pantalla afirmaba un permiso que la base
  // niega, que es la peor forma de equivocarse en una pantalla de accesos.
  const obras = veTodasLasObras(u.rol)
    ? 'Entra a todas las obras'
    : u.obras.length === 0
      ? 'Sin obras asignadas: entra al sistema y no ve ninguna obra'
      : `Entra a ${u.obras.length === 1 ? 'la obra' : 'las obras'} ${u.obras.map((o) => o.obraNombre).join(', ')}`
  const economia = veEconomia(u.rol)
    ? 'Ve los clientes, el precio de venta y la economía.'
    : 'No ve el precio de venta ni la economía.'
  return `${obras}. ${economia}`
}
