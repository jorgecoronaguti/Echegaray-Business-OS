#!/usr/bin/env node
// PONER EL CHECKOUT DE PRODUCCIÓN AL DÍA ANTES DE QUE EL TIMER ESCRIBA EL SHEET.
//
// ═══ EL DEFECTO, MEDIDO EL 06/09/2026 ═══
//
// El timer `echegaray-flujo-caja` corre `flujo-caja-rehacer-todo.mjs` desde
// `/home/jorge/echegaray-os/produccion/echegaray-os` — un checkout DISTINTO del que se desarrolla. Ese
// checkout no se actualizaba solo, y quedó clavado en un commit de días atrás.
//
// Consecuencia real, no hipotética: se aplicaron 115 fórmulas a la pestaña «Plantel» del Sheet, el
// timer corrió a las 10:51 con el generador VIEJO, y las pisó todas. El dueño abrió el archivo y no
// había cambiado nada. Pushear a GitHub actualiza la web —Vercel lee de ahí— pero no este checkout.
//
// El trabajo desaparecía sin un error, sin un log rojo y sin que nadie se enterara hasta abrir el
// Sheet. Es el peor tipo de falla: silenciosa y que borra trabajo hecho.
//
// ═══ EL SEGUNDO DEFECTO, MEDIDO EL 23/09/2026 ═══
//
// Avanzar el checkout arregla a los TIMERS (arrancan de cero en cada corrida y leen el disco), pero
// no a los DAEMONS: el worker del Work Fabric, el consumidor del bot, la puerta de XSAS… llevan el
// código viejo en memoria, systemd los muestra `active`, y nadie se entera de que el bot contesta
// con la lógica de ayer hasta que falla algo que ya estaba arreglado. Ese día se reiniciaron a mano.
//
// Por eso, cuando este script AVANZA el checkout, reinicia los daemons cuyo código vive en el repo
// (lista única: `DAEMONS_DEL_REPO`). Reinicia sólo los que están `active`: un `systemctl restart`
// sobre uno parado lo ARRANCA, y los que están parados lo están a propósito (Balanz, claude-remote).
//
// ═══ POR QUÉ UN SCRIPT Y NO UN `git pull` EN EL UNIT ═══
//
// Porque tiene reglas, y una regla dentro de una línea de shell en un `.service` no se puede probar
// ni leer. Las reglas son cuatro:
//
//   1. `--ff-only`. Si producción divergió, NO se fuerza: se avisa y se sigue con lo que hay. Un
//      merge automático en el checkout que escribe el Sheet es exactamente cómo se pierde una
//      pestaña.
//   2. Si el árbol está sucio, NO se toca. Alguien puede estar depurando ahí.
//   3. NUNCA frena el pipeline. Si no hay red, si GitHub no responde o si el fetch falla, se corre
//      con el código que haya: es peor no actualizar el Flujo de Caja que actualizarlo con código de
//      ayer. El aviso queda en el log del servicio. Lo mismo si un reinicio falla: se loguea y sigue.
//   4. NUNCA se reinicia a sí mismo. Este script corre en el `ExecStartPre` de un unit; reiniciar ese
//      unit desde adentro mata este mismo proceso a mitad de camino. Hoy los units que lo invocan son
//      oneshot y no están en la lista, pero la regla existe para el día que alguien lo agregue al
//      ExecStartPre de un daemon.
//
// ═══ CÓMO SABE QUÉ UNIT LO ESTÁ EJECUTANDO ═══
//
// Tres vías, en este orden; la primera que dé un nombre gana:
//   a) `--unit=<nombre>` en la línea de comando. En un `.service` se escribe `--unit=%n` y systemd
//      lo expande al nombre completo del unit (es lo que hacen los units versionados en
//      `orquestador/systemd/`).
//   b) La variable de entorno `PRODUCCION_AL_DIA_UNIT` (para probar a mano o desde otro envoltorio).
//   c) `INVOCATION_ID`, que systemd le pone a cada proceso que lanza: se busca entre los units
//      `echegaray-*` el que tenga ese mismo `InvocationID`. Cubre a los units instalados ANTES de que
//      existiera `--unit=%n`, que siguen sin ese argumento en `~/.config/systemd/user`.
// Si ninguna vía da un nombre (corrida a mano fuera de systemd), no hay unit propio que proteger.
//
// Uso:  node orquestador/scripts/produccion-al-dia.mjs [ruta-del-checkout] [--unit=<unit>]
// Chequeo de sólo lectura (¿qué daemon arrancó antes del último cambio del checkout?):
//       node orquestador/scripts/servicios-al-dia.mjs

