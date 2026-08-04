#!/usr/bin/env node
// "Tarjeta de Credito" — LA PESTAÑA CONTESTA CUATRO PREGUNTAS Y NADA MÁS:
//
//        ¿CUÁNTO PUEDO GASTAR HOY? · ¿CUÁNTO VENCE Y CUÁNDO? · ¿CUÁNTO ME COSTÓ?
//        · ¿LA ESTOY USANDO COMO MEDIO DE PAGO O COMO FINANCIAMIENTO?
//
// ═══ POR QUÉ SE REHIZO (04/08) ═══
//
// El dueño: "less is more, world class = como se usaría y se vería en JP Morgan". Lo que había era
// lo contrario, y era medible sobre la pestaña real:
//
//   · SEIS bloques con DOS numeraciones que se pisaban: arriba 1, 2, 5, 6 (escritos a mano, con dos
//     números faltantes) y abajo otro 1 y otro 2 (los del generador anterior). Dos bloques "1" en la
//     misma pestaña: el lector no tiene forma de saber cuál es el principio.
//   · DOS FOTOS DEL BANCO contradiciéndose: el panel de arriba declaraba el resumen al 29/07 (cierra
//     20/08, vence 01/09) y el bloque de abajo el del 22/07 (cierra 23/07, vence 03/08). Mismo
//     concepto, dos verdades, ninguna con precedencia declarada.
//   · La columna "Banco" del bloque de control se veía COMO FECHAS —"9/6/4544", "24/1/29279"—: los
//     importes estaban bien pero la celda tenía formato de fecha, así que el único control de
//     conciliación de la pestaña era ilegible. Un control que no se puede leer no es un control.
//   · Una columna entera de prosa ("Qué significa") al lado de cada número. El dueño borra siempre
//     las columnas de aclaraciones; la trazabilidad va UNA vez, en el subtítulo.
//   · 51 filas fuera del registro para decir lo que entra en 30.
//
// ═══ EL CAMBIO DE FONDO: LA TARJETA ES UNA LÍNEA DE CRÉDITO REVOLVENTE, NO UN LISTADO ═══
//
// Un crédito revolvente se define por una sola propiedad: el disponible BAJA Y SUBE según se toma y
// se repaga contra un límite pre-aprobado (Wikipedia, "Revolving credit", consultado 04/08/2026 —
// "the amount of available credit decreases and increases as funds are borrowed and then repaid").
// Por eso el titular de la pestaña es el DISPONIBLE, no el consumido: es la única cifra con la que
// se decide una compra. Y por eso el cupo de cuotas va pegado abajo del titular: es un cupo APARTE y
// más chico, y confundirlo hace planificar una compra que la tarjeta no va a aprobar.
//
// ═══ LA FORMA (por qué así y no de otra manera) ═══
//
//   · IBCS 2.0 / ISO 24896 "Notation for business reporting" (ibcs.com/standards, consultado
//     04/08/2026; la versión 2.0 salió el 11/06/2026 alineada con la ISO, y reconoce el objetivo
//     compartido con ISO 24495-1 Plain Language). De su fórmula SUCCESS acá pesan dos: SAY —el
//     mensaje primero, el respaldo después— y CONDENSE —agregar a la granularidad de la DECISIÓN—.
//     Por eso el calendario de vencimientos no tiene doce filas (una por mes) sino tres tramos:
//     próximo débito · los tres meses siguientes · más adelante. El mes a mes ya está en el registro.
//   · Tufte, data-ink ratio: la tinta que no transporta dato se borra. Acá: sin reja, sin barras de
//     color, sin bordes de caja; la jerarquía la da la tipografía y un hairline sobre los totales
//     (lib/estilo-statement.mjs, que es la misma piel de las dos pestañas de cheques).
//   · La gramática de bloques es la común del archivo (lib/patron-pestana.mjs): título, subtítulo,
//     hero sin número, y secciones numeradas CORRIDAS. El test la mide con auditarPatron().
//
// ═══ REGLAS QUE ESTE SCRIPT NO PUEDE ROMPER ═══
//
//   · NO TOCA EL REGISTRO (el detalle de compras y cuotas, columnas A–L). Lo carga el dueño y es el
//     hecho primario. El generador sólo escribe la banda de arriba y borra su propio bloque viejo.
//   · NUNCA ESCRIBE EN LA COLUMNA E, NI "SI" EN LA J. CAJA suma
//        SUMPRODUCT((UPPER('Tarjeta de Credito'!$J$3:$J$400)<>"SI")*IF(ISNUMBER($E$3:$E$400);…))
//     sobre el rango de columna ENTERO: cualquier importe que la banda pusiera en E se sumaría al
//     consumo de tarjeta de CAJA como si fuera una compra más. Es el mismo defecto que la banda de
//     Cheques Emitidos evita con la columna F, y acá hay test.
//   · El registro se ubica por el DATO (fecha en A + importe en E), no por el rótulo "Fecha de
//     Compra": un rótulo lo puede borrar una persona y el generador insertaría filas a ciegas.
//   · Los tres únicos números pegados son los del resumen del banco, que no salen del Sheet: llevan
//     su corte al lado y un semáforo que grita cuando la foto envejece.
//
//   node orquestador/scripts/tarjeta-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { skinRequests, MUTED, HAIR, ACENTO, INK } from '../lib/estilo-statement.mjs'
import { seccion, total, sub } from '../lib/patron-pestana.mjs'
import { conEdicionesRespetadas, guardarRegistro, autoRespetarReescritura } from '../lib/respetar-ediciones.mjs'
import { firmaGuardia, sellarFirma } from '../lib/firma-tab.mjs'
import { TARJETA, CORTE } from '../lib/banco-santander.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Tarjeta de Credito'
const DRY = process.argv.includes('--dry')

