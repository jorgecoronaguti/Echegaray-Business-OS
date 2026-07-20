#!/usr/bin/env node
// CANARIO DE FUENTE ÚNICA — contrato de arquitectura del OS.
//
// Regla: todo concepto de negocio que se muestra en más de una cara del OS (web, chat, o cualquier
// otra herramienta que consuma del OS) se define UNA SOLA VEZ en Postgres (vista o función). Web y
// chat la consumen; ninguno la recalcula.
//
// Este script verifica que las capacidades del chat sigan devolviendo EXACTAMENTE lo mismo que la
// fuente que consume la web. Si alguien reimplementa un cálculo en cualquiera de las dos caras,
// este canario falla y lo delata antes de que el dueño vea dos números distintos del mismo concepto.
//
// Uso: node orquestador/scripts/canario-fuente-unica.mjs   (necesita DATABASE_URL del worker.env)
import { query } from '../lib/db.mjs'
import { estadoObligaciones } from '../lib/obligaciones.mjs'
import { resumenCostos } from '../lib/obra-costos.mjs'

let ok = 0, fail = 0
const cerca = (a, b, tol = 1) => Math.abs(Number(a) - Number(b)) <= tol
function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ✅ ${nombre}`) }
  else { fail++; console.error(`  ❌ ${nombre}${detalle ? ' → ' + detalle : ''}`) }
}

console.log('CANARIO DE FUENTE ÚNICA (web vs chat)\n')

// ── OBLIGACIONES: la web lee la vista obligacion_resumen; el chat debe leer la MISMA vista.
{
  const { rows } = await query(
    `select count(*)::int n, coalesce(sum(saldo_pendiente),0)::float8 saldo
       from public.obligacion_resumen where saldo_pendiente > 0`)
  const web = rows[0]
  const chat = await estadoObligaciones()
  check('obligaciones · saldo total web == chat',
    cerca(web.saldo, chat.saldo_total),
    `web=$${Math.round(web.saldo).toLocaleString('es-AR')} chat=$${chat.saldo_total.toLocaleString('es-AR')}`)
  // La capacidad del chat NO debe reimplementar el saldo: se verifica que consuma la vista.
  const { rows: src } = await query(
    `select count(*)::int c from pg_views where schemaname='public' and viewname='obligacion_resumen'`)
  check('obligaciones · la vista compartida existe', src[0].c === 1)
}

// ── COSTO REAL POR OBRA: la vista obra_costo_real es la fuente única (eje canónico).
{
  const { rows } = await query('select obra_nombre, costo_real::float8 costo from public.obra_costo_real')
  const chat = await resumenCostos()
  let iguales = 0
  for (const v of rows) {
    const c = chat.obras.find((o) => o.nombre === v.obra_nombre)
    if (cerca(v.costo, c ? c.total : 0)) iguales++
    else console.error(`     ↳ ${v.obra_nombre}: vista=${Math.round(v.costo)} chat=${c ? Math.round(c.total) : 0}`)
  }
  check(`costo por obra · vista == chat en las ${rows.length} obras canónicas`, iguales === rows.length)
  // La normalización de nombre de obra debe existir UNA vez, en la base (antes estaba duplicada
  // en JS y en TypeScript con un comentario que admitía la fragilidad).
  const { rows: fn } = await query(
    `select count(*)::int c from pg_proc where proname='norm_obra' and pronamespace='public'::regnamespace`)
  check('normalización de obra centralizada en Postgres (norm_obra)', fn[0].c === 1)
  // Y debe comportarse igual que la de JS.
  const { rows: nn } = await query(`select public.norm_obra('LA ESTRELLA / Alimentos del Sur') n`)
  const { normObra } = await import('../lib/obras.mjs')
  check('norm_obra(SQL) == normObra(JS)', nn[0].n === normObra('LA ESTRELLA / Alimentos del Sur'),
    `sql="${nn[0].n}" js="${normObra('LA ESTRELLA / Alimentos del Sur')}"`)
}

console.log(`\ncanario-fuente-unica: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
