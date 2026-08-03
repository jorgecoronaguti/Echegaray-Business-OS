#!/usr/bin/env node
// EL NAVEGADOR DE BALANZ, DESDE LA LÍNEA DE COMANDOS.
//
//   node orquestador/scripts/balanz-runtime.mjs estado      # qué está pasando
//   node orquestador/scripts/balanz-runtime.mjs arrancar    # levantarlo si no está
//   node orquestador/scripts/balanz-runtime.mjs preparar    # dejarlo listo (arranca, espera, repone pestaña)
//   node orquestador/scripts/balanz-runtime.mjs reiniciar   # sólo si está roto (--forzar para insistir)
//   node orquestador/scripts/balanz-runtime.mjs enlace      # enlace firmado a la pantalla remota
//   node orquestador/scripts/balanz-runtime.mjs vigia       # una ronda de supervisión (la corre el timer)
//
// Es una herramienta de diagnóstico y de arranque, NO la interfaz cotidiana: el día a día es
// Mattermost. Nada de lo que hay acá inicia sesión en Balanz.

import { configRuntime, diagnosticar, arrancarNavegador, reiniciarNavegador, ESTADO } from '../lib/tesoreria/navegador-runtime.mjs'
import { prepararNavegador, recuperarNavegador, mensajeNavegadorRoto, mensajeNecesitaAutenticacion, mensajeConectado } from '../lib/tesoreria/preparar-navegador.mjs'
import { emitirToken, sugerirSecreto } from '../comunicacion/balanz-remoto-token.mjs'

const cfg = configRuntime()
const args = process.argv.slice(2)
const orden = args[0] || 'estado'
const forzar = args.includes('--forzar')
const JSON_OUT = args.includes('--json')

/** La URL pública de la pantalla remota. Sale del entorno: nunca se inventa un host. */
export function baseRemota(env = process.env) {
  return env.BALANZ_REMOTO_BASE || 'https://chat.ecsas.com.ar'
}

export function enlaceRemoto(env = process.env) {
  const { token, vence } = emitirToken({ env })
  return { url: `${baseRemota(env)}/balanz?t=${token}`, vence }
}

async function main() {
  if (orden === 'estado') {
    const d = await diagnosticar(cfg)
    if (JSON_OUT) { console.log(JSON.stringify(d, null, 2)); return }
    console.log(`estado: ${d.estado}`)
    console.log(`detalle: ${d.detalle}`)
    console.log(`contenedor: ${d.contenedor?.status ?? '?'}${d.contenedor?.desde ? ` desde ${d.contenedor.desde}` : ''}`)
    console.log(`cdp: ${d.cdp?.vivo ? d.cdp.navegador : `no responde (${d.cdp?.motivo})`} — ${cfg.endpoint}`)
    if (d.target) console.log(`pestaña: ${d.target.url}`)
    if (d.estado === ESTADO.SESSION_REQUIRED) console.log('\nHace falta que una persona inicie sesión. Pedí el enlace con: balanz-runtime.mjs enlace')
    return
  }

  if (orden === 'arrancar') { console.log(JSON.stringify(await arrancarNavegador(cfg))); return }

  if (orden === 'preparar') {
    const p = await prepararNavegador(cfg)
    console.log(`${p.estado} — ${p.detalle}`)
    if (p.acciones.length) console.log(`acciones: ${p.acciones.join(', ')}`)
    process.exitCode = p.listo ? 0 : 2
    return
  }

  if (orden === 'reiniciar') {
    const r = await reiniciarNavegador(cfg, { motivo: 'pedido a mano', forzar })
    console.log(JSON.stringify(r))
    process.exitCode = r.reiniciado ? 0 : 2
    return
  }

  if (orden === 'enlace') {
    try {
      const { url, vence } = enlaceRemoto()
      console.log(url)
      console.error(`(vence ${vence} — no lo reenvíes: da acceso a la pantalla del bróker)`)
    } catch {
      console.error('Falta BALANZ_REMOTO_SECRETO. Generá uno y ponelo en el archivo de entorno:')
      console.error(`  BALANZ_REMOTO_SECRETO=${sugerirSecreto()}`)
      process.exitCode = 1
    }
    return
  }

  // ── VIGÍA ──────────────────────────────────────────────────────────────────────────────────────
  //
  // Una ronda de supervisión, pensada para correr desde un timer. Es deliberadamente conservador:
  //
  //   · sólo recupera el navegador ROTO — nunca reinicia por una sesión vencida;
  //   · avisa UNA vez por incidente y no vuelve a insistir hasta que el estado cambie, porque una
  //     alerta repetida cada quince minutos se aprende a ignorar y entonces no alerta de nada;
  //   · y cuando la sesión vuelve, cierra el incidente avisando.
  if (orden === 'vigia') {
    const { rondaVigia } = await import('../lib/tesoreria/vigia-navegador.mjs')
    const r = await rondaVigia({ cfg })
    console.log(JSON.stringify(r))
    return
  }

  console.error(`no conozco la orden "${orden}". Probá: estado | arrancar | preparar | reiniciar | enlace | vigia`)
  process.exitCode = 1
}

// Se exportan para los tests; el arranque sólo ocurre si se lo invoca como programa.
export { mensajeNavegadorRoto, mensajeNecesitaAutenticacion, mensajeConectado, recuperarNavegador }

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`[balanz-runtime] ${e.message}`); process.exitCode = 1 })
}
