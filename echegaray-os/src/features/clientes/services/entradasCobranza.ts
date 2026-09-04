// LO QUE LA PANTALLA LE MANDA AL SERVIDOR, VALIDADO ANTES DE SALIR DEL CONTRATO.
//
// ═══ POR QUÉ LAS ENTRADAS VIVEN APARTE DE LAS ACCIONES ═══
//
// Un archivo `'use server'` sólo puede exportar funciones asíncronas: un esquema de Zod exportado
// desde ahí no compila. Y estas formas las necesitan los DOS lados — la pantalla, para no ofrecer
// un botón que el servidor va a rechazar, y la acción, para no escribir basura.
//
// ═══ POR QUÉ SE VALIDA TAN TEMPRANO ═══
//
// El destino final de un cambio de fecha de este módulo NO es una tabla: es la columna Q de la
// pestaña Cobranzas del Sheet «Flujo de Caja - Cash Flow», por cola y worker. Una fecha mal
// formada no se rechaza allá — se escribe, y el Sheet la interpreta como puede. Ya pasó con el
// parser de `dd/mm/yy` que vaciaba celdas. Acá se para antes.

import { z } from 'zod'

/** ¿Existe ese día? `2026-02-30` matchea la expresión regular y no es una fecha. */
function esFechaReal(v: string): boolean {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export const fechaISO = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD')
  .refine(esFechaReal, 'Esa fecha no existe en el calendario')

/**
 * UN MONTO ESCRITO POR UNA PERSONA, EN ARGENTINO.
 *
 * `3.100.000` es tres millones cien mil, NO 3,1 — y `parseFloat` contesta 3. Es el error que ya
 * costó plata en el bot de comprobantes (el punto de miles leído como decimal), y acá el número
 * termina en la fila de una cobranza.
 *
 * La regla: si hay coma, la coma decide los decimales y los puntos son miles. Si sólo hay puntos,
 * son miles salvo que el último grupo no tenga tres dígitos (`1.5` es uno coma cinco).
 */
export function aMonto(texto: string): number | null {
  const v = texto.replace(/\s|\$/g, '').trim()
  if (v === '') return null
  let normalizado: string
  if (v.includes(',')) {
    normalizado = v.replace(/\./g, '').replace(',', '.')
  } else {
    const grupos = v.split('.')
    normalizado = grupos.length > 1 && grupos[grupos.length - 1].length === 3
      ? grupos.join('')
      : v
  }
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

/** El campo de monto de un formulario: texto en argentino → número positivo. */
export const montoEscrito = z.string()
  .transform((v) => aMonto(v))
  .refine((n): n is number => n != null && n > 0, 'El monto tiene que ser un número mayor que cero')

export const MEDIOS = ['transferencia', 'cheque', 'efectivo'] as const
export const medioPago = z.enum(MEDIOS)

/** «Registrar cobro» (28). La fecha es la que va a la columna Q; el medio, a la N. */
export const cobroSchema = z.object({
  fecha: fechaISO,
  monto: montoEscrito,
  medio: medioPago,
  referencia: z.string().trim().max(120).optional(),
})
export type Cobro = z.infer<typeof cobroSchema>

/**
 * UN CAMBIO SOBRE UN PAGO DEL ESQUEMA (32). Es parcial a propósito: la pantalla toca de a un
 * campo —arrastra una fecha, apaga un interruptor— y mandar el objeto entero cada vez pisaría lo
 * que otro acababa de cambiar.
 */
export const cambioPagoSchema = z.object({
  fecha: fechaISO,
  monto: z.number().positive(),
  medio: medioPago.nullable(),
  visible_portal: z.boolean(),
  aviso_dias: z.number().int().min(0).max(60).nullable(),
  mostrar_reprogramaciones: z.boolean(),
  nota_interna: z.string().max(1000).nullable(),
  /**
   * POR QUÉ SE MOVIÓ LA FECHA. Viaja junto al cambio de fecha y NO es un campo de la fila: se
   * apila en el historial `reprogramaciones`.
   *
   * Es OPCIONAL a propósito. Exigirlo haría que la única forma de mover una fecha fuera escribir
   * una justificación, y el resultado conocido de eso son motivos de relleno («ajuste», «ok») que
   * ensucian la evidencia. Sin motivo se guarda igual y la pantalla lo pide en ámbar.
   */
  motivo_reprogramacion: z.string().trim().max(300).nullable(),
}).partial().refine(
  (o) => Object.keys(o).length > 0,
  'No hay nada que cambiar',
)
export type CambioPago = z.infer<typeof cambioPagoSchema>

/** «Agregar mail al portal» (31). Los permisos llegan ya pasados por `permisosCoherentes`; el
 *  servidor los vuelve a normalizar igual, porque esta forma no puede impedir un `curl`. */
export const accesoSchema = z.object({
  email: z.string().trim().toLowerCase().email('Revisá el mail: no tiene formato de correo'),
  persona_contacto: z.string().trim().max(120).optional(),
  puede_ver_obra: z.boolean(),
  puede_ver_montos: z.boolean(),
  puede_aprobar: z.boolean(),
  /** `null` = todas las obras, incluidas las futuras. Lista vacía sería «ninguna». */
  obras: z.array(z.string().uuid()).nullable(),
  avisar_por_mail: z.boolean(),
})
export type AltaAcceso = z.infer<typeof accesoSchema>

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS FORMAS QUE RECIBEN LAS SERVER ACTIONS DE 28 · 31 · 32
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ POR QUÉ NO ALCANZA CON `entrada: unknown` ═══
//
// Las acciones parsean su entrada con Zod, así que `unknown` parecía suficiente: total, lo que no
// coincide rebota. AL INTEGRAR LOS TRES FRENTES ESO FALLÓ, y falló callado. La pantalla llamaba
// `habilitarAcceso(clienteId, entrada)` a una acción de UN parámetro —el `clienteId` entraba como
// la entrada entera— y `revocarAcceso(id)` a una que espera `{ accesoId }`. Las dos COMPILAN:
// TypeScript deja pasar argumentos de más y `unknown` acepta cualquier cosa. El error recién
// aparecía apretando el botón, con un «Datos inválidos» que no dice qué está mal.
//
// Con estos tipos, la misma equivocación es un error de compilación. El `safeParse` de adentro se
// queda igual y no es redundante: el tipo protege del error de programación, el parse protege del
// `curl`, y entre la pantalla y la acción hay una red.

/** `registrarCobro` (28). La fila y la huella las lee el servidor: no viajan desde el navegador. */
export type EntradaCobro = {
  cobranzaFila: number
  esquemaPagoId?: string | null
  fecha: string
  medio?: 'transferencia' | 'cheque' | 'efectivo' | null
  huellaComprobante?: string | null
  huellaMonto?: number | null
}

/** `editarPago` (28/32): UN campo espejo del Sheet, con su valor anterior para dejarlo auditable. */
export type EntradaEdicionPago = {
  esquemaPagoId: string
  cobranzaFila: number | null
  campo: 'fecha' | 'monto' | 'medio'
  valorNuevo: string
  valorAnterior?: string | null
  huellaComprobante?: string | null
  huellaMonto?: number | null
  motivo?: string
}

/** `ajustarPagoEsquema` (32): sólo lo PROPIO de la app. `undefined` = la pantalla no lo tocó. */
export type EntradaAjustePago = {
  esquemaPagoId: string
  visiblePortal?: boolean
  avisoDias?: number | null
  mostrarReprogramaciones?: boolean
  notaInterna?: string | null
  orden?: number
}

/**
 * `habilitarAcceso` (31). EN CAMELCASE, y no es capricho: es el idioma de las actions de este
 * módulo. `accesoSchema` —el de la pantalla— usa snake_case porque nombra las columnas que dibuja.
 * Los dos existen y por eso el borde se declara: sin este tipo, un `puede_ver_montos` mandado a una
 * acción que espera `puedeVerMontos` se cae al default `false` y el acceso nace sin ver importes.
 */
export type EntradaAltaAcceso = {
  clienteId: string
  email: string
  personaContacto?: string
  puedeVerObra?: boolean
  puedeVerMontos?: boolean
  puedeAprobar?: boolean
  obras?: string[] | null
  avisarPorMail?: boolean
}

/** `revocarAcceso` y `reenviarInvitacion` (31). */
export type EntradaAcceso = { accesoId: string }

/** `publicarEsquema` (32). */
export type EntradaPublicacion = { clienteId: string }
