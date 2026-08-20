#!/usr/bin/env node
// LAS NOTAS DEL DUEÑO, AL LADO DE LA DEUDA DE CADA PROVEEDOR.
//
// ═══ POR QUÉ HIZO FALTA ═══
//
// El cuadro de deuda pasó a ser una tabla dinámica nativa. Una dinámica escribe sus propias filas y
// no admite columnas ajenas adentro, así que el generador que respaldaba y volvía a pintar las notas
// dejó de correr para esta pestaña: las doce notas del dueño quedaron vivas en `public.proveedor_notas`
// y desaparecieron de la vista. Son instrucciones operativas —"Contactar. pagar con cheque a 15",
// "no es prioridad", "Confirmar trueque con chatarra propia"—: sin ellas, el cuadro dice cuánto se
// debe y no dice qué hacer.
//
// ═══ ANCLADAS AL PROVEEDOR, NUNCA A LA FILA ═══
//
// Escribir la nota en la fila 22 porque hoy ahí está Mariana SA es el defecto que ya se pagó tres
// veces en este archivo: mañana la dinámica reordena por monto, Mariana baja dos filas y su nota
// queda al lado de otro proveedor. La nota se resuelve por BÚSQUEDA sobre el nombre que la propia
// dinámica escribió. Si el proveedor se mueve, su nota se mueve con él.
//
// ═══ SE FUE AL CUADRO DE DETALLE Y VOLVIÓ, EL MISMO DÍA (14/08) ═══
//
// Vivía en la D del cuadro que abre la sección, al lado del total de cada proveedor. A la mañana ese
// cuadro pasó a tener una línea POR DÍA de pago y en su columna A dejó de haber nombres: la búsqueda
// siguió viva, apuntada a una columna sin proveedores, y devolvió vacío en las doce notas. En
// silencio. La nota se mudó entonces al cuadro de detalle, a la G.
//
// A la tarde el dueño rechazó el cambio de eje —*"la base SIEMPRE es el nombre del proveedor"*— y el
// cuadro volvió a abrir por proveedor. La nota vuelve con él a la D: la columna en la que él la
// escribió, con el ancho que ya tenía, y ahora una sola vez por proveedor en vez de repetida en cada
// factura. Ver `lib/proveedores-cuadro-a.mjs`.
//
//   node orquestador/scripts/proveedores-notas-visibles.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-notas-visibles.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { geometriaDeLaSeccion } from '../lib/proveedores-pivot-seccion1.mjs'
import { COL_PROVEEDOR, colNota, letra, rangoDelCuadroA } from '../lib/proveedores-cuadro-a.mjs'
import { ANCHOS_PROVEEDORES } from '../lib/proveedores-frontera.mjs'
import { COL_NOTA_AUX } from '../lib/proveedores-auxiliar.mjs'
import { AUX, notasQueNoEntran, requestsDeNotas } from '../lib/proveedores-notas-columna.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
/** Quién escribe la auxiliar. Acá sólo se LEE: un bloque, un dueño. Ver lib/proveedores-auxiliar.mjs. */
const DUEÑO_AUX = 'proveedores-cuenta-corriente.mjs'
const APLICAR = process.argv.includes('--aplicar')
/** La columna de la nota en el cuadro que abre la sección (hoy la D). CALCULADA del pivot: ver
 *  `colNota`. Un número tipeado acá escribe la nota encima del importe el día que el cuadro cambie. */
const COL_NOTA = colNota()
/** La columna donde la dinámica escribe el nombre del proveedor (la A): es a lo que la nota se ancla. */
const COL_PROV = COL_PROVEEDOR
/** La letra de esa columna, para la fórmula. Calculada, nunca tipeada. */
const LETRA_PROV = letra(COL_PROV)
// ═══ EL ANCHO DE LA D NO SE FIJA ACÁ (04/08) ═══
//
// Este script ponía la D en 300px y proveedores-encabezado-aplicar.mjs la ponía en 80: ganaba el que
// corriera último, y nadie podía decir cuánto medía la columna sin saber el orden de la corrida. Un
// ancho es de la columna entera, así que su definición es una sola —ANCHOS_PROVEEDORES en
// lib/proveedores-frontera.mjs— y la aplica un solo generador. Acá se LEE, para no escribir una nota
// más larga de lo que entra.
/** Filas de más que se preparan: si mañana entra un proveedor, su nota ya lo espera. */
const COLCHON = 4

