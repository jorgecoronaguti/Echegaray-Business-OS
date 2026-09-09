#!/usr/bin/env node
// EL $/h DE LA QUINCENA QUE ARRANCA ES EL DE LA QUE CERRÓ.
//
//   node orquestador/scripts/liquidacion-tarifas-desde-quincena-anterior.mjs            → dry
//   node orquestador/scripts/liquidacion-tarifas-desde-quincena-anterior.mjs --aplicar
//   ... --hoy 2026-09-09
//
// Dueño, 09/09/2026: *«los precios por hora que tenés que poner esta quincena son los que salen de
// la anterior»*. No es una estimación: es el precio que se pagó quince días atrás, sellado en
// `liquidacion_linea` por la carga desde JORNALES. Es lo que saca a Alaniz, Castillo y Zogbe del
// estado «sin tarifa» sin que nadie invente un número.
//
// ═══ IDEMPOTENTE POR CONSTRUCCIÓN ═══
//
// `persona_tarifa` tiene UNIQUE (persona_id, desde). Se escribe con `desde` = primer día de la
// quincena en curso, así que correrlo diez veces deja diez veces la misma fila. Y el ON CONFLICT
// sólo pisa cuando el importe CAMBIÓ: si alguien editó la tarifa a mano después de sembrarla, esta
// corrida no la revierte salvo que la anterior diga otra cosa — y en ese caso lo imprime.
//
// ═══ NO TOCA NADA MÁS ═══
//
// No da de alta personas, no cambia `personas`, no reliquida ninguna quincena cerrada (R6: una
// quincena cerrada usa su `valor_hora` sellado y esta tarifa nace con `desde` posterior).

import { query, closePool } from '../lib/db.mjs'

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
const APLICAR = process.argv.includes('--aplicar')
const HOY = arg('--hoy') ?? new Date().toISOString().slice(0, 10)

const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/** La quincena canónica en la que cae una fecha ISO. Misma definición que `services/quincena.ts`. */
function quincenaDe(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  const fin = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return Number(d) <= 15
    ? { desde: `${iso.slice(0, 8)}01`, hasta: `${iso.slice(0, 8)}15` }
    : { desde: `${iso.slice(0, 8)}16`, hasta: `${iso.slice(0, 7)}-${String(fin).padStart(2, '0')}` }
}

async function main() {
  const enCurso = quincenaDe(HOY)
  // LA ÚLTIMA CERRADA ANTES DE LA QUE ESTÁ EN CURSO, no «la última»: si alguien cierra la actual, la
  // quincena en curso heredaría de sí misma y el $/h dejaría de moverse nunca más.
  const { rows: anteriores } = await query(
    `select id, desde::text, hasta::text from public.liquidacion_quincena
      where estado = 'cerrada' and hasta < $1::date order by hasta desc limit 1`, [enCurso.desde],
  )
  if (!anteriores.length) {
    console.log(`no hay ninguna quincena cerrada antes de ${enCurso.desde}: no hay de dónde heredar`)
    return
  }
  const anterior = anteriores[0]
  const { rows: lineas } = await query(
    `select l.persona_id, l.valor_hora::float8 as valor_hora, p.nombre_completo
       from public.liquidacion_linea l
       join public.personas p on p.id = l.persona_id
      where l.liquidacion_id = $1 order by p.nombre_completo`, [anterior.id],
  )
  const { rows: yaHay } = await query(
    'select persona_id, valor_hora::float8 as valor_hora from public.persona_tarifa where desde = $1::date',
    [enCurso.desde],
  )
  const actual = new Map(yaHay.map((r) => [r.persona_id, r.valor_hora]))

  console.log(`quincena en curso ${enCurso.desde}..${enCurso.hasta}`)
  console.log(`hereda de la cerrada ${anterior.desde}..${anterior.hasta} · ${lineas.length} línea(s)\n`)

  const aEscribir = []
  for (const l of lineas) {
    if (l.valor_hora == null || !(l.valor_hora > 0)) {
      console.log(`   · ${l.nombre_completo.padEnd(30)} sin valor hora sellado — NO se hereda`)
      continue
    }
    const ya = actual.get(l.persona_id)
    const estado = ya == null ? 'nueva' : Math.abs(ya - l.valor_hora) < 0.005 ? 'igual' : `pisa ${ars(ya)}`
    if (estado !== 'igual') aEscribir.push(l)
    console.log(`   · ${l.nombre_completo.padEnd(30)} ${ars(l.valor_hora).padStart(10)}  ${estado}`)
  }

  console.log(`\n${aEscribir.length} tarifa(s) a escribir con desde = ${enCurso.desde}`)
  if (!APLICAR) return console.log('(sin --aplicar: no escribí nada)')

  for (const l of aEscribir) {
    await query(
      `insert into public.persona_tarifa (persona_id, desde, valor_hora, neto_mensual, origen)
       values ($1, $2::date, $3, null, $4)
       on conflict (persona_id, desde) do update set
         valor_hora = excluded.valor_hora, neto_mensual = null, origen = excluded.origen`,
      [l.persona_id, enCurso.desde, l.valor_hora, 'jornales · quincena anterior'],
    )
  }
  console.log(`✔ escritas ${aEscribir.length}`)
}

main().then(closePool, async (e) => { console.error(e); await closePool(); process.exitCode = 1 })
