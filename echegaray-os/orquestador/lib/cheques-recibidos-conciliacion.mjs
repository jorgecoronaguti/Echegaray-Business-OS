// RECONCILIACIÓN DEL "DEPOSITADO" CONTRA EL BANCO REAL. NO ES UNA OPINIÓN.
//
// POR QUÉ EXISTE. La pestaña "Cheques Recibidos" (lib/cheques-recibidos.mjs) es una CAPTURA MANUAL de
// la pantalla de operaciones eCHEQ del Santander al 22/07. Su línea "Falta bajar del banco" se calcula
//
//        Falta bajar = Entró − Depositado − Endosado − En cartera
//
// donde "Depositado" venía de SUMIF(tipo="Depósito") sobre el registro manual. Ese registro está
// incompleto: no capturó todos los depósitos que el banco efectivamente hizo, así que "Depositado"
// nace viejo y "Falta bajar" queda inflado ($40.000.000 con la captura del 22/07). Una captura manual
// envejece; el extracto bancario no.
//
// QUÉ CAMBIA. Ahora public.banco_movimientos tiene TODOS los depósitos eCHEQ reales. Este módulo
// reemplaza el "Depositado" del registro por el DEPOSITADO DEL BANCO (fuente única) y recalcula
// "Falta bajar" contra la realidad. Regla 9 (un concepto, una fuente): el depositado lo manda el banco.
//
// QUÉ NO CAMBIA — REGLA QUE NO SE TOCA. "En cartera" la sigue mandando CAJA (el extracto), NO se
// recalcula acá. Este módulo sólo corrige el lado "Depositado" y muestra la posición honesta: cuánto
// bajó el gap al usar el banco, y cuánto residual queda (si queda). No inventa el cierre: lo mide.
//
// HECHO vs CÁLCULO: `depositadoBanco` es un HECHO (suma de filas reales del extracto). `faltaBajar`
// es un CÁLCULO derivado de esos hechos más los totales del registro y la cartera de CAJA. `cierra`
// es la lectura de si ese cálculo da cero dentro de tolerancia — nunca se fuerza a true.

import { query } from './db.mjs'
import { porTipo, OPERACIONES } from './cheques-recibidos.mjs'

/**
 * El predicado que identifica un depósito eCHEQ en el extracto. Es el MISMO criterio en el SQL (thin)
 * y en cualquier chequeo en memoria, para que no haya dos definiciones de "qué es un depósito eCHEQ".
 */
export const PATRON_DEPOSITO_ECHEQ = '%deposito e-cheq%'

/** NÚCLEO PURO: ¿esta línea del extracto es un depósito eCHEQ? Mismo criterio que el LIKE del SQL. */
export function esDepositoEcheq(concepto) {
  return typeof concepto === 'string' && concepto.toLowerCase().includes('deposito e-cheq')
}

/** NÚCLEO PURO: suma robusta de importes, aceptando números o filas {importe}. Ignora lo no numérico. */
function sumarImportes(depositos = []) {
  let total = 0
  for (const d of depositos) {
    const n = typeof d === 'number' ? d : Number(d?.importe)
    if (Number.isFinite(n)) total += n
  }
  return total
}

/** Exige que `valor` sea un número finito; si no, explica cuál falló (no un TypeError mudo). */
function num(valor, nombre) {
  if (!Number.isFinite(valor)) throw new TypeError(`${nombre} debe ser un número finito, llegó: ${valor}`)
  return valor
}

/**
 * NÚCLEO PURO — SIN I/O. Reconcilia el "Depositado" del registro contra el banco y devuelve la posición.
 *
 * @param {object} args
 * @param {Array<number|{fecha?:string,importe:number}>} args.depositosBanco  Depósitos eCHEQ del extracto (fuente única).
 * @param {number} args.entro         Total "Entró" del registro (aceptado). Lo aporta el registro.
 * @param {number} args.endosado      Total endosado a terceros (salió). Lo aporta el registro.
 * @param {number} args.enCartera     Valores todavía en cartera. LO MANDA CAJA — no se recalcula acá.
 * @param {number} [args.depositadoRegistro]  Depositado según el registro manual (opcional), sólo para
 *                                             mostrar cuánto más vio el banco. No entra en el cálculo.
 * @param {number} [args.tolerancia=0]  Margen (en $) dentro del cual se considera que la posición cierra.
 * @returns {{depositadoBanco:number, faltaBajar:number, cierra:boolean, detalle:object}}
 */
