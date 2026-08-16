#!/usr/bin/env node
// `_CAJA_ANEXO` — EL DETALLE Y LAS CONCILIACIONES QUE SE FUERON DE CAJA.
//
// POR QUÉ EXISTE (05/08/2026). CAJA tenía 143 filas y el dueño la describió tres veces con la misma
// palabra: *"está pésima"*. Setenta de esas filas eran el anexo del ANALISTA. Esta pestaña las recibe
// enteras — ninguna verificación desaparece — y CAJA publica el veredicto de cada control en una
// línea. Ver lib/caja-anexo.mjs para el diseño y lib/caja-anexo-nombres.mjs para el contrato.
//
// ESTE PASO VA ANTES QUE `caja-pestana.mjs` EN EL AGENTE, y no es cosmético: CAJA cita los
// `ANEXO_*` por nombre, y un nombre que todavía no existe deja #NAME? en la pestaña que el dueño
// abre todos los días. En el arranque en frío el que muestra #NAME? por una corrida es el auxiliar,
// que es el lado barato para equivocarse.
//
//   node orquestador/scripts/caja-anexo-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL } from '../lib/formato-statement.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedida, avisoDeCola, rotulosPropios } from '../lib/cola-de-rango.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { publicar } from '../lib/rangos-nombrados.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
import {
  grillaAnexo, ANCHO_ANEXO, ANCHOS_ANEXO, PESTANA_ANEXO, SELLO_EFECTIVO, HISTORICO_EFECTIVO, claveDeRotulo,
  CARGA_TARDIA, FECHA_DEL_CONTEO,
} from '../lib/caja-anexo.mjs'
import {
  necesitaSello, dictamenEfectivo, avisoEfectivoImposible, avisoTechoNoVerificable,
  selloPorRenglonSembrable,
} from '../lib/caja-efectivo-fisico.mjs'
import { CONCEPTO, anclaDelConteo, esConteoLegible } from '../lib/caja-conteo-centinela.mjs'
import { medirCargaTardia } from '../lib/caja-carga-tardia-compras.mjs'
import { avisoCargaTardia } from '../lib/caja-carga-tardia.mjs'
import { instanteDelSello } from '../lib/caja-ancla-por-instante.mjs'
import { ALERTA } from '../lib/glifos.mjs'
import { DESDE_CAJA, CELDA_CAJA_MINIMA, ESPECIE_ANEXO } from '../lib/caja-anexo-nombres.mjs'
import { TIPO_CAMBIO } from '../lib/caja-disponibilidades.mjs'
import { conceptosFueraDelCalendario, lineasDeCaja, marcaDeLinea } from '../lib/calendario-egresos.mjs'
import { carteraDelArchivo, refsDelArchivo, SIN_FUENTE_EN_VENTANA } from '../lib/caja-refs.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')

const letra = (i) => String.fromCharCode(65 + i)

/**
 * Lo que una persona ya cargó en el anexo, rescatado ANTES de reescribir.
 *
 * Hoy es UNA sola fila —el "Dólar declarado por la empresa", opcional— y se busca POR SU RÓTULO, no
 * por número de fila: si mañana el bloque se mueve, el dato viaja con él. Es exactamente el defecto
 * que en CAJA dejó la caja física en $0 cuando el bloque del arqueo bajó cuatro filas.
 *
 * LA CLAVE SE NORMALIZA DE LOS DOS LADOS (`claveDeRotulo`). Acá vivía el defecto que dejó el sello sin
 * rescatar desde que existe: el rótulo del Sheet se recortaba y se comparaba contra una constante con
 * seis espacios de sangría, así que ninguna de las dos filas del sello coincidió nunca.
 */
