// LA CARPETA DE DRIVE DE UNA ENTIDAD — una sola definición, y «no sé» como respuesta válida.
//
// ═══ POR QUÉ ESTO EXISTE ═══
//
// El dueño pidió tres veces que las carpetas de Drive se comuniquen con la plataforma. Antes de
// mover un archivo hay que poder contestar una pregunta que hoy nadie contesta igual dos veces:
// ¿CUÁL es la carpeta de esta obra / este cliente / esta persona / este proveedor? La respuesta
// estaba repartida en tres columnas distintas con tres nombres distintos, y para proveedores no
// estaba en ningún lado. Acá vive UNA vez.
//
// ═══ «CARPETA DESCONOCIDA» ES UN ESTADO, NO UN CERO ═══
//
// «Un control que no pudo mirar no dice "no está"». Una entidad sin carpeta declarada y una
// entidad con carpeta vacía se ven idénticas si las dos devuelven una lista vacía — y no son lo
// mismo: la primera es trabajo pendiente de alguien, la segunda es un hecho sobre Drive. Por eso
// `EstadoCarpeta` distingue cinco situaciones y ninguna de ellas es «0 archivos».
//
// La trampa que las obliga a estar separadas ya se pagó en este repo: UNA CARPETA EN LA PAPELERA
// SE LEE VACÍA Y SIN ERROR. Drive contesta 200 con cero hijos, el índice guarda cero hijos, y la
// ficha dibuja «sin archivos» sobre una obra que tiene treinta papeles adentro de una carpeta que
// alguien mandó a la papelera. Desde el H1 `drive_index` guarda `trashed` y `ausente_en_drive`
// justo para poder decirlo.
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No llama a Drive. La fuente del listado es `drive_index` —el catálogo que refresca el timer cada
// 6 h—, nunca la API en vivo: una ficha que consulta Drive al renderizar depende de un token que
// vive en la VM y no en Vercel, tarda segundos y se cae cuando Drive se cae.

/** Las cuatro caras que el puente atiende. El orden es el del pedido del dueño. */
export const TIPOS_ENTIDAD = ['persona', 'proveedor', 'obra', 'cliente'] as const
export type TipoEntidad = (typeof TIPOS_ENTIDAD)[number]

/**
 * DE DÓNDE SALE LA CARPETA DE CADA TIPO. Esta tabla es la definición: cualquier otra lectura del
 * mismo dato en la app tiene que pasar por acá o va a ser la segunda versión de la verdad.
 *
 * `obra` apunta a `obra_canonica` y NO a `obras`: las dos tienen una columna `drive_carpeta_id` y
 * las dos tienen filas, pero la ficha `/obras/[obra]` —la pantalla que el dueño abre— lee
 * `obra_canonica`, que es la que tiene las 26 obras con su slug. `obras` (10 filas, uuid) es la
 * cara de cobranzas. Que existan dos es un problema declarado, no algo que este archivo arregle.
 *
 * `persona` apunta a la VISTA `persona_legajo` y no a la tabla `personas`: la vista es la única
 * puerta por la que Administración llega al legajo, y es la que la ficha ya lee. Resolver contra la
 * tabla saltearía ese portero.
 *
 * `proveedor` no tiene columna y no es un olvido: EN DRIVE NO HAY CARPETAS DE PROVEEDOR. Lo que
 * hay es `Archivos GESTIÓN ECSAS/FACTURAS A` con los comprobantes sueltos y
 * `FACTURAS A/Facturas Emitidas - por Cliente/<CLIENTE>`, que son facturas EMITIDAS a clientes:
 * el sentido contrario. Dónde vive el papel de un proveedor es una decisión del dueño (PRP,
 * «Decisiones del dueño»), y hasta que la tome el estado correcto es `sin_declarar`.
 */
export const FUENTE_DE_CARPETA: Record<TipoEntidad, { tabla: string; columna: string } | null> = {
  persona: { tabla: 'persona_legajo', columna: 'drive_folder_id' },
  proveedor: null,
  obra: { tabla: 'obra_canonica', columna: 'drive_carpeta_id' },
  cliente: { tabla: 'clientes', columna: 'drive_carpeta_id' },
}

