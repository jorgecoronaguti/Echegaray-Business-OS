#!/usr/bin/env node
// LA PROYECCIÓN DE CARGAS SOCIALES, CONCEPTO POR CONCEPTO.
//
// EL PEDIDO (21/07). El dueño: "las proyecciones de cargas sociales en esa pestaña son muy simples,
// no hay profundidad en la proyección solicitada para el resto del año. Revisar y rehacer."
//
// ═══ QUÉ TENÍA ═══
//
// Un solo ratio: cargas = jornales × 63,6%. Todo en fórmulas —la regla de oro se cumplía— pero el
// MODELO era de una línea, y por eso el número no se puede usar para decidir nada. Tres problemas
// concretos:
//
// 1. LOS CONCEPTOS NO SE COMPORTAN IGUAL. El Seguro de Vida es casi fijo ($9.342 con 22 empleados,
//    $6.024 con 18): no escala con la masa salarial, escala con la CANTIDAD DE GENTE. Los aportes y
//    contribuciones sí son un porcentaje de la remuneración. La ART también, pero con su propia
//    alícuota. Aplicarles a todos el mismo 63,6% mezcla cosas que se mueven distinto.
//
// 2. FALTABAN $3,1M POR MES. El bloque "pagado" muestra que además del F931 se pagan FCL, UOCRA,
//    IERIC y FODECO. La proyección no los incluía: sobre seis meses son ~$18M que el cash flow no
//    veía.
//
// 3. EL RATIO SALÍA DE LO DECLARADO Y LO QUE SALE DE CAJA ES LO PAGADO. Declarado en el semestre
//    $44.776.342, pagado $49.675.380. Son dos preguntas distintas —cuánto se devengó y cuánto
//    salió— y el cuadro es de CAJA.
//
// ═══ CÓMO SE PROYECTA AHORA ═══
//
// Cada concepto con SU regla, y la alícuota MEDIDA de los seis meses reales, no traída de una norma
// que no puedo verificar. La alícuota vive en una celda visible: si alguien quiere saber por qué
// sale ese número, lo ve, y si el convenio cambia se corrige ahí.
//
//   · los que son % de la remuneración → alícuota promedio de los 6 meses × remuneración proyectada
//   · Seguro de Vida                   → costo promedio POR EMPLEADO × dotación proyectada
//   · deuda previsional (planes)       → NO se proyecta: son cuotas ciertas y ya están en
//                                        "Impuestos y Financieros". Proyectarlas otra vez sería
//                                        duplicar el mismo egreso en dos pestañas.
//
// Y LA REMUNERACIÓN PROYECTADA no se inventa: sale de los jornales que la pestaña de quincenas ya
// proyecta, por la relación remuneración-declarada / jornales-netos medida en los meses reales.
//
// ═══ EL DESFASAJE, QUE ES UN ERROR DE CAJA Y NO DE MODELO ═══
//
// El F931 de un mes se paga al mes SIGUIENTE. La proyección vieja ponía la carga de julio en julio,
// cuando en realidad sale en agosto. En un cuadro de caja eso corre $9M de mes. Ahora la fila del
// mes muestra lo DEVENGADO y una fila aparte muestra cuándo SALE.
//
//   node orquestador/scripts/cargas-proyeccion.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cargas Sociales'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const FIRMA = '4 · PROYECCIÓN DE CARGAS SOCIALES — concepto por concepto, con su propia regla'
const ANCHO = 10
/**
 * LA FIRMA DE CIERRE DEL BLOQUE. Es la última fila que este script escribe, y es lo que le permite
 * saber dónde termina su propio bloque en la próxima corrida. No es decorativa: sin ella el script
 * inventaba un largo de 20 filas y se duplicaba a sí mismo en cada pasada.
 */
const CIERRE = '⚠ Lo que esta proyección NO contempla'

/** Desde qué mes se proyecta. Julio ya tiene jornales cargados pero todavía no F931 presentado. */
const DESDE = 7

/**
 * NÚCLEO PURO: cómo se proyecta cada concepto.
 *   'remuneracion' → % de la masa salarial declarada
 *   'dotacion'     → costo por empleado × cantidad de empleados
 *   'cierto'       → no se proyecta acá: ya vive en otra pestaña
 */
