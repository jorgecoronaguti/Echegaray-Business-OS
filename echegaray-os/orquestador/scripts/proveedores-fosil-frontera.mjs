#!/usr/bin/env node
// LA CAPA FÓSIL DE "PROVEEDORES", DE LA FRONTERA PARA ABAJO — este script lo PRUEBA y la saca.
//
// ═══ QUÉ ES ═══
//
// De la fila 115 hasta el final, "Proveedores" no tiene tres cuadros: tiene N CORRIDAS SUPERPUESTAS
// de un generador retirado. `proveedores-materiales-pestana.mjs` escribía su bloque cada vez más
// abajo sin borrar el anterior, y su barrido de residuo propio informaba "0 limpiadas": no
// reconocía como suyo nada de lo que él mismo había escrito. El resultado, leído del archivo vivo:
//
//     117  4 · NOTAS DE CRÉDITO  |      | 0002-00000656 | 46048
//     119  Proveedor | Nota de crédito | 0002-00000664 | 26/2/2026 |  | Qué es | Anula → la reemplaza
//     122  STARLINK ARGENTINA    | 30-71754087-1 ← un CUIT bajo el encabezado "Nota de crédito"
//
// Columnas A/B de una capa, C/D de otra, F/G de una tercera, en la MISMA fila física. Y la
// numeración de bloques tiene DOS cuadros 5 ("LO QUE ARCA FACTURÓ" en 138 y "CONTROL Y AUDITORÍA"
// en 156) y dos cuadros 6. Eso es, literalmente, lo que el dueño llama *"la información está mal
// mostrada"*.
//
// ═══ POR QUÉ SE BORRA Y NO SE ARREGLA ═══
//
// Su generador está RETIRADO desde el 14/08 (`PASOS_RETIRADOS` en lib/flujo-caja-pasos.mjs) y las
// cuatro condiciones para reenchufarlo siguen sin cumplirse. O sea: ese bloque no se actualiza desde
// hace días y no se va a actualizar. Está publicando cifras del 14/08 —cobertura de ARCA, notas de
// crédito, controles de carga— al lado de tres dinámicas vivas, sin una sola marca que diga que está
// congelado.
//
// UN NÚMERO VIEJO PRESENTADO COMO ACTUAL ES PEOR QUE UN NÚMERO AUSENTE. El primero se usa para
// decidir; el segundo se busca. Y el conocimiento no se pierde: las notas de crédito y la cobertura
// de ARCA tienen su propia fuente, y volverán cuando su generador vuelva — a una pestaña donde
// quepan, no encima de ésta.
//
// ═══ POR QUÉ ES SEGURO, MEDIDO Y NO AFIRMADO ═══
//
//   node orquestador/scripts/medir-huella-pestana.mjs Proveedores
//   → 401 celdas selladas · 0 marcadas borrada_en · 0 abandonadas · rectángulo A117:G222 · 100,0%
//
// Las 401 celdas del rectángulo son MÍAS y ninguna lleva marca de borrado del dueño. Este script no
// confía en esa medición previa: la vuelve a hacer contra la base antes de tocar nada, y se niega si
// aparece una sola celda que no sea suya.
//
//   node orquestador/scripts/proveedores-fosil-frontera.mjs             → audita, no toca nada
//   node orquestador/scripts/proveedores-fosil-frontera.mjs --aplicar   → borra las filas y verifica
//
// Si debajo de la frontera hay celdas SIN sello —capas viejas del mismo generador, cuyo sello pisó
// la capa siguiente— el script las lista una por una y se niega igual. Incluirlas exige
// `--tambien-sin-sello`, que es un acto explícito y no un default.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
const ACEPTAR_SIN_SELLO = process.argv.includes('--tambien-sin-sello')
const PESTANA = 'Proveedores'

/** LA FRONTERA. La sección 3 —la dinámica de concentración— cierra en su fila de TOTAL. Todo lo que
 *  vive por debajo de esa fila más el colchón es la capa fósil. Se busca por RÓTULO, nunca por
 *  posición fija: la dinámica cambia de alto cada vez que aparece un proveedor nuevo. */
const ROTULO_FIN_SECCION_3 = 'TOTAL COMPRADO A PROVEEDORES'
const COLCHON = 1

