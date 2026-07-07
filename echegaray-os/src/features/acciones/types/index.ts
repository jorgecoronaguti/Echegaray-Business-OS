import { z } from 'zod'
import type { AreaOS } from '@/features/areas/types'
import type { AlertaDashboard, CategoriaAlerta, SeveridadAlerta } from '@/features/dashboard/types'
import { AREA_POR_CATEGORIA } from '@/features/areas/types'

// Acción — unidad de seguimiento del Centro de Acción (Fase II). No duplica ninguna
// alerta: una Acción de origen 'sistema' referencia una alerta ya calculada por su
// capacidad de origen vía `alerta_origen_id` (el `id` estable de AlertaDashboard,
// ej. "ob-vencida-<uuid>") solo para trazabilidad y para evitar crear duplicados —
// el contenido descriptivo (título/causa/monto/etc.) se copia una única vez al crear
// la acción, igual que el patrón de snapshot congelado de Post Mortem (PRP-012):
// una acción resuelta debe seguir siendo legible aunque la alerta que la originó ya
// no exista más (ej. la obligación se pagó y la alerta desapareció de la lista viva).
// Ver supabase/migrations/20260707131807_acciones_centro_de_accion.sql

export type OrigenAccion = 'manual' | 'sistema'
export type EstadoAccion = 'pendiente' | 'en_curso' | 'resuelta' | 'descartada'

export interface Accion {
  id: string
  origen: OrigenAccion
  titulo: string
  causa: string | null
  area: AreaOS
  categoria_alerta: CategoriaAlerta | null
  alerta_origen_id: string | null
  severidad: SeveridadAlerta | null
  obra_id: string | null
  contraparte: string | null
  monto: number | null
  fecha_limite: string | null
  responsable: string | null
  estado: EstadoAccion
  resolucion_notas: string | null
  fecha_resolucion: string | null
  created_at: string
  updated_at: string
}

export const accionManualInputSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio'),
  area: z.enum([
    'direccion',
    'obras_produccion',
    'administracion_finanzas',
    'compras_abastecimiento',
    'personas_productividad',
    'comercial_presupuestacion',
  ]),
  obra_id: z.string().uuid('Obra inválida').optional(),
  contraparte: z.string().trim().min(1).optional(),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0').optional(),
  fecha_limite: z.string().trim().min(1).optional(),
  responsable: z.string().trim().min(1).optional(),
})
export type AccionManualInput = z.infer<typeof accionManualInputSchema>

// Cambio de estado: si pasa a resuelta/descartada, la fecha de resolución es
// obligatoria (mismo CHECK que la base — se valida acá para no depender solo de que
// la base rechace, y poder mostrar un mensaje claro).
export const cambiarEstadoAccionInputSchema = z
  .object({
    estado: z.enum(['pendiente', 'en_curso', 'resuelta', 'descartada']),
    resolucion_notas: z.string().trim().min(1).optional(),
    fecha_resolucion: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.estado === 'resuelta' || data.estado === 'descartada') && !data.fecha_resolucion) {
      ctx.addIssue({
        code: 'custom',
        message: 'La fecha de resolución es obligatoria para marcar la acción como resuelta o descartada',
        path: ['fecha_resolucion'],
      })
    }
  })
export type CambiarEstadoAccionInput = z.infer<typeof cambiarEstadoAccionInputSchema>

// Construye los campos a insertar para "convertir" una alerta ya calculada en una
// Acción trazable — copia el contenido una sola vez, no recalcula nada.
export function accionDesdeAlerta(alerta: AlertaDashboard) {
  return {
    origen: 'sistema' as const,
    titulo: alerta.titulo,
    causa: alerta.causa,
    area: AREA_POR_CATEGORIA[alerta.categoria],
    categoria_alerta: alerta.categoria,
    alerta_origen_id: alerta.id,
    severidad: alerta.severidad,
    obra_id: alerta.obraId,
    contraparte: alerta.contraparte,
    monto: alerta.monto,
    fecha_limite: alerta.fechaCritica,
  }
}

export const ESTADO_ACCION_LABEL: Record<EstadoAccion, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  resuelta: 'Resuelta',
  descartada: 'Descartada',
}
