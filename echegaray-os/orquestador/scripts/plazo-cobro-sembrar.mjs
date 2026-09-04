#!/usr/bin/env node
// LA CONDICIÓN LEÍDA DE CADA OC → public.condicion_cobro, QUE ES DONDE VIVE EL PLAZO PACTADO.
//
// NO DUPLICA VALORES, igual que seed-condiciones-financieras.mjs: los días se leen de donde ya
// están autorados —`orquestador/datos/plazos-cobro-oc.json`, que produce `plazo-cobro-leer-oc.mjs`
// contra los PDF de Drive— y se copian a la fuente única. Un número, un dueño.
//
// LO QUE NO SE PUDO LEER ENTRA IGUAL, con `dias` en NULL y su motivo en `evidencia`. Una OC sin PDF
// archivado y una OC que pacta por hitos son dos cosas distintas y ninguna es "30 días": si no
// quedan escritas, el que consulte la tabla va a creer que esas filas nunca tuvieron condición.
//
// LA CAPA MANUAL NO SE TOCA. El upsert es por `orden_compra`; las filas que una persona cargó para
// un CLIENTE (orden_compra null) quedan intactas — son justamente el escalón que ningún script
// puede llenar.
//
//   node orquestador/scripts/plazo-cobro-sembrar.mjs [--dry]

import { readFileSync } from 'node:fs'

const DRY = process.argv.includes('--dry')

/** El dataset → las filas que van a la tabla. PURO: el test lo corre sin base y sin Drive. */
export function filasParaLaTabla(doc) {
  return (doc?.ordenes ?? []).map((o) => ({
    orden_compra: o.orden_compra,
    cliente: o.cliente || null,
    dias: Number.isFinite(o.dias) ? o.dias : null,
    tipo: o.tipo ?? (o.estado === 'sin_pdf_en_drive' ? 'no_archivada' : 'no_reconocida'),
    instrumento: o.instrumento ?? null,
    ancla: 'fecha_factura',
    origen: 'ORDEN_DE_COMPRA',
    // La restricción `condicion_cobro_evidencia` exige evidencia a todo lo que dice venir de una OC:
    // por eso el motivo de la falta también es evidencia, y no un hueco.
    evidencia: o.descripcion ? `Cond.Compra${o.codigo ? ` ${o.codigo}` : ''}: ${o.descripcion}` : (o.motivo ?? o.estado),
    drive_file_id: o.drive_file_id ?? null,
    leido_el: doc.leido_el,
  }))
}

const COLS = ['orden_compra', 'cliente', 'dias', 'tipo', 'instrumento', 'ancla', 'origen', 'evidencia', 'drive_file_id', 'leido_el']

async function main() {
  const doc = JSON.parse(readFileSync(new URL('../datos/plazos-cobro-oc.json', import.meta.url).pathname, 'utf8'))
  const filas = filasParaLaTabla(doc)
  for (const f of filas) console.log(String(f.orden_compra).padEnd(15), String(f.dias ?? '—').padStart(4), f.tipo.padEnd(18), String(f.evidencia).slice(0, 60))
  console.log(`\n${filas.length} órdenes · ${filas.filter((f) => f.dias !== null).length} con plazo en días`)
  if (DRY) { console.log('(--dry: no se escribió nada)'); return }

  const { query, closePool } = await import('../lib/db.mjs')
  const set = COLS.filter((c) => c !== 'orden_compra').map((c) => `${c}=excluded.${c}`).concat('actualizado_en=now()').join(', ')
  try {
    for (const f of filas) {
      await query(
        `insert into public.condicion_cobro (${COLS.join(',')}) values (${COLS.map((_, i) => `$${i + 1}`).join(',')})
         on conflict (orden_compra) where orden_compra is not null do update set ${set}`,
        COLS.map((c) => f[c]))
    }
    const { rows } = await query('select count(*) n, count(dias) con_dias from public.condicion_cobro')
    console.log('en la tabla:', JSON.stringify(rows[0]))
  } finally { await closePool() }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1 })
