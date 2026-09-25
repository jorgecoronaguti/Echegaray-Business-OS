#!/usr/bin/env node
// EL AGENTE QUE MANTIENE EL FLUJO DE CAJA AL DÍA, SOLO.
//
// "Regla de oro: todo debe actualizarse de manera automática, crear agentes para esto".
//
// Las pestañas del Flujo de Caja se calculan a partir de Compras, de Cobranzas y de los comprobantes
// de ARCA. Los datos ya se sincronizan solos (hay timers de compras, cobranzas, ARCA y avance), pero
// las pestañas DERIVADAS no se rehacían nunca: quedaban con la forma que tenían el día que las
// escribí. Cuando el dueño agregaba filas a Compras, los rangos se corrían y el cuadro mentía. Eso
// es exactamente lo que pasó hoy con Estructura ($33,2M en cero) y con la nómina duplicada.
//
// Este agente corre después de los syncs y rehace TODO en el orden en que depende:
//   1. rubro-caja-sheet   — la columna que define QUÉ es cada gasto. Todo lo demás cuelga de acá.
//   2. cash-flow-rehacer  — las dos pestañas de cash flow, con el mismo juego de líneas.
//   3. materiales-pestana — familias de material (y la columna de familia en Compras).
//   4. estructura-pestana — el cuadro de estructura con su proyección.
//   5. impuestos-pestana  — IVA real de ARCA con saldo arrastrado.
//   6. cargas-sociales-pestana — la pestaña Cargas Sociales entera (un solo dueño).
//   7. cobranzas-control  — el detector de cobros duplicados.
//   8. cheques-cobertura   — cuánto de los cheques y la tarjeta todavía no tiene factura en Compras.
//
// POR QUÉ ES 0 API. No pasa por el modelo: son scripts determinísticos. Un agente que razona para
// rehacer la misma tabla todos los días es plata tirada y además puede improvisar distinto cada vez.
// El razonamiento ya está en el código y en los tests; acá sólo hay que ejecutarlo.
//
// SI UNO FALLA, SIGUEN LOS DEMÁS. Un error en impuestos no tiene por qué dejar el cash flow viejo.
// Al final informa qué se rehizo y qué no, y sale con código != 0 si algo falló — así el timer lo
// registra y no se pierde en silencio.
//
// ANTES DE TODO, LA GUARDIA. Si algún generador de Sheets está atrasado respecto de una rama sin
// resolver, esto no arranca: sale con 2 y no ejecuta un solo paso (ver lib/guardia-generadores.mjs).
//
//   node orquestador/scripts/flujo-caja-rehacer-todo.mjs [--dry]
//   ORQ_PIPELINE_SIN_GUARDIA="motivo con sustancia" node …   ← saltea la guardia y lo deja en el log
//
// Códigos de salida: 0 todo bien · 1 algún paso falló (los demás corrieron) · 2 la guardia abortó o un
// FRENO detuvo la corrida (ver FRENOS en lib/flujo-caja-pasos.mjs).

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { esReporte, frenaElPipeline, pasosDelGrupo } from '../lib/flujo-caja-pasos.mjs'
import { guardiaDeGeneradores } from '../lib/guardia-generadores.mjs'
import { FILA, ROTULO_HOY, colTotal, colsDelSiguiente } from '../lib/cash-flow-matriz.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MARCA_ALERTA } from '../lib/glifos.mjs'
import { ANCHOS } from '../lib/cash-flow-piel-matriz.mjs'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')
/** El reloj arranca con el proceso: todo lo de antes del primer paso gasta el mismo techo de systemd. */
const T0 = Date.now()

// La lista de pasos vive en la lib: el auditor de reglas de oro necesita leerla sin ejecutar
// el agente entero (ver flujo-caja-pasos.mjs).

/**
 * NÚCLEO PURO: POR QUÉ FALLÓ UN PASO — la línea que explica, no la primera que se imprimió.
 *
 * ═══ EL DEFECTO (14/08/2026) ═══
 *
 * Esto decía `stderr.split('\n')[0]`, y la primera línea de stderr es la primera que el script mandó
 * a `console.warn`, que casi nunca es la causa. Medido sobre las corridas del 13 y el 14/08:
 * `proveedores-materiales-pestana.mjs` figuró FALLADO doce veces seguidas con esta explicación —
 *
 *     ⚠ VENTAS (no es de esta pestaña): 6 factura(s) emitidas que Cobranzas no tiene, $129.499.724.
 *
 * — que es un aviso informativo sobre OTRA pestaña, impreso ochocientas líneas antes de que el paso
 * decidiera su código de salida. Durante días el log señaló una causa falsa con toda la autoridad de
 * un `✗`, y el motivo real —el que sí había que arreglar— no aparecía en ninguna parte.
 *
 * ═══ LA REGLA ═══
 *
 * Una causa se busca DE ATRÁS PARA ADELANTE: lo último que un proceso alcanza a decir antes de morir
 * es lo más cercano a por qué murió. Y se saltean las líneas que ya se sabe que NO son causas: las
 * marcadas con el glifo de aviso, que el propio pipeline recolecta aparte para el resumen.
 *
 * SI NO QUEDA NINGUNA LÍNEA SIN MARCA, SE DICE ESO, no se cae a la primera. "Salió con código N y sólo
 * imprimió avisos" es una descripción honesta que manda a leer el log entero; una advertencia
 * ajena presentada como causa manda a arreglar lo que no está roto.
 *
 * ═══ LA CAUSA NO SIEMPRE ESTÁ EN stderr, Y ÉSTE ES EL CASO (14/08/2026) ═══
 *
 * Con la regla de arriba puesta, `proveedores-materiales-pestana.mjs` siguió figurando FALLADO con
 * otra causa falsa —
 *
 *     0001-00000214  →  Cobranzas fila 38
 *
 * — que es una línea de DETALLE de un aviso informativo sobre facturas emitidas numeradas sin su
 * punto de venta. Ni siquiera es un problema: es trabajo de carga de OTRA pestaña. Sobrevivió al
 * filtro porque su titular lleva `○` y no `⚠`, así que la línea no está marcada… y porque el motivo
 * REAL —`⚠ 22 celdas en error: NO retiro la pestaña vieja`— se imprime por `console.log`, o sea por
 * STDOUT, que esta función no miraba.
 *
 * Un paso decide su código de salida donde imprime su veredicto, y en este repo los veredictos van a
 * stdout: `⚠ N celdas en error`, `⛔ no escribo`, `⏭ salteada`. Buscar la causa sólo en stderr es
 * buscarla donde no está. Se miran los dos, en orden de cercanía a la muerte: primero lo último de
 * stderr que no sea un aviso ni el detalle de un aviso, y si eso no aparece, lo último de stdout que
 * traiga una marca de veredicto. Y si tampoco, se dice que no se sabe — que es la respuesta honesta y
 * la que manda a leer el log entero, en vez de mandar a arreglar lo que no está roto.
 *
 * @param {{stderr?:string, stdout?:string, message?:string, code?:number}} e el error de execFile
 * @returns {string} una línea, ya recortada
 */