export function rescatarAnexo(filas = []) {
  const cargado = new Map()
  // Los seis renglones del histórico llevan en D lo que valían al sellarse. Se rescatan por RÓTULO
  // igual que el sello total: sin esto, cada regeneración perdería el diagnóstico de quién se movió —
  // que es lo único que el 14/08 habría señalado a OFICINA en vez de a "algo por $15M".
  const historico = new Set(HISTORICO_EFECTIVO.map((l) => claveDeRotulo(l.rotulo)))
  for (const fila of filas) {
    const a = claveDeRotulo(fila?.[0]?.valor)
    const leer = (i) => { const c = fila?.[i]; return c?.formula ?? (c?.numero ?? c?.valor ?? '') }
    // El sello del conteo lo escribió una CORRIDA, no una persona, pero se rescata igual: si cada
    // regeneración lo perdiera, cada regeneración desharía el sello y el neto volvería a 0. Sólo se
    // acepta el NÚMERO — un texto ahí no es un sello, es basura que forzaría un resello (lado sano).
    const num = (i) => { const c = fila?.[i]; return typeof c?.numero === 'number' ? c.numero : '' }
    if (a === claveDeRotulo(SELLO_EFECTIVO.sello)) { cargado.set(a, { selloNeto: num(3), selloFecha: num(5) }); continue }
    if (a === claveDeRotulo(SELLO_EFECTIVO.estado)) { cargado.set(a, { selloValor: num(3) }); continue }
    // La medición de carga tardía la estampa la corrida en E y F. Sin rescatarla, cada regeneración la
    // borraría y el renglón quedaría vacío hasta que volviera a medirse — un control intermitente se
    // lee como un control en cero.
    if (a === claveDeRotulo(CARGA_TARDIA.rotulo)) { cargado.set(a, { importe: num(4), medidoEn: num(5) }); continue }
    // Las dos fechas de conteo, por la misma razón que la carga tardía: las estampa la corrida, y sin
    // rescatarlas cada regeneración las borraría — y con ellas la fecha de `CAJA!D7`, que es
    // exactamente el defecto que este renglón vino a cerrar.
    if (a === claveDeRotulo(FECHA_DEL_CONTEO.ars) || a === claveDeRotulo(FECHA_DEL_CONTEO.usd)) {
      cargado.set(a, { dia: num(5) }); continue
    }
    if (historico.has(a)) { cargado.set(a, { selloLinea: num(3) }); continue }
    if (a !== claveDeRotulo(TIPO_CAMBIO.declarado.nombre)) continue
    cargado.set(a, { saldo: leer(2), fecha: leer(5), origen: leer(6) })
  }
  return cargado
}

/**
 * EL ANCLA VUELVE A LA CELDA CUANDO SE PERDIÓ — la recuperación que antes no existía.
 *
 * El sello puede estar perfectamente vigente y la celda del ancla estar vacía: el rescate por rótulo
 * estuvo roto desde que existe, un 429 parte la pestaña al medio, un rediseño la corre. Y como el
 * re-estampado sólo ocurría al renovarse el sello, el ancla no volvía nunca: `IF(NOT(ISNUMBER(ancla)))`
 * dejaba el neto en 0 y la pestaña publicaba el conteo pelado, con el automático apagado en silencio.
 *
 * Ahora el ancla es un dato de Postgres y la celda es sólo su copia publicada: se repone. Se compara
 * con tolerancia de un segundo porque el serial viaja como flotante y una comparación exacta
 * reescribiría la celda en cada corrida.
 */
export async function reanclar(google, g, enLaPestana, ancla) {
  const UN_SEGUNDO = 1 / 86400
  if (Number.isFinite(enLaPestana) && Math.abs(enLaPestana - ancla) < UN_SEGUNDO) return
  await google.batchUpdateValues(ID, [{ range: `${PESTANA_ANEXO}!F${g.fSello}`, values: [[ancla]] }])
  console.log(`  🧷 ancla repuesta en F${g.fSello}: la celda ${Number.isFinite(enLaPestana) && enLaPestana ? 'decía otro instante' : 'estaba vacía'} y el centinela sí lo tiene`)
}

/**
 * Sella el conteo si el arqueo tipeado es más nuevo que la copia sellada.
 *
 * El sello NO se calcula en JS desde las fuentes —eso duplicaría la lógica de las fórmulas y las
 * dos versiones divergirían sin aviso—: se lee el histórico RECIÉN ESCRITO y ya evaluado por
 * Sheets, que es exactamente lo que el renglón del sello va a restar.
 *
 * ═══ EL ANCLA YA NO LA INVENTA ESTA CORRIDA (15/08/2026) ═══
 *
 * Estampaba `instanteDelSello()`, o sea AHORA. Con eso el ancla nacía y moría con esta pestaña: si la
 * celda se perdía no volvía, y el intervalo que se declaraba salía del sello del conteo ANTERIOR
 * —días atrás— impreso como HH:mm, así que una ventana de una semana se leía como una de dos horas.
 *
 * El instante lo decide el CENTINELA, que mira la celda en cada corrida y persiste en Postgres cuándo
 * vio cada valor por primera vez. Acá sólo se PUBLICA. Y si el centinela no puede afirmar un instante
 * —base caída, conteo ilegible— esto TIRA y no se estampa nada: la pestaña sigue publicando el conteo
 * tal cual, que es el lado seguro. El ancla gobierna CAJA_TOTAL_DISPONIBLE y con ella el saldo inicial
 * de los dos cash flow: inventarle un instante sería equivocar el año entero, no una celda.
 */
