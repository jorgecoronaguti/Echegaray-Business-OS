// EL BORDE: LO QUE PASA LA PUERTA SE ESCRIBE, Y SE PUEDE DESHACER.
//
// Toda la decisión es de `gobernanza.mjs` y `promocion.mjs`, que son puras. Acá sólo hay entrada y
// salida de la base, con la separación que la migración impone y que no es de estilo:
//
//   `aprendizaje_candidato`  la MEDICIÓN de hoy — se reescribe en cada corrida.
//   `aprendizaje_version`    la NORMA — append-only; la última fila de cada clave es lo que rige.
//
// Mezclarlas fue el primer intento y lo voltearon los tests: recalcular con una obra nueva pisaba la
// regla vigente antes de que el registro pudiera archivarla, así que el rollback «volvía» a donde ya
// estaba. Separadas, guardar una medición nueva no puede tocar la norma ni por accidente.
//
// **Volver atrás es AGREGAR una fila, nunca recalcular.** Reconstruir el número leyendo la evidencia
// otra vez daría uno parecido, y parecido no es volver.
import { evaluarGobernanza, ESTADO, ventana } from './gobernanza.mjs'

/** Lo que define una regla vigente. Es lo que se archiva al activar y lo que vuelve al revertir: si
 *  se agrega una columna que decide algo, va acá o el rollback la pierde. */
const SNAPSHOT = Object.freeze([
  'clave', 'area', 'afirmacion', 'unidad', 'valor', 'sample_count', 'obras', 'obras_distintas',
  'contexto', 'fecha_desde', 'fecha_hasta', 'media', 'minimo', 'maximo', 'dispersion', 'clase',
  'evidencia', 'regresion', 'gobernanza',
])

const fechaSola = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null))

/**
 * DOS REGLAS SON LA MISMA REGLA, COMPARADAS EN SERIO.
 *
 * `JSON.stringify` no alcanza: JSONB no conserva el orden de las claves —las reordena por longitud y
 * después alfabéticamente— así que la regla que vuelve de la base nunca es textualmente igual a la
 * que se le mandó, aunque diga exactamente lo mismo. Sin esto, «activar lo mismo otra vez» agregaba
 * una versión nueva en cada corrida del bucle y el historial se llenaba de cambios que no cambiaron
 * nada.
 */
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

/** El snapshot de una fila de candidato, ya normalizado para JSONB. Las fechas van como `YYYY-MM-DD`
 *  y no como instante: una fecha de calendario que pasa por un huso horario vuelve corrida un día, y
 *  entonces «el estado exacto anterior» deja de ser exacto. */
function snapshotDe(fila) {
  if (!fila) return null
  const s = Object.fromEntries(SNAPSHOT.map((k) => [k, fila[k] ?? null]))
  s.fecha_desde = fechaSola(fila.fecha_desde)
  s.fecha_hasta = fechaSola(fila.fecha_hasta)
  // Los numéricos vuelven de Postgres como texto. Se guardan como número para que comparar dos
  // versiones no dependa de cuántos ceros trajo la representación.
  for (const k of ['valor', 'media', 'minimo', 'maximo', 'dispersion']) s[k] = s[k] === null ? null : Number(s[k])
  return s
}

/**
 * GUARDAR LO QUE LA CORRIDA MIDIÓ. Idempotente por clave: correr el bucle tres veces en un día no
 * crea tres candidatos.
 *
 * Nunca toca la norma. Lo que sí hace es DECIR que la norma vigente dejó de estar sostenida por la
 * evidencia —`requiereRevision`— para que el que corre el bucle no tenga que descubrirlo leyendo un
 * JSON. Desactivar sigue siendo un acto con su registro.
 */
export async function guardar({ query }, { candidato: c, gobernanza: g = null, regresion: reg = null, hoy = new Date() } = {}) {
  if (!c?.clave) throw new Error('guardar() necesita un candidato con clave')
  const gob = g ?? evaluarGobernanza({ candidato: c, regresion: reg, hoy })
  const v = c.ventana ?? gob.ventana ?? ventana(c.evidencia ?? [])
  const est = c.estadistica ?? {}
  const estado = gob.apto ? ESTADO.APTO : ESTADO.CANDIDATO

  const { rows: [fila] } = await query(
    `insert into public.aprendizaje_candidato
       (clave, area, afirmacion, unidad, valor, sample_count, obras, obras_distintas, contexto,
        fecha_desde, fecha_hasta, media, minimo, maximo, dispersion, clase, evidencia, regresion,
        gobernanza, estado, motivo, actualizado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
     on conflict (clave) do update set
       afirmacion = excluded.afirmacion, unidad = excluded.unidad, valor = excluded.valor,
       sample_count = excluded.sample_count, obras = excluded.obras,
       obras_distintas = excluded.obras_distintas, contexto = excluded.contexto,
       fecha_desde = excluded.fecha_desde, fecha_hasta = excluded.fecha_hasta,
       media = excluded.media, minimo = excluded.minimo, maximo = excluded.maximo,
       dispersion = excluded.dispersion, clase = excluded.clase, evidencia = excluded.evidencia,
       regresion = excluded.regresion, gobernanza = excluded.gobernanza,
       estado = excluded.estado, motivo = excluded.motivo, actualizado_en = now()
     returning *`,
    [c.clave, c.area ?? 'cotizacion', c.afirmacion, c.unidad ?? null, c.reglaCandidata ?? null,
      est.n ?? 0, c.obras ?? [], c.obrasDistintas ?? 0,
      c.contexto === null || c.contexto === undefined ? null : JSON.stringify(c.contexto),
      v.desde, v.hasta, est.media ?? null, est.min ?? null, est.max ?? null, est.dispersion ?? null,
      c.madurez ?? null, JSON.stringify(c.evidencia ?? []),
      reg ? JSON.stringify(reg) : null, JSON.stringify(gob), estado, gob.porQue])

  const vigente = await vigenteDe({ query }, c.clave)
  return { fila, gobernanza: gob, estado, vigente, requiereRevision: Boolean(vigente) && !gob.apto }
}