/**
 * Las marcas con las que un paso de este repo dice "acá está por qué salgo distinto de cero".
 * `⛔` no escribí · `⏭` me saltearon · `✗` un control dio rojo. `⚠` NO está: es la marca de aviso que
 * el pipeline recolecta aparte, y confundirla con un veredicto es el defecto original.
 */
const MARCA_VEREDICTO = /[⛔⏭✗]/
/** Una línea de DETALLE cuelga de su titular: empieza con un glifo de viñeta o viene sangrada. */
const ES_DETALLE = (cruda) => /^\s{4,}/.test(cruda) || /^\s*[○·•]/.test(cruda)

// ═══ LO QUE SE RESPETÓ TIENE QUE VERSE AL CIERRE, NO SÓLO ADENTRO DE UN PASO (03/09) ═══
//
// El dueño: *"lo único que requiero siempre es que mis ediciones en el archivo sean las que manden y
// siempre se respeten"*. Que se respeten lo garantiza la guarda; que él SE ENTERE, esto. Cada paso
// imprime su «✋ N celda(s) tuya(s) respetada(s) en <pestaña>: A1, B7, …», y el pipeline las junta —
// un aviso adentro del log de un paso, entre cuarenta y siete pasos, no lo lee nadie.

/** Reconoce la línea que imprime la guarda por celda. Se parsea el stdout porque cada paso es un proceso hijo. */
const RESPETADAS = /✋\s*(\d+)\s*celda\(s\) tuya\(s\) respetada\(s\) en (.+?):\s*(.*)$/

/** NÚCLEO PURO: suma las celdas respetadas que declaró un paso, por pestaña. */
export function sumarRespetadas(stdout, acc = new Map()) {
  for (const linea of String(stdout ?? '').split('\n')) {
    const m = RESPETADAS.exec(linea.trim())
    if (!m) continue
    const tab = m[2]
    const previo = acc.get(tab) ?? { celdas: 0, muestra: [] }
    previo.celdas += Number(m[1])
    for (const c of m[3].split(',').map((x) => x.trim()).filter((x) => x && !/^…/.test(x) && !/más$/.test(x))) {
      if (previo.muestra.length < 12 && !previo.muestra.includes(c)) previo.muestra.push(c)
    }
    acc.set(tab, previo)
  }
  return acc
}

/**
 * ¿La falla de este paso detiene la corrida? PURA. `error` es el de execFile: su `code` es la salida del
 * proceso hijo. La regla por script vive en `FRENOS` (lib/flujo-caja-pasos.mjs).
 * @returns {{frena:boolean, codigo:number|null, faltan:number}}
 */
export function decisionDeFreno(pasos, indice, error) {
  const codigo = Number.isInteger(error?.code) ? error.code : null
  const script = pasos[indice]?.[0]
  return { frena: frenaElPipeline(script, codigo), codigo, faltan: Math.max(0, pasos.length - indice - 1) }
}

/**
 * EL RECORRIDO DE LOS PASOS, CON EL CORTE. Se sacó de `main()` el 17/09/2026: el `break` que detiene la
 * corrida no tenía ningún test y borrarlo no daba rojo. Todo lo que toca el mundo (ejecutar, loguear,
 * acumular) entra inyectado; lo que se prueba es QUÉ PASOS SE LLEGAN A CORRER.
 *
 * @param {Array<[string, string, string[]?, string[]?]>} pasos
 * @param {{correr:Function, alFallar:Function, bloqueado?:Function, alSaltear?:Function, dry?:boolean, log?:Function}} o
 *   `alFallar` devuelve el motivo del freno (texto) cuando la decisión fue frenar.
 * @returns {Promise<{corridos:string[], frenado:null|{script:string, motivo:string, faltan:number}}>}
 */