async function sellarConteo(google, g) {
  const uno = async (rango) => {
    const v = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })
    return Number(v?.[0]?.[0]) || 0
  }
  // SÓLO EL VALOR. La fecha tipeada ya no se lee: el dueño la borró a propósito ("no te guíes en eso
  // sino en lo q marca los timestamps del código") y mientras se comparaba, un 0 contra el 46241
  // sellado disparaba un resello que se habría tragado TODOS los movimientos adentro del conteo.
  const arqueo = { valor: await uno(DESDE_CAJA.arqueoArs) }
  const sellado = { valor: Number(g.filas[g.fEstado - 1]?.[3]) || 0 }
  const [f0, f1] = g.filasHistorico
  const enLaPestana = Number(g.filas[g.fSello - 1]?.[5])
  // El instante que ya estaba publicado se le ofrece al centinela para que lo ADOPTE si todavía no
  // tiene registro de este conteo. Sin eso, enchufar el centinela movería el ancla hasta hoy y se
  // tragaría adentro del conteo todo lo que se movió desde que se contó de verdad.
  const ancla = await anclaDelConteo(ID, CONCEPTO.arqueoArs, arqueo.valor, {
    sello: { serial: enLaPestana, valorSellado: sellado.valor },
  })
  const visto = ancla.serial
  const cuando = ancla.ventana
  if (!necesitaSello(arqueo, sellado)) {
    console.log('  🧷 sello vigente: el conteo no cambió')
    await reanclar(google, g, enLaPestana, visto)
    return sembrarSelloPorRenglon(google, g, sellado)
  }
  const hist = await google.readSheetValues(ID, `${PESTANA_ANEXO}!C${f0}:C${f1}`, { render: 'UNFORMATTED_VALUE' })
  const filas = (f1 - f0 + 1)
  const leidas = (hist ?? []).length
  if (leidas < filas) throw new Error(`leí ${leidas} de ${filas} renglones del histórico: sin el histórico completo el sello mentiría`)
  const rotos = hist.map((fila, i) => (typeof fila?.[0] === 'number' ? 0 : f0 + i)).filter(Boolean)
  if (rotos.length) throw new Error(`el histórico tiene celdas que no evalúan a número (fila(s) C${rotos.join(', C')}): un sello sobre un #ERROR congela basura`)
  const neto = Math.round(hist.reduce((s, fila) => s + fila[0], 0) * 100) / 100
  await google.batchUpdateValues(ID, [
    { range: `${PESTANA_ANEXO}!D${g.fSello}`, values: [[neto]] },
    // EL ANCLA. Antes se copiaba acá la FECHA que el dueño tipeaba, y por eso borrarla apagó el
    // mecanismo entero. Después fue el instante de ESTA corrida, y por eso perder la celda apagaba el
    // mecanismo otra vez. Ahora es el instante que el CENTINELA tiene persistido: acá sólo se publica,
    // y si la celda se pierde `reanclar` la repone en la corrida siguiente.
    { range: `${PESTANA_ANEXO}!F${g.fSello}`, values: [[visto]] },
    { range: `${PESTANA_ANEXO}!D${g.fEstado}`, values: [[arqueo.valor]] },
    // EL SELLO DE CADA RENGLÓN, DE LA MISMA LECTURA Y EN EL MISMO BATCH. El total de arriba es el que
    // resta; éstos son el diagnóstico —C menos D dice QUÉ canal se movió— y por venir del mismo `hist`
    // no pueden discrepar del total. Escritos en dos batches, una falla parcial dejaría un desglose
    // que no suma su propio sello, que es peor que no tenerlo.
    { range: `${PESTANA_ANEXO}!D${f0}:D${f1}`, values: hist.map((fila) => [fila[0]]) },
  ])
  console.log(`  🧷 conteo SELLADO: $${Math.round(arqueo.valor).toLocaleString('es-AR')} · histórico al conteo $${Math.round(neto).toLocaleString('es-AR')}`)
  console.log(`  🕒 ${cuando.texto}`)
}

/**
 * EL SELLO DE CADA RENGLÓN, CUANDO EL TOTAL YA ESTABA SELLADO Y ELLOS NO.
 *
 * El sello por renglón nace con este cambio, así que las pestañas ya selladas tienen el total y no
 * tienen el desglose — y sin desglose el aviso no puede nombrar al canal culpable hasta el próximo
 * conteo, que puede tardar semanas.
 *
 * SÓLO SE SIEMBRA CUANDO SE PUEDE PROBAR QUE ES EXACTO: si el histórico de hoy suma EXACTAMENTE el
 * total sellado, entonces no se movió nada desde el sello y el valor de hoy de cada renglón ES su
 * valor al sellar. Si difiere aunque sea un centavo, algo se movió, no se sabe cuánto le tocó a cada
 * uno, y repartirlo sería fabricar el dato: se deja vacío y el aviso lo dirá sin culpable.
 */
async function sembrarSelloPorRenglon(google, g) {
  const [f0, f1] = g.filasHistorico
  const total = Number(g.filas[g.fSello - 1]?.[3])
  if (!Number.isFinite(total) || total === 0) return
  const bloque = await google.readSheetValues(ID, `${PESTANA_ANEXO}!C${f0}:D${f1}`, { render: 'UNFORMATTED_VALUE' })
  if ((bloque ?? []).length < f1 - f0 + 1) return
  if (bloque.every((fila) => typeof fila?.[1] === 'number')) return
  const hoy = bloque.map((fila) => (typeof fila?.[0] === 'number' ? fila[0] : NaN))
  if (!selloPorRenglonSembrable(hoy, total)) {
    return console.log('  🧷 sin sello por renglón: el histórico ya se movió desde el sello y repartirlo sería inventarlo')
  }
  await google.batchUpdateValues(ID, [{ range: `${PESTANA_ANEXO}!D${f0}:D${f1}`, values: hoy.map((v) => [v]) }])
  console.log('  🧷 sello por renglón sembrado: el histórico suma exactamente el total sellado')
}

