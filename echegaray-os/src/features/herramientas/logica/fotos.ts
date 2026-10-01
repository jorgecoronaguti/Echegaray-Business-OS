// LAS FOTOS DE UN ACTIVO — todas, como evidencia de su estado (migración 20261001T1800). Puro: sin
// Supabase y sin React; lo prueba `fotos.test.ts`.
//
// Dueño, 01/10/2026: «necesito q permitas cargar mas de una foto a cada una de las herramientas
// rodados, materia, etc porque sirve como evidencia del estado de los mismos». Hasta esa migración la
// ficha tenía UNA foto (`activo.foto_url`) y cambiarla pisaba la anterior. Ahora `activo_foto` las
// guarda todas y `foto_url` es la portada (la más reciente), que mantiene la base.
//
// ═══ SIN LA MIGRACIÓN, LA FICHA ES LA DE SIEMPRE ═══
// `fotos === null` = la tabla todavía no existe. La ficha muestra `foto_url` como hasta ahora y ofrece
// UNA foto por vez: ofrecer varias sin la tabla sería guardar una y perder las otras en silencio.

export const MIGRACION_FOTOS = '20261001T1800'

/** Lo mismo que acepta `agregar_fotos_activo`: arriba de esto, en dos tandas. */
export const TOPE_FOTOS_POR_VEZ = 20

export interface FotoDeActivo {
  id: string
  activo_id: string
  url: string
  /** La foto de un reporte apunta a él; la de la ficha, a nada. */
  incidencia_id: string | null
  /** null = no se sabe quién la subió. */
  subida_por: string | null
  creado_en: string
}

export const COLUMNAS_FOTO = 'id, activo_id, url, incidencia_id, subida_por, creado_en'

/**
 * El instante en microsegundos. `Date.parse` corta en milisegundos, y las fotos de una misma tanda
 * entran con `clock_timestamp()` a microsegundos de distancia: ordenarlas por milisegundo las dejaría
 * empatadas y «la más nueva» quedaría al azar.
 */
function instante(iso: string): number {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return Number.NEGATIVE_INFINITY
  const fraccion = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(iso)?.[1] ?? ''
  return ms * 1000 + Number(fraccion.padEnd(6, '0').slice(3, 6))
}

/** Las fotos de un activo, de la más nueva a la más vieja. `null` = sin la migración. */
export function fotosDe(fotos: FotoDeActivo[] | null | undefined, activoId: string): FotoDeActivo[] | null {
  if (!fotos) return null
  return fotos
    .filter((f) => f.activo_id === activoId)
    .map((f, i) => ({ f, i, t: instante(f.creado_en) }))
    .sort((x, y) => y.t - x.t || x.i - y.i)
    .map((x) => x.f)
}

/**
 * Las fotos elegidas para un reporte. Con la tabla, cada elección SE SUMA (en el teléfono se sacan una
 * tras otra); sin ella, la nueva reemplaza a la anterior, como siempre.
 */
export function sumarElegidas<T>(antes: readonly T[], nuevas: readonly T[], varias: boolean): T[] {
  if (!varias) return nuevas.slice(0, 1)
  return [...antes, ...nuevas].slice(0, TOPE_FOTOS_POR_VEZ)
}

/** El botón de la foto del reporte, según cuántas hay elegidas. */
export function rotuloElegidas(n: number, varias: boolean): string {
  if (n === 0) return 'Agregar foto'
  if (!varias) return 'Foto lista · cambiar'
  return `${n} ${n === 1 ? 'foto lista' : 'fotos listas'} · agregar otra`
}

/** Lo que se le dice a la persona después de una tanda: cuántas quedaron y, si alguna no, por qué. */
export function resumenDeTanda(guardadas: number, errores: readonly string[]): { ok: boolean; texto: string } {
  const quedaron = guardadas === 1 ? 'Foto guardada.' : `${guardadas} fotos guardadas.`
  if (errores.length === 0) return { ok: guardadas > 0, texto: guardadas > 0 ? quedaron : 'No llegó ninguna foto.' }
  const fallaron = errores.length === 1 ? '1 no se guardó' : `${errores.length} no se guardaron`
  return { ok: false, texto: guardadas > 0 ? `${quedaron} ${fallaron}: ${errores[0]}` : errores[0] }
}
