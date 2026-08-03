#!/usr/bin/env node
// SUELTA LOS CANDADOS QUE SE PUSO EL OS A SÍ MISMO. Nada más que ésos.
//
// POR QUÉ EXISTE, Y POR QUÉ NO ES `pestana-candado.mjs desbloquear`. Ese comando suelta CUALQUIER
// candado, incluido uno que el dueño puso a mano, y está prohibido por regla permanente en
// `.claude/settings.json`. La prohibición es correcta y no se toca: seis pérdidas del trabajo del
// dueño salieron de relajar exactamente eso.
//
// Pero el 03/08 se midió que **7 de 8 candados vigentes eran auto-infligidos**: el OS borró filas,
// el borrado cambió la firma de la pestaña, y la corrida siguiente leyó su propia escritura como
// una edición del dueño y se candó encima. Cinco de ellas se candaron en una ventana de DIEZ
// SEGUNDOS — una persona no edita cinco pestañas en diez segundos. La única con edición humana real
// era Compras (`L758`: "Diesel 500 (Camioneta Emi)" → "TOYOTA AD119YO", una corrección tipeada).
//
// Un candado falso no protege nada: bloquea al OS contra un fantasma y deja de ser creíble. Pero
// distinguirlo del verdadero es una decisión de datos, no de confianza, así que esta capacidad es
// deliberadamente más angosta que la prohibida:
//
//   · sólo toca filas con `bloqueada_por = 'auto'` — un candado del dueño la hace ABORTAR, no saltear
//   · re-sella la firma al soltar, que es la causa raíz: sin eso la pestaña se re-canda sola
//   · en seco por defecto; escribe sólo con --aplicar
//
//   node orquestador/scripts/destrabar-auto.mjs              # muestra qué haría
//   node orquestador/scripts/destrabar-auto.mjs --aplicar
//   node orquestador/scripts/destrabar-auto.mjs --aplicar --salvo "Compras"

import { listar, desbloquear } from '../lib/pestana-bloqueada.mjs'
import { sellarFirma } from '../lib/firma-tab.mjs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { closePool } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const salvoIdx = process.argv.indexOf('--salvo')
const SALVO = new Set(salvoIdx > -1 ? process.argv.slice(salvoIdx + 1).filter((a) => !a.startsWith('--')) : [])

async function main() {
  const todas = await listar({}, ID)
  if (!todas.length) { console.log('no hay ninguna pestaña candada'); return }

  const auto = todas.filter((b) => String(b.bloqueada_por || '').toLowerCase() === 'auto')
  const delDueño = todas.filter((b) => String(b.bloqueada_por || '').toLowerCase() !== 'auto')

  console.log(`${todas.length} candada(s): ${auto.length} automática(s) · ${delDueño.length} tuya(s)`)
  for (const b of delDueño) console.log(`  🔒 ${b.pestana} — TUYA (${b.bloqueada_por}), no la toco`)

  const objetivo = auto.filter((b) => !SALVO.has(b.pestana))
  for (const b of auto) {
    if (SALVO.has(b.pestana)) console.log(`  ⏭  ${b.pestana} — excluida a mano, la dejo candada`)
    else console.log(`  🔓 ${b.pestana} — auto: ${String(b.motivo || '').slice(0, 70)}`)
  }
  if (!APLICAR) { console.log(`\n--aplicar para soltar ${objetivo.length}. En seco no toco nada.`); return }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  let sueltas = 0
  for (const b of objetivo) {
    await desbloquear({}, ID, b.pestana)
    // SIN RE-SELLAR NO SIRVE DE NADA: la firma seguiría difiriendo y la próxima corrida la vuelve a
    // candar. El sello dice "esto lo escribí yo", que es la verdad que el candado no supo leer.
    const sello = await sellarFirma(google, ID, b.pestana).catch((e) => ({ sellada: false, motivo: e.message }))
    if (!sello?.sellada) { console.error(`     ✗ ${b.pestana}: soltada pero SIN SELLAR (${sello?.motivo}) — se va a re-candar sola`); process.exitCode = 1 }
    sueltas++
  }
  const quedan = await listar({}, ID)
  console.log(`\n· soltadas ${sueltas} · quedan candadas ${quedan.length}: ${quedan.map((x) => x.pestana).join(', ') || 'ninguna'}`)
  const filtradas = quedan.filter((b) => String(b.bloqueada_por || '').toLowerCase() === 'auto' && !SALVO.has(b.pestana))
  if (filtradas.length) { console.error(`✗ quedaron ${filtradas.length} automática(s) sin soltar`); process.exitCode = 1 }
}

main().then(closePool, async (e) => { console.error(e); await closePool(); process.exit(1) })
