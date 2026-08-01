// EL LEDGER DEL TESORERO — qué corrió, con qué dato, qué decidió y qué bloqueó.
//
// ═══ POR QUÉ SE GUARDA TODO ESTO ═══
//
// Una recomendación financiera sin su contexto no se puede auditar seis meses después. La pregunta
// que hay que poder contestar no es "¿qué recomendó?" sino **"¿con qué dato tenía delante cuando lo
// recomendó?"**. Por eso se guarda el saldo, la ventana, la tasa observada y su hora, y no sólo el
// resultado.
//
// ═══ LO QUE NUNCA SE PISA ═══
//
// Las observaciones de mercado son un histórico inmutable: cada lectura es una fila. Las
// recomendaciones sí se reemplazan por su clave estable — una segunda corrida del mismo día sobre el
// mismo bloque y el mismo instrumento es la MISMA recomendación actualizada, no una nueva.
//
// ═══ LO QUE NUNCA ENTRA ═══
//
// Ni un token, ni una cookie, ni una captura del sitio autenticado. El registro de un bloqueo lleva
// la etiqueta del elemento y 80 caracteres de texto: alcanza para auditar la barrera y no reconstruye
// una pantalla con saldos de la cuenta del dueño.

import { esAptoTesoreria } from './instrumentos.mjs'

/** Abre una corrida y devuelve su run_id. Todo lo demás cuelga de acá. */
export async function abrirCorrida(query, { correlationId = null, spreadsheetId = null } = {}) {
  const { rows } = await query(
    `insert into tesoreria.corridas (correlation_id, spreadsheet_id, estado)
     values ($1, $2, 'en_curso') returning run_id`,
    [correlationId, spreadsheetId],
  )
  return rows[0].run_id
}

export async function cerrarCorrida(query, runId, { estado, motivo = null, publicado = false, sesion = null, payload = null, rangos = [] }) {
  await query(
    `update tesoreria.corridas
        set terminada_en = now(), estado = $2, motivo = $3, publicado = $4,
            sesion_balanz = $5, payload = $6, rangos_leidos = $7
      where run_id = $1`,
    [runId, estado, motivo, publicado, sesion, payload ? JSON.stringify(payload) : null, rangos],
  )
}

/** La foto de caja con la que se decidió. */
export async function guardarPosicion(query, runId, p) {
  if (p?.estado !== 'ok') return
  await query(
    `insert into tesoreria.posiciones
       (run_id, en_descubierto, caja_real, caja_comprometida, caja_restringida, caja_minima,
        caja_excedente, confianza, datos_faltantes, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [runId, p.en_descubierto, p.caja_real, p.caja_comprometida,
      p.caja_restringida?.monto_a_restar ?? null, p.caja_minima,
      // La columna se llama `caja_excedente` desde la primera versión. Lo que se guarda es el TECHO
      // TÉCNICO, y `excedente_aprobado` va en el payload: renombrar la columna obligaría a una
      // migración destructiva para ganar claridad que el payload ya da.
      p.techo_tecnico_preliminar, p.confianza, p.datos_faltantes ?? [],
      JSON.stringify({
        detalle: p.detalle ?? {}, composicion: p.composicion ?? null,
        reserva: p.reserva ?? null, caja_restringida: p.caja_restringida ?? null,
        excedente_aprobado: p.excedente_aprobado ?? null, etiqueta_monto: p.etiqueta_monto ?? null,
        accionable: Boolean(p.accionable), bloqueos: p.bloqueos_accionabilidad ?? [],
      })],
  )
}

export async function guardarVentanas(query, runId, ventanas = []) {
  for (const v of ventanas) {
    await query(
      `insert into tesoreria.ventanas
         (run_id, bloque, moneda, monto_maximo, fecha_inicial, fecha_limite, dias_libres, motivo, confianza, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [runId, v.bloque, v.moneda ?? 'ARS', v.monto_maximo, v.fecha_inicial, v.fecha_limite,
        v.dias_libres, v.motivo, v.confianza, JSON.stringify(v)],
    )
  }
}

/**
 * Instrumentos y observaciones. El instrumento se hace upsert (es una identidad estable); la
 * observación SIEMPRE inserta.
 */
