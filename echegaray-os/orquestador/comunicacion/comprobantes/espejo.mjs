// EL ESPEJO DE COMPRAS, DISPARADO EN EL ACTO — no dentro de una hora.
//
// ═══ EL DEFECTO (08/09/2026) ═══
//
// El dueño: «siguen faltando comprobantes… esto tiene que hacerse en tiempo real». Y tenía razón a
// medias, que es la peor forma de tenerla: el bot SÍ escribía la fila en la pestaña Compras en el
// momento (las filas 931-935 se escribieron a las 16:33). Lo que no pasaba era lo otro.
//
// `app.ecsas.com.ar › Compras` no lee el Sheet: lee `public.compra_sheet`, un espejo que refrescaba
// `echegaray-compras-sync.timer` **cada hora**. Entre la carga y la hora siguiente, el comprobante
// estaba cargado y la app decía que no. El comprobante nunca faltó; faltaba el espejo.
//
// ═══ POR QUÉ systemd Y NO UN `spawn` ═══
//
// Porque el sync ya tiene una unidad —con su WorkingDirectory de producción, su EnvironmentFile y
// su timeout— y `systemctl --user start` sobre un `Type=oneshot` hace exactamente lo que hace
// falta: si ya hay una corrida en curso, systemd NO lanza otra, se engancha al job que ya está y
// vuelve cuando terminó. Un `spawn` desde el worker arrancaría una segunda corrida en paralelo.
//
// El `spawn` queda de RESPALDO y sólo para cuando no hay systemd de usuario a mano (un test, una
// máquina sin sesión, `XDG_RUNTIME_DIR` sin definir). Va `detached`: nadie lo espera.
//
// ═══ EL ACUSE NO PUEDE MENTIR ═══
//
// «Ya se ve en la app» se dice ÚNICAMENTE cuando el espejo terminó bien y se sabe. Si falló, si
// tardó más de la cuenta, o si se lanzó suelto y nadie lo esperó, el acuse dice el plazo del timer
// —que es la red de seguridad y sí está garantizada— y no afirma nada que no haya ocurrido.

import { spawn as spawnReal } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

/** La unidad que ya existe y corre el sync desde el checkout de producción. */
export const UNIDAD = 'echegaray-compras-sync.service'

/** El script, para el respaldo sin systemd. Corre desde la raíz del repo de ESTE proceso. */
export const RUTA_SYNC = resolve(AQUI, '../../scripts/sync-compras.mjs')
export const RAIZ = resolve(AQUI, '../../..')

/**
 * LA RED DE SEGURIDAD, EN MINUTOS. Tiene que coincidir con `OnUnitActiveSec` de
 * `orquestador/systemd/echegaray-compras-sync.timer`. Es el plazo que el acuse promete cuando el
 * disparo inmediato no se pudo confirmar: prometer menos que lo que el timer garantiza sería
 * inventar.
 */
export const CADA_MINUTOS = Number(process.env.ORQ_COMPRAS_SYNC_MINUTOS || 10)

/**
 * Cuánto se espera al espejo antes de contestar igual. Medido el 08/09 contra producción, el sync
 * entero tarda 2,8 s (932 filas). 45 s es holgura, no una apuesta: si se pasa, el acuse baja a la
 * promesa del timer y la corrida sigue su camino — matar el cliente de `systemctl` no mata el job.
 */
export const ESPERA_MS = Number(process.env.ORQ_COMPRAS_SYNC_ESPERA_MS || 45_000)

/**
 * ¿HAY ALGO QUE ESPEJAR?
 *
 * Sólo si esta corrida escribió filas NUEVAS en la pestaña. Un fajo que cerró como `ya_cargados`
 * —todo estaba— no cambió el Sheet: disparar el sync ahí sería quemar una corrida entera para
 * reescribir el espejo idéntico a sí mismo, y encima haría que el acuse hablara de una actualización
 * que no tenía nada que actualizar. Un ensayo (`--dry`) tampoco escribió una celda.
 *
 * @param {{ensayo?:boolean, filasNuevas?:number}} x
 */
export function hayQueEspejar({ ensayo = false, filasNuevas = 0 } = {}) {
  return !ensayo && Number(filasNuevas) > 0
}

/** ¿Se puede hablar con el systemd de usuario desde este proceso? */
function haySystemd(env) {
  return Boolean(env?.XDG_RUNTIME_DIR)
}

