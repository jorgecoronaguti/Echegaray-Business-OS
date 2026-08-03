// EL FRENO DE MANO. Ninguna escritura automática toca un Sheet mientras esta marca exista.
//
// ═══ POR QUÉ EXISTE (02/08) ═══
//
// El dueño, textual: *"has arruinado todos los formatos y toda la información. Sacale el candado a todo
// y apagá todos los agentes de mantenimiento de sheet, no quiero que lo hagas más hasta nuevo aviso."*
//
// Apagar los timers no alcanza y este repo ya tiene la evidencia de por qué. El Sheet no lo escriben
// sólo los timers: lo escriben el worker del Work Fabric, el chat, un agente en worktree, un script
// corrido a mano, y cualquiera de ellos importando `google.mjs`. Cada uno de esos caminos fue, en algún
// momento, el que rompió algo. Una lista de servicios apagados es una defensa por enumeración: alcanza
// hasta que aparece el camino que nadie enumeró.
//
// ═══ POR QUÉ ACÁ Y NO EN LA GUARDA ═══
//
// `guarda-escritura.mjs` decide *de quién es* cada pestaña —candado, firma de valores, firma de formato—
// y es exactamente lo que el dueño acaba de pedir desarmar ("sacale el candado a todo"). Además tiene
// una puerta legítima: `yaGuardado:true`, que los escritores usan cuando ya evaluaron la guarda ellos
// mismos. Un freno que se pueda saltear con una opción no es un freno.
//
// Este vive ARRIBA de todo eso, en las cinco funciones de `google.mjs` que efectivamente mandan bytes a
// la API, y **no lo levanta ninguna opción de código**: ni `yaGuardado`, ni `espejo`, ni `respetar:false`.
// Sólo lo levanta una decisión humana tomada en el momento (ver abajo).
//
// ═══ CÓMO SE LEVANTA ═══
//
// Borrando la marca:            rm ~/.config/echegaray-orq/SHEETS-CONGELADOS
// O, para UNA corrida puntual:  ORQ_SHEETS_DESCONGELAR="motivo" node scripts/loQueSea.mjs
//
// La variable de entorno es deliberadamente incómoda: hay que tipearla en el comando, con un motivo, y
// queda en el log. Un timer no la tiene. Un worker no la tiene. Un agente que la ponga solo está
// dejando por escrito que la puso. Es la diferencia entre "no puede pasar" y "no puede pasar sin que
// quede dicho quién lo hizo y por qué" — y lo segundo es lo que se puede auditar después.
//
// La marca NO depende de Postgres a propósito. Si la base está caída, el freno tiene que seguir puesto:
// un freno que se suelta cuando falla una dependencia es el defecto que este repo ya pagó (fail-open).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Dónde vive la marca. Junto a la config del orquestador, fuera del repo: sobrevive a un checkout. */
export const RUTA_MARCA = process.env.ORQ_SHEETS_MARCA
  || path.join(os.homedir(), '.config', 'echegaray-orq', 'SHEETS-CONGELADOS')

/** NÚCLEO PURO: ¿este motivo de descongelamiento sirve? Uno vacío o trivial no es una decisión. */
export function motivoValido(m) {
  const s = String(m ?? '').trim()
  return s.length >= 8 && !/^(1|true|si|sí|yes|ok|x)$/i.test(s)
}

/**
 * ¿Está congelada la escritura de Sheets? Devuelve `null` si se puede escribir, o el texto de la marca
 * si no. Lee el archivo en CADA llamada a propósito: cuando el dueño borra la marca, el efecto es
 * inmediato y no hace falta reiniciar nada.
 */
export function congelado() {
  const desc = process.env.ORQ_SHEETS_DESCONGELAR
  if (desc !== undefined) {
    if (!motivoValido(desc)) {
      throw new Error(
        'ORQ_SHEETS_DESCONGELAR necesita un MOTIVO (mínimo 8 caracteres), no un "1". '
        + 'Es para que quede escrito quién levantó el freno y para qué.',
      )
    }
    return null // levantado a mano, con motivo, para esta corrida
  }
  let txt
  try { txt = fs.readFileSync(RUTA_MARCA, 'utf8') } catch { return null }
  return txt.trim() || 'escritura de Sheets congelada por pedido del dueño'
}

/** El motivo con el que se levantó el freno en esta corrida, o null. Para dejarlo en el log. */
export function motivoDeLevantamiento() {
  const d = process.env.ORQ_SHEETS_DESCONGELAR
  return d !== undefined && motivoValido(d) ? String(d).trim() : null
}

/** NÚCLEO PURO: el aviso que ve quien intentó escribir. Dice qué se frenó y cómo se levanta. */
export function aviso(marca, fileId, detalle) {
  return `🧊 ESCRITURA DE SHEETS CONGELADA — no toqué ${detalle || fileId}.\n`
    + `   ${String(marca).split('\n').map((l) => l.trim()).filter(Boolean).join('\n   ')}\n`
    + `   Para levantarlo: rm ${RUTA_MARCA}   ·   o por única vez: ORQ_SHEETS_DESCONGELAR="motivo" <comando>`
}

/**
 * El chequeo que hacen las cinco funciones de escritura de `google.mjs`. Si está congelado, avisa una
 * sola vez por proceso (para no llenar el log de un generador con 200 rangos) y devuelve el resultado
 * que los llamadores ya saben interpretar: `{ protegido: true }` — la misma forma que devuelve la
 * guarda cuando descarta una escritura, así que ningún script se rompe, simplemente no escribe.
 */
let yaAviso = false
export function frenar(fileId, detalle) {
  const marca = congelado()
  if (!marca) return null
  if (!yaAviso) { console.log(aviso(marca, fileId, detalle)); yaAviso = true }
  return { protegido: true, congelado: true, motivo: marca, bloqueadas: [detalle || fileId].filter(Boolean) }
}

/** Para los tests: olvidar que ya avisó. */
export function _resetAviso() { yaAviso = false }