/**
 * EL CONTROL QUE MANDA, PASE LO QUE PASE CON EL SELLO: un cajón no puede tener menos de cero pesos.
 *
 * Corre SIEMPRE y DESPUÉS de sellar, sobre los números que quedaron escritos y ya evaluados por
 * Sheets — no sobre lo que este proceso cree haber escrito. El 14/08 la pestaña decía "✓ sellado al
 * conteo del 07/08", era verdad, y el efectivo daba −$15.051.781 igual: ningún control miraba el
 * resultado, sólo la vigencia del sello.
 *
 * NO TIRA: la fórmula ya degrada sola al conteo, así que la pestaña nunca publica el imposible. Lo que
 * falta es que se ENTERE alguien, y por eso el aviso sale por STDOUT — el runner del pipeline escanea
 * la salida estándar buscando la marca de alerta y la sube al resumen de la corrida. Un `console.warn`
 * va a stderr y no lo lee nadie, que es cómo estos avisos se venían perdiendo.
 */
async function controlarEfectivo(google, g) {
  const [f0] = g.filasHistorico
  const arq = await google.readSheetValues(ID, DESDE_CAJA.arqueoArs, { render: 'UNFORMATTED_VALUE' })
  const bloque = await google.readSheetValues(ID, `${PESTANA_ANEXO}!C${f0}:D${g.fSello}`, { render: 'UNFORMATTED_VALUE' })
  const num = (x) => (typeof x === 'number' ? x : Number(x) || 0)
  const neto = (bloque ?? []).reduce((s, fila) => s + num(fila?.[0]), 0)
  // EL DELTA POR RENGLÓN: C (hoy) menos D (al sellar). Sin sello de renglón todavía cargado el delta
  // es el renglón entero, así que sólo se nombra al culpable cuando su D es un número de verdad.
  const por = HISTORICO_EFECTIVO.map((l, i) => {
    const fila = bloque?.[i] ?? []
    return typeof fila?.[1] === 'number'
      ? { rotulo: l.rotulo, entra: l.entra, delta: num(fila[0]) - num(fila[1]) } : null
  }).filter(Boolean)
  // EL TECHO SALE DE LAS LÍNEAS QUE CARGAN EL CAJÓN, Y SÓLO SI ESTÁN TODAS. Con una sola sin sellar
  // el techo se calcularía sobre una entrada de menos y declararía imposible una caja sana; peor aún,
  // con la de cobros sin sellar el techo saldría enorme y no controlaría nada. Falta una → no hay
  // techo, y el dictamen lo dice en vez de callarse.
  const cargan = HISTORICO_EFECTIVO.filter((l) => l.entra).length
  const entradas = por.filter((p) => p.entra)
  const d = dictamenEfectivo({
    arqueo: num(arq?.[0]?.[0]),
    neto,
    entradas: entradas.length === cargan ? entradas.reduce((s, p) => s + p.delta, 0) : undefined,
  })
  const aviso = avisoEfectivoImposible(d, { por, marca: ALERTA }) ?? avisoTechoNoVerificable(d, ALERTA)
  if (aviso) console.log(`  ${aviso}`)
  else console.log(`  💵 efectivo en el cajón: $${Math.round(d.efectivo).toLocaleString('es-AR')} (el histórico se movió $${Math.round(d.movido).toLocaleString('es-AR')} desde el sello · techo $${Math.round(d.techo).toLocaleString('es-AR')})`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)

  // LOS CONCEPTOS QUE EL CALENDARIO NO PUEDE UBICAR EN EL TIEMPO, medidos contra el cuadro contable
  // COMPLETO y no contra las fuentes que el propio calendario suma. Un control validado contra su
  // propia información da cero por construcción, y ese cero ya se leyó como "está todo bien" mientras
  // faltaban $77M.
  const egresos = lineasDeCaja().filter(({ signo }) => signo === -1)
  const sinFuente = egresos.filter(({ linea }) => SIN_FUENTE_EN_VENTANA.includes(marcaDeLinea(linea)))
    .map(({ linea }) => linea.nombre)
  // Set y no concat pelado: conceptosFueraDelCalendario ya puede devolver los sin-fuente, y el
  // concat los listaba DOS VECES ("6 concepto(s)" donde hay 3 — dictamen 07/08).
  const conceptosCiegos = [...new Set(conceptosFueraDelCalendario(
    egresos.map(({ linea }) => linea.nombre).filter((n) => !sinFuente.includes(n))).concat(sinFuente))]

  let hoja = hojas.find((h) => h.title === PESTANA_ANEXO)
  const refs = await refsDelArchivo(google, ID, hojas)
  const cartera = await carteraDelArchivo()

  const previo = hoja
    ? await google.readSheetGrid(ID, `${PESTANA_ANEXO}!A1:G`).catch(() => ({ filas: [] }))
    : { filas: [] }
  const g = grillaAnexo({ refs, cartera, conceptosCiegos, cargado: rescatarAnexo(previo.filas ?? []) })
  console.log(`${PESTANA_ANEXO}: ${g.filas.length} filas · ${g.destinos.length} rangos con nombre`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // LA PESTAÑA SE CREA CON ALTO DE SOBRA. Un batch que apunta más allá del alto real ABORTA entero y
  // la pestaña queda con lo de la corrida anterior; el alto se ASEGURA, no se supone.
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTANA_ANEXO, gridProperties: { rowCount: g.filas.length + 40, columnCount: ANCHO_ANEXO, frozenRowCount: 2 } } },
    }])
    hoja = hallarPestana(await google.getSheetMeta(ID), PESTANA_ANEXO)
    console.log(`  ✚ creé la pestaña ${PESTANA_ANEXO}`)
  }
  const alto = Math.max(g.filas.length + 20, hoja.rows ?? 0)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' },
    }])
  }

  // LO QUE PUEDE FALLAR VA PRIMERO: borrar es irreversible y escribir puede fallar. Una fila más ancha
  // que la tabla hace que la API rechace el batch ENTERO, y eso ya dejó una pestaña vacía una vez.
  const malas = g.filas.map((f, i) => (f.length > ANCHO_ANEXO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que ${ANCHO_ANEXO} columnas: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

  await google.spreadsheetBatchUpdate(ID, [{ unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(g.filas.length, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: ANCHO_ANEXO } } }]).catch(() => {})
  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA: con `.catch(() => [])` un 429 se convierte en "el
  // dueño lo borró todo" y la Regla 0 escribe encima de lo suyo. Falla cerrado.
  const actual = await google.readSheetValues(ID, `${PESTANA_ANEXO}!A1:${letra(ANCHO_ANEXO - 1)}`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA_ANEXO}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`)
  })
  // LA COLA DE UNA CORRIDA ANTERIOR (13/08). El anexo es una LISTA: un cheque por fila, un endoso por
  // fila, una conciliación por fila. Cuando un cheque se cobra sale de la cartera y la grilla se
  // acorta — sin esto, la fila vieja queda publicada debajo del cuadro nuevo y el anexo muestra un
  // cheque en cartera que ya no existe, que es justo lo que este anexo existe para desmentir.
  // `conPrueba` porque es una pestaña de contenido: sólo se limpia la fila que se puede probar mía.
  const cola = conColaMedida(g.filas, actual, {
    ancho: ANCHO_ANEXO, conPrueba: true, mios: await rotulosPropios(ID, PESTANA_ANEXO),
  })
  if (avisoDeCola(cola, PESTANA_ANEXO)) console.log(avisoDeCola(cola, PESTANA_ANEXO))
  g.filas = cola.filas
  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA_ANEXO, g.filas, actual)
  g.filas = grid
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}")`)
  const escritura = await escribirPreservando(google, ID, PESTANA_ANEXO, g.filas, { respetar: false, anchoHoja: Math.max(ANCHO_ANEXO, hoja.cols ?? ANCHO_ANEXO) })
  // UNA PESTAÑA QUE NO SE ESCRIBIÓ NO CAMBIÓ DE FORMA: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar. Reapuntar los nombres a una grilla que no se escribió es lo que
  // el 03/08 dejó `CAJA_ARQUEO_ARS` en una celda vacía y borró $42,88M del total, con diff cero.
  if (escritura?.bloqueada || escritura?.editadaPorHumano) {
    console.log(`  🔒 "${PESTANA_ANEXO}" bajo tu control: no escribí, NO le toco el formato NI muevo sus rangos con nombre.`)
    return
  }

  // LOS NOMBRES, DESPUÉS DE ESCRIBIR — Y VERIFICADOS. `publicar` con `titulo` relee cada celda y
  // compara contra la ESPECIE prometida: un nombre publicado sobre una celda vacía o sobre un texto es
  // el defecto que dejó `ARCA_COMPRAS_TOTAL` devolviendo un número de comprobante.
  const destinos = g.destinos.map((d) => ({ ...d, especie: d.especie ?? ESPECIE_ANEXO[d.name] }))
  const { malApuntados, verificado } = await publicar(google, ID, hoja.sheetId, destinos, { titulo: PESTANA_ANEXO })
  console.log(`  🔖 ${destinos.length} rango(s) con nombre publicados${verificado ? ' y verificados' : ' (NO se pudieron releer: sin verificar)'}`)
  for (const m of malApuntados) {
    console.warn(`  ⚠ ${m.name} promete ${m.espera} y en ${letra(m.col - 1)}${m.fila} hay ${m.encontro} (${String(m.valor).slice(0, 30)})`)
  }

  // ═══ EL SELLO DEL CONTEO ═══
  //
  // Si el arqueo tipeado es más nuevo que el sello, esta corrida sella: lee el histórico recién
  // escrito YA EVALUADO y lo estampa como "lo que el conteo tiene adentro". Desde ese instante los
  // movimientos de efectivo corren desde el conteo, y hasta ese instante la fórmula muestra el
  // conteo tal cual (el sello viejo se autocancela). Ver el bloque en lib/caja-anexo.mjs.
  await sellarConteo(google, g).catch((e) => console.warn(`  ⚠ no pude sellar el conteo: ${e.message} — la pestaña muestra el conteo tal cual hasta la próxima corrida`))
  // Y DESPUÉS, EL CONTROL DE LO IMPOSIBLE — haya sellado o no, haya fallado el sello o no. Si ni
  // siquiera se puede leer para controlar, eso también se grita: un control mudo se lee como un
  // control en verde, y ése es el modo de falla que este bloque entero vino a cerrar.
  await controlarEfectivo(google, g).catch((e) => console.log(`  ${ALERTA} NO PUDE CONTROLAR EL EFECTIVO (${e.message}): nadie verificó que el cajón no dé negativo`))
  // Y LO QUE NINGUNA FÓRMULA PUEDE VER: lo que se cargó tarde sobre filas viejas. Va a la PESTAÑA y no
  // sólo al log, porque este archivo ya tiene escrito que el log no lo abre nadie.
  await publicarCargaTardia(google, g).catch((e) => console.log(`  ${ALERTA} NO PUDE MEDIR LA CARGA TARDÍA (${e.message}): un pago cargado sobre una fila vieja saldría del cajón sin que nada lo nombre`))
  // Y LA FECHA DE LOS DOS CONTEOS, que es la columna D de las filas de efectivo de CAJA. Va con su
  // propio catch: si falla, las celdas conservan la fecha rescatada de la corrida anterior.
  await publicarFechaDelConteo(google, g).catch((e) => console.log(`  ${ALERTA} NO PUDE FECHAR EL CONTEO (${e.message}): CAJA muestra la fecha de la corrida anterior`))

  // LA CAJA MÍNIMA NO VIVE EN NINGUNA DE LAS DOS PESTAÑAS: el nombre apunta a su FUENTE. Así CAJA y el
  // anexo la leen sin que ninguno la copie — un parámetro tiene una sola dirección en el archivo.
  const valores = hallarPestana(hojas, CELDA_CAJA_MINIMA.pestana)
  if (valores) {
    await publicar(google, ID, valores.sheetId,
      [{ name: DESDE_CAJA.minima, fila: CELDA_CAJA_MINIMA.fila, col: CELDA_CAJA_MINIMA.col }])
  } else {
    console.warn(`  ⚠ no encontré "${CELDA_CAJA_MINIMA.pestana}": ${DESDE_CAJA.minima} queda como estaba`)
  }

  await formatear(google, hoja.sheetId, g)
  const quedo = await google.readSheetValues(ID, `${PESTANA_ANEXO}!A1:${letra(ANCHO_ANEXO - 1)}${g.filas.length}`).catch(() => [])
  await guardarRegistro(ID, PESTANA_ANEXO, g.filas, ediciones, quedo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  console.log('QUEDÓ ESCRITO.')
}

