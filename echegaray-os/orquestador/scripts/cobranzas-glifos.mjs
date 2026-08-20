#!/usr/bin/env node
// LOS GLIFOS DE "COBRANZAS", TRADUCIDOS UNA VEZ — Y LA COLUMNA SIGUE SIENDO DEL DUEÑO.
//
// ═══ EL DEFECTO ═══
//
// `Cobranzas!V` es el semáforo de estado de cada cobro y está escrito a mano, fórmula por fila:
// `=IF(J5="";"";IF(O5="Cobrado";"✅ Cobrado";…))`. Los cinco glifos son emoji y el PDF no los dibuja,
// así que la columna que el dueño usa para ver qué está vencido se imprime sin una sola marca.
// Medido por `auditar-pantalla`: 91 celdas `glifo_invisible` en V, más los dos rótulos de X4 y Z4
// que arrastran el `⚠` viejo.
//
// ═══ LA DECISIÓN: UNA PASADA, NO UN GENERADOR ═══
//
// Había dos caminos y el segundo se descartó a propósito:
//
//   (a) que un generador escriba la columna V. Quedaría mantenida, pero el OS se apropiaría de una
//       fórmula que el dueño tipeó — y con ella del CRITERIO que la fórmula codifica: que "por
//       vencer" son 7 días, que "Proyectado" gana sobre la fecha, el orden de la cascada. El día que
//       él cambie el umbral, el generador se lo pisa en la corrida siguiente y sin dar un error.
//       Este repo tiene seis pérdidas documentadas del trabajo del dueño, y todas empezaron con un
//       escritor automático que "sabía" cómo tenía que quedar una celda.
//
//   (b) traducir los glifos UNA VEZ y devolverle la columna. Es lo que hace este script.
//
// Lo que inclina la decisión no es la prudencia: es que NO HAY NADA QUE MANTENER. El glifo es texto
// constante adentro de una fórmula constante — no deriva de ningún dato, así que no se desactualiza
// nunca. Un generador que corre para siempre para sostener algo que no cambia es riesgo puro sin
// contrapartida. Y la regresión ya tiene control: si mañana alguien vuelve a tipear un emoji ahí,
// `auditar-pantalla` lo reporta como `glifo_invisible` al día siguiente. Existe el detector; lo que
// faltaba era la pasada de reparación, no un dueño nuevo.
//
// ═══ POR QUÉ EL REEMPLAZO ES TEXTUAL ═══
//
// No reconstruye la fórmula: lee la que hay y le cambia los cinco caracteres (ver
// `lib/glifos-semaforo.mjs`). Todo lo demás —umbrales, rangos, la guarda de fila vacía, cualquier
// cosa que el dueño haya editado— sale igual que entró. Es también lo que lo hace idempotente:
// correrlo dos veces no cambia nada la segunda.
//
// ═══ LO QUE NO TOCA ═══
//
//   · una celda que no cambia al traducirla;
//   · un emoji sin traducción declarada — se nombra y lo decide una persona, no se inventa;
//   · una celda literal que cuelgue de una `ARRAYFORMULA` de su misma columna: puede ser el derrame,
//     y escribir sobre un derrame lo convierte en texto pegado y mata la fórmula que lo produce;
//   · nada, si la pestaña está bajo candado o si el freno de mano de Sheets está puesto.
//
//   node orquestador/scripts/cobranzas-glifos.mjs            ← muestra el plan y no escribe
//   node orquestador/scripts/cobranzas-glifos.mjs --aplicar  ← la única pasada que escribe

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { aGlifosQueDibujan, sinTraduccion, necesitaTraduccion } from '../lib/glifos-semaforo.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = process.env.ORQ_PESTANA_GLIFOS || 'Cobranzas'
const APLICAR = process.argv.includes('--aplicar')

export const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: qué celdas hay que reescribir, cuáles no se tocan y por qué.
 *
 * Recibe la grilla tal como la devuelve `readSheetValues(..., { render: 'FORMULA' })`: una fórmula
 * llega con su `=` adelante y un literal llega como texto. Esa distinción es la que permite no
 * pisar el derrame de una `ARRAYFORMULA`, que llega SIN `=` porque es un resultado, no una fórmula.
 *
 * @param {string[][]} grilla filas × columnas, desde la fila 1 de la pestaña
 * @returns {{cambios:Array<{fila:number,col:number,antes:string,despues:string}>,
 *            sinMapear:Array<{fila:number,col:number,glifos:string[],valor:string}>,
 *            derrames:Array<{fila:number,col:number,valor:string}>}}
 */
