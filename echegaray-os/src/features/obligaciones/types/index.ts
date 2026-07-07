import { z } from 'zod'

// Obligación — compromiso financiero exigible (total o parcialmente pendiente),
// distinto de Compra (proceso comercial, PRP-009) y de Costo Real (impacto
// económico/devengado, PRP-004). Sirve también como unidad de cuota/vencimiento:
// una obligación en 3 cuotas se modela como 3 filas compartiendo compra_id/
// costo_real_id, cada una con su propio monto y vencimiento (PRP-010).
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260707121612_obligaciones_medios_pago.sql

export interface Obligacion {
  id: string
  obra_id: string | null
  proveedor_id: string | null
  compra_id: string | null
  costo_real_id: string | null
  concepto: string
  monto_total: number
  fecha_origen: string
  fecha_vencimiento: string | null
  fuente_legacy: string
  notas: string | null
  created_at: string
  updated_at: string
}

export const obligacionInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida').optional(),
  proveedor_id: z.string().uuid('Proveedor inválido').optional(),
  compra_id: z.string().uuid('Compra inválida').optional(),
  costo_real_id: z.string().uuid('Costo real inválido').optional(),
  concepto: z.string().trim().min(1, 'El concepto es obligatorio'),
  monto_total: z.coerce.number().positive('El monto total debe ser mayor a 0'),
  fecha_origen: z.string().min(1, 'La fecha de origen es obligatoria'),
  fecha_vencimiento: z.string().trim().min(1).optional(),
  fuente_legacy: z.string().trim().min(1, 'Indicá de qué fuente viene (ej. manual, saldo_inicial_legacy)'),
  notas: z.string().trim().min(1).optional(),
})
export type ObligacionInput = z.infer<typeof obligacionInputSchema>

// Registrar una aplicación de pago: vincula un movimiento_caja (tipo pago) existente
// contra una obligación, por el monto que corresponda (parcial o total). La base
// rechaza (trigger) exceder el monto de la obligación o el del propio pago.
export const aplicacionPagoInputSchema = z.object({
  obligacion_id: z.string().uuid('Obligación inválida'),
  movimiento_caja_id: z.string().uuid('Elegí un pago'),
  monto_aplicado: z.coerce.number().positive('El monto aplicado debe ser mayor a 0'),
  notas: z.string().trim().min(1).optional(),
})
export type AplicacionPagoInput = z.infer<typeof aplicacionPagoInputSchema>

// Fila de la vista obligacion_resumen — saldo pendiente agregado desde
// aplicaciones_pago.
export interface ObligacionResumen {
  obligacion_id: string
  obra_id: string | null
  proveedor_id: string | null
  compra_id: string | null
  costo_real_id: string | null
  concepto: string
  monto_total: number
  fecha_origen: string
  fecha_vencimiento: string | null
  monto_pagado: number
  saldo_pendiente: number
  cantidad_aplicaciones: number
}

export type TipoAlertaObligacion =
  | 'vencida'
  | 'proxima_a_vencer'
  | 'parcialmente_pagada'
  | 'sin_vencimiento'
  | 'sin_trazabilidad'

export interface AlertaObligacion {
  tipo: TipoAlertaObligacion
  mensaje: string
}

// Umbrales propuestos, no validados con el usuario todavía — mismo criterio abierto
// que el resto de las capacidades (Control Económico, HH, Compras).
export const UMBRAL_DIAS_PROXIMO_VENCIMIENTO = 7
export const UMBRAL_CONCENTRACION_VENCIMIENTOS = 3

