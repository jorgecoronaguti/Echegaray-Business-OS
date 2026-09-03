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
// Códigos de salida: 0 todo bien · 1 algún paso falló (los demás corrieron) · 2 la guardia abortó.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PASOS, esReporte } from '../lib/flujo-caja-pasos.mjs'
import { guardiaDeGeneradores } from '../lib/guardia-generadores.mjs'
import { FILA, ROTULO_HOY } from '../lib/cash-flow-matriz.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MARCA_ALERTA } from '../lib/glifos.mjs'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')

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
  for (const [pestaña, hasta] of [['Cash Flow Mensual', 13], ['Cash Flow Semanal', 54]]) {
    if (bloqueadas.has(pestaña)) { console.log(`   🔒 ${pestaña}: bajo tu control, no la verifico ni la toco.`); continue }
    const w = await google.getColumnWidths(ID, pestaña).catch(() => [])
    // Las columnas de período tienen que medir todas lo mismo. Una distinta = alguien la tocó.
    const raras = w.slice(1, hasta).map((px, i) => ({ col: letra(i + 1), px })).filter((c) => c.px !== 96)
    if (raras.length) {
      hubo = true
      console.log(`   ⚠ ${pestaña}: columnas de período con ancho distinto de 96px → ${raras.map((c) => `${c.col}=${c.px}`).join(' ')}`)
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
    const apunte = `A${Math.max(1, hoja?.rows ?? 1000)}`
    // ═══ LA CELDA Y EL RÓTULO SALEN DE LA GRILLA, NO DE ESTE ARCHIVO (13/08/2026) ═══
    //
    // Acá decía `A2` y `;"📅` a mano. La matriz del 06/08 movió el atajo a `A3` y le cambió el rótulo a
    // "⏵ IR A LA SEMANA ACTUAL", así que este control quedó leyendo el SUBTÍTULO: no encontraba `#gid=`
    // ni `&range=`, y escribía en CADA corrida y en las DOS pestañas "el atajo IR A HOY apunta a un
    // destino inválido (gid undefined, range null)". Nunca miró el atajo de verdad. Ahora la fila y el
    // texto vienen de `cash-flow-matriz.mjs`, que es quien los define para las dos grillas: si mañana
    // el atajo se muda de fila, el control se muda con él.
    const celdaAtajo = `A${FILA.botonHoy}`
    const rotulo = pestaña === 'Cash Flow Semanal' ? ROTULO_HOY.semana : ROTULO_HOY.mes
    const f = (await google.readSheetGrid(ID, `${pestaña}!${celdaAtajo}`)).filas?.[0]?.[0]?.formula ?? ''
    const gid = /#gid=(\d+)/.exec(f)?.[1]
    const i = f.indexOf('&range="&')
    const j = f.lastIndexOf(`;"${rotulo}`)
    let rango = null
    if (i > 0 && j > i) {
      // A200 se usa como celda de apunte. Se GUARDA lo que hubiera y se RESTAURA: si el dueño escribió
      // ahí, no se pierde (regla de oro: nunca borrar lo que escribe una persona).
      // REGLA 0 — NO APLICA, Y ESTÁ DECIDIDO: respetar: false.
      // Acá no se escribe contenido: A200 se usa un instante como celda de apunte para resolver a qué
      // rango apunta un atajo, y se restaura lo que hubiera. Nada queda escrito al terminar.
      try {
        const previo = (await google.readSheetValues(ID, `${pestaña}!${apunte}`, { render: 'FORMULA' }))?.[0]?.[0] ?? ''
        // yaGuardado: la celda de apunte es transitoria; se lee y RESTAURA acá mismo (su propia
        // preservación). No debe pasar por la guarda central ni disparar sello de firma.
        await google.batchUpdateValues(ID, [{ range: `${pestaña}!${apunte}`, values: [[`=${f.slice(i + 9, j)}`]] }], { yaGuardado: true })
        rango = (await google.readSheetValues(ID, `${pestaña}!${apunte}`))?.[0]?.[0]
        // ═══ Y LA CELDA DE APUNTE SE LIMPIA DE VERDAD (13/08/2026) ═══
        //
        // `previo` casi siempre está vacío, y `no-borrar` no deja escribir vacío sobre lleno: la
        // reposición se descartaba en silencio y el valor resuelto se quedaba a la vista. Medido con
        // captura: `Cash Flow Semanal!A107 = "AH7"` y `Cash Flow Mensual!A109 = "I7"`, repuestos por
        // esta misma verificación cada dos horas desde que existe. El OS se pisaba a sí mismo.
        //
        // `vaciarPropio` NO es un permiso: es el texto exacto que el OS acaba de escribir acá y leer
        // de vuelta. La guarda RELEE el destino y compara ella misma — si en el medio el dueño escribió
        // otra cosa, no coincide y la celda se conserva. Sólo aplica si lo que había era vacío: si el
        // dueño tenía algo, se repone lo suyo y no hay nada que vaciar.
        const propio = !String(previo ?? '').trim() && /^[A-Z]{1,3}\d{1,5}$/.test(String(rango ?? ''))
        await google.batchUpdateValues(ID, [{ range: `${pestaña}!${apunte}`, values: [[previo]] }],
          { yaGuardado: true, vaciarPropio: propio ? { mios: [String(rango)] } : null })
      } catch (e) {
        console.log(`   ⚠ no pude verificar el atajo de ${pestaña} (${String(e.message).slice(0, 80)}) — sigo con el resto`)
        continue
      }
    }
    // LA URL ENTERA TAMBIÉN SE VERIFICA. Un `HYPERLINK("#gid=…")` con el fragmento suelto calcula bien
    // el destino y NO navega: Google contesta "se borró el rango vinculado". Es el defecto que tenía la
    // matriz, y es invisible salvo haciendo clic — salvo que el control lo mire, que es lo que hace acá.
    const urlEntera = f.includes('https://docs.google.com/spreadsheets/d/')
    if (/^[A-Z]+\d+$/.test(String(rango)) && String(gid) === String(gidReal) && urlEntera) {
      console.log(`   ✓ atajo de ${pestaña}: lleva a ${rango}`)
    } else {
      hubo = true
      const porQue = !urlEntera && gid
        ? 'el vínculo lleva el fragmento "#gid=" suelto en vez de la URL entera: no navega'
        : `gid ${gid}, range ${rango}`
      console.log(`   ⚠ ${pestaña}: el atajo "IR A HOY" (${celdaAtajo}) apunta a un destino inválido — ${porQue}`)
    }
  }
  if (!hubo) console.log('   ✓ geometría: las columnas de período miden todas 96px en las dos pestañas')
}

