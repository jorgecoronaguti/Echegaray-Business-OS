// ¿EL BUSCADOR ESTÁ MEJORANDO O ME PARECE?
//
// Sin esto, la única evidencia de que el buscador anda bien es que nadie se quejó. Y "nadie se
// quejó" es lo que pasa también cuando la gente dejó de usarlo.
//
// La métrica que manda no es cuántas búsquedas hubo: es CUÁNTAS VECES ALGUIEN TUVO QUE
// CORREGIRLO. Un buscador que contesta rápido y que la gente desmiente el 30 % de las veces
// está peor que uno más lento que acierta. `corregidas` y `rechazadas` son las que hay que
// mirar; el resto es contexto.
//
// Los agregados viven en vistas SQL (ver la migración) para que el panel del OS los consuma
// sin repetir la lógica. Acá sólo se leen. Si una consulta falla, se devuelve lo que se pudo:
// un tablero incompleto sirve, un tablero que explota no.

const seguro = async (fn, alFallar) => {
  try { return await fn() } catch { return alFallar }
}

const num = (v) => (v == null ? null : Number(v))

/** El resumen de salud. Todo en una fila. */
export async function resumen(port) {
  if (!port?.query) return null
  return seguro(async () => {
    const { rows } = await port.query('select * from public.v_drive_busqueda_metricas')
    const r = rows?.[0]
    if (!r) return null
    const busquedas = num(r.busquedas) ?? 0
    const propuestas = (num(r.directas) ?? 0) + (num(r.propuestas) ?? 0)
    return {
      busquedas,
      directas: num(r.directas) ?? 0,
      propuestas: num(r.propuestas) ?? 0,
      aclaraciones: num(r.aclaraciones) ?? 0,
      sinResultado: num(r.sin_resultado) ?? 0,
      confirmadas: num(r.confirmadas) ?? 0,
      rechazadas: num(r.rechazadas) ?? 0,
      corregidas: num(r.corregidas) ?? 0,
      usuarios: num(r.usuarios) ?? 0,
      msPromedio: num(r.ms_promedio),
      msP95: num(r.ms_p95),
      scorePromedioGanador: num(r.score_promedio_ganador),
      desde: r.desde ?? null,
      hasta: r.hasta ?? null,
      // TASA DE ACIERTO DIRECTO: de todo lo que se buscó, cuánto se resolvió sin preguntar.
      // Se calcula acá y no en SQL porque una división por cero en una vista devuelve null y
      // un tablero con un guión donde debería ir un 0 % hace dudar de todo lo demás.
      tasaDirecta: busquedas ? Number(((num(r.directas) ?? 0) / busquedas).toFixed(3)) : null,
      tasaCorreccion: propuestas ? Number(((num(r.corregidas) ?? 0) / propuestas).toFixed(3)) : null,
      tasaSinResultado: busquedas ? Number(((num(r.sin_resultado) ?? 0) / busquedas).toFixed(3)) : null,
    }
  }, null)
}

/** Los documentos más pedidos. Dice qué le importa a la empresa, medido, no supuesto. */
export async function documentos(port, { limite = 10 } = {}) {
  if (!port?.query) return []
  return seguro(async () => {
    const { rows } = await port.query(
      `select drive_file_id, nombre, ruta, veces, confirmadas, usuarios, ultima
         from public.v_drive_busqueda_documentos order by veces desc, ultima desc limit $1`,
      [limite],
    )
    return rows ?? []
  }, [])
}

/** Los alias más usados, con el documento al que se promovieron (o ninguno todavía). */
export async function alias(port, { limite = 10 } = {}) {
  if (!port?.query) return []
  return seguro(async () => {
    const { rows } = await port.query(
      `select alias, busquedas, confirmaciones, usuarios, documento, confianza, origen
         from public.v_drive_busqueda_alias order by busquedas desc limit $1`,
      [limite],
    )
    return rows ?? []
  }, [])
}

/** Lo que no encontró nada. Es la lista de trabajo: cada fila es alguien que se quedó sin
 *  respuesta, y la mayoría se arregla con un alias o indexando una carpeta que falta. */
export async function sinResultado(port, { limite = 10 } = {}) {
  if (!port?.query) return []
  return seguro(async () => {
    const { rows } = await port.query(
      `select consulta_norm, count(*)::int as veces, max(creado_at) as ultima,
              (array_agg(consulta order by creado_at desc))[1] as ejemplo
         from public.drive_busqueda_evento where etapa is null
        group by consulta_norm order by veces desc limit $1`,
      [limite],
    )
    return rows ?? []
  }, [])
}

/** Distribución de los puntajes del ganador, por tramos. Sirve para ver si el ranking
 *  discrimina o si está amontonando todo en el mismo rango. */
export async function distribucionScores(port) {
  if (!port?.query) return []
  return seguro(async () => {
    const { rows } = await port.query(
      `select tramo, count(*)::int as veces from (
         select case
           when (candidatos->0->>'score')::numeric < 400 then 'a) <400'
           when (candidatos->0->>'score')::numeric < 800 then 'b) 400-800'
           when (candidatos->0->>'score')::numeric < 1200 then 'c) 800-1200'
           else 'd) 1200+' end as tramo
           from public.drive_busqueda_evento
          where jsonb_array_length(candidatos) > 0
       ) t group by tramo order by tramo`,
    )
    return rows ?? []
  }, [])
}

/** Todo junto, para el panel. Una sola llamada, cinco consultas chicas. */
export async function panel(port, opts = {}) {
  const [salud, docs, als, sin, dist] = await Promise.all([
    resumen(port), documentos(port, opts), alias(port, opts),
    sinResultado(port, opts), distribucionScores(port),
  ])
  return { salud, documentos: docs, alias: als, sinResultado: sin, distribucion: dist }
}