/**
 * LA FECHA DE LOS DOS CONTEOS — la que CAJA publica en `D7` y `D8`, estampada acá.
 *
 * POR QUÉ ACÁ Y NO EN CAJA (16/08/2026). El dato no es de Sheets: es el instante en que el centinela vio
 * el conteo por primera vez, y vive en Postgres. CAJA lo cita por nombre y no lo recalcula, igual que
 * hace con el neto de efectivo — una segunda copia de esta fecha en la otra pestaña sería una segunda
 * definición de "cuándo se contó", que es justo lo que este renglón vino a terminar.
 *
 * SIN CONTEO SE ESCRIBE VACÍO, y es una decisión: una fecha sobre una celda de conteo en cero afirma un
 * arqueo que nunca ocurrió. Es el caso de los dólares hoy. Se escribe el vacío EXPLÍCITAMENTE en vez de
 * saltear la celda porque el día que el dueño borre el conteo, su fecha tiene que irse con él.
 *
 * NO TIRA hacia arriba: si esto falla, cada celda conserva la fecha de la corrida anterior (la grilla la
 * rescata), que sigue siendo verdad sobre ese conteo mientras el conteo no cambie.
 *
 * LÍMITE DECLARADO: para los pesos el instante se ADOPTA del sello ya publicado cuando el centinela
 * todavía no conoce ese conteo, así que enchufarlo no mueve la fecha hacia hoy. Para los dólares no hay
 * sello del que adoptar: un conteo en dólares que YA estuviera cargado antes de la primera observación
 * quedaría fechado el día de esa primera mirada. Hoy no puede pasar —`CAJA_ARQUEO_USD` vale 0— y el día
 * que el dueño cargue uno, la primera mirada llega dentro de las 2 h del timer.
 */