/** Cómo se nombra cada tipo cuando hay que escribirlo en la pantalla. */
export const NOMBRE_DE_TIPO: Record<TipoEntidad, string> = {
  persona: 'la persona', proveedor: 'el proveedor', obra: 'la obra', cliente: 'el cliente',
}

export type EstadoCarpeta =
  /** Nadie declaró la carpeta. Trabajo pendiente de una persona, no un hecho sobre Drive. */
  | 'sin_declarar'
  /** Hay id declarado, pero el catálogo no lo conoce: fuera de las raíces indexadas, o borrado. */
  | 'no_indexada'
  /** La carpeta existe y está EN LA PAPELERA. Se lee vacía sin error: hay que decirlo. */
  | 'en_papelera'
  /** El indexador no la vio en la última corrida que pudo listar entera su carpeta padre. */
  | 'ausente'
  /** Carpeta viva y en el índice. Recién acá una lista vacía significa «no hay archivos». */
  | 'ok'

/** La fila de `drive_index` que describe a la carpeta. Sólo lo que se mira acá. */
export interface FilaCarpeta {
  drive_file_id: string
  path: string | null
  is_folder: boolean | null
  trashed: boolean | null
  ausente_en_drive: boolean | null
  web_view_link: string | null
}

export interface Carpeta {
  estado: EstadoCarpeta
  drive_carpeta_id: string | null
  path: string | null
  web_view_link: string | null
  /** Qué columna de qué tabla lo dijo. `null` cuando nadie lo dijo. */
  fuente: string | null
}

/**
 * El estado de la carpeta de una entidad. Recibe lo ya leído; no consulta nada.
 *
 * EL ORDEN DE LOS CORTES IMPORTA. `en_papelera` se decide ANTES que `ausente` porque son dos
 * hechos distintos y el primero es accionable por quien mira («alguien la mandó a la papelera,
 * restaurala»); mezclarlos mandaría a buscar un archivo perdido cuando está a un clic.
 */
export function estadoDeCarpeta(
  tipo: TipoEntidad,
  driveCarpetaId: string | null | undefined,
  fila: FilaCarpeta | null | undefined,
): Carpeta {
  const f = FUENTE_DE_CARPETA[tipo]
  const fuente = f ? `${f.tabla}.${f.columna}` : null
  const id = (driveCarpetaId ?? '').trim() || null
  if (!id) return { estado: 'sin_declarar', drive_carpeta_id: null, path: null, web_view_link: null, fuente }
  const base = { drive_carpeta_id: id, path: fila?.path ?? null, web_view_link: fila?.web_view_link ?? null, fuente }
  if (!fila) return { ...base, estado: 'no_indexada' }
  if (fila.trashed) return { ...base, estado: 'en_papelera' }
  if (fila.ausente_en_drive) return { ...base, estado: 'ausente' }
  return { ...base, estado: 'ok' }
}

/** Si con este estado tiene sentido pedir los archivos. En los otros cuatro la lista vacía mentiría. */
export const puedeListar = (c: Carpeta): boolean => c.estado === 'ok'

/**
 * EL PATRÓN `LIKE` DE LOS DESCENDIENTES DE UNA CARPETA.
 *
 * Se cuelga del `path` y no del `parent_id` porque la descendencia por padre son N consultas
 * encadenadas —una por nivel— y el índice ya guarda la ruta entera armada por el mismo recorrido.
 *
 * `_` Y `%` SE ESCAPAN. En LIKE de Postgres `_` es «una letra cualquiera»: sin escapar, la carpeta
 * `SF_PISOS` traería también lo que cuelga de `SFXPISOS`, y nadie lo notaría hasta que un papel de
 * otra obra aparezca en una ficha. Hay 44 carpetas de cliente con nombres puestos a mano; que hoy
 * ninguna tenga guión bajo no es una garantía sobre la que se pueda construir.
 */