/** Ancho de grilla de la pestaña. El registro es más ancho: es el ledger, y el patrón admite uno. */
const COLS = 12
/** Alto exacto de la banda. El encabezado del registro queda en BANDA + 1. */
export const BANDA = 30
/** La fila del titular dentro de la banda (1-based): la única cifra con la que se decide. */
export const TITULAR = 7
/** Hasta cuánto se acepta como redondeo en el control. Las cuotas del registro tienen centavos
 *  propios y contra el resumen dan diferencias de monedas: un control que grita por un peso se deja
 *  de mirar, y un control que se deja de mirar tapa el día que la diferencia sea de verdad. */
const TOLERANCIA = 100
/** A partir de cuántos días la foto del banco deja de ser presente y pasa a ser una advertencia. */
const DIAS_FRESCURA = 21

const ymd = (iso) => { const [a, m, d] = String(iso).split('-').map(Number); return { a, m, d } }

/**
 * NÚCLEO PURO: las filas de la banda, dado dónde arranca el registro.
 *
 * Determinística: no mira el reloj ni la red. Todo lo que cambia con el tiempo lo calcula el motor
 * de Sheets (TODAY, MINIFS sobre el registro), no esta función — un rótulo estampado con la fecha de
 * la corrida se queda clavado el día que el dueño carga una cuota y no corre nadie.
 *
 * @param {number} hdr   fila (1-based) del encabezado del registro
 * @param {object} banco la foto del resumen: { TARJETA, CORTE }
 * @returns {string[][]} grilla de COLS columnas, lista para escribir en A1
 */
