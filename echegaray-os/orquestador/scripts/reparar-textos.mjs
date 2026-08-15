#!/usr/bin/env node
// QUE TODO TEXTO SE PUEDA LEER ENTERO.
//
// POR QUÉ EXISTE (21/07). El dueño, cuatro veces sobre distintas pestañas: "no se entiende una
// mierda", "todo es un desastre". Los totales estaban bien y no había defectos de formato. Lo que
// pasaba es más simple y más grave: los rótulos, los encabezados y las notas eran más largos que su
// columna y se cortaban a mitad de palabra. Medido en las seis pestañas que el dueño iba a revisar:
// 118 textos que no entraban.
//
// Ningún control que suma ve esto, y el detector de formatos tampoco: hay que MEDIR el texto contra
// el ancho de su columna, que es lo único que decide si algo se puede leer.
//
// ═══ LAS DOS REPARACIONES, Y CUÁNDO VA CADA UNA ═══
//
// 1. ENSANCHAR la columna, cuando el texto es corto y la columna es mezquina. Un encabezado como
//    "Unidad de Negocio" en 100px se arregla con 20px más, no con ingeniería.
// 2. AVISAR, cuando el texto es un párrafo y ningún ancho razonable lo va a contener. El que lo
//    arregla es el generador dueño de esa pestaña, acortando el rótulo o moviendo la explicación al
//    subtítulo de la sección.
//
// ═══ POR QUÉ ESTE REPARADOR YA NO ESCRIBE NOTAS (23/07) ═══
//
// Antes hacía una tercera cosa: cuando el texto no entraba, le colgaba una NOTA a la celda con el
// párrafo entero. Parecía inofensivo —la nota no pisa nada, está a un click— y fue la causa de que
// el dueño reclamara TRES VECES por lo mismo: "quitá las notas de impuestos y financieros, son
// confusas", "está lleno de comentarios en cargas sociales", "vuelve a tener los comentarios de
// mierda esos en el medio".
//
// El mecanismo era este, y es el que importa: él borraba las notas a mano, este script volvía a
// medir el mismo texto en la misma columna, veía que seguía sin entrar, y las escribía de nuevo. Un
// reparador que corre sobre TODAS las pestañas siempre le gana a una persona que borra una vez.
//
// La regla del dueño es "si yo borro algo, respetar lo hecho". La única forma de garantizarla es que
// nadie las vuelva a escribir. Este script ahora ensancha y REPORTA; no anota.
//
// Lo que NO se hace es acortar el texto tirando información: la explicación de por qué un número es
// lo que es vale tanto como el número — pero su lugar es el subtítulo de la sección, una vez, no un
// triangulito amarillo por fila.
//
//   node orquestador/scripts/reparar-textos.mjs [pestaña] [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectar } from '../lib/defectos-pantalla.mjs'
import { anchosDe } from '../lib/anchos-declarados.mjs'
import { PESTANAS } from './formato-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SOLO = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null
const DRY = process.argv.includes('--dry')

/**
 * Hasta acá se puede ensanchar una columna sin romper la tabla. Más que esto, lo tiene que acortar el generador dueño.
 *
 * SUBIÓ DE 300 A 344 (21/07): cinco rótulos de línea del cash flow —"Intereses del acuerdo en
 * descubierto…", 50 caracteres— necesitaban 301px y quedaban cortados por UN píxel. Un tope redondo
 * no es un criterio: 344 es lo que mide la primera columna cuando lleva el nombre de una línea, que
 * es el texto más largo que una tabla de este archivo pone en su columna de rótulos.
 */
const ANCHO_MAX = 344
/** Un texto más largo que esto es un párrafo: no se arregla con ancho. */
const ES_PARRAFO = 64

const colIndex = (letras) => [...letras].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1

/**
 * ═══ UNA PESTAÑA CON ANCHOS DE FUENTE ÚNICA NO SE ENSANCHA DESDE ACÁ (05/08) ═══
 *
 * "Proveedores" declara sus ocho anchos en `lib/proveedores-frontera.mjs` y los aplica UN generador,
 * justamente porque tres escritores peleando por la misma propiedad dejaron la columna D en 80 o en
 * 300 según quién corriera último. Este script corre DESPUÉS de todos ellos y ensancha por su cuenta:
 * sería el escritor número siete, y el que gana. El defecto volvería en silencio y con la firma de un
 * reparador, que es la peor forma de que vuelva.
 *
 * Acá vale lo mismo que ya vale para las notas: se REPORTA y lo resuelve el generador dueño, que es
 * el único que puede decidir entre acortar el rótulo y mover la tabla. La lista sale del registro de
 * dueños, no de un nombre tipeado: el día que otra pestaña declare sus anchos, entra sola.
 */
export const CON_ANCHO_GOBERNADO = new Set(['Proveedores'])

/**
 * NÚCLEO PURO: decide qué hacer con cada texto que no entra.
 *
 * ═══ UNA COLUMNA CON ANCHO DECLARADO NO PASA POR LAS HEURÍSTICAS (15/08) ═══
 *
 * `ANCHO_MAX` y `ES_PARRAFO` contestan la misma pregunta de dos formas: "¿hay un ancho razonable que
 * contenga este texto?". Las dos son estimaciones sobre una columna de la que nadie se hizo cargo.
 * Cuando el ancho está DECLARADO (`lib/anchos-declarados.mjs`), la pregunta ya la contestó una
 * persona: se aplica ese número tal cual, y el único corte que queda es si el texto entra o no en él.
 *
 * Eso es lo que destraba `Cobranzas!H` —25 textos cortados en una pestaña de carga, o sea sin ningún
 * generador a quien derivarle el arreglo— sin mover un tope global que gobierna otras veinte
 * pestañas. Ver el porqué completo, con la medición, en la cabecera de `anchos-declarados.mjs`.
 *
 * @param {{anchoGobernado?:boolean, declarados?:Record<string, number>}} [opts]
 *        `anchoGobernado`: la pestaña declara sus anchos en una fuente única Y los aplica su propio
 *        generador — acá no se toca ninguna. `declarados`: el ancho por columna que este script SÍ
 *        aplica, porque nadie más lo va a aplicar.
 * @returns {{ensanchar: Map<number, number>, aNota: Array<{fila:number, col:number, texto:string}>}}
 */