export function reconciliarDepositado({
  depositosBanco = [],
  entro,
  endosado,
  enCartera,
  depositadoRegistro,
  tolerancia = 0,
} = {}) {
  if (!Array.isArray(depositosBanco)) throw new TypeError('depositosBanco debe ser un array')
  num(entro, 'entro'); num(endosado, 'endosado'); num(enCartera, 'enCartera')
  num(tolerancia, 'tolerancia')

  const depositadoBanco = sumarImportes(depositosBanco)
  // Fuente única: el depositado que entra al cálculo es el del BANCO, no el del registro manual.
  const faltaBajar = entro - depositadoBanco - endosado - enCartera
  const cierra = Math.abs(faltaBajar) <= tolerancia

  const tieneRegistro = Number.isFinite(depositadoRegistro)
  const detalle = {
    entro,
    endosado,
    enCartera,
    depositadoBanco,
    cantidadDepositos: depositosBanco.length,
    // Con el registro manual (lo que la pestaña mostraba antes de esta reconciliación).
    depositadoRegistro: tieneRegistro ? depositadoRegistro : null,
    // Cuánto MÁS vio el banco que el registro manual: la porción de depósitos que la captura no tomó.
    reconciliacionDeposito: tieneRegistro ? depositadoBanco - depositadoRegistro : null,
    faltaBajarPrevio: tieneRegistro ? entro - depositadoRegistro - endosado - enCartera : null,
    // Cuánto se achicó el "Falta bajar" al usar el banco en lugar del registro (nunca lo agranda).
    mejora: tieneRegistro
      ? (entro - depositadoRegistro - endosado - enCartera) - faltaBajar
      : null,
  }
  return { depositadoBanco, faltaBajar, cierra, detalle }
}

/**
 * NÚCLEO PURO: los totales que el registro aporta a la reconciliación (entró / endosado / depositado
 * manual), derivados del conteo por tipo. `enCartera` NO sale de acá: la manda CAJA.
 */
export function totalesRegistro(ops = OPERACIONES) {
  const porT = porTipo(ops)
  const de = (tipo) => porT.find((x) => x.tipo === tipo)?.importe ?? 0
  return { entro: de('Aceptación'), endosado: de('Endoso'), depositadoRegistro: de('Depósito') }
}

/**
 * THIN (I/O): lee los depósitos eCHEQ reales de public.banco_movimientos. `queryFn` inyectable para
 * poder testear sin base. Devuelve filas normalizadas {fecha:'YYYY-MM-DD', concepto, importe:number}.
 */
export async function leerDepositosEcheqBanco(queryFn = query) {
  const { rows } = await queryFn(
    `select fecha, concepto, importe from public.banco_movimientos
     where lower(concepto) like $1 order by fecha, id`,
    [PATRON_DEPOSITO_ECHEQ],
  )
  return rows.map((r) => ({
    fecha: r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
    concepto: r.concepto,
    importe: Number(r.importe),
  }))
}

/**
 * THIN (compone I/O + núcleo): lee el banco y reconcilia contra los totales del registro. Es lo que
 * main usa al aplicar la pestaña. `enCartera` es OBLIGATORIO y lo aporta CAJA — no se infiere acá.
 */
export async function reconciliarDesdeBanco({ enCartera, tolerancia = 0, queryFn = query } = {}) {
  const depositosBanco = await leerDepositosEcheqBanco(queryFn)
  const { entro, endosado, depositadoRegistro } = totalesRegistro()
  return reconciliarDepositado({ depositosBanco, entro, endosado, enCartera, depositadoRegistro, tolerancia })
}
