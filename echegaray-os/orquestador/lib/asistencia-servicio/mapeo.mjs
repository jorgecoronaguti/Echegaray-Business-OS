// TRADUCCIÓN entre el núcleo y la pantalla. Sin red, sin base: todo puro y testeable.
//
// El núcleo habla de bloques, celdas, formas de fórmula y estados (`presente`, `parcial`,
// `tarde`, `ausente`). La pantalla habla de personas, un tilde y un número de horas.
// Esta es la única capa donde se cruzan los dos idiomas — y NO agrega reglas: no decide
// horas, no decide motivos, no decide filas. Sólo traduce.

import { ESTADO, FORMA, describirCarga } from '../horas-extra.mjs'
import { SIN_CAMBIO, MOTIVO as MOTIVO_NUCLEO } from '../tools/jornales-asistencia.mjs'
import { fechaLegible } from './fechas.mjs'

/** Motivos del núcleo → castellano, para que el jefe lea una frase y no un código. */
const MENSAJE = Object.freeze({
  [MOTIVO_NUCLEO.FECHA_NO_EN_JORNALES]: 'La planilla JORNALES todavía no tiene la columna del {fecha}.',
  [MOTIVO_NUCLEO.PESTANA_NO_ENCONTRADA]: 'No encontré la pestaña de JORNALES para ese año.',
  [MOTIVO_NUCLEO.SIN_PERSONAL]: 'Esa obra no tiene personal cargado en la planilla para el {fecha}.',
  [MOTIVO_NUCLEO.OBRA_DESCONOCIDA]: 'Esa obra no figura en la planilla para el {fecha}.',
  [MOTIVO_NUCLEO.CONFLICTO_CONCURRENCIA]: 'Alguien cambió la planilla mientras cargabas. No se escribió nada: recargá y revisá.',
  [MOTIVO_NUCLEO.PESTANA_PROTEGIDA]: 'La pestaña de JORNALES está tomada y no se puede escribir ahora.',
  [MOTIVO_NUCLEO.VERIFICACION_FALLIDA]: 'La planilla no quedó con los valores enviados. Revisala antes de volver a cargar.',
  [MOTIVO_NUCLEO.TEXTO_NO_NUMERICO]: 'Hay una celda con texto escrito a mano. No se toca.',
  [MOTIVO_NUCLEO.FORMULA_CON_ERROR]: 'Hay una celda con una fórmula con error. No se toca.',
  [MOTIVO_NUCLEO.TRABAJADOR_AMBIGUO]: 'Hay dos personas con el mismo nombre en la obra. Recargá la pantalla.',
  [MOTIVO_NUCLEO.TRABAJADOR_NO_EN_BLOQUE]: 'Esa persona ya no figura en la obra. Recargá la pantalla.',
  sobrescritura_no_confirmada: 'Hay cargas anteriores que se estarían pisando.',
  reemplazo_formula_no_confirmado: 'Hay una fórmula que no se puede separar en normal y extra.',
})

/** Frase para el usuario a partir de un motivo del núcleo. Nunca devuelve un código pelado. */
export function mensajeDeMotivo(motivo, { fecha } = {}) {
  const base = MENSAJE[motivo]
  if (!base) return 'No se pudo completar la operación sobre la planilla.'
  return base.replace('{fecha}', fechaLegible(fecha))
}

/** Obras del día tal como las espera la pantalla. */
export function mapearObras(obras) {
  return (obras || []).map((o) => ({
    clave: o.clave,
    nombre: o.etiqueta || o.obra_original || o.cliente_original || o.clave,
    cantidad: o.personas ?? 0,
  }))
}

/**
 * Jornada vigente para la fecha. La CONFIGURACIÓN (feriado, media jornada) gana sobre la
 * calibración de la planilla; si no hay configuración, manda la planilla. Si tampoco hay
 * evidencia en la planilla, `horas: null` y se piden a mano — no se inventa un número.
 */
