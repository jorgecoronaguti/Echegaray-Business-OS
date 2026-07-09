import { z } from 'zod'

// Equipos y Vehículos (0/10 en el scorecard antes de esta ola). Primer dato real
// estructurado, sembrado desde la carpeta VEHICULOS de Drive -- ver fuentes_datos.
// No fabrica utilización ni costo: eso requiere el próximo incremento de este dominio.
export type TipoEquipo = 'vehiculo' | 'maquinaria' | 'herramienta_mayor'

export interface Equipo {
  id: string
  nombre: string
  tipo: TipoEquipo
  patente_o_identificador: string | null
  fuente_legacy: string
  notas: string | null
  created_at: string
  updated_at: string
}

export const TIPO_EQUIPO_LABEL: Record<TipoEquipo, string> = {
  vehiculo: 'Vehículo',
  maquinaria: 'Maquinaria',
  herramienta_mayor: 'Herramienta mayor',
}

// Alta nativa (2026-07-09) -- reemplaza el alta manual vía Drive/carga directa en
// Supabase; Operaciones (jefe_obra) es quien gestiona equipos en el día a día.
export const equipoInputSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  tipo: z.enum(['vehiculo', 'maquinaria', 'herramienta_mayor'], { message: 'Tipo inválido' }),
  patente_o_identificador: z.string().trim().min(1).optional(),
  notas: z.string().trim().min(1).optional(),
})
export type EquipoInput = z.infer<typeof equipoInputSchema>
