#!/usr/bin/env node
// Rehace la pestaña Estructura: un cuadro, sin detalle, con la proyección ADENTRO.
//
// "La proyección de gastos de estructura la quiero en el mismo cuadro, no así como en la captura" —
// la versión anterior tenía la proyección apilada en una columna al final, separada de los meses.
// Ahora cada mes de agosto a diciembre muestra su proyección en la misma fila y la misma columna
// donde estaría el real, con fondo distinto para que no se confunda jamás un estimado con un hecho.
//
// TAMBIÉN SACA UNA DUPLICACIÓN. La pestaña tenía su PROPIO clasificador: repetía a mano toda la
// lógica de "esto no es nómina, no es gremial, no es recurrente, es unidad de negocio Estructura".
// Esa regla ya vive en la columna "Rubro de caja" de Compras. Acá ahora sólo se sub-clasifica lo
// que Compras ya marcó como Estructura — una definición, no dos que se pueden desincronizar.
//
// LA REGLA DE PROYECCIÓN, y por qué es ésa. Sólo se proyecta un rubro que apareció en 4 meses o
// más. Sin ese filtro, la compra de una moto ($4.352.000, una vez en enero) se proyectaba todos los
// meses y la estructura del año daba $120,8M contra $33M reales. Un gasto que pasó una vez no es
// una tendencia. El monto proyectado es el promedio de los meses en que SÍ hubo gasto, ajustado por
// la inflación de Parámetros (REM del BCRA, que el OS actualiza solo).
//
//   node orquestador/scripts/estructura-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { SUBRUBROS, OTROS } from '../lib/sub-rubro-estructura.mjs'
import { escribirPreservando, limpiarCentinela, VACIO } from '../lib/preservar-anotaciones.mjs'
import { fila as filaConNombre, aRangoApi, verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL, MONEDA_CONTROL, CONTADOR, PORCENTAJE } from '../lib/formato-statement.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Estructura'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const MIN_MESES = 4 // menos que esto no es una tendencia, es un gasto suelto

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// Los sub-rubros viven en la lib: el auditor de reglas de oro necesita la lista para verificar que
// ninguna fórmula use un sub-rubro que la definición única no conoce, y no puede importar un script.


// Columnas. Visible: A + 12 meses + 4 de totales. Auxiliar (oculta): el real de cada mes, que es de
// donde sale la proyección — sin separarlo, la fórmula de un mes se leería a sí misma (#REF!).
const C_MES0 = 1, C_TOTREAL = 13, C_PROY = 14, C_TOTAL = 15, C_PCT = 16
const C_AUX0 = 18            // S..AD: el real de los 12 meses
const C_NMESES = 30          // AE: en cuántos meses hubo gasto
const ANCHO = 32

const FILA_CAB = 6
// El sub-rubro vive en COMPRAS (columna AF), no acá. SUMIFS devuelve #VALUE! cuando el rango a
// sumar está en una pestaña y los criterios en otra — ya me pasó dos veces en esta planilla. Con
// todos los rangos en Compras funciona, y encima es la misma disciplina que el rubro y la familia:
// una sola columna que define el dato, en el lugar donde vive el dato.
const rangoSub = 'Compras!$AF$4:$AF'
const rangoFecha = 'Compras!$AD$4:$AD'
const COL_SUB_COMPRAS = 31   // AF

