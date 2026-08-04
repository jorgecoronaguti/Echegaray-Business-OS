#!/usr/bin/env node
// CANARIO DE IDENTIDADES — que el OS grite antes que la persona.
//
// LO QUE PASÓ SIN ESTO. `comunicacion.identidades` tenía dos filas con ids de una siembra de
// ejemplo (`u-jorge`, `u-rodrigo`). Nada fallaba: ningún test, ningún log, ninguna alerta. El
// síntoma llegó por chat, semanas después, con la forma equivocada — «no tengo habilitado "Crear un
// evento en el calendario" para vos», que se lee como un permiso faltante y no como lo que era: el
// OS no reconocía a la persona.
//
// QUÉ VERIFICA, en las dos direcciones:
//   · toda identidad activa existe de verdad en Mattermost, con el mismo correo y sin baja;
//   · nadie con Google enlazado (orq.google_tokens) se quedó sin identidad en el chat;
//   · no hay dos identidades activas con el mismo correo.
//
// NO ESCRIBE NADA. Un canario que arregla lo que mira deja de ser un canario: pasa a validarse
// contra la información que él mismo produce. La reparación vive en el router (en el momento del
// pedido); esto sólo mira y dice.
//
// Uso: node orquestador/scripts/canario-identidades.mjs
// Requiere DATABASE_URL, MM_BASE_URL y MM_BOT_TOKEN en el entorno. El token NUNCA se imprime.

import { query, withTx } from '../lib/db.mjs'
import { auditarIdentidades, HALLAZGO } from '../comunicacion/asistente/reconciliacion-identidades.mjs'

/** Cuán grave es cada cosa. Lo que no se pudo verificar NO pasa por bueno: sale como falla. */
const GRAVEDAD = {
  [HALLAZGO.SIN_MATTERMOST]: 'FALLA',
  [HALLAZGO.NO_VERIFICABLE]: 'FALLA',
  [HALLAZGO.ID_INEXISTENTE]: 'FALLA',
  [HALLAZGO.SIN_EMAIL]: 'FALLA',
  [HALLAZGO.TOKEN_SIN_IDENTIDAD]: 'FALLA',
  [HALLAZGO.EMAIL_DISTINTO]: 'FALLA',
  [HALLAZGO.EMAIL_DUPLICADO]: 'AVISO',
  [HALLAZGO.BAJA_EN_MATTERMOST]: 'AVISO',
}

async function main() {
  console.log('CANARIO DE IDENTIDADES (comunicacion.identidades ↔ Mattermost ↔ orq.google_tokens)\n')
  const port = { query, withTx }
  const r = await auditarIdentidades({ port })

  console.log(`  identidades activas revisadas: ${r.revisadas}`)
  if (!r.hallazgos.length) {
    console.log('\n  ✅ todas las identidades resuelven en Mattermost y todos los Google enlazados tienen identidad')
    console.log('\ncanario-identidades: 0 hallazgos')
    process.exit(0)
  }

  const fallas = r.hallazgos.filter((h) => (GRAVEDAD[h.codigo] ?? 'FALLA') === 'FALLA')
  const avisos = r.hallazgos.filter((h) => GRAVEDAD[h.codigo] === 'AVISO')
  console.log('')
  for (const h of fallas) console.error(`  ❌ ${h.quien}: ${h.mensaje}`)
  for (const h of avisos) console.log(`  ⚠️  ${h.quien}: ${h.mensaje}`)
  console.log(`\ncanario-identidades: ${fallas.length} FALLA, ${avisos.length} aviso`)
  if (fallas.length) {
    console.log('Se arregla corriendo: node orquestador/scripts/asistente-identidades.mjs --dry-run (y sin --dry-run si lo que muestra es correcto).')
  }
  process.exit(fallas.length ? 1 : 0)
}

const esCLI = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (esCLI) main().catch((e) => { console.error('canario-identidades:', String(e?.message ?? e).slice(0, 200)); process.exit(1) })
