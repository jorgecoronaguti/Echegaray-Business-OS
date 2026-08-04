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

/**
 * LOS ESTADOS EN QUE PUEDE TERMINAR UNA CORRIDA — la lista está acá y en el check de la base, y un
 * test las compara. No es redundancia: la base es la que manda, pero el código es el que los produce,
 * y cuando uno agrega un estado y la otra no lo conoce, el `update` explota JUSTO en el momento en que
 * la corrida quería registrar que algo salió mal.
 *
 * Pasó con `browser_error` (Chrome caído): la corrida no se podía cerrar, el `catch` de `main()` se
 * llevaba el cierre entero y la fila quedaba `en_curso` para siempre. La siguiente corrida se creía
 * la primera y el rastro del navegador roto no existía en ningún lado.
 */
export const ESTADOS_CORRIDA = Object.freeze([
  'en_curso', 'ok', 'sin_dato', 'session_required', 'browser_error', 'error', 'omitida',
])

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
 *
 * ═══ UNA FILA MALA NO SE LLEVA PUESTA LA CORRIDA ═══
 *
 * El 03/08/2026 la ON de Plaza Logística en UVA (ZPC4O) llegó con la TIR que publica Balanz —
 * 957.395.119,965— y el insert tiró `numeric field overflow`. Como esto corre ANTES de
 * `cerrarCorrida`, la excepción se llevó el análisis de caja entero, que ya estaba bien hecho, y
 * dejó la corrida `en_curso` para siempre: 1 fila de 1.108 borró el trabajo de las otras 1.107.
 *
 * La columna se ensanchó (migración `20260803150000`), pero el día que aparezca otro disparate no
 * puede volver a pasar lo mismo. La fila que falla se registra en `errores_extraccion` —que existía
 * y nadie escribía— y el resto sigue. NO se silencia: el conteo vuelve al llamador y la fila queda
 * con su motivo en la base.
 */
export async function guardarInstrumentos(query, runId, instrumentos = []) {
  let guardados = 0
  const fallidos = []
  for (const i of instrumentos) {
    try {
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
      guardados += 1
    } catch (e) {
      const detalle = `${i.id}: ${String(e?.message ?? e).slice(0, 200)}`
      fallidos.push(detalle)
      await query(
        `insert into tesoreria.errores_extraccion (run_id, url, detalle) values ($1,$2,$3)`,
        [runId, i.url ?? null, detalle],
      ).catch(() => {}) // si ni el registro del error entra, no se pierde el resto de la corrida
    }
  }
  return { guardados, fallidos }
}

/**
 * Recomendaciones. Idempotente por su id, que ya codifica (bloque, día, instrumento): correr dos
 * veces el mismo día no duplica la propuesta, la actualiza.
 *
 * ═══ SE GUARDA LO GENERADO, NO LO PUBLICADO ═══
 *
 * Hasta el 03/08/2026 esta función recibía sólo las propuestas que habían pasado la validación. Como
 * en esta empresa casi ninguna pasa, las dos tablas quedaban VACÍAS mientras el ciclo informaba
 * "1 propuesta · 1 rechazada": lo que se computaba no se persistía, y entonces no había forma de
 * contestar **por qué se rechazó** una decisión de plata. El motivo vivía en memoria y se perdía.
 *
 * Ahora entra todo lo generado. El estado sale de su validación: `propuesta` si la pasó, `rechazada`
 * si no. Publicar sigue siendo otra cosa —lo rechazado no se le manda al dueño— pero auditar deja de
 * depender de que algo se haya publicado.
 *
 * El `estado` NO se pisa en el conflicto: si un humano ya aprobó o rechazó una recomendación, una
 * corrida posterior no puede volver a bajarla a 'propuesta'.
 */
export async function guardarRecomendaciones(query, runId, recs = [], validaciones = []) {
  const porId = new Map(validaciones.map((v) => [v.id, v]))
  let guardadas = 0
  let rechazadas = 0
  for (const r of recs) {
    const v = porId.get(r.id)
    const estado = v && v.aprobada === false ? 'rechazada' : 'propuesta'
    if (estado === 'rechazada') rechazadas += 1
    await query(
      `insert into tesoreria.recomendaciones
         (id, run_id, bloque, instrumento_id, monto_maximo, moneda, horizonte_dias,
          rendimiento_neto_periodo, ganancia_neta_estimada, confianza, estado, vence_en, payload)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (id) do update
         set run_id = excluded.run_id, monto_maximo = excluded.monto_maximo,
             rendimiento_neto_periodo = excluded.rendimiento_neto_periodo,
             ganancia_neta_estimada = excluded.ganancia_neta_estimada,
             confianza = excluded.confianza, vence_en = excluded.vence_en, payload = excluded.payload,
             estado = case when tesoreria.recomendaciones.estado in ('aprobada','rechazada')
                             and excluded.estado = 'propuesta'
                           then tesoreria.recomendaciones.estado
                           else excluded.estado end`,
      [r.id, runId, r.bloque, r.instrumento_id, r.monto_maximo, r.moneda, r.horizonte_dias,
        r.rendimiento_neto_periodo, r.ganancia_neta_estimada, r.confianza, estado, r.vence_en,
        // El payload lleva el veredicto adentro: seis meses después nadie tiene que cruzar dos tablas
        // para saber por qué no se hizo.
        JSON.stringify({ ...r, validacion: v ?? null })],
    )
    guardadas += 1
  }
  const ids = new Set(recs.map((r) => r.id))
  let validacionesGuardadas = 0
  for (const v of validaciones) {
    // La foreign key obliga: una validación sin su recomendación no entra. Con todo lo generado
    // persistido, esto ya no descarta las rechazadas — descarta sólo lo que de verdad no existe.
    if (!ids.has(v.id)) continue
    await query(
      `insert into tesoreria.validaciones (recomendacion_id, validado_en, aprobada, fallas, chequeos)
       values ($1,$2,$3,$4,$5)`,
      [v.id, v.validado_en, v.aprobada, v.fallas ?? [], JSON.stringify(v.chequeos ?? [])],
    )
    validacionesGuardadas += 1
  }
  return { guardadas, rechazadas, validaciones: validacionesGuardadas, sin_recomendacion: validaciones.length - validacionesGuardadas }
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

/**
 * La composición de cuentas de la última corrida válida. Es la única forma de detectar una cuenta
 * que DESAPARECIÓ de la pestaña: contra una sola foto, una fila rota y una cuenta en cero se ven igual.
 */
export async function composicionAnterior(query) {
  const { rows } = await query(
    `select payload from tesoreria.posiciones
      where payload ? 'composicion' and payload->'composicion' is not null
      order by observado_en desc limit 1`,
  )
  return rows[0]?.payload?.composicion ?? null
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