/** La última fila del registro de una clave — la norma vigente, o `null` si no rige nada. */
export async function vigenteDe({ query }, clave) {
  const { rows: [u] } = await query(
    'select * from public.aprendizaje_version where clave = $1 order by version desc, id desc limit 1', [clave])
  return u?.regla_nueva ?? null
}

/**
 * ACTIVAR. Sólo lo que la gobernanza guardada habilita, y sólo desde APTO. Archiva la regla que
 * regía —entera— en la misma fila que registra la nueva.
 */
export async function activar({ query }, { clave, porQue = null, quien = null, cuando = null } = {}) {
  const { rows: [c] } = await query('select * from public.aprendizaje_candidato where clave = $1', [clave])
  if (!c) return { activada: false, porQue: `no hay ningún candidato con clave «${clave}»` }
  const gob = c.gobernanza ?? {}
  if (!gob.apto) return { activada: false, porQue: `la gobernanza no lo habilita — ${gob.porQue ?? 'sin evaluación guardada'}` }
  if (c.estado !== ESTADO.APTO) return { activada: false, porQue: `su estado es ${c.estado}: sólo se activa lo que está APTO` }

  const { rows: [ult] } = await query(
    'select * from public.aprendizaje_version where clave = $1 order by version desc, id desc limit 1', [clave])
  const anterior = ult?.regla_nueva ?? null
  const nueva = snapshotDe(c)
  // Activar lo mismo que ya rige no agrega una versión: sería historia inventada.
  if (anterior && canonico(anterior) === canonico(nueva)) {
    return { activada: false, yaRegia: true, version: ult.version, porQue: 'lo que rige ya es exactamente esto' }
  }
  const version = (ult?.version ?? 0) + 1

  const { rows: [reg] } = await query(
    `insert into public.aprendizaje_version (clave, version, accion, regla_anterior, regla_nueva, gobernanza, por_que, quien, cuando)
     values ($1,$2,'ACTIVACION',$3,$4,$5,$6,$7, coalesce($8::timestamptz, now()))
     -- Dos corridas simultáneas chocan contra la única (clave, version): la segunda no escribe nada
     -- y se entera porque no le vuelve fila.
     on conflict (clave, version) do nothing
     returning *`,
    [clave, version, anterior ? JSON.stringify(anterior) : null, JSON.stringify(nueva),
      JSON.stringify(gob), porQue ?? gob.porQue ?? 'pasó la gobernanza', quien, cuando])
  if (!reg) return { activada: false, porQue: 'otra corrida activó esta misma versión: no se activó dos veces' }

  return { activada: true, version, regla: nueva, anterior, porQue: reg.por_que }
}

/**
 * VOLVER ATRÁS AL ESTADO EXACTO ANTERIOR.
 *
 * Si antes regía otra versión, vuelve a regir esa misma —el snapshot archivado, no un recálculo—.
 * Si no regía ninguna, deja de regir: ÉSE era el estado anterior, y dejar el número puesto sería
 * inventar una versión que nunca existió.
 */
export async function revertir({ query }, { clave, porQue = null, quien = null, cuando = null } = {}) {
  const { rows: [ult] } = await query(
    'select * from public.aprendizaje_version where clave = $1 order by version desc, id desc limit 1', [clave])
  if (!ult) return { revertida: false, porQue: `«${clave}» nunca se activó: no hay a dónde volver` }
  if (!ult.regla_nueva) return { revertida: false, porQue: `«${clave}» no está rigiendo nada ahora mismo` }

  const motivo = porQue ?? `rollback de la versión ${ult.version}`
  const { rows: [reg] } = await query(
    `insert into public.aprendizaje_version (clave, version, accion, regla_anterior, regla_nueva, por_que, quien, cuando)
     values ($1,$2,'ROLLBACK',$3,$4,$5,$6, coalesce($7::timestamptz, now()))
     on conflict (clave, version) do nothing returning *`,
    [clave, ult.version + 1, JSON.stringify(ult.regla_nueva),
      ult.regla_anterior ? JSON.stringify(ult.regla_anterior) : null, motivo, quien, cuando])
  if (!reg) return { revertida: false, porQue: 'otra corrida escribió esa versión mientras tanto' }

  return { revertida: true, version: reg.version, volvioA: ult.regla_anterior ?? null, dejoDeRegir: ult.regla_nueva, porQue: motivo }
}

/** Lo que está en uso hoy. La única fuente: quien cotiza lee esto, no la tabla de candidatos. */
export async function activos({ query }, { area = null } = {}) {
  const { rows } = await query(
    `select * from public.aprendizaje_activo where ($1::text is null or area = $1) order by clave`, [area])
  return rows
}

/** El historial de una clave, del más nuevo al más viejo. */
export async function historial({ query }, clave) {
  const { rows } = await query(
    'select * from public.aprendizaje_version where clave = $1 order by version desc, id desc', [clave])
  return rows
}

export { snapshotDe, canonico }
