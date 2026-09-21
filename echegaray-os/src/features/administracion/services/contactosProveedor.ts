// LOS CONTACTOS DE UN PROVEEDOR — las reglas, separadas de la consulta y de la escritura.
//
// La forma del contacto (qué campos, qué topes, qué es un email válido) NO vive acá: es la de
// `@/shared/contactos/contacto`, la misma del cliente. Esto agrega sólo lo propio del proveedor:
// cómo se lee el resultado de la base y qué se le dice a la persona cuando la base dice que no.
//
// ═══ LA VENTANA EN QUE LA TABLA NO EXISTE ═══
//
// `20260921T1000_proveedor_contacto` la aplica el dueño, no un agente. Hasta entonces la ficha tiene
// que decir por qué no hay agenda —y nunca contestar «Contacto agregado» sin una fila—: un dato que
// se cree guardado y no existe es peor que uno que falta, porque nadie lo vuelve a cargar.

import { faltaLaTabla, type ContactoDeAgenda } from '../../../shared/contactos/contacto.ts'

export const MIGRACION_CONTACTOS_PROVEEDOR = '20260921T1000_proveedor_contacto'

export type LecturaContactos =
  | { estado: 'ok'; contactos: ContactoDeAgenda[] }
  /** La tabla no está en esta base: falta aplicar la migración. No es un error de lectura. */
  | { estado: 'sin-tabla' }
  | { estado: 'error'; error: string }

interface ErrorDeBase { code?: string; message?: string }

/** Lo que devolvió PostgREST, clasificado. Un error NO se convierte en «sin contactos». */
export function clasificarLectura(data: unknown, error: ErrorDeBase | null): LecturaContactos {
  if (faltaLaTabla(error)) return { estado: 'sin-tabla' }
  if (error) return { estado: 'error', error: error.message || 'error desconocido de la base' }
  return { estado: 'ok', contactos: Array.isArray(data) ? (data as ContactoDeAgenda[]) : [] }
}

export function avisoSinTabla(): string {
  return 'La agenda de contactos de proveedores todavía no está en esta base: falta aplicar la '
    + `migración ${MIGRACION_CONTACTOS_PROVEEDOR}.`
}

/**
 * El error de una escritura, dicho para quien la intentó. Dice primero lo que NO pasó.
 *
 * `42501` es «permission denied» (falta el GRANT) o la RLS rechazando: para quien está en la pantalla
 * son lo mismo —no tiene permiso—. Cualquier otro error viaja con el mensaje de la FUENTE: taparlo con
 * «hubo un problema» borra el único dato útil para arreglarlo.
 */
export function traducirErrorContacto(error: ErrorDeBase): string {
  if (faltaLaTabla(error)) {
    return `No guardé nada: falta aplicar en la base la migración ${MIGRACION_CONTACTOS_PROVEEDOR}.`
  }
  if (error.code === '42501') {
    return 'No guardé nada: tu usuario no tiene permiso para cambiar contactos de proveedores.'
  }
  return `No guardé nada: ${error.message || 'la base rechazó el cambio sin decir por qué'}.`
}

/**
 * UNA ESCRITURA QUE NO TOCÓ NINGUNA FILA NO ES UN ÉXITO. Con RLS, un UPDATE o DELETE que la policy
 * filtra no da error: devuelve 204 y cero filas. Sin esta pregunta, la pantalla diría «Contacto
 * guardado» sobre un cambio que no existe.
 */
export function sinFilaAfectada(filas: unknown): string | null {
  return Array.isArray(filas) && filas.length > 0
    ? null
    : 'No guardé nada: el contacto ya no existe o tu usuario no puede cambiarlo.'
}
