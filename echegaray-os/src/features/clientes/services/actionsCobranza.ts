'use server'

// LAS ESCRITURAS DE LAS PANTALLAS 28 · 31 · 32.
//
// ═══ STUB HASTA QUE ATERRICE back-28-32 — PERO LA PUERTA YA ESTÁ CERRADA ═══
//
// El cuerpo que escribe todavía no existe: las tablas (`cobranza_cambio`, `cliente_acceso`,
// `mail_saliente`) las trae el frente de datos. Lo que SÍ está y no se toca cuando aterrice es la
// VALIDACIÓN: cada acción parsea su entrada con Zod y devuelve el error de forma antes de decir
// que no está conectada. Así el día que se enchufe el cuerpo, nadie tiene que acordarse de agregar
// la guarda — y mientras tanto la pantalla ya prueba sus mensajes de error de verdad.
//
// ═══ POR QUÉ NINGUNA DE ESTAS ESCRIBE EN GOOGLE ═══
//
// `registrarCobro` y `editarPago` terminan moviendo una celda de la pestaña Cobranzas del Sheet
// «Flujo de Caja - Cash Flow». Eso NO se hace desde Vercel ni desde una server action: se ENCOLA
// en Postgres y lo aplica un worker en la VM, con bisturí sobre esa fila y con lectura de vuelta.
// El 204 de PostgREST no prueba una escritura y el «sí» de Sheets tampoco: lo que prueba es el
// dato releído en su destino.
//
// `habilitarAcceso` con aviso y `publicarEsquema` mandan un mail al cliente: eso es NIVEL E
// —efecto hacia afuera— y por eso lo dispara el admin apretando el botón, nunca un timer.

import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { accesoSchema, cambioPagoSchema, cobroSchema, type CambioPago } from './entradasCobranza'
import { permisosCoherentes } from './reglasPortal'

/** El mismo texto en las seis: la pantalla lo muestra tal cual, sin adornarlo de «error». */
const SIN_CONECTAR = 'Todavía no está conectado: falta la tabla que lo sostiene (back-28-32).'

const noConectado = (): ResultadoAccion => ({ ok: false, error: SIN_CONECTAR })

/**
 * REGISTRAR UN COBRO sobre un certificado (28).
 *
 * Cuando esté conectada: encola `estado_cobrado`, `fecha` (columna Q) y `medio` (columna N) sobre
 * la fila de Cobranzas del certificado, y la pantalla muestra el estado de esa cola hasta que el
 * worker confirme la lectura de vuelta. Un cobro NO es un asiento que se da por hecho al apretar.
 */
export async function registrarCobro(
  certificadoId: string, form: FormData,
): Promise<ResultadoAccion> {
  const parsed = cobroSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (!certificadoId) return { ok: false, error: 'Falta el certificado que se está cobrando' }
  return noConectado()
}

/**
 * EDITAR UN PAGO DEL ESQUEMA (32): la fecha, el medio, lo que ve el cliente, la nota interna.
 *
 * Los campos propios de la app (`visible_portal`, `aviso_dias`, `nota_interna`) se guardan en
 * `esquema_pago`; la FECHA y el MONTO además se encolan hacia el Sheet, porque ahí es donde vive
 * la verdad del cobro.
 */
export async function editarPago(pagoId: string, cambio: CambioPago): Promise<ResultadoAccion> {
  const parsed = cambioPagoSchema.safeParse(cambio)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (!pagoId) return { ok: false, error: 'Falta el pago que se está editando' }
  return noConectado()
}

/**
 * PUBLICAR EL ESQUEMA AL CLIENTE (32) — nivel E: le llega un mail y cambia lo que ve en el portal.
 * Marca los pagos pendientes como publicados y encola el aviso en `mail_saliente`.
 */
export async function publicarEsquema(clienteId: string): Promise<ResultadoAccion> {
  if (!clienteId) return { ok: false, error: 'Falta el cliente' }
  return noConectado()
}

/**
 * HABILITAR UN MAIL EN EL PORTAL (31) — nivel E cuando `avisar_por_mail` viene en true.
 *
 * LOS PERMISOS SE VUELVEN A NORMALIZAR ACÁ. La pantalla ya los pasó por `permisosCoherentes`, y
 * eso no es una garantía: entre la pantalla y esta función hay una red. Un `puede_aprobar` sin
 * `puede_ver_montos` guardado por un `curl` es un cliente aprobando facturas a ciegas.
 */
export async function habilitarAcceso(
  clienteId: string, entrada: unknown,
): Promise<ResultadoAccion> {
  const parsed = accesoSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (!clienteId) return { ok: false, error: 'Falta el cliente' }
  const permisos = permisosCoherentes(parsed.data)
  if (!permisos.puede_ver_obra && !permisos.puede_ver_montos) {
    return { ok: false, error: 'Un acceso que no puede ver nada no sirve: marcá al menos «Ver la obra»' }
  }
  return noConectado()
}

/** REVOCAR: el mail deja de entrar. No se borra la fila — quién entró y qué hizo queda. */
export async function revocarAcceso(accesoId: string): Promise<ResultadoAccion> {
  if (!accesoId) return { ok: false, error: 'Falta el acceso que se está revocando' }
  return noConectado()
}

/** REENVIAR LA INVITACIÓN al que todavía no entró (31). Nivel E: sale un mail. */
export async function reenviarInvitacion(accesoId: string): Promise<ResultadoAccion> {
  if (!accesoId) return { ok: false, error: 'Falta el acceso al que reenviarle la invitación' }
  return noConectado()
}