export function patronDeDescendencia(path: string): string {
  const escapado = path.replace(/([\\%_])/g, '\\$1')
  return `${escapado}/%`
}

/** Un archivo del índice, tal como lo necesita la ficha. */
export interface ArchivoDeCarpeta {
  drive_file_id: string
  name: string
  path: string | null
  mime_type: string | null
  size_bytes: number | null
  modified_time: string | null
  web_view_link: string | null
  trashed: boolean
  ausente_en_drive: boolean
  /** La ruta relativa a la carpeta de la entidad: `ADICIONAL/ADICIONAL.pdf`. Vacía si está en la raíz. */
  subcarpeta: string
}

interface FilaArchivo {
  drive_file_id: string
  name: string | null
  path: string | null
  mime_type: string | null
  size_bytes: number | string | null
  modified_time: string | null
  web_view_link: string | null
  trashed: boolean | null
  ausente_en_drive: boolean | null
}

/**
 * Normaliza y ordena lo que devolvió el índice para una carpeta.
 *
 * LOS ARCHIVOS EN PAPELERA Y LOS AUSENTES NO SE ESCONDEN: se marcan. Esconderlos volvería a
 * producir el hueco que el H1 sacó del indexador —una fila que desaparece de la vista es
 * indistinguible de una que nunca existió—, y encima el que busca el papel lo seguiría buscando en
 * Drive sin saber que está en la papelera.
 *
 * Se ordena por fecha de modificación descendente: en una carpeta de obra lo último que se tocó es
 * lo que se está mirando. Sin fecha, al final —no primero, que es donde iría un `null` en un orden
 * descendente ingenuo y donde nadie los busca.
 */
export function archivosDeLaCarpeta(filas: FilaArchivo[], carpetaPath: string | null): ArchivoDeCarpeta[] {
  const prefijo = carpetaPath ? `${carpetaPath}/` : ''
  return filas
    .map((f): ArchivoDeCarpeta => {
      const path = f.path ?? null
      const resto = prefijo && path?.startsWith(prefijo) ? path.slice(prefijo.length) : (path ?? '')
      const corte = resto.lastIndexOf('/')
      return {
        drive_file_id: f.drive_file_id,
        name: f.name ?? '(sin nombre)',
        path,
        mime_type: f.mime_type ?? null,
        // PostgREST devuelve `bigint` como string. Un `size_bytes` que llega '1048576' y se compara
        // como número da NaN silencioso; se convierte una sola vez, acá.
        size_bytes: f.size_bytes === null || f.size_bytes === undefined ? null : Number(f.size_bytes),
        modified_time: f.modified_time ?? null,
        web_view_link: f.web_view_link ?? null,
        trashed: f.trashed === true,
        ausente_en_drive: f.ausente_en_drive === true,
        subcarpeta: corte > 0 ? resto.slice(0, corte) : '',
      }
    })
    .sort((a, b) => {
      if (!a.modified_time && !b.modified_time) return a.name.localeCompare(b.name, 'es')
      if (!a.modified_time) return 1
      if (!b.modified_time) return -1
      return b.modified_time.localeCompare(a.modified_time)
    })
}

/** El tamaño como lo lee una persona. `null` no es 0 bytes: los formatos nativos de Google no lo tienen. */
export function tamano(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} kB`
  const mb = kb / 1024
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`
}

/** Lo que la ficha escribe cuando no puede listar. Una frase por estado, sin ninguna que diga «0». */
export const MOTIVO: Record<Exclude<EstadoCarpeta, 'ok'>, string> = {
  sin_declarar: 'Carpeta desconocida: nadie declaró cuál es la carpeta de Drive.',
  no_indexada: 'La carpeta declarada no está en el catálogo: puede estar fuera de las carpetas que el OS recorre, o haber sido borrada.',
  en_papelera: 'La carpeta está EN LA PAPELERA de Drive. Lo que tenga adentro no se ve hasta que alguien la restaure.',
  ausente: 'El catálogo no encontró la carpeta en su última recorrida. No se borró nada: se dejó marcada.',
}