export function bandaFilas(hdr = BANDA + 1, banco = { TARJETA, CORTE }) {
  const T = banco.TARJETA
  // ═══ LA TARJETA TIENE SU PROPIA FECHA DE FOTO, NO LA DEL EXTRACTO (04/08) ═══
  //
  // Acá se usaba `CORTE`, que es el corte del EXTRACTO DE LA CUENTA. El resumen de la tarjeta es
  // otro documento y cierra otro día: el de la cuenta era del 22/07 y el de la tarjeta del 29/07.
  // Con la fecha equivocada, el semáforo de antigüedad envejecía la foto una semana de más y el
  // subtítulo declaraba un origen que no era. Ahora manda `TARJETA.al` si está declarada, y sólo
  // se cae al corte de la cuenta cuando la foto de la tarjeta no trae fecha propia.
  const corte = ymd(T.al || banco.CORTE)
  const dmy = `${String(corte.d).padStart(2, '0')}/${String(corte.m).padStart(2, '0')}/${corte.a}`

  // ── Los rangos del registro. ABIERTOS hacia abajo a propósito ───────────────────────────────────
  // Se puede porque este rediseño subió TODO a la banda: debajo del registro ya no vive ningún
  // bloque del OS, así que una cuota nueva entra sola al cálculo. Con el bloque abajo —como estaba—
  // el rango tenía que cerrarse en una fila fija, y ése es el rango que se fosiliza y deja plata
  // afuera sin avisar.
  const D = hdr + 1
  const E = `$E$${D}:$E`   // importe de la cuota
  const I = `$I$${D}:$I`   // fecha de pago (es una FECHA con formato "mmmm aa", no el texto del mes)
  const J = `$J$${D}:$J`   // DEBITADO: "SI" o vacío

  // "todavía no debitado" se mide con la columna J VACÍA, no con "<>SI": en un SUMIFS ese criterio
  // NO alcanza las celdas vacías, que son justamente las que interesan. En el SUMPRODUCT sí se usa
  // <>"SI" porque ahí la comparación es elemento a elemento (mismo criterio que CAJA).
  const noDeb = `(UPPER(${J})<>"SI")`
  const num = `IF(ISNUMBER(${E});${E};0)`
  // La próxima fecha de pago pendiente. NO se deduce del "vence" del resumen: ese dato envejece y el
  // día del débito cambió tres veces en tres meses (01/06, 06/07, 03/08 en el extracto).
  const prox = `MINIFS(${I};${J};"";${I};">="&TODAY())`
  const mes = (v, off = 0) => `${I};">="&EOMONTH(${v};${off - 1})+1;${I};"<"&EOMONTH(${v};${off})+1`

  // ── El extracto, dentro del Sheet. El pago REAL de la tarjeta no se pega: se suma de _BANCO_RAW ──
  // El importador ya clasifica cada movimiento, y "Pago de la tarjeta" es una de sus naturalezas.
  // Los importes del extracto son negativos (salen), por eso el signo delante del SUMIFS.
  const RF = "'_BANCO_RAW'!$A$4:$A$1000"
  const RC = "'_BANCO_RAW'!$C$4:$C$1000"
  const RN = "'_BANCO_RAW'!$F$4:$F$1000"
  const PAGO = `${RN};"Pago de la tarjeta"`
  const ultPago = `MAXIFS(${RF};${PAGO})`

  const filas = []
  /** Agrega una fila y devuelve su número 1-based, para que las fórmulas se refieran a ella por
   *  variable. Una fórmula que cita una fila fija se desalinea el día que la banda cambia de alto. */
  const push = (a = '', b = '', c = '') => { filas.push([a, b, c, ...Array(COLS - 3).fill('')]); return filas.length }

  push('Tarjeta de crédito')
  // TODA la trazabilidad, una sola vez y acá. En el cuerpo no va una sola línea de prosa: el dueño
  // borra siempre las columnas de aclaraciones, y tiene razón — compiten con los números.
  push(`${T.cuenta} · Santander · débito automático de la ${T.debitoAutomatico} · lo que declara el banco es del resumen al ${dmy}; lo demás se calcula del registro de abajo y del extracto en _BANCO_RAW`)
  push()

  // ── HERO: la línea de crédito. El disponible es el titular ──────────────────────────────────────
  push('LA LÍNEA — CUÁNTO SE PUEDE GASTAR HOY')
  push('Concepto', 'Monto', 'Cuándo')
  const fLim = push('Límite de compra', T.limite, 'acordado')
  const fDisp = push(total('Disponible para comprar'), T.disponible, frescura(corte, dmy))
  // El cupo de cuotas es OTRO cupo y es menor. Va pegado al titular, no en un bloque aparte: es la
  // corrección que evita comprometer una compra que la tarjeta no aprueba.
  push(sub('en cuotas el cupo es otro, y manda'), T.cuotas.disponible, 'de un límite aparte')
  push()

  // ── 1 · EL CALENDARIO. Tres tramos, no doce meses (CONDENSE) ────────────────────────────────────
  push(seccion(1, 'Cuánto vence y cuándo'))
  push('Concepto', 'Monto', 'Cuándo')
  const fProx = push(
    'Próximo débito',
    `=LET(px_;${prox};IF(px_=0;0;SUMIFS(${E};${J};"";${mes('px_')})))`,
    `=LET(px_;${prox};IF(px_=0;"—";TEXT(px_;"dd/mm/yyyy")))`,
  )
  const fTres = push(
    'Los tres meses siguientes',
    `=LET(px_;${prox};IF(px_=0;0;SUMIFS(${E};${J};"";${I};">="&EOMONTH(px_;0)+1;${I};"<"&EOMONTH(px_;3)+1)))`,
  )
  // El resto se calcula por diferencia contra el total, no con una tercera ventana de fechas: así los
  // tres tramos SUMAN EXACTAMENTE el comprometido, sin hueco ni superposición posible.
  const fResto = push('Más adelante', '', `=LET(ul_;MAXIFS(${I};${J};"");IF(ul_=0;"—";"hasta "&TEXT(ul_;"mmm yy")))`)
  const fComp = push(total('Comprometido y todavía sin debitar'), `=SUMPRODUCT(${noDeb}*${num})`)
  filas[fResto - 1][1] = `=B${fComp}-B${fProx}-B${fTres}`
  push()

  // ── 2 · MEDIO DE PAGO O FINANCIAMIENTO ──────────────────────────────────────────────────────────
  // La pregunta del dueño en una línea: del último débito real, ¿cuánto era cuota de una compra ya
  // financiada y cuánto consumo del mes? Lo primero es deuda; lo segundo, usar la tarjeta como
  // medio de pago. El pago sale del extracto y las cuotas del registro: dos fuentes distintas, que
  // es lo único que convierte la comparación en un control y no en una tautología.
  push(seccion(2, 'Cómo se usa — medio de pago o financiamiento'))
  push('Concepto', 'Monto', 'Cuándo')
  push(
    'Pagado al banco en lo que va del año',
    `=-SUMIFS(${RC};${PAGO};${RF};">="&DATE(YEAR(TODAY());1;1))`,
    `=LET(ul_;${ultPago};IF(ul_=0;"—";"último "&TEXT(ul_;"dd/mm")))`,
  )
  const fCuo = push(
    'Del último pago — cuotas ya cargadas acá',
    `=LET(ul_;${ultPago};IF(ul_=0;0;SUMIFS(${E};${mes('ul_')})))`,
    'financiamiento',
  )
  const fCons = push(
    'Del último pago — consumo del período',
    `=LET(ul_;${ultPago};IF(ul_=0;0;-SUMIFS(${RC};${PAGO};${RF};ul_)-B${fCuo}))`,
    'medio de pago',
  )
  const fRatio = push(total('Del último pago, financiado en cuotas'), `=IF(B${fCuo}+B${fCons}<=0;"";B${fCuo}/(B${fCuo}+B${fCons}))`)
  push()

  // ── 3 · CONTROL. Dos números y una diferencia: lo que antes ocupaba diez filas ───────────────────
  push(seccion(3, 'Control — la pestaña contra el resumen del banco'))
  push('Concepto', 'Monto', 'Cuándo')
  const fPest = push('Pendiente según esta pestaña', `=B${fComp}`)
  const fBanco = push('Pendiente según el resumen del banco', T.cuotasPendientes.proximoPeriodo + T.cuotasPendientes.restante, frescura(corte, dmy))
  const fDif = push(total('Diferencia'), `=B${fPest}-B${fBanco}`)
  filas[fDif - 1][2] = `=IF(B${fPest}=0;"sin cuotas cargadas";IF(ABS(B${fDif})<=${TOLERANCIA};"✓ concilia";"⚠ revisar la carga"))`
  push()

  push(seccion(4, 'El detalle — cada compra y cada cuota'))

  return { filas, fLim, fDisp, fComp, fRatio, fBanco, fDif }
}

