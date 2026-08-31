// ¿ESTÁN TODAS AL DÍA Y CONDICEN ENTRE SÍ? — el control que el dueño pidió el 31/08/2026.
//
//   «el control de todas las pestañas es para determinar q todas estan actualizadas y condicen
//    entre si»
//
// ═══ POR QUÉ ES UN MÓDULO Y NO UN INFORME ═══
//
// Ese control se pidió cinco veces en un día y se contestó cinco veces con una lectura a mano. Una
// lectura a mano contesta por la pestaña que se miró y por el minuto en que se la miró: al día
// siguiente no queda nada. Acá el criterio queda escrito, se corre solo, y puede dar ROJO.
//
// ═══ LAS DOS PREGUNTAS SON DISTINTAS Y NO SE MEZCLAN ═══
//
//   FRESCURA   ¿la escribió el OS después del último dato que la alimenta?
//   COHERENCIA ¿lo que dice coincide con lo que dicen las otras sobre el MISMO hecho?
//
// Una pestaña puede estar fresquísima y mentir (se rehizo hace un minuto con un criterio viejo), y
// puede estar vieja y seguir siendo correcta (nada cambió). Colapsarlas en un semáforo único fue el
// primer diseño y se descartó: escondía justamente el caso que se estaba buscando.
//
// ═══ NÚCLEO PURO ═══
//
// Sin Google, sin Postgres, sin reloj propio. Recibe los hechos ya leídos y decide. Así el test
// puede construir el caso rojo, que es la única prueba de que el control sirve — un control que no
// puede dar rojo es una constante con cara de control (lección del 28/08, $4,1 M invisibles).

/** Cuánto puede tener una pestaña sin reescribirse antes de ser sospechosa. */
export const HORAS_FRESCA = 24

export const FRESCURA = Object.freeze({
  AL_DIA: 'AL_DIA',
  ATRASADA: 'ATRASADA',
  CANDADO: 'CANDADO',           // el dueño la trabó: vieja a propósito, no es un hallazgo
  SIN_GENERADOR: 'SIN_GENERADOR', // nadie la mantiene: es deuda declarada, no un fallo de hoy
  NO_VERIFICABLE: 'NO_VERIFICABLE',
})

export const COHERENCIA = Object.freeze({
  CONDICE: 'CONDICE',
  DISCREPA: 'DISCREPA',
  NO_VERIFICABLE: 'NO_VERIFICABLE',
})

/**
 * La frescura de UNA pestaña.
 *
 * `escritoEn` null no es «vieja»: es que nadie la firmó nunca. No poder mirar no es haber mirado.
 *
 * @param {{pestana:string, escritoEn:Date|string|null, candado?:boolean, tieneGenerador?:boolean}} p
 * @param {{ahora?:Date, horas?:number}} [o]
 */
export function frescuraDe(p = {}, { ahora = new Date(), horas = HORAS_FRESCA } = {}) {
  const nombre = String(p.pestana ?? '')
  if (p.candado) return { pestana: nombre, estado: FRESCURA.CANDADO, horas: null }
  if (p.tieneGenerador === false) return { pestana: nombre, estado: FRESCURA.SIN_GENERADOR, horas: null }
  const t = p.escritoEn ? new Date(p.escritoEn).getTime() : NaN
  if (!Number.isFinite(t)) return { pestana: nombre, estado: FRESCURA.NO_VERIFICABLE, horas: null }
  const h = (new Date(ahora).getTime() - t) / 3_600_000
  return { pestana: nombre, estado: h <= horas ? FRESCURA.AL_DIA : FRESCURA.ATRASADA, horas: Math.round(h * 10) / 10 }
}

/**
 * UN CRUCE — el mismo hecho leído en dos pestañas.
 *
 * `a` o `b` en null significa que ese lado no se pudo leer, y entonces el cruce es NO_VERIFICABLE.
 * Nunca CONDICE: dos vacíos no coinciden, se ignoran mutuamente. Ésta es la línea que separa este
 * control de uno que tranquiliza sin haber mirado.
 *
 * @param {{que:string, izquierda:string, derecha:string, a:number|null, b:number|null,
 *          tolerancia?:number, nota?:string}} c
 */
export function cruzar(c = {}) {
  const base = { que: c.que ?? '', izquierda: c.izquierda ?? '', derecha: c.derecha ?? '', a: c.a ?? null, b: c.b ?? null, nota: c.nota ?? null }
  if (c.a == null || c.b == null || !Number.isFinite(Number(c.a)) || !Number.isFinite(Number(c.b))) {
    return { ...base, estado: COHERENCIA.NO_VERIFICABLE, delta: null }
  }
  const delta = Number(c.a) - Number(c.b)
  const tol = Number(c.tolerancia ?? 1)
  return { ...base, delta, estado: Math.abs(delta) <= tol ? COHERENCIA.CONDICE : COHERENCIA.DISCREPA }
}

/**
 * El veredicto del barrido entero. ROJO si algo discrepa; AMARILLO si algo no se pudo mirar o quedó
 * atrasado; VERDE sólo cuando todo lo que se pudo mirar cerró.
 *
 * El NO_VERIFICABLE pesa: un control que no pudo mirar y sale verde es peor que no tenerlo.
 */
export function veredicto({ frescuras = [], cruces = [] } = {}) {
  const discrepan = cruces.filter((x) => x.estado === COHERENCIA.DISCREPA)
  const ciegos = cruces.filter((x) => x.estado === COHERENCIA.NO_VERIFICABLE)
  const atrasadas = frescuras.filter((f) => f.estado === FRESCURA.ATRASADA)
  const sinMirar = frescuras.filter((f) => f.estado === FRESCURA.NO_VERIFICABLE)
  const color = discrepan.length ? 'ROJO'
    : (ciegos.length || atrasadas.length || sinMirar.length) ? 'AMARILLO' : 'VERDE'
  return {
    color,
    discrepan: discrepan.length,
    ciegos: ciegos.length,
    atrasadas: atrasadas.map((f) => f.pestana),
    sinMirar: sinMirar.map((f) => f.pestana),
    // El código de salida es lo que hace que esto sirva en un pipeline: 0 sólo en verde.
    salida: color === 'VERDE' ? 0 : 1,
  }
}
