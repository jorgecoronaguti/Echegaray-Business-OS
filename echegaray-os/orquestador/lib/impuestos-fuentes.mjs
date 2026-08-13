// LAS FUENTES DE "IMPUESTOS Y FINANCIEROS" — de dónde sale cada insumo, y la réplica de IIBB.
//
// Estaba todo adentro del generador, que llegó a 1.253 líneas. Lo que lee el mundo exterior (Drive,
// Postgres, otras pestañas) se separa de lo que arma la grilla: acá no se decide una sola fórmula, y
// en `impuestos-bloques.mjs` no se toca una sola API.

import * as E from './estilo-pestana.mjs'
import { query } from './db.mjs'
import { parsearDDJJ, alicuotaDeclarada } from './iibb-ddjj.mjs'
import { parsearDJIVA } from './iva-ddjj.mjs'
import { parseMonto } from './cash-briefing.mjs'
import { escribirPreservando } from './preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from './cola-de-rango.mjs'
import { clasificar, mes as mesDe, COLUMNAS } from './retenciones-sufridas.mjs'

// ═══ LA RÉPLICA DE LAS DDJJ DE IIBB ═══
//
// POR QUÉ EXISTE (27/07). El censo daba 34 números pegados en la pestaña y la mitad eran los datos de
// la DDJJ de Ingresos Brutos —base imponible, alícuota, retenciones, saldo a favor— leídos del PDF de
// Rentas y PEGADOS como valor. Se veían bien y no se actualizaban solos. Si el insumo no está en el
// Sheet, se trae el INSUMO —una réplica que declara su corte y su fuente— y el cuadro se escribe
// entero con fórmulas que la referencian.
export const IIBB_RAW = '_IIBB_RAW'
/** Las columnas de la réplica. El orden es contrato: las fórmulas del bloque de IIBB lo referencian. */
export const IIBB_COLS = [
  ['Período', 'texto'],
  ['Base imponible', 'moneda'],
  ['Alícuota', 'porcentaje'],
  ['Impuesto determinado', 'moneda'],
  ['Retenciones y percep.', 'moneda'],
  ['Saldo a favor anterior', 'moneda'],
  ['Fecha present.', 'texto'],
  ['N° control', 'texto'],
  ['Leído de', 'texto'],
]
/** Dónde vive cada columna de _IIBB_RAW, para no buscarla por posición a ojo. */
export const IIBB_COL = { periodo: 'A', base: 'B', alicuota: 'C', impuesto: 'D', retenciones: 'E', saldoAnt: 'F' }
export const IIBB_FILA0 = 4 // título, nota, encabezados, datos

export const ARCA_RAW = '_ARCA_RAW'
export const ARCA_FILA0 = 4
export const BANCO_RAW = '_BANCO_RAW'

// Las DDJJ de IIBB de San Juan viven en una CARPETA de Drive. Se LISTA y se leen los PDF originales:
// son la fuente primaria (traen N° de control y fecha de presentación) y, al listar en vez de
// hardcodear IDs, el mes nuevo aparece solo cuando se sube.
export const CARPETA_IIBB = '1R0kTgCE35Q6AlLhjr0VB2ZAtusK1eO1W'
/** Las DDJJ de IVA (F.2051) presentadas ante ARCA, misma mecánica (MM-2026.pdf). */
export const CARPETA_IVA = '1tLLahzfaTKZPbOi8M6IJLbAunFgappXx'

/** Lista los PDF `MM-YYYY.pdf` de una carpeta, ordenados. Un fallo NO se degrada a cero: se avisa. */
async function pdfsDelPeriodo(google, carpeta, que) {
  const archivos = await google.listFolder(carpeta)
    .catch((e) => { console.error(`  ⚠ no pude listar la carpeta de ${que}: ${e.message}`); return [] })
  return archivos.filter((f) => /^\d{2}-\d{4}\.pdf$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))
}