export function resolverJornada({ config, planilla } = {}) {
  if (config && config.horas != null) {
    return {
      horas: Number(config.horas),
      origen: config.origen ?? 'config_dia',
      etiqueta: config.etiqueta ?? null,
      requiere_manual: false,
      feriado: config.origen === 'feriado',
    }
  }
  return {
    horas: planilla?.horas ?? null,
    origen: planilla?.origen ?? 'sin_config',
    etiqueta: null,
    requiere_manual: planilla?.requiere_manual ?? planilla?.horas == null,
    feriado: false,
  }
}

/** ¿La celda actual prohíbe toda escritura? Texto a mano y fórmulas con error, sí. */
function bloqueoDe(carga) {
  if (carga?.forma === FORMA.TEXTO) return 'La celda tiene texto escrito a mano. No se toca.'
  if (carga?.forma === FORMA.ERROR) return 'La celda tiene una fórmula con error. No se toca.'
  return null
}

/**
 * Una persona de la cuadrilla, con la fila YA precargada.
 *
 * El default es el que hace que el caso normal sea un solo toque: todos presentes con la
 * jornada del día. Dos excepciones, ambas con evidencia:
 *   · feriado con 0 h ⇒ nadie presente, franco, 0 h;
 *   · celda ya cargada ⇒ arranca en SIN CAMBIO con lo que dice la planilla. No se pisa
 *     por defecto lo que alguien ya cargó, y no se le inventa un motivo que no consta.
 */
export function mapearPersona(p, { jornada } = {}) {
  const carga = p.actual?.carga ?? null
  const bloqueado = bloqueoDe(carga)
  const cargado = Boolean(p.actual?.escrita)
  const base = {
    ref: p.ref,
    nombre: p.nombre_original,
    categoria: p.categoria ?? null,
    carga_actual: cargado ? describirCarga(carga) : null,
    ya_cargado: cargado,
    bloqueado,
    revisar: carga?.forma === FORMA.NO_INTERPRETABLE
      ? 'La fórmula de la celda no se puede separar en jornada normal y horas extra.'
      : null,
    motivo: null,
    aclaracion: null,
    obra_realizada: null,
  }
  if (bloqueado) return { ...base, sin_cambio: true, presente: false, horas: 0 }
  if (cargado && carga?.inequivoca) {
    return { ...base, sin_cambio: true, presente: (carga.total ?? 0) > 0, horas: carga.total ?? 0 }
  }
  if (cargado) return { ...base, sin_cambio: true, presente: false, horas: 0 }
  if (jornada?.feriado) {
    return { ...base, sin_cambio: false, presente: false, horas: 0, motivo: 'franco' }
  }
  return { ...base, sin_cambio: false, presente: true, horas: jornada?.horas ?? null }
}

/**
 * Novedad de la pantalla → marca del núcleo.
 *
 * Acá vive la decisión de producto de que NO EXISTE un campo de horas extra: si las horas
 * superan la jornada, el excedente se manda como `extras` y el núcleo lo escribe con su
 * fórmula (`=9+2`). El jefe cargó "11" y el sistema separó 9 + 2, que es exactamente lo
 * que hace la planilla a mano.
 */
export function marcaDe({ ref, novedad, jornada } = {}) {
  if (novedad?.sin_cambio) return { ref, estado: SIN_CAMBIO }
  if (!novedad?.presente) return { ref, estado: ESTADO.AUSENTE }
  const h = Number(novedad.horas)
  const jn = jornada?.requiere_manual ? null : jornada?.horas
  if (jn != null && h > jn) return { ref, estado: ESTADO.PRESENTE, extras: redondear(h - jn) }
  if (jn != null && h === jn) return { ref, estado: ESTADO.PRESENTE }
  return { ref, estado: novedad.motivo === 'llego_tarde' ? ESTADO.TARDE : ESTADO.PARCIAL, normales: h }
}

const redondear = (x) => Math.round(Number(x) * 1000) / 1000

/** Horas extra que resultaron de la carga, para MOSTRARLAS (nunca para pedirlas). */
export function extrasDe({ horas, jornada } = {}) {
  const jn = jornada?.requiere_manual ? null : jornada?.horas
  if (jn == null || horas == null) return 0
  return horas > jn ? redondear(horas - jn) : 0
}
