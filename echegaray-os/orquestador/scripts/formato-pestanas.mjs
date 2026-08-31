#!/usr/bin/env node
// HACER QUE LAS CATORCE PESTAÑAS SE VEAN COMO UN SOLO DOCUMENTO.
//
// POR QUÉ (21/07). El dueño: "revisar el formato de todas las pestañas y hacerlas coincidir".
// Medido con readSheetFormats, había cuatro familias tipográficas y tres paletas conviviendo:
// Calibri 12 sobre azul en las que armó él, Arial 16/22/11 sobre verde azulado en las de carga, y
// Calibri 13 SIN barra de color en las nueve que armé yo. Al pasar de una pestaña a otra parecía
// otro documento.
//
// ═══ POR QUÉ ESTA PASADA TOCA POCO, Y A PROPÓSITO ═══
//
// Repintar los fondos de las catorce pestañas destruiría cosas que sí están bien: el ámbar de los
// meses proyectados en Estructura, los formatos condicionales de Compras, los desplegables de
// Cobranzas. Un unificador que rompe lo que funciona no es una mejora.
//
// Así que toca las tres cosas que hacen que un archivo se sienta uno solo, y sólo esas:
//
//   1. LA TIPOGRAFÍA. Roboto para texto, Roboto Mono para todo lo numérico. Es el cambio que más se
//      nota: con dígitos de ancho igual, los millares se alinean solos entre filas y un número fuera
//      de escala se ve sin leerlo. Qué celda es numérica NO se adivina: se lee su formato de número
//      efectivo (CURRENCY, NUMBER, PERCENT, DATE), que es un hecho de la celda.
//   2. LA BARRA DE TÍTULO. La fila 1 de cada pestaña, con el color de mando del archivo.
//   3. LAS FILAS CONGELADAS. Estaban en 0, 1, 2, 3, 4 y 6 según la pestaña. Con el encabezado
//      congelado, una tabla de 400 filas se puede leer; sin él, no.
//
// Los fondos y los bloques los sigue poniendo cada script cuando rehace su pestaña, ahora desde
// lib/estilo-pestana.mjs. Esta pasada es lo que unifica también las que el OS no rehace.
//
//   node orquestador/scripts/formato-pestanas.mjs [--dry] [--auditar]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { FUENTE, FUENTE_NUM, TAM, ALTO, auditar } from '../lib/estilo-pestana.mjs'
import { INK, HAIR, BLANCO } from '../lib/estilo-statement.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const SOLO_AUDITAR = process.argv.includes('--auditar')

/**
 * Las pestañas que se unifican, con cuántas filas congelar.
 *
 * `congeladas` sale de dónde termina el encabezado de CADA pestaña, no de un número parejo: en las
 * de carga el encabezado está en la fila 3 o 4 y congelar 3 cortaría la tabla por la mitad.
 * `hastaFila` acota la pasada: recorrer 1000 filas de una pestaña que usa 90 es gastar cuota.
 */
