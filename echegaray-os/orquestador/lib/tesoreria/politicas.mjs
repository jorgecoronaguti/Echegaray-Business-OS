// POLÍTICAS DE TESORERÍA — lo que el software no decide, y lo que pasa mientras nadie lo decidió.
//
// ═══ LA DISTINCIÓN QUE FALTABA ═══
//
// La primera versión, sin reserva mínima cargada, calculaba el excedente con reserva = 0, lo llamaba
// "excedente invertible" y bajaba la confianza. Eso está mal por una razón concreta: **un número con
// nombre de accionable se usa como accionable**. Nadie lee la nota al pie cuando arriba dice
// "$91.876.679 invertibles".
//
// Ahora hay dos nombres distintos, y no es cosmética:
//
//   TECHO TÉCNICO PRELIMINAR — lo máximo que la aritmética permite. NO es una recomendación.
//                              Existe mientras falte una política aprobada. Nada es accionable.
//   EXCEDENTE APROBADO       — el techo técnico después de aplicar políticas APROBADAS por el dueño.
//                              Sólo esto puede sostener un monto sugerido.
//
// ═══ LA APROBACIÓN NO SE FABRICA ═══
//
// Este módulo puede PROPONER una reserva calculada sobre datos reales. No puede aprobarla. Marcar al
// dueño como aprobador de algo que no aprobó sería falsificar la evidencia que el `CLAUDE.md` raíz
// exige. La propuesta entra a la base como `propuesta` y ahí se queda hasta que una persona corra el
// comando de aprobación.

import { EVIDENCIA, CONFIANZA } from './contratos.mjs'

export const ESTADO_POLITICA = { APROBADA: 'aprobada', PROPUESTA: 'propuesta', AUSENTE: 'ausente', VENCIDA: 'vencida' }

export const METODO_RESERVA = {
  MONTO_FIJO: 'monto_fijo',
  DIAS_EGRESOS: 'dias_egresos',
  PORCENTAJE_EGRESOS: 'porcentaje_egresos',
  PISO_MAS_EGRESOS: 'piso_mas_egresos',
  CONSERVADOR: 'conservador',
}

export const VERSION_POLITICA = 1

// ════════════════════════════════════════════════════════════════════════════
// CAJA RESTRINGIDA — un `null` no es un cero
// ════════════════════════════════════════════════════════════════════════════

export const ESTADO_RESTRINGIDA = {
  KNOWN_ZERO: 'known_zero', // alguien miró y no hay fondos afectados
  KNOWN_POSITIVE: 'known_positive', // hay, y se sabe cuánto
  UNKNOWN: 'unknown', // nadie lo declaró nunca
  UNAVAILABLE: 'unavailable', // la fuente existe y falló
  STALE: 'stale', // el dato existe pero está viejo
}

/** Cuántas horas puede tener el dato antes de considerarse viejo. */
export const HORAS_FRESCURA_RESTRINGIDA = 24 * 30 // una declaración mensual alcanza para este dato

/**
 * Modela la caja restringida SIN convertir la ausencia en cero.
 *
 * El defecto que corrige es sutil y por eso es peligroso: `Number(politica.caja_restringida) || 0`
 * devuelve 0 para `null`, para `undefined`, para `''` y para `NaN`. Los cuatro casos significan cosas
 * distintas, y tres de ellos NO significan "no hay fondos restringidos" — significan "no sé". Restar
 * cero en silencio infla el excedente exactamente con la plata que podría estar embargada o afectada
 * en garantía.
 */
