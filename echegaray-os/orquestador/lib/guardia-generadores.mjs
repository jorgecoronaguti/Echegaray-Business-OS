// EL GUARDIÁN, PUESTO EN LA PUERTA DEL PIPELINE.
//
// ═══ POR QUÉ EXISTE (13/08) ═══
//
// `scripts/generadores-atrasados.mjs` existe desde el 03/08 porque este repo destruyó trabajo del
// dueño seis veces: un generador viejo reescribe la grilla que él conoce, borra lo que se agregó
// después, no falla y no avisa. El control funciona, sale con código ≠0 cuando hay que frenar, y su
// propio texto dice "NO corras el pipeline contra el Sheet real hasta resolverlo".
//
// Medido el 13/08 con grep sobre el repo entero: los únicos archivos que lo mencionaban eran él
// mismo y su test. **Nadie lo ejecutaba.** Había un guardián escrito y nunca puesto en la puerta —
// que es, exactamente, no tener guardián. No se notaba porque el timer estaba apagado; con el timer
// encendido cada 2 horas se nota la primera vez que alguien deja una rama sin resolver.
//
// ═══ POR QUÉ NO SABER NO ES LO MISMO QUE SER SEGURO ═══
//
// Sólo un `0` explícito del control deja pasar. Todo lo demás —código ≠0, el proceso que no arranca,
// git que no responde, el timeout, una excepción— aborta. La razón no es prudencia genérica: cuando
// git falla, `escritoresDeSheets` devuelve la lista VACÍA y el control informaría "0 generadores
// revisados" sin haber mirado nada. Un fail-open acá se ve idéntico a un verde. Este repo ya pagó ese
// defecto en la guarda de escritura y en la firma: los dos fallan cerrado desde entonces.
//
// ═══ POR QUÉ EL CONTROL CORRE COMO PROCESO HIJO, NO IMPORTADO ═══
//
// Dos razones. La primera es el TIMEOUT: `generadores-atrasados` es síncrono de punta a punta
// (`execFileSync` por cada consulta a git), así que importado no hay forma de ponerle un techo — un
// git colgado colgaría el pipeline entero y el timer moriría por el timeout de systemd a mitad de
// escritura, que es un modo de falla que este repo ya sufrió. La segunda es que el veredicto queda
// donde vive: el pipeline no reimplementa la decisión de qué frena, lee el código de salida del mismo
// comando que tipea una persona. Una capacidad, una fuente.
//
// ═══ EL ESCAPE ═══
//
// Un control sin escape se termina comentando, y un control comentado no deja rastro. Éste tiene uno
// y es deliberadamente incómodo, con la misma vara que el freno de Sheets (`motivoValido`): hay que
// tipear la variable en el comando, con un motivo con sustancia, y el motivo queda impreso en el log
// de esa corrida. Un timer no la tiene. Un agente que la ponga está dejando por escrito que la puso.
//
//   ORQ_PIPELINE_SIN_GUARDIA="por qué se salta el control" node scripts/flujo-caja-rehacer-todo.mjs

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { motivoValido } from './congelador-sheets.mjs'

/** La variable que saltea la guardia. Explícita y fea a propósito: no se pone sin querer. */
export const VAR_ESCAPE = 'ORQ_PIPELINE_SIN_GUARDIA'

/**
 * Techo del control. Medido el 13/08: la corrida completa tarda ~35 s recorriendo la historia de 67
 * generadores. Tres minutos es holgura para un repo que crece, y sigue MUY por debajo del timeout de
 * systemd — el punto del techo es que el pipeline decida, no que lo maten a mitad de escritura.
 */
export const TIMEOUT_MS = 3 * 60 * 1000

/** El control, resuelto desde acá: el pipeline no tiene por qué saber dónde vive. */
export const RUTA_CONTROL = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'generadores-atrasados.mjs',
)

/**
 * NÚCLEO PURO: el motivo del escape, o `null` si no se pidió ninguno.
 *
 * Tira si la variable está declarada con un motivo que no alcanza — mismo comportamiento y misma vara
 * que `congelado()` con `ORQ_SHEETS_DESCONGELAR`. Un "1" no es una decisión, y tratarlo como
 * "no pidieron escape" lo dejaría pasar en silencio: el que lo escribió cree que salteó el control.
 */
export function motivoDelEscape(env = process.env) {
  const m = env[VAR_ESCAPE]
  if (m === undefined) return null
  if (!motivoValido(m)) {
    throw new Error(
      `${VAR_ESCAPE} necesita un MOTIVO (mínimo 8 caracteres), no un "${String(m).trim()}". `
      + 'Es para que quede escrito quién saltea el control de generadores atrasados y para qué.',
    )
  }
  return String(m).trim()
}

/**
 * NÚCLEO PURO: de la salida del control, las líneas que nombran QUÉ frena.
 *
 * El pipeline no vuelve a clasificar: el control ya imprime una línea por archivo con su veredicto y
 * la línea de ramas debajo. Se rescatan esas dos, y sólo de lo que frena — el `📝 descartado` no
 * frena y arrastrarlo acá convertiría el aviso en ruido. Sin nada reconocible se devuelve vacío, y el
 * llamador igual aborta: no poder explicar por qué frena nunca es motivo para dejar pasar.
 */
