// EL CICLO DE UN RECIBO DE QUINCENA — lo que se decide del estado, sin base y sin pantalla.
//
// Un recibo de quincena nace emitido (se aceptó e imprimió), se manda a firmar, la persona lo firma con el
// dedo o sube el papel firmado, y Administración lo archiva. Cualquiera de los dos lados puede observarlo
// mientras no esté firmado.
//
// ESTO LO LEEN TRES CARAS: el cuadro de Liquidación (D11), el legajo (D13) y el teléfono de la persona
// (M09/M10). El rótulo de un estado no puede ser distinto en cada una —«Firmado» en una pantalla y
// «Conformado» en otra sería el mismo hecho con dos nombres—, así que se decide una sola vez, acá.
//
// Sin JSX, sin `'use client'`, sin base: se prueba con `node --test`.

export type EstadoDelRecibo =
  | 'emitido' | 'enviado' | 'firmado_telefono' | 'firmado_papel' | 'archivado' | 'observado'

export const ESTADOS: readonly EstadoDelRecibo[] = [
  'emitido', 'enviado', 'firmado_telefono', 'firmado_papel', 'archivado', 'observado',
]

/** Un estado que la base no conoce no se dibuja como «emitido»: se dice que no se entiende. */
export const esEstado = (v: unknown): v is EstadoDelRecibo =>
  typeof v === 'string' && (ESTADOS as readonly string[]).includes(v)

export interface CicloDelRecibo {
  estado: EstadoDelRecibo
  /** El SVG de la firma con el dedo, si firmó así. */
  trazo: string | null
  firmadoEn: string | null
  /** La obra donde estaba el día que firmó. `null` = no hay registro: no se inventa un lugar. */
  firmadoDesde: string | null
  papelSubidoEn: string | null
  enviadoEn: string | null
  archivadoEn: string | null
  observacion: string | null
}

/** ¿Alguien lo firmó, de la forma que sea? Las dos conviven (dueño, 22/09): no se elige una. */
export const estaFirmado = (r: Pick<CicloDelRecibo, 'firmadoEn' | 'papelSubidoEn'>): boolean =>
  Boolean(r.firmadoEn) || Boolean(r.papelSubidoEn)

/** Se archiva lo firmado, y una sola vez. */
export const sePuedeArchivar = (r: CicloDelRecibo): boolean =>
  r.estado !== 'archivado' && estaFirmado(r)

/** La persona reclama ANTES de firmar; después, el reclamo va por otra vía. */
export const personaPuedeObservar = (r: CicloDelRecibo): boolean =>
  r.estado !== 'archivado' && !estaFirmado(r)

/** Firma quien todavía no firmó y no está archivado. */
export const sePuedeFirmar = (r: CicloDelRecibo): boolean =>
  r.estado !== 'archivado' && !estaFirmado(r)

/**
 * LA FIRMA GUARDADA, ABIERTA EN SUS PARTES PARA DIBUJARLA COMO JSX.
 *
 * El trazo viaja como un SVG completo, pero NO se inyecta con `dangerouslySetInnerHTML`: de la base sale
 * texto, y texto de la base no se mete en el árbol del navegador aunque la base lo valide (lo valida, con la
 * misma expresión, en `firmar_recibo_liquidacion`). Se le sacan el recuadro y el `d`, y la pantalla dibuja
 * un `<svg><path/></svg>` propio. `null` cuando no tiene la forma de una firma: entonces no se dibuja nada.
 */
export interface TrazoDibujable { ancho: number; alto: number; d: string }

const FIRMA = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) (\d+)"><path d="([ML0-9 l-]+)"/

export function trazoDibujable(svg: string | null): TrazoDibujable | null {
  if (!svg) return null
  const m = FIRMA.exec(svg)
  if (!m) return null
  const [, ancho, alto, d] = m
  return { ancho: Number(ancho), alto: Number(alto), d }
}

export type TonoDelRecibo = 'pos' | 'warn' | 'neg' | 'nulo'

export interface LecturaDelCiclo {
  rotulo: string
  tono: TonoDelRecibo
}

/**
 * CÓMO SE DICE EL ESTADO. El rótulo lleva el hecho, no la etiqueta técnica: «Emitido, sin firmar» dice qué
 * falta; «enviado» solo no diría nada.
 */
export function lecturaDelCiclo(r: CicloDelRecibo): LecturaDelCiclo {
  if (r.estado === 'archivado') return { rotulo: 'Archivado en el legajo', tono: 'pos' }
  if (r.estado === 'observado') return { rotulo: 'Observado: no coincide', tono: 'neg' }
  if (r.firmadoEn && r.papelSubidoEn) return { rotulo: 'Firmado · con el papel cargado', tono: 'pos' }
  if (r.firmadoEn) return { rotulo: 'Firmado en el teléfono', tono: 'pos' }
  if (r.papelSubidoEn) return { rotulo: 'Firmado en papel · cargado', tono: 'pos' }
  if (r.estado === 'enviado') return { rotulo: 'Enviado a firmar, sin firmar', tono: 'warn' }
  return { rotulo: 'Emitido, sin firmar', tono: 'warn' }
}

/**
 * «15/09 · 18:42», hora de San Juan. Lo que se firmó se cuenta en la hora del lugar donde se firmó.
 *
 * SE CALCULA, NO SE PIDE A `toLocaleString`: el Node de la VM devuelve «22/9 · 06:42 p. m.» para es-AR con
 * `2-digit` —el ICU que trae decide el formato, no el pedido— y un sello de tiempo de un documento firmado
 * no puede salir distinto según dónde corra. Argentina no cambia de hora desde 2009: UTC−3 fijo.
 */
const SAN_JUAN_UTC = -3

export function momentoCorto(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const local = new Date(d.getTime() + SAN_JUAN_UTC * 3600_000)
  const dd = (n: number) => String(n).padStart(2, '0')
  return `${dd(local.getUTCDate())}/${dd(local.getUTCMonth() + 1)} · ${dd(local.getUTCHours())}:${dd(local.getUTCMinutes())}`
}

/**
 * DÓNDE Y CUÁNDO SE FIRMÓ, en una línea, para el legajo y para el teléfono.
 *
 * Sin obra registrada ese día dice sólo «desde el teléfono»: el lugar no se inventa. `null` cuando no hay
 * firma con el dedo — el papel no dice desde dónde se firmó y afirmarlo sería fabricar.
 */
export function dondeSeFirmo(r: Pick<CicloDelRecibo, 'firmadoEn' | 'firmadoDesde'>): string | null {
  const cuando = momentoCorto(r.firmadoEn)
  if (!cuando) return null
  return r.firmadoDesde ? `${cuando} · desde el teléfono, en ${r.firmadoDesde}` : `${cuando} · desde el teléfono`
}
