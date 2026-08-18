// LOS DOS NIVELES DE USUARIO DEL ERP — y nada más.
//
// El dueño (18/08), textual: *"DOS NIVELES DE USUARIO. Sólo: ADMINISTRACIÓN / OBRAS"* ·
// *"No crear más niveles de usuario"*.
//
// ═══ POR QUÉ NO SE CREAN ROLES NUEVOS ═══
//
// `perfiles.rol` ya tiene cuatro valores en producción (`direccion`, `administracion`, `jefe_obra`,
// `campo`) con usuarios reales colgando de ellos y policies de RLS escritas contra esos literales.
// Agregar dos valores más significaría migrar los cuatro, reescribir cada policy y quedarse con seis
// nombres para dos ideas. Lo que hacía falta no era un rol: era la AGRUPACIÓN, que es esto.
//
// La granularidad futura tampoco pide roles nuevos: pide filas en `usuario_obra`. El nivel dice QUÉ
// PUEDE HACER; la asignación dice SOBRE QUÉ OBRAS. Son dos ejes y se mantienen separados a propósito.

import type { Rol } from './index'

/** Las dos áreas de producto. Son las dos únicas entradas de la navegación global. */
export type Area = 'administracion' | 'obras'

/**
 * EL NIVEL DE UN ROL. Dirección y Administración ven todo; Jefe de Obra y Campo, sus obras.
 *
 * Un rol desconocido —o un usuario sin perfil— cae en `obras`, que es el nivel MENOS privilegiado.
 * Falla cerrado: el modo de fallar de un default permisivo es publicar la economía de la empresa.
 */
export function areaDe(rol: Rol | null | undefined): Area {
  return rol === 'direccion' || rol === 'administracion' ? 'administracion' : 'obras'
}

/** ¿Este rol ve la economía, los contratos y todas las obras? */
export const esAdministracion = (rol: Rol | null | undefined) => areaDe(rol) === 'administracion'

/**
 * LAS ÁREAS QUE VE UN ROL EN LA NAVEGACIÓN GLOBAL.
 *
 * Administración ve las dos —necesita entrar a una obra igual que un jefe—; el nivel Obras ve una
 * sola, y por eso su navegación no dibuja una barra de un solo elemento: dibuja el nombre del área.
 */
export function areasDe(rol: Rol | null | undefined): Area[] {
  return esAdministracion(rol) ? ['administracion', 'obras'] : ['obras']
}

export const AREA_LABEL: Record<Area, string> = {
  administracion: 'Administración',
  obras: 'Obras',
}

export const AREA_HREF: Record<Area, string> = {
  administracion: '/administracion',
  obras: '/obras',
}

/**
 * ═══ LAS RUTAS QUE EL NIVEL «OBRAS» NO PUEDE ABRIR ═══
 *
 * Es una lista NEGRA a propósito, y es la excepción a la regla del guard de sesión (que es blanca).
 * Motivo: acá el default correcto es PERMITIR —el jefe de obra tiene que poder trabajar— y lo que se
 * cierra es lo sensible, que es una lista corta y conocida. En el guard de sesión el default correcto
 * es NEGAR, porque lo que se protege es todo.
 *
 * NO reemplaza al RLS: la base decide qué filas devuelve, y eso vale también para una llamada directa
 * a PostgREST que no pasa por ninguna ruta de Next. Esto es la puerta; el RLS es la cerradura.
 */
export const RUTAS_SOLO_ADMINISTRACION = [
  '/administracion', '/clientes', '/flujo-caja', '/ingenieria-financiera', '/calendario-financiero',
  '/calendario-caja', '/scorecard-finanzas', '/reportes', '/aprobaciones', '/operarios',
] as const

export function puedeVerRuta(rol: Rol | null | undefined, pathname: string): boolean {
  if (esAdministracion(rol)) return true
  return !RUTAS_SOLO_ADMINISTRACION.some((r) => pathname === r || pathname.startsWith(r + '/'))
}