export const CONCEPTOS = [
  { rotulo: 'Aportes Seguridad Social', base: 'remuneracion', bloque: 'declarado' },
  { rotulo: 'Aportes Obra Social', base: 'remuneracion', bloque: 'declarado' },
  { rotulo: 'Contribuciones Seguridad Social', base: 'remuneracion', bloque: 'declarado' },
  { rotulo: 'Contribuciones Obra Social', base: 'remuneracion', bloque: 'declarado' },
  { rotulo: 'L.R.T.', base: 'remuneracion', bloque: 'declarado', nota: 'La alícuota de ART depende de la siniestralidad y del riesgo de la actividad: se mide, no se supone.' },
  { rotulo: 'Seguro de Vida', base: 'dotacion', bloque: 'declarado', nota: 'NO escala con la masa salarial: es un costo por persona. Con 18 empleados costó $6.024 y con 22, $9.342.' },
  { rotulo: 'FCL', base: 'remuneracion', bloque: 'pagado', nota: 'Fondo de Cese Laboral — es de la construcción y no está en el F931.' },
  { rotulo: 'UOCRA', base: 'remuneracion', bloque: 'pagado', nota: 'Cuota sindical y aportes de convenio.' },
  { rotulo: 'IERIC', base: 'remuneracion', bloque: 'pagado' },
  { rotulo: 'FODECO', base: 'remuneracion', bloque: 'pagado' },
]

/** NÚCLEO PURO: ubica una fila por su rótulo dentro de una columna leída. */
export function filaDe(columnaA = [], rotulo) {
  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const r = norm(rotulo)
  const i = columnaA.findIndex((v) => norm(v).startsWith(r))
  return i < 0 ? null : i + 1
}

/** NÚCLEO PURO: la letra de columna del mes N dentro del bloque (B = enero). */
export function colMes(mes) {
  return String.fromCharCode(66 + mes - 1)
}

/**
 * Los jornales netos de un mes. NO es una suma simple: la pestaña de quincenas tiene DOS bloques
 * —filas 3:16 con el importe en la columna J, filas 23:33 con el importe en la G— y hay que sumar
 * los dos. Esta expresión ya estaba funcionando en la pestaña y se reusa tal cual en vez de
 * escribir otra: dos versiones del mismo cálculo es exactamente lo que la regla de oro prohíbe.
 *
 * FRAGILIDAD DECLARADA: los rangos 3:16 y 23:33 están fijos. Si la pestaña de quincenas cambia de
 * geometría, esto deja de sumar bien SIN dar error. Es una deuda que hereda del cuadro anterior.
 */
export function jornalesDelMes(fecha) {
  const Q = "'Jornales por Quincena'"
  return `SUMPRODUCT((YEAR(${Q}!$A$3:$A$16)=YEAR(${fecha}))*(MONTH(${Q}!$A$3:$A$16)=MONTH(${fecha}))*(${Q}!$A$3:$A$16<${Q}!$A$23)*${Q}!$J$3:$J$16)+SUMPRODUCT((YEAR(${Q}!$A$23:$A$33)=YEAR(${fecha}))*(MONTH(${Q}!$A$23:$A$33)=MONTH(${fecha}))*${Q}!$G$23:$G$33)`
}