export function grilla() {
  const rubros = [...SUBRUBROS.map(([n]) => n), OTROS]
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  // ═══ CADA CELDA NACE MÍA Y VACÍA (04/08) ═══
  //
  // Antes era `Array(ANCHO).fill('')`, y la fusión lee la cadena vacía como "no es mi celda,
  // preservala". Cuando este layout creció —se agregaron el subtítulo, dos filas en blanco y el
  // título de sección— el encabezado y las tres primeras filas de datos de la versión ANTERIOR se
  // quedaron clavados en las filas 2 a 5: los doce primeros-de-mes en crudo pintados como moneda
  // ("$46.023"), y fórmulas de "% del total" dividiendo por $P$11, que en el layout de hoy es
  // "Honorarios y servicios". Dos encabezados, un cuadro duplicado, y ni un solo #ERROR que lo
  // delatara. El centinela declara el vacío; el clearValues, que sería la otra salida, ya borró el
  // trabajo del dueño seis veces.
  const vacia = () => Array(ANCHO).fill(VACIO)

  const t = vacia(); t[0] = 'Gastos de estructura'; push(t)
  const s = vacia()
  // UNA LÍNEA. El párrafo anterior se envolvía sobre la columna de enero y quedaba cortado; lo que
  // explicaba —qué es proyección— lo dice ahora la itálica del propio cuadro.
  s[0] = `Rubro "Estructura" de Compras. Desde agosto, proyección (itálica): sólo lo que apareció en ${MIN_MESES} meses o más.`
  push(s)
  push(vacia()); push(vacia())
  // EL TÍTULO DE SECCIÓN VA JUSTO ARRIBA DE SU ENCABEZADO. Aprovecha una de las filas en blanco que
  // ya había, así que no corre ninguna fila: las fórmulas de abajo referencian filas absolutas y un
  // desplazamiento las dejaría apuntando a otra cosa, en silencio.
  const s1 = vacia(); s1[0] = '1 · EL GASTO DE ESTRUCTURA, MES A MES'; push(s1)

  const cab = vacia()
  cab[0] = 'Rubro'
  for (let m = 0; m < 12; m++) cab[C_MES0 + m] = `1/${m + 1}/${AÑO}`
  cab[C_TOTREAL] = 'Total real'
  cab[C_PROY] = 'Proyectado'
  cab[C_TOTAL] = `Total ${AÑO}`
  cab[C_PCT] = '% del total'
  cab[C_AUX0] = 'AUXILIAR — el real de cada mes. De acá sale la proyección. No borrar ni mostrar.'
  push(cab)

  const f0 = filas.length + 1
  for (const r of rubros) {
    const f = filas.length + 1
    const fila = vacia()
    fila[0] = r
    for (let m = 0; m < 12; m++) {
      const cm = letra(C_MES0 + m), ca = letra(C_AUX0 + m)
      // El real del mes, contra Compras.
      fila[C_AUX0 + m] = `=SUMIFS(Compras!$O$4:$O;${rangoSub};$A${f};${rangoFecha};">="&${cm}$${FILA_CAB};${rangoFecha};"<"&EOMONTH(${cm}$${FILA_CAB};0)+1)`
      // Lo que se ve: el real si lo hay; si no, la proyección (o nada si el rubro no es recurrente).
      fila[C_MES0 + m] = `=IF(${ca}${f}<>0;${ca}${f};IF($${letra(C_NMESES)}${f}<${MIN_MESES};0;$${letra(C_TOTREAL)}${f}/$${letra(C_NMESES)}${f}*IFERROR(INDEX(Parámetros!$C$74:$C$90;MATCH(EOMONTH(${cm}$${FILA_CAB};0);ARRAYFORMULA(EOMONTH(Parámetros!$A$74:$A$90;0));0));1)))`
    }
    fila[C_NMESES] = `=COUNTIF($${letra(C_AUX0)}${f}:$${letra(C_AUX0 + 11)}${f};"<>0")`
    fila[C_TOTREAL] = `=SUM($${letra(C_AUX0)}${f}:$${letra(C_AUX0 + 11)}${f})`
    fila[C_TOTAL] = `=SUM($${letra(C_MES0)}${f}:$${letra(C_MES0 + 11)}${f})`
    fila[C_PROY] = `=$${letra(C_TOTAL)}${f}-$${letra(C_TOTREAL)}${f}`
    fila[C_PCT] = `=IFERROR($${letra(C_TOTAL)}${f}/$${letra(C_TOTAL)}$TOT;0)`
    push(fila)
  }
  const f1 = filas.length
  const tot = vacia()
  tot[0] = ROTULO_TOTAL
  for (const c of [...Array(12).keys()].map((m) => C_MES0 + m).concat([C_TOTREAL, C_PROY, C_TOTAL])) {
    tot[c] = `=SUM(${letra(c)}${f0}:${letra(c)}${f1})`
  }
  const fTot = push(tot)

  push(vacia())
  const c1 = vacia()
  c1[0] = '2 · CONTROL — QUE ESTE CUADRO SEA EXACTAMENTE EL RUBRO ESTRUCTURA DE COMPRAS'
  push(c1)
  // ═══ NI UNA COLUMNA DE PROSA (04/08) ═══
  //
  // La columna D llevaba una oración por fila de control ("Es la misma línea del Cash Flow Mensual.",
  // "Distinto de cero = hay gastos…", "Un gasto que pasó una o dos veces no es una tendencia…"). El
  // dueño las borra a mano y volvían en cada corrida — con el worker cada 2 horas, todos los días.
  // Si un número necesita un párrafo al lado, el número está mal elegido: lo que decía la oración
  // pasa al RÓTULO, que es una celda que ya existía y que nadie borra.
  const c2 = vacia(); c2[0] = 'Estructura según Compras (la misma línea del Cash Flow Mensual)'
  c2[1] = '=SUMIF(Compras!$AC$4:$AC;"Estructura";Compras!$O$4:$O)'
  const fc = push(c2)
  const c3 = vacia(); c3[0] = '⇒ Diferencia — gastos de estructura que el cuadro no mira (debe ser $0)'
  // ROUND A PESO: sin esto, una diferencia de fracciones de centavo se dibuja "-$0" y enciende el
  // rojo del control con los datos perfectos. Un control que grita por nada se deja de mirar.
  c3[1] = `=ROUND($B${fc}-$${letra(C_TOTREAL)}${fTot};0)`
  push(c3)
  const c4 = vacia(); c4[0] = `Rubros no proyectados — pasaron menos de ${MIN_MESES} meses, no son tendencia`
  c4[1] = `=COUNTIFS($${letra(C_NMESES)}${f0}:$${letra(C_NMESES)}${f1};"<${MIN_MESES}";$${letra(C_TOTREAL)}${f0}:$${letra(C_TOTREAL)}${f1};">0")`
  push(c4)

  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string' ? c.replaceAll('$TOT', String(fTot)) : c)))
  return { filas: resuelto, f0, f1, fTot, fCtrl: fc, rubros }
}

