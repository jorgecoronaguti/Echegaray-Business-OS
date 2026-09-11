#!/usr/bin/env node
// JORNALES → `public.jornales_bloque_persona`. El ESPEJO del bloque: lo que la planilla dice.
//
// ═══ POR QUÉ ESTO EXISTE AL LADO DE `jornales-a-registros-hh.mjs` ═══
//
// Aquél TRADUCE: cada celda diaria se convierte en filas de `registros_hh` con obra resuelta y
// `tipo_hora`. Es lo que la app usa para trabajar, y es una interpretación.
//
// Éste FOTOGRAFÍA: las horas de cada día tal cual están escritas, el total que la propia planilla
// calcula, y su cadena de pago entera —BANCO, ADELANTO BANCO/EMBARGOS, ADELANTO EFECTIVO, TOTAL
// EFECTIVO, TOTAL SEMANA—. Sirve para dos cosas:
//
//   1. COTEJAR. La vista «Quincena» pone al lado de cada persona un chip que dice si la base coincide
//      con el Sheet. Un control no se valida contra la información que produce: por eso el total se
//      LEE de la columna de la planilla y no se suma acá.
//   2. TRAER LA PLATA. El dueño, 11/09/2026: *«todo lo referente a adelantos de plata no está»*. Los
//      adelantos que él escribe en la planilla no entraban a la liquidación por ningún lado.
//
// SÓLO LEE DEL SHEET. Ni un `values.update` ni un `batchUpdate`. Lo que escribe es Postgres.
//
// ═══ EL DEFECTO ES NO ESCRIBIR ═══
//
// Sin `--aplicar` lee, mapea y muestra: bloques, quincenas, personas, cuánta plata trae y qué columna
// no pudo resolver. Con `--aplicar` hace el UPSERT idempotente por (pestaña, bloque, fila) y VUELVE A
// LEER la base para mostrar lo guardado. Nunca borra.
//
//   node orquestador/scripts/jornales-espejo-bloques.mjs                       # ensayo
//   node orquestador/scripts/jornales-espejo-bloques.mjs --aplicar
//   node orquestador/scripts/jornales-espejo-bloques.mjs --desde 2026-08-01    # sólo esas quincenas
//   node orquestador/scripts/jornales-espejo-bloques.mjs --pestanas "Obreros 26" --detalle
//
// ═══ CÓMO SE ENGANCHA AL TIMER (propuesta — NO se toca systemd desde acá) ═══
//
// El espejo tiene que leerse en la MISMA corrida que el importador: si se leyeran en momentos
// distintos, el cotejo compararía dos fotos de la planilla tomadas con horas de diferencia y el chip
// diría «difiere» sobre una edición que el importador todavía no vio. En
// `~/.config/systemd/user/echegaray-jornales-registros.service`:
//
//   ExecStartPost=/usr/bin/node /home/jorge/echegaray-os/produccion/echegaray-os/orquestador/scripts/jornales-espejo-bloques.mjs --aplicar
//
// `ExecStartPost` y no una unidad nueva porque son la misma lectura del mismo archivo: dos timers
// desfasados son dos fotos, y dos fotos no se cotejan entre sí.

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { JORNALES_SPREADSHEET_ID } from '../lib/tools/jornales-asistencia.mjs'
import {
  espejoDeGrid, filasDelEspejo, columnasParaUpsert, SQL_UPSERT, resumir,
} from '../lib/jornales-espejo.mjs'

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d
}
const flag = (n) => process.argv.includes(`--${n}`)
const APLICAR = flag('aplicar')
const DETALLE = flag('detalle')
const ANIO = Number(arg('anio', '2026'))
const DESDE = arg('desde')
const HASTA = arg('hasta')
const PESTANAS_POR_ANIO = { 2026: ['Obreros 26', 'Oficina 26'], 2025: ['JORNALES 25', 'SERENOS'] }
const PESTANAS = arg('pestanas')
  ? arg('pestanas').split(',').map((s) => s.trim())
  : (PESTANAS_POR_ANIO[ANIO] ?? [])
const RANGO = process.env.GOOGLE_JORNALES_RANGO_COMPLETO || 'A1:BB2600'

