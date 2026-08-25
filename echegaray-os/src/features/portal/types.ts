import { z } from 'zod'

// EL PORTAL DEL CLIENTE — tipos y las reglas de confinamiento del rol `cliente`.
//
// El `cliente` es el primer rol EXTERNO del sistema: no es un empleado con menos permisos, es
// alguien de otra empresa. Por eso el confinamiento es en las dos direcciones y no en una:
// el cliente no sale de /portal, y nadie de adentro entra a /portal.
//
// La segunda mitad suele olvidarse y no es cosmética: /portal dibuja lo que ve el cliente, y un
// empleado mirando esa pantalla estaría viendo datos filtrados por `cliente_de_sesion()`, que para
// él devuelve NULL. Vería una pantalla vacía y creería que el cliente no tiene nada.

/** La raíz del portal. Todo lo del cliente cuelga de acá. */
export const RAIZ_PORTAL = '/portal'

/** Dónde aterriza el cliente cuando intenta salirse de su corral. */
export const INICIO_PORTAL = '/portal'

/** Por dónde entra: pide el link a su mail. Es pública — quien la abre todavía no tiene sesión. */
export const RUTA_INGRESO_PORTAL = '/portal/ingresar'

export function esRutaPortal(pathname: string): boolean {
  return pathname === RAIZ_PORTAL || pathname.startsWith(`${RAIZ_PORTAL}/`)
}

/**
 * ¿A DÓNDE HAY QUE MANDAR A ESTA PERSONA? `null` = se queda donde está.
 *
 * Se resuelve acá, en una función pura, y no con dos `if` sueltos en el middleware, porque es la
 * regla de aislamiento entre una empresa y sus clientes: tiene que poder probarse sin levantar Next.
 *
 * Un rol desconocido o ausente NO es cliente y NO entra al portal: falla cerrado en las dos puertas.
 */
export function destinoPorRol(
  rol: string | null | undefined,
  pathname: string,
): string | null {
  const esCliente = rol === 'cliente'

  // El cliente sólo existe dentro del portal.
  if (esCliente) return esRutaPortal(pathname) ? null : INICIO_PORTAL

  // Y el portal sólo existe para el cliente. Incluye al rol nulo: un usuario autenticado sin perfil
  // no puede colarse a la vista del cliente.
  if (esRutaPortal(pathname)) return '/'

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRADAS DE USUARIO. Todo lo que escribe una persona se valida con Zod.

/** El mail con el que el cliente pide su link de acceso. */
export const pedirLinkSchema = z.object({
  // `toLowerCase` acá y no en la base: el CHECK de `cliente_acceso.email` exige el mail ya
  // normalizado, así que normalizar en el borde evita que el rechazo llegue como error de Postgres.
  email: z.string().trim().toLowerCase().email('Escribí un correo válido'),
})
export type PedirLinkInput = z.infer<typeof pedirLinkSchema>

export const observarCertificadoSchema = z.object({
  certificadoId: z.string().uuid(),
  texto: z.string().trim().min(10, 'Contanos qué observás, con un poco de detalle').max(2000),
})

export const informarTransferenciaSchema = z.object({
  esquemaPagoId: z.string().uuid().nullable().optional(),
  // Positivo y con techo: un cero no informa nada y un número absurdo suele ser un error de tipeo
  // que después hay que ir a limpiar a mano.
  monto: z.number().positive('El importe tiene que ser mayor a cero').max(1_000_000_000),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  referencia: z.string().trim().max(200).optional(),
  comprobanteStoragePath: z.string().trim().max(500).nullable().optional(),
})

export const crearConsultaSchema = z.object({
  obraId: z.string().trim().max(120).nullable().optional(),
  titulo: z.string().trim().min(3, 'Ponele un título').max(160),
  cuerpo: z.string().trim().min(10, 'Contanos un poco más').max(4000),
})

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE EL PORTAL DEVUELVE

export type EstadoCertificado =
  | 'emitido' | 'en_revision' | 'aprobado' | 'observado' | 'vencido' | 'cobrado' | 'en_disputa'

export type EstadoPago = 'cobrado' | 'a_vencer' | 'vencido' | 'previsto' | 'retenido'

export type MedioPago = 'transferencia' | 'cheque' | 'efectivo'

export interface PermisosPortal {
  puedeVerObra: boolean
  /** Cuando es false, los importes se devuelven en `null` — nunca en 0. Un 0 es un número. */
  puedeVerMontos: boolean
  puedeAprobar: boolean
  /** `null` = todas las obras del cliente. */
  obras: string[] | null
}

export interface MiObra {
  id: string
  nombre: string
  estado: string | null
  avancePct: number | null
  fechaInicio: string | null
  fechaFinPlan: string | null
}

export interface CertificadoPortal {
  id: string
  numero: string
  factura: string | null
  obraId: string | null
  periodoDesde: string | null
  periodoHasta: string | null
  avancePeriodo: number | null
  monto: number | null
  reparo: number | null
  emitidoAt: string | null
  vence: string | null
  estado: EstadoCertificado
  observacion: string | null
  detalleRubros: unknown
}

export interface PagoPortal {
  id: string
  concepto: string
  fecha: string | null
  monto: number | null
  estado: EstadoPago
  medio: MedioPago | null
  reprogramaciones: unknown
}

export interface DocumentoPortal {
  id: string
  nombre: string
  tipo: string | null
  obraId: string | null
  subidoAt: string | null
  url: string | null
}

/** Toda action del portal devuelve esto. `error` en castellano y mirable por una persona. */
export interface Resultado<T = undefined> {
  ok: boolean
  error?: string
  dato?: T
}
