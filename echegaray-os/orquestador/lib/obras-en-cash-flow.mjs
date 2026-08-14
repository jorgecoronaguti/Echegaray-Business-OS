// ¿LA MANO DE OBRA DE LAS 7 OBRAS ESTÁ DE VERDAD EN LOS DOS CASH FLOW? — LA MEDICIÓN QUE FALTABA.
//
// ═══ QUÉ SE MIDIÓ ANTES DE ESCRIBIR ESTE ARCHIVO (14/08/2026) ═══
//
// El dueño (13/08): *"hay desconexión con la pestaña obras q marca costos estipulados cobros y demás,
// cruzar esos datos con compras, cobranzas etc y mostrarlo en ambos cash flows"*. Antes de agregar un
// peso se midió cuánto de OBRAS ya llegaba al flujo, y casi todo ya llegaba:
//
//   · COBROS — de los $357.487.078 de cartera, $302.901.081 son de las 7 obras y las 91 filas de la
//     foto de Cobranzas (13/08) los tienen con fecha esperada del 01/08 en adelante. El libro
//     `_MOVIMIENTOS` los toma con estado PROYECTADO/VENCIDO y las dos vistas los suman. Agregar una
//     proyección de ingreso por obra los habría duplicado. Y no hay nada que agregar por lo no
//     certificado: el contrato leído de las órdenes de compra ($304.227.336) es MENOR que lo ya
//     certificado en Cobranzas ($375.724.900) — ninguna obra tiene "falta certificar" positivo.
//   · EGRESOS DE MATERIALES — $18.880.836, y `libro-extractores-obras.mjs` ya los emite al libro con
//     neteo vivo contra Compras. Medido en la corrida del 14/08: "$18.880.836 de $18.880.836".
//   · MANO DE OBRA Y CARGAS — $126.974.442, y acá estaba el agujero. La corrida imprime *"$126.974.442
//     de MO va por Jornales"*, pero ese número NO se mide: se copia de la explosión del dueño. La MO
//     de las obras llega al flujo a través de la pestaña Jornales, cuya celda proyectada es
//     `MAX(convenio; demanda de las obras)`. Donde el piso del plantel vigente supera a la demanda,
//     manda el piso — y ahí la MO de las obras entra ABSORBIDA, no sumada. Si el piso quedara corto,
//     el cash flow mostraría de menos y la línea de la corrida seguiría diciendo que está todo.
//
// ═══ QUÉ HACE ESTE ARCHIVO ═══
//
// Convierte esa afirmación en una MEDICIÓN, quincena por quincena: cuánto jornal piden las obras
// (demanda) contra cuánto publica la pestaña Jornales para esa misma quincena (lo que el libro va a
// leer). Dos fuentes independientes — las explosiones del dueño y la planilla de nómina—, que es la
// única forma de que el control valga: un control validado contra la información que produce no
// controla nada.
//
// LO QUE NO HACE, DECLARADO: no compara CARGAS. El insumo del dueño trae mano de obra y cargas en un
// solo número (`moCargasPesos`) y no se puede partir sin inventar el corte — se intentó, y horas ×
// escala UOCRA de agosto da $87,9M de jornal más $84,0M de cargas: $171,9M contra los $126,9M que él
// declara. Su explosión no se reconstruye con la escala del convenio. Por eso la cobertura se mide
// sobre el JORNAL PURO, que es la magnitud que las dos fuentes expresan igual, y las cargas quedan
// como límite escrito.
//
// TODO ACÁ ES PURO: las obras y las quincenas publicadas llegan por parámetro. Sin red, sin Sheet.

import {
  demandaPorQuincena, costoDemanda, claveQuincena, ESCALON_RESPALDO,
} from './jornales-demanda-obras.mjs'
import { fechaDeSerial } from './libro-extractores-fechas.mjs'