export async function publicarFechaDelConteo(google, g, { ancla = anclaDelConteo } = {}) {
  if (!g.fFechaArs || !g.fFechaUsd) return
  const uno = async (rango) => {
    const v = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' })
    return Number(v?.[0]?.[0]) || 0
  }
  const sello = {
    serial: Number(g.filas?.[g.fSello - 1]?.[5]),
    valorSellado: Number(g.filas?.[g.fEstado - 1]?.[3]) || 0,
  }
  // SIN CONTEO NO SE LE PREGUNTA AL CENTINELA. `anclaDelConteo` tira sobre un conteo ilegible —así se
  // diseñó, para que nadie ancle en cero— y esa excepción abortaría el estampado de la OTRA celda.
  const dia = async (concepto, valor, opciones) => {
    if (!esConteoLegible(valor)) return ''
    return (await ancla(ID, concepto, valor, opciones)).dia
  }
  const ars = await dia(CONCEPTO.arqueoArs, await uno(DESDE_CAJA.arqueoArs), { sello })
  const usd = await dia(CONCEPTO.arqueoUsd, await uno(DESDE_CAJA.arqueoUsd), {})
  await google.batchUpdateValues(ID, [
    { range: `${PESTANA_ANEXO}!F${g.fFechaArs}`, values: [[ars]] },
    { range: `${PESTANA_ANEXO}!F${g.fFechaUsd}`, values: [[usd]] },
  ])
  const texto = (s) => (s === '' ? 'sin conteo cargado: CAJA no publica fecha' : `serial ${s}`)
  console.log(`  📅 fecha del conteo · pesos: ${texto(ars)} · dólares: ${texto(usd)}`)
}