export async function recorrerPasos(pasos, { correr, alFallar, bloqueado = () => false, alSaltear = () => {}, dry = false, log = console.log, quedaMs = () => Infinity, techoPasoMs = TECHO_PASO_MS }) {
  const corridos = []
  let frenado = null
  let sinTiempo = []
  for (let n = 0; n < pasos.length; n++) {
    const [script, que, pestañas = [], args = []] = pasos[n]
    if (bloqueado(pestañas)) { alSaltear({ script, pestañas }); continue }
    if (dry) { log(`(dry) ${script.padEnd(26)} ${que}`); continue }
    // ═══ UN PASO QUE NO ALCANZA A TERMINAR NO EMPIEZA (25/09/2026) ═══
    // Si lo que queda del presupuesto no cubre el techo del paso, systemd lo mataría A MITAD DE
    // ESCRITURA —media pestaña nueva, media vieja, sin error en ningún log—. Un paso salteado se ve y
    // se rehace en la corrida siguiente; una escritura cortada no se ve. El tiempo sólo baja: si éste
    // no entra, no entra ninguno de los de abajo, y se dicen todos por su nombre.
    if (quedaMs() < techoPasoMs) {
      sinTiempo = pasos.slice(n).filter(([, , p = []]) => !bloqueado(p)).map(([s]) => s)
      break
    }
    corridos.push(script)
    try {
      await correr({ script, que, pestañas, args })
    } catch (error) {
      const freno = decisionDeFreno(pasos, n, error)
      const motivo = await alFallar({ script, que, error, freno })
      if (freno.frena) {
        frenado = { script, motivo: motivo ?? `salida ${freno.codigo}`, faltan: freno.faltan }
        break
      }
    }
  }
  return { corridos, frenado, sinTiempo }
}

/**
 * El techo de UN paso: `execFile` lo corta a los 5 minutos. Es también lo mínimo que tiene que quedar
 * del presupuesto para que un paso empiece (ver `recorrerPasos`).
 */
export const TECHO_PASO_MS = 5 * 60 * 1000

/**
 * NÚCLEO PURO: cuánto le queda a la corrida. `presupuestoS` sale de ORQ_PIPELINE_PRESUPUESTO_S; 0 o
 * vacío = sin límite (una corrida a mano no tiene techo de systemd). Se mide desde que ARRANCÓ el
 * proceso, no desde el primer paso: la guardia, la firma y el snapshot también gastan el mismo techo
 * (el 25/09 a las 08:50 el snapshot solo se llevó 5 minutos).
 */
export function presupuesto(presupuestoS, t0 = Date.now(), ahora = () => Date.now()) {
  const s = Number(presupuestoS)
  if (!Number.isFinite(s) || s <= 0) return () => Infinity
  const fin = t0 + s * 1000
  return () => fin - ahora()
}

/** Cuántas lecturas del pre-paso (snapshot y firmas) van a la vez. */
export const LECTURAS_A_LA_VEZ = 8

/**
 * `fn` sobre cada elemento, con a lo sumo `n` en vuelo; el resultado respeta el orden de `items`.
 * Un `fn` que lanza deja su lugar en `undefined` y no frena a los demás (el pre-paso nunca frena).
 */
export async function enParalelo(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  const obrero = async () => {
    while (i < items.length) {
      const k = i++
      try { out[k] = await fn(items[k], k) } catch { out[k] = undefined }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, obrero))
  return out
}

/** Lee `--grupo=datos|vistas` (o `--grupo datos`). PURA. */
export function grupoDeArgs(argv = []) {
  const i = argv.findIndex((a) => a === '--grupo' || a.startsWith('--grupo='))
  if (i < 0) return null
  return argv[i].includes('=') ? argv[i].slice('--grupo='.length) : (argv[i + 1] ?? '')
}

/**
 * ═══ LAS COLUMNAS DE PERÍODO MIDEN LO QUE DICE EL GENERADOR (17/09/2026) ═══
 * El control exigía 96px tipeado y el generador (`ANCHOS.tiempo` en cash-flow-piel-matriz) escribe 95:
 * en cada corrida publicaba 65 columnas «tocadas por alguien» que nadie tocó. Un control que contradice
 * al generador no detecta nada — sólo enseña a ignorar el aviso. PURA.
 * @returns {Array<{i:number, px:number}>} índice base 0 de la columna y su ancho
 */
export function anchosRaros(anchos = [], hasta, esperado = ANCHOS.tiempo) {
  return anchos.slice(1, hasta).map((px, k) => ({ i: k + 1, px })).filter((c) => c.px !== esperado)
}

/**
 * ═══ EL ENLACE DEL ATAJO, DONDE SHEETS LO GUARDA (17/09/2026) ═══
 * Un enlace que cubre la celda entera Sheets lo pliega en `userEnteredFormat.textFormat.link` y lo expone
 * en `hyperlink`, con `textFormatRuns` VACÍO (medido y escrito en cash-flow-piel-matriz.mjs el 08/09).
 * Este verificador leía sólo `textFormatRuns` y decía «la celda no tiene enlace» sobre un atajo sano. PURA.
 */
export function uriDelAtajo(celda = {}) {
  return String(celda?.hyperlink
    ?? celda?.userEnteredFormat?.textFormat?.link?.uri
    ?? (celda?.textFormatRuns ?? []).map((r) => r?.format?.link?.uri).find(Boolean)
    ?? '')
}

/** El párrafo de cierre. Devuelve [] cuando no se respetó nada: no se dice lo que no pasó.
 *  Sólo va a `console.log` (línea de abajo, en el llamador) — nunca a una celda del Sheet. El
 *  nombre `L` no es cosmético: es la convención que ya usa `lib/alias-pendientes.mjs` para que el
 *  guardián de glifos (`glifos-generadores.test.mjs`) reconozca un párrafo de log y no un valor de
 *  celda sin necesitar una excepción de archivo entero. */
export function informeRespetadas(acc = new Map()) {
  if (!acc.size) return []
  const total = [...acc.values()].reduce((n, v) => n + v.celdas, 0)
  const L = []
  L.push(`\n✋ ${total} celda(s) tuya(s) respetada(s) en esta corrida — no las pisé:`)
  for (const [tab, v] of acc) L.push(`  · ${tab}: ${v.celdas} (${v.muestra.join(', ')}${v.celdas > v.muestra.length ? ', …' : ''})`)
  return L
}

