// Personas / Laboral / Seguridad e Higiene (0-1/10 antes de esta ola). Primer dato
// real estructurado, sembrado desde la carpeta "ALTAS - BAJAS - HM - EPP - DNI" de
// Drive -- ver fuentes_datos. `personas` = identidad + relación laboral (evidencia
// real muestra 1 persona = 1 legajo en esta empresa, no se separan sin evidencia).
// `documentacion_legajo` es un concepto distinto -- qué documentos existen por
// persona -- y responde "qué falta", no "quién es esta persona". Asistencia/HH/costo
// laboral NO se duplican acá: siguen viviendo en registros_hh/JORNALES.
export interface Persona {
  id: string
  nombre_completo: string
  dni: string | null
  cuil: string | null
  fecha_nacimiento: string | null
  nacionalidad: string | null
  fecha_ingreso: string | null
  fecha_egreso: string | null
  categoria: string | null
  especialidad: string | null
  art: string | null
  obra_social: string | null
  convenio_colectivo: string | null
  retribucion_pactada: number | null
  modalidad_liquidacion: string | null
  drive_folder_id: string | null
  documentacion_relevada: boolean
  notas: string | null
}

export type TipoDocumentoLegajo = 'alta_afip' | 'fondo_cese_hm' | 'dni_escaneado' | 'baja' | 'epp'

export interface DocumentacionLegajo {
  id: string
  persona_id: string
  tipo_documento: TipoDocumentoLegajo
  presente: boolean
  drive_file_id: string | null
  fecha_documento: string | null
  notas: string | null
}

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumentoLegajo, string> = {
  alta_afip: 'Alta AFIP',
  fondo_cese_hm: 'Fondo de Cese (HM)',
  dni_escaneado: 'DNI escaneado',
  baja: 'Baja',
  epp: 'Entrega de EPP',
}

export function personaActiva(p: Persona): boolean {
  return p.fecha_egreso === null
}

export function documentosFaltantes(persona: Persona, docs: DocumentacionLegajo[]): TipoDocumentoLegajo[] {
  const propios = docs.filter((d) => d.persona_id === persona.id)
  return propios.filter((d) => !d.presente).map((d) => d.tipo_documento)
}

export function legajosNoRelevados(personas: Persona[]): Persona[] {
  return personas.filter((p) => !p.documentacion_relevada)
}
