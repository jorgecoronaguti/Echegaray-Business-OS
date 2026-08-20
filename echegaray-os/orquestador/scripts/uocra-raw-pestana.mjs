#!/usr/bin/env node
// _UOCRA_DDJJ_RAW — LAS DDJJ DE UOCRA ADENTRO DEL SHEET. Hermana de _ARCA_RAW, _BANCO_RAW y _CHEQUES_RAW.
//
// ═══ POR QUÉ (18/08/2026) ═══
//
// Misma regla que las otras tres réplicas: **si el insumo no está en el archivo, se trae el INSUMO,
// no se pega el RESULTADO.**
//
// La pestaña "Cargas Sociales" afirmaba al pie que el Fondo de Cese "no lo declara la DDJJ: su
// devengado no se controla contra nada". Es falso. La DDJJ Nominativa de UOCRA lo declara mes a mes,
// y los seis PDF de 2026 están en Drive desde febrero — en la MISMA carpeta que IIBB e IVA, que el
// OS ya leía. UOCRA era la única de las cuatro subcarpetas que no leía nadie.
//
// Con esta réplica el Fondo de Cese pasa a tener sus dos puntas: lo devengado (esta pestaña) contra
// lo pagado (Compras). En la construcción eso no es un detalle contable — bajo la Ley 22.250 no
// existe la indemnización por antigüedad, el costo del despido se paga mes a mes a este fondo, y un
// fondo atrasado es incumplimiento que habilita reclamos.
//
//   node orquestador/scripts/uocra-raw-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { leerUocra } from '../lib/uocra-ddjj.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
// ═══ EL NOMBRE CAMBIÓ PORQUE EL PRIMERO YA ESTABA OCUPADO — Y LO PISÉ (18/08/2026) ═══
//
// Esta réplica nació llamándose `_UOCRA_RAW`. Ese nombre **ya era de otra cosa**: la réplica VIVA de
// la escala salarial de UOCRA, que llega por IMPORTHTML y de la que cuelga todo el cuadro 4.3 de
// "Jornales por Quincena" (`uocra-acuerdos.mjs`: `HOJA = '_UOCRA_RAW'`). La escribí encima y borré
// 391 filas suyas. El síntoma fue inmediato y absurdo —el básico de Ayudante pasó a $12.928.002 la
// hora— porque el `INDEX` del cuadro empezó a leer mis columnas.
//
// No verifiqué si el nombre estaba libre antes de crear una pestaña. `getSheetMeta` estaba a una
// línea de distancia y el propio script ya la llamaba: la usaba para decidir si CREAR la pestaña, no
// para preguntarse de quién era.
export const PESTAÑA = '_UOCRA_DDJJ_RAW'
const DRY = process.argv.includes('--dry')

/** El orden de las columnas es CONTRATO: las fórmulas de "Cargas Sociales" lo referencian por letra. */
export const COLUMNAS = [
  ['Período', 'texto'], ['Boleta', 'texto'], ['Trabajadores', 'entero'],
  ['Remuneraciones', 'monedaExacta'], ['Seguro de Vida', 'monedaExacta'],
  ['FICS', 'monedaExacta'], ['Otros conceptos', 'monedaExacta'],
  ['Total determinado', 'monedaExacta'],
  // LA COLUMNA QUE MOTIVA TODA LA RÉPLICA. Va al final para no correr las demás si mañana se agrega
  // otro concepto: el orden es contrato y meter una columna en el medio le cambia el significado a
  // todas las fórmulas de golpe y en silencio.
  ['Fondo de Cese devengado', 'monedaExacta'],
  ['Archivo', 'texto'],
]
export const COL = {
  periodo: 'A', boleta: 'B', trabajadores: 'C', remuneraciones: 'D', seguroVida: 'E',
  fics: 'F', otros: 'G', totalDeterminado: 'H', fondoCese: 'I', archivo: 'J',
}
export const FILA0 = 4