/** Lee las DDJJ de IIBB desde los PDF originales de Drive. */
export async function leerIIBB(google) {
  const out = []
  for (const f of await pdfsDelPeriodo(google, CARPETA_IIBB, 'IIBB')) {
    const periodo = `${f.name.slice(3, 7)}-${f.name.slice(0, 2)}`
    try {
      const pdf = await google.readPdfText(f.id, { maxChars: 8000 })
      const d = parsearDDJJ(pdf?.text ?? '')
      // La alícuota de ESTE mes, ponderada por su base — no el promedio del año. Es lo que deja que
      // _IIBB_RAW la guarde mes a mes y que Rentas la cambie sin romper el cuadro.
      out.push({ ...d, periodo: d.periodo ?? periodo, alicuota: alicuotaDeclarada([d]).alicuota, fuente: f.name })
    } catch (e) {
      // Un PDF que no se puede leer NO se rellena con ceros: se omite y se avisa.
      console.error(`  ⚠ no pude leer la DDJJ de ${periodo}: ${e.message}`)
    }
  }
  return out
}

/** Lee las DDJJ de IVA (F.2051) desde los PDF originales de Drive. Mismo patrón que leerIIBB. */
export async function leerIVA(google) {
  const out = []
  for (const f of await pdfsDelPeriodo(google, CARPETA_IVA, 'IVA')) {
    const periodo = `${f.name.slice(3, 7)}-${f.name.slice(0, 2)}`
    try {
      const pdf = await google.readPdfText(f.id, { maxChars: 8000 })
      const d = parsearDJIVA(pdf?.text ?? '')
      out.push({ ...d, periodo: d.periodo ?? periodo, fuente: f.name })
    } catch (e) {
      console.error(`  ⚠ no pude leer la DDJJ de IVA de ${periodo}: ${e.message}`)
    }
  }
  return out
}

/**
 * LAS RETENCIONES QUE LE HACEN A LA EMPRESA, desde Cobranzas.
 *
 * El dueño (21/07): "hay retenciones que considerar, revisión absoluta". Cobranzas las registra en
 * tres columnas y esta pestaña no las miraba: $7.388.784 de impuesto YA PAGADO sin figurar en ningún
 * lado. La alícuota de cada una se VERIFICA contra su régimen (`retenciones-sufridas`), porque los
 * rótulos de dos de esas columnas estaban marcados como reconstruidos y una retención imputada al
 * impuesto equivocado es un crédito fiscal que no existe.
 *
 * Se imputan por FECHA DE COBRO (columna Q), que es cuando se practica — no por la de la factura.
 * RANGO ABIERTO: cerrado en la fila 400 se caía la 401 sin un solo error, y Cobranzas ya tiene 357.
 */
export async function leerRetenciones(google, fileId) {
  const v = await google.readSheetValues(fileId, 'Cobranzas!A5:AJ').catch(() => [])
  const cobros = v.map((f, i) => ({
    fila: i + 5,
    cliente: String(f?.[6] ?? '').trim(),
    mes: mesDe(f?.[16]),
    neto: parseMonto(f?.[9]),
    iva: parseMonto(f?.[10]),
    retenciones: {
      iva: parseMonto(f?.[COLUMNAS.iva]),
      ganancias: parseMonto(f?.[COLUMNAS.ganancias]),
      iibb: parseMonto(f?.[COLUMNAS.iibb]),
    },
  })).filter((c) => c.retenciones.iva || c.retenciones.ganancias || c.retenciones.iibb)
  return clasificar(cobros)
}

/** Las ventas ya facturadas o proyectadas por mes. Alimenta SÓLO el bloque de CONTROL, no la escritura. */
export async function ventasProyectadas(google, fileId) {
  // Cobranzas: monto NETO (columna J) por mes de emisión (columna C). RANGO ABIERTO: el tope en la
  // fila 200 dejaba afuera 157 filas de datos, y esta lectura alimenta un control — un control ciego
  // a la mitad de su fuente no controla nada.
  const v = await google.readSheetValues(fileId, 'Cobranzas!C5:J')
  const out = {}
  for (const f of v) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(f?.[0] ?? '').trim())
    if (!m) continue
    const per = `${m[3]}-${String(m[2]).padStart(2, '0')}`
    const neto = parseFloat(String(f?.[7] ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
    out[per] = (out[per] ?? 0) + neto
  }
  return out
}