export function planDeTraduccion(grilla = []) {
  const cambios = []
  const sinMapear = []
  const derrames = []
  const conArrayformula = new Set()
  grilla.forEach((fila, i) => {
    ;(fila || []).forEach((celda, j) => {
      const v = String(celda ?? '')
      if (/^=.*ARRAYFORMULA\(/i.test(v)) conArrayformula.add(j)
      if (!v.trim()) return
      const ciegos = sinTraduccion(v)
      if (ciegos.length) { sinMapear.push({ fila: i + 1, col: j, glifos: ciegos, valor: v.slice(0, 60) }); return }
      if (!necesitaTraduccion(v)) return
      // UN LITERAL DEBAJO DE UNA `ARRAYFORMULA` DE SU COLUMNA ES SOSPECHOSO DE SER EL DERRAME.
      // Escribirlo lo convertiría en texto pegado y mataría la fórmula que lo produce — el defecto
      // que este archivo ya pagó dos veces. Falla cerrado: ante la duda no se toca y se nombra.
      if (!v.startsWith('=') && conArrayformula.has(j)) { derrames.push({ fila: i + 1, col: j, valor: v.slice(0, 60) }); return }
      cambios.push({ fila: i + 1, col: j, antes: v, despues: aGlifosQueDibujan(v) })
    })
  })
  return { cambios, sinMapear, derrames }
}

/**
 * NÚCLEO PURO: LA INVARIANTE QUE REEMPLAZA A LA REGLA 0 ACÁ — y por qué es más fuerte que ella.
 *
 * La Regla 0 (`respetar-ediciones.mjs`) resuelve un conflicto: el generador trae SU texto, la celda
 * tiene el del dueño, y hay que decidir cuál gana. Acá no hay conflicto que resolver porque no hay
 * texto propio: cada valor que se escribe es el que se acaba de leer DE ESA MISMA CELDA con los
 * glifos traducidos. Si el dueño la editó, lo que se escribe es su edición traducida.
 *
 * Esta función es lo que convierte esa frase en un mecanismo: no se escribe una sola celda cuyo
 * `despues` no sea exactamente la traducción de su `antes`, ni una que venga de una celda vacía. Un
 * bug futuro que arme un texto por su cuenta —o que corra el mapeo dos veces, o que se mezcle una
 * fila con otra— no llega a la API.
 *
 * @param {Array<{fila:number,col:number,antes:string,despues:string}>} cambios
 * @returns {Array<{fila:number,col:number,despues:string}>} los que NO son una traducción de su origen
 */
export function loQueNoEsTraduccion(cambios = []) {
  return cambios.filter((c) => !String(c.antes ?? '').trim() || aGlifosQueDibujan(c.antes) !== c.despues)
    .map(({ fila, col, despues }) => ({ fila, col, despues }))
}

/** NÚCLEO PURO: los cambios, en la forma que espera `batchUpdateValues`. Una celda por rango. */
export function aRangos(cambios = [], pestaña = PESTAÑA) {
  return cambios.map((c) => ({ range: `'${pestaña}'!${letra(c.col)}${c.fila}`, values: [[c.despues]] }))
}

/** NÚCLEO PURO: el resumen por columna, que es como se lee un defecto de columna entera. */
export function porColumna(cambios = []) {
  const acc = new Map()
  for (const c of cambios) acc.set(letra(c.col), (acc.get(letra(c.col)) ?? 0) + 1)
  return [...acc].sort((a, b) => b[1] - a[1])
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const bloqueadas = await import('../lib/pestana-bloqueada.mjs').then((m) => m.pestanasBloqueadas({}, ID)).catch(() => new Set())
  if (bloqueadas.has(PESTAÑA)) { console.log(`🔒 ${PESTAÑA}: bajo tu control, no la toco.`); return }

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encuentro la pestaña "${PESTAÑA}"`)
  const ancho = letra((hoja.cols ?? 60) - 1)
  const grilla = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${ancho}${hoja.rows}`, { render: 'FORMULA' })

  const { cambios, sinMapear, derrames } = planDeTraduccion(grilla)
  console.log(`${PESTAÑA}: ${cambios.length} celda(s) con glifos que el PDF no dibuja`)
  for (const [col, n] of porColumna(cambios)) console.log(`   ${String(n).padStart(4)}×  columna ${col}`)
  for (const c of cambios.slice(0, 3)) console.log(`     ej. ${letra(c.col)}${c.fila}: ${c.despues.slice(0, 110)}`)
  for (const s of sinMapear) console.log(`   ⚠ ${letra(s.col)}${s.fila}: ${s.glifos.join(' ')} sin traducción declarada — "${s.valor}"`)
  for (const d of derrames) console.log(`   ⚠ ${letra(d.col)}${d.fila}: literal debajo de una ARRAYFORMULA, no lo toco — "${d.valor}"`)

  if (!cambios.length) { console.log('✓ nada que traducir'); return }
  if (!APLICAR) { console.log('\n(plan, no escribí nada — para aplicarlo: --aplicar)'); return }

  const impostores = loQueNoEsTraduccion(cambios)
  if (impostores.length) {
    throw new Error(`me niego a escribir: ${impostores.length} celda(s) del plan no son la traducción de lo que leí `
      + `(${impostores.slice(0, 3).map((c) => `${letra(c.col)}${c.fila}`).join(', ')}). Eso sería contenido propio, y acá no se escribe contenido propio.`)
  }
  // ═══ REGLA 0 — NO APLICA, Y ESTÁ DECIDIDO: `respetar: false` ═══
  //
  // La Regla 0 decide quién gana cuando el generador trae un texto y la celda tiene otro. Acá el
  // texto que se escribe ES el de la celda: se lee, se le cambian los glifos y se devuelve. No hay
  // dos versiones que comparar, hay una sola pasada por un traductor. Aplicarla igual sería peor que
  // inútil — vería que el destino difiere de lo que traigo y descartaría la reparación entera, o sea
  // la única forma de que el script no haga nada y diga que sí.
  //
  // Y NO ES UNA PROMESA: `loQueNoEsTraduccion` acaba de verificar celda por celda que cada valor a
  // escribir es exactamente la traducción de lo que se leyó en esa misma celda. Una escritura que no
  // lo sea aborta arriba, antes de tocar la API. La guarda de pestaña candada, el freno de mano y
  // `no-borrar` siguen todos puestos: `respetar: false` no levanta ninguno de los tres.
  const r = await google.batchUpdateValues(ID, aRangos(cambios), { respetar: false })
  if (r?.protegido) { console.log(`no escribí: ${r.motivo ?? 'la guarda descartó la escritura'}`); process.exitCode = 1; return }
  console.log(`\n✓ ${cambios.length} celda(s) traducidas. Verificá el PDF: node orquestador/scripts/ver-pestana.mjs "${PESTAÑA}"`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