/** NÚCLEO PURO: una fila de la réplica. Sin red. Un null queda VACÍO, nunca cero. */
export function fila(d) {
  const n = (v) => (v == null ? '' : Number(v))
  return [
    // EL PERÍODO VA CON APÓSTROFO, Y NO ES UN CAPRICHO. Escrito como "2026-01", Google lo interpreta
    // como una FECHA y guarda el serial 46023: la celda deja de decir "2026-01" y cualquier fórmula
    // que cruce por período deja de encontrar nada. No da error — calla. Medido en la primera
    // escritura de esta réplica, 18/08/2026. El apóstrofo lo fuerza a texto y no se ve en la celda.
    d.periodo ? `'${d.periodo}` : '',
    String(d.tipo_boleta ?? ''),
    n(d.trabajadores),
    n(d.remuneraciones),
    n(d.seguro_vida),
    n(d.fics),
    n(d.otros_conceptos),
    n(d.total_determinado),
    n(d.fondo_cese_devengado),
    String(d.archivo ?? ''),
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const ddjj = await leerUocra(google)
  if (!ddjj.length) {
    console.log('no leí ninguna DDJJ de UOCRA — no escribo nada.')
    process.exitCode = 1
    return
  }
  ddjj.sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
  const datos = ddjj.map(fila)
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const ultimo = ddjj[ddjj.length - 1].periodo

  console.log(`fuente: carpeta UOCRA de Drive — ${datos.length} DDJJ · última ${ultimo}`)
  for (const d of ddjj) {
    console.log(`  ${d.periodo}  determinado $${Math.round(d.total_determinado ?? 0).toLocaleString('es-AR').padStart(12)}` +
      `  ·  Fondo de Cese devengado $${Math.round(d.fondo_cese_devengado ?? 0).toLocaleString('es-AR')}`)
  }
  if (DRY) return console.log('--dry: no escribí nada.')

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: datos.length + 40, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = Math.max(datos.length + FILA0 + 20, 40)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }

  const gridRaw = [
    [`${PESTAÑA} — DDJJ Nominativa de UOCRA · hasta ${ultimo} · réplica del ${corte}`],
    ['Réplica de los PDF de la carpeta UOCRA de Drive (comprobantes de presentación). NO se carga a mano. Existe porque el Fondo de Cese Laboral SÍ se declara —renglón "Total Aportes Devengados al Fondo de Cese Laboral"— y hasta hoy la pestaña de Cargas Sociales afirmaba lo contrario, dejando el devengado sin nada contra qué controlarse. "Total determinado" es lo que se paga al mes siguiente; el Fondo de Cese va aparte y por eso tiene su propia columna. Una celda VACÍA es "no pude leerlo", nunca "cero".'],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]

  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, gridRaw, { ancho: COLUMNAS.length, tope: 400 })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))

  // espejo: true — es la copia de una fuente externa (los PDF del sindicato). No hay nada del dueño
  // que proteger acá.
  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, cola.filas, {
    respetar: false, espejo: true, anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length),
  })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

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
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 9 ? 190 : j === 8 ? 200 : 130 }, fields: 'pixelSize' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // VERIFICACIÓN: se RELEE de la pestaña. Tantas filas como DDJJ, ninguna en error, y el Fondo de
  // Cese leído como NÚMERO — una fecha o un importe que quedan como texto no dan error, callan.
  // SIN FORMATO. Leerla formateada devuelve "$721.871,71" y `Number()` de eso es NaN: la primera
  // versión de esta verificación gritó "0 con Fondo de Cese numérico" sobre seis celdas que eran
  // números perfectos. Una verificación que lee distinto de como escribe no verifica: adivina.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.periodo}${FILA0}:${COL.fondoCese}${FILA0 + datos.length}`, { render: 'UNFORMATTED_VALUE' })
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  const errores = v.flat().filter((c) => /#(ERROR|REF|N\/A|VALUE|NAME)/i.test(String(c ?? ''))).length
  const fclNumericos = v.filter((f) => typeof f?.[8] === 'number').length
  // El período tiene que seguir siendo TEXTO. Si vuelve como número, Google lo convirtió en fecha y
  // la réplica quedó inservible para cruzar por período aunque no muestre un solo error.
  const periodosTexto = v.filter((f) => typeof f?.[0] === 'string' && /^\d{4}-\d{2}$/.test(f[0])).length
  console.log(`${PESTAÑA}: ${datos.length} DDJJ · ${escritas} escritas · ${errores} en error · ` +
    `${fclNumericos} con Fondo de Cese numérico · ${periodosTexto} con período en texto`)
  if (escritas !== datos.length || errores || fclNumericos !== datos.length || periodosTexto !== datos.length) {
    console.log('  ⚠ NO COINCIDEN — la réplica no quedó bien escrita')
    process.exitCode = 1
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
