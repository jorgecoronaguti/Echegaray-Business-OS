#!/usr/bin/env node
// "Cheques Recibidos" — LA CARTERA, CON EL CHEQUE COMO UNIDAD. Reemplaza el registro de OPERACIONES.
//
// ═══ POR QUÉ (30/07) ═══
//
// El dueño mandó los cheques que ingresaron (pantallas eCHEQ del Santander + la Orden de Pago 4865 de
// Messina con 5 cheques de terceros) y pidió cruzarlos. Se cargaron: están en `public.cheques` y en la
// réplica `_CHEQUES_RAW` del propio archivo. Pero en la pestaña donde él los busca NO APARECÍA NINGUNO,
// y su reclamo —"te había pedido esto, hacelo"— era correcto.
//
// LA CAUSA NO ERA LA CARGA, ERA LA UNIDAD DE LA PESTAÑA. El registro viejo listaba OPERACIONES del
// homebanking (Aceptación · Custodia · Depósito · Endoso · Rescate) con corte congelado al 22/07. Tres
// consecuencias, todas visibles en la pestaña:
//
//   1. UNA OPERACIÓN NO ES UN CHEQUE. El mismo eCHEQ figura como Aceptación y después como Depósito;
//      el endoso de $20.000.000 figura dos veces (Rescate y Endoso). Sumar operaciones cuenta el mismo
//      valor varias veces, así que la cartera NO SE PODÍA SUMAR.
//   2. NO CERRABA, Y LO DECÍA: "Falta bajar del banco $40.290.000 — el registro NO cierra". Ese número
//      no era un hallazgo, era el síntoma de la unidad equivocada más un historial incompleto.
//   3. LOS 5 CHEQUES DE MESSINA NO TENÍAN DÓNDE ENTRAR. No vinieron de la pantalla de operaciones sino
//      de una orden de pago: no tienen "N° de operación". Agregarlos como Depósito sin su Aceptación
//      habría empeorado el control en otros $16,8M.
//
// ═══ QUÉ HACE ESTA VERSIÓN ═══
//
// UNA FILA ES UN CHEQUE. Con eso la cartera se suma sola y el control cierra POR CONSTRUCCIÓN: la suma
// de los estados es igual al total, porque cada cheque está en exactamente un estado.
//
// NI UN NÚMERO PEGADO. Todo es fórmula sobre `_CHEQUES_RAW` —la réplica de public.cheques dentro del
// archivo—. Se cobra un cheque, cambia su estado en la base, y esta pestaña se mueve sola en la
// siguiente réplica. Un número calculado afuera y pegado envejece en silencio.
//
// ═══ POR QUÉ ESCRIBE EN UNA PESTAÑA NUEVA Y NO EN LA DEL DUEÑO ═══
//
// La pestaña real tiene columnas que él AGREGÓ A MANO (Librador, CUIT) y que corrieron las del
// generador: escribir ahí por posición pondría "Qué significa" sobre su "Librador". Y cambiar la unidad
// del registro es un rediseño destructivo de una pestaña con datos suyos. La regla del proyecto es
// copia primero y aprobación antes del real, así que por defecto escribe al lado:
//
//   node orquestador/scripts/cheques-recibidos-tablero.mjs                      → "Cheques Recibidos (nuevo)"
//   node orquestador/scripts/cheques-recibidos-tablero.mjs --pestana "Cheques Recibidos"   → el real, ya aprobado
//   node orquestador/scripts/cheques-recibidos-tablero.mjs --dry
//
// ═══ SIMETRÍA CON "Cheques Emitidos" ═══
// Son las dos correcciones al saldo bancario del manual de conciliación: los emitidos no debitados lo
// BAJAN, los valores en cartera lo SUBEN cuando se depositen. Mismo vocabulario y misma piel, para que
// las dos se lean igual.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { skinRequests, MUTED, HAIR } from '../lib/estilo-statement.mjs'
import { seccion, total, sub } from '../lib/patron-pestana.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { query, closePool } from '../lib/db.mjs'
import { PESTAÑA as RAW, COL as R, FILA0 as RAW0 } from './cheques-raw-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const iP = process.argv.indexOf('--pestana')
export const DESTINO_POR_DEFECTO = 'Cheques Recibidos (nuevo)'
export const PESTAÑA_REAL = 'Cheques Recibidos'
// ═══ --reemplazar: LA REGENERACIÓN INTENCIONAL DE LA PESTAÑA REAL (30/07) ═══
//
// El dueño: "reemplaza cheques recibidos". Sin este flag no se puede hacer, y con razón: la pestaña
// está AUTO-CANDADA porque él la reescribió (agregó Librador y CUIT), y el portón descarta toda
// escritura de contenido sobre una pestaña suya. Ese portón está bien y no se toca.
//
// Lo que hace el flag es acotar la excepción: escribe SÓLO esta pestaña, deja antes un snapshot y un
// respaldo a disco del registro viejo, y verifica los controles después. Es la misma figura que el
// `--force` de Proveedores. El trabajo del dueño no se pierde: Librador y CUIT ya están en
// public.cheques y vuelven a la pestaña como columnas vivas.
const REEMPLAZAR = process.argv.includes('--reemplazar')
const PESTAÑA = iP >= 0 ? String(process.argv[iP + 1] ?? '').trim() : (REEMPLAZAR ? PESTAÑA_REAL : DESTINO_POR_DEFECTO)

