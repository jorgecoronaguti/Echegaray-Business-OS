// UN ERROR DE EXCEL NO ES UN CERO, Y UN VACÍO TAMPOCO.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// `Planilla para Cotizar (2).xlsm` tiene 193 celdas en error repartidas en cinco hojas: 74 en
// `DIAGRAMACION`, 62 en `Costo MO`, 32 en `NN (2)`, 24 en `Análisis` y 21 en `Presupuesto`. Excel
// guarda igual un valor cacheado al lado de cada una, y toda librería que lea `raw:true` lo
// devuelve como si fuera plata — ver `celda.mjs`, donde un `#DIV/0!` valía 7.
//
// El daño de tratar eso como cero no es que el número quede mal: es que el número queda BIEN a la
// vista y mal en el fondo. Un `#REF!` sumado como 0 a un costo directo baja el precio y no dispara
// ningún control, porque 0 es un número perfectamente válido. Un costo que de verdad vale cero
// —una partida donada, un recurso sin cargo— y un costo que no se pudo calcular tienen que poder
// distinguirse, porque la decisión que habilitan es opuesta: uno se cotiza, el otro se investiga.
//
// ═══ LOS SEIS ESTADOS Y POR QUÉ SON SEIS ═══
//
// `VALUE` hay un número · `ZERO` hay un número y es cero (dato, no ausencia) · `NULL` la celda no
// existe · `BLANK` la celda existe y está vacía o tiene sólo espacios · `ERROR` la fórmula falló ·
// `NOT_APPLICABLE` el concepto no aplica a este caso · `UNKNOWN` hay algo escrito que no es número.
//
// `BLANK` y `NULL` se separan porque en `Presupuesto` significan cosas distintas: la fila 30 tiene
// las fórmulas puestas y la cantidad vacía —un renglón preparado y no usado— mientras que la fila
// 100 no existe. Fusionarlos borraría la diferencia entre «alguien dejó esto a medias» y «acá no
// hay nada».
//
// LO QUE ESTE MÓDULO NO HACE: no decide qué hacer con un error. Dice qué es cada valor y se niega a
// sumar lo que no es un número. Quien llama decide si eso bloquea o sólo se informa.

import { esErrorDeCelda, textoDelError } from './celda.mjs'

/** Los estados posibles de un valor leído de una planilla. */
export const ESTADO = Object.freeze({
  VALUE: 'VALUE',
  ZERO: 'ZERO',
  NULL: 'NULL',
  BLANK: 'BLANK',
  ERROR: 'ERROR',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNKNOWN: 'UNKNOWN',
})

/** Los estados que aportan un número usable en una cuenta. */
export const ESTADOS_NUMERICOS = Object.freeze([ESTADO.VALUE, ESTADO.ZERO])

/** Los textos de error de Excel, para cuando el valor llega crudo y no envuelto por `celda.mjs`. */
const ERRORES = Object.freeze(['#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', '#NUM!', '#NULL!', '#SPILL!', '#CALC!', '#GETTING_DATA'])

/**
 * QUÉ ES ESTE VALOR. PURA.
 *
 * @param {unknown} v         la celda cruda, o el error envuelto de `celda.mjs`
 * @param {{ aplica?: boolean }} [opciones]  `aplica:false` fuerza `NOT_APPLICABLE`
 * @returns {{estado:string, numero:number|null, porque:string, texto:string|null}}
 */
export function estadoDe(v, { aplica = true } = {}) {
  if (!aplica) return { estado: ESTADO.NOT_APPLICABLE, numero: null, porque: 'el concepto no aplica a este caso', texto: null }
  if (esErrorDeCelda(v)) {
    const t = textoDelError(v)
    return { estado: ESTADO.ERROR, numero: null, porque: `la fórmula devolvió ${t}`, texto: t }
  }
  if (v === null || v === undefined) return { estado: ESTADO.NULL, numero: null, porque: 'la celda no existe', texto: null }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { estado: ESTADO.UNKNOWN, numero: null, porque: 'el número no es finito', texto: String(v) }
    return v === 0
      ? { estado: ESTADO.ZERO, numero: 0, porque: 'hay un cero escrito: es un dato, no una ausencia', texto: '0' }
      : { estado: ESTADO.VALUE, numero: v, porque: 'hay un número', texto: String(v) }
  }
  const s = String(v).trim()
  if (s === '') return { estado: ESTADO.BLANK, numero: null, porque: 'la celda existe y está vacía', texto: null }
  if (ERRORES.includes(s.toUpperCase())) {
    return { estado: ESTADO.ERROR, numero: null, porque: `la celda dice ${s}`, texto: s }
  }
  return { estado: ESTADO.UNKNOWN, numero: null, porque: `«${s.slice(0, 40)}» no es un número`, texto: s }
}

/** ¿Este valor aporta un número a una cuenta? PURA. */
export const esNumerico = (v) => ESTADOS_NUMERICOS.includes(estadoDe(v).estado)

/**
 * SUMA QUE SE NIEGA A INVENTAR. PURA.
 *
 * Devuelve el total de lo que SÍ es número y, al lado, todo lo que no lo era. Un llamador que
 * ignore `descartados` obtiene la misma suma sesgada de siempre — pero ya no puede decir que no
 * sabía: el dato de que hubo un `#REF!` viaja pegado al total.
 *
 * @param {Array<{valor:unknown, donde?:string}>|unknown[]} entradas
 * @returns {{total:number, sumados:number, descartados:Array<{donde:string|null, estado:string, porque:string}>}}
 */
export function sumar(entradas = []) {
  let total = 0
  let sumados = 0
  const descartados = []
  for (const e of entradas) {
    const esPar = e !== null && typeof e === 'object' && 'valor' in e
    const valor = esPar ? e.valor : e
    const donde = esPar ? (e.donde ?? null) : null
    const r = estadoDe(valor)
    if (r.numero === null) { descartados.push({ donde, estado: r.estado, porque: r.porque }); continue }
    total += r.numero
    sumados++
  }
  return { total, sumados, descartados }
}

/** ¿La suma se puede publicar como un total, o le falta algo? PURA. */
export const sumaCompleta = (r) => r.descartados.length === 0