export function calcularAlertasObligacion(r: ObligacionResumen, hoy: Date = new Date()): AlertaObligacion[] {
  const alertas: AlertaObligacion[] = []

  if (r.saldo_pendiente > 0) {
    if (r.fecha_vencimiento) {
      const vencimiento = new Date(r.fecha_vencimiento)
      const diasParaVencer = (vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
      if (diasParaVencer < 0) {
        alertas.push({ tipo: 'vencida', mensaje: `Vencida el ${r.fecha_vencimiento}, saldo pendiente $${r.saldo_pendiente}` })
      } else if (diasParaVencer <= UMBRAL_DIAS_PROXIMO_VENCIMIENTO) {
        alertas.push({ tipo: 'proxima_a_vencer', mensaje: `Vence el ${r.fecha_vencimiento} (en ${Math.ceil(diasParaVencer)} días)` })
      }
    } else {
      alertas.push({ tipo: 'sin_vencimiento', mensaje: 'Sin fecha de vencimiento registrada' })
    }

    if (r.monto_pagado > 0) {
      alertas.push({ tipo: 'parcialmente_pagada', mensaje: `Pagado $${r.monto_pagado} de $${r.monto_total}, saldo $${r.saldo_pendiente}` })
    }
  }

  if (!r.compra_id && !r.costo_real_id && !r.proveedor_id) {
    alertas.push({ tipo: 'sin_trazabilidad', mensaje: 'Sin vínculo a Compra, Costo Real ni Proveedor' })
  }

  return alertas
}

export type TipoAlertaGeneral = 'concentracion_vencimientos' | 'tension_liquidez'

export interface AlertaGeneralObligaciones {
  tipo: TipoAlertaGeneral
  mensaje: string
}

// Concentración de vencimientos: cuántas obligaciones con saldo pendiente vencen en
// la ventana próxima (mismo umbral que la alerta individual, para consistencia).
export function calcularAlertasGeneralesObligaciones(
  resumenes: ObligacionResumen[],
  hoy: Date = new Date()
): AlertaGeneralObligaciones[] {
  const alertas: AlertaGeneralObligaciones[] = []

  const proximasAVencer = resumenes.filter((r) => {
    if (r.saldo_pendiente <= 0 || !r.fecha_vencimiento) return false
    const dias = (new Date(r.fecha_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
    return dias >= 0 && dias <= UMBRAL_DIAS_PROXIMO_VENCIMIENTO
  })

  if (proximasAVencer.length >= UMBRAL_CONCENTRACION_VENCIMIENTOS) {
    const total = proximasAVencer.reduce((acc, r) => acc + r.saldo_pendiente, 0)
    alertas.push({
      tipo: 'concentracion_vencimientos',
      mensaje: `${proximasAVencer.length} obligaciones (＄${total}) vencen en los próximos ${UMBRAL_DIAS_PROXIMO_VENCIMIENTO} días`,
    })
  }

  return alertas
}

// Tensión de liquidez: compara obligaciones con saldo pendiente que vencen en la
// ventana próxima contra cobros proyectados en la misma ventana. Solo se afirma si
// existen datos de ambos lados — no se inventa una posición de caja completa (eso
// requeriría saldo inicial de cuentas, fuera de esta capacidad).
export function calcularTensionLiquidez(
  resumenes: ObligacionResumen[],
  cobrosProyectadosEnVentana: number,
  hoy: Date = new Date()
): AlertaGeneralObligaciones[] {
  const obligacionesEnVentana = resumenes
    .filter((r) => {
      if (r.saldo_pendiente <= 0 || !r.fecha_vencimiento) return false
      const dias = (new Date(r.fecha_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
      return dias >= 0 && dias <= UMBRAL_DIAS_PROXIMO_VENCIMIENTO
    })
    .reduce((acc, r) => acc + r.saldo_pendiente, 0)

  if (obligacionesEnVentana > cobrosProyectadosEnVentana) {
    return [
      {
        tipo: 'tension_liquidez',
        mensaje: `Obligaciones por $${obligacionesEnVentana} vencen en ${UMBRAL_DIAS_PROXIMO_VENCIMIENTO} días, contra $${cobrosProyectadosEnVentana} de cobros proyectados en la misma ventana`,
      },
    ]
  }
  return []
}