import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const REPO = args.find((a) => !a.startsWith('--')) ?? '/home/jorge/echegaray-os/produccion/echegaray-os'

/**
 * LOS DAEMONS DE LARGA DURACIÓN CUYO CÓDIGO VIVE EN ESTE REPO — ÚNICO LUGAR DONDE SE LISTAN.
 *
 * Criterio para estar acá: `Type=simple` con `Restart=`, `WorkingDirectory` en el checkout de
 * producción y un `ExecStart` que carga código del repo en memoria. Un timer/oneshot NO va: arranca
 * de cero en cada corrida y ya lee el código nuevo. El orden es el de reinicio: primero el motor,
 * después lo que habla con la gente, para que cuando el bot vuelva el motor ya esté con el código
 * nuevo y no reciba una directiva con la lógica vieja.
 *
 * Los que NO están, y por qué:
 *   · echegaray-os-tunnel: corre `os-tunnel.sh` (bash + cloudflared). Reiniciarlo ROTA las URLs de
 *     los túneles y deja a Vercel sin puerta hasta que se republican; el script cambia una vez cada
 *     meses. No vale pagar ese corte en cada avance del checkout.
 *   · echegaray-balanz-remoto: `Restart=on-failure`, hoy parado a propósito («Balanz: dejalo»).
 *     Un restart lo arrancaría. La regla «sólo activos» lo cubre igual, pero no se lista.
 *   · echegaray-claude-remote: parado a propósito tras 58.422 reinicios fallidos por una ruta rota;
 *     además su código no es de este repo (es el binario `claude`).
 */
export const DAEMONS_DEL_REPO = Object.freeze([
  { unit: 'echegaray-orq-worker.service', porQue: 'Work Fabric: ejecuta las tareas con orquestador/worker.mjs; atrapa SIGTERM y drena (TimeoutStopSec=90)' },
  { unit: 'echegaray-orq-interactive.service', atiendePersonas: true, porQue: 'motor interactivo (:8790): las directivas de la extensión pasan por orquestador/interactive-server.mjs' },
  { unit: 'echegaray-comunicacion-worker.service', atiendePersonas: true, porQue: 'puente Communication Service ↔ Work Fabric: orquestador/comunicacion/worker-comunicacion.mjs' },
  { unit: 'echegaray-comunicacion-ws.service', atiendePersonas: true, porQue: 'consumidor WebSocket del bot @xsas: orquestador/comunicacion/mattermost-ws-consumer.mjs (parsers de mensajes viven acá)' },
  { unit: 'echegaray-xsas-gateway.service', atiendePersonas: true, porQue: 'puerta única de XSAS (:8791) + endpoint entrante de Mattermost: orquestador/comunicacion/servidor-entrante.mjs' },
  { unit: 'echegaray-asistencia-http.service', atiendePersonas: true, porQue: 'asistencia nativa en Mattermost (slash command + acciones): orquestador/comunicacion/servidor-asistencia.mjs' },
])

// ═══ EL TERCER DEFECTO (dueño, 23/09/2026: «nunca podés tirar el chat, es vital para la empresa») ═══
//
// Cada avance del checkout reiniciaba TODOS los daemons, aunque el commit fuera sólo de la web
// (`src/`): un día de publicaciones seguidas cortó el chat varias veces, con una respuesta en curso
// perdida en cada corte. Dos reglas nuevas:
//   1. Sólo se reinicia un daemon DESACTUALIZADO: arrancó antes del último commit que tocó su código
//      (`CODIGO_DE_DAEMONS`). Un cambio de pantalla no toca al bot.
//   2. Los que ATIENDEN PERSONAS (chat, bot, XSAS, asistencia) se reinician sólo en la VENTANA de
//      madrugada. Fuera de ella quedan con el código anterior en memoria y el log lo dice; como la
//      regla 1 se evalúa en CADA corrida, la primera corrida dentro de la ventana los pone al día.
//      Un arreglo urgente del chat se reinicia a mano, sabiendo que corta.
export const CODIGO_DE_DAEMONS = Object.freeze(['orquestador', 'package.json', 'package-lock.json'])
/** Horas locales (−03) en las que se puede reiniciar lo que atiende personas: [desde, hasta). */
export const VENTANA_DE_REINICIO = Object.freeze({ desde: 2, hasta: 5 })

