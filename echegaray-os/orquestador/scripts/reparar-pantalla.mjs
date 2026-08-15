#!/usr/bin/env node
// DEVUELVE SU FORMATO A LAS CELDAS QUE QUEDARON CON EL DE LA COLUMNA.
//
// POR QUÉ (21/07). El auditor de pantalla encontró el mismo defecto en siete pestañas distintas, y
// siempre por la misma causa: el script pinta un RECTÁNGULO entero con formato de moneda —porque la
// mayoría de esa zona son importes— y después no le devuelve el suyo a las celdas que no lo son. Así
// quedaron "ARS", "Total retenido", "Cantidad", "Alícuota medida" y treinta y siete notas mostradas
// como si fueran plata.
//
// ═══ POR QUÉ SE REPARA POR CONTENIDO Y NO POR POSICIÓN ═══
//
// La tentación era arreglar cada script agregándole un `fmt(fila 25, columna D…)`. Ya sé cómo
// termina eso: el 21/07 el control de Cobranzas decidía el formato con una regex sobre el texto del
// rótulo, y al mejorar dos redacciones los conteos pasaron a mostrarse como "$4". Un formato atado a
// una coordenada o a una palabra se desincroniza la próxima vez que el bloque crece una fila.
//
// Acá el criterio es el CONTENIDO de la celda, que es un hecho: si adentro hay una frase, no es un
// importe, y no puede serlo por más que el bloque se mueva.
//
// ═══ QUÉ NO REPARA, Y POR QUÉ ═══
//
// · fecha_cero → la causa es una fórmula (un MINIFS que devuelve 0). Pisarle el formato taparía el
//   problema dejando la fórmula rota. Se arregla en el script que la escribe.
// · cuit_sin_formato → hay que reescribir el valor, no el formato.
// · hueco → es un colchón de derrame mal dimensionado; se corrige donde se decide el tamaño.
//
// Esos tres se informan y no se tocan. Reparar lo que se puede y callar lo que no sería peor que no
// reparar nada.
//
// ═══ UNA PESTAÑA DE CARGA YA NO SE SALTEA EN SILENCIO (15/08) ═══
//
// El filtro era `!p.carga` y sacaba `Compras` y `Cobranzas` ANTES de leerlas: `--dry` sobre `Compras`
// no proponía nada y tampoco decía por qué. Mientras tanto la pestaña tenía 75 defectos medidos, 70 de
// ellos filas con `WRAP` puesto y 20px de alto — o sea texto ESCRITO Y ESCONDIDO. El filtro protegía
// bien y informaba mal, y un control que calla se vuelve indistinguible de uno que da verde.
//
// LA REGLA NO ES "TODO O NADA": ES QUÉ CLASE DE REPARACIÓN. Lo que la protección quiere impedir está
// escrito arriba —"cambiarle el formato a una planilla donde alguien carga a mano todos los días es
// cambiarle el escritorio sin preguntarle"—, y eso es exactamente `formatoQueVa`: fuente, color,
// itálica y fondo elegidos por heurística sobre las celdas que el dueño tipea. Esa sigue prohibida.
//
// La que sí se repara en una pestaña de carga es UNA sola: el ALTO de una fila. No toca ni un valor ni
// un formato de celda — hace VISIBLE lo que ya está escrito, que es lo contrario de cambiarle el
// escritorio a alguien. En `Compras` es además el costo declarado y nunca pagado del `WRAP` que puso
// `compras-formato.mjs` (ver su cabecera: "las ~74 filas afectadas crecen en alto").
//
// ═══ LO QUE SE MIRÓ Y SE DECIDIÓ NO REPARAR: `Cobranzas!U` ═══
//
// Sus 24 avisos de `texto_en_numero` tentaban a sacarle el `numberFormat` a la columna. Medido, habría
// sido apagar la luz: el formato es CORRECTO para las 38 celdas donde la fórmula devuelve un número de
// días, y Sheets dibuja bien el texto de las otras. Sacárselo no arregla nada y hace que el detector
// deje de mirar la columna — silenciar un error no es arreglarlo. Lo que está mal ahí es que una
// columna lleve un contador Y un estado, con `V` ya llamándose «Estado cobro», y eso se parte en dos
// columnas: una decisión del dueño sobre su planilla de carga. El núcleo lo reporta UNA vez
// (`columnasEstadoYNumero`) y acá se nombra a quién le toca.
//
//   node orquestador/scripts/reparar-pantalla.mjs [--dry] [pestaña]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectar, resumen, altoQueEntra } from '../lib/defectos-pantalla.mjs'
import { PESTANAS } from './formato-pestanas.mjs'
import * as E from '../lib/estilo-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const SOLO = process.argv.slice(2).find((a) => !a.startsWith('--'))

