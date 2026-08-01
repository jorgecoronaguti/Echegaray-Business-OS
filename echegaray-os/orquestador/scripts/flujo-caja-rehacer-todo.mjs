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
//   node orquestador/scripts/flujo-caja-rehacer-todo.mjs [--dry]

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PASOS, esReporte } from '../lib/flujo-caja-pasos.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')

// La lista de pasos vive en la lib: el auditor de reglas de oro necesita leerla sin ejecutar
// el agente entero (ver flujo-caja-pasos.mjs).

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
    const f = (await google.readSheetGrid(ID, `${pestaña}!A2`)).filas?.[0]?.[0]?.formula ?? ''
    const gid = /#gid=(\d+)/.exec(f)?.[1]
    const i = f.indexOf('&range="&')
    const j = f.lastIndexOf(';"📅')
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
        await google.batchUpdateValues(ID, [{ range: `${pestaña}!${apunte}`, values: [[previo]] }], { yaGuardado: true })
      } catch (e) {
        console.log(`   ⚠ no pude verificar el atajo de ${pestaña} (${String(e.message).slice(0, 80)}) — sigo con el resto`)
        continue
      }
    }
    if (/^[A-Z]+\d+$/.test(String(rango)) && String(gid) === String(gidReal)) {
      console.log(`   ✓ atajo de ${pestaña}: lleva a ${rango}`)
    } else {
      hubo = true
      console.log(`   ⚠ ${pestaña}: el atajo "IR A HOY" apunta a un destino inválido (gid ${gid}, range ${rango})`)
    }
  }
  if (!hubo) console.log('   ✓ geometría: las columnas de período miden todas 96px en las dos pestañas')
}

async function main() {
  const t0 = Date.now()
  const ok = []
  const fallaron = []
  const reportes = []
  const saltados = []

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
      let snaps = 0
      for (const t of tabs) { if (await tomarSnapshot({ google, fileId: ID, pestana: t, tool: 'flujo-caja-rehacer' }).catch(() => null)) snaps++ }
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
      const alerta = /⚠/.test(stdout) ? stdout.split('\n').filter((l) => l.includes('⚠')).join(' · ') : null
      ok.push({ script, que, seg: ((Date.now() - inicio) / 1000).toFixed(1), alerta })
      console.log(`✓ ${script.padEnd(26)} ${((Date.now() - inicio) / 1000).toFixed(1)}s  ${que}`)
      if (alerta) console.log(`   ⚠ ${alerta.slice(0, 220)}`)
    } catch (e) {
      ;(esReporte(script) ? reportes : fallaron).push({ script, que, error: String(e.stderr || e.message).split('\n')[0].slice(0, 220) })
      console.error(`✗ ${script.padEnd(26)} ${que}\n   ${String(e.stderr || e.message).split('\n')[0].slice(0, 220)}`)
    }
  }

  if (DRY) return
  await verificarPresentacion(bloqueadas)

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

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
