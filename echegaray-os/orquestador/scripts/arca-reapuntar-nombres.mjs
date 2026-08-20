#!/usr/bin/env node
// REAPUNTA LOS RANGOS CON NOMBRE DE ARCA LEYENDO LA PESTAÑA. SIN --aplicar NO TOCA NADA.
//
// ═══ POR QUÉ NO ALCANZA CON QUE LO HAGA EL GENERADOR (15/08/2026) ═══
//
// El reapuntado vive dentro de `proveedores-materiales-pestana.mjs` y ancla en la grilla que ese
// generador acaba de escribir. Es lo correcto MIENTRAS CORRA — y no corre: está en `PASOS_RETIRADOS`
// desde el 14/08 porque apila una capa por corrida. O sea que el arreglo del rango vive adentro del
// paso frenado, y el defecto se perpetúa solo.
//
// MEDIDO HOY sobre el archivo vivo, con el bloque bueno en las filas 177-182:
//
//   ARCA_FALTAN_N      → Proveedores!B144 = "23-36911157-4"    (un CUIT donde promete un contador)
//   ARCA_FALTAN_MONTO  → Proveedores!C144 = "0010-00000001"    (un comprobante donde promete plata)
//
// y los dos ÚNICOS lectores del archivo —`Materiales!B53` y `Proveedores!G11`— publican eso. La línea
// que tenían que mirar es la 181.
//
// ═══ POR RÓTULO, NO POR COORDENADA — Y NO POR "EL ÚLTIMO" ═══
//
// La pestaña tiene MÁS DE UNA copia del bloque (una capa fósil en 139-145). Quedarse con el primer
// rótulo que aparezca elige la fósil; con el último, eligió el fragmento huérfano de las filas 229-230
// el 13/08 y publicó 456 · $179.091.614 donde el bloque bueno dice 380. `ubicarBloqueVivo` decide por
// GRAMÁTICA —las seis líneas consecutivas y en orden— y falla cerrado si hay dos candidatos.
//
// ═══ Y ADEMÁS MIRA LA ESPECIE DE LAS CELDAS DEL BLOQUE, QUE LA HUELLA NO VE ═══
//
// `huella-forma.mjs` sella `<n>` tanto para el número 126944008 como para el TEXTO
// "126944007.80000003": comprobado llamando a `formaDe` con los dos. Así que la huella puede informar
// 100% de alineamiento sobre un bloque cuyos importes son texto — y un texto no suma en ninguna
// fórmula que lo referencie, sin dar error. Un control no se valida contra la información que produce:
// la especie se lee de la celda con UNFORMATTED_VALUE, que es lo único que distingue 380 de "380".
//
//   node orquestador/scripts/arca-reapuntar-nombres.mjs              (sólo informa)
//   node orquestador/scripts/arca-reapuntar-nombres.mjs --aplicar    (reapunta y retira)
//
// NO ESCRIBE UNA SOLA CELDA ni con --aplicar: addNamedRange/updateNamedRange/deleteNamedRange tocan la
// tabla de nombres del archivo, no su contenido. Sale con código distinto de 0 si hay algo que
// arreglar: es un control, y ésa es su forma de avisar.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  LINEAS_ARCA, NOMBRES_ARCA, NOMBRES_ARCA_RETIRADOS, destinosDeLaPestana, dondeViveCadaNombre,
} from '../lib/bloque-arca-nombres.mjs'
import { publicar, retirar, desalineados, especieDe } from '../lib/rangos-nombrados.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { NOMBRES } from '../lib/sheet-pestanas.mjs'
import { ALERTA } from '../lib/glifos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const PESTANA = NOMBRES.proveedores