export function modelarCajaRestringida(fila = null, ahora = new Date()) {
  if (fila == null) {
    return {
      restricted_cash_amount: null,
      restricted_cash_status: ESTADO_RESTRINGIDA.UNKNOWN,
      restricted_cash_source: null,
      restricted_cash_confidence: CONFIANZA.NULA,
      restricted_cash_as_of: null,
      // A RESTAR se le pasa lo conservador, no lo cómodo: sin dato NO se puede afirmar que sea cero,
      // así que el monto no se descuenta pero el excedente queda marcado como no accionable.
      monto_a_restar: 0,
      bloquea_accionable: true,
      motivo: 'ninguna fuente del OS declara la caja restringida: desconocido no es cero',
    }
  }
  if (fila.error) {
    return {
      restricted_cash_amount: null,
      restricted_cash_status: ESTADO_RESTRINGIDA.UNAVAILABLE,
      restricted_cash_source: fila.fuente ?? null,
      restricted_cash_confidence: CONFIANZA.NULA,
      restricted_cash_as_of: null,
      monto_a_restar: 0,
      bloquea_accionable: true,
      motivo: `la fuente de caja restringida falló: ${String(fila.error).slice(0, 120)}`,
    }
  }
  // OJO CON LA COERCIÓN. `Number(null)` es 0 y `Number('')` es 0, y los dos son finitos: pasar
  // directo a `Number.isFinite` reintroducía el mismo defecto que este módulo vino a corregir, sólo
  // que un nivel más adentro. El vacío se descarta ANTES de convertir.
  const crudo = fila.monto
  const vacio = crudo == null || (typeof crudo === 'string' && crudo.trim() === '')
  const monto = vacio ? NaN : Number(crudo)
  if (!Number.isFinite(monto)) {
    return {
      restricted_cash_amount: null,
      restricted_cash_status: ESTADO_RESTRINGIDA.UNKNOWN,
      restricted_cash_source: fila.fuente ?? null,
      restricted_cash_confidence: CONFIANZA.NULA,
      restricted_cash_as_of: fila.declarada_en ?? null,
      monto_a_restar: 0,
      bloquea_accionable: true,
      motivo: 'la fila existe pero el monto no es un número',
    }
  }
  const horas = fila.declarada_en ? (ahora.getTime() - Date.parse(fila.declarada_en)) / 3600000 : null
  const vieja = horas != null && horas > HORAS_FRESCURA_RESTRINGIDA
  return {
    restricted_cash_amount: Math.round(monto),
    restricted_cash_status: vieja
      ? ESTADO_RESTRINGIDA.STALE
      : (monto > 0 ? ESTADO_RESTRINGIDA.KNOWN_POSITIVE : ESTADO_RESTRINGIDA.KNOWN_ZERO),
    restricted_cash_source: fila.fuente ?? null,
    restricted_cash_confidence: vieja ? CONFIANZA.BAJA : CONFIANZA.ALTA,
    restricted_cash_as_of: fila.declarada_en ?? null,
    // Un dato viejo SÍ se resta —es lo conservador— pero no habilita accionable por sí solo.
    monto_a_restar: Math.round(monto),
    bloquea_accionable: vieja,
    motivo: vieja ? `el dato tiene ${Math.round(horas / 24)} días: hay que revalidarlo` : null,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RESERVA MÍNIMA — se propone con datos, se aprueba con una persona
// ════════════════════════════════════════════════════════════════════════════

/** Colchón operativo configurable. 0 por defecto: un piso inventado sería un número sin origen. */
export const COLCHON_POR_DEFECTO = 0

/**
 * Propone una reserva mínima sobre datos REALES del calendario. El método es el que pidió el dueño:
 * el MÁXIMO entre los egresos confirmados de los próximos 7 días, las obligaciones fiscales y
 * laborales inmediatas, los pagos críticos de obra, y un colchón configurable.
 *
 * El máximo y no la suma: los cuatro se solapan (una carga social de la semana está en los tres
 * primeros a la vez). Sumarlos sería reservar tres veces el mismo peso y no dejar nada invertible —
 * un conservadurismo que parece prudente y en realidad es un error de cuenta.
 */
export function proponerReservaMinima(dias = [], { colchon = COLCHON_POR_DEFECTO, diasVentana = 7 } = {}) {
  const ventana = dias.slice(0, diasVentana + 1)
  if (!ventana.length) {
    return { monto: null, metodo: METODO_RESERVA.PISO_MAS_EGRESOS, componentes: {}, motivo: 'el calendario no cubre la ventana: no se puede proponer' }
  }
  const sumar = (pred) => ventana.reduce(
    (s, d) => s + (d.movimientos || []).filter(pred).reduce((a, m) => a + (Number(m.monto) || 0), 0), 0,
  )
  const egresos7 = sumar((m) => m.tipo === 'egreso')
  const fiscalLaboral = sumar((m) => m.tipo === 'egreso' && ['impuesto', 'cargas_sociales', 'obligacion'].includes(m.categoria))
  const obra = sumar((m) => m.tipo === 'egreso' && m.obra)
  const componentes = {
    egresos_confirmados_7_dias: Math.round(egresos7),
    obligaciones_fiscales_y_laborales: Math.round(fiscalLaboral),
    pagos_criticos_de_obra: Math.round(obra),
    colchon_operativo: Math.round(colchon),
  }
  return {
    monto: Math.round(Math.max(egresos7, fiscalLaboral, obra, colchon)),
    metodo: METODO_RESERVA.PISO_MAS_EGRESOS,
    unidad: 'ARS',
    componentes,
    dias_ventana: diasVentana,
    explicacion: `máximo entre los egresos confirmados de ${diasVentana} días, las obligaciones fiscales y laborales, los pagos de obra y el colchón operativo`,
    fuente: 'calendario-financiero (Compras, Cheques Emitidos, obligacion_resumen)',
    evidencia: EVIDENCIA.CALCULO,
    version: VERSION_POLITICA,
  }
}

/**
 * Estado de la política de reserva a partir de lo que hay en la base.
 *
 * Nunca marca aprobado lo que no lo está. Si la fila existe sin `aprobada_por`, es una PROPUESTA por
 * más que esté guardada — persistir no es aprobar.
 */
export function estadoReserva(fila = null) {
  if (fila == null) {
    return { estado: ESTADO_POLITICA.AUSENTE, monto: null, aprobada_por: null, motivo: 'no hay política de reserva mínima cargada' }
  }
  const valor = typeof fila.valor === 'object' && fila.valor !== null ? fila.valor : { monto: fila.valor }
  // MISMA DISCIPLINA QUE LA CAJA RESTRINGIDA. `Number(null)` es 0: una política "aprobada" sin monto
  // hacía que la reserva usada fuera $0 y todo pasara a ACCIONABLE. El módulo predicaba "un null no
  // es un cero" para la caja restringida y hacía exactamente eso con la reserva.
  const crudo = valor.monto
  const vacio = crudo == null || (typeof crudo === 'string' && crudo.trim() === '')
  const monto = vacio ? NaN : Number(crudo)
  if (!fila.aprobada_por) {
    return {
      estado: ESTADO_POLITICA.PROPUESTA,
      monto: Number.isFinite(monto) ? Math.round(monto) : null,
      metodo: valor.metodo ?? null,
      aprobada_por: null,
      propuesta_en: fila.creada_en ?? null,
      motivo: 'la política existe como PROPUESTA: guardarla no es aprobarla',
    }
  }
  // Aprobada CON un monto usable, o no está aprobada. Media aprobación no es una aprobación.
  if (!Number.isFinite(monto) || monto < 0) {
    return {
      estado: ESTADO_POLITICA.PROPUESTA,
      monto: null,
      metodo: valor.metodo ?? null,
      aprobada_por: fila.aprobada_por,
      motivo: `la política figura aprobada por ${fila.aprobada_por} pero su monto no es un número usable (${JSON.stringify(crudo)})`,
    }
  }
  return {
    estado: ESTADO_POLITICA.APROBADA,
    monto: Math.round(monto),
    metodo: valor.metodo ?? null,
    aprobada_por: fila.aprobada_por,
    aprobada_en: fila.aprobada_en ?? fila.vigente_desde ?? null,
    vigencia: fila.vigente_hasta ?? null,
    fuente: valor.fuente ?? null,
    version: valor.version ?? VERSION_POLITICA,
    explicacion: valor.explicacion ?? null,
  }
}

/**
 * ¿Se puede accionar? Es la única pregunta que decide si el número se llama techo o excedente.
 * Devuelve el veredicto con TODOS los motivos, no el primero: arreglar uno y descubrir el siguiente
 * al día siguiente es la forma más cara de enterarse.
 */
export function evaluarAccionabilidad({
  reserva, restringida, extractorValidado = false, mercadoFresco = false, mercadoCompleto = false,
} = {}) {
  const bloqueos = []
  if (reserva?.estado !== ESTADO_POLITICA.APROBADA) {
    bloqueos.push(`reserva mínima ${reserva?.estado ?? 'ausente'}: ${reserva?.motivo ?? 'falta aprobación humana explícita'}`)
  }
  if (restringida?.bloquea_accionable) {
    bloqueos.push(`caja restringida ${restringida.restricted_cash_status}: ${restringida.motivo}`)
  }
  if (!extractorValidado) bloqueos.push('el extractor de mercado no fue validado contra la pantalla real')
  if (!mercadoFresco) bloqueos.push('no hay datos de mercado frescos')
  // ELEGIR "LA MEJOR ALTERNATIVA" SOBRE UN MERCADO CORTADO NO ES ELEGIR. En la corrida real, dos de
  // las ocho pantallas agotaron el tope de carga con 320 filas cada una: puede haber más, y una
  // recomendación que no puede afirmar que miró todo no se acciona.
  // DEFAULT `false`, igual que los otros dos de esta firma. Con `true` bastaba con no pasar el
  // parámetro para que la compuerta se diera por cumplida — que es exactamente el defecto
  // `!== false` que este archivo ya había arreglado una vez, reintroducido en la misma función.
  if (!mercadoCompleto) bloqueos.push('el relevamiento de mercado quedó truncado: no se puede afirmar que se miró todo el universo')
  return {
    accionable: bloqueos.length === 0,
    bloqueos,
    etiqueta: bloqueos.length === 0 ? 'excedente_aprobado' : 'techo_tecnico_preliminar',
    estado_recomendacion: bloqueos.length === 0 ? 'ACCIONABLE' : 'NO_ACCIONABLE',
  }
}

/** El comando exacto que una persona tiene que correr para aprobar. Va en la salida, no en un doc. */
export const COMANDO_APROBAR_RESERVA =
  'node orquestador/scripts/tesoreria-politica.mjs aprobar reserva_minima --aprobador "<tu nombre>"'

export const VERSION_SKILL = '1.0.0'
