#!/usr/bin/env node
// DRY-RUN del skill de asistencia: muestra EXACTAMENTE lo que se escribiría, sin escribir.
//
// Es la herramienta con la que se valida contra el archivo REAL sin tocarlo. Sólo hace
// lecturas (readSheetGrid / listTabs): no hay una sola llamada de escritura en este
// camino, ni siquiera con `--confirmar` (que no existe a propósito).
//
// Uso:
//   node orquestador/scripts/asistencia-dry-run.mjs                      # hoy, todas las obras
//   node orquestador/scripts/asistencia-dry-run.mjs --fecha 2026-07-29
//   node orquestador/scripts/asistencia-dry-run.mjs --obra "MESSINAS|BASES DE TANQUE"
//   node orquestador/scripts/asistencia-dry-run.mjs --estructura          # sólo el mapa de bloques
//
// Requiere las credenciales del OS (worker.env). No requiere Mattermost.

import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  leerEstructuraJornales, contextoParaFecha, listarObrasPorFecha, listarPersonalPorObraYFecha,
  planificarAsistencia, dryRun,
} from '../lib/tools/jornales-asistencia.mjs'
import { letraColumna, trabajadoresDeBloque } from '../lib/jornales-estructura.mjs'
import { fechaOperativaSanJuan, fechaAr, nombreDia } from '../comunicacion/asistencia-ui.mjs'

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d
}
const flag = (n) => process.argv.includes(`--${n}`)

const fecha = arg('fecha') ?? fechaOperativaSanJuan()
const obraPedida = arg('obra')

const op = await operadorPara()
if (!op) { console.error('no hay cuenta de Google autorizada'); process.exit(1) }
const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })

console.log(`\nDRY-RUN asistencia · fecha operativa ${fechaAr(fecha)} (${nombreDia(new Date(`${fecha}T00:00:00Z`).getUTCDay())}) · tz America/Argentina/San_Juan`)
console.log('MODO LECTURA: este script no escribe nada.\n')

if (flag('estructura')) {
  const est = await leerEstructuraJornales(google, { fecha })
  if (!est.ok) { console.error(`✗ ${est.motivo}`); process.exit(1) }
  console.log(`pestaña: ${est.pestana} · ${est.bloques.length} bloques`)
  for (const b of est.bloques) {
    const t = trabajadoresDeBloque(est.grid, b)
    console.log(`  fila ${String(b.fila1).padStart(4)} · ${String(b.fechas.length).padStart(2)} fechas ${b.fechas[0].iso}→${b.fechas.at(-1).iso}`
      + ` · cols ${letraColumna(b.col_desde)}..${letraColumna(b.col_hasta)} · ${t.length} trabajadores`)
  }
  process.exit(0)
}

const ctx = await contextoParaFecha(google, { fecha })
if (!ctx.ok) {
  console.error(`✗ ${ctx.motivo}${ctx.pestana ? ` (pestaña ${ctx.pestana})` : ''}`)
  if (ctx.motivo === 'fecha_no_en_jornales') console.error('  → la fecha no tiene columna en JORNALES. No se crea ninguna.')
  process.exit(1)
}
console.log(`pestaña ${ctx.pestana} · bloque fila ${ctx.bloque.fila1} · columna del día: ${ctx.columna_letra}`)
console.log(`jornada completa: ${ctx.jornada.requiere_manual ? 'REQUIERE CARGA MANUAL' : `${ctx.jornada.horas} h`} (${ctx.jornada.origen}, ${ctx.jornada.muestras ?? 0} muestras)\n`)

const obras = await listarObrasPorFecha(google, { pestana: ctx.pestana, fecha })
const objetivo = obraPedida ? obras.obras.filter((o) => o.clave === obraPedida) : obras.obras
if (!objetivo.length) {
  console.error(`✗ obra no encontrada. Válidas:\n${obras.obras.map((o) => `   ${o.clave}`).join('\n')}`)
  process.exit(1)
}

let totalEscribibles = 0
for (const o of objetivo) {
  const p = await listarPersonalPorObraYFecha(google, { pestana: ctx.pestana, fecha, claveObra: o.clave })
  if (!p.ok) { console.log(`── ${o.etiqueta}: ${p.motivo}\n`); continue }
  // Simula "todos presentes", que es el caso de uso dominante.
  const plan = planificarAsistencia(p.ctx, {
    claveObra: o.clave,
    marcas: p.personal.map((x) => ({ nombre_clave: x.nombre_clave, estado: 'presente' })),
    actor: { plataforma_user_id: 'dry-run' },
  })
  const d = dryRun(plan)
  console.log(`── ${o.etiqueta}   [${o.clave}]`)
  console.log(`   ${'trabajador'.padEnd(24)} ${'celda'.padEnd(10)} ${'actual'.padEnd(12)} ${'propuesto'.padEnd(10)} acción`)
  for (const f of d.filas) {
    console.log(`   ${String(f.trabajador).trim().padEnd(24)} ${String(f.celda ?? '—').split('!')[1]?.padEnd(10) ?? '—'.padEnd(10)}`
      + ` ${String(f.valor_actual ?? '(vacía)').padEnd(12)} ${String(f.valor_propuesto ?? '—').padEnd(10)} ${f.accion}`)
  }
  console.log(`   resumen: ${JSON.stringify(d.resumen)}\n`)
  totalEscribibles += d.resumen.a_escribir
}
console.log(`TOTAL de celdas que se escribirían si se confirmara "todos presentes": ${totalEscribibles}`)
console.log('Nada de esto se escribió. Para escribir, el flujo pasa por Mattermost con un jefe autorizado.\n')