export async function guardarInstrumentos(query, runId, instrumentos = []) {
  for (const i of instrumentos) {
    await query(
      `insert into tesoreria.instrumentos (id, nombre, ticker, categoria, emisor, moneda, apto_tesoreria)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set nombre = excluded.nombre, visto_ultimo = now()`,
      [i.id, i.nombre, i.ticker, i.categoria, i.emisor, i.moneda, esAptoTesoreria(i.categoria)],
    )
    await query(
      `insert into tesoreria.observaciones
         (run_id, instrumento_id, observado_en, precio, tasa_tipo, tasa_valor, tasa_naturaleza,
          plazo_rescate_dias, liquidacion_dias, costos, evidencia, campos_faltantes, url)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [runId, i.id, i.observado_en, i.precio, i.tasa?.tipo ?? null, i.tasa?.valor ?? null,
        i.tasa?.naturaleza ?? null, i.plazo_rescate_dias, i.liquidacion_dias,
        JSON.stringify(i.costos ?? {}), i.evidencia, i.campos_faltantes ?? [], i.url],
    )
  }
}

/**
 * Recomendaciones. Idempotente por su id, que ya codifica (bloque, día, instrumento): correr dos
 * veces el mismo día no duplica la propuesta, la actualiza.
 */
export async function guardarRecomendaciones(query, runId, recs = [], validaciones = []) {
  for (const r of recs) {
    await query(
      `insert into tesoreria.recomendaciones
         (id, run_id, bloque, instrumento_id, monto_maximo, moneda, horizonte_dias,
          rendimiento_neto_periodo, ganancia_neta_estimada, confianza, estado, vence_en, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'propuesta',$11,$12)
       on conflict (id) do update
         set run_id = excluded.run_id, monto_maximo = excluded.monto_maximo,
             rendimiento_neto_periodo = excluded.rendimiento_neto_periodo,
             ganancia_neta_estimada = excluded.ganancia_neta_estimada,
             confianza = excluded.confianza, vence_en = excluded.vence_en, payload = excluded.payload`,
      [r.id, runId, r.bloque, r.instrumento_id, r.monto_maximo, r.moneda, r.horizonte_dias,
        r.rendimiento_neto_periodo, r.ganancia_neta_estimada, r.confianza, r.vence_en, JSON.stringify(r)],
    )
  }
  for (const v of validaciones) {
    if (!recs.some((r) => r.id === v.id)) continue // sólo las de recomendaciones persistidas
    await query(
      `insert into tesoreria.validaciones (recomendacion_id, validado_en, aprobada, fallas, chequeos)
       values ($1,$2,$3,$4,$5)`,
      [v.id, v.validado_en, v.aprobada, v.fallas ?? [], JSON.stringify(v.chequeos ?? [])],
    )
  }
}

/** Bloqueos de la barrera. Es la evidencia de que NO se operó. */
export async function guardarBloqueos(query, runId, bloqueos = []) {
  for (const b of bloqueos) {
    await query(
      `insert into tesoreria.bloqueos_seguridad (run_id, ocurrido_en, motivo, coincidencia, campo, elemento)
       values ($1,$2,$3,$4,$5,$6)`,
      [runId, b.en, b.motivo, b.coincidencia, b.campo, JSON.stringify(b.elemento ?? {})],
    )
  }
}

/** El resumen de la corrida anterior, para decidir si el cambio es material. */
export async function resumenAnterior(query) {
  const { rows } = await query(
    `select payload from tesoreria.corridas
      where estado in ('ok','session_required') and payload is not null
      order by iniciada_en desc limit 1`,
  )
  return rows[0]?.payload?.resumen ?? null
}

/** Marca vencidas las propuestas que pasaron su fecha. Un vencido en pantalla es un riesgo. */
export async function vencerPropuestas(query) {
  const { rowCount } = await query(
    `update tesoreria.recomendaciones set estado = 'vencida'
      where estado = 'propuesta' and vence_en <= now()`,
  )
  return rowCount ?? 0
}

/**
 * FILA de política vigente por clave — la fila ENTERA, no sólo el valor.
 *
 * Devolver únicamente `valor` era el atajo que hacía imposible distinguir una política aprobada de
 * una propuesta guardada: el aprobador vive en la fila, no en el valor. Sin él, persistir se
 * confundía con aprobar.
 */
export async function politicaVigente(query, clave) {
  const { rows } = await query(
    `select id, clave, valor, aprobada_por, aprobada_en, vigente_desde, vigente_hasta, motivo, creada_en
       from tesoreria.politicas
      where clave = $1 and vigente_desde <= now() and (vigente_hasta is null or vigente_hasta > now())
      order by vigente_desde desc limit 1`,
    [clave],
  )
  return rows[0] ?? null
}

/** La caja restringida se guarda como política declarada: misma tabla, mismo workflow de aprobación. */
export async function filaCajaRestringida(query) {
  const fila = await politicaVigente(query, 'caja_restringida')
  if (!fila) return null
  const v = typeof fila.valor === 'object' && fila.valor !== null ? fila.valor : {}
  return { monto: v.monto, fuente: v.fuente ?? fila.motivo ?? null, declarada_en: v.declarada_en ?? fila.aprobada_en ?? fila.vigente_desde }
}
