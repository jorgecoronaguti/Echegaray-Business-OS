// DOCUMENTOS — lo que se decide sobre un archivo, sin tocar la base.
//
// La pantalla 27 es una lista de 3.123 archivos que viven en Drive. Lo único que se decide acá es
// de quién es cada uno, cómo se lo abre y si su vigencia se puede afirmar. Nada se copia: el
// archivo sigue siendo el de Drive y lo que viaja es su identificador.

import type {
  ClaseVinculo, Documento, EstadoVigencia, Vinculo,
} from '../types'

/** Una fila de `documentacion_legajo` con la persona embebida por PostgREST. */
export interface VinculoLegajo {
  id: string
  drive_file_id: string | null
  tipo_documento: string | null
  fecha_vencimiento: string | null
  persona_id: string | null
  personas: { nombre_completo: string | null } | null
}

/** Una fila de `cliente_documento` con el cliente embebido. */
export interface VinculoCliente {
  drive_file_id: string | null
  rol: string | null
  clientes: { nombre_comercial: string | null; slug: string | null } | null
}

/** Una fila de `obra_documento` con la obra embebida. `obra_id` ES el identificador de la URL. */
export interface VinculoObra {
  drive_file_id: string | null
  rol: string | null
  obra_canonica: { id: string | null; nombre: string | null } | null
}

/** Un archivo tal como sale de `drive_index`, todavía sin vínculo. */
export interface ArchivoIndexado {
  drive_file_id: string
  name: string
  path: string | null
  tipo: string | null
  mime_type: string | null
  size_bytes: number | null
  modified_time: string | null
  nombre_norm: string | null
}

// ═══ LOS ARCHIVOS NO SE COPIAN: SE VINCULAN ═══
//
// `obras.md` §1g, textual. La única forma de abrir un documento es su URL de Drive, construida con
// el `drive_file_id` que el indexador ya guardó. El OS no guarda el archivo, no lo sirve y no lo
// duplica: si mañana alguien lo mueve de carpeta en Drive, este enlace sigue siendo el bueno.
export const enlaceDrive = (driveFileId: string) => `https://drive.google.com/file/d/${driveFileId}/view`

// ═══ DESCARGAR Y PREVISUALIZAR SON DOS URL DE DRIVE, NO UNA INTEGRACIÓN ═══
//
// `drive_index` NO guarda `webContentLink` ni `webViewLink` —sus columnas son id, nombre, ruta,
// mime, tamaño y fechas—, así que las dos direcciones se DERIVAN del id. Son las direcciones
// públicas y estables de Drive: el OS no sirve el archivo, no lo copia y no lo proxya. Quien las
// abre las abre con SU sesión de Google, y por eso los permisos siguen siendo los de Drive: si no
// tiene acceso, Google se lo dice. Eso es lo correcto, no una falla.
//
// LO QUE NO ANDA, MEDIDO: 3.108 de los 3.123 archivos son binarios (2.677 PDF, 322 planillas
// Office, 40 imágenes…) y bajan bien. Los 15 restantes son de Google: 10 nativos
// (`vnd.google-apps.document`/`.spreadsheet`) que no tienen bytes que bajar sino un formato de
// exportación que habría que elegir a mano, y 5 `vnd.google-apps.shortcut`, que son accesos
// directos y no tienen contenido en absoluto. Para esos 15 no se dibuja el botón: un «Descargar»
// que baja un archivo de 0 bytes es peor que no tenerlo.

const NATIVO_GOOGLE = 'application/vnd.google-apps.'

/** La descarga directa del binario. `null` cuando el archivo no ES un binario de Drive. */
export function enlaceDescarga(driveFileId: string, mimeType: string | null): string | null {
  if (mimeType?.startsWith(NATIVO_GOOGLE)) return null
  return `https://drive.google.com/uc?export=download&id=${driveFileId}`
}

/**
 * El visor embebible de Drive. `null` para los accesos directos, que no tienen nada que mostrar.
 *
 * Los nativos de Google SÍ se previsualizan, con el visor de su producto. Se separan del binario
 * porque `drive.google.com/file/d/…` sobre un Doc nativo devuelve un error, no el documento.
 */
export function enlacePreview(driveFileId: string, mimeType: string | null): string | null {
  if (mimeType === `${NATIVO_GOOGLE}shortcut` || mimeType === `${NATIVO_GOOGLE}folder`) return null
  const producto = mimeType?.startsWith(NATIVO_GOOGLE)
    ? { document: 'document', spreadsheet: 'spreadsheets', presentation: 'presentation' }[mimeType.slice(NATIVO_GOOGLE.length)]
    : undefined
  if (producto) return `https://docs.google.com/${producto}/d/${driveFileId}/preview`
  if (mimeType?.startsWith(NATIVO_GOOGLE)) return null
  return `https://drive.google.com/file/d/${driveFileId}/preview`
}

