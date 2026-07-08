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