/** A partir de cuántos caracteres una celda de texto es una NOTA y no un rótulo. */
const LARGO_NOTA = 45

/**
 * NÚCLEO PURO: qué formato le corresponde a una celda que quedó con el de la columna.
 *
 * Tres casos, decididos por lo que la celda TIENE adentro:
 *   · una frase larga  → es una nota al costado: chica, gris, itálica
 *   · varias en la misma fila → es la fila de ENCABEZADO de una tabla
 *   · una palabra suelta → es un rótulo o una unidad ("ARS", "U$S 581,39"): texto a secas
 */
export function formatoQueVa(valor, esFilaDeEncabezado) {
  if (esFilaDeEncabezado) return E.encabezado()
  if (String(valor ?? '').length >= LARGO_NOTA) return E.nota()
  return E.celda('texto')
}

/**
 * NÚCLEO PURO: ¿qué filas son de encabezado?
 * Una fila con TRES O MÁS celdas de texto donde debería haber números es un encabezado de tabla, no
 * tres errores sueltos. Distinguirlo importa: un encabezado va con el fondo del estándar, y una nota
 * suelta no.
 */
export function filasDeEncabezado(defectos = []) {
  const porFila = new Map()
  for (const d of defectos.filter((x) => x.tipo === 'texto_en_numero')) {
    porFila.set(d.fila, (porFila.get(d.fila) ?? 0) + 1)
  }
  return new Set([...porFila.entries()].filter(([, n]) => n >= 3).map(([f]) => f))
}