function grilla(f, desde) {
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }
  // LA FILA ABSOLUTA DEL SHEET que va a ocupar el PRÓXIMO push. push() devuelve la posición dentro
  // del bloque, y usar ese número en una fórmula la hace apuntar al bloque 1 de la pestaña. Ya me
  // pasó hoy en el control de la tarjeta: el mismo error, dos veces en el mismo día.
  const aFila = () => desde + filas.length
  const meses = []
  for (let m = DESDE; m <= 12; m++) meses.push(m)
  // Las columnas del bloque nuevo: A rótulo, B alícuota medida, C..H los seis meses, I total, J nota.
  const colDe = (m) => String.fromCharCode(67 + (m - DESDE))
  const ultimaCol = colDe(12)

  // Los meses REALES de los que se mide: enero a junio, que son los que tienen F931 presentado.
  const rangoReal = (fila) => `$B$${fila}:$G$${fila}`

  push([FIRMA])
  push(['Cada concepto con SU regla y con la alícuota MEDIDA de los seis meses reales — no traída de una norma que no puedo verificar. La alícuota está a la vista: si el convenio cambia, se corrige ahí y todo el cuadro se mueve. La proyección vieja usaba un solo ratio del 63,6% para todo, no incluía FCL/UOCRA/IERIC/FODECO (~$3,1M por mes) y ponía la carga en el mes en que se devenga, no en el que sale de la caja.'])
  push()

  // ── LA BASE ─────────────────────────────────────────────────────────────────────────────────────
  push(['LA BASE DE LA PROYECCIÓN', '', '', '', '', '', '', '', '', 'De dónde sale'])
  const fRelacion = aFila()
  push(['Remuneración declarada ÷ jornales netos (medido ene–jun)',
    `=IFERROR(SUM(${rangoReal(f.remuneracion)})/(${[1, 2, 3, 4, 5, 6].map((m) => jornalesDelMes(`DATE(${AÑO};${m};1)`)).join('+')});"")`,
    '', '', '', '', '', '', '',
    'La remuneración que se declara en el F931 no es el neto que se paga en mano. Esta relación traduce una en otra, medida sobre los seis meses que tienen las dos cosas.'])
  const fEmpleadosProm = aFila()
  push(['Empleados promedio (ene–jun)', `=IFERROR(AVERAGE(${rangoReal(f.empleados)});"")`, '', '', '', '', '', '', '',
    'Base para el Seguro de Vida, que es un costo por persona.'])
  push()

  // ── LA PROYECCIÓN MES A MES ─────────────────────────────────────────────────────────────────────
  const cab = aFila()
  // EL APÓSTROFO NO ES UN CAPRICHO: "jul-26" escrito con USER_ENTERED lo parsea Sheets como una
  // FECHA y el encabezado se ve "46229" — el número de serie. Ponerle formato TEXT después no lo
  // devuelve: ya se convirtió al escribir. El apóstrofo lo fuerza a texto en el momento correcto.
  push(['Concepto', 'Alícuota medida', ...meses.map((m) => `'${['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m]}-26`), 'Total jul–dic', 'Cómo se proyecta'])
  // La remuneración y la dotación proyectadas, que son la base de todo lo de abajo.
  const fRem = aFila()
  push(['Remuneración proyectada', '',
    ...meses.map((m) => `=IFERROR((${jornalesDelMes(`DATE(${AÑO};${m};1)`)})*$B$${fRelacion};0)`),
    `=SUM($C${aFila()}:$${ultimaCol}${aFila()})`,
    'Jornales proyectados × la relación de arriba.'])
  const fDot = aFila()
  push(['Dotación proyectada', '', ...meses.map(() => `=ROUND($B$${fEmpleadosProm};0)`), '',
    'Se mantiene el promedio: no hay un plan de contratación cargado en ningún lado, y suponer que crece sería inventarlo.'])
  push()

  const filasConcepto = []
  // Las que NO son un porcentaje: su "alícuota" es plata por persona, no una fracción.
  const filasPorEmpleado = []
  for (const c of CONCEPTOS) {
    const fo = f[c.bloque === 'declarado' ? 'declarado' : 'pagado'][c.rotulo]
    if (!fo) continue
    const fila = aFila()
    const alicuota = c.base === 'dotacion'
      // Costo por empleado: total del semestre ÷ suma de empleados de cada mes.
      ? `=IFERROR(SUM(${rangoReal(fo)})/SUM(${rangoReal(f.empleados)});"")`
      : `=IFERROR(SUM(${rangoReal(fo)})/SUM(${rangoReal(f.remuneracion)});"")`
    const celda = (i) => c.base === 'dotacion'
      ? `=$B${fila}*${colDe(meses[i])}$${fDot}`
      : `=$B${fila}*${colDe(meses[i])}$${fRem}`
    filasConcepto.push(fila)
    if (c.base === 'dotacion') filasPorEmpleado.push(fila)
    push([c.rotulo, alicuota, ...meses.map((_, i) => celda(i)),
      `=SUM($C${fila}:$${ultimaCol}${fila})`,
      c.nota ?? (c.base === 'dotacion' ? 'Costo por empleado × dotación.' : '% de la remuneración declarada.')])
  }
  const fTot = aFila()
  push(['⇒ TOTAL DEVENGADO EN EL MES', '',
    ...meses.map((_, i) => `=SUM(${colDe(meses[i])}${filasConcepto[0]}:${colDe(meses[i])}${filasConcepto[filasConcepto.length - 1]})`),
    `=SUM($C${aFila()}:$${ultimaCol}${aFila()})`,
    'Lo que la nómina de ESE mes genera de cargas.'])
  const fPct = aFila()
  push(['  · como % de la remuneración', '',
    ...meses.map((_, i) => `=IFERROR(${colDe(meses[i])}${fTot}/${colDe(meses[i])}${fRem};"")`), '',
    'El ratio único que usaba la proyección vieja era 63,6% para todos los meses. Acá se ve cómo se mueve de verdad.'])
  push()

  // ── CUÁNDO SALE DE LA CAJA ──────────────────────────────────────────────────────────────────────
  push(['CUÁNDO SALE DE LA CAJA — no es el mismo mes'])
  push(['El F931 de un mes vence al mes siguiente. La proyección vieja ponía la carga de julio en julio; en un cuadro de CAJA eso corre unos $9M de mes. Esta fila es la que tiene que mirar el cash flow.'])
  const fCaja = aFila()
  push(['Cargas que SALEN en el mes', '',
    ...meses.map((_, i) => (i === 0
      ? `=IFERROR($G$${f.declarado['__total']};0)`
      : `=${colDe(meses[i - 1])}${fTot}`)),
    `=SUM($C${aFila()}:$${ultimaCol}${aFila()})`,
    'Es el devengado del mes ANTERIOR. En julio sale lo declarado de junio, que ya es un dato real y no una proyección.'])
  push(['Deuda previsional (planes de pago)', '', ...meses.map(() => ''), '',
    '⚠ NO se proyecta acá a propósito: son cuotas CIERTAS y ya están en "Impuestos y Financieros", bloque 3. Proyectarlas otra vez sería el mismo egreso contado dos veces.'])
  push()
  push([CIERRE, '', '', '', '', '', '', '', '',
    'SAC (se devenga todo el año y se paga en junio y diciembre) y vacaciones: están en el bloque 5, todavía sin conectar a esta proyección. Y la paritaria UOCRA: los jornales proyectados se ajustan por inflación, pero el jornal de convenio sigue a la paritaria, que es otro número y llega en otras fechas.'])

  return { filas, fTot, fCaja, cab, fRem, fDot, fEmpleadosProm, fPct, filasPorEmpleado }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((s) => s.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // LAS FILAS SE BUSCAN POR RÓTULO, nunca por número: los bloques de arriba los mantiene otro
  // script y basta que alguien agregue un concepto para que todos los números fijos apunten mal.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:K200`)
  const colA = v.map((f) => f?.[0])

  const f = { declarado: {}, pagado: {} }
  for (const c of CONCEPTOS) {
    const fila = filaDe(colA, c.rotulo)
    if (!fila) { console.error(`  ⚠ no encontré la fila "${c.rotulo}" — ese concepto queda FUERA de la proyección`); continue }
    f[c.bloque === 'declarado' ? 'declarado' : 'pagado'][c.rotulo] = fila
  }
  f.declarado.__total = filaDe(colA, 'TOTAL DECLARADO')
  f.remuneracion = filaDe(colA, 'Remuneración declarada')
  f.empleados = filaDe(colA, 'Empleados en nómina')
  if (!f.remuneracion || !f.empleados || !f.declarado.__total) {
    throw new Error('faltan las filas base (remuneración, empleados o total declarado): no proyecto sobre supuestos')
  }

  // ═══ HASTA DÓNDE LLEGA EL BLOQUE VIEJO ═══════════════════════════════════════════════════════
  //
  // ACÁ ESTUVO EL PEOR BUG DE ESTA PESTAÑA (encontrado el 21/07). Era esto:
  //
  //     const fin = filaDe(colA, '5 · SAC')
  //     const hasta = fin ? fin - 1 : ini + 20
  //
  // El bloque "5 · SAC" no existe con ese rótulo, así que `fin` siempre daba 0 y el script asumía
  // que su bloque medía 20 filas. Mide 30. Como el bloque nuevo era más largo que el rango que
  // creía ocupar, cada corrida INSERTABA filas y escribía otra copia debajo, empujando la anterior
  // hacia abajo. El cuadro de proyección terminó escrito DIEZ VECES, una atrás de la otra, en una
  // pestaña que el agente rehace cada 2 horas.
  //
  // La lección general: un límite inventado ("si no lo encuentro, asumo 20") no es un valor por
  // defecto prudente — es una corrupción silenciosa que se acumula. El bloque se delimita por su
  // propia FIRMA DE CIERRE, que es la última fila que este mismo script escribe, y se toma la
  // ÚLTIMA aparición: así una corrida limpia todas las copias que dejaron las anteriores.
  const ini = filaDe(colA, '4 · PROYECCIÓN')
  if (!ini) throw new Error('no encontré el bloque "4 · PROYECCIÓN"')
  const ultimaCon = (txt) => { let r = 0; colA.forEach((v, i) => { if (String(v ?? '').trim().startsWith(txt)) r = i + 1 }); return r }
  const cierre = ultimaCon(CIERRE)
  if (!cierre) console.error(`  ⚠ no encontré la firma de cierre "${CIERRE}": escribo sin borrar el bloque viejo`)
  const hasta = cierre || ini + 20
  const copias = colA.filter((v) => String(v ?? '').trim().startsWith(CIERRE)).length
  if (copias > 1) console.log(`  ⚠ había ${copias} copias del bloque apiladas (filas ${ini}–${hasta}): las reemplaza una sola`)

  const g = grilla(f, ini)
  console.log(`${PESTAÑA}: bloque 4 en las filas ${ini}–${hasta} · ${g.filas.length} filas nuevas`)
  console.log(`  conceptos proyectados: ${Object.keys(f.declarado).length - 1} del F931 + ${Object.keys(f.pagado).length} gremiales`)
  if (DRY) { for (const x of g.filas) console.log('   ', x.filter(Boolean).slice(0, 3).join('  |  ')); return }

  // Si el bloque nuevo es más largo que el viejo hay que hacer lugar, y si es más corto hay que
  // borrar el sobrante: dejar filas del cuadro anterior colgando debajo es peor que no escribir.
  const sobra = hasta - ini + 1 - g.filas.length
  const req = []
  if (sobra < 0) req.push({ insertDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: hasta, endIndex: hasta - sobra }, inheritFromBefore: false } })
  if (sobra > 0) req.push({ deleteDimension: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: hasta - sobra, endIndex: hasta } } })
  if (req.length) await google.spreadsheetBatchUpdate(ID, req)

  await google.clearValues(ID, `${PESTAÑA}!A${ini}:J${ini + g.filas.length}`)
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A${ini}`, values: g.filas }])

  const r = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const n = g.filas.length
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: r(ini - 1, ini + n, 2, 9), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    // La alícuota se muestra con 2 decimales: 0,1436 es 14,36% y redondeado a "14%" el cuadro pierde
    // la precisión que justifica haberla medido.
    { repeatCell: { range: r(ini - 1, ini + n, 1, 2), cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.00%' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    // ═══ LAS EXCEPCIONES AL FORMATO GENERAL ═══
    // Un formato de columna aplicado en bloque convierte cualquier celda que no sea lo esperado en
    // un número absurdo, y absurdo no es lo mismo que visiblemente roto: "39675,94%" se lee como un
    // dato, no como un error. Es el octavo defecto de este tipo en la sesión.
    // · el encabezado son rótulos de mes, no plata ("$46.229" era el número de serie de julio)
    { repeatCell: { range: r(g.cab - 1, g.cab, 0, ANCHO), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } },
    // · empleados y dotación son CANTIDADES
    ...[g.fEmpleadosProm, g.fDot].map((fx) => ({ repeatCell: { range: r(fx - 1, fx, 1, 9), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0;;""' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } })),
    // · el Seguro de Vida se mide en PESOS POR EMPLEADO, no en porcentaje
    ...g.filasPorEmpleado.map((fx) => ({ repeatCell: { range: r(fx - 1, fx, 1, 2), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0" /pers."' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } })),
    // · el ratio del pie es un porcentaje aunque esté en las columnas de plata
    { repeatCell: { range: r(g.fPct - 1, g.fPct, 2, 9), cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.0%' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } },
    { repeatCell: { range: r(ini - 1, ini + n, 9, 10), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9, italic: true }, wrapStrategy: 'CLIP' } }, fields: 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: r(ini - 1, ini, 0, ANCHO), cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 }, backgroundColor: { red: 0.94, green: 0.95, blue: 0.97 } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor' } },
    { repeatCell: { range: r(g.cab - 1, g.cab, 0, ANCHO), cell: { userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment' } },
    ...[g.fTot, g.fCaja].map((fx) => ({ repeatCell: { range: r(fx - 1, fx, 0, ANCHO), cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } } }, fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor' } })),
  ])
  console.log('  ✓ escrito y formateado')
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
