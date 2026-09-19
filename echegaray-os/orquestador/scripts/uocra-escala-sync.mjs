#!/usr/bin/env node
// LA ESCALA DEL CONVENIO, DE LA RÉPLICA A LA BASE — UNA SOLA FUENTE.
//
// El dueño (31/07): "uocra desactualizado". Y era cierto a medias: `_UOCRA_RAW` —la copia fiel del
// acuerdo que él pega en el Sheet— YA TENÍA agosto 2026 (+1,9%, del Acuerdo Mayo 2026), y
// `public.uocra_escala` tenía sólo julio. Dos copias del mismo concepto que no coinciden: la pestaña de
// Jornales leía la réplica y mostraba bien, y todo lo que consulta la base veía una escala vencida.
//
// La réplica MANDA. Esto la lee y actualiza la tabla. No al revés: cargar la base a mano es lo que
// produjo la divergencia.
//
// NO INVENTA NADA: si la réplica no tiene el mes, la tabla tampoco lo va a tener, y el vigía seguirá
// avisando — que es lo correcto. Cargar una escala que no está en un acuerdo es deuda laboral.
//
//   node orquestador/scripts/uocra-escala-sync.mjs [--dry]
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { escalaDeRaw, vigenciaMaxima } from '../lib/uocra-raw-a-base.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const HOJA = '_UOCRA_RAW'
const DRY = process.argv.includes('--dry')

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await google.readSheetValues(ID, `${HOJA}!A1:H200`)
  const escala = escalaDeRaw(filas)
  if (!escala.length) { console.error(`${HOJA} no tiene ninguna escala legible. NO toco la tabla.`); process.exitCode = 1; return }

  const porVig = new Map()
  for (const e of escala) porVig.set(e.vigencia, (porVig.get(e.vigencia) ?? 0) + 1)
  console.log(`${HOJA}: ${escala.length} filas · ${porVig.size} vigencias · la más nueva ${vigenciaMaxima(escala)}`)
  for (const [v, n] of [...porVig].sort().reverse().slice(0, 4)) console.log(`   ${v} → ${n} categorías`)

  const antes = await query('select count(*) n, max(vigencia_desde) mx from public.uocra_escala')
  console.log(`base ANTES: ${antes.rows[0].n} filas · más nueva ${String(antes.rows[0].mx ?? '(ninguna)').slice(0, 10)}`)
  if (DRY) { console.log('\n--dry: no escribí nada.'); return }

  // UPSERT por (vigencia, zona, categoría): la réplica es la verdad, y correrlo dos veces no duplica.
  let n = 0
  for (const e of escala) {
    await query(
      `insert into public.uocra_escala (vigencia_desde, zona, categoria, basico_hora, mensual, cct, fuente)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (vigencia_desde, zona, categoria) do update set
         basico_hora = excluded.basico_hora, mensual = excluded.mensual, fuente = excluded.fuente`,
      [e.vigencia, e.zona, e.categoria, e.basico_hora, e.mensual, '76/75',
        `${e.acuerdo ?? 'acuerdo sin encabezado'} · réplica ${HOJA} del Sheet${e.porcentaje ? ` · escalón +${e.porcentaje}%` : ''}`])
    n++
  }
  const post = await query('select count(*) n, max(vigencia_desde) mx from public.uocra_escala')
  console.log(`\nbase DESPUÉS: ${post.rows[0].n} filas · más nueva ${String(post.rows[0].mx).slice(0, 10)} · ${n} upserts`)

  // El mes en curso tiene que estar: es lo que el vigía controla.
  const mes = new Date().toISOString().slice(0, 7)
  const hay = await query("select count(*) n from public.uocra_escala where to_char(vigencia_desde,'YYYY-MM') = $1", [mes])
  console.log(hay.rows[0].n > 0 ? `✓ el mes en curso (${mes}) está cargado` : `⚠ el mes en curso (${mes}) NO está en la réplica: hay que pegar el acuerdo nuevo`)
  const sig = new Date(); sig.setMonth(sig.getMonth() + 1)
  const m2 = sig.toISOString().slice(0, 7)
  const hay2 = await query("select count(*) n from public.uocra_escala where to_char(vigencia_desde,'YYYY-MM') = $1", [m2])
  console.log(hay2.rows[0].n > 0 ? `✓ el mes que viene (${m2}) también` : `○ el mes que viene (${m2}) todavía no está — normal si el acuerdo no llega tan lejos`)

  await registrarSincronizacion({ fuente: 'UOCRA CCT 76/75', cobertura_hasta: vigenciaMaxima(escala), detalle: `${n} filas desde ${HOJA}` })
    .catch((e) => console.warn(`  ⚠ no pude registrar la frescura: ${e.message}`))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e?.message ?? e); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
}
