#!/usr/bin/env node
// ¿CUÁNTOS PRECIOS PUEDE CONSEGUIR XSAS SOLO? — la pregunta contestada con números, no con una opinión.
//
//   node orquestador/scripts/resolver-precios.mjs                 # informe, no escribe nada
//   node orquestador/scripts/resolver-precios.mjs --detalle        # + los que necesitan humano
//   node orquestador/scripts/resolver-precios.mjs --evidencia      # guarda el cuaderno de resoluciones
//   node orquestador/scripts/resolver-precios.mjs --aplicar        # + escribe los ACTUALIZADO en el catálogo
//   node orquestador/scripts/resolver-precios.mjs --cotizacion <uuid>   # con la materialidad REAL
//
// ═══ SIN `--cotizacion` SE MIDE EL PEOR CASO ═══
//
// La materialidad sólo existe dentro de una cotización: en el catálogo suelto no hay cantidades, así
// que ningún recurso pesa y todos caen al piso de ignorancia del 5%. Ese número es el peor caso y
// vale para verlo, pero el número que decide es el de una obra concreta, donde el tornillo pesa lo
// que pesa.
//
// ═══ POR QUÉ EL DEFAULT NO ESCRIBE ═══
//
// Este script decide precios de recursos que después multiplican cantidades en una oferta. Un
// default que escribe convierte una corrida exploratoria en un cambio de costos, y este repo ya
// pagó ese error con generadores que corrieron «para validar». Se mira primero, se escribe después
// y a pedido.
//
// ═══ QUÉ MIDE ═══
//
// REQUERIDOS · RESUELTOS · ACTUALIZADOS AUTÓNOMAMENTE · SIN_PRECIO · HUMANOS NECESARIOS. La última
// es la que importa: es la cantidad de veces que el sistema tiene que interrumpir a una persona. Si
// no baja, el mecanismo no sirve por más elegante que sea.

import { getPool } from '../lib/db.mjs'
import { resolverCatalogo, guardarResolucion, aplicarResolucion, pesosDeCotizacion } from '../lib/cotizador/precio-fuentes.pg.mjs'
import { RESULTADO } from '../lib/cotizador/precio-resolucion.mjs'

const args = process.argv.slice(2)
const tiene = (f) => args.includes(f)
const $ = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 }))
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')

async function main() {
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)
  const hoy = new Date()

  const cotizacionId = args[args.indexOf('--cotizacion') + 1] ?? null
  let pesos = {}
  let codigos = null
  if (tiene('--cotizacion') && cotizacionId) {
    const r = await pesosDeCotizacion({ query }, cotizacionId)
    pesos = r.pesos
    codigos = Object.keys(pesos)
    console.log(`materialidad REAL de la cotización ${cotizacionId}: ${r.porQue}`)
    if (!codigos.length) { console.log('sin recursos pesables: se corre el catálogo entero'); codigos = null }
  }

  const { resoluciones, comprasLeidas, recursosLeidos } = await resolverCatalogo({ query }, { hoy, pesos, codigos })

  const por = (r) => resoluciones.filter((x) => x.resolucion.resultado === r)
  const vigentes = por(RESULTADO.VIGENTE)
  const actualizados = por(RESULTADO.ACTUALIZADO)
  const humanos = por(RESULTADO.NECESITA_HUMANO)
  const sinPrecio = por(RESULTADO.SIN_PRECIO)
  const resueltos = vigentes.length + actualizados.length

  // El contrafáctico: qué pasaba con la regla vieja de 180 días planos. Sin esto, «66 usables» y
  // «X usables» son dos números sueltos y no un delta.
  const con180 = resoluciones.filter(({ recurso }) => {
    const mejor = (recurso.serie ?? [])[0]
    return mejor && Math.floor((hoy - Date.parse(`${mejor.observadoEn}T00:00:00Z`)) / 86_400_000) <= 180
  }).length

  console.log('═'.repeat(96))
  console.log('RESOLUCIÓN AUTÓNOMA DE PRECIOS · catálogo completo de ECSAS')
  console.log(`corrida ${hoy.toISOString().slice(0, 19)}Z · ${recursosLeidos} recursos · ${comprasLeidas} filas de compra_sheet leídas`)
  console.log('═'.repeat(96))
  console.log(`  REQUERIDOS                       ${String(recursosLeidos).padStart(5)}`)
  console.log(`  RESUELTOS                        ${String(resueltos).padStart(5)}   ${pct(resueltos, recursosLeidos)}`)
  console.log(`    · ya vigentes                  ${String(vigentes.length).padStart(5)}`)
  console.log(`    · ACTUALIZADOS AUTÓNOMAMENTE   ${String(actualizados.length).padStart(5)}`)
  console.log(`  SIN_PRECIO                       ${String(sinPrecio.length).padStart(5)}   (valor null, nunca $0)`)
  console.log(`  HUMANOS NECESARIOS               ${String(humanos.length).padStart(5)}   ${pct(humanos.length, recursosLeidos)}`)
  console.log('─'.repeat(96))
  console.log(`  contrafáctico · usables con la regla vieja de 180 días planos: ${con180} (${pct(con180, recursosLeidos)})`)
  console.log(`  delta de resueltos: ${resueltos - con180 >= 0 ? '+' : ''}${resueltos - con180}`)

  resumirSeveridad(resoluciones)
  resumirDerivas(resoluciones)
  resumirCompras(resoluciones)
  if (tiene('--detalle')) detallar(humanos, sinPrecio)

  if (tiene('--evidencia') || tiene('--aplicar')) {
    let n = 0
    for (const { recurso, resolucion } of resoluciones) { await guardarResolucion({ query }, { recurso, resolucion }); n += 1 }
    console.log(`\n✓ evidencia: ${n} resoluciones escritas en public.recurso_precio_resolucion`)
  }
  if (tiene('--aplicar')) {
    let n = 0
    for (const { recurso, resolucion } of actualizados) {
      const r = await aplicarResolucion({ query }, { recurso, resolucion })
      if (r.escrito) n += 1
    }
    console.log(`✓ catálogo: ${n} observaciones nuevas en public.recurso_precio (las viejas NO se pisaron)`)
  } else if (actualizados.length) {
    console.log(`\n(sin --aplicar: los ${actualizados.length} ACTUALIZADO no se escribieron en el catálogo)`)
  }

  await pool.end()
}

