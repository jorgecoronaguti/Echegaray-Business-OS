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
//
// FERIADO ≠ DÍA NO LABORABLE. Son dos figuras distintas y confundirlas cuesta caro en las dos
// direcciones. En un FERIADO no se trabaja y, si se trabaja, se paga doble (LCT art. 166): el
// módulo precarga 0. En un DÍA NO LABORABLE trabajar o no lo decide el empleador y se paga
// simple (LCT art. 167): el módulo NO precarga 0, precarga la jornada normal y avisa. Bajo esa
// segunda figura caen los días turísticos que fija el Poder Ejecutivo, el Jueves Santo, el día
// del gremio de la construcción y los asuetos provinciales de San Juan. Tratarlos como feriado
// mandaría a la cuadrilla entera a franco un día en que la obra trabaja.
//
// Cada regla trae además `alcance` (de qué jurisdicción sale: nacional, provincial San Juan,
// municipal, gremial o de la empresa) y `clase` (qué figura es: inamovible, trasladable,
// trasladado, turístico…). Son DESCRIPTIVOS: no cambian el número, permiten explicarlo — y
// permiten saber, al armar el calendario del año que viene, cuáles fechas no se pueden copiar
// del año anterior porque el Ejecutivo las corre.

/** Tipos de regla que este módulo sabe traducir a un `origen` del contrato. */
export const TIPO = Object.freeze({
  FERIADO: 'feriado',
  MEDIA_JORNADA: 'media_jornada',
  CONFIG_DIA: 'config_dia',
  DIA_NO_LABORABLE: 'dia_no_laborable',
})

/** Orígenes posibles del número devuelto. `sin_config` = decide la calibración de la planilla. */
export const ORIGEN = Object.freeze({ ...TIPO, SIN_CONFIG: 'sin_config' })

/**
 * Jurisdicción de la que sale una regla. VOCABULARIO, no calendario: acá no hay ninguna fecha
 * ni ninguna cantidad de horas. Son los mismos valores del catálogo `comunicacion.jornada_alcance`,
 * expuestos para que quien consuma este módulo no compare contra strings sueltos.
 *
 * El código NUNCA filtra ni decide por estos valores: un alcance que se agregue mañana en la
 * base viaja igual hasta la pantalla sin tocar este archivo.
 */
export const ALCANCE = Object.freeze({
  NACIONAL: 'nacional',
  PROVINCIAL: 'provincial', // San Juan
  MUNICIPAL: 'municipal',
  GREMIAL: 'gremial', // CCT 76/75, UOCRA
  EMPRESA: 'empresa',
})

/**
 * Figura jurídica de la regla. `alcance` dice DE DÓNDE sale; `clase` dice QUÉ ES.
 *
 * La distinción que importa en obra: `inamovible` y `trasladable`/`trasladado` son FERIADOS
 * (no se trabaja, y si se trabaja se paga doble); las otras cuatro son DÍAS NO LABORABLES,
 * donde trabajar o no lo decide el empleador y se paga simple.
 */
export const CLASE = Object.freeze({
  INAMOVIBLE: 'inamovible',
  TRASLADABLE: 'trasladable', // trasladable que este año quedó en su fecha
  TRASLADADO: 'trasladado', // trasladable efectivamente corrido
  TURISTICO: 'turistico',
  NO_LABORABLE_LEY: 'no_laborable_ley', // Jueves Santo
  NO_LABORABLE_CCT: 'no_laborable_cct', // día del gremio de la construcción
  ASUETO_ADMINISTRATIVO: 'asueto_administrativo', // provincial o municipal
})

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

