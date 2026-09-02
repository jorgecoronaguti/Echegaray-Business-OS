#!/usr/bin/env node
// EL CAMINO DE VUELTA DE LA DEGRADACIÓN — sin esto, XSAS degrada una vez y no vuelve nunca.
//
// ═══ EL DEADLOCK QUE ESTO ROMPE (26/08/2026) ═══
//
// `marcarSinCredito` persiste `modo_cerebro = sin_credito` y todo el OS pasa a determinístico. El
// flag se levanta en `marcarCerebroOk`, que se llama cuando una llamada al proveedor SALE BIEN
// (`lib/ia/cliente.mjs` y `engines/anthropic-api.mjs`).
//
// Ahí está el círculo: con el flag caído el OS deja de llamar al proveedor, así que no hay ninguna
// llamada que pueda salir bien, así que el flag no se levanta nunca. La degradación se apaga a sí
// misma la vía de recuperación.
//
// Medido hoy: el flag quedó en `sin_credito` a las 07:00:06 y a las 22:00 el proveedor contestaba
// HTTP 200. Quince horas de OS degradado sin un solo motivo, y nadie podía notarlo desde adentro.
//
// ═══ QUÉ HACE ═══
//
// Una llamada mínima —cuatro tokens de salida— al modelo más barato. Si contesta, levanta el flag y
// XSAS vuelve a FULL. Si no contesta, no toca nada: el flag ya está donde tiene que estar.
//
// SÓLO PRUEBA CUANDO EL FLAG ESTÁ CAÍDO. Con el razonador sano no gasta nada: el camino feliz ya lo
// mantiene arriba solo, y una sonda que corre igual sería costo puro cada media hora.

import { cerebroDisponible, marcarCerebroOk } from '../lib/estado-cerebro.mjs'

const CLAVE = process.env.ANTHROPIC_API_KEY || process.env.ORQ_ANTHROPIC_API_KEY || ''
// El más barato que exista: esto pregunta «¿hay alguien del otro lado?», no razona.
const MODELO = process.env.ORQ_SONDA_MODELO || 'claude-haiku-4-5-20251001'

async function main() {
  const { disponible, desde } = await cerebroDisponible()
  if (disponible) {
    console.log('[sonda] el razonador ya está arriba — no se gasta nada')
    return 0
  }
  console.log(`[sonda] razonador marcado caído desde ${desde ?? 'sin fecha'} — probando si volvió`)

  if (!CLAVE) {
    // Sin credencial no se puede probar, y eso NO es «sigue caído»: es que no se pudo mirar. No se
    // levanta el flag adivinando.
    console.log('[sonda] ✖ no hay credencial en el entorno: no se pudo probar. El flag queda como está.')
    return 1
  }

  let r
  try {
    // La sonda saltea a propósito el estado-cerebro, pero NUNCA el fusible del gasto.
    const { admitir } = await import('../lib/ia/fusible.mjs')
    admitir({})
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': CLAVE, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 4, messages: [{ role: 'user', content: 'ok' }] }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    console.log(`[sonda] sigue sin contestar (${String(e?.message ?? e).slice(0, 80)}) — el flag queda caído`)
    return 0
  }

  if (r.ok) {
    await marcarCerebroOk()
    console.log('[sonda] ✔ el razonador volvió — flag levantado, XSAS vuelve a FULL')
    return 0
  }

  // 401/402/429 son «sigue sin poder»: el flag ya lo dice y no hay nada que cambiar. Cualquier otro
  // status se registra igual, porque distinguir «sin crédito» de «caído» cambia qué hay que hacer.
  const cuerpo = await r.text().catch(() => '')
  console.log(`[sonda] sigue caído — HTTP ${r.status} ${cuerpo.slice(0, 120)}`)
  return 0
}

const codigo = await main().catch((e) => {
  console.error('[sonda] ✖', e?.message ?? e)
  return 1
})
try { const { closePool } = await import('../lib/db.mjs'); await closePool() } catch { /* sin base */ }
process.exit(codigo)