/**
 * El semáforo de antigüedad de la foto del banco. PURA.
 *
 * Un número de origen pegado no puede envejecer en silencio: la celda de al lado dice de qué corte
 * es, y cuando el corte pasa de tres semanas deja de decir la fecha y pasa a pedir una foto nueva.
 */
export function frescura({ a, m, d }, dmy, dias = DIAS_FRESCURA) {
  return `=LET(dd_;TODAY()-DATE(${a};${m};${d});IF(dd_>${dias};"⚠ foto de hace "&dd_&" días";"resumen al ${dmy}"))`
}

/** Una fecha dd/m/aaaa como la muestra el Sheet en es-AR. */
const ES_FECHA = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/
const esImporte = (v) => /\d/.test(String(v ?? '')) && !/^[A-Za-zÁÉÍÓÚÑ]/.test(String(v ?? '').trim())

/**
 * NÚCLEO PURO: dónde arranca el registro, por el DATO y no por el rótulo.
 *
 * Una fila del registro tiene fecha de compra en A e importe en E. El rótulo "Fecha de Compra" lo
 * puede borrar una persona; el dato, no. Si no hay registro devuelve null y el script aborta: sin
 * ancla, ajustar el alto de la banda a ciegas deja la pestaña con dos bandas superpuestas.
 *
 * @param {any[][]} filas la grilla leída (valores, no fórmulas)
 * @returns {{primera:number, hdr:number}|null} filas 1-based
 */