// El techo de lectura de la columna A. Con la gramática de seis consecutivas, leer de más ya no puede
// elegir mal —eso era el defecto de "el último"—, pero una lectura sin techo sobre una hoja de mil
// filas es una llamada más cara por nada.
const TOPE_FILAS = 400

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: las celdas del bloque que son TEXTO donde la columna promete un número.
 *
 * ═══ POR QUÉ MIRA `typeof` Y NO `especieDe` (15/08/2026) ═══
 *
 * Porque `especieDe` no puede ver este defecto, y con razón: su trabajo es distinguir plata de un
 * número de comprobante, y para eso tolera a propósito el número que llega como string ("la API puede
 * devolverlo así según la ruta"). Con esa tolerancia, `especieDe("126944007.80000003")` devuelve
 * 'numero' y el control pasa en verde sobre la celda rota. Lo mismo hace la huella:
 * `formaDe(126944008)` y `formaDe("126944007.80000003")` sellan los dos `<n>`.
 *
 * Ninguna de las dos evidencias del repo puede ver un importe guardado como texto. Por eso hace falta
 * ésta, y por eso mira lo único que lo delata: el TIPO que devuelve la API. Con UNFORMATTED_VALUE —y
 * sólo con ése— un número viene como `number` y un texto como `string`; MEDIDO en el archivo vivo,
 * las filas 177/178/181/182 vinieron `number` y las 179/180 `string`.
 *
 * QUÉ ROMPE UNA CELDA ASÍ: no suma en ninguna fórmula que la cite, y no da error. La celda se DIBUJA
 * igual —el bloque va `#,##0`— así que tampoco se ve mirando la pestaña.
 *
 * Una celda VACÍA no se cuenta: puede ser una línea que esta corrida no produjo, y de eso ya avisa el
 * localizador.
 *
 * @param {Array<Array<unknown>>} bc las columnas B y C de las seis líneas, leídas UNFORMATTED_VALUE
 * @param {number} fila0 la fila REAL de la primera línea
 * @returns {Array<{fila:number, col:string, rotulo:string, valor:unknown, encontro:string, espera:string}>}
 */
export function celdasDeOtraEspecie(bc = [], fila0 = 1) {
  const mal = []
  LINEAS_ARCA.forEach((l, k) => {
    const fila = fila0 + k
    for (const [j, col, espera] of [[0, 'B', 'entero'], [1, 'C', 'importe']]) {
      const valor = (bc[k] || [])[j]
      if (valor === null || valor === undefined || String(valor).trim() === '') continue
      if (typeof valor === 'number') {
        // El tipo está bien; queda la pregunta de siempre, que sí contesta `especieDe`.
        const hay = especieDe(valor)
        const ok = espera === 'importe' ? (hay === 'entero' || hay === 'numero') : hay === espera
        if (!ok) mal.push({ fila, col, rotulo: l.texto.trim(), valor, encontro: hay, espera })
        continue
      }
      mal.push({ fila, col, rotulo: l.texto.trim(), valor, encontro: 'texto', espera })
    }
  })
  return mal
}

async function main() {
  const config = loadConfig()
  const google = makeGoogleClient({ config, scopes: APLICAR ? WRITE_SCOPES : undefined })
  let defectos = 0

  // 1 - DONDE ESTA EL BLOQUE, SEGUN LA PESTAÑA.
  const colA = await google.readSheetValues(ID, `${refPestana(PESTANA)}!A1:A${TOPE_FILAS}`)
  const { destinos, ubicacion } = destinosDeLaPestana(colA, 1)
  console.log(`bloque de ARCA: ${ubicacion.motivo}`)
  if (ubicacion.fila == null) {
    console.log(`${ALERTA} sin bloque identificable NO se reapunta nada: mover un nombre a la copia equivocada `
      + 'es peor que dejarlo donde está, porque la copia equivocada tiene cifras creíbles.')
    process.exitCode = 1
    return
  }

  // 2 - A DONDE APUNTAN HOY. Otra fuente que la que produjo el destino: la tabla del archivo.
  const rangos = await google.getNamedRanges(ID)
  const meta = await google.getSheetMeta(ID)
  const sheetId = meta.find((h) => h.title === PESTANA)?.sheetId
  if (sheetId == null) throw new Error(`no encontré la pestaña "${PESTANA}" en el archivo`)
  const vive = dondeViveCadaNombre(NOMBRES_ARCA, rangos, sheetId)
  for (const d of vive.destinos) {
    const esperado = destinos.find((x) => x.name === d.name)
    const donde = `${letra(d.col - 1)}${d.fila}`
    if (esperado && (esperado.fila !== d.fila || esperado.col !== d.col)) {
      defectos++
      console.log(`  ${ALERTA} ${d.name} vive en ${donde} y su línea está en ${letra(esperado.col - 1)}${esperado.fila}`)
    } else console.log(`  ✓ ${d.name} → ${donde}`)
  }
  for (const n of vive.ausentes) { defectos++; console.log(`  ${ALERTA} ${n} NO existe: toda fórmula que lo cite da #NAME?`) }
  for (const n of vive.enOtraPestana) { defectos++; console.log(`  ${ALERTA} ${n} vive fuera de "${PESTANA}": ya no significa lo que promete`) }

  // 3 - QUE HAY EN LAS CELDAS DEL BLOQUE. Lo que la huella no puede ver.
  const f0 = ubicacion.fila
  const rangoBC = `${refPestana(PESTANA)}!B${f0}:C${f0 + LINEAS_ARCA.length - 1}`
  const bc = await google.readSheetValues(ID, rangoBC, { render: 'UNFORMATTED_VALUE' })
  for (const c of celdasDeOtraEspecie(bc, f0)) {
    defectos++
    console.log(`  ${ALERTA} ${c.col}${c.fila} ("${c.rotulo}") = ${JSON.stringify(c.valor)} — es ${c.encontro}, `
      + `la columna promete ${c.espera}. Un texto no suma en ninguna fórmula que lo cite, y no da error.`)
  }

  // 4 - LOS DIEZ SIN LECTOR. Borrar un nombre no escribe una celda: el cuadro los sigue mostrando.
  const bajas = retirar([...NOMBRES_ARCA_RETIRADOS], rangos)
  if (bajas.length) {
    defectos++
    const cuales = NOMBRES_ARCA_RETIRADOS.filter((n) => rangos.some((r) => r.name === n))
    console.log(`  ${ALERTA} ${bajas.length} nombre(s) sin lector todavía publicados sobre la capa vieja: ${cuales.join(', ')}`)
  }

  if (!APLICAR) {
    console.log(defectos
      ? `\n${ALERTA} ${defectos} defecto(s). Sin --aplicar NO se tocó nada. Para corregir: --aplicar`
      : '\n✓ los nombres de ARCA apuntan a su línea y el bloque tiene números donde promete números')
    if (defectos) process.exitCode = 1
    return
  }

  // 5 - APLICAR. `publicar` relee la celda ANTES de apuntar y descarta el destino que no convence:
  // apuntar a basura es peor que no moverse.
  const r = await publicar(google, ID, sheetId, destinos, { titulo: PESTANA })
  console.log(`  ${r.nombres} nombre(s) apuntados${r.verificado ? ' y verificados releyendo la celda' : ' SIN verificar (no pude releer)'}`)
  for (const m of r.malApuntados) {
    console.log(`  ${ALERTA} ${m.name} NO se apuntó a ${letra(m.col - 1)}${m.fila}: hay ${JSON.stringify(m.valor)} (${m.encontro}) y promete ${m.espera}`)
  }
  if (bajas.length) {
    await google.spreadsheetBatchUpdate(ID, bajas)
    console.log(`  🗑 ${bajas.length} nombre(s) sin lector retirados. La pestaña los sigue mostrando: lo que se retira es el nombre, no la línea.`)
  }

  // 6 - LA EVIDENCIA ES DEL EFECTO. Se relee la tabla de nombres DEL ARCHIVO, no la lista que se mandó.
  const despues = dondeViveCadaNombre(NOMBRES_ARCA, await google.getNamedRanges(ID), sheetId)
  const leido = await google.readSheetValues(ID, rangoBC, { render: 'UNFORMATTED_VALUE' })
  const mal = desalineados(despues.destinos, (d) => (leido[d.fila - f0] || [])[d.col - 2])
  for (const d of despues.destinos) console.log(`  → ${d.name} = ${letra(d.col - 1)}${d.fila}`)
  for (const m of mal) console.log(`  ${ALERTA} ${m.name} quedó sobre ${JSON.stringify(m.valor)} (${m.encontro}), promete ${m.espera}`)
  if (mal.length || despues.ausentes.length) process.exitCode = 1
  else console.log('\n✓ verificado en el archivo: cada nombre vive en su línea y tiene la especie que promete')
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