async function main() {
  const t0 = Date.now()
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
    const tabs = [...new Set(PASOS.flatMap(([, , t = []]) => t))].filter((t) => t && !t.startsWith('_') && !bloqueadas.has(t))

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
      for (const t of aFotografiar) { if (await tomarSnapshot({ google, fileId: ID, pestana: t, tool: 'flujo-caja-rehacer' }).catch(() => null)) snaps++ }
      if (snaps) console.log(`🧷 snapshot previo de ${snaps} pestaña(s) — marcha atrás disponible en orq.sheet_snapshots\n`)
    }

    let candadas = 0
    let reconciliadas = 0
    const preguntas = []
    for (const t of tabs) {
      const ref = /[^A-Za-z0-9_]/.test(t) ? `'${t}'` : t
      const { editada, noVerificable } = await firmaGuardia(google, ID, t, ref).catch(() => ({ editada: false, noVerificable: true }))
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

  for (const [script, que, pestañas = [], args = []] of PASOS) {
    const inicio = Date.now()
    if (pasoTotalmenteBloqueado(pestañas, bloqueadas)) {
      saltados.push({ script, pestañas })
      console.log(`🔒 ${script.padEnd(26)} salteado — ${pestañas.join(', ')} bajo tu control`)
      continue
    }
    if (DRY) { console.log(`(dry) ${script.padEnd(26)} ${que}`); continue }
    try {
      // process.execPath, NO 'node': bajo systemd el PATH no incluye el node de nvm y los hijos
      // fallaban con ENOENT. Así siempre usa el mismo intérprete que está corriendo este script.
      // ARGUMENTOS POR PASO (01/08). Un generador que sabe escribir en dos destinos —el de prueba y
      // el real— necesita que el pipeline le diga cuál. Sin esto, "Cheques Recibidos" quedaba en manos
      // del generador viejo y el nuevo sólo corría a mano.
      const { stdout } = await ejecutar(process.execPath, [path.join(AQUI, script), ...args], {
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      })
      // Se mira la salida, no sólo el código de salida: varios scripts avisan de celdas en error o de
      // un control que no cierra SIN fallar. Eso también hay que reportarlo.
      // LAS DOS MARCAS: la corrida imprime la vigente (`▲`) y todavía quedan logs con la publicada.
      // Buscar sólo una dejaría fuera del resumen del pipeline la mitad de los avisos, en silencio.
      sumarRespetadas(stdout, respetadas)
      const conAlerta = stdout.split('\n').filter((l) => MARCA_ALERTA.test(l))
      const alerta = conAlerta.length ? conAlerta.join(' · ') : null
      ok.push({ script, que, seg: ((Date.now() - inicio) / 1000).toFixed(1), alerta })
      console.log(`✓ ${script.padEnd(26)} ${((Date.now() - inicio) / 1000).toFixed(1)}s  ${que}`)
      if (alerta) console.log(`   ⚠ ${alerta.slice(0, 220)}`)
    } catch (e) {
      const porQue = motivoDeFalla(e)
      ;(esReporte(script) ? reportes : fallaron).push({ script, que, error: porQue })
      console.error(`✗ ${script.padEnd(26)} ${que}\n   ${porQue}`)
    }
  }

  if (DRY) return
  await verificarPresentacion(bloqueadas)

  for (const linea of informeRespetadas(respetadas)) console.log(linea)

  console.log(`\n${ok.length}/${PASOS.length} pestañas rehechas en ${((Date.now() - t0) / 1000).toFixed(1)}s`)
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
  if (fallaron.length === 0) {
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