/**
 * Los errores de `systemctl` que significan «acá no hay systemd», no «el sync falló». Sólo con
 * éstos se cae al respaldo: si la unidad corrió y falló, se informa el fallo — reintentarlo por
 * otra vía sería esconderlo.
 */
const SIN_SYSTEMD = /failed to connect|connect to bus|not been booted|no such file or directory|command not found|could not be found|not loaded/i

/**
 * Dispara el espejo y espera hasta `ESPERA_MS` a que termine.
 *
 * @returns {Promise<{pedido:boolean, ok:boolean, via:string|null, ms:number, detalle:string|null}>}
 *   `pedido` = se pidió la corrida · `ok` = terminó bien y se sabe.
 */
export async function dispararEspejo(d = {}, { ensayo = false, filasNuevas = 0 } = {}) {
  const { log } = d
  if (!hayQueEspejar({ ensayo, filasNuevas })) return { pedido: false, ok: false, via: null, ms: 0, detalle: null }

  const spawnImpl = d.spawn ?? spawnReal
  const env = d.env ?? process.env
  const esperaMs = d.esperaMs ?? ESPERA_MS
  const t0 = Date.now()

  if (haySystemd(env)) {
    const r = await unaCorrida(spawnImpl, 'systemctl', ['--user', 'start', UNIDAD], { env, esperaMs })
    const ms = Date.now() - t0
    if (r.code === 0) return { pedido: true, ok: true, via: 'systemd', ms, detalle: null }
    if (!SIN_SYSTEMD.test(`${r.error ?? ''} ${r.stderr ?? ''}`)) {
      const detalle = r.cortado
        ? `el espejo se pasó de ${esperaMs} ms — sigue corriendo`
        : (recorte(r.stderr) || `systemctl salió con código ${r.code}`)
      log?.warn?.('compras: el espejo no confirmó', { unidad: UNIDAD, ms, detalle })
      return { pedido: true, ok: false, via: 'systemd', ms, detalle }
    }
    log?.warn?.('compras: sin systemd de usuario, disparo el sync suelto', { detalle: recorte(r.stderr || r.error) })
  }

  // RESPALDO. Nadie lo espera y nadie sabe cómo terminó: `ok:false` a propósito.
  try {
    const hijo = spawnImpl(process.execPath, [RUTA_SYNC], { cwd: RAIZ, env, detached: true, stdio: 'ignore' })
    hijo?.unref?.()
    return { pedido: true, ok: false, via: 'spawn', ms: Date.now() - t0, detalle: 'lanzado suelto: no puedo confirmar cuándo terminó' }
  } catch (e) {
    log?.warn?.('compras: no pude disparar el espejo', { detalle: recorte(e?.message) })
    return { pedido: true, ok: false, via: null, ms: Date.now() - t0, detalle: recorte(e?.message) }
  }
}

/**
 * EL RENGLÓN DEL ACUSE. Afirma «ya se ve» sólo con el espejo confirmado.
 * `null` cuando no hubo nada que espejar: no se le cuenta al dueño una corrida que no ocurrió.
 */
export function avisoDeEspejo(r, { cadaMinutos = CADA_MINUTOS } = {}) {
  if (!r?.pedido) return null
  if (r.ok) return '✅ Ya se ve en **app.ecsas.com.ar › Compras**.'
  return `🕑 En **app.ecsas.com.ar › Compras** aparece en menos de ${cadaMinutos} minutos.`
}

function unaCorrida(spawnImpl, cmd, args, { env, esperaMs }) {
  return new Promise((res) => {
    let p
    try {
      p = spawnImpl(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) { return res({ code: -1, stdout: '', stderr: '', error: String(e?.message ?? e) }) }
    let stdout = ''; let stderr = ''; let cortado = false; let listo = false
    const fin = (r) => { if (!listo) { listo = true; res(r) } }
    const t = setTimeout(() => {
      cortado = true
      // Se mata el CLIENTE de systemctl, no el job: la corrida del sync sigue y termina sola.
      try { p.kill('SIGKILL') } catch { /* ya murió */ }
    }, esperaMs)
    p.stdout?.on('data', (c) => { stdout += c })
    p.stderr?.on('data', (c) => { stderr += c })
    p.on('error', (e) => { clearTimeout(t); fin({ code: -1, stdout, stderr, error: String(e?.message ?? e), cortado }) })
    p.on('close', (code) => { clearTimeout(t); fin({ code: cortado ? -1 : code, stdout, stderr, cortado }) })
  })
}

const recorte = (s) => String(s ?? '').trim().split('\n').slice(-3).join(' ').slice(0, 300)
