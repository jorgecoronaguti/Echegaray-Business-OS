// QUIÉN PUEDE ESCRIBIR EN LA LIQUIDACIÓN — la decisión, sin base y sin red.
//
// La pantalla no dibuja la solapa para quien no liquida y la ruta corta con `notFound()`. Eso NO
// alcanza: una server action es un endpoint y se invoca con el id que viaja en el HTML, sin abrir
// jamás la pantalla. Por eso el rol se vuelve a preguntar del lado del servidor, igual que
// `anotacionesActions`. La RLS con `public.liquida_sueldos()` es la tercera cerradura y la que vale.
//
// Vive en un módulo propio y PURO —no en el archivo `'use server'`— porque un archivo de acciones
// sólo puede exportar funciones async: la decisión no se podría probar sin levantar Supabase, y un
// control que no se puede poner en rojo no es un control.

import type { Rol } from '@/features/auth/types'
// RELATIVO Y CON EXTENSIÓN a propósito: `node --test` corre este módulo sin el alias `@/` de
// Next, igual que `areasAdmin.ts`. El import de tipo sí puede ir por alias porque se borra.
import { liquidaSueldos } from '../../auth/types/areas.ts'

export type PermisoLiquidacion = { ok: true } | { ok: false; error: string }

/** El mensaje es uno solo: no le dice a quien no entra qué existe del otro lado. */
export const MENSAJE_SIN_PERMISO =
  'Liquidación de horas es sólo para Administración. No guardé nada.'

/** Sin perfil legible no se sabe quién llama, y el modo de fallar de un default permisivo acá es
 * dejar que un jefe de obra reescriba los sueldos del plantel. Falla cerrado. */
export const MENSAJE_SIN_PERFIL = 'No pude verificar tu permiso. No guardé nada.'

/**
 * `errPerfil` entra como `unknown` a propósito: lo que importa es si la lectura del perfil falló,
 * no de qué forma. Un rol desconocido, `null` o `undefined` no liquidan.
 */
export function permisoDeLiquidacion(
  rol: Rol | null | undefined,
  errPerfil?: unknown,
): PermisoLiquidacion {
  if (errPerfil) return { ok: false, error: MENSAJE_SIN_PERFIL }
  if (!liquidaSueldos(rol)) return { ok: false, error: MENSAJE_SIN_PERMISO }
  return { ok: true }
}