export function ubicarRegistro(filas = []) {
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i] || []
    if (ES_FECHA.test(String(f[0] ?? '')) && esImporte(f[4])) return { primera: i + 1, hdr: i }
  }
  return null
}

/**
 * NÚCLEO PURO: dónde vive el bloque que dejó el generador anterior DEBAJO del registro.
 *
 * Se reconoce por lo que DICE, con o sin su número: la numeración es lo que más cambia cuando se
 * reordena una pestaña. Devuelve la primera fila 1-based a limpiar, o null si no hay nada.
 * Sólo se busca DESPUÉS del registro: un rótulo parecido dentro de la banda nueva no es residuo.
 */
export const ES_BLOQUE_VIEJO = /^\s*(?:\d+\s*·\s*)?(?:CONTROL\s*—\s*la tarjeta|LA TARJETA COMO DISPONIBILIDAD)/i
export function ubicarBloqueViejo(filas = [], desde = 0) {
  for (let i = desde; i < filas.length; i++) {
    if (ES_BLOQUE_VIEJO.test(String((filas[i] || [])[0] ?? ''))) return i + 1
  }
  return null
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((s) => s.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTANA}"`)
  const sheetId = hoja.sheetId

  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA. Con un `.catch(() => [])` un 429 se convierte en
  // "no hay registro" y el generador escribiría la banda encima de las cuotas del dueño. Falla
  // cerrado: la corrida siguiente lo hace bien.
  const previo = await google.readSheetValues(ID, `'${PESTANA}'!A1:L`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA}" (${e.message}). NO escribo: sin leer no sé dónde está tu registro.`)
  })
  const ubic = ubicarRegistro(previo)
  if (!ubic) {
    console.error(`ABORTA: no encuentro el registro en "${PESTANA}" (ninguna fila con fecha en A e importe en E).`)
    console.error('Sin ancla, ajustar el alto de la banda dejaría la pestaña con dos bandas superpuestas.')
    process.exit(1)
  }
  const bandaActual = ubic.hdr - 1
  const HDR = BANDA + 1
  const g = bandaFilas(HDR)

  if (DRY) {
    console.log(`(--dry) banda ${bandaActual} → ${BANDA} filas · encabezado del registro: ${ubic.hdr} → ${HDR}`)
    const viejo = ubicarBloqueViejo(previo, ubic.primera)
    console.log(viejo ? `  bloque viejo debajo del registro: desde la fila ${viejo} — se limpia` : '  sin bloque viejo debajo del registro')
    g.filas.forEach((f, i) => console.log(String(i + 1).padStart(3), f.filter(Boolean).slice(0, 3).join('  |  ')))
    return
  }

  // ── La firma y el respeto por lo que editó una persona, ANTES de tocar nada ──────────────────────
  if ((await firmaGuardia(google, ID, PESTANA, `'${PESTANA}'`)).editada) return

  // ═══ LA PUERTA DEL REDISEÑO AUTORIZADO (04/08) ═══
  //
  // `autoRespetarReescritura` compara los rótulos que este generador quiere escribir contra los que
  // hay en la pestaña, y si sobreviven pocos concluye —bien— que la reescribió una persona y no la
  // toca. Es la protección correcta para la corrida periódica.
  //
  // Pero cuando el dueño PIDE el rediseño, esa misma señal se da vuelta: un rediseño cambia casi
  // todos los rótulos a propósito, así que cuanto mejor es el rediseño, más seguro lo bloquea. Sin
  // una puerta, un rediseño ordenado por él es literalmente inaplicable.
  //
  // La puerta es `--rediseniar`, y vale por lo mismo que vale `ORQ_SHEETS_DESCONGELAR`: hay que
  // tipearla en el comando. Un timer no la escribe, el worker no la escribe, un agente que la use
  // deja dicho que la usó. No apaga la firma ni el candado —esos corren arriba y siguen mandando—:
  // apaga UNA comparación, la que por definición no puede pasar cuando el layout entero cambia.
  const REDISENAR = process.argv.includes('--rediseniar') || process.argv.includes('--rediseñar')
  if (REDISENAR) {
    console.log('  ⚠ --rediseniar: el dueño pidió reemplazar el layout, así que NO se compara contra los rótulos viejos.')
    console.log('    La firma y el candado siguen activos. Verificá el resultado con ver-pestana.mjs.')
  } else if ((await autoRespetarReescritura(ID, PESTANA, g.filas, previo)).reescrita) {
    console.log('    Si el rediseño es a pedido tuyo, volvé a correrlo con --rediseniar.')
    return
  }

  // Ajustar el alto de la banda. El registro se corre entero; CAJA lo lee por rango de columna
  // ($E$3:$E$400), así que correrlo no rompe la referencia mientras siga por debajo de la fila 3.
  if (bandaActual !== BANDA) {
    await google.spreadsheetBatchUpdate(ID, [bandaActual < BANDA
      ? { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: BANDA - bandaActual }, inheritFromBefore: false } }
      : { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: bandaActual - BANDA } } }])
  }
  // Una celda COMBINADA sólo acepta escritura en su ancla: en cualquier otra celda del merge la
  // escritura se ignora EN SILENCIO. Se desarma la banda antes de escribirla.
  await google.spreadsheetBatchUpdate(ID, [{
    unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: COLS } },
  }]).catch(() => {})

  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA, g.filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}")`)
  await google.batchUpdateValues(ID, [{ range: `${PESTANA}!A1`, values: grid }])
  await sellarFirma(google, ID, PESTANA, `'${PESTANA}'`)
  await guardarRegistro(ID, PESTANA, grid, ediciones, previo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  await limpiarBloqueViejo(google, sheetId, BANDA - bandaActual)
  await formatear(google, sheetId, grid, HDR)

  // ── VERIFICACIÓN: releer y probar que el control cierra ──────────────────────────────────────────
  const chk = await google.readSheetValues(ID, `'${PESTANA}'!A1:C${BANDA}`)
  const errores = (chk || []).flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  console.log(`✔ ${PESTANA}`)
  console.log(`  disponible ${chk?.[g.fDisp - 1]?.[1]} · comprometido ${chk?.[g.fComp - 1]?.[1]} · financiado ${chk?.[g.fRatio - 1]?.[1]}`)
  console.log(`  control: ${chk?.[g.fDif - 1]?.[1]} → ${chk?.[g.fDif - 1]?.[2]}`)
  console.log(`  ${errores} celda(s) en error`)
  if (errores) process.exitCode = 1
}

