#!/usr/bin/env node
// LA PESTAÑA CAJA → `public.caja_sheet_foto`. SÓLO LEE EL SHEET.
//
// Lo que CAJA muestra (tarjetas, cuentas, escalera, alertas, acciones y los cuatro gráficos) se lee
// tal cual y se guarda como foto; la app (Analíticas → Caja) lee la foto vigente. El porqué y la
// lectura por rótulo están en `lib/caja-espejo.mjs`; acá sólo se cablea.
//
// CUÁNDO CORRE: la sonda de versión de Drive (`echegaray-sonda-flujo-caja`, cada 1 min) lo dispara
// cuando el archivo cambió, y su timer (`echegaray-caja-espejo.timer`, cada 10 min) es la red para lo
// que cambia SIN edición: CAJA tiene TODAY() y GOOGLEFINANCE, que mueven números sin subir la versión.
//
// CUÁNTO PESA: 4 lecturas a Google (~1 s) y, si nada cambió, UN update de una fila. Una foto nueva es
// un insert de ~15 KB. Nada de refrescos de vistas materializadas: la base ya se cayó por eso.
//
//   node orquestador/scripts/sync-caja-espejo.mjs          # lee y escribe la foto
//   node orquestador/scripts/sync-caja-espejo.mjs --dry    # lee y muestra; no toca la base
//   --archivo=<id> (o ORQ_CASHFLOW_ID)                     # otro archivo (una copia)
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { closePool, query, withTx } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { RANGO_TC } from '../lib/caja-disponibilidades.mjs'
import { armarGraficos, decidirEscritura, leerCaja, planDeGraficos, rangosDeGraficos } from '../lib/caja-espejo.mjs'

const DRY = process.argv.includes('--dry')
const ARCHIVO = process.argv.find((a) => a.startsWith('--archivo='))?.slice('--archivo='.length)
  || process.env.ORQ_CASHFLOW_ID || CASHFLOW_ID
const PESTANA = 'CAJA'
const PODA_DIAS = 14
const API = 'https://sheets.googleapis.com/v4/spreadsheets'

async function batchGet(google, rangos, render) {
  if (!rangos.length) return []
  const q = rangos.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
  const j = await google.apiGetSheets(`${API}/${encodeURIComponent(ARCHIVO)}/values:batchGet?${q}&valueRenderOption=${render}&dateTimeRenderOption=SERIAL_NUMBER`)
  return (j.valueRanges ?? []).map((v) => v.values ?? [])
}

export async function leerDelSheet(google) {
  const [grid, specs, version] = await Promise.all([
    google.readSheetGrid(ARCHIVO, PESTANA),
    google.apiGetSheets(`${API}/${encodeURIComponent(ARCHIVO)}?fields=${encodeURIComponent(
      'sheets(properties(sheetId,title),charts(chartId,position(overlayPosition(anchorCell)),spec(title,subtitle,basicChart(chartType,headerCount,stackedType,domains(domain(sourceRange)),series(type,targetAxis,lineStyle,series(sourceRange))))))')}`),
    google.getVersion(ARCHIVO).catch(() => null),
  ])
  const plan = planDeGraficos(specs, PESTANA)
  const rangos = rangosDeGraficos(plan)
  const [texto, crudo, tc] = await Promise.all([
    batchGet(google, rangos, 'FORMATTED_VALUE'),
    batchGet(google, rangos, 'UNFORMATTED_VALUE'),
    google.readSheetValues(ARCHIVO, RANGO_TC, { render: 'UNFORMATTED_VALUE' }).catch(() => null),
  ])
  const leidos = new Map(rangos.map((r, i) => [r, { texto: texto[i] ?? [], crudo: crudo[i] ?? [] }]))
  const tcNum = tc?.[0]?.[0]
  const foto = leerCaja({ grid, graficos: armarGraficos(plan, leidos), tipoCambioUsd: typeof tcNum === 'number' ? tcNum : null })
  return { foto, version: version?.version != null ? String(version.version) : null }
}

async function hayEspejo() {
  const { rows } = await query("select to_regclass('public.caja_sheet_foto') is not null and to_regclass('public.caja_sheet_sync') is not null as ok")
  return rows[0].ok === true
}

async function anotarIntento(db, { ok, error = null, version = null }) {
  await db.query(
    `insert into public.caja_sheet_sync (id, intento_en, ok, error, version_drive) values (1, now(), $1, $2, $3)
     on conflict (id) do update set intento_en = excluded.intento_en, ok = excluded.ok, error = excluded.error,
       version_drive = coalesce(excluded.version_drive, public.caja_sheet_sync.version_drive)`,
    [ok, error, version])
}

export async function escribirFoto(db, { foto, version }) {
  await db.query("set local statement_timeout = '15s'")
  const { rows } = await db.query('select id, huella from public.caja_sheet_foto order by verificada_en desc, id desc limit 1')
  const accion = decidirEscritura(rows[0] ?? null, foto)
  if (accion === 'confirmar') {
    await db.query('update public.caja_sheet_foto set verificada_en = now(), version_drive = coalesce($2, version_drive) where id = $1', [rows[0].id, version])
  } else {
    await db.query(
      `insert into public.caja_sheet_foto (huella, archivo, pestana, version_drive, portada, secciones, graficos, tipo_cambio_usd, grilla)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [foto.huella, ARCHIVO, PESTANA, version, JSON.stringify(foto.portada), JSON.stringify(foto.secciones),
        JSON.stringify(foto.graficos), foto.tipo_cambio_usd, JSON.stringify(foto.grilla)])
  }
  // La poda nunca se lleva la vigente: sólo lo verificado por última vez hace más de N días.
  const poda = await db.query(`delete from public.caja_sheet_foto where verificada_en < now() - interval '${PODA_DIAS} days'`)
  await anotarIntento(db, { ok: true, version })
  return { accion, podadas: poda.rowCount ?? 0 }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  let leido
  try {
    leido = await leerDelSheet(google)
  } catch (e) {
    console.error(`caja-espejo: no pude leer CAJA — ${e.message}`)
    if (!DRY && (await hayEspejo().catch(() => false))) await anotarIntento({ query }, { ok: false, error: String(e.message).slice(0, 500) }).catch(() => {})
    throw e
  }
  const { foto, version } = leido
  const t = foto.portada.tarjetas.map((x) => `${x.rotulo} ${x.valor.texto}`).join(' · ')
  console.log(`CAJA (versión ${version ?? '?'}): ${t}`)
  console.log(`  secciones: ${foto.secciones.map((s) => `${s.numero} ${s.forma} ${s.forma === 'tabla' ? s.filas.length : s.items.length}`).join(' · ')} · gráficos: ${foto.graficos.length} · TC ${foto.tipo_cambio_usd ?? '—'} · huella ${foto.huella.slice(0, 12)}`)
  if (DRY) return
  if (!(await hayEspejo())) {
    console.log('caja-espejo: la migración 20260918T1500_caja_espejo_de_la_pestana no está aplicada — no escribo nada.')
    return
  }
  const r = await withTx((db) => escribirFoto(db, leido))
  console.log(`caja-espejo: ${r.accion === 'confirmar' ? 'sin cambios, foto vigente confirmada' : 'foto nueva guardada'}${r.podadas ? ` · ${r.podadas} podada(s)` : ''}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch(async (e) => { console.error('sync-caja-espejo falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
}