const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }

/** Los rangos de la réplica, abiertos: si entra un cheque más, las fórmulas lo toman sin tocar nada. */
const rg = (c) => `${RAW}!$${c}$${RAW0}:$${c}`
const TIPO = rg(R.tipo); const IMP = rg(R.importe); const EST = rg(R.estado); const FP = rg(R.fechaPago)

/** Lo que se le debe a cada estado: qué es, y qué NO es. Es la línea que evita el error de caja. */
export const ESTADOS = [
  ['En custodia', 'En cartera — todavía NO es caja',
    'Guardado en el banco, sin depositar. Sigue siendo tuyo, pero recién es plata el día que se deposita.'],
  ['Depositado', 'Depositado — ya es caja',
    'Acreditado en la cuenta: dejó de ser un valor y pasó a ser plata. No lo cuentes dos veces.'],
  ['Endosado', 'Endosado a un tercero — ya salió',
    'Se entregó a un proveedor para pagarle: es un pago hecho, NO un ingreso que va a entrar.'],
  ['Rechazado', 'Rechazado — hay que reclamarlo',
    'El banco no lo pagó. No es plata: es un cobro a rehacer con el cliente.'],
]

/** Columnas del registro: [encabezado, unidad]. UNA FILA ES UN CHEQUE. */
export const COLUMNAS = [
  ['N° de cheque', 'texto'], ['Banco', 'texto'], ['Librador', 'texto'],
  // EL CUIT ESTÁ ACÁ PORQUE ERA EL TRABAJO DEL DUEÑO. En la pestaña vieja él completó Librador y CUIT
  // a mano, columna por columna, porque el registro por operación no los traía. Ese dato hoy vive en
  // public.cheques y llega por la réplica: el rediseño lo HEREDA en vez de borrárselo.
  ['CUIT del librador', 'texto'],
  ['Fecha de pago', 'fecha'], ['Importe', 'monedaExacta'], ['Estado', 'texto'],
  ['Obra', 'texto'], ['Orden de pago', 'texto'],
]
// LA COLUMNA A LA COMPARTEN LA BANDA Y EL REGISTRO, y necesitan cosas distintas: gana el rótulo de la
// banda, que es lo que se lee primero. Con 116px salían cortados —"⇒ Total de la carte", "Control —
// contra la"— y un rótulo cortado no es un rótulo, es un error de imprenta (se vio en el render).
// Mismo criterio y mismo ancho que "Cheques Emitidos", para que las dos se lean igual.
const ANCHO = { 0: 270, 1: 152, 2: 240, 3: 128, 4: 116, 5: 152, 6: 116, 7: 128, 8: 140 }

