// LAS DOS PUERTAS QUE NO SE PUEDEN ABRIR NI SIENDO ADMINISTRACIÓN.
//
// Están acá, solas y sin un solo `await`, porque son las reglas que hay que poder PROBAR sin base,
// sin sesión y sin navegador. Una regla de seguridad que sólo se puede ejercitar levantando el
// sistema entero termina no ejercitándose nunca — y ésta es de las que se descubren rotas el día
// que ya no queda nadie que pueda entrar.
//
// ═══ POR QUÉ LAS DOS ═══
//
// 1. NADIE SE TOCA A SÍ MISMO. Un administrador que se cambia el rol o se desactiva se saca del
//    sistema con la misma pantalla que usa para administrarlo. No es hipotético: la pantalla lista
//    a todos, y la propia fila está en el medio de las demás.
// 2. NO SE APAGA AL ÚLTIMO ADMINISTRADOR. Si se apaga, no queda NADIE que pueda volver a encender a
//    nadie: el único camino de vuelta es entrar a Supabase a mano. Falla cerrado.
//
// Las dos devuelven el MOTIVO en castellano, o `null` cuando no hay impedimento. Devolver el texto
// —y no un booleano— obliga a que la pantalla diga por qué; un `false` mudo termina siempre en un
// botón que no hace nada.

import type { Rol } from '@/features/auth/types'
import { esAdministracion, type Area } from '@/features/auth/types/areas'

/**
 * LOS ROLES QUE SE PUEDEN ELEGIR, AGRUPADOS POR NIVEL.
 *
 * *"No crear más niveles de usuario"*. Los cuatro literales son los que ya viven en
 * `perfiles.rol` y contra los que están escritas las policies; lo único que agrega esta pantalla es
 * mostrarlos agrupados por el nivel al que pertenecen, que es la agrupación que ya define
 * `areaDe()`. Elegir el nivel sin elegir el rol obligaría a inventar un rol por defecto.
 */
export const ROLES_DE_AREA: Record<Area, Rol[]> = {
  administracion: ['direccion', 'administracion'],
  obras: ['jefe_obra', 'campo'],
}

export const ROLES_VALIDOS: readonly Rol[] = [...ROLES_DE_AREA.administracion, ...ROLES_DE_AREA.obras]

export interface CuentaEnJuego {
  /** Quién ejecuta la acción. Sale de la sesión del servidor, NUNCA del formulario. */
  actorId: string
  /** A quién se le aplica. */
  objetivoId: string
  /** El rol que el objetivo tiene HOY. `null` = cuenta sin perfil. */
  rolActual: Rol | null
  /** Cuentas de nivel Administración que hoy pueden entrar, CONTANDO al objetivo. */
  adminsActivos: number
}

const ULTIMO_ADMIN =
  'Es la última cuenta de Administración con acceso. Si le sacás el acceso no queda nadie que pueda ' +
  'devolvérselo: primero dale acceso de Administración a otra persona.'

/** El motivo por el que NO se puede desactivar esta cuenta, o `null` si se puede. */
export function motivoParaNoDesactivar(c: CuentaEnJuego): string | null {
  if (c.actorId === c.objetivoId) return 'No podés sacarte el acceso a vos mismo.'
  if (esAdministracion(c.rolActual) && c.adminsActivos <= 1) return ULTIMO_ADMIN
  return null
}

/** El motivo por el que NO se puede pasar esta cuenta a `rolNuevo`, o `null` si se puede. */
export function motivoParaNoCambiarRol(c: CuentaEnJuego, rolNuevo: Rol): string | null {
  if (c.actorId === c.objetivoId) {
    return 'No podés cambiarte el rol a vos mismo. Pediselo a otra persona de Administración.'
  }
  // Bajar de nivel al último administrador deja el sistema sin administradores igual que apagarlo:
  // la puerta es la misma y por eso el motivo también.
  if (esAdministracion(c.rolActual) && !esAdministracion(rolNuevo) && c.adminsActivos <= 1) return ULTIMO_ADMIN
  return null
}
