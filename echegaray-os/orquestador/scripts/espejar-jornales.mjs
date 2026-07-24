#!/usr/bin/env node
// ESPEJAR JORNALES SIN IMPORTRANGE.
//
// POR QUÉ (20/07): `_J_OBREROS!A1` tenía un IMPORTRANGE al archivo JORNALES y quedó en
// "Cargando..." para siempre — se cae la autorización entre planillas y NO avisa. De ese espejo
// cuelga todo: las 14 quincenas, el total del año, la proyección, RESUMEN y la línea de jornales
// del Cash Flow. Todo eso quedó en #REF! y en cero, y el síntoma aparece a cuatro pestañas de
// distancia de la causa.
//
// Un IMPORTRANGE es una dependencia que sólo un humano puede reautorizar, con un clic, en el
// navegador. El OS ya tiene permiso para leer el archivo origen con su propia credencial: no
// necesita el puente. Esto lo reemplaza por un snapshot que mantiene el agente.
//
// 21/07 — DOS CAMBIOS, LOS DOS POR LA MISMA CAUSA. Este script tenía la lógica COPIADA de
// lib/espejo-jornales.mjs en vez de llamarla, así que la verificación que se agregó a la lib no lo
// alcanzaba: dos versiones del mismo trabajo, que es justo lo que la regla de oro prohíbe. Ahora
// llama a la lib, y TERMINA EN ERROR si el espejo no coincide con el original — un espejo
// desfasado no puede pasar por bueno, porque abajo suyo el cash flow sigue calculando igual.
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import { refrescarEspejo, formatEspejo, JORNALES_FILE_ID } from '../lib/espejo-jornales.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'

const op = await operadorPara()
if (!op) { console.error('no hay cuenta de Google autorizada'); process.exit(1) }
const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })

const r = await refrescarEspejo(google)
console.log(formatEspejo(r))

if (r.error) process.exit(1)
if (r.desfasado) {
  console.error('✗ el espejo NO reproduce el archivo JORNALES — el cash flow leería jornales equivocados')
  process.exit(1)
}
// El espejo reproduce el original: el OS acaba de leer JORNALES con éxito. Se registra para que la
// frescura no lo dé por atrasado cuando lo espeja en cada corrida del pipeline.
const fr = await registrarSincronizacion({}, { driveFileId: JORNALES_FILE_ID })
console.log(fr.ok ? `frescura: "${fr.nombre}" → ${fr.estado}` : `frescura no registrada: ${fr.motivo}`)
process.exit(0)
