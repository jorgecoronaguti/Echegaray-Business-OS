// DOCUMENTOS — la vista transversal del archivo de la empresa.
//
// La fuente es `drive_index`: 3.593 filas (3.123 archivos + 470 carpetas, medido el 21/08/2026) que
// el indexador refresca cada 6 h. Las otras cinco tablas candidatas —`obra_documento`,
// `documento_presentacion`, `drive_documento_estado`— están VACÍAS, y `documentacion_legajo` (847) y
// `cliente_documento` (214) no son catálogos: son VÍNCULOS de un archivo de Drive con una entidad.
// Por eso acá el archivo es la fila y el vínculo es una columna, y no al revés.

export type ClaseVinculo = 'persona' | 'cliente'

export interface Vinculo {
  clase: ClaseVinculo
  nombre: string
  /** El tipo de documento del legajo, el rol del documento del cliente. `null` = sin clasificar. */
  detalle: string | null
  href: string | null
}

export interface Documento {
  drive_file_id: string
  name: string
  path: string | null
  tipo: string | null
  mime_type: string | null
  size_bytes: number | null
  modified_time: string | null
  /** Todos los vínculos conocidos. Un mismo archivo puede colgar de una persona y de un cliente. */
  vinculos: Vinculo[]
  /** Sólo lo trae `documentacion_legajo`. Hoy es `null` en las 847 filas: nadie lo cargó todavía. */
  vence: string | null
}

/** Una carpeta raíz de Drive, tal como la indexó el catálogo. No es una taxonomía inventada. */
export interface CarpetaRaiz {
  path: string
  name: string
}

export type EstadoVigencia = 'vencido' | 'vence-pronto' | 'vigente'
