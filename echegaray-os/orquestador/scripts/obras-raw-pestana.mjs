#!/usr/bin/env node
// _OBRAS_RAW — EL PLAN DE EGRESOS DE LAS OBRAS ADENTRO DEL SHEET. Hermana de _BANCO_RAW y _CHEQUES_RAW.
//
// POR QUÉ (05/09/2026). El dueño decidió que los números de origen que estaban pegados en la pestaña
// OBRAS pasen a Supabase y que el Sheet los LEA. «Leer» en un Sheet significa una cosa concreta: una
// fórmula que cita una celda. Y para que exista esa celda tiene que existir la réplica — la misma
// regla que ya rige para el banco, ARCA y los cheques:
//
//     Si el insumo no está en el archivo, se trae el INSUMO — no se pega el RESULTADO.
//
// Con esta pestaña, el «Costo proyectado» del cuadro 4 de OBRAS deja de ser un número calculado en
// JavaScript y estampado en la celda, y pasa a ser un SUMIFS sobre la fuente. Un número pegado
// envejece en silencio: se corrige el plan de una obra en el OS y el cuadro sigue mostrando el de
// ayer, sin un solo error a la vista.
//
// SE DECLARA COMO RÉPLICA: la fila 1 dice de qué tabla es y cuándo se sacó. Una réplica que no dice
// cuándo se sacó envejece sin gritar — el defecto que ya rompió el espejo de JORNALES y el IPC en
// este mismo archivo.
//
// LA CARGA VIENE ANTES. Esta pestaña sólo publica lo que ya está en Postgres; quien lo pone ahí es
// `obras-previstos-cargar.mjs`, que lee las celdas del dueño y verifica lo guardado contra lo leído.
//
//   node orquestador/scripts/obras-raw-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { query, closePool } from '../lib/db.mjs'
// EL CONTRATO DE LA RÉPLICA NO SE ESCRIBE DOS VECES. Las letras de columna y el tope del rango los
// usa también la fórmula del cuadro 4 de OBRAS: dos definiciones se desincronizan sin dar error y la
// fórmula se quedaría sumando hasta una fila que ya no es la última.
import { PESTANA_REPLICA, REPLICA_COLUMNAS, REPLICA_COL, REPLICA_DESDE, REPLICA_HASTA } from '../lib/obras-replica.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = PESTANA_REPLICA
const DRY = process.argv.includes('--dry')
const COLUMNAS = REPLICA_COLUMNAS
const COL = REPLICA_COL
const FILA0 = REPLICA_DESDE
const FILA_FIN = REPLICA_HASTA

const fechaISO = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10))

/** Una fila de la tabla → una fila de la réplica. */
export function fila(r) {
  return [
    String(r.obra_clave ?? ''),
    String(r.obra_rotulo ?? ''),
    String(r.tipo ?? ''),
    String(r.concepto ?? ''),
    String(r.familia ?? ''),
    String(r.proveedor ?? ''),
    // La fecha va como TEXTO ISO y no como serial: la mitad de las filas no tiene fecha única sino un
    // reparto en cuotas, y una columna que a veces es fecha y a veces es texto de cuotas no puede ser
    // de especie fecha. El calendario de caja no sale de acá — sale del cuadro 5, que sí las
    // distingue (lib/materiales-previstos.mjs).
    r.fecha_estimada ? fechaISO(r.fecha_estimada) : String(r.fecha_texto ?? ''),
    Number(r.monto) || 0,
    String(r.origen_celda ?? ''),
    fechaISO(r.origen_leido_en),
    String(r.origen_fuente ?? ''),
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { rows } = await query(
    `select obra_clave, obra_rotulo, tipo, concepto, familia, proveedor,
            fecha_estimada::text as fecha_estimada, fecha_texto, monto,
            origen_celda, origen_fuente, origen_leido_en::text as origen_leido_en
       from public.obra_egreso_proyectado
      order by obra_rotulo, (tipo = 'mano_de_obra'), concepto, proveedor`)
  if (!rows.length) {
    console.log('public.obra_egreso_proyectado está vacía — corré obras-previstos-cargar.mjs --aplicar primero. No escribo nada.')
    return
  }
  const datos = rows.map(fila)
  const porObra = new Map()
  for (const r of rows) porObra.set(r.obra_rotulo, (porObra.get(r.obra_rotulo) ?? 0) + Number(r.monto))
  console.log(`fuente: public.obra_egreso_proyectado — ${datos.length} fila(s)`)
  for (const [o, v] of [...porObra.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${o.padEnd(24)} $${Math.round(v).toLocaleString('es-AR')}`)
  }
  if (datos.length > FILA_FIN - FILA0) {
    console.log(`  ⚠ ${datos.length} filas no entran en el rango que citan las fórmulas (hasta la ${FILA_FIN}): hay que subir FILA_FIN y regenerar OBRAS`)
    process.exitCode = 1
    return
  }
  if (DRY) return console.log('--dry: no escribí nada.')

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: FILA_FIN + 20, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = FILA_FIN + 20
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }

  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const gridRaw = [
    [`${PESTAÑA} — plan de egresos por obra · réplica de public.obra_egreso_proyectado del ${corte}`],
    [`${datos.length} filas: los materiales previstos ítem por ítem más la mano de obra con cargas de cada obra. Es el PLAN declarado por el dueño, no el gasto real (eso es Compras). Dato de origen: cada fila dice de qué celda del Sheet salió y cuándo se leyó. NO se carga a mano: entra por scripts/obras-previstos-cargar.mjs, que compara lo guardado contra lo leído campo por campo. Existe para que el «Costo proyectado» de OBRAS sea una FÓRMULA y no un número calculado afuera y pegado.`],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]

  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, gridRaw, { ancho: COLUMNAS.length, tope: FILA_FIN + 20 })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))

  // espejo: true — es la copia de una tabla del OS. No hay nada del dueño que proteger acá: lo que
  // él edita es la celda del cuadro 5 de OBRAS, y de ahí sale la tabla, no al revés.
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
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 3 || j === 10 ? 240 : 130 }, fields: 'pixelSize' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // VERIFICACIÓN: tantas filas escritas como filas de la tabla, y el total tiene que coincidir.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.obra}${FILA0}:${COL.monto}${FILA0 + datos.length - 1}`, { render: 'UNFORMATTED_VALUE' })
  const escritas = v.filter((f) => String(f?.[0] ?? '').trim()).length
  const totalHoja = v.reduce((s, f) => s + (Number(f?.[6]) || 0), 0)
  const totalTabla = rows.reduce((s, r) => s + Number(r.monto), 0)
  console.log(`${PESTAÑA}: ${datos.length} fila(s) · ${escritas} escrita(s) · total hoja $${Math.round(totalHoja).toLocaleString('es-AR')} vs tabla $${Math.round(totalTabla).toLocaleString('es-AR')}`)
  if (escritas !== datos.length || Math.abs(totalHoja - totalTabla) > 0.01) { console.log('  ⚠ no coinciden'); process.exitCode = 1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
