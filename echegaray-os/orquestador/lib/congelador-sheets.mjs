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
// la API, y **no lo levanta ninguna bandera de comportamiento**: ni `yaGuardado`, ni `espejo`, ni
// `respetar:false`. Lo único que lo levanta es una DECISIÓN HUMANA, y siempre con nombre.
//
// ═══ CÓMO SE LEVANTA ═══
//
// Borrando la marca:            rm ~/.config/echegaray-orq/SHEETS-CONGELADOS
// Para UNA corrida puntual:     ORQ_SHEETS_DESCONGELAR="motivo" node scripts/loQueSea.mjs
// Para UNA escritura del chat:  frenar(fileId, detalle, { confirmacion: { actor, motivo } })
//
// La variable de entorno es deliberadamente incómoda: hay que tipearla en el comando, con un motivo, y
// queda en el log. Un timer no la tiene. Un worker no la tiene. Un agente que la ponga solo está
// dejando por escrito que la puso. Es la diferencia entre "no puede pasar" y "no puede pasar sin que
// quede dicho quién lo hizo y por qué" — y lo segundo es lo que se puede auditar después.
//
// ═══ LA CONFIRMACIÓN HUMANA (03/08) — POR QUÉ LA DISTINCIÓN ES REAL ═══
//
// El dueño decidió: *una persona identificada que confirma en el chat puede escribir; los timers, los
// generadores y los agentes de mantenimiento siguen bloqueados.* La marca NO se borra: sigue puesta y
// sigue frenando todo lo demás.
//
// La distinción no es una convención que dependa de la buena fe del que llama. Un timer no tiene un
// `actor`: nadie apretó nada, no hay identidad de plataforma que arrastrar hasta acá, y este subsistema
// ya falla cerrado sin identidad real (una escritura sin nombre no es una escritura). Un generador
// tampoco: corre solo, contra un cron, sin nadie del otro lado. El `actor` que llega hasta acá viene del
// evento autenticado de Mattermost —el mismo `plataforma_user_id` con el que se firma la auditoría y se
// arma la clave de idempotencia—, así que "hubo una persona" es un hecho verificable, no una promesa.
//
// Por eso hacen falta LAS DOS cosas, y ninguna de las dos se puede fabricar por accidente:
//   · `actor`  — quién. Vacío, `true`, `{}` o un booleano no levantan nada.
//   · `motivo` — para qué, con la misma vara que la variable de entorno (`motivoValido`, ≥8 caracteres
//                y no trivial). Un "ok" no es una decisión.
//
// Y **se loguea en CADA escritura, no una vez por proceso**. El aviso de congelado sí se emite una sola
// vez —para no llenar el log de un generador con 200 rangos—, pero el LEVANTAMIENTO es lo contrario:
// cada línea que dice `🔓 freno levantado por X: motivo` es una escritura que ocurrió sobre un Sheet
// que en teoría estaba frenado. Un bypass que deja una sola línea por proceso no se puede auditar
// después: no se sabe si escribió una celda o mil.
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
  // EXIGE UNA CADENA, Y NO ES PEDANTERÍA.
  //
  // Antes hacía `String(m ?? '')`, así que `motivoValido({})` daba **true**: `String({})` es
  // "[object Object]", quince caracteres que no matchean ninguna palabra trivial. Un `{ actor,
  // motivo }` mal desestructurado —pasar el objeto entero donde va el motivo— LEVANTABA EL FRENO
  // DE MANO con un motivo que no dice nada. Lo mismo un array de nueve números, que se aplana a
  // "1,2,3,4,5,6,7,8,9".
  //
  // El freno es lo único que separa un script del trabajo del dueño en el Sheet, y este repo ya
  // perdió ese trabajo seis veces. Una puerta que se abre con basura no es una puerta.
  if (typeof m !== 'string') return false
  const s = m.trim()
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
 * NÚCLEO PURO: ¿esto es una confirmación humana que levanta el freno para ESTA escritura?
 *
 * Devuelve `{ actor, motivo }` normalizado, o `null`. Falla cerrado ante cualquier cosa que no sean las
 * dos piezas completas: `true`, `1`, `{}`, un actor vacío o un motivo trivial NO levantan nada. Es
 * deliberado que no exista una forma corta de decir que sí — el freno se saltea con nombre y con
 * motivo, o no se saltea.
 *
 * @param {{actor?:string, motivo?:string}|unknown} c
 * @returns {{actor:string, motivo:string}|null}
 */
export function confirmacionValida(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  // El actor también tiene que ser una cadena: un objeto se aplanaba a "[object Object]" y quedaba
  // registrado como el nombre de quien levantó el freno. Un log que nombra a nadie no rinde cuentas.
  if (typeof c.actor !== 'string' || typeof c.motivo !== 'string') return null
  const actor = c.actor.trim()
  const motivo = c.motivo.trim()
  if (!actor) return null
  if (!motivoValido(motivo)) return null
  return { actor, motivo }
}

/**
 * El chequeo que hacen las cinco funciones de escritura de `google.mjs`. Si está congelado, avisa una
 * sola vez por proceso (para no llenar el log de un generador con 200 rangos) y devuelve el resultado
 * que los llamadores ya saben interpretar: `{ protegido: true }` — la misma forma que devuelve la
 * guarda cuando descarta una escritura, así que ningún script se rompe, simplemente no escribe.
 *
 * `confirmacion` es la ÚNICA opción que lo levanta, y sólo la reenvía `batchUpdateValues` (ver
 * `google.mjs`): superficie mínima, que es la que usa la asistencia por chat. El levantamiento se
 * loguea en cada llamada, a propósito — ver el encabezado.
 *
 * @param {string} fileId
 * @param {string} [detalle]
 * @param {{confirmacion?:{actor?:string, motivo?:string}}} [opciones]
 */
let yaAviso = false
export function frenar(fileId, detalle, { confirmacion } = {}) {
  const marca = congelado()
  if (!marca) return null
  const ok = confirmacionValida(confirmacion)
  if (ok) {
    console.log(`🔓 freno levantado por ${ok.actor}: ${ok.motivo}`)
    return null
  }
  if (!yaAviso) { console.log(aviso(marca, fileId, detalle)); yaAviso = true }
  return { protegido: true, congelado: true, motivo: marca, bloqueadas: [detalle || fileId].filter(Boolean) }
}

/** Para los tests: olvidar que ya avisó. */
export function _resetAviso() { yaAviso = false }