export const PESTANAS = [
  // RESUMEN se retiró (el dueño la borró el 23/07 y su generador está comentado en flujo-caja-pasos):
  // ya no se lista acá. El formateador la saltaba con "no existe", pero listar una pestaña muerta es la
  // misma trampa que ocultó el 400 del calendario — mejor no dejar el fantasma.
  { titulo: 'Compras', congeladas: 3, hastaFila: 1000, cols: 32, carga: true },
  { titulo: 'Cobranzas', congeladas: 4, hastaFila: 400, cols: 60, carga: true },
  // La formatea su propio agente (cheques-emitidos-tablero.mjs) al estándar minimalista/clase mundial;
  // el formateador general no la toca para no pisarle la piel. Sigue en la lista para que el censo y el
  // auditor de pantalla la miren.
  { titulo: 'Cheques Emitidos', congeladas: 9, hastaFila: 200, cols: 14, carga: true, propio: true },
  // Cabecera propia (cheques-recibidos-tablero.mjs); entra a la lista para que el auditor de pantalla
  // la mire — hasta el 06/08 no estaba y "auditar Cheques Recibidos" devolvía 0 pestañas en silencio.
  { titulo: 'Cheques Recibidos', congeladas: 27, hastaFila: 66, cols: 10, propio: true },
  { titulo: 'Tarjeta de Credito', congeladas: 2, hastaFila: 120, cols: 14, carga: true },
  // Piel de statement PROPIA (jornales-pestana.mjs la escribe entera); el formateador general la
  // saltea para no pisarle el estilo — es la causa que ya se pagó una vez, dos formateadores sobre
  // la misma pestaña y gana el último que corre.
  // cols 13 (era 11) y hastaFila 90 (era 80): entró "Se paga el" y la grilla creció con la glosa.
  //
  // ═══ Y 14 DESDE EL 15/08: LA COLUMNA «Pagado el» NO LA AUDITABA NADIE ═══
  //
  // El generador escribe `ANCHO = 14` desde el 31/07 y esta entrada se quedó en 13, así que la N —la
  // columna donde el dueño marca cuándo salió la plata de verdad— quedó fuera de todo control de
  // pantalla durante dos semanas. No era una franja vacía: ahí arriba había siete seriales de fecha
  // dibujados como importes (`$46.160 · $46.176 · $46.189 · $46.204 · $46.220 · $46.237 · $46.143`,
  // filas 126 a 132), residuo de un layout ocho filas más corto, publicados ARRIBA de su propio
  // encabezado. Un control que no sabe que una columna existe devuelve el mismo verde que uno que la
  // revisó — es la misma falla que dejó OBRAS fuera de la lista durante un mes.
  //
  // El ancho de esta entrada tiene que seguir al `ANCHO` del generador; el test lo ata.
  { titulo: 'Jornales por Quincena', congeladas: 2, hastaFila: 90, cols: 14, propio: true },
  { titulo: 'Cargas Sociales', congeladas: 0, hastaFila: 120, cols: 16 },
  // Piel de statement PROPIA (su generador aplica estilo-statement); el formateador general la saltea.
  // congeladas 12 (era 1) y cols 15 (era 12): la entrada estaba desalineada del generador, que escribe
  // ANCHO=15 (A..O) y —desde el rediseño del 06/08— congela el título, la frescura y el hero entero,
  // para que la posición no se vaya al scrollear el detalle. Con cols:12 el auditor de pantalla ni
  // miraba la columna del total (N) ni la de procedencia (O), o sea que no auditaba justo donde vive
  // el número que se lee. hastaFila 130: la pestaña pasó de 69 filas a ~105.
  { titulo: 'Impuestos y Financieros', congeladas: 12, hastaFila: 130, cols: 15, propio: true },
  { titulo: 'Recurrentes', congeladas: 4, hastaFila: 90, cols: 20 },
  { titulo: 'Estructura', congeladas: 6, hastaFila: 90, cols: 20 },
  // La vieja "Proveedores y Materiales" se partió el 21/07: eran ocho tablas sobre las mismas
  // columnas y ningún ancho podía servirles a todas. Ver lib/partir-pestana.mjs.
  { titulo: 'Proveedores', congeladas: 3, hastaFila: 210, cols: 18 },
  { titulo: 'Materiales', congeladas: 3, hastaFila: 60, cols: 18 },
  // LA COLUMNA C DE CAJA ES, POR DEFINICIÓN, DATO DE ORIGEN: "Saldo en moneda de origen" sale del
  // extracto del banco, del arqueo de caja o de la réplica de la tarjeta. Son los quince números que
  // el censo contaba como violación de la regla — y la regla dice justo lo contrario: el dato de
  // origen SÍ se pega, y se declara. Acá se declara.
  { titulo: 'CAJA', congeladas: 0, hastaFila: 120, cols: 12, origen: [{ col: 'C', que: 'extracto del banco, arqueo de caja o réplica de la tarjeta — cada fila declara el suyo en la columna "Origen del dato"' }] },
  { titulo: 'Cash Flow Semanal', congeladas: 3, hastaFila: 90, cols: 60 },
  { titulo: 'Cash Flow Mensual', congeladas: 3, hastaFila: 90, cols: 20 },
  // LAS DOS QUE FALTABAN (13/08). Nacieron con piel propia y nunca se anotaron acá, así que el censo
  // de números pegados y el auditor de pantalla —que recorren ESTA lista— nunca las miraron. El censo
  // sobre "OBRAS" informaba "0 pegados": no porque no los tuviera, sino porque no la conocía. Un
  // control que no sabe que algo existe devuelve el mismo verde que uno que lo revisó.
  //
  // NO SE LES DECLARA `origen`. OBRAS tiene ~40 números pegados en el detalle (columna C, el costo por
  // ítem que viene de `costos_obra`, y la H con su fecha de pago): son insumos de otro sistema
  // fosilizados dentro de la grilla, y declararlos "dato de origen" sería usar la excepción para
  // apagar el aviso. Que el censo los cuente es exactamente lo que se quiere.
  { titulo: 'OBRAS', congeladas: 2, hastaFila: 98, cols: 9, propio: true },
  { titulo: 'Calendario de Cobros', congeladas: 4, hastaFila: 110, cols: 17, propio: true },
  // LAS DOS QUE FALTABAN (31/08). Mismo defecto que OBRAS y Calendario en agosto: nacieron después
  // de esta lista y nadie las anotó, así que el censo de números pegados y el auditor de pantalla
  // pasaban de largo. El aviso estaba a la vista en cada corrida —«2 pestaña(s) del archivo NO están
  // en PESTANAS ni declaradas en SIN_PANTALLA: Nómina · SUBCONTRATISTAS»— y nadie lo levantó hasta
  // que el dueño dijo que la Nómina no respetaba su regla de diseño. El estándar no se aplicó porque
  // el control no sabía que la pestaña existía.
  //
  // Sin `origen`: las dos son 100% calculadas. Nómina la escribe entera su generador desde el espejo
  // y desde Postgres; SUBCONTRATISTAS es una vista de Compras y lo declara en su propia fila 2.
  { titulo: 'Nómina', congeladas: 3, hastaFila: 175, cols: 15, propio: true },
  { titulo: 'SUBCONTRATISTAS', congeladas: 3, hastaFila: 60, cols: 12, propio: true },
]