export function lineasQueFrenan(salida) {
  const lineas = String(salida ?? '').split('\n')
  const out = []
  for (let i = 0; i < lineas.length; i++) {
    if (!/^\s*(✖|🚨|⏳)/.test(lineas[i])) continue
    out.push(lineas[i].trim())
    if (/^\s*ramas:/.test(lineas[i + 1] ?? '')) out.push(`  ${lineas[i + 1].trim()}`)
  }
  return out
}

/**
 * NÚCLEO PURO Y ÚNICO LUGAR DONDE SE DECIDE ABORTAR.
 *
 * `codigo: 0` es lo único que deja pasar. `null` —el proceso que no arrancó o al que mataron— entra
 * por el mismo camino que un 1: no se sabe, y no saber aborta.
 *
 * El escape NO borra el bloqueo: lo deja escrito y sigue. Y en `--dry` nunca aborta, porque un ensayo
 * que no ejecuta un solo generador no puede romper nada; informa igual, que es el único motivo por el
 * que alguien corre un ensayo.
 *
 * @param {{codigo?:number|null, salida?:string, error?:string|null, escape?:string|null, dry?:boolean}} _
 * @returns {{abortar:boolean, bloquea:boolean, lineas:string[]}}
 */
export function veredictoDeLaGuardia({ codigo = null, salida = '', error = null, escape = null, dry = false } = {}) {
  const bloquea = Boolean(error) || codigo !== 0
  if (!bloquea) return { abortar: false, bloquea: false, lineas: ['✓ generadores atrasados: ninguno frena — el pipeline puede correr.'] }
  const lineas = ['', '🛑 GUARDIA DE GENERADORES: hay trabajo de rama sin resolver.']
  if (error) lineas.push(`   el control NO se pudo correr (${error}) — no saber si es seguro no es ser seguro.`)
  else lineas.push(`   el control salió con código ${codigo === null ? 'desconocido' : codigo}.`)
  for (const l of lineasQueFrenan(salida)) lineas.push(`   ${l}`)
  lineas.push('   Un generador viejo reescribe la grilla que el dueño conoce y borra lo que se agregó después,')
  lineas.push('   sin fallar y sin avisar. Resolvelo y anotalo en orquestador/scripts/generadores-revisados.json.')
  lineas.push(`   node orquestador/scripts/generadores-atrasados.mjs   ·   detalle completo`)
  if (escape) lineas.push(`🔓 guardia SALTEADA por ${VAR_ESCAPE}: ${escape}`)
  if (dry && !escape) lineas.push('   (dry) no aborto: este ensayo no ejecuta ningún generador.')
  return { abortar: !escape && !dry, bloquea: true, lineas }
}

/** Corre el control de verdad, con techo de tiempo. Devuelve `{codigo, salida}` o tira. */
function correrControlReal({ base = 'main', timeoutMs = TIMEOUT_MS } = {}) {
  const r = spawnSync(process.execPath, [RUTA_CONTROL, '--base', base], {
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
  })
  if (r.error) throw r.error
  // Matado por el techo de tiempo: `status` viene en null y sin esto se reportaría como "código
  // desconocido" sin decir que fue el timeout. Aborta igual, pero el log tiene que decir por qué.
  if (r.signal) throw new Error(`el control fue terminado por ${r.signal} (techo de ${timeoutMs} ms)`)
  return { codigo: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/**
 * LA GUARDIA COMPLETA: corre el control, decide y devuelve las líneas para el log.
 *
 * `correr` se inyecta para poder probar los tres finales —frena, verde, explota— sin git y sin tocar
 * un Sheet. Probar esta guardia corriendo el pipeline real está prohibido por regla permanente: ya
 * borró el trabajo del dueño tres veces.
 *
 * @param {{correr?:Function, env?:object, dry?:boolean, base?:string, timeoutMs?:number}} _
 */
export async function guardiaDeGeneradores({ correr = correrControlReal, env = process.env, dry = false, base = 'main', timeoutMs = TIMEOUT_MS } = {}) {
  let escape = null
  let rechazo = null
  // El escape se resuelve ANTES de correr el control y su rechazo no se traga: un motivo que no
  // alcanza tiene que gritar aunque el control termine verde, porque alguien creyó que lo salteaba.
  try { escape = motivoDelEscape(env) } catch (e) { rechazo = e.message }
  let codigo = null
  let salida = ''
  let error = null
  try {
    const r = await correr({ base, timeoutMs })
    codigo = r?.codigo ?? null
    salida = r?.salida ?? ''
  } catch (e) { error = String(e?.message ?? e) }
  const v = veredictoDeLaGuardia({ codigo, salida, error, escape, dry })
  if (rechazo) v.lineas.unshift(`⚠ escape RECHAZADO: ${rechazo}`)
  return v
}
