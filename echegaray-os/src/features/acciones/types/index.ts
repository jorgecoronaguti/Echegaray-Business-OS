import { z } from 'zod'
import type { AreaOS } from '@/features/areas/types'
import type { AlertaDashboardBase, CategoriaAlerta, SeveridadAlerta } from '@/features/dashboard/types'
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
  resultado_real: string | null
  aprendizaje_asociado: string | null
  bloqueada: boolean
  motivo_bloqueo: string | null
  evidencia: string | null
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
    resultado_real: z.string().trim().min(1).optional(),
    aprendizaje_asociado: z.string().trim().min(1).optional(),
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

// Bloqueo (Sección 4, ciclo "operabilidad real") — una acción bloqueada sigue activa
// (no es un estado más) pero necesita visibilidad propia: "sin responsable" y
// "bloqueada" son las dos preguntas reales que Dirección hace en la revisión diaria.
export const bloqueoAccionInputSchema = z.object({
  bloqueada: z.coerce.boolean(),
  motivo_bloqueo: z.string().trim().min(1).optional(),
  evidencia: z.string().trim().min(1).optional(),
})
export type BloqueoAccionInput = z.infer<typeof bloqueoAccionInputSchema>

// Construye los campos a insertar para "convertir" una alerta ya calculada en una
// Acción trazable — copia el contenido una sola vez, no recalcula nada.
export function accionDesdeAlerta(alerta: AlertaDashboardBase) {
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

// Centro de Acción 2.0 — escalamiento por antigüedad. Días de atraso: cuánto pasó
// desde fecha_limite sin resolver, solo para acciones activas (pendiente/en_curso).
export function calcularDiasAtraso(accion: Accion, hoy: Date = new Date()): number | null {
  if (!accion.fecha_limite) return null
  if (accion.estado !== 'pendiente' && accion.estado !== 'en_curso') return null
  const limite = new Date(accion.fecha_limite + 'T00:00:00Z')
  const dias = Math.floor((hoy.getTime() - limite.getTime()) / (1000 * 60 * 60 * 24))
  return dias > 0 ? dias : null
}

const ORDEN_SEVERIDAD_ESCALADA: SeveridadAlerta[] = ['informativa', 'media', 'alta', 'critica']

// Escalamiento automático: una acción vencida sube de severidad cuanto más tiempo
// sigue sin resolverse -- una excepción ignorada no debe quedar invisible.
const UMBRAL_DIAS_ESCALAMIENTO_1 = 3
const UMBRAL_DIAS_ESCALAMIENTO_2 = 7

export function calcularSeveridadEscalada(accion: Accion, hoy: Date = new Date()): SeveridadAlerta | null {
  const diasAtraso = calcularDiasAtraso(accion, hoy)
  if (diasAtraso == null || !accion.severidad) return accion.severidad
  const indiceActual = ORDEN_SEVERIDAD_ESCALADA.indexOf(accion.severidad)
  const escalones = diasAtraso >= UMBRAL_DIAS_ESCALAMIENTO_2 ? 2 : diasAtraso >= UMBRAL_DIAS_ESCALAMIENTO_1 ? 1 : 0
  const indiceEscalado = Math.min(indiceActual + escalones, ORDEN_SEVERIDAD_ESCALADA.length - 1)
  return ORDEN_SEVERIDAD_ESCALADA[indiceEscalado]
}

// Vista de Dirección: 5 buckets, no un sexto sistema -- solo una forma de mirar las
// mismas acciones ya existentes. "Decidir hoy" y "acción vencida" priorizan sobre
// "riesgo abierto" (severidad alta/crítica pero sin fecha límite todavía).
export type BucketDireccion = 'decidir_hoy' | 'riesgo_abierto' | 'accion_vencida' | 'seguimiento' | 'aprendizaje_pendiente'

export function clasificarParaDireccion(accion: Accion, hoy: Date = new Date()): BucketDireccion {
  if (accion.estado === 'resuelta' && !accion.aprendizaje_asociado) return 'aprendizaje_pendiente'
  if (accion.estado === 'resuelta' || accion.estado === 'descartada') return 'seguimiento'
  const diasAtraso = calcularDiasAtraso(accion, hoy)
  if (diasAtraso != null) return 'accion_vencida'
  if (accion.estado === 'en_curso') return 'seguimiento'
  if (accion.severidad === 'critica' || accion.severidad === 'alta') return 'decidir_hoy'
  return 'riesgo_abierto'
}