/**
 * LO QUE SE CARGÓ TARDE SOBRE FILAS VIEJAS, PUBLICADO EN LA PESTAÑA.
 *
 * E lleva el importe y F el INSTANTE de la medición. Los dos son números pegados y los dos son de la
 * misma especie que el sello: ninguna fórmula de Sheets puede calcularlos, porque dependen de cuándo
 * cambió una celda y el archivo no lo sabe. La fecha al lado no es decoración — sin ella, una medición
 * de hace tres días se lee como si fuera de ahora, que es la forma exacta en que un cuadro miente
 * despacio.
 *
 * NO TIRA hacia arriba: la caja no depende de esto. Si falla, el renglón conserva la última medición
 * con SU fecha, que sigue siendo verdad sobre ese momento.
 */
async function publicarCargaTardia(google, g) {
  if (!g.fCargaTardia) return
  const arq = await google.readSheetValues(ID, DESDE_CAJA.arqueoArs, { render: 'UNFORMATTED_VALUE' })
  const valor = Number(arq?.[0]?.[0]) || 0
  const ancla = await anclaDelConteo(ID, CONCEPTO.arqueoArs, valor,
    { sello: { serial: Number(g.filas[g.fSello - 1]?.[5]), valorSellado: Number(g.filas[g.fEstado - 1]?.[3]) || 0 } })
  const r = await medirCargaTardia(google, ID, ancla)
  await google.batchUpdateValues(ID, [
    { range: `${PESTANA_ANEXO}!E${g.fCargaTardia}`, values: [[r.sobreestimado]] },
    { range: `${PESTANA_ANEXO}!F${g.fCargaTardia}`, values: [[instanteDelSello()]] },
  ])
  const aviso = avisoCargaTardia(r, { marca: ALERTA, fuente: 'Compras' })
  // EL GLIFO VA EN LA LÍNEA DEL `console.log`, no en una continuación: el guardián de glifos juzga
  // línea por línea y un literal suelto con un emoji parece un texto de celda. Ver glifos-generadores.
  if (aviso) return console.log(`  ${aviso}`)
  console.log(`  💵 sin carga tardía sobre filas viejas: ${r.cubiertas} celda(s) probadas desde antes del conteo`
    + (r.sembrando ? ` · ${r.sembrando} sin comparar todavía` : ''))
}

/**
 * EL FORMATO DEL ANEXO — el mismo lenguaje que CAJA, para que las dos se lean igual.
 *
 * SE RESETEA TODO AL ESTÁNDAR Y RECIÉN DESPUÉS SE PINTAN LAS EXCEPCIONES. Un formateador que sólo
 * APLICA deja cada corrida encima de la anterior, y así llegó CAJA a tener dos tipografías, seis
 * tamaños y nueve fondos.
 */