/** El rótulo de la fila de totales. Es el ancla del rango con nombre: si cambia, cambian los dos. */
export const ROTULO_TOTAL = 'TOTAL ESTRUCTURA'

/**
 * NÚCLEO PURO: los rangos con nombre de esta pestaña, anclados a la fila de totales.
 *
 * ═══ POR QUÉ APARECE ACÁ RECIÉN AHORA (03/08) ═══
 *
 * `ESTRUCTURA_TOTAL_MESES` existía en el archivo real apuntando a la FILA 3 de esta pestaña, que hoy
 * es una de las dos filas en blanco entre el subtítulo y el primer título de sección: cero celdas con
 * dato. Y este generador no publicaba NINGÚN rango con nombre — o sea que el nombre venía de un
 * layout anterior (cuando el cuadro arrancaba arriba de todo, sin subtítulo ni títulos de sección) y
 * nadie lo volvió a mover nunca. Anclado a la posición, otra vez.
 *
 * SE REAPUNTA, NO SE BORRA — al revés que `OFICINA_EFECTIVO`. La diferencia es que acá el bloque que
 * el nombre describe EXISTE: los doce totales por mes de la fila TOTAL ESTRUCTURA, que es la línea
 * "Gastos de estructura" del cash flow mes a mes. Un nombre con destino se arregla apuntándolo; uno
 * sin destino se retira.
 *
 * INFERENCIA declarada: que `ESTRUCTURA_TOTAL_MESES` quería decir "los totales por mes" sale del
 * nombre y de su forma (una fila, no una columna). Ninguna fórmula del OS lo usa hoy, así que no hay
 * un consumidor que lo confirme. Si el dueño lo tenía apuntando a otra cosa, esto lo cambia.
 *
 * @param {ReturnType<typeof grilla>} g
 */
export function rangosDeEstructura(g) {
  return [
    filaConNombre('ESTRUCTURA_TOTAL_MESES', { fila: g.fTot, c0: C_MES0, c1: C_MES0 + 11, rotulo: ROTULO_TOTAL }),
  ]
}

