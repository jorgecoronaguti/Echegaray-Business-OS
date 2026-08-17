// CLIENTE — la entidad de arriba del módulo 01.
//
// FRONTERA, la misma que la de Obras: el cliente NO administra Cobranzas, Certificación ni
// Contabilidad. Consolida lo que otras fuentes ya calculan —el costo y el contratado vienen sumados
// de `obra_panel`— y no guarda ni un número propio. Por eso `cliente_panel` no tiene un avance de
// cliente: promediar obras de tamaños distintos daría un número que no significa nada.
//
// Y NO ES UN CRM. No hay leads, ni oportunidades, ni etapas de venta: son los clientes reales de la
// empresa, con sus obras, sus contactos y sus documentos de Drive.

export interface ClientePanel {
  cliente_id: string
  /** El identificador legible y estable; es el que va en la URL. */
  slug: string | null
  nombre: string
  cuit: string | null
  drive_carpeta_id: string | null
  activo: boolean
  notas: string | null
  n_obras: number
  n_obras_activas: number
  /** Suma de lo contratado de sus obras. Null mientras ninguna lo tenga cargado. */
  contratado: number | null
  costo_real: number | null
  restricciones_abiertas: number
  avance_sincronizado_en: string | null
  n_contactos: number
  n_documentos: number
}

export interface Contacto {
  id: string
  cliente_id: string
  nombre: string
  rol: string | null
  email: string | null
  telefono: string | null
  notas: string | null
}

/** Un archivo de Drive vinculado al cliente. El archivo NO se copia: vive en Drive. */
export interface DocumentoCliente {
  drive_file_id: string
  rol: string | null
  /** `path_inferido` = lo colgó el sincronizador por la carpeta. `manual` = lo puso una persona. */
  origen: 'manual' | 'path_inferido'
  name: string | null
  path: string | null
  mime_type: string | null
  modified_time: string | null
}
