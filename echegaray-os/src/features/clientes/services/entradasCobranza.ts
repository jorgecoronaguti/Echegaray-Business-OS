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
