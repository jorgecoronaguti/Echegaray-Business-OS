#!/usr/bin/env node
// LAS DDJJ F931 REALES, LEÍDAS DEL PDF Y PUESTAS EN EL SHEET.
//
// POR QUÉ EXISTE (21/07). El bloque "1 · DECLARADO EN LA DDJJ F931" de Cargas Sociales tenía 84
// números pegados y —lo más grave— NINGÚN SCRIPT LO ESCRIBÍA. Alguien transcribió a mano seis meses
// de declaraciones y ahí quedaron: cuando se presente el F931 de julio, el cuadro va a seguir
// mostrando seis meses y nadie se va a enterar. Es la regla 6 incumplida de la peor manera, porque
// no falla: envejece.
//
// El parser de las DDJJ ya existía en lib/cargas-sociales.mjs, con sus tests, desde el 20/07. Nunca
// se había conectado a nada. Es el mismo patrón que ya apareció tres veces en este OS: la capacidad
// construida y desenchufada.
//
// ═══ LA CADENA COMPLETA ═══
//
//   PDF en el data room → parseF931 → _F931_RAW (réplica declarada) → fórmulas del bloque 1
//
// Igual que _ARCA_RAW con el libro de IVA: si el insumo no está en el archivo, se trae el INSUMO y
// no se pega el RESULTADO. Y la réplica dice de qué archivo salió cada columna y cuándo se leyó.
//
// GANANCIA DE PRECISIÓN, NO SÓLO DE AUTOMATISMO. Lo transcripto estaba redondeado al peso; el PDF
// trae los centavos. El total declarado del semestre pasa de $44.776.342 a su valor exacto.
//
//   node orquestador/scripts/f931-sheet.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { parseF931, CONCEPTOS_F931 } from '../lib/cargas-sociales.mjs'
import * as E from '../lib/estilo-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_F931_RAW'
const DESTINO = 'Cargas Sociales'
const AÑO = String(new Date().getFullYear())
const DRY = process.argv.includes('--dry')

/** Las columnas de la réplica. El orden es contrato: las fórmulas del bloque 1 lo referencian. */
export const COLUMNAS = [
  ['Período', 'texto'], ['Código', 'texto'], ['Concepto', 'texto'], ['Monto', 'monedaExacta'],
  ['Empleados', 'cantidad'], ['Remuneración declarada', 'monedaExacta'], ['Archivo de origen', 'texto'],
]
export const COL = { periodo: 'A', codigo: 'B', concepto: 'C', monto: 'D', empleados: 'E', remuneracion: 'F', archivo: 'G' }
export const FILA0 = 4

/** NÚCLEO PURO: las filas de la réplica a partir de una DDJJ ya parseada. */
export function filasDe(ddjj, archivo) {
  if (!ddjj?.periodo) return []
  return CONCEPTOS_F931.map((c) => [
    // El apóstrofo: USER_ENTERED parsea "2026-06" como FECHA, y el formato TEXT posterior no lo
    // revierte. Los COUNTIFS siguen andando y los SUMIFS devuelven CERO sin dar error. Ya pasó con
    // _ARCA_RAW y costó una tarde encontrarlo.
    `'${ddjj.periodo}`,
    `'${c.codigo}`,
    c.nombre,
    Number(ddjj.conceptos?.[c.clave]) || 0,
    ddjj.empleados ?? '',
    Number(ddjj.remuneracion) || '',
    archivo,
  ]).filter((f) => f[3] > 0)
}

/** NÚCLEO PURO: la fórmula de una celda del cuadro, por período y código de concepto. */
export function celdaF931(periodo, codigo) {
  return `=IFERROR(SUMIFS(${PESTAÑA}!$${COL.monto}$${FILA0}:$${COL.monto};${PESTAÑA}!$${COL.periodo}$${FILA0}:$${COL.periodo};"${periodo}";${PESTAÑA}!$${COL.codigo}$${FILA0}:$${COL.codigo};"${codigo}");0)`
}