/**
 * DE QUIÉN ES CADA ARCHIVO.
 *
 * Se acumulan los vínculos, no se elige uno: un mismo PDF puede estar en el legajo de una persona y
 * colgado de un cliente, y quedarse con el primero convertiría la columna «vinculado a» en una
 * media verdad que nadie puede auditar.
 */
export function conVinculos(
  archivos: ArchivoIndexado[],
  legajos: VinculoLegajo[],
  documentosCliente: VinculoCliente[],
  documentosObra: VinculoObra[] = [],
): Documento[] {
  const porArchivo = new Map<string, Vinculo[]>()
  const vence = new Map<string, string>()
  const sumar = (id: string | null, v: Vinculo) => {
    if (!id) return
    porArchivo.set(id, [...(porArchivo.get(id) ?? []), v])
  }
  for (const l of legajos) {
    sumar(l.drive_file_id, {
      clase: 'persona',
      nombre: l.personas?.nombre_completo?.trim() || 'persona sin nombre',
      detalle: etiquetaLegajo(l.tipo_documento),
      href: l.persona_id ? `/administracion/personas/${l.persona_id}` : null,
      legajoId: l.id,
    })
    if (l.drive_file_id && l.fecha_vencimiento) vence.set(l.drive_file_id, l.fecha_vencimiento)
  }
  for (const d of documentosCliente) {
    sumar(d.drive_file_id, {
      clase: 'cliente',
      nombre: d.clientes?.nombre_comercial?.trim() || 'cliente sin nombre',
      detalle: d.rol?.trim() || null,
      href: d.clientes?.slug ? `/clientes/${d.clientes.slug}` : null,
      // `cliente_documento` NO tiene columna de vencimiento: sus cinco columnas son cliente_id,
      // drive_file_id, rol, origen y creado_en. Un contrato colgado de un cliente no puede vencer
      // en el OS todavía, y eso se dice en el panel en vez de ofrecer un campo que no guarda nada.
      legajoId: null,
    })
  }
  for (const o of documentosObra) {
    sumar(o.drive_file_id, {
      clase: 'obra',
      nombre: o.obra_canonica?.nombre?.trim() || 'obra sin nombre',
      detalle: o.rol?.trim() || null,
      href: o.obra_canonica?.id ? `/obras/${o.obra_canonica.id}` : null,
      // `obra_documento` tampoco tiene columna de vencimiento (obra_id, drive_file_id, rol, origen,
      // creado_en). El plano de una obra no puede vencer en el OS todavía.
      legajoId: null,
    })
  }
  return archivos.map((a) => ({
    ...a,
    vinculos: porArchivo.get(a.drive_file_id) ?? [],
    vence: vence.get(a.drive_file_id) ?? null,
  }))
}