/**
 * LAS PESTAÑAS QUE NO SON PANTALLA — y por qué cada una.
 *
 * No alcanza con "no está en PESTANAS": esa es justamente la falla que dejó OBRAS fuera durante un
 * mes. Una pestaña sólo puede quedar fuera del estándar si alguien lo DECLARÓ y dijo el motivo; lo
 * que no está en ninguna de las dos listas es un descuido, y `pestanasSinCobertura` lo nombra.
 */
export const SIN_PANTALLA = Object.freeze({
  '01_Valores Iniciales': 'carga histórica del dueño, anterior al OS',
  'Parámetros': 'parámetros y rangos con nombre: se lee, no se mira',
  'Deuda viva (OS)': 'salida intermedia del OS que consume el cash flow',
  '_RAW': 'toda pestaña con guion bajo adelante es INSUMO (extracto, ARCA, F931, réplicas): existe para que las de pantalla la citen, y su formato no importa',
})

/**
 * NÚCLEO PURO: qué pestañas del archivo no las mira nadie.
 *
 * @param {string[]} titulos los títulos VIVOS del archivo (de `getSheetMeta`)
 * @returns {string[]} las que no están ni en `PESTANAS` ni declaradas en `SIN_PANTALLA`
 */
export function pestanasSinCobertura(titulos = [], pestanas = PESTANAS, excluidas = SIN_PANTALLA) {
  const cubiertas = new Set(pestanas.map((p) => p.titulo))
  return titulos.filter((t) => !cubiertas.has(t) && !Object.hasOwn(excluidas, t) && !String(t).startsWith('_'))
}

/**
 * EL AVISO QUE VA ARRIBA DE TODO EN CADA AUDITOR: qué pestaña no está mirando nadie.
 *
 * Va al principio y no al final a propósito: es la advertencia de que el verde de abajo puede estar
 * contando de menos. Un auditor que recorre una lista incompleta no da un resultado incompleto — da
 * el mismo resultado que si todo estuviera bien.
 */
export function avisarSinCobertura(titulos = []) {
  const fuera = pestanasSinCobertura(titulos)
  if (!fuera.length) return fuera
  console.log(`▲ ${fuera.length} pestaña(s) del archivo NO están en PESTANAS ni declaradas en SIN_PANTALLA, `
    + `así que este control no las mira: ${fuera.join(' · ')}\n`)
  return fuera
}

/** Los formatos de número que delatan una celda NUMÉRICA. Un hecho de la celda, no una suposición. */
const NUMERICO = new Set(['CURRENCY', 'NUMBER', 'PERCENT', 'DATE', 'TIME', 'DATE_TIME', 'SCIENTIFIC'])

/**
 * NÚCLEO PURO: qué fuente le toca a cada celda de una fila, según su formato de número.
 * Devuelve null para las celdas vacías: no vale la pena gastar un request en formatear la nada.
 */
export function fuenteDeFila(fila = []) {
  return fila.map((c) => {
    const tieneAlgo = String(c?.valor ?? '').trim() !== ''
    if (!tieneAlgo) return null
    return NUMERICO.has(c?.formato?.numberFormat?.type) ? FUENTE_NUM : FUENTE
  })
}