async function publicarRangos(google, sheetId, g) {
  const quiero = rangosDeEstructura(g)
  // No se publica un rango ciego: se verifica contra la grilla recién armada, sin red.
  const problemas = verificarRangos(g.filas, quiero)
  if (problemas.length) {
    console.error('✗ NO publico los rangos con nombre: hay rangos ciegos\n' + explicarProblemas(problemas))
    process.exitCode = 1
    return
  }
  const existentes = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.namedRangeId]))
  const reqs = quiero.map((d) => {
    const range = aRangoApi(sheetId, d)
    return existentes.has(d.nombre)
      ? { updateNamedRange: { namedRange: { namedRangeId: existentes.get(d.nombre), name: d.nombre, range }, fields: 'range' } }
      : { addNamedRange: { namedRange: { name: d.nombre, range } } }
  })
  await google.spreadsheetBatchUpdate(ID, reqs)
  console.log(`rangos con nombre publicados: ${quiero.map((d) => d.nombre).join(', ')} — sobre la fila ${g.fTot} (${ROTULO_TOTAL})`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const g = grilla()
  console.log(`${PESTAÑA}: ${g.filas.length} filas x ${ANCHO} columnas · rubros ${g.f0}-${g.f1} · total ${g.fTot}`)
  if (DRY) {
    console.log('Ejemplo de celda visible (enero, primer rubro):')
    console.log('  ', g.filas[g.f0 - 1][C_MES0])
    return
  }

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  const compras = meta.find((s) => s.title === 'Compras')
  const { sheetId } = hoja
  if (hoja.cols < ANCHO) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: ANCHO - hoja.cols } }])
  }

  // El sub-rubro, en Compras, colgado del rubro que Compras ya definió.
  const texto = 'LOWER(Compras!$K$4:$K&" "&Compras!$L$4:$L&" "&Compras!$E$4:$E)'
  let sub = `"${OTROS}"`
  for (const [n, p] of [...SUBRUBROS].reverse()) sub = `IF(REGEXMATCH(${texto};"${p}");"${n}";${sub})`
  const fSub = `=ARRAYFORMULA(IF(Compras!$AC$4:$AC<>"Estructura";"";${sub}))`
  const reqC = []
  if (compras.cols < COL_SUB_COMPRAS + 1) {
    reqC.push({ appendDimension: { sheetId: compras.sheetId, dimension: 'COLUMNS', length: COL_SUB_COMPRAS + 1 - compras.cols } })
  }
  reqC.push({
    updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: COL_SUB_COMPRAS, endColumnIndex: COL_SUB_COMPRAS + 1 },
      rows: [
        { values: [{ userEnteredValue: { stringValue: 'Sub-rubro de estructura' }, userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }] },
        { values: [{ userEnteredValue: { formulaValue: fSub } }] },
      ],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  })
  reqC.push({ updateDimensionProperties: { range: { sheetId: compras.sheetId, dimension: 'COLUMNS', startIndex: COL_SUB_COMPRAS, endIndex: COL_SUB_COMPRAS + 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, reqC)

  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  const escritura = await escribirPreservando(google, ID, PESTAÑA, g.filas, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // ═══ SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA (31/07) ═══
  //
  // El defecto que arruinó CAJA, buscado en todos los generadores y encontrado en seis. La guarda hace
  // bien su trabajo —con la pestaña candada o con la firma editada, `escribirPreservando` NO escribe—
  // pero el resultado se descartaba y la corrida seguía: el formateador pintaba la geometría de la
  // grilla NUEVA sobre los valores VIEJOS, y donde había rangos con nombre los reapuntaba a filas que
  // en la pestaña no tienen ese dato. En CAJA eso dejó CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO sobre
  // dos celdas vacías: con el total y la fecha de corte en cero, todo cheque y toda quincena pasaban el
  // filtro y el calendario inflaba sus tramos. Sin un solo #ERROR y sin un aviso.
  //
  // Una pestaña que no se escribió no cambió de forma: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato ni sus rangos con nombre. Queda exactamente como la dejaste.')
  const { conservadas } = salteada ? { conservadas: [] } : escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  if (!salteada) await formatear(google, sheetId, g)
  if (!salteada) await publicarRangos(google, sheetId, g)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(C_PCT)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 8).join(' ')}` : '\n✓ sin errores')
  console.log('\nRUBRO                                REAL     PROYECTADO      TOTAL AÑO')
  for (let i = g.f0; i <= g.fTot; i++) {
    const f = v[i - 1] || []
    console.log(`${String(f[0] ?? '').slice(0, 32).padEnd(34)}${String(f[C_TOTREAL] ?? '').padStart(12)}${String(f[C_PROY] ?? '').padStart(15)}${String(f[C_TOTAL] ?? '').padStart(15)}`)
  }
  console.log('\nCONTROL:')
  console.log(`  Estructura según Compras   ${v[g.fCtrl - 1]?.[1]}`)
  console.log(`  ⇒ Diferencia               ${v[g.fCtrl]?.[1]}`)
  console.log(`  Rubros sin proyectar       ${v[g.fCtrl + 1]?.[1]}`)
}

/**
 * NÚCLEO PURO: los formatos propios de esta pestaña — los que la piel de statement no puede deducir
 * del contenido. Cada columna declara el suyo en cada corrida; ninguna hereda.
 *
 * ═══ LO QUE SE FUE, Y POR QUÉ (04/08) ═══
 *
 * La barra AZUL rellena del encabezado, el fondo ÁMBAR de lo proyectado y el gris de la fila del
 * total: los tres son rectángulos pintados, que es el rasgo que hace que una pestaña se lea como
 * planilla y no como un estado financiero. La jerarquía la da la tipografía y una línea fina —lo que
 * ya sabía hacer `estilo-statement`, y esta pestaña nunca usó—. Lo proyectado se distingue en
 * ITÁLICA, que es la convención para un estimado y cumple igual la regla de negocio de que un
 * estimado nunca se confunda con un hecho.
 *
 * Y el "$" se fue del cuerpo: queda sólo en la fila del total y en el bloque de control.
 *
 * @param {number} sheetId
 * @param {ReturnType<typeof grilla>} g
 * @returns {object[]} requests, para aplicar DESPUÉS de la piel
 */
export function formatosPropios(sheetId, g) {
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, g.filas.length) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, g.filas.length, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  fmt({ ...r(FILA_CAB - 1, FILA_CAB), startColumnIndex: C_MES0, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'mmm' }, horizontalAlignment: 'RIGHT' })
  fmt({ ...r(FILA_CAB - 1, FILA_CAB), startColumnIndex: C_TOTREAL, endColumnIndex: C_PCT + 1 },
    'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
  // Lo proyectado, en itálica. Agosto es el primer mes proyectado (índice 7 de los 12).
  fmt({ ...r(g.f0 - 1, g.fTot), startColumnIndex: C_MES0 + 7, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.textFormat', { textFormat: { italic: true } })
  fmt({ ...r(g.f0 - 1, g.fTot + 1), startColumnIndex: C_PROY, endColumnIndex: C_PROY + 1 },
    'userEnteredFormat.textFormat', { textFormat: { italic: true } })
  // La fila del total es la única del cuadro que lleva "$".
  fmt(r(g.fTot - 1, g.fTot, 1, C_PCT + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  fmt({ ...r(g.f0 - 1, g.fTot), startColumnIndex: C_PCT, endColumnIndex: C_PCT + 1 },
    'userEnteredFormat.numberFormat', { numberFormat: PORCENTAJE })
  // El bloque de control: dos importes de cierre, la diferencia en formato de control (el único rojo
  // de la pestaña) y un contador. La columna C en adelante ya no lleva nada — la prosa se fue al rótulo.
  fmt(r(g.fCtrl - 1, g.fCtrl, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  fmt(r(g.fCtrl, g.fCtrl + 1, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_CONTROL })
  fmt(r(g.fCtrl + 1, g.fCtrl + 2, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: CONTADOR })

  // La columna A tiene que entrar el rótulo del control entero, que ahora dice lo que decía la prosa.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 400 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: C_PCT + 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } })
  // Las auxiliares se ocultan: el dueño pidió "no quiero el detalle de nada".
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_PCT + 1, endIndex: ANCHO }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } })
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: 1 } }, fields: 'gridProperties.frozenColumnCount' } })
  return req
}

async function formatear(google, sheetId, g) {
  // La piel PRIMERO y los formatos propios DESPUÉS, en el mismo lote: los requests se aplican en
  // orden, así que lo propio manda donde se superpone. La piel recibe la grilla SIN el centinela: el
  // `\0` no es espacio para `trim()` y le rompería la detección de "esta fila tiene contenido".
  await google.spreadsheetBatchUpdate(ID, [
    ...skinRequests({
      sheetId,
      filas: limpiarCentinela(g.filas).map((f) => f.slice(0, C_PCT + 1)),
      cols: C_PCT + 1,
      congeladas: FILA_CAB,
      filasHoja: g.filas.length,
    }),
    ...formatosPropios(sheetId, g),
  ])
}

// SÓLO CORRE SI SE LO INVOCA, NO SI SE LO IMPORTA. Sin esta guarda, un test que importa `grilla()`
// para verificar sus rangos con nombre ARRANCA EL GENERADOR CONTRA EL SHEET REAL.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
