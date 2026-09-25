// LA COLA DE «DICTAR PARTE» — tomar un audio, transcribirlo en la VM y dejar la PROPUESTA.
//
// Lo corre `scripts/procesar-dictados-parte.mjs` desde `echegaray-dictados-parte.timer` (15 s).
// UN AUDIO A LA VEZ: la VM de 4 núcleos y 7 GB también sostiene el chat, el bot y Postgres; dos
// transcripciones en paralelo serían 2,2 GB y los cuatro núcleos. La cola lo serializa.
//
// ═══ LO QUE ESTO NUNCA HACE ═══
//
// No escribe asistencia, horas, avance, pedidos ni novedades. Escribe `parte_dictado.transcripcion`
// y `.propuesta`, y nada más. El parte lo guarda la persona desde la pantalla, por las mismas
// puertas que el parte tipeado.
//
// Todo lo que toca la base pasa por `port.query` (inyectable): los tests corren sin base.

import { proponerParte } from './ml/voz-parte.mjs'

export const BUCKET_DICTADOS = 'partes-dictados'
export const MAX_INTENTOS = 3
/** Un audio de 3 minutos tarda ~25 s. Diez minutos en `transcribiendo` es un proceso que murió. */
export const MINUTOS_COLGADO = 10

/** Devuelve a la cola lo que quedó `transcribiendo` de una vuelta que murió; al tercer intento, `error`. */
export async function reciclarColgados(port) {
  const r = await port.query(
    `update public.parte_dictado
        set estado = case when intentos >= $1 then 'error' else 'pendiente' end,
            motivo = case when intentos >= $1 then 'la transcripción se cortó y ya no quedan reintentos' else 'se reintenta: la vuelta anterior se cortó' end
      where estado = 'transcribiendo' and tomado_en < now() - make_interval(mins => $2::int)
      returning id`,
    [MAX_INTENTOS, MINUTOS_COLGADO],
  )
  return r?.rows?.length ?? 0
}

/** Toma el pendiente más viejo y gasta un intento ANTES de trabajar (si el proceso muere, ya contó). */
export async function tomarDictado(port) {
  const r = await port.query(
    `with siguiente as (
       select id from public.parte_dictado where estado = 'pendiente'
        order by creado_en asc limit 1 for update skip locked
     )
     update public.parte_dictado d
        set estado = 'transcribiendo', intentos = d.intentos + 1, tomado_en = now(), motivo = null
      where d.id = (select id from siguiente)
      returning d.id, d.obra_id, to_char(d.fecha, 'YYYY-MM-DD') as fecha, d.audio_path, d.intentos, d.duracion_s`,
  )
  return r?.rows?.[0] ?? null
}

/**
 * LO QUE EL PARSER PUEDE RECONOCER: el plantel de ESA obra ese día (asignación vigente, más quien
 * ya tiene horas cargadas ahí ese día) y sus tareas ejecutables (la 04, sin rubros resumen ni
 * archivadas). Nadie de afuera: la regla de la maqueta es «sólo usa personas y tareas de esa obra».
 */
export async function contextoDeObra(port, obraId, fecha) {
  const [obra, personas, tareas] = await Promise.all([
    port.query(`select nombre, codigo, jornada_horas from public.obra_canonica where id = $1`, [obraId]),
    port.query(
      `select p.id, p.nombre_completo, p.nombre_para_mostrar
         from public.personas p
        where p.id in (
                select a.persona_id from public.obra_asignacion a
                 where a.obra_id = $1 and (a.desde is null or a.desde <= $2::date) and (a.hasta is null or a.hasta >= $2::date)
                union
                select h.persona_id from public.registros_hh h
                 where h.obra_canonica_id = $1 and h.fecha = $2::date and h.persona_id is not null)
          and (p.fecha_egreso is null or p.fecha_egreso >= $2::date)
          and not coalesce(p.es_prueba, false)
        order by p.nombre_completo`,
      [obraId, fecha],
    ),
    port.query(
      `select actividad_id as id, nombre, rubro, unidad, metodo_avance, avance_pct, cantidad_ejecutada,
              cantidad_objetivo, (estado_operativo = 'bloqueada' or coalesce(impedimentos_abiertos, 0) > 0) as bloqueada
         from public.obra_actividad_control
        where obra_id = $1 and tipo is distinct from 'resumen' and not coalesce(archivada, false)
        order by orden`,
      [obraId],
    ),
  ])
  const o = obra?.rows?.[0] ?? {}
  const num = (v) => (v == null ? null : Number(v))
  return {
    obra: { nombre: o.nombre ?? null, codigo: o.codigo ?? null, jornada_horas: num(o.jornada_horas) },
    personas: personas?.rows ?? [],
    tareas: (tareas?.rows ?? []).map((t) => ({
      ...t, avance_pct: num(t.avance_pct), cantidad_ejecutada: num(t.cantidad_ejecutada), cantidad_objetivo: num(t.cantidad_objetivo),
    })),
  }
}