// ═══ LA FÓRMULA, EL RÓTULO Y EL FORMATO YA NO VIVEN ACÁ (14/08) ═══
//
// Este script no es el único que escribe esta columna: `proveedores-dos-cuadros.mjs` la vacía al
// limpiar su rectángulo y la repone en la MISMA corrida, porque correrlo solo borró las catorce
// notas del dueño sin avisar. Dos escritores con dos copias de la misma fórmula es cómo se
// desincronizan. Los requests salen de `lib/proveedores-notas-columna.mjs`, para los dos.

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const { rows: notas } = await query(
    "select proveedor, nota from public.proveedor_notas where trim(coalesce(nota,'')) <> '' order by proveedor")

  const porNombre = new Map(notas.map((n) => [String(n.proveedor).trim(), String(n.nota).trim()]))

  console.log(`NOTAS ${notas.length} · la auxiliar ${AUX} la escribe ${DUEÑO_AUX}`)
  for (const n of notas) console.log(`  ${String(n.proveedor).padEnd(34)} ${String(n.nota).slice(0, 62)}`)

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const geo = geometriaDeLaSeccion(visible)
  const filaRotulos = geo.filaEncabezado
  // EL TOPE ES EL SUBTÍTULO DEL CUADRO DE DETALLE, ubicado por su texto — no por la salida anterior
  // de nadie, que es lo que deja de reconocerse el día que un cuadro da #REF!. Contrato de la
  // sección: título · aire · control · rótulos · cuadro A · aire · subtítulo · rótulos · detalle.
  const iSub = visible.findIndex((f, i) => i >= filaRotulos
    && /^cada operaci[oó]n/i.test(String(f?.[0] ?? '').trim()))
  if (iSub < 0) throw new Error('no encontré el subtítulo "Cada operación": sin tope no escribo')
  const { desde, hasta, emitidas } = rangoDelCuadroA({
    visible, filaRotulos, filaTope: iSub + 1, colchon: COLCHON,
  })
  // ═══ Y SE USA PARA AVISAR LO QUE NO VA A ENTRAR ═══
  //
  // Leer el ancho compartido sirve para algo más que no pisarlo: a fontSize 9 en itálica entran unos
  // 7px por carácter, así que una nota más larga que eso se va a ver CORTADA en la pestaña. El dueño
  // escribe estas notas para leerlas; que una quede a medias es el mismo defecto de pantalla que el
  // resto del archivo persigue, sólo que en un texto suyo. No se trunca —es su texto— pero se avisa.
  const largas = notasQueNoEntran(porNombre, ANCHOS_PROVEEDORES[COL_NOTA])
  if (largas.length) {
    console.log(`\n⚠ ${largas.length} nota(s) más largas que los ${ANCHOS_PROVEEDORES[COL_NOTA]}px de la columna `
      + `(~${largas[0].entran} caracteres): se van a ver cortadas en la pestaña.`)
    for (const x of largas) console.log(`     ${x.proveedor.padEnd(26)} ${x.caracteres} car.: "${x.nota.slice(0, x.entran)}…"`)
  }
  const L = letra(COL_NOTA)
  console.log(`\nCUADRO "A QUIÉN SE LE DEBE": rótulos en la fila ${filaRotulos} · ${emitidas} proveedor(es)`
    + ` · el nombre en la ${LETRA_PROV} · la nota va en ${L}${desde}:${L}${hasta - 1}`
    + ` · el detalle ("Cada operación") empieza en la ${iSub + 1}`)
  if (hasta - desde < 1) throw new Error('el cuadro no tiene filas entre sus rótulos y el detalle: no escribo')
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  const aux = meta.find((s) => s.title === AUX)
  if (!hoja || !aux) throw new Error(`no encontré ${!hoja ? PESTAÑA : AUX}: no escribo a ciegas`)
  // LA AUXILIAR NO SE ESCRIBE ACÁ. La tenía como segundo escritor —con una columna más que el
  // primero— y lo único que evitaba el choque era el orden de PASOS. Sólo se comprueba que exista y
  // que tenga la columna que la fórmula va a pedir: escribir una búsqueda contra una columna que no
  // está devuelve vacío en silencio, que es peor que no escribirla.
  if ((aux.cols ?? 0) < COL_NOTA_AUX) {
    throw new Error(`${AUX} tiene ${aux.cols} columna(s) y la nota vive en la ${COL_NOTA_AUX}: `
      + `la escribe ${DUEÑO_AUX} y tiene que correr antes que esto. No escribo una búsqueda que va a dar vacío.`)
  }

  await google.spreadsheetBatchUpdate(ID, requestsDeNotas({
    sheetId: hoja.sheetId, filaRotulos, desde, hasta, columna: COL_NOTA, letraProveedor: LETRA_PROV,
  }), { espejo: true })

  // ── LA EVIDENCIA: qué proveedor con deuda quedó con su nota a la vista.
  const leido = await google.readSheetValues(ID, `${PESTAÑA}!A${filaRotulos}:${L}${hasta - 1}`)
  console.log('\nLEÍDO DEL ARCHIVO')
  let conNota = 0
  for (const f of (leido ?? []).slice(1)) {
    const prov = String(f?.[COL_PROV] ?? '').trim()
    if (!prov) continue
    const nota = String(f?.[COL_NOTA] ?? '').trim()
    if (nota) conNota++
    console.log(`  ${prov.padEnd(34)} ${String(f?.[1] ?? '').padStart(14)}  ${nota || '—'}`.slice(0, 118))
  }
  const sinVer = [...porNombre.keys()].filter((n) => !(leido ?? []).some((f) => String(f?.[COL_PROV] ?? '').trim() === n))
  console.log(`\n✓ ${conNota} proveedor(es) con deuda muestran su nota`)
  if (sinVer.length) console.log(`○ ${sinVer.length} nota(s) de proveedores SIN deuda hoy (no tienen fila en el cuadro): ${sinVer.slice(0, 6).join(' · ')}`)
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
