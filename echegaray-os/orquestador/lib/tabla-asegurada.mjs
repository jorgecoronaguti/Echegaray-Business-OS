// UNA TABLA QUE EL CÓDIGO CREA SI FALTA — PERO QUE NO VUELVE A TOCAR CON DDL SI YA ESTÁ.
//
// ═══ POR QUÉ EXISTE ESTE MÓDULO (12/09/2026, medido contra producción) ═══
//
// Tres libs aseguraban su tabla con DDL idempotente (`create table if not exists`,
// `alter table … add column if not exists`, `alter table … enable row level security`) en CADA
// lectura. El motivo original es bueno y no se discute: una migración commiteada no es una migración
// aplicada, y la base sin la tabla arranca igual de callada que la base sana.
//
// El costo no era el DDL: era lo que el DDL despierta. Supabase tiene un event trigger
// `pgrst_ddl_watch` sobre `ddl_command_end` que hace `NOTIFY pgrst, 'reload schema'`, y PostgREST
// responde RECARGANDO SU CACHÉ DE ESQUEMA ENTERA. Cada recarga corre, entre otras cosas,
// `SELECT name FROM pg_timezone_names` — y en esta instancia (shared_buffers 224 MB) esa sola
// sentencia tarda 773 ms de media.
//
// LO MEDIDO en `pg_stat_statements` sobre 27 horas (11/09 13:46 → 12/09 13:16):
//
//   SELECT name FROM pg_timezone_names ............ 537 llamadas · 415.315 ms · media 773 ms
//   WITH base_types AS (…)  (recarga de esquema) ... 537 llamadas · 174.295 ms
//   with recursive pks_fks as (…) ................. 537 llamadas · 114.591 ms
//   ──────────────────────────────────────────────────────────────────────────────
//   create table if not exists public.sheet_rotulos ........ 408 llamadas
//   alter table public.sheet_rotulos add column … rotulo .... 408 llamadas
//   create table if not exists public.sheet_pestanas_bloq… .. 394 llamadas
//   alter table public.caja_conteo_observado enable RLS ...... 48 llamadas
//
// 537 recargas × ~1,3 s de trabajo de catálogo son ~11,6 minutos por día de la base quemados en
// releer su propio esquema. Y peor que el total: MIENTRAS recarga, PostgREST encola. Ahí están los
// picos de 17,7 s de `campanita_atencion` y los 19,9 s del máximo de la instancia — no son consultas
// lentas, son consultas que esperaron una recarga que disparó el timer del Flujo de Caja (cada 90
// minutos, ~45 sentencias DDL por corrida).
//
// ═══ LA SOLUCIÓN: PREGUNTAR CON UN SELECT, NO AFIRMAR CON UN DDL ═══
//
// Un `select` al catálogo (`to_regclass` + `pg_attribute`) contesta lo mismo —¿está la tabla, están
// las columnas?— y NO dispara ningún event trigger. El DDL se corre únicamente cuando la respuesta
// es «falta algo», que es exactamente el caso para el que se escribió. La garantía que el repo ya
// tenía no se pierde: una base sin la tabla la sigue creando sola, en la primera lectura.
//
// Y se memoiza por PROCESO: una corrida del pipeline del Flujo de Caja llama a esto ~22 veces (una
// por pestaña) y la respuesta no puede cambiar en el medio — nadie borra la tabla a mitad de una
// corrida. Eso baja las ~45 sentencias de catálogo por corrida a 3.

/** Lo ya verificado en ESTE proceso. Guarda la promesa, no el booleano: dos pestañas que arrancan a
 *  la vez comparten la misma verificación en vez de hacer dos. */
const verificado = new Map()

/**
 * ¿Está la relación con sus columnas? Un SELECT al catálogo — cero DDL, cero `NOTIFY pgrst`.
 *
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: Array<Record<string, unknown>>}>} query
 * @param {string} relacion nombre calificado, ej. `public.sheet_rotulos`
 * @param {string[]} columnas las que el código necesita de verdad (no hace falta listarlas todas)
 */
export async function faltaAlgo(query, relacion, columnas) {
  const r = await query(
    `select a.attname::text as col
       from pg_attribute a
      where a.attrelid = to_regclass($1) and a.attnum > 0 and not a.attisdropped`,
    [relacion],
  )
  // Sin relación, `to_regclass` devuelve null y la consulta devuelve cero filas: indistinguible de
  // una tabla sin columnas, que no existe en Postgres. Las dos respuestas piden lo mismo: crear.
  if (r.rows.length === 0) return 'no existe'
  const hay = new Set(r.rows.map((x) => x.col))
  const faltan = columnas.filter((c) => !hay.has(c))
  return faltan.length ? `le faltan columnas: ${faltan.join(', ')}` : null
}

/**
 * Asegura una relación UNA VEZ POR PROCESO, y con DDL sólo si de verdad falta.
 *
 * @param {object} args
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: Array<Record<string, unknown>>}>} args.query
 * @param {string} args.relacion  `public.sheet_rotulos`
 * @param {string[]} args.columnas las que el código lee o escribe
 * @param {() => Promise<void>} args.crear el DDL idempotente completo (tabla + columnas + índices + RLS)
 */
export async function asegurarRelacion({ query, relacion, columnas, crear }) {
  const enCurso = verificado.get(relacion)
  if (enCurso) return enCurso
  const tarea = (async () => {
    const falta = await faltaAlgo(query, relacion, columnas)
    if (falta) {
      // Acá SÍ va el DDL, y con él su recarga de esquema: una sola vez, cuando la base de verdad no
      // tenía la tabla. Es el precio correcto de arrancar sobre una base nueva.
      console.warn(`[tabla-asegurada] ${relacion}: ${falta} — corriendo el DDL`)
      await crear()
    }
  })()
  verificado.set(relacion, tarea)
  // UN ERROR NO SE MEMOIZA. Si la verificación falló por una conexión cortada, la próxima lectura
  // tiene que volver a preguntar; memoizar el rechazo dejaría el proceso entero sin tabla para
  // siempre por un corte de un segundo.
  tarea.catch(() => verificado.delete(relacion))
  return tarea
}

/** Sólo para los tests: vacía el memo del proceso. */
export function olvidarVerificaciones() {
  verificado.clear()
}