/**
 * Una columna leída de un rango con nombre viene como filas de una celda (`[[v], [v], …]`) o como
 * lista plana, según quién la lea. Se aplana acá para que el llamador no tenga que saberlo.
 */
const plana = (v) => (Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? x[0] : x)) : [])

/** El número de una celda, o null. Un texto ('—', '') NO es cero: es "no hay dato". */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * NÚCLEO PURO: el serial de Sheets como fecha LOCAL.
 *
 * `fechaDeSerial` devuelve UTC y `claveQuincena` lee la fecha con los getters locales: en San Juan
 * (UTC−3) eso corre el día para atrás. Hoy ninguna quincena termina un día 1° —terminan el 15 y el
 * último del mes—, así que la clave no cambiaría; pero depender de eso es la trampa ya pagada en
 * fecha-dd-mm-yy-parser. Se reconstruye la fecha con las partes UTC y se acabó la ambigüedad.
 */
export function fechaLocalDeSerial(serial) {
  const d = fechaDeSerial(serial)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * NÚCLEO PURO: lo que las obras piden de JORNAL PURO, quincena por quincena.
 *
 * Reusa `demandaPorQuincena` + `costoDemanda` —las mismas funciones con las que la pestaña Jornales
 * arma su MAX—, no una segunda cuenta: si el reparto por días hábiles o la revaluación por paritaria
 * cambian, este control se mueve con ellas o no está controlando lo que dice.
 *
 * @param {Array} obras el shape de `obras-datos.mjs`
 * @param {{desde: Date|string, hastaMeses?: number, escala?: object, paritaria?: Array}} opciones
 * @returns {{porQuincena: Map<string, {jornales:number, cargas:number, periodo:string}>, total:number,
 *   sinFechas: Array, sinEscala: string[]}}
 */
export function demandaJornalPorQuincena(obras = [], { desde, hastaMeses = 6, escala = ESCALON_RESPALDO, paritaria = [] } = {}) {
  const { quincenas, sinFechas } = demandaPorQuincena(obras, { desde, hastaMeses })
  const porQuincena = new Map()
  const sinEscala = new Set()
  let total = 0
  for (const q of quincenas) {
    const c = costoDemanda(q, escala, paritaria)
    if (!c) continue
    for (const s of c.sinEscala ?? []) sinEscala.add(s)
    if (!(c.jornales > 0)) continue
    porQuincena.set(q.clave, { jornales: c.jornales, cargas: c.cargas, periodo: c.periodo })
    total += c.jornales
  }
  return { porQuincena, total, sinFechas, sinEscala: [...sinEscala] }
}

/**
 * NÚCLEO PURO: las quincenas PROYECTADAS que publica la pestaña Jornales, por su clave de quincena.
 *
 * Es exactamente lo que el libro `_MOVIMIENTOS` va a leer (`deJornalesQuincenas`), así que medir
 * contra esto es medir contra el flujo y no contra una intención.
 *
 * @param {{hasta: Array, total: Array}} rangos los valores crudos de JORNALES_PROY_HASTA / _TOTAL
 * @returns {{porQuincena: Map<string, number>, total: number, sinFecha: number}}
 */
export function publicadasPorQuincena({ hasta = [], total = [] } = {}) {
  const H = plana(hasta)
  const T = plana(total)
  const porQuincena = new Map()
  let suma = 0
  let sinFecha = 0
  for (let i = 0; i < Math.max(H.length, T.length); i++) {
    const importe = num(T[i])
    if (!importe) continue
    const fin = num(H[i])
    // Una quincena con importe y sin fecha de cierre no se puede ubicar. NO se reparte a ojo: se
    // cuenta aparte, porque tratarla como cero haría ver un faltante que quizá no existe.
    if (fin === null) { sinFecha += importe; continue }
    const k = claveQuincena(fechaLocalDeSerial(fin))
    porQuincena.set(k, (porQuincena.get(k) ?? 0) + importe)
    suma += importe
  }
  return { porQuincena, total: suma, sinFecha }
}

/**
 * NÚCLEO PURO: CUÁNTA DE LA MANO DE OBRA DE LAS OBRAS ESTÁ EN EL FLUJO, Y CUÁNTA NO.
 *
 * Quincena por quincena: `cubierta = MIN(demanda; publicado)` y `falta = MAX(0; demanda − publicado)`.
 *
 * POR QUÉ EL MIN Y NO LA IGUALDAD. La celda de Jornales es `MAX(convenio; demanda)`: cuando manda el
 * convenio, lo publicado es MAYOR que la demanda y la MO de la obra está adentro de ese número —no
 * sobra plata ni falta—. Lo único que prueba un agujero es lo contrario: publicado MENOR que la
 * demanda significa que esa quincena de obra no está entera en el cash flow, y `falta` la cuantifica.
 *
 * Una quincena con demanda y SIN fila publicada cuenta como falta entera: es el caso más grave —la
 * planilla ni siquiera llega hasta ahí— y el que un promedio escondería.
 *
 * @param {{porQuincena: Map}} demanda salida de `demandaJornalPorQuincena`
 * @param {{porQuincena: Map}} publicadas salida de `publicadasPorQuincena`
 * @returns {{demanda:number, cubierta:number, falta:number, cobertura:number,
 *   quincenas:Array<{clave:string, demanda:number, publicado:number, falta:number, manda:string}>}}
 */
export function coberturaDeManoDeObra(demanda = { porQuincena: new Map() }, publicadas = { porQuincena: new Map() }) {
  const quincenas = []
  let pedida = 0
  let cubierta = 0
  for (const [clave, d] of [...demanda.porQuincena.entries()].sort()) {
    const publicado = publicadas.porQuincena.get(clave) ?? 0
    const falta = Math.max(0, d.jornales - publicado)
    pedida += d.jornales
    cubierta += Math.min(d.jornales, publicado)
    quincenas.push({
      clave,
      demanda: d.jornales,
      publicado,
      falta,
      manda: publicado >= d.jornales ? 'la planilla cubre la demanda' : 'la planilla queda corta',
    })
  }
  return {
    demanda: pedida,
    cubierta,
    falta: pedida - cubierta,
    cobertura: pedida > 0 ? cubierta / pedida : 1,
    quincenas,
  }
}

/**
 * NÚCLEO PURO: el informe en palabras, para que la corrida lo diga en vez de guardárselo.
 *
 * Devuelve SIEMPRE una primera línea con el número —también cuando cubre el 100%: un control que sólo
 * habla cuando falla es indistinguible de un control que se dejó de correr—, y una línea por cada
 * quincena corta. El detalle va acotado: lo que importa es el total y dónde empieza a faltar.
 *
 * @param {ReturnType<typeof coberturaDeManoDeObra>} c
 * @returns {string[]}
 */
export function informeCobertura(c, { tope = 6 } = {}) {
  const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
  if (!c || !c.demanda) return ['  MO de obras → Jornales: las obras no piden jornal en la ventana medida (nada que cubrir).']
  const pct = (c.cobertura * 100).toFixed(1).replace('.', ',')
  const out = [`  MO de obras → Jornales: ${$(c.cubierta)} de ${$(c.demanda)} de jornal demandado está `
    + `en la proyección de la planilla (${pct}%). Faltan ${$(c.falta)}.`]
  const cortas = c.quincenas.filter((q) => q.falta > 0)
  for (const q of cortas.slice(0, tope)) {
    out.push(`  ⚠ quincena ${q.clave}: las obras piden ${$(q.demanda)} de jornal y la planilla proyecta `
      + `${$(q.publicado)} — el cash flow muestra ${$(q.falta)} de menos.`)
  }
  if (cortas.length > tope) out.push(`  ⚠ … y ${cortas.length - tope} quincena(s) más cortas.`)
  return out
}