export function motivoDeFalla(e = {}) {
  const crudas = String(e?.stderr ?? '').split('\n').filter((l) => l.trim())
  const lineas = crudas.map((l) => l.trim())
  const causa = [...crudas].reverse().find((l) => !MARCA_ALERTA.test(l) && !ES_DETALLE(l))
  if (causa) return causa.trim().slice(0, 220)
  const veredicto = String(e?.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    .reverse().find((l) => MARCA_VEREDICTO.test(l) || MARCA_ALERTA.test(l))
  if (veredicto) return veredicto.slice(0, 220)
  if (lineas.length) return `salió con código ${e?.code ?? '?'} y en stderr sólo hay avisos (${lineas.length}): la causa está en el log del paso`.slice(0, 220)
  return String(e?.message ?? 'sin stderr').split('\n')[0].slice(0, 220)
}

/**
 * Los dos cash flow son pestañas COMPARTIDAS: el cuadro lo arma un script y el bloque de cheques lo
 * escribe otro. Ese segundo script ensanchaba la columna F a 460px para su columna de explicación, y
 * arriba la F es el mes de mayo — el cuadro entero quedaba descuadrado y ningún control lo veía,
 * porque los valores estaban bien. Sólo el ancho estaba mal.
 *
 * Un defecto que sólo se ve mirando la pantalla vuelve. Por eso se mide.
 */
async function verificarPresentacion(bloqueadas = new Set()) {
  const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
  const hojas = await google.getSheetMeta(ID)
  let hubo = false
  // EL CANDADO TAMBIÉN ACÁ (24/07). Esta verificación ESCRIBE (usa A200 como celda de apunte para
  // probar el atajo "IR A HOY"). Si el dueño tomó una pestaña, NO se la toca ni para verificarla:
  // saltó justo el candado y, sobre una pestaña que él restauró más corta, el A200 se salía de la
  // grilla y tiraba la corrida entera. La pestaña del dueño es suya: no se lee ni se escribe.
  // LAS COLUMNAS DE PERÍODO SALEN DE LA GEOMETRÍA DEL GENERADOR (24/09/2026). Eran 13 y 54 tipeados
  // —hasta el TOTAL—; desde que enero del año siguiente va a la DERECHA del TOTAL, un tope tipeado
  // habría dejado sin medir justo las columnas nuevas. Se miden las del ejercicio (hasta el TOTAL) y
  // las del año siguiente, y el TOTAL no, que tiene su propio ancho.
  const AÑO_CF = Number(process.env.ORQ_CF_ANIO || 2026)
  for (const [pestaña, tipo] of [['Cash Flow Mensual', 'mes'], ['Cash Flow Semanal', 'semana']]) {
    if (bloqueadas.has(pestaña)) { console.log(`   🔒 ${pestaña}: bajo tu control, no la verifico ni la toco.`); continue }
    const w = await google.getColumnWidths(ID, pestaña).catch(() => [])
    // Las columnas de período tienen que medir todas lo mismo. Una distinta = alguien la tocó.
    const siguiente = new Set(colsDelSiguiente(tipo, AÑO_CF))
    const raras = [
      ...anchosRaros(w, colTotal(tipo, AÑO_CF)),
      ...w.map((px, i) => ({ i, px })).filter((c) => siguiente.has(c.i) && c.px !== ANCHOS.tiempo),
    ].map((c) => ({ col: letra(c.i), px: c.px }))
    if (raras.length) {
      hubo = true
      console.log(`   ⚠ ${pestaña}: columnas de período con ancho distinto de ${ANCHOS.tiempo}px → ${raras.map((c) => `${c.col}=${c.px}`).join(' ')}`)
    }
  }
  // EL HIPERVÍNCULO "IR A LA SEMANA DE HOY" TAMBIÉN SE PRUEBA.
  //
  // Estaba roto y sólo se veía haciendo clic: Google contestaba "no se puede abrir el vínculo porque
  // se borró el rango vinculado". La fórmula armaba el destino con ADDRESS(1;col;4) y le sacaba el
  // "1" con SUBSTITUTE para quedarse con la letra, así que producía "AE" — y una letra de columna
  // suelta no es un rango A1 válido. Ahora apunta a la fila del encabezado ("AE3").
  //
  // Se verifica de verdad: se aísla la expresión que arma el rango, se evalúa en una celda de
  // descarte del propio Sheet y se comprueba que dé una referencia válida y que el gid sea el de la
  // pestaña. Leer la fórmula y "ver que está bien" no es verificar.
  for (const pestaña of ['Cash Flow Semanal', 'Cash Flow Mensual']) {
    if (bloqueadas.has(pestaña)) continue // pestaña del dueño: no se escribe A200 ni se verifica el atajo
    const hoja = hojas.find((h) => h.title === pestaña)
    const gidReal = hoja?.sheetId
    // ═══ LA CELDA DE APUNTE NO PUEDE SER UNA FILA TIPEADA (01/08) ═══
    //
    // Era `A200`, fijo. El dueño reescribió Cash Flow Semanal más corta —89 filas— y la API devolvió
    // `Range ('Cash Flow Semanal'!A200) exceeds grid limits`, un 400 que MATÓ toda la corrida: desde
    // las 12:56 el Flujo de Caja no se regeneraba y el servicio quedaba en failed cada 2 horas. Una
    // VERIFICACIÓN tumbando la REGENERACIÓN es el defecto más caro posible, porque el síntoma no se
    // parece a la causa: no falla lo que se está verificando, falla todo lo demás.
    //
    // La última fila de la grilla SIEMPRE existe, cualquiera sea el alto de la pestaña. Y abajo, el
    // bloque entero va en try/catch: si el apunte falla por lo que sea, se reporta como "no verificado"
    // y el resto de la corrida sigue. Nunca más una comprobación puede voltear el pipeline.
    // ═══ EL DESTINO YA NO ESTÁ ADENTRO DE UNA FÓRMULA (07/09/2026) ═══
    //
    // Hasta hoy el atajo era `=HYPERLINK("…&range="&ADDRESS(…);"<rótulo>"…)`, así que para saber a
    // dónde apuntaba había que EVALUARLO: pegar su expresión en una celda de apunte, leer el resultado
    // y reponer lo que hubiera. Esa maniobra dejaba su propio residuo a la vista (`A107 = "AH7"`) y se
    // pisaba sola cada dos horas.
    //
    // Desde que el atajo es un ENLACE DE TEXTO ENRIQUECIDO —el fragmento `#gid=…&range=…` puesto sobre
    // la celda como formato— el destino se LEE. No hay celda de apunte, no hay residuo, no hay nada
    // que reponer, y esta verificación ya no puede escribir en la pestaña que verifica.
    const celdaAtajo = `A${FILA.botonHoy}`
    const rotulo = pestaña === 'Cash Flow Semanal' ? ROTULO_HOY.semana : ROTULO_HOY.mes
    let uri = ''
    let texto = ''
    try {
      const g = await google.getGridData(ID, `${pestaña}!${celdaAtajo}`,
        'sheets(data(rowData(values(formattedValue,hyperlink,userEnteredFormat(textFormat(link(uri))),textFormatRuns(format(link(uri)))))))')
      const celda = g?.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0] ?? {}
      texto = String(celda.formattedValue ?? '')
      uri = uriDelAtajo(celda)
    } catch (e) {
      console.log(`   ⚠ no pude verificar el atajo de ${pestaña} (${String(e.message).slice(0, 80)}) — sigo con el resto`)
      continue
    }
    const gid = /#gid=(\d+)/.exec(uri)?.[1]
    const rango = /[?&]range=([A-Z]{1,3}\d{1,5})/.exec(uri)?.[1] ?? null
    // ═══ Y LA REGLA SE DIO VUELTA: LA URL ENTERA AHORA ES EL DEFECTO ═══
    //
    // Antes se exigía la URL absoluta porque `HYPERLINK` con el fragmento suelto no navegaba. Con un
    // enlace de texto enriquecido pasa lo contrario, y es lo que el dueño reportó el 07/09: una URL
    // absoluta al MISMO archivo es, para el navegador, otro documento — abre una pestaña nueva del
    // Sheet en vez de scrollear ésta. El atajo tiene que ser RELATIVO para llevar a la columna.
    const relativo = uri.startsWith('#')
    if (/^[A-Z]+\d+$/.test(String(rango)) && String(gid) === String(gidReal) && relativo && texto.startsWith(rotulo)) {
      console.log(`   ✓ atajo de ${pestaña}: lleva a ${rango}`)
    } else {
      hubo = true
      const porQue = uri && !relativo
        ? 'el enlace es una URL absoluta: abre el archivo de nuevo en vez de llevar a la columna'
        : !uri ? 'la celda no tiene enlace' : `gid ${gid}, range ${rango}`
      console.log(`   ⚠ ${pestaña}: el atajo "IR A HOY" (${celdaAtajo}) apunta a un destino inválido — ${porQue}`)
    }
  }
  if (!hubo) console.log(`   ✓ geometría: las columnas de período miden todas ${ANCHOS.tiempo}px en las dos pestañas`)
}

