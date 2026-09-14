#!/usr/bin/env node
// PROPONE EL VÍNCULO `cobranza_fila` DE LAS FILAS DE `esquema_pago` QUE NO LO TIENEN — SÓLO LECTURA.
//
//   node orquestador/scripts/esquema-vincular-cobranza.mjs [--sql archivo.sql]
//
// Imprime, para cada fila sin vínculo, la fila de Cobranzas que le correspondería con su evidencia
// (importe, días, certificación, candidatos), y con `--sql` deja en un archivo los UPDATE propuestos.
//
// NO ESCRIBE EN LA BASE, Y NO TIENE UN MODO QUE ESCRIBA. El vínculo cambia lo que ve un cliente
// (auditoría, 14/09/2026): lo revisa quien no lo construyó y corre el SQL un tercero. Un `--aplicar`
// acá sería la forma más corta de saltearse esa revisión, así que se rechaza con error.
//
// La regla de calce vive y se prueba en `lib/portal/vinculo-esquema-cobranza.mjs`.
import { writeFileSync } from 'node:fs'
import { query } from '../lib/db.mjs'
import {
  proponerVinculos, sqlDelDuplicado, sqlDelVinculo, TOLERANCIA_IMPORTE, VENTANA_DIAS,
} from '../lib/portal/vinculo-esquema-cobranza.mjs'

const args = process.argv.slice(2)
if (args.includes('--aplicar')) {
  console.error('esquema-vincular-cobranza: este script NO escribe. Revisá el SQL de --sql y que lo corra un tercero.')
  process.exit(2)
}
const iSql = args.indexOf('--sql')
const destinoSql = iSql >= 0 ? args[iSql + 1] : null

const pesos = (n, moneda) => `${moneda === 'USD' ? 'U$S' : '$'} ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : 's/fecha')

function renglonCandidato(c, moneda) {
  return `fila ${c.fila} (id ${c.sheet_id}) «${c.concepto ?? ''}» ${c.estado ?? '—'} ${dm(c.fecha_cobro)} `
    + `${pesos(c.importe, moneda)} · Δ ${(c.dif_pct * 100).toFixed(2)} % · Δ ${c.dif_dias} días`
    + `${c.misma_certificacion ? ' · misma certificación' : ''}`
}

async function main() {
  const sinFila = (await query(`
    select e.id, e.cliente_id, cl.nombre_comercial as cliente, e.obra_id, e.concepto, e.fecha::text as fecha,
           e.monto::text as monto, e.moneda, e.estado, e.visible_portal, e.publicado_at is not null as publicado
      from public.esquema_pago e join public.clientes cl on cl.id = e.cliente_id
     where e.cobranza_fila is null
     order by cl.nombre_comercial, e.fecha`)).rows
  // Map y no Set: cuando la única fila que calza ya está tomada, el informe dice POR QUIÉN.
  const vinculadas = new Map((await query(`
    select id, cliente_id, cobranza_fila from public.esquema_pago where cobranza_fila is not null`)).rows
    .map((r) => [`${r.cliente_id}:${r.cobranza_fila}`, r.id]))
  const cobranzas = (await query(`
    select sheet_id, cliente_id, estado, concepto, fecha_cobro::text as fecha_cobro, total_bruto::text as total_bruto,
           total_bruto_origen::text as total_bruto_origen, moneda, numero_comprobante,
           monto_neto::text as monto_neto, monto_neto_origen::text as monto_neto_origen
      from public.cobranzas where origen = 'cobranzas_sheet'`)).rows

  const res = proponerVinculos(sinFila, cobranzas, vinculadas)
  console.log(`esquema_pago sin cobranza_fila: ${sinFila.length} · Cobranzas leídas: ${cobranzas.length} `
    + `(${cobranzas.filter((c) => !c.cliente_id).length} sin cliente_id, no se ofrecen) · `
    + `tolerancia ±${TOLERANCIA_IMPORTE * 100} % · ventana ${VENTANA_DIAS} días · MODO: sólo lectura\n`)
  for (const r of res) {
    const p = r.pago
    console.log(`[${r.motivo}] ${p.cliente} · «${p.concepto}» ${dm(p.fecha)} ${pesos(p.monto, p.moneda)} `
      + `(${p.estado}${p.visible_portal && p.publicado ? ', publicado' : ', no publicado'}) · esquema ${p.id}`)
    if (r.propuesta) console.log(`    → ${renglonCandidato(r.propuesta, p.moneda)}`)
    if (r.motivo === 'duplicado') {
      console.log(`    ≡ duplicado de esquema ${r.duplicado_de}: ${renglonCandidato(r.candidatos[0], p.moneda)}`)
    }
    const desde = r.propuesta || r.motivo === 'duplicado' ? 1 : 0
    for (const c of r.candidatos.slice(desde, 4)) console.log(`      candidato: ${renglonCandidato(c, p.moneda)}`)
  }
  const sentencias = res.map(sqlDelVinculo).filter(Boolean)
  const retiros = res.map(sqlDelDuplicado).filter(Boolean)
  const cuenta = (m) => res.filter((r) => r.motivo === m).length
  console.log(`\npropuestos ${cuenta('propuesto')} · duplicados ${cuenta('duplicado')} · ambiguos ${cuenta('ambiguo')} `
    + `· conflictos ${cuenta('conflicto')} · sin candidato ${cuenta('sin_candidato')}`)
  if (destinoSql) {
    writeFileSync(destinoSql, `-- PROPUESTA de esquema-vincular-cobranza.mjs, ${new Date().toISOString()}. REVISAR ANTES DE CORRER.\n`
      + `begin;\n-- vínculos\n${sentencias.join('\n')}\n-- duplicados (comentados: ocultar o borrar lo decide quien revisa)\n${retiros.join('\n')}\n`
      + `-- commit;  ← lo decide quien revisa\n`)
    console.log(`SQL propuesto: ${destinoSql} (${sentencias.length} vínculos, ${retiros.length} duplicados comentados, sin commit)`)
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