/**
 * LA CUENTA QUE DECIDE SI LA OFERTA SE PUEDE AFIRMAR.
 *
 * «63 necesitan una persona» no dice nada por sí solo: lo que frena un congelado son los
 * BLOQUEANTE y los ALTA. Un PLACA DE YESO vencido hace 757 días que mueve el 0,01% del costo sale
 * BAJA y no frena nada — y ésa es exactamente la diferencia entre un cotizador y una lista de
 * tareas con forma de cotizador.
 */
function resumirSeveridad(resoluciones) {
  const cuenta = { BLOQUEANTE: 0, ALTA: 0, MEDIA: 0, BAJA: 0 }
  let plata = 0
  for (const { resolucion } of resoluciones) {
    if (!resolucion.issue) continue
    cuenta[resolucion.issue.severity] = (cuenta[resolucion.issue.severity] ?? 0) + 1
    if (resolucion.issue.severity === 'BLOQUEANTE' || resolucion.issue.severity === 'ALTA') plata += Number(resolucion.valor ?? 0)
  }
  console.log('─'.repeat(96))
  console.log('  LO QUE DE VERDAD FRENA LA OFERTA')
  console.log(`    BLOQUEANTE ${String(cuenta.BLOQUEANTE).padStart(4)}   ALTA ${String(cuenta.ALTA).padStart(4)}   MEDIA ${String(cuenta.MEDIA).padStart(4)}   BAJA ${String(cuenta.BAJA).padStart(4)}`)
  console.log(`    plata en riesgo (sólo BLOQUEANTE + ALTA): $${$(plata)}`)
  console.log(`    los BAJA y MEDIA no frenan un congelado: son ${cuenta.BAJA + cuenta.MEDIA} interrupciones que el dueño deja de recibir`)
}

/** De dónde salió la vigencia de cada uno. Es el control de que el número está DERIVADO: si todo
 *  cae en el mismo origen, la derivación es decorativa. */
function resumirDerivas(resoluciones) {
  const cuenta = new Map()
  for (const { resolucion } of resoluciones) {
    const k = resolucion.vigencia?.origenDeriva ?? 'SIN_PRECIO'
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  console.log('─'.repeat(96))
  console.log('  DE DÓNDE SALIÓ LA VIGENCIA')
  for (const [k, v] of [...cuenta].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(5)}  ${k}`)
}

/** Qué encontró en las compras reales y qué descartó, con el motivo. «No encontré precio» y
 *  «encontré y las reglas lo voltearon» son diagnósticos distintos. */
function resumirCompras(resoluciones) {
  const motivos = new Map()
  let conCompra = 0
  for (const { resolucion, descartesDeCompra } of resoluciones) {
    if (resolucion.provenance.resueltoEn === 'COMPRA_ECSAS') conCompra += 1
    for (const d of descartesDeCompra ?? []) motivos.set(d.motivo, (motivos.get(d.motivo) ?? 0) + 1)
  }
  console.log('─'.repeat(96))
  console.log(`  COMPRAS REALES DE ECSAS · ${conCompra} recurso(s) resueltos con una factura pagada`)
  if (!motivos.size) console.log('    (ninguna fila de compra cruzó con un recurso del catálogo)')
  for (const [k, v] of [...motivos].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(5)}  descartadas por ${k}`)
}

function detallar(humanos, sinPrecio) {
  console.log('─'.repeat(96))
  console.log(`  LOS ${humanos.length} QUE TODAVÍA NECESITAN UNA PERSONA (los 15 más caros primero)`)
  const ord = [...humanos].sort((a, b) => (b.resolucion.valor ?? 0) - (a.resolucion.valor ?? 0)).slice(0, 15)
  for (const { recurso, resolucion } of ord) {
    console.log(`    ${String(recurso.codigo).padEnd(10)} ${String(recurso.nombre).slice(0, 38).padEnd(38)} $${$(resolucion.valor).padStart(14)}  ${resolucion.issue?.severity ?? ''}`)
    console.log(`               ${resolucion.porQue.slice(0, 150)}`)
  }
  if (sinPrecio.length) {
    console.log(`\n  LOS ${sinPrecio.length} SIN_PRECIO (valor null — NUNCA $0)`)
    for (const { recurso, resolucion } of sinPrecio.slice(0, 15)) {
      console.log(`    ${String(recurso.codigo).padEnd(10)} ${String(recurso.nombre).slice(0, 40).padEnd(40)} ${resolucion.valor === null ? 'null ✓' : `¡${resolucion.valor}!`}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
