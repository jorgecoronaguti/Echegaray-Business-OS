import { z } from 'zod'

// EL CRONOGRAMA QUE VE EL CLIENTE, EDITADO POR ADMINISTRACIÓN.
//
// ═══ POR QUÉ LA VALIDACIÓN VIVE ACÁ ═══
//
// Lo que se guarda en `pago_programado` sale publicado en el portal del cliente, sin nadie en el
// medio. Un monto con coma mal leída, una fecha de pago sin monto, un rótulo vacío: cada uno de esos
// llega tal cual a la pantalla de alguien de otra empresa. Se valida antes de escribir, con Zod, y se
// prueba acá para no depender de que la pantalla lo haga bien.
//
// NULL NUNCA ES CERO. Un campo vacío guarda `null` —«sin cargar»— y NO 0. Un certificado que todavía
// no se midió no vale cero pesos, y un 0 se suma a los totales del cliente.

export const TIPOS = ['anticipo', 'certificado', 'fondo_reparo', 'otro'] as const
export const MONEDAS = ['ARS', 'USD'] as const
export const ESTADOS = ['pagado', 'vencido', 'proximo', 'programado', 'sin_factura'] as const

/** Un texto de formulario: vacío es `null`, nunca cadena vacía. */
const textoOpcional = z.string().trim().transform((v) => (v === '' ? null : v)).nullable()

/**
 * El importe como lo tipea una persona: `1.234.567,89`, `1234567.89`, `$ 1.234.567`.
 *
 * El punto es SIEMPRE miles y la coma SIEMPRE decimal (es-AR). Aceptar el punto como decimal
 * convertiría «1.234.567» —un millón doscientos mil— en 1,23. Ya pasó en este repo con el banco.
 */
export function importe(crudo: unknown): number | null {
  const s = String(crudo ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export const filaSchema = z.object({
  id: z.string().uuid().nullable(),
  orden: z.coerce.number().int().min(1).max(999),
  tipo: z.enum(TIPOS),
  rotulo: z.string().trim().min(1, 'El cliente ve este texto: no puede quedar vacío').max(160),
  monto: z.unknown().transform(importe).refine((v) => v == null || v >= 0, 'Un pago no puede ser negativo'),
  moneda: z.enum(MONEDAS),
  fechaPrevista: textoOpcional,
  fechaPago: textoOpcional,
  facturaNumero: textoOpcional,
  reciboNumero: textoOpcional,
  estado: z.enum(ESTADOS).nullable(),
  nota: textoOpcional,
})
  // UN PAGO COBRADO SIN MONTO NO SE PUEDE CONCILIAR, y en el portal saldría «pagado · sin cargar».
  .refine((f) => !f.fechaPago || f.monto != null, {
    message: 'Si tiene fecha de pago tiene que tener monto', path: ['monto'],
  })
  // El recibo es el comprobante DE UN PAGO: sin pago no existe.
  .refine((f) => !f.reciboNumero || f.fechaPago, {
    message: 'Un recibo sin fecha de pago no tiene qué respaldar', path: ['reciboNumero'],
  })

export type FilaCronograma = z.infer<typeof filaSchema>

export const cronogramaSchema = z.object({
  obraId: z.string().uuid(),
  filas: z.array(filaSchema).max(200),
})
  // DOS FILAS CON EL MISMO ORDEN rompen la clave única de la tabla y, antes de eso, el orden en que
  // el cliente las lee.
  .refine((c) => new Set(c.filas.map((f) => f.orden)).size === c.filas.length, {
    message: 'Hay dos pagos con el mismo número de orden', path: ['filas'],
  })

/** Lo que el cliente vería si esto se guarda. Se muestra ANTES de guardar, no después. */
export function loQueVeElCliente(filas: FilaCronograma[]): { pagado: number; pendiente: number; sinSumar: number } {
  let pagado = 0, pendiente = 0, sinSumar = 0
  for (const f of filas) {
    if (f.moneda !== 'ARS' || f.monto == null) { sinSumar += 1; continue }
    if (f.fechaPago) pagado += f.monto
    else if (f.tipo !== 'fondo_reparo') pendiente += f.monto
  }
  return { pagado, pendiente, sinSumar }
}