const col0 = (letra) => { let n = 0; for (const c of letra) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1 }
function colLetra(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

/** Quién arregla cada clase que este script NO toca. Se nombra por TIPO, no por pestaña tipeada. */
export const QUIEN_LO_ARREGLA = Object.freeze({
  texto_cortado: 'reparar-textos.mjs (ensancha la columna) o el generador dueño (acorta el rótulo)',
  fecha_cero: 'el script que escribe la fórmula: es un MINIFS que devuelve 0',
  cuit_sin_formato: 'el script que escribe el valor: hay que reescribirlo, no reformatearlo',
  hueco: 'donde se decide el tamaño del colchón de derrame',
  glifo_invisible: 'el generador que lo escribe: usá ALERTA de lib/glifos.mjs',
  serial_crudo: 'el script que escribe la celda: es contenido de fecha con formato TEXT',
  // NO SE REPARA A PROPÓSITO, y es la clase donde más tentaba hacerlo. Sacarle el `numberFormat` a la
  // columna apagaría los avisos sin arreglar nada: el formato es correcto para sus celdas numéricas y
  // Sheets dibuja bien el texto de las otras. Lo que está mal es que la columna lleve dos conceptos, y
  // eso se parte en dos columnas — una decisión del dueño sobre su planilla. Silenciar no es arreglar.
  columna_estado_y_numero: 'el dueño: partir la columna en dos (el contador y el estado)',
})

/** La pestaña que tiene un generador dueño de su FORMATO, para poder nombrarlo en el informe. */
export const GENERADOR_DE_FORMATO = Object.freeze(new Map([
  ['Compras', 'orquestador/scripts/compras-formato.mjs'],
]))

/**
 * NÚCLEO PURO: qué se repara en esta pestaña, qué queda para otro, y por qué.
 *
 * Separado del `main` porque es la única parte que tiene criterio: el resto es armar requests y
 * mandarlos. Devuelve DESCRIPTORES, no requests, para poder probarlo sin una hoja ni un `sheetId`.
 *
 * @param {{titulo:string, carga?:boolean}} p la pestaña
 * @param {Array<object>} defectos
 * @param {Array<Array<object>>} filas
 * @param {number[]} altos el alto ACTUAL de cada fila
 */
export function planDePantalla(p, defectos = [], filas = [], altos = []) {
  // EN UNA PESTAÑA DE CARGA NO SE TOCA EL FORMATO DE UNA CELDA SUELTA: es el escritorio del dueño.
  const celdas = defectos.filter((d) => d.tipo === 'texto_en_numero' && !p.carga)
  const altoPorFila = new Map()
  for (const d of defectos.filter((x) => x.tipo === 'texto_apretado')) {
    // NUNCA SE ACHICA UNA FILA. El alto que el dueño le puso a una fila es una decisión suya; lo único
    // que este script sabe es que hace falta MÁS. `max` con el actual lo vuelve monótono: reparar no
    // puede deshacer nada, sólo destapar.
    const px = Math.max(altos[d.fila - 1] ?? 0, altoQueEntra(d.lineas, d.fontSize))
    altoPorFila.set(d.fila, Math.max(altoPorFila.get(d.fila) ?? 0, px))
  }
  const reparado = new Set(celdas)
  const sinTocar = defectos.filter((d) => d.tipo !== 'texto_apretado' && !reparado.has(d))
  return { celdas, altoPorFila, sinTocar }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  // La grilla real acota el rango: pedir/escribir más allá de las filas asignadas hace fallar la API.
  const alto = new Map(meta.map((h) => [h.title, h.rows ?? 0]))
  // EL CANDADO (24/07): una pestaña que el dueño tomó no se reformatea NI un ancho de columna —
  // "ningún agente la toca" incluye este reparador. Sin esto, se le cambiaba altos/anchos/formatos a
  // la pestaña que él acababa de restaurar. Las de CARGA ya NO se filtran acá: se leen, se informan y
  // se les repara sólo lo que no cambia nada de lo que el dueño eligió (ver la cabecera del archivo).
  const bloqueadas = await import('../lib/pestana-bloqueada.mjs').then((m) => m.pestanasBloqueadas({}, ID)).catch(() => new Set())
  const lista = (SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS)
    .filter((p) => { if (bloqueadas.has(p.titulo)) { console.log(`🔒 ${p.titulo}: bajo tu control, no la reformateo.`); return false } return true })
  let reparadas = 0, sinReparar = 0

  for (const p of lista) {
    const hoja = meta.find((h) => h.title === p.titulo)
    if (!hoja) continue
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${colLetra(p.cols)}${alto.get(p.titulo) || p.hastaFila}`).catch(() => null)
    if (!f) { console.log(`  ${p.titulo.padEnd(26)} no pude leerla`); continue }

    // Una pestaña de carga tiene filas vacías al final POR DISEÑO: contarlas como hueco es ruido en
    // cada corrida, y así es como un control deja de mirarse. Mismo criterio que `auditar-pantalla`.
    const d = detectar(f, { huecoMax: p.carga ? 999 : 3 })
    if (!d.length) { console.log(`  ${p.titulo.padEnd(26)} ✓`); continue }
    const { celdas, altoPorFila, sinTocar } = planDePantalla(p, d, f.filas, f.altos || [])

    const cabeceras = filasDeEncabezado(d)
    const reqs = celdas.map((x) => ({
      repeatCell: {
        range: { sheetId: hoja.sheetId, startRowIndex: x.fila - 1, endRowIndex: x.fila, startColumnIndex: col0(x.col), endColumnIndex: col0(x.col) + 1 },
        cell: { userEnteredFormat: formatoQueVa(x.valor, cabeceras.has(x.fila)) },
        fields: 'userEnteredFormat',
      },
    }))
    // Una fila puede tener varias celdas apretadas: se le pone el alto MÁXIMO que pida cualquiera.
    for (const [fila, px] of altoPorFila) {
      if (!px) continue
      reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila }, properties: { pixelSize: px }, fields: 'pixelSize' } })
    }

    const marca = p.carga ? ' (carga: sólo el alto de fila)' : ''
    console.log(`  ${p.titulo.padEnd(26)} ${reqs.length} reparable(s)${marca}${sinTocar.length ? ` · ${sinTocar.length} que NO se tocan` : ''}`)
    const dueño = GENERADOR_DE_FORMATO.get(p.titulo)
    for (const r of resumen(sinTocar)) {
      const quien = QUIEN_LO_ARREGLA[r.tipo] ?? (dueño ? `el generador dueño: ${dueño}` : 'el script que lo escribe')
      console.log(`     ✗ ${String(r.n).padStart(2)}× ${r.tipo} (ej. ${r.ejemplo.col}${r.ejemplo.fila} "${String(r.ejemplo.valor).slice(0, 28)}") — lo arregla ${quien}`)
    }
    sinReparar += sinTocar.length
    if (DRY || !reqs.length) continue
    for (let i = 0; i < reqs.length; i += 300) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 300))
    reparadas += reqs.length
  }

  if (DRY) { console.log('\n(--dry) no escribí nada'); return }

  // VERIFICACIÓN: releer y contar lo que quedó. LA EVIDENCIA ES DEL EFECTO, NO DEL INTENTO.
  let quedan = 0
  for (const p of lista) {
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${colLetra(p.cols)}${alto.get(p.titulo) || p.hastaFila}`).catch(() => null)
    if (!f) continue
    const d = detectar(f, { huecoMax: p.carga ? 999 : 3 })
    const { celdas, altoPorFila } = planDePantalla(p, d, f.filas, f.altos || [])
    quedan += celdas.length + altoPorFila.size
  }
  console.log(`\n✓ ${reparadas} celda(s)/fila(s) reparadas · quedan ${quedan} de formato/alto${sinReparar ? ` y ${sinReparar} que necesitan tocar el script` : ''}`)
  if (quedan) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
