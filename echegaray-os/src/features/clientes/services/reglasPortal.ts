// LAS REGLAS DE LA PANTALLA 31 — quién entra al portal del cliente y qué ve adentro.
//
// ═══ ESTA PANTALLA ABRE UNA PUERTA HACIA AFUERA ═══
//
// El resto del OS decide qué ve un empleado. Acá se decide qué ve el CLIENTE: montos, facturas,
// avance de obra y, si se marca, la aprobación que habilita una factura. Un permiso de más no es
// una molestia interna, es información económica en manos de la contraparte de un contrato.
//
// Por eso los permisos no son tres casillas sueltas: son una CASCADA. Y por eso la coherencia se
// impone en una función pura con test, y no en el `onChange` de tres interruptores — donde ya se
// demostró (`accesoPersona.test.ts`, 19/08) que la pantalla termina afirmando un permiso que la
// base no da.
//
// LA LLAVE ES EL MAIL. `31:69`: «el mail que carga acá es la llave: entra solo quien lo tiene».
// Por eso `mismoMail` normaliza igual que la base (`citext`), y no «casi igual».

import type { AccesoPortal } from '../types/cobranzas.ts'

export interface Permisos {
  puede_ver_obra: boolean
  puede_ver_montos: boolean
  puede_aprobar: boolean
}

/**
 * LA CASCADA, EN LA DIRECCIÓN SEGURA: aprobar ⊂ ver montos ⊂ ver la obra.
 *
 * Aprobar un certificado sin ver el monto es apretar un botón a ciegas sobre un documento que
 * habilita una factura; ver el monto de un certificado sin ver la obra que lo genera es un número
 * sin origen. Así que una combinación incoherente se corrige QUITANDO el permiso de arriba, nunca
 * agregando el de abajo: un normalizador que «completa» hacia abajo termina regalando la vista de
 * los montos a alguien a quien nadie se la dio, y esta pantalla mira hacia afuera de la empresa.
 *
 * Encender hacia abajo es una decisión del que carga el formulario, no del normalizador, y por eso
 * vive en `alCambiarPermiso`: ahí hubo un clic explícito.
 */
export function permisosCoherentes(p: Permisos): Permisos {
  const puede_ver_obra = p.puede_ver_obra
  const puede_ver_montos = p.puede_ver_montos && puede_ver_obra
  return { puede_ver_obra, puede_ver_montos, puede_aprobar: p.puede_aprobar && puede_ver_montos }
}

/**
 * Qué pasa al tocar UN interruptor del formulario.
 *
 * ENCENDER arrastra a los de abajo (marcar «aprueba» sin poder ver el monto no significa nada, y
 * obligar a marcar tres casillas en orden es una trampa de formulario). APAGAR arrastra a los de
 * arriba, que es la única forma de que quitar «ve montos» quite de verdad la aprobación.
 */
export function alCambiarPermiso(p: Permisos, cual: keyof Permisos, valor: boolean): Permisos {
  const r = { ...p, [cual]: valor }
  if (valor) {
    if (cual === 'puede_aprobar') { r.puede_ver_montos = true; r.puede_ver_obra = true }
    if (cual === 'puede_ver_montos') r.puede_ver_obra = true
  } else {
    if (cual === 'puede_ver_montos') r.puede_aprobar = false
    if (cual === 'puede_ver_obra') { r.puede_ver_montos = false; r.puede_aprobar = false }
  }
  return permisosCoherentes(r)
}

/** Un acceso revocado no cuenta como habilitado, aunque la fila siga en la tabla. */
export const estaHabilitado = (a: AccesoPortal): boolean => a.revocado_at == null

/** «3 mails habilitados · 1 sin primer ingreso» (`31:47`). */
export function resumenAccesos(accesos: AccesoPortal[]): {
  habilitados: number; sinIngresar: number; revocados: number
} {
  const vivos = accesos.filter(estaHabilitado)
  return {
    habilitados: vivos.length,
    sinIngresar: vivos.filter((a) => a.primer_ingreso_at == null).length,
    revocados: accesos.length - vivos.length,
  }
}

/**
 * LA COLUMNA OBRAS (`31:114`): «Las 3» cuando entra a todas, el nombre cuando es una sola.
 *
 * `obras = null` significa TODAS, incluidas las que todavía no existen — no «ninguna». Confundir
 * las dos es el error que abre un cliente a una obra que nadie le quiso mostrar.
 */
export function textoDeObras(acceso: AccesoPortal, totalObrasDelCliente: number): string {
  if (acceso.obras == null) return `Las ${totalObrasDelCliente}`
  if (acceso.obras.length === 0) return 'Ninguna'
  if (acceso.obras.length === 1) return acceso.obras_nombres?.[0] ?? '1 obra'
  return `${acceso.obras.length} obras`
}

/** La normalización que hace `citext` en la base: sin espacios y sin mayúsculas. */
export const normalizarMail = (v: string | null | undefined): string =>
  (v ?? '').trim().toLowerCase()

export const mismoMail = (a: string | null | undefined, b: string | null | undefined): boolean =>
  normalizarMail(a) !== '' && normalizarMail(a) === normalizarMail(b)

/** Formato mínimo: hay algo, un arroba y un punto después. La validación de verdad es del servidor
 *  (Zod) y de la base; ésta sólo decide si el botón se ofrece. */
export const mailPlausible = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

export interface ContactoConocido { nombre: string; email: string | null; rol: string | null }

/** «Es contacto del cliente: Gabriel Molina, compras» (`31:246`) — el cruce con los contactos que
 *  la ficha ya tiene cargados. Sirve para no habilitar a un desconocido por un typo. */
export function contactoDelMail(
  mail: string, contactos: ContactoConocido[],
): ContactoConocido | null {
  return contactos.find((c) => mismoMail(c.email, mail)) ?? null
}

/** Un mail ya habilitado no se agrega dos veces: la base tiene `unique` y devolvería un error
 *  feo. Devuelve el acceso existente para que la pantalla ofrezca reenviarle la invitación. */
export function accesoExistente(mail: string, accesos: AccesoPortal[]): AccesoPortal | null {
  return accesos.find((a) => mismoMail(a.email, mail)) ?? null
}