const n = (x) => (x == null ? '—' : Number(x).toLocaleString('es-AR', { maximumFractionDigits: 1 }))
const $ = (x) => (x == null ? '—' : `$${Number(x).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)

async function leerPestanas(google) {
  const tabs = await google.listTabs(JORNALES_SPREADSHEET_ID)
  const bloques = []
  const hallazgos = []
  const leidas = []
  for (const tab of PESTANAS) {
    if (!tabs.includes(tab)) { hallazgos.push({ tipo: 'pestana_inexistente', pestana: tab }); continue }
    const grid = await google.readSheetGrid(JORNALES_SPREADSHEET_ID, `'${tab}'!${RANGO}`)
    const r = espejoDeGrid(grid, { pestana: tab, anio: ANIO })
    bloques.push(...r.bloques)
    hallazgos.push(...r.hallazgos)
    leidas.push({ pestana: tab, filas: grid.filas.length, bloques: r.bloques.length })
  }
  return { tabs, bloques, hallazgos, leidas }
}

/**
 * EL RECORTE POR VENTANA NO ES UN FILTRO DE FILAS: es de BLOQUES.
 *
 * Recortar por fila dejaría medio bloque adentro y el espejo publicaría una quincena con menos gente
 * de la que la planilla tiene — que es exactamente el estado que el cotejo existe para detectar.
 */
const enVentana = (b) => (!DESDE || b.hasta >= DESDE) && (!HASTA || b.desde <= HASTA)

async function main() {
  const op = await operadorPara()
  if (!op) throw new Error('no hay cuenta de Google autorizada')
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES, getToken: getTokenFor(op) })
  const [{ bloques, hallazgos, leidas, tabs }, personas] = await Promise.all([
    leerPestanas(google),
    query('select id, nombre_completo, en_la_empresa, es_prueba from public.personas'),
  ])
  console.log(`pestañas del archivo: ${tabs.join(' · ')}`)
  console.log(`\nJORNALES → jornales_bloque_persona · año ${ANIO} · ${APLICAR ? 'APLICAR' : 'ENSAYO (no escribe)'}`)
  for (const l of leidas) console.log(`  «${l.pestana}»: ${l.filas} filas leídas · ${l.bloques} bloques`)
  for (const h of hallazgos) console.log(`  ! ${h.tipo} ${h.pestana ?? ''} ${h.fila1 ? 'f' + h.fila1 : ''} ${h.detalle ?? ''}`)

  const elegidos = bloques.filter(enVentana)
  if (DESDE || HASTA) {
    console.log(`  ventana ${DESDE ?? '…'}..${HASTA ?? '…'}: ${elegidos.length} de ${bloques.length} bloques`)
  }

  // ═══ LO QUE NO SE PUDO MAPEAR SE DICE ANTES DE ESCRIBIR ═══
  //
  // Una columna sin rótulo viaja NULL y eso NO es cero. Si el archivo deja de rotular «ADELANTO
  // EFECTIVO», todos los adelantos se vuelven NULL en silencio y la liquidación deja de restarlos:
  // esta lista es lo único que lo hace visible antes de que pase por la pantalla.
  console.log('\n  COLUMNAS RESUELTAS POR BLOQUE (null = el archivo no la rotula, y no se adivina)')
  for (const b of elegidos) {
    const faltan = Object.entries(b.columnas).filter(([, v]) => v == null).map(([k]) => k)
    console.log(`    ${b.pestana} f${b.bloque_fila1} ${b.desde}..${b.hasta} · ${b.personas.length} pers.`
      + `${faltan.length ? `  SIN RÓTULO: ${faltan.join(', ')}` : '  todas'}`)
  }

  const { filas, sinPersona } = filasDelEspejo(elegidos, { personas: personas.rows })
  console.log('\n  QUINCENA                                pers.  s/pers  horas        cobra          adelanto     ya transf.   banco        efectivo   c/adel')
  for (const r of resumir(filas)) {
    console.log(`  ${r.clave.padEnd(38)} ${String(r.personas).padStart(5)} ${String(r.sinPersona).padStart(7)}`
      + ` ${n(r.horas).padStart(7)} ${$(r.cobra).padStart(14)} ${$(r.adelanto).padStart(12)}`
      + ` ${$(r.yaTransferido).padStart(12)} ${$(r.porBanco).padStart(12)} ${$(r.enEfectivo).padStart(12)}`
      + ` ${String(r.conAdelanto).padStart(6)}`)
  }
  console.log(`\n  SIN PERSONA EN EL PADRÓN (viajan igual, no se crea a nadie): ${sinPersona.length}`)
  for (const s of sinPersona.slice(0, DETALLE ? 500 : 15)) {
    console.log(`    ${s.pestana} f${s.fila1} «${s.nombre}» ${s.estado}${s.candidatos.length ? ` · candidatos: ${s.candidatos.join(' / ')}` : ''}`)
  }

  if (!APLICAR) { console.log('\nENSAYO: no se escribió nada. Con --aplicar se escribe y se relee.'); return }
  if (filas.length === 0) { console.log('\nNada que escribir.'); return }

  const cols = columnasParaUpsert(filas)
  const res = await withTx(async (tx) => {
    const { rows } = await tx.query(SQL_UPSERT, cols)
    return { insertadas: rows.filter((r) => r.insertada).length, actualizadas: rows.filter((r) => !r.insertada).length }
  })
  console.log(`\n  ESCRITO: ${res.insertadas} insertadas · ${res.actualizadas} actualizadas (transacción confirmada)`)

  // LA EVIDENCIA ES DEL EFECTO: se relee de la base, no se acusa lo que se pidió.
  const { rows: chk } = await query(
    `select quincena_desde, quincena_hasta, count(*)::int filas, count(persona_id)::int con_persona,
            sum(horas) horas, sum(cobra) cobra, sum(adelanto) adelanto, sum(ya_transferido) ya_transferido,
            sum(por_banco) por_banco, sum(en_efectivo) en_efectivo, max(leido_en) leido_en
       from public.jornales_bloque_persona
      group by 1, 2 order by 1 desc limit 8`)
  console.log('\n  RELEÍDO DE LA BASE (últimas 8 quincenas)')
  for (const r of chk) {
    console.log(`    ${r.quincena_desde.toISOString?.().slice(0, 10) ?? r.quincena_desde}..`
      + `${r.quincena_hasta.toISOString?.().slice(0, 10) ?? r.quincena_hasta}`
      + ` ${String(r.filas).padStart(3)} filas (${r.con_persona} c/persona) · ${n(r.horas)} h`
      + ` · cobra ${$(r.cobra)} · adel ${$(r.adelanto)} · banco ${$(r.por_banco)} · efvo ${$(r.en_efectivo)}`)
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