export async function formatear(google, sheetId, g) {
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO_ANEXO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [
    { unmergeCells: { range: r(0, n) } },
    E.reset(sheetId, Math.max(n + 20, 120), ANCHO_ANEXO),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } },
  ]
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })
  const borde = (rg) => req.push({ updateBorders: { range: rg, bottom: { style: 'SOLID', color: HAIR } } })

  // Los grupos viejos se borran ANTES: la API los apila y el margen izquierdo termina con una escalera.
  const grupos = (await google.getRowGroups(ID).catch(() => [])).find((s) => s.sheetId === sheetId)?.grupos ?? []
  for (const gr of grupos) req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: gr.startIndex, endIndex: gr.endIndex } } })

  // El "$" es del TOTAL, no de cada celda: un símbolo repetido en cien filas no distingue nada.
  for (const c of [2, 3, 4]) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  for (const f of g.totales ?? []) {
    for (const c of [2, 3, 4]) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  fmt(r(0, n, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 5, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  // La última columna es PROSA: texto, gris, con ajuste. Nunca plata.
  fmt(r(0, n, ANCHO_ANEXO - 1, ANCHO_ANEXO), 'userEnteredFormat',
    { ...E.nota(), numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' })
  // …SALVO LAS CUATRO CELDAS QUE CUENTAN, que el bloque declara (`fCuantos`). Un contador dibujado
  // como prosa sale crudo y pegado a la izquierda: "1234" en vez de "1.234", y el cero se lee como un
  // dato en vez de como "no hay nada". Va DESPUÉS de la prosa, o la prosa se lo lleva puesto — los
  // `repeatCell` se aplican en orden y gana el último. Ver scripts/pestanas-formato-final.test.mjs.
  //
  // SÓLO EL FORMATO DE NÚMERO, NO LA ALINEACIÓN: el encabezado "Cuántos" lo pinta a la izquierda la
  // regla de encabezados de más abajo, y cuatro números a la derecha debajo de un título a la
  // izquierda se leen como dos columnas distintas. La corrección es que el número sea un número.
  if (g.fCuantos) {
    const [q0, q1] = g.fCuantos
    fmt(r(q0 - 1, q1, ANCHO_ANEXO - 1, ANCHO_ANEXO), 'userEnteredFormat.numberFormat',
      { numberFormat: { type: 'NUMBER', pattern: '#,##0;-#,##0;"—"' } })
  }
  // UNA TASA NO ES PLATA: con formato de moneda, el 55% anual se dibuja "$1".
  if (g.fTasa) fmt(r(g.fTasa - 1, g.fTasa, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.00%' } })
  // LOS DÍAS SON DÍAS: "2 días" con formato moneda se dibuja "$2".
  if (g.fDias) fmt(r(g.fDias - 1, g.fDias, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0" días";;"—"' } })
  // EL EJE DEL AÑO SE LEE "ene", NO "01/01/2026". Son fechas de verdad —el gráfico del punto de
  // equilibrio necesita un eje temporal ordenado, y un texto "ene" ordena alfabéticamente—, así que lo
  // que cambia es cómo se MUESTRAN: doce fechas completas en el eje de abajo se dibujan rotadas y se
  // pisan entre ellas. Va después del formato de la columna F entera, que si no lo pisa.
  const eq = g.series
  if (eq?.fEq0) {
    fmt(r(eq.fEq0 - 1, eq.fEq1, 5, 6), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'DATE', pattern: 'mmm' } })
  }
  // La cotización es una relación, no plata.
  if (g.fTC) fmt(r(g.fTC - 3, g.fTC, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } })
  // LA CELDA DE CARGA EN AMARILLO: lo que una persona escribe tiene que verse distinto de lo que el
  // sistema calcula, o nadie sabe qué puede tocar sin romper nada.
  if (g.fDec) {
    for (const c of [2, 5]) fmt(r(g.fDec - 1, g.fDec, c, c + 1), 'userEnteredFormat.backgroundColor', { backgroundColor: { red: 1, green: 0.98, blue: 0.86 } })
  }
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })

  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    if (/^A\d+ · /.test(t)) {
      fmt(r(i, i + 1), 'userEnteredFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    // Un ENCABEZADO es texto, nunca plata ni fecha: se le devuelve el formato de número junto con la
    // tipografía, o gana el que se aplicó a la columna entera más arriba.
    if (/^(Concepto|Línea|Valor|Qué|Horizonte)/.test(t)) {
      fmt(r(i, i + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
      fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
        { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    if (/^⇒/.test(t)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
  })

  // NINGUNA FILA OCULTA, NUNCA. Una fila que existe y no se ve es peor que una fila fea: no se puede
  // auditar lo que no se sabe que está.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(n + 40, 140) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  // NI UNA NOTA, EN NINGUNA COLUMNA. Una nota vive FUERA del valor de la celda: reescribir la pestaña
  // no la toca, así que la única forma de que un borrado dure es borrarlas explícitamente.
  req.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: n, startColumnIndex: 0, endColumnIndex: ANCHO_ANEXO },
      rows: Array.from({ length: n }, () => ({ values: Array.from({ length: ANCHO_ANEXO }, () => ({ note: '' })) })),
      fields: 'note',
    },
  })
  ANCHOS_ANEXO.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  const { requests: rTxt } = requestsTextoPorContenido(sheetId, g.filas || [])
  req.push(...rTxt)
  await google.spreadsheetBatchUpdate(ID, req)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