/**
 * Los planes de pago F931.
 *
 * ═══ UNA FUENTE, Y LA OTRA COMO CONTROL (06/08) — el defecto J ═══
 *
 * La lista de planes salía de Postgres y los importes del Sheet: dos fuentes para una misma cosa. Un
 * plan cargado en el Sheet y ausente de la base no generaba fila; uno en la base sin filas en el
 * Sheet generaba una fila de doce ceros. Ahora la ÚNICA fuente de la que sale plata es Compras (las
 * SUMIFS del cuadro), y Postgres se consulta para CONTROLAR que las dos digan lo mismo: la
 * divergencia se informa, no se promedia ni se elige en silencio.
 */
export async function planesDePago(anio) {
  const r = await query(`
    select concepto, total, fecha_pago
      from public.costos_obra
     where origen = 'compras_sheet'
       and concepto ~* 'deuda previcional|deuda previsional|plan f931'
     order by fecha_pago`)
  const planes = new Map()
  for (const x of r.rows) {
    const c = String(x.concepto ?? '')
    // nombre = cómo se muestra; patron = el fragmento que la SUMIFS usa para sumar las cuotas desde
    // el Sheet (no se pega el importe, se referencia Compras); campo = EN QUÉ columna de Compras vive
    // ese fragmento — verificado leyendo las 15 filas reales: el W303094 por "Concepto", los dos de
    // deuda previsional por "Detalles / Obra". Buscar en la columna equivocada daría cero, o sea una
    // cuota que se paga y el cuadro declararía inexistente.
    const [nombre, patron, campo] = /w303094/i.test(c) ? ['Plan F931 W303094 (financiación junio)', 'W303094', 'concepto']
      : /dic\s*25/i.test(c) ? ['Deuda previsional F931 Diciembre 2025', '931 Dic 25', 'detalle']
        : /enero\s*26/i.test(c) ? ['Deuda previsional F931 Enero 2026', '931 Enero 26', 'detalle']
          : ['Otro plan', null, null]
    const p = planes.get(nombre) ?? { nombre, patron, campo, cuotas: 0, total: 0, primera: null, ultima: null, monto_cuota: 0 }
    p.cuotas++
    p.total += Number(x.total) || 0
    const f = x.fecha_pago ? new Date(x.fecha_pago).toISOString().slice(0, 10) : null
    if (f && (!p.primera || f < p.primera)) p.primera = f
    if (f && (!p.ultima || f > p.ultima)) p.ultima = f
    p.monto_cuota = Math.round(p.total / p.cuotas)
    if (f && Number(f.slice(0, 4)) === anio) {
      const mm = Number(f.slice(5, 7))
      p.porMes = p.porMes ?? Array(13).fill(0)
      p.porMes[mm] += Number(x.total) || 0
    }
    planes.set(nombre, p)
  }
  return [...planes.values()].map((p) => ({ ...p, porMes: p.porMes ?? Array(13).fill(0) })).sort((a, b) => b.total - a.total)
}

/**
 * Escribe la réplica _IIBB_RAW: las DDJJ de Ingresos Brutos leídas del PDF, adentro del Sheet, con su
 * corte y su fuente declarados. Es una COPIA de lo que dice el PDF de Rentas al momento del corte —no
 * "el dato"—, por eso la fila 1 dice cuándo se sacó y de qué carpeta. Mismo patrón que _ARCA_RAW.
 */