/**
 * NÚCLEO PURO: convierte la matriz de fuentes en RECTÁNGULOS, agrupando por COLUMNA.
 *
 * POR QUÉ POR COLUMNA Y NO POR FILA: la primera versión agrupaba celdas contiguas dentro de cada
 * fila y generaba 9.861 requests sólo para Compras — 800 filas × trece tramos cada una. Pero una
 * planilla es tabular: una columna de importes es numérica de arriba a abajo. Agrupando verticalmente,
 * la misma pestaña baja a unas decenas de requests. La forma del dato manda sobre la comodidad del
 * bucle.
 *
 * @param {Array<Array<string|null>>} matriz fuente por celda, null donde no hay nada
 * @returns {Array<{fila:number, filaFin:number, col:number, fuente:string}>}
 */
export function rectangulos(matriz = []) {
  const anchoMax = matriz.reduce((m, f) => Math.max(m, f.length), 0)
  const out = []
  for (let c = 0; c < anchoMax; c++) {
    let i = 0
    while (i < matriz.length) {
      const f = matriz[i]?.[c] ?? null
      if (!f) { i++; continue }
      let j = i
      // Se salta hasta 2 celdas vacías sin cortar la racha: una fila en blanco entre bloques no
      // justifica partir el rango en dos requests.
      let vacias = 0
      while (j + 1 < matriz.length) {
        const sig = matriz[j + 1]?.[c] ?? null
        if (sig === f) { j++; vacias = 0; continue }
        if (sig === null && vacias < 2) { j++; vacias++; continue }
        break
      }
      out.push({ fila: i, filaFin: j - vacias + 1, col: c, fuente: f })
      i = j + 1
    }
  }
  return out
}

/**
 * Hasta qué fila hay algo escrito. Se pregunta a la API en vez de confiar en `hastaFila`, que es un
 * número declarado a mano y ya se quedó corto una vez (el censo informó 34 números pegados cuando
 * eran 79 porque miraba hasta la fila 140 de una pestaña de 200).
 */