/** Los títulos de la capa fósil. Si NINGUNO aparece debajo de la frontera, no hay nada que borrar. */
const TITULOS_FOSILES = ['NOTAS DE CRÉDITO', 'LO QUE ARCA FACTURÓ', 'CONTROL Y AUDITORÍA',
  'LO QUE ARCA REGISTRÓ', 'LO QUE HAY QUE CORREGIR']

export function frontera(colA) {
  const i = colA.findIndex((v) => String(v ?? '').toUpperCase().includes(ROTULO_FIN_SECCION_3))
  return i < 0 ? null : i + 1 + COLCHON // 1-based, ya con el colchón
}

export function tieneFosil(filas, desde) {
  const texto = filas.slice(desde).flat().map((v) => String(v ?? '').toUpperCase()).join(' | ')
  return TITULOS_FOSILES.filter((t) => texto.includes(t))
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTANA)
  if (!hoja) throw new Error(`no existe la pestaña "${PESTANA}"`)

  const filas = await google.readSheetValues(ID, `${PESTANA}!A1:Z${hoja.rows}`, { render: 'UNFORMATTED_VALUE' })
  const colA = filas.map((r) => (r || [])[0])
  const desde = frontera(colA)
  if (!desde) {
    console.error(`✖ no encuentro la fila "${ROTULO_FIN_SECCION_3}": sin frontera no borro nada.`)
    process.exit(1)
  }
  const ultima = filas.reduce((n, r, i) => ((r || []).some((c) => String(c ?? '').trim()) ? i + 1 : n), 0)
  const titulos = tieneFosil(filas, desde)

  console.log(`${PESTANA}: ${ultima} filas con contenido · frontera en la ${desde} (después de «${ROTULO_FIN_SECCION_3}»)`)
  if (ultima < desde) return console.log('✓ no hay nada debajo de la frontera: la pestaña ya está limpia.')
  console.log(`  capa fósil: filas ${desde}–${ultima} (${ultima - desde + 1} filas)`)
  console.log(`  títulos fósiles encontrados: ${titulos.length ? titulos.join(' · ') : 'ninguno'}`)

  // ── LA PRUEBA DE PROPIEDAD, CONTRA LA BASE Y NO CONTRA UN COMENTARIO ────────────────────────────
  // `sheet_huella_celda` guarda, celda por celda, qué escribió un generador del OS y si el dueño la
  // borró después. Se exige que TODA celda con contenido debajo de la frontera esté sellada por mí y
  // que NINGUNA tenga marca de borrado del dueño. Una sola que falle y no se borra nada.
  // `fila` es 1-based y `col` 0-based — medido contra la tabla, no supuesto.
  const { rows: sello } = await query(
    `select fila, col, borrada_en from public.sheet_huella_celda where pestana = $1`, [PESTANA],
  )
  const mias = new Set(sello.filter((s) => !s.borrada_en).map((s) => `${s.fila}:${s.col}`))
  const borradasPorElDueno = sello.filter((s) => s.borrada_en).length

  const letra = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }
  const ajenas = []
  for (let f = desde - 1; f < ultima; f++) {
    const fila = filas[f] || []
    for (let c = 0; c < fila.length; c++) {
      if (!String(fila[c] ?? '').trim()) continue
      if (!mias.has(`${f + 1}:${c}`)) ajenas.push(`${letra(c)}${f + 1}`)
    }
  }

  console.log(`\nPROPIEDAD  ${mias.size} celdas selladas como mías · ${borradasPorElDueno} con marca de borrado del dueño`)
  if (borradasPorElDueno) {
    console.error(`✖ hay ${borradasPorElDueno} celda(s) que el dueño borró y el generador repuso: no toco nada.`)
    process.exit(1)
  }
  // ── SEGUNDO GATE: DÓNDE VIVE, DE VERDAD, LO QUE ESCRIBIÓ EL DUEÑO ──────────────────────────────
  //
  // La huella sella UNA capa: la última que escribió. Debajo de la frontera hay VARIAS superpuestas,
  // así que las celdas que sólo tocó una capa vieja quedaron sin sello. Tratarlas como del dueño
  // —el default correcto en cualquier otra pestaña— acá bloquearía para siempre la limpieza de una
  // basura que el propio repositorio declara suya en `PASOS_RETIRADOS`.
  //
  // La prueba que sí cierra es por el otro lado: EL CONTENIDO MANUAL DEL DUEÑO EN ESTA PESTAÑA ES
  // ENUMERABLE Y VIVE EN POSTGRES. Son las notas de la columna «Qué hacer», ancladas al proveedor en
  // `public.proveedor_notas` y republicadas en cada corrida por `proveedores-notas-visibles.mjs`. Si
  // ninguna de ellas aparece debajo de la frontera, entonces debajo de la frontera no hay nada que
  // sólo exista en el Sheet — y borrar no puede perder trabajo de nadie.
  const { rows: notas } = await query(
    `select proveedor, nota from public.proveedor_notas where file_id = $1`, [ID],
  )
  const textoAbajo = filas.slice(desde - 1).flat().map((v) => String(v ?? '').trim()).filter(Boolean)
  const notasAbajo = notas.filter((n) => n.nota && textoAbajo.some((t) => t.includes(String(n.nota).trim())))

  console.log(`NOTAS      ${notas.length} nota(s) del dueño en Postgres · ${notasAbajo.length} aparece(n) debajo de la frontera`)
  if (!notas.length) {
    console.error('✖ `proveedor_notas` está vacía: sin ese respaldo no puedo probar dónde vive lo del dueño.')
    process.exit(1)
  }
  if (notasAbajo.length) {
    console.error(`✖ hay notas del dueño DEBAJO de la frontera: ${notasAbajo.map((n) => n.proveedor).join(' · ')}`)
    console.error('   no borro nada.')
    process.exit(1)
  }

  if (ajenas.length) {
    // Se listan TODAS, no una muestra: quien firme este borrado tiene que poder mirar cada celda.
    console.log(`\n${ajenas.length} celda(s) con contenido y SIN sello (capas viejas del mismo generador):`)
    for (let i = 0; i < ajenas.length; i += 12) console.log(`   ${ajenas.slice(i, i + 12).join(' ')}`)
    if (!ACEPTAR_SIN_SELLO) {
      console.error('\n✖ no borro: agregá --tambien-sin-sello para incluirlas, después de mirar la lista de arriba.')
      console.error('   El default es no tocar una celda sin sello, y ese default no se cambia solo.')
      process.exit(1)
    }
    console.log('   → --tambien-sin-sello: se incluyen en el borrado.')
  }
  console.log('✓ debajo de la frontera no hay contenido que sólo exista en el Sheet')

  if (!APLICAR) return console.log('\n(sin --aplicar: no toqué nada)')

  // `deleteDimension` en vez de `clearValues`: se lleva valores, formatos, notas y validaciones de
  // una sola vez. Un `clear` de valores deja el formato de la capa fósil pintado sobre filas vacías,
  // y eso vuelve a aparecer como "hueco raro" en el auditor de pantalla.
  const r = await google.spreadsheetBatchUpdate(ID, [{ deleteDimension: {
    range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: desde - 1, endIndex: hoja.rows },
  } }])
  if (r?.congelado) return console.log('🧊 el freno de mano está puesto: no borré nada.')
  if (r?.protegido) return console.log('🔒 la guarda descartó todo: la pestaña está candada.')

  // ── LA EVIDENCIA ES DEL EFECTO: se relee la pestaña y se cuenta lo que quedó ────────────────────
  const despues = await google.readSheetValues(ID, `${PESTANA}!A1:Z400`, { render: 'UNFORMATTED_VALUE' })
  const ultimaDespues = despues.reduce((n, f, i) => ((f || []).some((c) => String(c ?? '').trim()) ? i + 1 : n), 0)
  const quedan = tieneFosil(despues, 0)
  const mal = []
  if (ultimaDespues >= desde) mal.push(`quedó contenido en la fila ${ultimaDespues} y la frontera era la ${desde}`)
  if (quedan.length) mal.push(`siguen apareciendo títulos fósiles: ${quedan.join(' · ')}`)

  console.log(`\nDESPUÉS  ${ultimaDespues} filas con contenido (antes ${ultima})`)
  if (mal.length) { for (const m of mal) console.error(`✖ ${m}`); process.exitCode = 1 }
  else console.log(`✓ la capa fósil se fue: ${ultima - ultimaDespues} filas menos y ningún título fósil en la pestaña`)

  // La huella de lo borrado deja de tener sentido: si no se retira, la corrida siguiente creería que
  // esas celdas son suyas y están vacías porque el dueño las borró.
  const { rowCount } = await query(
    `delete from public.sheet_huella_celda where pestana = $1 and fila >= $2`, [PESTANA, desde],
  )
  console.log(`✓ ${rowCount} sello(s) de huella retirados: nadie va a reclamar esas filas`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1) })
}
