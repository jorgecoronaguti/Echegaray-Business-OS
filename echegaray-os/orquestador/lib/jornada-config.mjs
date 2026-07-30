// JORNADA POR CONFIGURACIÓN — el calendario de la empresa, como DATO y no como código.
//
// QUÉ PROBLEMA RESUELVE. `jornada-politica.mjs` calibra la jornada leyendo la propia planilla:
// mira qué se cargó históricamente cada día de la semana y saca la moda. Eso funciona para la
// semana normal y es ciego a los días que son excepción por decisión o por ley: un feriado, una
// media jornada de fin de año, un cambio de horario de verano. La planilla no puede calibrar un
// 1° de mayo porque justamente ese día no hay nada cargado — y "sin evidencia" terminaba
// tratándose igual que "día común".
//
// Sin esto, la pantalla precarga a todos en presente un feriado y alguien tiene que acordarse de
// corregir 40 filas a mano. Con esto, el feriado llega precargado en 0 con motivo `franco`.
//
// LA PLANILLA SIGUE MANDANDO. Esta tabla es una capa de EXCEPCIONES por encima de la
// calibración, no un reemplazo: si no hay configuración para la fecha se devuelve
// `sin_config` y decide `jornada-politica.mjs`. La precedencia entre las dos vive en un solo
// lugar (`jornadaEfectiva`) para que la pantalla web y el flujo de Mattermost no la escriban
// cada uno a su manera.
//
// NADA HARDCODEADO. Ni un feriado, ni un número de horas, ni un día de la semana están en este
// archivo. Cambiar el calendario del año que viene es insertar filas, no desplegar código.
//
// NUNCA INVENTA UN NÚMERO. Una fecha sin regla devuelve `horas: null`. Una regla cargada con
// `horas` en null (el caso del sábado, que en el archivo no tiene una regla única) también:
// significa "esto se carga a mano", no "esto vale cero".

/** Tipos de regla que este módulo sabe traducir a un `origen` del contrato. */
export const TIPO = Object.freeze({
  FERIADO: 'feriado',
  MEDIA_JORNADA: 'media_jornada',
  CONFIG_DIA: 'config_dia',
})

/** Orígenes posibles del número devuelto. `sin_config` = decide la calibración de la planilla. */
export const ORIGEN = Object.freeze({ ...TIPO, SIN_CONFIG: 'sin_config' })

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Día de la semana (0 = domingo … 6 = sábado) de una fecha `AAAA-MM-DD`.
 *
 * En UTC a propósito. `new Date('2026-07-30').getDay()` en San Juan (UTC−3) devuelve el día
 * ANTERIOR, porque el string se parsea como medianoche UTC y se muestra en horario local. Ese
 * corrimiento silencioso convertiría un viernes de 8 horas en un jueves de 9.
 *
 * Devuelve `null` si la fecha no existe (32/13, o un 30 de febrero).
 */
export function diaSemanaDe(fecha) {
  const m = RE_FECHA.exec(String(fecha ?? '').trim())
  if (!m) return null
  const [, a, mes, d] = m.map(Number)
  const dt = new Date(Date.UTC(a, mes - 1, d))
  // Round-trip: Date.UTC(2026, 1, 30) no falla, se desborda a marzo. Se compara para detectarlo.
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null
  return dt.getUTCDay()
}

const SQL = `
  select c.tipo, c.horas, c.etiqueta
    from comunicacion.jornada_config c
    join comunicacion.jornada_tipo_regla t on t.tipo = c.tipo
   where c.activo
     and (
           c.fecha = $1::date
        or (c.fecha is null
            and c.dia_semana = $2
            and (c.vigente_desde is null or c.vigente_desde <= $1::date)
            and (c.vigente_hasta is null or c.vigente_hasta >= $1::date))
     )
   order by (c.fecha is null), t.prioridad, c.id desc
   limit 1`

/**
 * Jornada configurada para una fecha.
 *
 * Precedencia, resuelta en la consulta: primero las reglas de FECHA EXACTA (un feriado, una
 * media jornada puntual) y recién después las de día de la semana; dentro de cada grupo, la
 * `prioridad` del tipo. Con eso, un 24 de diciembre configurado como media jornada gana
 * sobre "los jueves son de 9", sin que el código tenga que conocer diciembre.
 *
 * @param {{query:Function}} port  pool del OS
 * @param {{fecha:string}} opts    fecha en formato AAAA-MM-DD
 * @returns {Promise<{horas:number|null, origen:string, etiqueta?:string}>}
 */
export async function jornadaConfigurada(port, { fecha } = {}) {
  const dow = diaSemanaDe(fecha)
  if (dow == null) {
    throw new Error(`No entendí la fecha «${String(fecha ?? '')}». Se espera AAAA-MM-DD.`)
  }
  let rows
  try {
    ;({ rows } = await port.query(SQL, [String(fecha).trim(), dow]))
  } catch (e) {
    // No se degrada en silencio a `sin_config`: si la base no responde, un feriado pasaría
    // desapercibido y la pantalla precargaría a todos presentes. Se avisa y se corta.
    const detalle = String(e?.message ?? e).slice(0, 200)
    throw new Error(`No pude leer la configuración de jornada: ${detalle}`)
  }
  const r = rows?.[0]
  if (!r) return { horas: null, origen: ORIGEN.SIN_CONFIG }

  const horas = r.horas == null ? null : Number(r.horas)
  const etiqueta = r.etiqueta == null ? undefined : String(r.etiqueta)
  if (horas == null || !Number.isFinite(horas)) {
    // Regla cargada a propósito SIN número (el sábado): existe, y dice que no hay jornada
    // defendible. Se devuelve `sin_config` para que decida la calibración de la planilla, y
    // se conserva la etiqueta para poder mostrar por qué.
    return { horas: null, origen: ORIGEN.SIN_CONFIG, ...(etiqueta ? { etiqueta } : {}) }
  }
  return { horas, origen: r.tipo, ...(etiqueta ? { etiqueta } : {}) }
}

/**
 * Jornada que finalmente se usa, combinando configuración y calibración de la planilla.
 *
 * ÚNICO lugar donde vive la precedencia. La configuración es una capa de excepciones: manda
 * cuando dice algo (incluido un feriado de 0 horas, que es una afirmación, no un vacío); si
 * no dice nada, manda la planilla, que sigue siendo la fuente de verdad.
 *
 * `requiere_manual: true` significa que ninguna de las dos tiene un número defendible y hay
 * que ingresar las horas a mano — no que valgan cero.
 *
 * PURA: no toca red ni base. `calibrada` es lo que devuelve `horasJornadaCompleta`.
 */
export function jornadaEfectiva({ config = null, calibrada = null } = {}) {
  if (config && config.horas != null && config.origen !== ORIGEN.SIN_CONFIG) {
    return {
      horas: Number(config.horas),
      origen: config.origen,
      requiere_manual: false,
      ...(config.etiqueta ? { etiqueta: config.etiqueta } : {}),
    }
  }
  const horas = calibrada?.horas ?? null
  return {
    horas,
    origen: horas == null ? ORIGEN.SIN_CONFIG : (calibrada?.origen ?? ORIGEN.SIN_CONFIG),
    requiere_manual: horas == null,
    ...(config?.etiqueta ? { etiqueta: config.etiqueta } : {}),
    ...(calibrada?.muestras != null ? { muestras: calibrada.muestras } : {}),
  }
}
