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

/** Un archivo tal como sale de `drive_index`, todavía sin vínculo. */
export interface ArchivoIndexado {
  drive_file_id: string
  name: string
  path: string | null
  tipo: string | null
  mime_type: string | null
  size_bytes: number | null
  modified_time: string | null
}

// ═══ LOS ARCHIVOS NO SE COPIAN: SE VINCULAN ═══
//
// `obras.md` §1g, textual. La única forma de abrir un documento es su URL de Drive, construida con
// el `drive_file_id` que el indexador ya guardó. El OS no guarda el archivo, no lo sirve y no lo
// duplica: si mañana alguien lo mueve de carpeta en Drive, este enlace sigue siendo el bueno.
export const enlaceDrive = (driveFileId: string) => `https://drive.google.com/file/d/${driveFileId}/view`

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
    })
    if (l.drive_file_id && l.fecha_vencimiento) vence.set(l.drive_file_id, l.fecha_vencimiento)
  }
  for (const d of documentosCliente) {
    sumar(d.drive_file_id, {
      clase: 'cliente',
      nombre: d.clientes?.nombre_comercial?.trim() || 'cliente sin nombre',
      detalle: d.rol?.trim() || null,
      href: d.clientes?.slug ? `/clientes/${d.clientes.slug}` : null,
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
}