export function planDeReparacion(defectos, anchos = [], filas = [], { anchoGobernado = false, declarados = {} } = {}) {
  const ensanchar = new Map()
  const aNota = []
  for (const d of defectos) {
    if (d.tipo !== 'texto_cortado') continue
    const j = colIndex(d.col)
    const texto = String(filas[d.fila - 1]?.[j]?.valor ?? d.valor)
    const tam = filas[d.fila - 1]?.[j]?.formato?.textFormat?.fontSize ?? 10
    const necesita = Math.ceil(texto.length * tam * 0.57) + 16
    const declarado = declarados[String(d.col).toUpperCase()] ?? null
    if (declarado !== null) {
      // El ancho declarado se aplica ENTERO, no "lo que necesite el texto de hoy": si dependiera del
      // dato, cada carga nueva movería la columna y volvería la disputa que esto viene a apagar.
      if (necesita > declarado) { aNota.push({ fila: d.fila, col: j, texto }); continue }
      ensanchar.set(j, declarado)
      continue
    }
    // Un párrafo no se arregla ensanchando: rompería la tabla y seguiría sin entrar. Y en una pestaña
    // con anchos de fuente única, NINGUNO se arregla ensanchando desde acá — todos se reportan.
    if (anchoGobernado || texto.length > ES_PARRAFO || necesita > ANCHO_MAX) { aNota.push({ fila: d.fila, col: j, texto }); continue }
    ensanchar.set(j, Math.max(ensanchar.get(j) ?? anchos[j] ?? 0, necesita))
  }
  return { ensanchar, aNota }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  // EL CANDADO (24/07): una pestaña que el dueño tomó no se toca, ni para ensanchar una columna.
  const bloqueadas = await import('../lib/pestana-bloqueada.mjs').then((m) => m.pestanasBloqueadas({}, ID)).catch(() => new Set())
  const lista = (SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS)
    .filter((p) => { if (bloqueadas.has(p.titulo)) { console.log(`🔒 ${p.titulo}: bajo tu control, no la toco.`); return false } return true })
  let total = 0

  for (const p of lista) {
    const hoja = meta.find((h) => h.title === p.titulo)
    if (!hoja) continue
    const alto = Math.min(hoja.rows ?? p.hastaFila, 400)
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${col(p.cols)}${alto}`).catch(() => null)
    if (!f) { console.log(`  ${p.titulo.padEnd(26)} no pude leerla`); continue }

    const defectos = detectar(f, { desdeFila: 1 }).filter((d) => d.tipo === 'texto_cortado')
    if (!defectos.length) { console.log(`  ${p.titulo.padEnd(26)} ✓`); continue }

    const anchoGobernado = CON_ANCHO_GOBERNADO.has(p.titulo)
    const declarados = anchosDe(p.titulo)
    const { ensanchar, aNota } = planDeReparacion(defectos, f.anchos, f.filas, { anchoGobernado, declarados })
    console.log(`  ${p.titulo.padEnd(26)} ${defectos.length} cortado(s) · ${ensanchar.size} columna(s) a ensanchar · ${aNota.length} a acortar`
      + (anchoGobernado ? ' · 🔒 anchos de fuente única: acá no se ensancha ninguna' : '')
      + (Object.keys(declarados).length ? ` · ancho declarado en ${Object.keys(declarados).join(', ')}` : ''))
    total += defectos.length
    if (DRY) continue

    const reqs = []
    for (const [j, px] of ensanchar) {
      // EL TOPE NO SE APLICA A UN ANCHO DECLARADO, y esto es lo que hace que la declaración sirva.
      // `planDeReparacion` ya decidió el número; volver a acotarlo acá por `ANCHO_MAX` recortaría los
      // 480px de `Cobranzas!H` a 344 y el texto seguiría cortado — con la columna movida igual, que
      // es el peor de los dos mundos: el defecto sigue y encima nadie entiende de dónde salió el 344.
      const declarado = anchosDe(p.titulo)[col(j + 1)] ?? null
      reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: declarado ?? Math.min(px, ANCHO_MAX) }, fields: 'pixelSize' } })
    }
    // ═══ EL TEXTO LARGO SE REPORTA, NO SE ANOTA ═══
    //
    // Acá se colgaba una nota con el párrafo entero. Era el mecanismo que resucitaba las notas que el
    // dueño borraba (ver la cabecera del archivo). Ahora se nombra el defecto y se deja para el
    // generador dueño de la pestaña, que es el único que puede acortar el rótulo sin perder el dato
    // —y que sabe si esa celda es una fórmula, en cuyo caso el texto largo es su RESULTADO y no se
    // puede reemplazar por una etiqueta sin convertir una fórmula en un número pegado.
    for (const n of aNota.slice(0, 4)) {
      console.log(`     ✎ fila ${n.fila} col ${n.col + 1}: ${String(n.texto).slice(0, 64)}… — lo tiene que acortar el generador de "${p.titulo}"`)
    }
    for (let i = 0; i < reqs.length; i += 200) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 200))
  }
  console.log(`\n${total ? `${total} texto(s) que no entraban` : '✓ todo el texto entra en su celda'}`)
}

function col(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
