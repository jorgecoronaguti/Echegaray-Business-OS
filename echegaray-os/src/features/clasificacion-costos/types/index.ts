import { z } from 'zod'
import type { NaturalezaDato } from '@/shared/types/datoTrazado'
import type { Obra } from '@/features/obras/types'

// Cola de clasificación de costo por obra (Sección 10, ciclo "operabilidad real").
// Nace del gap real encontrado en Pisos: un cliente con más de una obra concurrente
// genera gasto que la fuente de origen no tagea por obra. En vez de esperar
// pasivamente a que alguien lo resuelva a mano, el OS sugiere una obra candidata con
// una regla simple y declarada, pide confirmación humana cuando la confianza no
// alcanza, y aprende de las confirmaciones ya hechas (mismo proveedor -> misma obra).
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260709_clasificacion_costo_obra.sql

export type EstadoClasificacion = 'pendiente' | 'confirmado' | 'sin_obra_aplicable' | 'descartado'

export interface ClasificacionCostoObra {
  id: string
  fuente_legacy: string
  referencia_externa: string | null
  concepto: string
  monto: number
  fecha: string
  proveedor_id: string | null
  cliente_id: string | null
  obra_sugerida_id: string | null
  confianza_sugerencia: NaturalezaDato
  regla_aplicada: string
  estado: EstadoClasificacion
  obra_confirmada_id: string | null
  costo_real_id: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export const confirmarClasificacionInputSchema = z.object({
  clasificacion_id: z.string().uuid(),
  obra_id: z.string().uuid('Elegí una obra'),
})
export type ConfirmarClasificacionInput = z.infer<typeof confirmarClasificacionInputSchema>

// Margen de tolerancia sobre fecha_inicio/fecha_fin_objetivo declaradas: el caso real
// de Pisos mostró que la fecha declarada puede estar unos días desalineada respecto al
// primer gasto real -- no se descarta la obra por unos días de diferencia, pero
// tampoco se estira el margen tanto que dos obras del mismo cliente se solapen
// siempre. Decisión de negocio abierta (ajustable si el patrón real lo pide).
export const MARGEN_DIAS_VENTANA_OBRA = 30

interface ObraConHistorial {
  obra: Obra
}

export interface SugerenciaClasificacion {
  obraSugeridaId: string | null
  confianza: NaturalezaDato
  reglaAplicada: string
}

// Aprendizaje mínimo: si ya existe una clasificación CONFIRMADA para el mismo
// proveedor+cliente, esa obra pesa más que la ventana de fechas -- un proveedor no
// cambia de obra al azar entre confirmaciones.
export function sugerirObraParaGasto(datos: {
  clienteId: string | null
  proveedorId: string | null
  fecha: string
  obrasDelCliente: ObraConHistorial[]
  confirmacionesPrevias: ClasificacionCostoObra[]
}): SugerenciaClasificacion {
  const { clienteId, proveedorId, fecha, obrasDelCliente, confirmacionesPrevias } = datos

  if (obrasDelCliente.length === 0) {
    return { obraSugeridaId: null, confianza: 'sin_dato', reglaAplicada: 'Cliente sin obras registradas -- no hay candidata posible.' }
  }

  if (obrasDelCliente.length === 1) {
    return {
      obraSugeridaId: obrasDelCliente[0].obra.id,
      confianza: 'calculado',
      reglaAplicada: 'Único cliente-obra: el cliente de este gasto tiene una sola obra registrada.',
    }
  }

  if (proveedorId) {
    const confirmadasProveedor = confirmacionesPrevias.filter(
      (c) => c.estado === 'confirmado' && c.proveedor_id === proveedorId && c.cliente_id === clienteId
    )
    const obrasDistintas = new Set(confirmadasProveedor.map((c) => c.obra_confirmada_id))
    if (obrasDistintas.size === 1) {
      return {
        obraSugeridaId: confirmadasProveedor[0].obra_confirmada_id,
        confianza: 'calculado',
        reglaAplicada: `Aprendizaje: este proveedor ya fue confirmado ${confirmadasProveedor.length} vez/veces para la misma obra en gastos anteriores.`,
      }
    }
  }

  const fechaGasto = new Date(fecha + 'T00:00:00Z').getTime()
  const margenMs = MARGEN_DIAS_VENTANA_OBRA * 24 * 60 * 60 * 1000
  const candidatasPorFecha = obrasDelCliente.filter(({ obra }) => {
    const inicio = new Date(obra.fecha_inicio + 'T00:00:00Z').getTime() - margenMs
    const fin = new Date(obra.fecha_fin_objetivo + 'T00:00:00Z').getTime() + margenMs
    return fechaGasto >= inicio && fechaGasto <= fin
  })

  if (candidatasPorFecha.length === 1) {
    return {
      obraSugeridaId: candidatasPorFecha[0].obra.id,
      confianza: 'estimado',
      reglaAplicada: `Ventana de fechas: la fecha del gasto cae dentro del rango declarado de "${candidatasPorFecha[0].obra.nombre}" (± ${MARGEN_DIAS_VENTANA_OBRA} días de margen) y de ninguna otra obra del mismo cliente.`,
    }
  }

  return {
    obraSugeridaId: null,
    confianza: 'sin_dato',
    reglaAplicada:
      candidatasPorFecha.length > 1
        ? 'La fecha del gasto cae dentro del rango declarado de más de una obra del mismo cliente -- no se fuerza una elección.'
        : 'La fecha del gasto no cae dentro del rango declarado de ninguna obra del cliente (ni con margen) -- no se fuerza una elección.',
  }
}