const armarSql = (campos) => `
  select ${campos}
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

/** Lo que existe desde 20260731090000. */
const SQL_BASE = armarSql('c.tipo, c.horas, c.etiqueta, c.alcance, c.nota')
/** Lo que agrega 20260731120000: la figura jurídica y quién decide si se trabaja. */
const SQL_CALENDARIO = armarSql('c.tipo, c.horas, c.etiqueta, c.alcance, c.nota, c.clase, t.decide_empleador')

/** Postgres: `undefined_column`. Es la firma exacta de "todavía no corrió 20260731120000". */
const COLUMNA_INEXISTENTE = '42703'

/**
 * Consulta la regla vigente, tolerando que la migración del calendario no esté aplicada todavía.
 *
 * SIN estado en el módulo a propósito: un flag "ya sé que la base es vieja" haría que el
 * resultado dependa del orden de las llamadas, y eso es exactamente lo que no se puede depurar
 * a las siete de la mañana. El costo del reintento se paga sólo mientras falte la migración.
 */
async function consultar(port, fecha, dow) {
  try {
    return await port.query(SQL_CALENDARIO, [fecha, dow])
  } catch (e) {
    if (e?.code !== COLUMNA_INEXISTENTE) throw e
    return await port.query(SQL_BASE, [fecha, dow])
  }
}

/** Campos descriptivos de la regla. Se omite el que viene vacío: nada de `undefined` al guardar. */
function descripcionDe(r) {
  const texto = (v) => (v == null || String(v).trim() === '' ? undefined : String(v).trim())
  const etiqueta = texto(r.etiqueta)
  const alcance = texto(r.alcance)
  const clase = texto(r.clase)
  const nota = texto(r.nota)
  return {
    ...(etiqueta ? { etiqueta } : {}),
    ...(alcance ? { alcance } : {}),
    ...(clase ? { clase } : {}),
    ...(nota ? { nota } : {}),
    ...(r.decide_empleador === true ? { decide_empleador: true } : {}),
  }
}

/**
 * Jornada configurada para una fecha.
 *
 * Precedencia, resuelta en la consulta: primero las reglas de FECHA EXACTA (un feriado, una
 * media jornada puntual) y recién después las de día de la semana; dentro de cada grupo, la
 * `prioridad` del tipo. Con eso, un 24 de diciembre configurado como media jornada gana
 * sobre "los jueves son de 9", sin que el código tenga que conocer diciembre. La misma
 * precedencia resuelve el 2 de abril de 2026, que es feriado inamovible y Jueves Santo a la
 * vez: gana el feriado, que es la figura más restrictiva.
 *
 * Devuelve además, cuando la fila los trae, `alcance` (nacional · provincial San Juan ·
 * municipal · gremial · empresa), `clase` (inamovible · trasladable · trasladado · turístico ·
 * no laborable) y `decide_empleador`. Son descriptivos: no cambian el número, permiten
 * explicarlo.
 *
 * @param {{query:Function}} port  pool del OS
 * @param {{fecha:string}} opts    fecha en formato AAAA-MM-DD
 * @returns {Promise<{horas:number|null, origen:string, regla?:string, etiqueta?:string,
 *                    alcance?:string, clase?:string, nota?:string, decide_empleador?:boolean}>}
 */
export async function jornadaConfigurada(port, { fecha } = {}) {
  const dow = diaSemanaDe(fecha)
  if (dow == null) {
    throw new Error(`No entendí la fecha «${String(fecha ?? '')}». Se espera AAAA-MM-DD.`)
  }
  let rows
  try {
    ;({ rows } = await consultar(port, String(fecha).trim(), dow))
  } catch (e) {
    // No se degrada en silencio a `sin_config`: si la base no responde, un feriado pasaría
    // desapercibido y la pantalla precargaría a todos presentes. Se avisa y se corta.
    const detalle = String(e?.message ?? e).slice(0, 200)
    throw new Error(`No pude leer la configuración de jornada: ${detalle}`)
  }
  const r = rows?.[0]
  if (!r) return { horas: null, origen: ORIGEN.SIN_CONFIG }

  const horas = r.horas == null ? null : Number(r.horas)
  const descripcion = descripcionDe(r)
  if (horas == null || !Number.isFinite(horas)) {
    // Regla cargada a propósito SIN número: el sábado, que en el archivo no tiene una jornada
    // única, y todos los DÍAS NO LABORABLES, donde el default legal del sector privado es que
    // se trabaja (LCT art. 167) y poner 0 sería afirmar lo contrario.
    //
    // Se devuelve `sin_config` para que decida la calibración de la planilla, pero se conserva
    // `regla` con el tipo real: es la diferencia entre "no hay ninguna regla para este día" y
    // "hay una regla y dice que el número lo pone otro". La pantalla necesita esa diferencia
    // para poder avisar.
    return { horas: null, origen: ORIGEN.SIN_CONFIG, regla: String(r.tipo), ...descripcion }
  }
  return { horas, origen: r.tipo, ...descripcion }
}

/** Lo descriptivo de la configuración, que viaja hasta la pantalla decida quien decida el número. */
function contextoDe(config) {
  if (!config) return {}
  return {
    ...(config.etiqueta ? { etiqueta: config.etiqueta } : {}),
    ...(config.alcance ? { alcance: config.alcance } : {}),
    ...(config.clase ? { clase: config.clase } : {}),
    ...(config.nota ? { nota: config.nota } : {}),
    ...(config.decide_empleador === true ? { decide_empleador: true } : {}),
  }
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
 * UN DÍA NO LABORABLE NO ES UN FERIADO. La regla existe, viaja entera (etiqueta, clase,
 * alcance, nota) y marca `decide_empleador: true`, pero NO impone 0 horas: en el sector
 * privado trabajar o no ese día lo decide el empleador (LCT art. 167) y el default es que la
 * obra trabaja. Se precarga la jornada normal y la pantalla avisa de qué día se trata. Poner 0
 * mandaría a cuarenta personas a franco por una fecha que nadie decidió.
 *
 * PURA: no toca red ni base. `calibrada` es lo que devuelve `horasJornadaCompleta`.
 */
export function jornadaEfectiva({ config = null, calibrada = null } = {}) {
  const contexto = contextoDe(config)
  if (config && config.horas != null && config.origen !== ORIGEN.SIN_CONFIG) {
    return { horas: Number(config.horas), origen: config.origen, requiere_manual: false, ...contexto }
  }
  const horas = calibrada?.horas ?? null
  return {
    horas,
    origen: horas == null ? ORIGEN.SIN_CONFIG : (calibrada?.origen ?? ORIGEN.SIN_CONFIG),
    requiere_manual: horas == null,
    ...contexto,
    ...(calibrada?.muestras != null ? { muestras: calibrada.muestras } : {}),
  }
}

/**
 * ¿Este día es un feriado propiamente dicho? Lo pregunta quien tiene que decidir si precargar
 * a la cuadrilla en franco o en presente.
 *
 * Se responde por el TIPO de regla, no por la clase ni por la etiqueta: la clase es
 * descriptiva y puede crecer en la base sin desplegar código, el tipo es el que gobierna la
 * precedencia. Un día no laborable —turístico, Jueves Santo, día del gremio, asueto
 * provincial— devuelve `false`.
 */
export function esFeriado(config) {
  return config?.origen === TIPO.FERIADO || config?.regla === TIPO.FERIADO
}

/**
 * ¿Hay una regla para este día que la pantalla tenga que mostrar aunque no cambie las horas?
 *
 * `true` para un día no laborable, para un feriado, y para toda regla que exista pero no haya
 * puesto un número (el sábado). En los tres casos ese día no es un día común, y callárselo es
 * dejar que el jefe cargue la quincena sin enterarse.
 *
 * `false` para un `config_dia` que sí resolvió las horas: ahí no hay nada que avisar, es la
 * jornada normal.
 */
export function tieneAviso(config) {
  if (!config) return false
  return config.decide_empleador === true || esFeriado(config) || config.regla != null
}