/** NÚCLEO PURO: la grilla entera. Sin red ni base — todo fórmula sobre la réplica. */
export function grilla({ corte = '', replica = '' } = {}) {
  const filas = []
  const push = (r = []) => { filas.push(r); return filas.length }
  const cartera = `SUMIFS(${IMP};${TIPO};"recibido";${EST};"En custodia")`

  push(['Cheques recibidos'])
  push([`Cuánta plata tengo en valores de terceros y cuándo se vuelve caja · una fila = UN cheque · fuente ${RAW} (public.cheques) · corte ${corte} · réplica del ${replica} · en pesos`])
  push([])

  // ── 1 · LA CARTERA POR ESTADO. Cierra por construcción: cada cheque está en un solo estado. ──────
  push([seccion(1, '¿cuánto valor tengo y en qué estado está?')])
  push(['Estado', 'Monto', 'Cheques', 'Qué significa'])
  const f0 = filas.length + 1
  for (const [est, rotulo, glosa] of ESTADOS) {
    push([est === 'En custodia' ? total(rotulo) : sub(rotulo),
      `=SUMIFS(${IMP};${TIPO};"recibido";${EST};"${est}")`,
      `=COUNTIFS(${TIPO};"recibido";${EST};"${est}")`, glosa])
  }
  const f1 = filas.length
  const fTot = push([total('Total de la cartera registrada'), `=SUM($B$${f0}:$B$${f1})`, `=SUM($C$${f0}:$C$${f1})`,
    'La suma de los estados. Cierra siempre: una fila es un cheque y un cheque está en un solo estado.'])
  // EL CONTROL CONTRA LA FUENTE: la suma de arriba tiene que dar el total de la réplica. Si un estado
  // nuevo apareciera en el banco y no estuviera en esta lista, su plata quedaría afuera EN SILENCIO.
  const fCtrl = push(['Control — contra la réplica (tiene que dar $0)',
    `=ROUND($B$${fTot}-SUMIFS(${IMP};${TIPO};"recibido");2)`, '',
    `Si no da cero, hay un cheque con un estado que esta pestaña todavía no contempla: está en ${RAW} y no se está contando arriba.`])
  push([])

  // ── 2 · CUÁNDO SE VUELVE CAJA. Sólo lo que está en cartera: lo depositado ya es plata y lo
  //        endosado ya salió. Un total sin fecha no es accionable.
  push([seccion(2, '¿cuándo se vuelve caja? — sólo lo que todavía está en cartera')])
  push(['Concepto', 'Monto', 'Cheques', 'Qué significa'])
  const enCartera = (cond) => `=SUMIFS(${IMP};${TIPO};"recibido";${EST};"En custodia"${cond})`
  const cuenta = (cond) => `=COUNTIFS(${TIPO};"recibido";${EST};"En custodia"${cond})`
  const finMes = 'MAX(TODAY()+7;EOMONTH(TODAY();0)+1)'
  push(['Vencido — averiguar por qué', enCartera(`;${FP};"<"&TODAY()`), cuenta(`;${FP};"<"&TODAY()`),
    'Pasó la fecha de pago y todavía no se depositó. No es plata que sobra: hay que averiguar por qué.'])
  push(['Esta semana — próximos 7 días', enCartera(`;${FP};">="&TODAY();${FP};"<"&TODAY()+7`), cuenta(`;${FP};">="&TODAY();${FP};"<"&TODAY()+7`), ''])
  push(['Hasta fin de este mes', enCartera(`;${FP};">="&TODAY()+7;${FP};"<"&${finMes}`), cuenta(`;${FP};">="&TODAY()+7;${FP};"<"&${finMes}`), ''])
  push(['Más adelante', enCartera(`;${FP};">="&${finMes}`), cuenta(`;${FP};">="&${finMes}`),
    'Diferidos: entran, pero no sirven para pagar hoy.'])
  push([])

  // ── 3 · EL PUENTE CON CAJA — HOY ES UN CONTROL DE CABLEADO, Y SE DICE ─────────────────────────────
  //
  // CAMBIÓ DE SIGNIFICADO EL 30/07, así que cambia el rótulo. Antes CAJA traía la cartera de otro lado
  // (un importe pegado desde las pantallas del banco) y esta línea comparaba DOS FUENTES: valía como
  // control de fondo. Desde que CAJA lee la misma réplica, las dos pestañas beben del mismo lugar y la
  // diferencia SÓLO puede ser cero. Dejarle el rótulo de antes sería vender como control de plata algo
  // que ya no lo es — y un control que no puede fallar es peor que ninguno: da confianza falsa.
  //
  // Sigue valiendo, pero por otra razón: si acá aparece un número distinto de cero, es que CAJA dejó de
  // leer la fuente (alguien le pegó un valor encima, o su fila quedó fosilizada). Es un CANARIO DE
  // CABLEADO, y como tal se nombra. La verificación contra el banco de verdad vive en el corte de la
  // réplica y en el control contra Cobranzas que tiene CAJA.
  push([seccion(3, 'el puente con caja')])
  push(['Concepto', 'Monto', '', 'Qué significa'])
  const fCaja = push(['Valores a depositar, según CAJA',
    '=IFERROR(INDEX(CAJA!$E$1:$E$200;MATCH("Valores a depositar";CAJA!$A$1:$A$200;0));"⚠ no está en CAJA")', '',
    `Se referencia por RÓTULO, no por celda: CAJA se reescribe entera. Esa fila también sale de ${RAW}.`])
  const fReg = push([sub('la misma cartera, según este registro'), `=${cartera}`, '',
    'Lo que suman los cheques en custodia de la réplica.'])
  // El rótulo lo arma la fórmula, así que NO pasa por total(): ese helper prefija texto y convertiría
  // la fórmula en una cadena. El "⇒ " que marca la línea clave va adentro de cada rama.
  push([`=IF(NOT(ISNUMBER($B$${fCaja}));"⇒ Falta el rótulo en CAJA";IF(ROUND($B$${fCaja}-$B$${fReg};0)=0;"⇒ CAJA y este registro coinciden";"⚠ CAJA dejó de leer la fuente"))`,
    `=IF(ISNUMBER($B$${fCaja});$B$${fCaja}-$B$${fReg};"⚠ falta el rótulo en CAJA")`, '',
    'Las dos leen la misma réplica: tiene que dar $0. Si no da cero, la cartera de CAJA volvió a ser un número pegado.'])
  push([])

  // ── 4 · EL REGISTRO, CHEQUE POR CHEQUE. Por QUERY sobre la réplica: si entra un cheque, aparece.
  push([seccion(4, 'el registro, cheque por cheque')])
  push(COLUMNAS.map(([n]) => n))
  // QUERY y no SORT(FILTER(…)): armar las columnas con un literal de array NO es portable al separador
  // es-AR ({"a"\"b"} vs {"a";"b"}) y ya rompió una pestaña. El texto del QUERY va entre comillas y el
  // localizador de fórmulas respeta los literales, así que sus comas llegan intactas.
  const fQuery = push([`=IFERROR(QUERY(${RAW}!$A$${RAW0}:$L;"select B, C, D, L, F, G, H, K, J where LOWER(A) = 'recibido' order by H, F";0);"sin cheques recibidos cargados")`])
  return { filas, marcas: { f0, f1, fTot, fCtrl, fQuery, cab: fQuery - 1 } }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { rows } = await query(
    `select count(*)::int n, sum(importe)::float8 total, max(corte)::text corte, estado
       from public.cheques where tipo = 'recibido' group by estado order by 2 desc`)
  if (!rows.length) { console.log('public.cheques no tiene recibidos — corré importar-cheques.mjs primero.'); return }
  const corte = rows.reduce((mx, r) => (String(r.corte) > mx ? String(r.corte) : mx), '')
  const tot = rows.reduce((s, r) => s + r.total, 0)
  console.log(`fuente: public.cheques — ${rows.reduce((s, r) => s + r.n, 0)} recibido(s) · corte ${corte}`)
  rows.forEach((r) => console.log(`  ${String(r.estado).padEnd(14)} ${String(r.n).padStart(2)} · $${Math.round(r.total).toLocaleString('es-AR')}`))
  console.log(`  TOTAL cartera registrada  $${Math.round(tot).toLocaleString('es-AR')}`)
  // LOS ESTADOS QUE NO ESTÁN EN LA LISTA quedarían fuera de la banda. Se avisa ACÁ, no en la pestaña.
  const faltan = rows.map((r) => r.estado).filter((e) => !ESTADOS.some(([x]) => x === e))
  if (faltan.length) console.log(`  ⚠ estados sin línea en la banda (su plata NO se contaría): ${faltan.join(', ')}`)

  const replica = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const { filas, marcas } = grilla({ corte, replica })
  const ancho = COLUMNAS.length
  console.log(`${PESTAÑA}: ${filas.length} filas x ${ancho} columnas · registro por QUERY en la fila ${marcas.fQuery}`)
  if (DRY) { filas.forEach((f, i) => console.log(String(i + 1).padStart(3), JSON.stringify(f).slice(0, 150))); return }

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: filas.length + 40, columnCount: ancho + 1, frozenRowCount: 2 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = Math.max(filas.length + 30, 60)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }
  // Una celda COMBINADA se come la escritura que no cae en su ancla, sin error y sin valor.
  await google.spreadsheetBatchUpdate(ID, [{ unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: alto, startColumnIndex: 0, endColumnIndex: ancho } } }]).catch(() => {})

  // Se fusiona (no se limpia): si el dueño anotó al costado, se conserva. Ver preservar-anotaciones.
  const grid = filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(VACIO); return r })
  if (REEMPLAZAR) {
    // ── EL REGISTRO VIEJO SE GUARDA ANTES DE REEMPLAZARLO ─────────────────────────────────────────
    // Son 30 operaciones de homebanking con corte 22/07. Su información ya está en public.cheques —de
    // ahí salen las filas nuevas—, pero un rediseño destructivo sin respaldo es irreversible, y esta
    // pestaña ya se destruyó una vez en este proyecto. Snapshot en la base + JSON a disco.
    const viejo = await google.readSheetGrid(ID, `${PESTAÑA}!A1:Z80`).catch(() => null)
    const dest = `/tmp/${PESTAÑA.replace(/\W+/g, '-')}-antes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
    if (viejo) { (await import('node:fs')).writeFileSync(dest, JSON.stringify(viejo, null, 1)); console.log(`  respaldo del registro viejo → ${dest}`) }
    const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
    const snap = await tomarSnapshot({ google, fileId: ID, pestana: PESTAÑA, tool: 'cheques-recibidos-tablero', directive: 'el dueño pidió reemplazar la pestaña (30/07)' })
    console.log(`  snapshot → ${snap ?? 'no se pudo (queda el respaldo a disco)'}`)

    // LA HUELLA VIEJA SE LIMPIA, PORQUE CAMBIA LA UNIDAD DE LA PESTAÑA. El registro viejo era por
    // OPERACIÓN (47 filas x 10 columnas) y el nuevo es por CHEQUE: dejar la cola de abajo mezclaría
    // dos unidades en la misma pestaña, que es exactamente el defecto que se está corrigiendo. Se
    // rellena con vacío EXACTAMENTE hasta donde llegaba lo viejo, ni una celda más.
    const altoViejo = (viejo?.filas ?? []).reduce((mx, f, i) => ((f || []).some((c) => String(c?.formula ?? c?.valor ?? '').trim()) ? i + 1 : mx), 0)
    const anchoViejo = (viejo?.filas ?? []).reduce((mx, f) => Math.max(mx, (f || []).length), 0)
    const ancho2 = Math.max(ancho, anchoViejo)
    const gridReemplazo = grid.map((f) => { const r = f.map((c) => (c === VACIO ? '' : c)); while (r.length < ancho2) r.push(''); return r })
    for (let i = grid.length; i < altoViejo; i++) gridReemplazo.push(Array(ancho2).fill(''))
    console.log(`  reemplazo: ${gridReemplazo.length} filas x ${ancho2} columnas (lo viejo llegaba a ${altoViejo} x ${anchoViejo})`)
    const res = await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A1`, values: gridReemplazo }], { yaGuardado: true })
    if (res?.protegido) throw new Error('el portón descartó la escritura: no se escribió nada')
    // LA PESTAÑA VUELVE A SER DEL GENERADOR. Queda 100% fórmula —no hay nada del dueño adentro que
    // proteger— así que se le saca el candado y se sella la firma: de acá en adelante se actualiza
    // sola con la réplica, que es lo que él pidió cuando dijo "pestañas vivas".
    const { desbloquear } = await import('../lib/pestana-bloqueada.mjs')
    const { sellarFirma } = await import('../lib/firma-tab.mjs')
    await desbloquear({ query }, ID, PESTAÑA).catch(() => {})
    await sellarFirma(google, ID, PESTAÑA)
    console.log('  🔓 candado liberado y firma sellada: la pestaña vuelve a actualizarse sola')
  } else {
    const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, grid, { anchoHoja: Math.max(ancho, hoja.cols ?? ancho) })
    if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) tuyas — CONSERVADAS`)
  }

  const R2 = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const txt = (color, { bold = false, size = 10 } = {}) => ({ foregroundColor: color, bold, fontSize: size, fontFamily: 'Arial' })
  const money = { type: 'NUMBER', pattern: '$#,##0;($#,##0);"—"' }
  const reqs = [
    // ═══ EL FORMATO VIEJO NO SE HEREDA (30/07) ═══
    //
    // Se vio en el render, no leyendo celdas: al reemplazar la pestaña, los formatos de la versión
    // anterior sobrevivieron donde el generador no los pisaba. Resultado: el título de la sección 3
    // aparecía CORTADO y tres glosas mostraban sólo el final del texto ("tran, pero no sirven para
    // pagar hoy" en vez de "Diferidos: entran, …"), porque esas celdas tenían alineación y wrap de la
    // pestaña vieja. Un reset de toda la grilla ANTES de la piel: el generador es dueño de su formato.
    E.reset(hoja.sheetId, alto, Math.max(ancho, hoja.cols ?? ancho)),
    ...skinRequests({ sheetId: hoja.sheetId, filas: grid, cols: ancho, congeladas: 2, titular: marcas.f0 }),
    // La banda DESBORDA, no se corta: un titular partido al medio no es un rótulo, es un error de imprenta.
    { repeatCell: { range: R2(0, marcas.cab, 0, ancho), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: R2(1, 2, 0, ancho), cell: { userEnteredFormat: { textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } },
    { repeatCell: { range: R2(4, marcas.cab, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    { repeatCell: { range: R2(4, marcas.cab, 2, 3), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0;;"—"' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    // LA ALINEACIÓN VA EXPLÍCITA: sin esto, una glosa larga heredaba la alineación de la pestaña vieja
    // y se dibujaba desbordando HACIA LA IZQUIERDA — se perdía el principio de la frase, que es donde
    // está el sujeto. Lo cazó el render, no la lectura de celdas.
    { repeatCell: { range: R2(4, marcas.cab, 3, 4), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL', horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(numberFormat,textFormat,wrapStrategy,horizontalAlignment)' } },
    // Los títulos de sección y los rótulos de la columna A, también: un título cortado no es un título.
    { repeatCell: { range: R2(0, marcas.cab, 0, 1), cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
    // EL TITULAR: la cifra de la cartera, que es con la que se decide.
    { repeatCell: { range: R2(marcas.f0 - 1, marcas.f0, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT', textFormat: txt(ACENTO, { bold: true, size: 16 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    { repeatCell: { range: R2(marcas.f0 - 1, marcas.f0, 0, 1), cell: { userEnteredFormat: { textFormat: txt(ACENTO, { bold: true, size: 12 }) } }, fields: 'userEnteredFormat.textFormat' } },
    // Encabezado del registro: versalita apagada con hairline, igual que en las otras dos de cheques.
    { repeatCell: { range: R2(marcas.cab - 1, marcas.cab, 0, ancho), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
    { updateBorders: { range: R2(marcas.cab - 1, marcas.cab, 0, ancho), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: R2(marcas.cab, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ANCHO[j] ?? 120 }, fields: 'pixelSize' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ── VERIFICACIÓN: releer y probar que los controles CIERRAN ───────────────────────────────────────
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:D${marcas.fQuery + 40}`)
  const n = (s) => Number(String(s ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  const errores = (v || []).flat().filter((c) => /#(REF|N\/A|VALUE|ERROR|NAME|DIV)/i.test(String(c ?? ''))).length
  const totalPestana = n(v?.[marcas.fTot - 1]?.[1])
  const control = n(v?.[marcas.fCtrl - 1]?.[1])
  const filasQuery = (v || []).slice(marcas.fQuery - 1).filter((f) => String(f?.[0] ?? '').trim()).length
  console.log(`\n✔ ${PESTAÑA}`)
  ESTADOS.forEach(([est], k) => console.log(`  ${est.padEnd(14)} ${v?.[marcas.f0 - 1 + k]?.[1] ?? '—'} (${v?.[marcas.f0 - 1 + k]?.[2] ?? '0'} cheque/s)`))
  console.log(`  TOTAL cartera ${v?.[marcas.fTot - 1]?.[1]} · contra la base $${Math.round(tot).toLocaleString('es-AR')}`)
  console.log(`  control contra la réplica: ${control === 0 ? '✓ cierra en $0' : `✖ NO cierra ($${control})`}`)
  console.log(`  registro: ${filasQuery} cheque(s) listados por QUERY`)
  console.log(`  ${errores} celda(s) en error`)
  const cierraBase = Math.abs(totalPestana - tot) < 1
  if (!cierraBase) console.log(`  ✖ la pestaña dice ${totalPestana} y la base ${tot}`)
  if (errores || control !== 0 || !cierraBase || filasQuery === 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
}