/** Deja la propuesta. Sólo si la fila sigue `transcribiendo` (nadie la descartó mientras tanto). */
export async function dejarListo(port, id, { texto, propuesta, modelo, ms }) {
  const r = await port.query(
    `update public.parte_dictado
        set estado = 'listo', transcripcion = $2, propuesta = $3::jsonb, modelo = $4, ms_transcripcion = $5, listo_en = now(), motivo = null
      where id = $1 and estado = 'transcribiendo' returning id`,
    [id, texto, JSON.stringify(propuesta), modelo, ms],
  )
  return (r?.rows?.length ?? 0) === 1
}

/** Un error que no se arregla reintentando (WAV roto) va directo a `error`; el resto vuelve a la cola. */
export async function dejarError(port, id, motivo, { definitivo = false } = {}) {
  await port.query(
    `update public.parte_dictado
        set estado = case when $3::boolean or intentos >= $4 then 'error' else 'pendiente' end, motivo = $2
      where id = $1 and estado = 'transcribiendo'`,
    [id, String(motivo).slice(0, 300), definitivo, MAX_INTENTOS],
  )
}

/**
 * UNA VUELTA: recicla, y mientras haya pendientes (hasta `tope`), toma uno, lo baja, lo transcribe y
 * deja la propuesta. El motor se carga la primera vez que hace falta y se reusa en la misma vuelta.
 *
 * @param {{port, bajar:(path)=>Promise<{ok,data?,error?}>, cargarMotor:()=>object,
 *          transcribir:(motor, wav:Buffer)=>{ok,texto?,ms?,segundos?,modelo?,error?},
 *          completar?:(propuesta, contexto)=>Promise<object>, log?}} dep
 */
export async function drenarDictados(dep, { tope = 5 } = {}) {
  const { port, bajar, cargarMotor, transcribir, completar = null, log = () => {} } = dep
  const hechos = []
  const reciclados = await reciclarColgados(port)
  if (reciclados) log(`↺ ${reciclados} dictado(s) colgado(s) vuelven a la cola`)
  let motor = null
  for (let n = 0; n < tope; n++) {
    const fila = await tomarDictado(port)
    if (!fila) break
    try {
      const audio = await bajar(fila.audio_path)
      if (!audio.ok) { await dejarError(port, fila.id, audio.error ?? 'no se pudo bajar el audio'); hechos.push({ id: fila.id, ok: false, error: audio.error }); continue }
      motor ??= cargarMotor()
      const wav = Buffer.from(audio.data, 'base64')
      const tr = transcribir(motor, wav)
      if (!tr.ok) { await dejarError(port, fila.id, tr.error, { definitivo: true }); hechos.push({ id: fila.id, ok: false, error: tr.error }); continue }
      const contexto = await contextoDeObra(port, fila.obra_id, fila.fecha)
      let propuesta = proponerParte(tr.texto, contexto)
      if (completar) propuesta = await completar(propuesta, contexto)
      const quedo = await dejarListo(port, fila.id, { texto: tr.texto, propuesta, modelo: tr.modelo, ms: tr.ms })
      hechos.push({ id: fila.id, ok: quedo, segundos: tr.segundos, ms: tr.ms, resumen: propuesta.resumen?.texto })
      log(`✓ dictado ${fila.id}: ${Number(tr.segundos).toFixed(1)} s de audio en ${tr.ms} ms · ${propuesta.resumen?.texto ?? ''}`)
    } catch (e) {
      await dejarError(port, fila.id, `falló la transcripción: ${String(e?.message ?? e).slice(0, 200)}`)
      hechos.push({ id: fila.id, ok: false, error: String(e?.message ?? e) })
    }
  }
  return { reciclados, hechos, motorCargado: motor != null, msCarga: motor?.msCarga ?? null }
}
