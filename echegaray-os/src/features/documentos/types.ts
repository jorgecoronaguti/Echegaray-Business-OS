// DOCUMENTOS — la vista transversal del archivo de la empresa.
//
// La fuente es `drive_index`: 3.593 filas (3.123 archivos + 470 carpetas, medido el 21/08/2026) que
// el indexador refresca cada 6 h. Las otras cinco tablas candidatas —`obra_documento`,
// `documento_presentacion`, `drive_documento_estado`— están VACÍAS, y `documentacion_legajo` (847) y
// `cliente_documento` (214) no son catálogos: son VÍNCULOS de un archivo de Drive con una entidad.
// Por eso acá el archivo es la fila y el vínculo es una columna, y no al revés.

// ═══ `obra_documento` DEJÓ DE ESTAR VACÍA (medido el 24/08/2026) ═══
//
// El comentario de arriba se escribió el 21/08 con la tabla en 0 filas, y por eso la vista
// transversal ignoraba las obras: no había nada que mostrar. Vuelto a medir contra la base real:
// `drive_index` 3.599 · `documentacion_legajo` 847 · `cliente_documento` 214 · `obra_documento` 32.
// Un vínculo que existe y la pantalla no lee es peor que uno que no existe: quien filtra «de obras»
// concluye que la obra no tiene papeles.
export type ClaseVinculo = 'persona' | 'cliente' | 'obra'

export interface Vinculo {
  clase: ClaseVinculo
  nombre: string
  /** El tipo de documento del legajo, el rol del documento del cliente o de la obra. `null` = sin
   *  clasificar. */
  detalle: string | null
  href: string | null
  /**
   * El id de la fila de `documentacion_legajo`. Es la ÚNICA de las dos tablas de vínculo que tiene
   * `fecha_vencimiento`, así que también es lo único sobre lo que se puede fijar un vencimiento.
   * `null` en el vínculo de cliente, y la ausencia se explica en el panel en vez de esconderse.
   */
  legajoId: string | null
}

export interface Documento {
  drive_file_id: string
  name: string
  path: string | null
  tipo: string | null
  mime_type: string | null
  size_bytes: number | null
  modified_time: string | null
  /** El nombre como lo normalizó el indexador. Es lo que clasifica al archivo — ver `categorias.ts`. */
  nombre_norm: string | null
  /** Todos los vínculos conocidos. Un mismo archivo puede colgar de una persona y de un cliente. */
  vinculos: Vinculo[]
  /** Sólo lo trae `documentacion_legajo`. Hoy es `null` en las 847 filas: nadie lo cargó todavía. */
  vence: string | null
  /**
   * EL INDEXADOR NO LO VIO EN LA ÚLTIMA CORRIDA QUE PUDO LISTAR ENTERA SU CARPETA.
   *
   * Desde el 10/09/2026 el índice NO borra lo que deja de ver: marca. La fila sigue acá con su
   * ruta y sus vínculos, y la pantalla lo dice — un archivo que desaparece de la lista sin
   * explicación es indistinguible de un archivo que nunca existió.
   */
  ausente_en_drive: boolean
  /** Está en la papelera de Drive. Es un hecho DISTINTO de la ausencia: existe, se puede
   *  recuperar, y por eso se muestra con su marca en vez de esconderse. */
  trashed: boolean
  /** El enlace que Drive dice que abre este archivo. `null` en las filas indexadas antes de que
   *  la columna existiera: ahí se deriva del id, como se hacía siempre. */
  web_view_link: string | null
}

/** Una carpeta raíz de Drive, tal como la indexó el catálogo. No es una taxonomía inventada. */
export interface CarpetaRaiz {
  path: string
  name: string
}

export type EstadoVigencia = 'vencido' | 'vence-pronto' | 'vigente'