export async function escribirIIBBRaw(google, fileId, iibb) {
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const datos = [...iibb]
    .filter((d) => d.periodo)
    .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
    .map((d) => [
      // Apóstrofo: sin él USER_ENTERED parsea "2026-06" como fecha y los MATCH del cuadro fallan en
      // silencio (el mismo bug que _ARCA_RAW documenta en su columna Período).
      `'${d.periodo}`,
      Number(d.base_total) || 0,
      Number(d.alicuota) || 0,
      Number(d.impuesto_determinado) || 0,
      Number(d.retenciones) || 0,
      Number(d.saldo_favor_anterior) || 0,
      d.fecha_presentacion ? `'${d.fecha_presentacion}` : '',
      d.nro_control ? `'${d.nro_control}` : '',
      String(d.fuente ?? ''),
    ])

  let meta = await google.getSheetMeta(fileId)
  let hoja = meta.find((h) => h.title === IIBB_RAW)
  const filasNecesarias = Math.max(datos.length + IIBB_FILA0 + 20, 40)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(fileId, [{
      addSheet: { properties: { title: IIBB_RAW, gridProperties: { rowCount: filasNecesarias, columnCount: IIBB_COLS.length + 1, frozenRowCount: 3 } } },
    }])
    meta = await google.getSheetMeta(fileId)
    hoja = meta.find((h) => h.title === IIBB_RAW)
    console.log(`  pestaña ${IIBB_RAW} creada`)
  } else if ((hoja.rows ?? 0) < filasNecesarias) {
    await google.spreadsheetBatchUpdate(fileId, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: filasNecesarias } }, fields: 'gridProperties.rowCount' },
    }])
  }

  const gridRaw = [
    [`${IIBB_RAW} — réplica de las DDJJ de Ingresos Brutos de la DGR San Juan · corte ${corte}`],
    [`${datos.length} DDJJ. NO se carga a mano: el agente la reescribe en cada corrida leyendo los PDF originales de Rentas (carpeta de Drive). Existe para que el cuadro de IIBB de "Impuestos y Financieros" sea una fórmula sobre datos que están en el archivo, y no un número calculado afuera y pegado. La alícuota es la que la empresa declara (base ponderada), no la de la ley. La columna "Fecha present." es además la ÚNICA evidencia que el OS tiene del vencimiento de IIBB: la DGR no publica una tabla que se pueda leer, así que el calendario la usa como supuesto declarado.`],
    IIBB_COLS.map(([n]) => n),
    ...datos,
  ]
  // LA COLA DE UNA CORRIDA ANTERIOR (13/08): si un PDF de Rentas deja de leerse, su DDJJ vieja
  // sobrevive en la pestaña y el cuadro de IIBB sigue sumando un período sin respaldo.
  const cola = await conColaMedidaLeida(google, fileId, IIBB_RAW, gridRaw, { ancho: IIBB_COLS.length, tope: filasNecesarias })
  if (avisoDeCola(cola, IIBB_RAW)) console.log(avisoDeCola(cola, IIBB_RAW))
  // Espejo de una fuente externa (Rentas): copia byte a byte, sin candado ni Regla 0 —no hay nada del
  // dueño que proteger y "respetar" congelaría un campo si la DDJJ cambiara.
  await escribirPreservando(google, fileId, IIBB_RAW, cola.filas, { respetar: false, espejo: true, anchoHoja: Math.max(IIBB_COLS.length, hoja.cols ?? IIBB_COLS.length) })

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, filasNecesarias, IIBB_COLS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, IIBB_COLS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, IIBB_COLS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, IIBB_COLS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  IIBB_COLS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(IIBB_FILA0 - 1, filasNecesarias, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    const ancho = unidad === 'moneda' ? E.ANCHO.numero : unidad === 'porcentaje' ? E.ANCHO.fecha : j === 0 ? E.ANCHO.fecha : E.ANCHO.texto
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ancho }, fields: 'pixelSize' } })
  })
  for (let i = 0; i < reqs.length; i += 300) await google.spreadsheetBatchUpdate(fileId, reqs.slice(i, i + 300))
  console.log(`  ${IIBB_RAW}: ${datos.length} DDJJ escritas`)
}