async function ultimaConContenido(google, titulo, filas) {
  if (!filas) return 0
  const v = await google.readSheetValues(ID, `${titulo}!A1:A${filas}`).catch(() => null)
  if (!v) return 0
  let ultima = 0
  v.forEach((f, i) => { if (String(f?.[0] ?? '').trim()) ultima = i + 1 })
  return ultima
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  let desviadas = 0, tocadas = 0
  // EL CANDADO (24/07): una pestaña que el dueño tomó no la formatea NADIE — ni la tipografía ni las
  // filas congeladas. Sin esto, este formateador escribía hasta la fila 90 de 'Cash Flow Semanal' y,
  // como el dueño la restauró más corta, se salía de la grilla y tiraba TODA la corrida del pipeline.
  const bloqueadas = await import('../lib/pestana-bloqueada.mjs').then((m) => m.pestanasBloqueadas({}, ID)).catch(() => new Set())

  for (const p of PESTANAS) {
    const hoja = meta.find((h) => h.title === p.titulo)
    if (!hoja) { console.log(`  ${p.titulo.padEnd(26)} no existe`); continue }
    if (bloqueadas.has(p.titulo)) { console.log(`  🔒 ${p.titulo.padEnd(26)} — bajo tu control, no la formateo.`); continue }
    // Las pestañas con formato PROPIO las gobierna su agente, no el formateador general.
    if (p.propio) { console.log(`  ${p.titulo.padEnd(26)} — formato propio (su agente)`); continue }

    const hasta = (meta.find((h) => h.title === p.titulo)?.rows) || p.hastaFila
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${colLetra(p.cols)}${hasta}`).catch((e) => {
      console.log(`  ${p.titulo.padEnd(26)} no pude leerla (${String(e?.message ?? e).slice(0, 50)})`)
      return null
    })
    if (!f) continue

    // ── LA GRILLA NO PUEDE SER DIEZ VECES MÁS GRANDE QUE EL CONTENIDO ──────────────────────────
    //
    // "Cargas Sociales" tenía 1.092 filas de grilla para 78 de contenido: mil filas vacías por las
    // que hay que scrollear, herencia de un script que insertaba filas en cada corrida. Una hoja
    // que sigue bajando después de donde termina la información se lee como si faltara algo.
    //
    // El margen es amplio en las pestañas de CARGA —ahí el dueño agrega filas a mano y quedarse sin
    // lugar es peor que sobrar— y ajustado en las que rehace el OS.
    const ultima = await ultimaConContenido(google, p.titulo, hoja.rows ?? 0)
    const margen = p.carga ? 300 : 40
    if (ultima && (hoja.rows ?? 0) > ultima + margen && !SOLO_AUDITAR) {
      await google.spreadsheetBatchUpdate(ID, [{ deleteDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: ultima + margen, endIndex: hoja.rows } } }])
      console.log(`  ${p.titulo.padEnd(26)} grilla recortada: ${hoja.rows} → ${ultima + margen} filas (contenido hasta la ${ultima})`)
    }

    const a = auditar(f, { congeladas: p.congeladas })
    if (!a.ok) desviadas++
    console.log(`  ${p.titulo.padEnd(26)} ${a.ok ? '✓ en estándar' : '⚠ ' + a.desvios.join(' · ')}`)
    if (SOLO_AUDITAR || a.ok) continue

    const reqs = []
    const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })

    // 1 · LA TIPOGRAFÍA, por rectángulos verticales: una columna numérica es un solo request.
    for (const r of rectangulos(f.filas.map(fuenteDeFila))) {
      reqs.push({
        repeatCell: {
          range: rg(r.fila, r.filaFin, r.col, r.col + 1),
          cell: { userEnteredFormat: { textFormat: { fontFamily: r.fuente } } },
          fields: 'userEnteredFormat.textFormat.fontFamily',
        },
      })
    }

    // ═══ 2 · EL TÍTULO, SIN BARRA (23/07) ═══
    //
    // ACÁ ESTABA LA CAUSA DE FONDO DE "LAS PESTAÑAS NO RESPETAN UN PATRÓN". Cada generador dejaba su
    // pestaña con la piel de statement —sin relleno, la jerarquía por tipografía— y DESPUÉS pasaba
    // este formateador general y le repintaba encima la barra azul del estilo viejo. Dos formateadores
    // sobre la misma pestaña, con dos lenguajes distintos, y ganaba el último en correr. Por eso dos
    // pestañas hermanas (Cargas Sociales y Jornales) se veían de sistemas diferentes.
    //
    // Ahora el título es UNO SOLO en todo el archivo: tinta sobre blanco, y una línea fina abajo. La
    // barra rellena era, además, el mayor "tell" de planilla que quedaba.
    if (String(f.filas?.[0]?.[0]?.valor ?? '').trim()) {
      reqs.push({
        repeatCell: {
          range: rg(0, 1, 0, p.cols),
          cell: { userEnteredFormat: { backgroundColor: BLANCO, textFormat: { fontFamily: FUENTE, fontSize: 15, bold: true, foregroundColor: INK }, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', wrapStrategy: 'OVERFLOW_CELL' } },
          fields: 'userEnteredFormat',
        },
      })
      reqs.push({ updateBorders: { range: rg(0, 1, 0, p.cols), bottom: { style: 'SOLID', width: 1, color: HAIR } } })
      reqs.push({
        updateDimensionProperties: {
          range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: ALTO.titulo }, fields: 'pixelSize',
        },
      })
    }

    // 3 · LAS FILAS CONGELADAS.
    if ((f.congeladas?.filas ?? 0) !== p.congeladas) {
      reqs.push({
        updateSheetProperties: {
          properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: p.congeladas } },
          fields: 'gridProperties.frozenRowCount',
        },
      })
    }

    if (DRY) { console.log(`     (--dry) ${reqs.length} cambios de formato, no escribí nada`); continue }
    // Los requests van en tandas: una pestaña de 800 filas genera miles y la API los rechaza juntos.
    for (let i = 0; i < reqs.length; i += 500) {
      await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 500))
    }
    tocadas++
    console.log(`     ✓ ${reqs.length} cambios aplicados`)
  }

  // VERIFICACIÓN: releer y confirmar. Escribir y no mirar es cómo se instalan los defectos que este
  // script existe para cazar.
  if (!DRY && !SOLO_AUDITAR && tocadas) {
    let quedan = 0
    for (const p of PESTANAS) {
      if (bloqueadas.has(p.titulo)) continue // pestaña del dueño: ni se verifica
      const f = await google.readSheetFormats(ID, `${p.titulo}!A1:D3`).catch(() => null)
      if (f && !auditar(f, { congeladas: p.congeladas }).ok) quedan++
    }
    console.log(`\n${quedan ? `⚠ quedan ${quedan} pestaña(s) fuera de estándar` : `✓ verificado: las ${PESTANAS.length} pestañas comparten el mismo formato`}`)
    if (quedan) process.exitCode = 1
  } else {
    console.log(`\n${desviadas} de ${PESTANAS.length} pestañas fuera del estándar`)
  }
}

function colLetra(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

// SÓLO CORRE SI SE LO INVOCA DIRECTO. Sin esta guarda, `import { PESTANAS }` desde otro script
// ejecutaba el formateador entero como efecto secundario del import — auditar-pantalla.mjs terminó
// reescribiendo las catorce pestañas sin que nadie se lo pidiera.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