async function main() {
  const t0 = T0
  // ── QUÉ CORRIDA ES ÉSTA (25/09/2026): `--grupo=datos` o `--grupo=vistas`; sin grupo, la lista entera ──
  const grupo = grupoDeArgs(process.argv.slice(2))
  const pasos = pasosDelGrupo(grupo)
  const quedaMs = presupuesto(process.env.ORQ_PIPELINE_PRESUPUESTO_S, T0)
  const sinTope = !Number.isFinite(quedaMs())
  console.log(`corrida ${grupo ?? 'completa'}: ${pasos.length} paso(s)${sinTope ? '' : ` · presupuesto ${Math.round(quedaMs() / 1000)} s`}`)
  const ok = []
  const respetadas = new Map()
  const fallaron = []
  const reportes = []
  const saltados = []

  // ── LA GUARDIA DE GENERADORES ATRASADOS, ANTES QUE TODO LO DEMÁS (13/08) ──
  //
  // `generadores-atrasados.mjs` existía desde el 03/08 y NADIE lo ejecutaba: un guardián escrito y
  // nunca puesto en la puerta. Va ARRIBA del candado, de la firma, del snapshot y del bucle a
  // propósito: esos tres LEEN y ESCRIBEN el archivo (la firma resella, el snapshot copia). Si un
  // generador de esta corrida está atrasado, la corrida no empieza — ni con una celda.
  //
  // Sale con 2, no con 1: un 1 es "algún paso falló y el resto corrió". Un 2 es "no corrió nada".
  // El timer tiene que poder distinguirlos sin leer el log. El detalle, en lib/guardia-generadores.mjs.
  const guardia = await guardiaDeGeneradores({ dry: DRY })
  for (const l of guardia.lineas) console.log(l)
  if (guardia.abortar) {
    console.error('\nNo ejecuté un solo generador. El Sheet quedó como estaba.')
    process.exit(2)
  }

  // ── EL CANDADO DEL DUEÑO, ANTES DE CORRER NADA (24/07) ──
  // Se lee UNA vez qué pestañas tomó el dueño. Un paso cuyas pestañas están TODAS bloqueadas ni se
  // ejecuta: su pestaña queda intacta y —si tiene fórmulas— sigue actualizándose sola por el Sheet.
  // El resto del pipeline corre normal: autónomo Y respetando sus reglas.
  const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  let bloqueadas = new Set()
  try {
    const { pestanasBloqueadas } = await import('../lib/pestana-bloqueada.mjs')
    bloqueadas = await pestanasBloqueadas({}, ID)
    if (bloqueadas.size) console.log(`🔒 pestañas bajo tu control (no se tocan): ${[...bloqueadas].join(', ')}\n`)
  } catch { /* sin base: se corre todo, la preservación celda a celda sigue activa */ }

  const { pasoTotalmenteBloqueado } = await import('../lib/pestana-bloqueada.mjs').catch(() => ({ pasoTotalmenteBloqueado: () => false }))

  // ── LA FIRMA, EN EL PORTÓN DEL PIPELINE, ANTES DE TOCAR NADA (24/07) ──
  // POR QUÉ ACÁ Y NO SÓLO ADENTRO DE CADA GENERADOR (el defecto que el dueño sufrió otra vez). La
  // protección por firma vivía dentro de escribirPreservando, así que un generador que escribe por
  // otro camino la esquivaba, y aun los que la usan alcanzaban a formatear la pestaña antes de darse
  // cuenta. Movida acá, se compara la firma de CADA pestaña de contenido contra la que dejó el OS la
  // última vez ANTES de correr un solo paso: si la editaste, se auto-canda y el paso que la escribe ni
  // se ejecuta. Uniforme para TODOS los generadores. Los espejos _RAW (empiezan con "_") no llevan firma.
  //
  // ── Y ARRIBA DE LA DETECCIÓN, LA RECONCILIACIÓN (25/07) ──
  // El fusible (firmaGuardia) sigue tonto: detecta la edición y auto-canda. Pero en vez de dejar la
  // pestaña congelada y pedirte "elegí qué clavar", el OS la ENTIENDE celda por celda (reconciliar):
  //   · si TODO lo que cambiaste es dato nuevo o corrección de fórmula → lo aprende, resella y DESCANDA:
  //     la pestaña vuelve a mantenerse sola y el choke point re-inyecta tus celdas sobre lo que genera;
  //   · si hay un conflicto real (pisaste un cálculo, borraste algo) → la deja candada y te hace UNA
  //     pregunta puntual por celda. Sin grid previo para diffear, cae al viejo comportamiento (candado).
  try {
    const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
    const { loadConfig } = await import('../lib/config.mjs')
    const { firmaGuardia } = await import('../lib/firma-tab.mjs')
    const { reconciliar } = await import('../lib/reconciliacion-firma.mjs')
    const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
    const tabs = [...new Set(pasos.flatMap(([, , t = []]) => t))].filter((t) => t && !t.startsWith('_') && !bloqueadas.has(t))

    // ── RED DE SEGURIDAD (26/07): snapshot ANTES de tocar una sola celda ──
    // El dueño perdió su versión y no había marcha atrás del lado del OS (sólo el historial de Google).
    // Antes de que el pipeline reescriba nada, guardo el estado ACTUAL de cada pestaña de contenido que
    // puede tocar, en orq.sheet_snapshots (append-only). Si algo sale mal —o si más tarde querés volver
    // a tu versión— hay deshacer real. Nunca frena el trabajo: si un snapshot falla, se registra y sigue.
    if (!DRY) {
      const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
      // ═══ EL SNAPSHOT SE SACA DEL ARCHIVO, NO DE LA LISTA DE PASOS (31/08) ═══
      //
      // Salía de `tabs`, que son las pestañas que los PASOS DECLARAN en su tercer elemento. Treinta y
      // cuatro pasos no declaran ninguna —los diez de Proveedores, los cuatro que escriben columnas de
      // Compras, Cobranzas, Cheques Emitidos— así que escribían pestañas de las que NO había foto
      // previa. Justo las tres con más trabajo a mano del dueño: la columna "Qué hacer" de Proveedores
      // vive ahí. Si la guarda fallaba en una de ellas, la única marcha atrás era el historial de
      // Google, que no dice qué celda cambió.
      //
      // La declaración sirve para saber qué paso saltear cuando una pestaña está candada; para la RED
      // DE SEGURIDAD la pregunta es otra —"¿qué puede perderse?"— y la respuesta es el archivo entero.
      // Fotografiar de más cuesta una lectura por pestaña; fotografiar de menos cuesta el trabajo del
      // dueño. Si no se puede listar el archivo, se cae a las declaradas en vez de quedarse sin red.
      let aFotografiar = tabs
      try {
        const todas = await google.listTabs(ID)
        aFotografiar = [...new Set([...tabs, ...todas.filter((t) => t && !t.startsWith('_'))])]
      } catch (e) {
        console.log(`  ⚠ no pude listar las pestañas del archivo (${String(e.message).slice(0, 60)}): fotografío sólo las declaradas`)
      }
      let snaps = 0
      // DE A VARIAS A LA VEZ (25/09/2026). Una por una, 22 lecturas se llevaron 18 minutos a las 10:06:
      // Google tiene ventanas en que TODA lectura del archivo espera 90–150 s (medido: Parámetros 94 s,
      // Nómina 155 s, sin una sola edición en 40 min) y ventanas en que contesta en 0,7 s. En serie se
      // pagan las ventanas una detrás de otra; en paralelo se pagan una vez.
      const fotos = await enParalelo(aFotografiar, LECTURAS_A_LA_VEZ, (t) => tomarSnapshot({ google, fileId: ID, pestana: t, tool: 'flujo-caja-rehacer' }).catch(() => null))
      snaps = fotos.filter(Boolean).length
      if (snaps) console.log(`🧷 snapshot previo de ${snaps} pestaña(s) — marcha atrás disponible en orq.sheet_snapshots\n`)
    }

    let candadas = 0
    let reconciliadas = 0
    const preguntas = []
    // Las firmas se LEEN en paralelo (una lectura por pestaña, mismo motivo que el snapshot); lo que
    // sigue —reconciliar, que puede resellar y descandar— va en serie, pestaña por pestaña.
    const firmas = await enParalelo(tabs, LECTURAS_A_LA_VEZ, (t) => {
      const ref = /[^A-Za-z0-9_]/.test(t) ? `'${t}'` : t
      return firmaGuardia(google, ID, t, ref).catch(() => ({ editada: false, noVerificable: true }))
    })
    for (const [k, t] of tabs.entries()) {
      const ref = /[^A-Za-z0-9_]/.test(t) ? `'${t}'` : t
      const { editada, noVerificable } = firmas[k]
      if (noVerificable) { bloqueadas.add(t); candadas++; console.log(`  🔒 "${t}": no pude verificar si la editaste — la dejo bajo tu control (fail-closed).`); continue }
      if (!editada) continue
      // La firma detectó tu edición y auto-candó. Intento entenderla antes de resignarme a congelar.
      const rec = await reconciliar(google, {}, ID, t, { ref }).catch(() => ({ resuelto: false, preguntas: [] }))
      if (rec.resuelto) {
        // Entendida del todo: reconciliar ya reselló y descandó. El paso corre y protejo tus celdas.
        reconciliadas++
        const aprend = (rec.aprendidas?.length || 0) + (rec.adoptadas?.length || 0)
        console.log(`  ✓ "${t}": entendí tu edición (${aprend} celda[s] adoptada[s]/aprendida[s]) — la mantengo sola y respeto lo tuyo.`)
      } else {
        // Queda candada (fail-closed). Junto las preguntas puntuales para avisarte.
        bloqueadas.add(t); candadas++
        for (const p of rec.preguntas || []) preguntas.push(p.pregunta)
      }
    }
    if (reconciliadas) console.log(`✓ ${reconciliadas} pestaña(s) que editaste: entendidas y reconciliadas — siguen automáticas, con tus correcciones protegidas.`)
    if (candadas) {
      console.log(`🔒 ${candadas} pestaña(s) con un conflicto real: las dejo bajo tu control hasta que decidas. Preguntas puntuales:`)
      for (const p of preguntas) console.log(`   · ${p}`)
      console.log('')
    }
  } catch (e) { console.log(`· pre-pasada de firma/reconciliación no disponible (${e.message}) — sigue el candado por paso\n`) }

  // EL RECORRIDO ES `recorrerPasos` (exportada y probada): ahí vive la decisión de detener la corrida.
  const { frenado, sinTiempo } = await recorrerPasos(pasos, {
    quedaMs,
    bloqueado: (pestañas) => pasoTotalmenteBloqueado(pestañas, bloqueadas),
    alSaltear: ({ script, pestañas }) => {
      saltados.push({ script, pestañas })
      console.log(`🔒 ${script.padEnd(26)} salteado — ${pestañas.join(', ')} bajo tu control`)
    },
    dry: DRY,
    correr: async ({ script, que, args }) => {
      const inicio = Date.now()
      // process.execPath, NO 'node': bajo systemd el PATH no incluye el node de nvm y los hijos
      // fallaban con ENOENT. Así siempre usa el mismo intérprete que está corriendo este script.
      // ARGUMENTOS POR PASO (01/08). Un generador que sabe escribir en dos destinos —el de prueba y
      // el real— necesita que el pipeline le diga cuál.
      const { stdout } = await ejecutar(process.execPath, [path.join(AQUI, script), ...args], {
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
        timeout: TECHO_PASO_MS,
      })
      // Se mira la salida, no sólo el código de salida: varios scripts avisan de celdas en error o de
      // un control que no cierra SIN fallar. LAS DOS MARCAS (`▲` vigente y la publicada).
      sumarRespetadas(stdout, respetadas)
      const conAlerta = stdout.split('\n').filter((l) => MARCA_ALERTA.test(l))
      const alerta = conAlerta.length ? conAlerta.join(' · ') : null
      ok.push({ script, que, seg: ((Date.now() - inicio) / 1000).toFixed(1), alerta })
      console.log(`✓ ${script.padEnd(26)} ${((Date.now() - inicio) / 1000).toFixed(1)}s  ${que}`)
      if (alerta) console.log(`   ⚠ ${alerta.slice(0, 220)}`)
    },
    alFallar: ({ script, que, error, freno }) => {
      const porQue = motivoDeFalla(error)
      ;(esReporte(script) ? reportes : fallaron).push({ script, que, error: porQue })
      console.error(`✗ ${script.padEnd(26)} ${que}\n   ${porQue}`)
      if (freno.frena) {
        console.error(`⛔ FRENO de ${script} (salida ${freno.codigo}): el pipeline se detiene — ${freno.faltan} paso(s) sin correr, ninguna pestaña de abajo se reescribe.`)
        for (const l of String(error?.stderr ?? '').split('\n').filter((x) => /✗✗|⛔/.test(x)).slice(0, 12)) console.error(`   ${l.trim()}`)
        return porQue
      }
      return null
    },
  })

  if (DRY) return
  // LA VERIFICACIÓN DE LOS CASH FLOW, SÓLO DONDE SE ESCRIBIERON, Y CON RELOJ (25/09/2026). Son cinco
  // lecturas: con el Sheet recalculando, cada una puede colgarse 3 minutos y el cierre entero se iba
  // de los 40. No escribe nada, así que abandonarla es seguro: queda dicho «no verificado».
  let abandonada = false
  if (!frenado && grupo !== 'vistas') {
    const margen = Math.min(quedaMs() - 60_000, 150_000)
    if (margen < 30_000) console.log('   ⏭ presentación de los Cash Flow: sin tiempo para verificarla en esta corrida — no verificada')
    else {
      let reloj
      const corte = new Promise((res) => { reloj = setTimeout(() => res('corte'), margen) })
      const r = await Promise.race([verificarPresentacion(bloqueadas).then(() => 'ok', (e) => `error: ${String(e?.message ?? e).slice(0, 80)}`), corte])
      clearTimeout(reloj)
      abandonada = r === 'corte'
      if (r === 'corte') console.log(`   ⏭ presentación de los Cash Flow: Google no contestó en ${Math.round(margen / 1000)} s — no verificada`)
      else if (r !== 'ok') console.log(`   ⚠ presentación de los Cash Flow: no verificada (${r})`)
    }
  }

  for (const linea of informeRespetadas(respetadas)) console.log(linea)

  console.log(`\n${ok.length}/${pasos.length} pestañas rehechas en ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  if (saltados.length) console.log(`🔒 ${saltados.length} paso(s) salteado(s) por tu candado: ${saltados.map((s) => s.pestañas.join('/')).join(', ')}`)
  const conAlerta = ok.filter((r) => r.alerta)
  if (conAlerta.length) {
    console.log(`\n${conAlerta.length} con avisos (la pestaña se rehizo, pero algo no cierra):`)
    for (const r of conAlerta) console.log(`  · ${r.script}: ${r.alerta.slice(0, 200)}`)
  }
  // REGISTRAR QUE EL OS INGIRIÓ EL CASH FLOW (23/07). Este pipeline es, por definición, "el OS acaba
  // de leer el Cash Flow entero y reconstruir sus derivadas". Si no falló ningún paso, esa lectura
  // fue exitosa: se marca la fuente para que la alerta de frescura no siga diciendo que está atrasada
  // cuando la reconstruyo todos los días. Sólo si 0 fallos: una corrida a medias no es una ingesta.
  if (fallaron.length === 0 && !sinTiempo.length && grupo !== 'vistas') {
    const { registrarSincronizacion } = await import('../lib/registrar-sincronizacion.mjs')
    const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
    const r = await registrarSincronizacion({}, { driveFileId: ID })
    console.log(r.ok
      ? `\n✓ frescura: "${r.nombre}" marcada sincronizada → ${r.estado}`
      : `\n· frescura no registrada: ${r.motivo}`)
  }

  if (reportes.length) console.log(`${reportes.length} paso(s) de presentacion con defectos a la vista (datos OK, cosmetico/auditoria): ${reportes.map((r) => r.script).join(', ')}`)
  if (fallaron.length) {
    console.log(`\n${fallaron.length} FALLARON:`)
    for (const r of fallaron) console.log(`  · ${r.script}: ${r.error}`)
    process.exitCode = 1
  }
  if (sinTiempo.length) {
    // No es verde: la corrida no rehízo todo. Pero tampoco es una escritura cortada: estos pasos no
    // empezaron, y la corrida siguiente los rehace sobre lo que dejó ésta.
    console.log(`\n⏭ ${sinTiempo.length} paso(s) SIN CORRER por falta de tiempo (no empiezo lo que no alcanza a terminar): ${sinTiempo.join(', ')}`)
    process.exitCode = process.exitCode || 1
  }
  if (frenado) {
    console.log(`\n⛔ FRENADO por ${frenado.script}: ${frenado.motivo}`)
    process.exitCode = 2
  }
  await encadenar({ grupo, frenado })
  // Una verificación abandonada sigue con sus lecturas en vuelo (hasta 3 min cada una) y el proceso no
  // saldría hasta que Google conteste: systemd lo seguiría contando contra el techo. Ya no escribe nada.
  if (abandonada) process.exit(process.exitCode ?? 0)
}

/**
 * ═══ LA CORRIDA DE VISTAS LA ARRANCA LA DE DATOS, AL TERMINAR (25/09/2026) ═══
 * En fila y nunca en paralelo: dos escritores sobre el mismo archivo se pisan el recálculo y se
 * alargan los dos. `--no-block`: la de datos termina ya y la unidad siguiente corre con su propio
 * techo. Si la de datos FRENÓ, las vistas no corren (leen la Compras que el freno declaró rota).
 * Sólo encadena si la unidad lo pide por entorno: una corrida a mano no dispara nada.
 */
export function decidirEncadenado({ grupo, frenado, siguiente }) {
  if (grupo !== 'datos' || !siguiente) return null
  if (frenado) return { lanzar: false, linea: `⏭ ${siguiente}: no la arranco — la corrida de datos frenó` }
  return { lanzar: true, linea: `→ arranco ${siguiente} (Proveedores, formato y auditorías, en su propia corrida)` }
}

async function encadenar({ grupo, frenado }) {
  const siguiente = process.env.ORQ_PIPELINE_SIGUIENTE
  const d = decidirEncadenado({ grupo, frenado, siguiente })
  if (!d) return
  console.log(`\n${d.linea}`)
  if (!d.lanzar) return
  try { await ejecutar('systemctl', ['--user', 'start', '--no-block', siguiente], { timeout: 20_000 }) }
  catch (e) { console.log(`   ⚠ no pude arrancar ${siguiente}: ${String(e?.message ?? e).slice(0, 120)}`) }
}

// ═══ IMPORTAR ESTE ARCHIVO NO PUEDE ARRANCAR EL PIPELINE (14/08/2026) ═══
//
// Acá decía `main()` a secas: un `import` de este módulo —para probar una función pura, para leer
// PASOS desde otro script— LANZABA la reescritura del Sheet real. Se descubrió escribiendo el test de
// `motivoDeFalla`: el test importó el archivo y arrancó la corrida. Frenó el guardián de generadores
// (salió ≠0 y el pipeline aborta con código 2, así que no se escribió una sola celda) — pero el freno
// que salvó la situación no es el que corresponde: dependía de que la rama tuviera un generador sin
// resolver. En main limpio, ese mismo import habría reescrito catorce pestañas.
//
// El repo ya usa esta guarda en todos los scripts que exportan algo (`auditar-duenos-pestanas.mjs`,
// entre otros) y este archivo era la excepción, justo el que más caro sale ejecutar por accidente.
// Bajo systemd `ExecStart` es exactamente esta ruta, así que la corrida real no cambia.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