/** NÚCLEO PURO: qué hacer, dado el estado del checkout. Separado para poder probarlo sin git. */
export function decidir({ sucio, alDia, puedeAvanzar }) {
  if (sucio) return { accion: 'no-tocar', porQue: 'el árbol tiene cambios sin commitear: alguien puede estar trabajando ahí' }
  if (alDia) return { accion: 'nada', porQue: 'ya está en el commit de origin/main' }
  if (!puedeAvanzar) return { accion: 'avisar', porQue: 'producción divergió de main: hace falta una persona, no un merge automático' }
  return { accion: 'avanzar', porQue: 'avance directo, sin merge' }
}

/**
 * NÚCLEO PURO: qué daemons reiniciar, dado el HEAD de antes y el de después, el unit que está
 * ejecutando este script y el `ActiveState` de cada daemon. Separado para probarlo sin systemd.
 *
 * @param {{ antes: string, despues: string, unitActual?: string|null, estados: Record<string, string|undefined>, daemons?: ReadonlyArray<{unit: string, porQue: string}> }} p
 * @returns {{ reiniciar: string[], omitidos: Array<{ unit: string, porQue: string }> }}
 */
export function decidirReinicios({ antes, despues, unitActual = null, estados, daemons = DAEMONS_DEL_REPO, desactualizados, hora }) {
  // Sin la lectura por daemon, la regla vieja: si el HEAD no se movió, no hay nada que hacer.
  if (desactualizados === undefined && antes === despues) return { reiniciar: [], omitidos: [] }
  const enVentana = hora === undefined || (hora >= VENTANA_DE_REINICIO.desde && hora < VENTANA_DE_REINICIO.hasta)
  const reiniciar = []
  const omitidos = []
  for (const { unit, atiendePersonas } of daemons) {
    const estado = estados?.[unit]
    if (desactualizados !== undefined && desactualizados[unit] !== true) {
      // Al día o sin dato: no se reinicia (sin dato tampoco: un corte del chat no se paga a ciegas).
      if (desactualizados[unit] === undefined) omitidos.push({ unit, porQue: 'no pude saber si corre código viejo: no se reinicia a ciegas' })
      continue
    } else if (atiendePersonas && !enVentana) {
      omitidos.push({ unit, porQue: `atiende personas: se reinicia entre las ${VENTANA_DE_REINICIO.desde} y las ${VENTANA_DE_REINICIO.hasta} h, sigue con el código anterior hasta entonces` })
    } else if (unit === unitActual) {
      omitidos.push({ unit, porQue: 'es el unit que está ejecutando este script (ExecStartPre): reiniciarlo mataría este proceso' })
    } else if (estado === undefined) {
      // Sin dato no se actúa: un restart a ciegas puede arrancar algo que estaba parado a propósito.
      omitidos.push({ unit, porQue: 'no pude leer su ActiveState: no se reinicia a ciegas' })
    } else if (estado !== 'active') {
      omitidos.push({ unit, porQue: `está ${estado}: un restart lo arrancaría, y si está parado es a propósito` })
    } else {
      reiniciar.push(unit)
    }
  }
  return { reiniciar, omitidos }
}

function git(args) {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim()
}

