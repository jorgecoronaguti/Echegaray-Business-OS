#!/usr/bin/env node
// CORRIGE EL MEDIO DE PAGO DE UNA QUINCENA CERRADA, POR DECISIÓN DEL DUEÑO.
//
//   node orquestador/scripts/liquidacion-medio-de-pago.mjs --quincena 2026-06-01 --grupo obreros \
//        --motivo "decisión del dueño 18/09"              → dry: muestra el plan y las celdas BANCO de la planilla
//   ... --aplicar                                          → escribe `pagado_banco` / `pagado_efectivo` y la traza
//
// La regla vive en `lib/liquidacion-medio-de-pago.mjs` (pura, probada). Acá: UNA sola conexión a la base, abierta al
// empezar y cerrada al terminar; la escritura en una transacción; relectura en destino antes de decir «escrito».
//
// NO toca el Sheet: lista las celdas BANCO del bloque (desde el espejo `jornales_bloque_persona`) para que el dueño
// las vacíe. NO toca la foto sellada (`por_banco`, `en_efectivo`, `cobra`, `horas`, `valor_hora`).

import pg from 'pg'
import { loadConfig } from '../lib/config.mjs'
import { parseConnectionString } from '../lib/db.mjs'
import { bancoQueSeCorrige, diferenciasTrasEscribir, observacionDeMedio, planDePagoEnEfectivo } from '../lib/liquidacion-medio-de-pago.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const APLICAR = process.argv.includes('--aplicar')
const DESDE = arg('quincena')
const GRUPO = arg('grupo', 'obreros')
const MOTIVO = arg('motivo')
// LO QUE SE MIRÓ para afirmarlo. Opcional: sin él, la traza no nombra ninguna evidencia.
const EVIDENCIA = arg('evidencia')
if (!/^\d{4}-\d{2}-\d{2}$/.test(DESDE ?? '') || !MOTIVO) {
  console.error('uso: --quincena AAAA-MM-DD --grupo obreros|oficina --motivo "…" [--evidencia "lo que se miró"] [--aplicar]'); process.exit(2)
}
const ars = (n) => (n == null ? 'sin registro' : `$${Number(n).toLocaleString('es-AR')}`)

/** UNA CONEXIÓN, la misma que usa el pool del Fabric, sin pool. */
function clienteUnico() {
  const cfg = loadConfig()
  const p = parseConnectionString(cfg.DATABASE_URL)
  return new pg.Client({
    ...(p ? { host: p.host, port: p.port, user: p.user, password: p.password, database: p.database } : { connectionString: cfg.DATABASE_URL }),
    ssl: cfg.DB_SSL ? { rejectUnauthorized: false } : false,
    application_name: 'liquidacion-medio-de-pago',
    connectionTimeoutMillis: 15_000, query_timeout: 120_000,
  })
}

async function main() {
  const db = clienteUnico()
  await db.connect()
  try {
    const cab = await db.query(
      `select id, estado, observacion from public.liquidacion_quincena where desde = $1 and grupo = $2`, [DESDE, GRUPO])
    if (cab.rows.length !== 1) throw new Error(`cabecera ${DESDE}/${GRUPO}: ${cab.rows.length} filas`)
    const q = cab.rows[0]
    if (q.estado !== 'cerrada') throw new Error(`la quincena está «${q.estado}»: esto es sólo para cerradas (la abierta se corrige en la app)`)

    const { rows: lineas } = await db.query(
      `select l.persona_id, p.nombre_completo nombre, l.cobra, l.por_banco, l.pagado_banco, l.pagado_efectivo, l.pagada_en::text, l.formulas
         from public.liquidacion_linea l join public.persona_directorio p on p.id = l.persona_id
        where l.liquidacion_id = $1 order by p.nombre_completo`, [q.id])
    const plan = planDePagoEnEfectivo(lineas)

    console.log(`Quincena ${DESDE} · ${GRUPO} · ${lineas.length} líneas · ${plan.cambios.length} cambian · ${plan.sinCambio.length} ya en efectivo · ${plan.noSeTocan.length} no se tocan`)
    console.log(`Banco que se corrige: ${ars(bancoQueSeCorrige(plan))}`)
    for (const c of plan.cambios) console.log(`  ${c.nombre}: banco ${ars(c.antes.pagado_banco ?? c.antes.por_banco)} → $0 · efectivo ${ars(c.antes.pagado_efectivo)} → ${ars(c.despues.pagado_efectivo)}${c.sinRegistroPrevio ? '  (sin registro previo)' : ''}`)
    for (const x of plan.noSeTocan) console.log(`  NO SE TOCA ${x.nombre}: ${x.motivo}`)

    // LAS CELDAS BANCO DE LA PLANILLA, PARA EL DUEÑO (no se escriben).
    const { rows: espejo } = await db.query(
      `select pestana, bloque_fila1, fila1, nombre_planilla, por_banco from public.jornales_bloque_persona
        where quincena_desde = $1 and por_banco is not null and por_banco <> 0 order by fila1`, [DESDE])
    console.log(`\nCeldas BANCO de la planilla con importe (${espejo.length}); la columna la dice el rótulo del bloque:`)
    for (const e of espejo) console.log(`  «${e.pestana}» fila ${e.fila1}: ${e.nombre_planilla} · ${ars(e.por_banco)}`)

    // LA TRAZA SE MUESTRA ANTES DE ESCRIBIRLA: lo que va a quedar en la base se lee en el ensayo, no después.
    console.log(`\nTraza que se agregaría a la observación:\n  ${observacionDeMedio(null, plan, { fecha: new Date().toISOString(), motivo: MOTIVO, evidencia: EVIDENCIA })}`)
    if (!APLICAR) { console.log('\n(dry) nada escrito. Agregá --aplicar.'); return }
    if (plan.cambios.length === 0) { console.log('\nnada que escribir.'); return }

    const hoy = new Date().toISOString()
    await db.query('begin')
    try {
      for (const c of plan.cambios) {
        const r = await db.query(
          `update public.liquidacion_linea set pagado_banco = $3, pagado_efectivo = $4, actualizado_en = $5
            where liquidacion_id = $1 and persona_id = $2 and pagada_en is null`,
          [q.id, c.persona_id, c.despues.pagado_banco, c.despues.pagado_efectivo, hoy])
        if (r.rowCount !== 1) throw new Error(`${c.nombre}: la base actualizó ${r.rowCount} filas`)
      }
      const obs = observacionDeMedio(q.observacion, plan, { fecha: hoy, motivo: MOTIVO, evidencia: EVIDENCIA })
      await db.query(`update public.liquidacion_quincena set observacion = $2 where id = $1`, [q.id, obs])
      await db.query('commit')
    } catch (e) { await db.query('rollback'); throw e }

    // RELECTURA EN DESTINO: la evidencia es lo leído, no el UPDATE que contestó.
    const { rows: leidas } = await db.query(
      `select persona_id, pagado_banco, pagado_efectivo from public.liquidacion_linea where liquidacion_id = $1`, [q.id])
    const malas = diferenciasTrasEscribir(plan, leidas)
    if (malas.length) { for (const m of malas) console.error(`  ✗ ${m.nombre}: ${m.motivo}`); process.exitCode = 1; return }
    const { rows: [obsLeida] } = await db.query(`select observacion from public.liquidacion_quincena where id = $1`, [q.id])
    console.log(`\n✓ escrito y releído: ${plan.cambios.length} línea(s) en efectivo por el total; traza en observacion (${obsLeida.observacion.length} caracteres).`)
  } finally {
    await db.end()
  }
}

main().catch((e) => { console.error('ERROR', e.message); process.exit(1) })
