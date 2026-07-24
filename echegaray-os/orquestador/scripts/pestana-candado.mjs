#!/usr/bin/env node
// EL CANDADO DE PESTAÑA, DESDE LA TERMINAL. "Esta pestaña es mía; no la toques."
//
// El dueño toma una pestaña y ningún agente del OS la vuelve a escribir — el resto del Sheet sigue
// actualizándose solo. Si su pestaña usa fórmulas, siguen recalculando por el motor de Sheets: queda
// autónoma Y respetada. Ver lib/pestana-bloqueada.mjs.
//
//   node orquestador/scripts/pestana-candado.mjs listar
//   node orquestador/scripts/pestana-candado.mjs bloquear   "Cash Flow Semanal"  "la reescribí yo"
//   node orquestador/scripts/pestana-candado.mjs desbloquear "Cash Flow Semanal"

import { bloquear, desbloquear, listar } from '../lib/pestana-bloqueada.mjs'
import { sellarFirma } from '../lib/firma-tab.mjs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { closePool } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const [accion, pestana, motivo] = process.argv.slice(2)

async function main() {
  if (accion === 'bloquear') {
    if (!pestana) throw new Error('falta el nombre de la pestaña: pestana-candado.mjs bloquear "Cash Flow Semanal"')
    await bloquear({}, ID, pestana, { motivo: motivo || null })
    console.log(`🔒 "${pestana}" bajo tu control: ningún agente la vuelve a escribir.${motivo ? ` (${motivo})` : ''}`)
  } else if (accion === 'desbloquear') {
    if (!pestana) throw new Error('falta el nombre de la pestaña')
    await desbloquear({}, ID, pestana)
    // SELLAR LA FIRMA AL DEVOLVER LA PESTAÑA (24/07). Sin esto, una pestaña que se auto-candó por no
    // tener baseline (y una edición humana en el archivo) se re-candaría sola en la próxima corrida:
    // el desbloqueo no duraría nada. Al sellar su estado actual como baseline, firmaGuardia ve
    // "coincide con mi última escritura" y el OS la retoma de verdad. Best-effort: si Google falla,
    // igual queda desbloqueada (la firma se establecerá en la primera escritura del OS).
    const ref = /[^A-Za-z0-9_]/.test(pestana) ? `'${pestana}'` : pestana
    try {
      const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
      await sellarFirma(google, ID, pestana, ref)
      console.log(`🔓 "${pestana}" devuelta al OS: vuelve a mantenerse sola (firma sellada, no se re-canda).`)
    } catch (e) {
      console.log(`🔓 "${pestana}" devuelta al OS. ⚠ no pude sellar la firma ahora (${e.message}); se sellará en la próxima escritura.`)
    }
  } else {
    const rows = await listar({}, ID)
    if (!rows.length) console.log('No hay pestañas bajo candado: el OS mantiene todo.')
    else {
      console.log(`Pestañas bajo tu control (${rows.length}):`)
      for (const r of rows) console.log(`  🔒 ${r.pestana}${r.motivo ? ` — ${r.motivo}` : ''} (desde ${new Date(r.bloqueada_en).toLocaleString('es-AR')})`)
    }
  }
}

main().then(() => closePool()).then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