/** NÚCLEO PURO: empleados o remuneración del período — un dato de cabecera, no una suma. */
export function celdaCabecera(periodo, col) {
  return `=IFERROR(INDEX(${PESTAÑA}!$${col}$${FILA0}:$${col};MATCH("${periodo}";${PESTAÑA}!$${COL.periodo}$${FILA0}:$${COL.periodo};0));"")`
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // Los PDFs del data room, por nombre. El índice de Drive ya los tiene catalogados.
  const { rows: archivos } = await query(
    `select name, drive_file_id from drive_index
      where name ilike '%931%' and name like $1 and mime_type = 'application/pdf'
      order by name`, [`${AÑO}%`])
  if (!archivos.length) { console.log(`no hay DDJJ F931 de ${AÑO} en el índice de Drive`); return }

  const datos = []
  const fallidos = []
  for (const a of archivos) {
    try {
      // readPdfText ya existe en el cliente y extrae el texto LOCALMENTE (0 costo de API): no se
      // duplica la capacidad, se usa.
      const { text, scanned } = await google.readPdfText(a.drive_file_id, { maxChars: 60000 })
      if (scanned) { fallidos.push(`${a.name} (PDF escaneado, sin texto)`); continue }
      const d = parseF931(text)
      // NO SE INVENTA UNA DECLARACIÓN. Si el PDF no parsea, se dice cuál y se sigue: mejor un mes
      // faltante y visible que un mes completado con un número que nadie leyó de ningún lado.
      if (!d?.periodo) { fallidos.push(a.name); continue }
      datos.push({ ...d, archivo: a.name })
    } catch (e) { fallidos.push(`${a.name} (${String(e?.message ?? e).slice(0, 40)})`) }
  }
  datos.sort((x, y) => x.periodo.localeCompare(y.periodo))
  const filas = datos.flatMap((d) => filasDe(d, d.archivo))
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')

  console.log(`${archivos.length} PDF(s) de ${AÑO} · ${datos.length} declaración(es) leída(s) · ${filas.length} filas`)
  for (const d of datos) console.log(`  ${d.periodo}  total ${Math.round(d.total).toLocaleString('es-AR')}  ·  ${d.empleados} empleados  ·  rem ${Math.round(d.remuneracion).toLocaleString('es-AR')}`)
  if (fallidos.length) console.log(`  ⚠ no pude leer: ${fallidos.join(' · ')}`)
  if (!datos.length) { console.log('  no escribo nada: ninguna declaración se pudo leer'); process.exitCode = 1; return }
  if (DRY) return console.log('--dry: no escribí nada.')

  // ── LA RÉPLICA ────────────────────────────────────────────────────────────────────────────────
  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: filas.length + 40, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = Math.max(filas.length + FILA0 + 20, 60)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }
  await google.clearValues(ID, `${PESTAÑA}!A1:Z${alto}`)
  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!A1`, values: [[`_F931_RAW — las DDJJ F931 leídas de los PDF del data room · corte ${corte}`]] },
    { range: `${PESTAÑA}!A2`, values: [[`${datos.length} declaración(es) de ${AÑO}, leídas directamente del PDF presentado ante ARCA. NO se carga a mano: la reescribe el agente. Existe para que el cuadro "DECLARADO EN LA DDJJ F931" sea una fórmula y no una transcripción — hasta hoy esos números estaban tipeados y ningún script los actualizaba.${fallidos.length ? ` ⚠ ${fallidos.length} archivo(s) que no pude leer: ${fallidos.join(', ')}.` : ''}`]] },
    { range: `${PESTAÑA}!A3:${COL.archivo}3`, values: [COLUMNAS.map(([n]) => n)] },
    { range: `${PESTAÑA}!A${FILA0}`, values: filas },
  ])

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 2 ? 260 : j === 6 ? 200 : E.ANCHO.numero }, fields: 'pixelSize' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ── EL CUADRO, AHORA COMO FÓRMULAS ────────────────────────────────────────────────────────────
  // Los rótulos se conservan EXACTOS: la proyección del bloque 4 busca sus filas por nombre, y
  // cambiar un rótulo la dejaría sin encontrar el concepto y proyectando de menos, en silencio.
  const periodos = datos.map((d) => d.periodo)
  const v = await google.readSheetValues(ID, `${DESTINO}!A1:A20`)
  const filaDe = (txt) => { const i = v.findIndex((f) => String(f?.[0] ?? '').trim().startsWith(txt)); return i < 0 ? null : i + 1 }
  const fCab = filaDe('Concepto')
  if (!fCab) throw new Error(`no encontré el encabezado del bloque 1 en "${DESTINO}"`)

  // ═══ EL SCRIPT ES DUEÑO DEL BLOQUE: ESCRIBE TAMBIÉN LOS RÓTULOS ═══
  //
  // La primera versión leía los rótulos que ya estaban y escribía sólo los números. Eso la hacía
  // depender de un cuadro que nadie mantenía: bastó que un nombre no coincidiera —"Aportes de
  // Seguridad Social" contra "Aportes Seguridad Social (301)"— para que encontrara 1 de 6 conceptos
  // y dejara el bloque a medio escribir. Un script que sólo puede reparar lo que ya está bien no
  // sirve para reparar.
  //
  // LOS RÓTULOS SON CONTRATO: la proyección del bloque 4 busca sus filas por nombre (startsWith).
  // Si cambian, esa proyección deja de encontrar el concepto y proyecta de menos, en silencio.
  const ROTULO = {
    301: 'Aportes Seguridad Social (301)',
    302: 'Aportes Obra Social (302)',
    351: 'Contribuciones Seguridad Social (351)',
    352: 'Contribuciones Obra Social (352)',
    312: 'L.R.T. — ART (312)',
    '028': 'Seguro de Vida Obligatorio (028)',
    360: 'Contribuciones RENATRE (360)',
    935: 'Seguro Sepelio UATRE (935)',
  }
  // Sólo los conceptos que esta empresa declara. Un concepto que nunca apareció en una DDJJ no se
  // agrega en cero: sería una fila que aparenta un dato que no existe.
  const conceptos = CONCEPTOS_F931.filter((c) => datos.some((d) => (Number(d.conceptos?.[c.clave]) || 0) > 0))

  const ultimaCol = String.fromCharCode(66 + periodos.length)
  const r0 = fCab + 1
  const cuadro = [['Concepto', ...periodos, 'Total']]
  conceptos.forEach((c, i) => {
    const f = r0 + i
    cuadro.push([ROTULO[c.codigo] ?? c.nombre, ...periodos.map((p) => celdaF931(p, c.codigo)), `=SUM(B${f}:${String.fromCharCode(65 + periodos.length)}${f})`])
  })
  const rTot = r0 + conceptos.length
  cuadro.push(['TOTAL DECLARADO', ...periodos.map((_, j) => `=SUM(${String.fromCharCode(66 + j)}${r0}:${String.fromCharCode(66 + j)}${rTot - 1})`), `=SUM(${ultimaCol}${r0}:${ultimaCol}${rTot - 1})`])
  cuadro.push(['Empleados en nómina', ...periodos.map((p) => celdaCabecera(p, COL.empleados)), ''])
  cuadro.push(['Remuneración declarada', ...periodos.map((p) => celdaCabecera(p, COL.remuneracion)), ''])
  cuadro.push(['Archivo de origen', ...periodos.map((p) => celdaCabecera(p, COL.archivo)), ''])

  await google.batchUpdateValues(ID, [{ range: `${DESTINO}!A${fCab}`, values: cuadro }])

  // ═══ EL BLOQUE DE SAC, QUE HASTA HOY NO TENÍA DUEÑO ═════════════════════════════════════════
  //
  // Era el único contenido del archivo que NINGÚN script escribía (regla 6: todo se actualiza solo).
  // Y no era inofensivo: su fórmula del devengado referenciaba `$B$13:$M$13` —la fila de
  // "Remuneración declarada"— POR NÚMERO. Desde que este script rehace el bloque 1, basta que
  // aparezca un concepto nuevo en una DDJJ para que esa fila se corra y el SAC empiece a dividir por
  // doce la fila equivocada, sin error y sin aviso.
  //
  // Ahora lo escribe quien sabe dónde quedó cada fila: este mismo script, que acaba de ponerlas.
  const v2 = await google.readSheetValues(ID, `${DESTINO}!A1:A80`)
  const filaSac = v2.findIndex((f) => /^SAC pagado/.test(String(f?.[0] ?? '').trim())) + 1
  // encabezado + conceptos + TOTAL + empleados → recién ahí la remuneración. Se busca por RÓTULO y
  // no se cuenta a mano: contando me dio 12 y la fila es la 13, o sea el SAC habría devengado un
  // doceavo de la CANTIDAD DE EMPLEADOS. Un número plausible y absurdo, sin error a la vista.
  const fRem = v2.findIndex((f) => /^Remuneración declarada/.test(String(f?.[0] ?? '').trim())) + 1
  if (filaSac && fRem) {
    const fCabSac = filaSac - 1
    const colFin = String.fromCharCode(65 + periodos.length)
    const sac = [
      ['SAC pagado (real, de Compras)', ...periodos.map((_, j) => {
        const c = String.fromCharCode(66 + j)
        return `=SUMPRODUCT((LOWER(Compras!$E$4:$E)="sac")*(YEAR(Compras!$C$4:$C)=YEAR(${c}$${fCabSac}))*(MONTH(Compras!$C$4:$C)=MONTH(${c}$${fCabSac}))*IF(ISNUMBER(Compras!$O$4:$O);Compras!$O$4:$O;0))`
      })],
      // UN DOCEAVO DE LA REMUNERACIÓN DEL MES: así se devenga el aguinaldo. La referencia va a la
      // fila que este script acaba de escribir, no a un número fijo.
      ['SAC devengado (1/12 de la remuneración declarada)', ...periodos.map((_, j) => `=IFERROR(${String.fromCharCode(66 + j)}$${fRem}/12;"")`)],
      ['Provisión acumulada (devengado − pagado)', ...periodos.map((_, j) => {
        const c = String.fromCharCode(66 + j)
        return `=SUM($B${filaSac + 1}:${c}${filaSac + 1})-SUM($B${filaSac}:${c}${filaSac})`
      })],
      // VACACIONES: NO SE INVENTA. Provisionarlas necesita la antigüedad de cada legajo —de eso
      // dependen los días que le corresponden a cada uno— y esa información no está en ninguna
      // pestaña de este archivo. Se declara el gap en vez de completar la fila con un número
      // plausible: una provisión inventada es peor que una provisión ausente, porque se usa.
      ['Vacaciones', ...periodos.map(() => ''), ],
    ]
    await google.batchUpdateValues(ID, [
      { range: `${DESTINO}!A${filaSac}:${colFin}${filaSac + 3}`, values: sac },
      { range: `${DESTINO}!${String.fromCharCode(66 + periodos.length + 1)}${filaSac + 3}`, values: [['⚠ falta la antigüedad por legajo: sin eso los días de vacaciones que corresponden a cada uno no se pueden calcular, y no se inventan']] },
    ])
    console.log(`  bloque SAC reescrito (filas ${filaSac}–${filaSac + 3}): el devengado ahora referencia la fila ${fRem}, no un número fijo`)
  }
  console.log(`  bloque 1 de "${DESTINO}" reescrito con fórmulas: ${conceptos.length} conceptos × ${periodos.length} períodos`)

  // VERIFICACIÓN: el total del cuadro tiene que dar lo mismo que la suma de la réplica.
  const leido = await google.readSheetValues(ID, `${DESTINO}!A${rTot}:${String.fromCharCode(66 + periodos.length)}${rTot}`)
  const enSheet = Number(String(leido?.[0]?.[periodos.length + 1] ?? '').replace(/[^\d,-]/g, '').replace(',', '.'))
  const enPdf = datos.reduce((s, d) => s + d.total, 0)
  const dif = Math.abs(enSheet - enPdf)
  console.log(`  total declarado: PDF ${Math.round(enPdf).toLocaleString('es-AR')} · Sheet ${Math.round(enSheet).toLocaleString('es-AR')} · diferencia ${dif.toFixed(2)}`)
  if (dif > 1) { console.log('  ⚠ no coinciden'); process.exitCode = 1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