/** `alta_temprana` es el valor de la base; «Alta temprana» es lo que se lee. */
export function etiquetaLegajo(tipo: string | null): string | null {
  const t = tipo?.trim()
  if (!t) return null
  const limpio = t.replace(/_/g, ' ')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/**
 * ═══ LA VIGENCIA NO SE AFIRMA POR DEFECTO ═══
 *
 * Devuelve `null` cuando el documento NO tiene vencimiento cargado, y es la decisión central de
 * esta pantalla. El canónico dibuja «Vigente» en verde para casi todas las filas; con los datos
 * reales eso sería una afirmación falsa 3.123 veces: las 847 filas de `documentacion_legajo` tienen
 * `fecha_vencimiento` en `null` y las otras 2.276 ni siquiera pasan por una tabla de vigencia. Un
 * punto verde que dice «vigente» sobre una libreta que venció en febrero es peor que no decir nada.
 */
export function estadoVigencia(vence: string | null, hoy: string): EstadoVigencia | null {
  const f = vence?.slice(0, 10)
  if (!f) return null
  const dias = diasEntre(hoy.slice(0, 10), f)
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'vence-pronto'
  return 'vigente'
}

/**
 * ═══ LA VENTANA QUE MIDE LA BANDA DE ALERTAS ═══
 *
 * Dos cortes y nada más: lo que YA venció (antes de hoy) y lo que vence ANTES DE QUE TERMINE EL MES.
 * «Este mes» es el mes calendario, no «los próximos 30 días»: quien mira la banda un 28 quiere saber
 * qué tiene que renovar antes de cerrar el mes, y «30 días» le contestaría por el mes siguiente.
 *
 * El último día se calcula con el día 0 del mes que viene, que es el truco que hace bien febrero y
 * los años bisiestos sin una tabla de largos de mes. Todo en UTC: la fecha de vencimiento es una
 * `date` de Postgres —un día del calendario, sin hora—, y restarle un huso la correría un día.
 */
export function ventanaVencimientos(hoy: string): { desde: string; hasta: string } {
  const desde = hoy.slice(0, 10)
  const d = new Date(`${desde}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return { desde, hasta: desde }
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return { desde, hasta: fin.toISOString().slice(0, 10) }
}

const DIA_MS = 86400000
function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(`${desdeISO}T00:00:00Z`)
  const b = Date.parse(`${hastaISO}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY
  return Math.round((b - a) / DIA_MS)
}

/**
 * ¿Se dibuja la columna VENCE?
 *
 * Sólo si algún documento a la vista tiene vencimiento. Hoy no lo tiene ninguno, y una columna de
 * 3.123 celdas que dicen «sin dato» no es información: es ruido que empuja al resto fuera de la
 * pantalla. El día que se cargue el primero, la columna aparece sola.
 */
export const hayVencimientos = (docs: Documento[]) => docs.some((d) => d.vence !== null)

/** La carpeta donde vive, sin el nombre del archivo. `null` cuando el índice no trae ruta. */
export function carpetaDe(path: string | null): string | null {
  const p = path?.trim()
  if (!p) return null
  const i = p.lastIndexOf('/')
  return i <= 0 ? null : p.slice(0, i)
}

/**
 * La ruta como migaja legible. Se recorta por el MEDIO —no por el final— porque el tramo que
 * ubica es el primero (el área) y el último (la carpeta que lo contiene); lo del medio es relleno.
 */
export function migajaDe(path: string | null, maxTramos = 3): string | null {
  const carpeta = carpetaDe(path)
  if (!carpeta) return null
  const tramos = carpeta.split('/').filter(Boolean)
  if (tramos.length <= maxTramos) return tramos.join(' / ')
  // El «…» ocupa uno de los tramos permitidos: recortar a 3 tiene que devolver 3, o el recorte
  // no acota nada y la migaja vuelve a empujar la tabla de costado.
  return [tramos[0], '…', ...tramos.slice(-(maxTramos - 2))].join(' / ')
}

/** El tamaño en la unidad que se lee. `null` es «sin dato», nunca «0 kB». */
export function pesoLegible(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kB`
  return `${(kb / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`
}

export const ETIQUETA_VINCULO: Record<ClaseVinculo, string> = {
  persona: 'persona',
  cliente: 'cliente',
  obra: 'obra',
}

// ═══ UN `.in()` LARGO NO SE FILTRA MAL: SE CAE ═══════════════════════════════════════════════
//
// MEDIDO CONTRA LA BASE REAL (24/08/2026): `documentacion_legajo` tiene 847 `drive_file_id`
// distintos. Pedir `drive_index?drive_file_id=in.(…847 ids…)` es una URL de ~30 kB, y PostgREST
// contesta **400 Bad Request** — comprobado, no supuesto. O sea: el recorte por vencimiento que ya
// existe (`idsPorVencer`) funciona HOY sólo porque ninguna de las 847 filas tiene fecha cargada. El
// día que se carguen ~500 vencimientos, y esa carga la hace ESTA MISMA pantalla, «Vencidos» deja de
// devolver documentos y devuelve un error.
//
// La salida no es acotar la lista de ids —eso filtraría de menos en silencio, que es peor— sino
// PARTIRLA: N consultas con los mismos filtros, cada una por debajo del límite de URL, y el
// resultado se une. Los ids son distintos entre partes, así que los `count` son disjuntos y su suma
// es exacta; el orden global se rehace al unir.

/** Ids por parte. 33 caracteres el id + comas y escape ≈ 36 B: 150 ids son ~5,4 kB de URL, cómodo
 *  por debajo del límite práctico de PostgREST aun sumando el resto de los filtros. */
export const IDS_POR_PARTE = 150

/** Parte una lista de ids en tramos de a lo sumo `tam`. Sin ids no hay consulta que hacer. */
export function partirIds(ids: string[], tam: number = IDS_POR_PARTE): string[][] {
  if (tam < 1) throw new Error('el tamaño de parte tiene que ser al menos 1')
  const partes: string[][] = []
  for (let i = 0; i < ids.length; i += tam) partes.push(ids.slice(i, i + tam))
  return partes
}

/**
 * Une los resultados de las partes en una sola página: se reordena por `modified_time` descendente
 * —el mismo orden que pide la consulta— y se recorta al tope.
 *
 * SIN ESTE REORDENAMIENTO la página saldría agrupada por parte: los 150 archivos más nuevos de la
 * parte 1, después los de la parte 2. Cada parte viene ordenada; el conjunto, no.
 */
export function unirPartes<T extends { modified_time: string | null }>(partes: T[][], tope: number): T[] {
  return partes
    .flat()
    .sort((a, b) => String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? '')))
    .slice(0, tope)
}