function systemctl(args) {
  return execFileSync('systemctl', ['--user', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** `ActiveState` de cada daemon de la lista, en una sola llamada a systemctl. */
export function leerEstados(unidades) {
  const salida = systemctl(['show', '--property=Id,ActiveState', ...unidades])
  return parsearShow(salida, 'ActiveState')
}

/** Parsea la salida de `systemctl show -p Id,<prop> u1 u2…` (bloques separados por línea vacía). */
export function parsearShow(salida, propiedad) {
  const out = {}
  for (const bloque of salida.split(/\n\s*\n/)) {
    const id = bloque.match(/^Id=(.+)$/m)?.[1]
    const valor = bloque.match(new RegExp(`^${propiedad}=(.*)$`, 'm'))?.[1]
    if (id && valor !== undefined) out[id] = valor
  }
  return out
}

/** Nombre del unit que ejecuta este proceso, por las tres vías del encabezado. `null` si no hay. */
function unitActual() {
  const porArg = args.find((a) => a.startsWith('--unit='))?.slice('--unit='.length)
  if (porArg) return porArg
  if (process.env.PRODUCCION_AL_DIA_UNIT) return process.env.PRODUCCION_AL_DIA_UNIT
  const invocacion = process.env.INVOCATION_ID
  if (!invocacion) return null
  try {
    const porInvocacion = parsearShow(systemctl(['show', '--property=Id,InvocationID', 'echegaray-*']), 'InvocationID')
    return Object.entries(porInvocacion).find(([, id]) => id === invocacion)?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * Por daemon: ¿arrancó antes del último commit que tocó `CODIGO_DE_DAEMONS`? `undefined` si no se pudo
 * leer (ni el commit ni el arranque): la regla de arriba no reinicia a ciegas.
 */
function leerDesactualizados(unidades) {
  const out = {}
  try {
    const ultimo = Number(git(['log', '-1', '--format=%ct', 'HEAD', '--', ...CODIGO_DE_DAEMONS]))
    const arranques = parsearShow(execFileSync('systemctl', ['--user', 'show', '--timestamp=unix', '--property=Id,ActiveEnterTimestamp', ...unidades], { encoding: 'utf8' }), 'ActiveEnterTimestamp')
    for (const u of unidades) {
      const t = Number(String(arranques[u] ?? '').replace('@', ''))
      if (Number.isFinite(ultimo) && ultimo > 0 && Number.isFinite(t) && t > 0) out[u] = t < ultimo
    }
  } catch (e) {
    console.warn(`producción-al-día: no pude medir qué daemon corre código viejo (${String(e?.message ?? e).slice(0, 120)})`)
  }
  return out
}

/** Reinicia en orden, uno por uno, y loguea cada resultado. Un fallo no frena a los demás ni al pipeline. */
function reiniciarDaemons({ antes, despues }) {
  let estados
  try {
    estados = leerEstados(DAEMONS_DEL_REPO.map((d) => d.unit))
  } catch (e) {
    console.warn(`producción-al-día: no pude leer el estado de los daemons (${String(e?.message ?? e).slice(0, 120)}) — quedan con el código viejo en memoria; correr servicios-al-dia.mjs`)
    return
  }
  const propio = unitActual()
  const desactualizados = leerDesactualizados(DAEMONS_DEL_REPO.map((d) => d.unit))
  const hora = Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Argentina/San_Juan' }).format(new Date()))
  const { reiniciar, omitidos } = decidirReinicios({ antes, despues, unitActual: propio, estados, desactualizados, hora })
  for (const { unit, porQue } of omitidos) console.log(`producción-al-día: no reinicio ${unit} — ${porQue}`)
  for (const unit of reiniciar) {
    const t0 = Date.now()
    try {
      systemctl(['restart', unit])
      console.log(`producción-al-día: reinicié ${unit} → ${despues.slice(0, 8)} (${Date.now() - t0} ms)`)
    } catch (e) {
      console.warn(`producción-al-día: FALLÓ el reinicio de ${unit} (${String(e?.stderr ?? e?.message ?? e).trim().slice(0, 160)}) — sigue con el código viejo en memoria`)
    }
  }
}

function main() {
  let estado
  let local
  try {
    git(['fetch', '--quiet', 'origin'])
    local = git(['rev-parse', 'HEAD'])
    const remoto = git(['rev-parse', 'origin/main'])
    estado = {
      sucio: git(['status', '--porcelain']).length > 0,
      alDia: local === remoto,
      // `merge-base --is-ancestor` sale 0 cuando el local es ancestro del remoto, o sea que el
      // avance es directo. Cualquier otra cosa es divergencia.
      puedeAvanzar: (() => {
        try { git(['merge-base', '--is-ancestor', local, remoto]); return true } catch { return false }
      })(),
    }
  } catch (e) {
    // SIN RED NO SE FRENA EL PIPELINE. Se avisa y se sigue con el código que haya.
    console.warn(`producción-al-día: no pude consultar el remoto (${String(e?.message ?? e).slice(0, 120)}) — sigo con el código actual`)
    return
  }

  const { accion, porQue } = decidir(estado)
  if (accion === 'avanzar') {
    git(['merge', '--ff-only', 'origin/main'])
    const despues = git(['rev-parse', 'HEAD'])
    console.log(`producción-al-día: actualizado a ${git(['log', '--oneline', '-1'])}`)
    // El disco ya tiene el código nuevo; los daemons todavía no. Esto es lo que faltaba el 23/09.
    reiniciarDaemons({ antes: local, despues })
    return
  }
  console.log(`producción-al-día: ${accion} — ${porQue}`)
  // Al día: igual se mira si quedó un daemon con código viejo (el que se difirió fuera de la ventana).
  if (accion === 'nada') reiniciarDaemons({ antes: local, despues: local })
}

if (import.meta.url === `file://${process.argv[1]}`) main()