/**
 * Borra el bloque que dejó el generador anterior DEBAJO del registro.
 *
 * Sólo borra lo que RECONOCE: si su firma no aparece, no toca nada. Rehacer una pestaña con datos
 * borrando "de la fila X para abajo" ya destruyó trabajo del dueño en este archivo.
 */
async function limpiarBloqueViejo(google, sheetId, corrimiento) {
  const ahora = await google.readSheetValues(ID, `'${PESTANA}'!A1:L`).catch(() => null)
  if (!ahora) return
  const reg = ubicarRegistro(ahora)
  const desde = ubicarBloqueViejo(ahora, reg ? reg.primera : BANDA)
  if (!desde) return
  const hasta = ahora.length
  await google.clearValues(ID, `'${PESTANA}'!A${desde}:L${hasta}`)
  await google.spreadsheetBatchUpdate(ID, [{
    updateCells: { range: { sheetId, startRowIndex: desde - 1, endRowIndex: hasta, startColumnIndex: 0, endColumnIndex: COLS }, fields: 'userEnteredFormat' },
  }])
  console.log(`  ✓ bloque viejo limpiado: filas ${desde}–${hasta}${corrimiento ? ` (la banda corrió ${corrimiento} fila(s))` : ''}`)
}

/** El formato de la banda. Todo lo que la piel común no sabe: moneda, porcentaje y anchos. */
async function formatear(google, sheetId, grid, hdr) {
  const g = bandaFilas(hdr)
  const txt = (color, { bold = false, size = 10 } = {}) => ({ foregroundColor: color, bold, fontSize: size, fontFamily: 'Arial' })
  // Negativos entre paréntesis y el cero como raya: un "$0" se lee como un dato medido, y casi
  // siempre es "acá no hay nada".
  const money = { type: 'NUMBER', pattern: '$#,##0;($#,##0);"—"' }
  const rg = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    ...skinRequests({ sheetId, filas: grid, cols: COLS, congeladas: 2, titular: TITULAR }),
    // La banda desborda sobre las columnas vacías de la derecha en vez de cortarse: un título partido
    // al medio no es un rótulo, es un error de imprenta.
    { repeatCell: { range: rg(0, BANDA, 0, COLS), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: rg(1, 2, 0, COLS), cell: { userEnteredFormat: { textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(textFormat,wrapStrategy)' } },
    // ═══ LA COLUMNA B ES PLATA, DESDE EL PRIMER ENCABEZADO ═══
    // Sin esto vuelve el defecto que hacía ilegible el control anterior: los importes del banco
    // heredaban formato de FECHA y se leían "24/1/29279" en vez de "$10.000.000".
    { repeatCell: { range: rg(4, BANDA, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    // La única celda que no es plata en la columna B: el ratio de financiamiento.
    { repeatCell: { range: rg(g.fRatio - 1, g.fRatio, 1, 2), cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0,0%' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    // La columna C es contexto corto (una fecha, una fuente, un veredicto): TEXTO, gris y chica.
    // Si quedara en formato de número, "resumen al 22/07/2026" se convertiría en una fecha.
    { repeatCell: { range: rg(4, BANDA, 2, 3), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat,wrapStrategy)' } },
    // El titular: el rótulo en 12 y la cifra en 16, en el acento que ninguna otra fila usa.
    { repeatCell: { range: rg(TITULAR - 1, TITULAR, 0, 1), cell: { userEnteredFormat: { textFormat: txt(ACENTO, { bold: true, size: 12 }) } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rg(TITULAR - 1, TITULAR, 1, 2), cell: { userEnteredFormat: { numberFormat: money, horizontalAlignment: 'RIGHT', textFormat: txt(ACENTO, { bold: true, size: 16 }) } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)' } },
    // Anchos: la banda y el registro comparten las tres primeras columnas. A alcanza para el concepto
    // más largo, B para el importe, C para el contexto — sin dejar el registro desparramado.
    ...[[0, 300], [1, 140], [2, 150]].map(([i, px]) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    // El encabezado del registro, con la misma versalita apagada que los de la banda.
    { repeatCell: { range: rg(hdr - 1, hdr, 0, COLS), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' } },
    { updateBorders: { range: rg(hdr - 1, hdr, 0, COLS), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
    { repeatCell: { range: rg(hdr, hdr + 400, 0, 1), cell: { userEnteredFormat: { textFormat: txt(INK, { size: 10 }) } }, fields: 'userEnteredFormat.textFormat' } },
  ]
  await google.spreadsheetBatchUpdate(ID, reqs)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
