// LA PROPIEDAD POR CELDA, EN EL PORTÓN — para TODO escritor, no sólo para los del portón viejo.
//
// ═══ POR QUÉ (03/09) ═══
//
// El dueño, textual: *"el sheet flujo de fondos es un documento vivo autónomo y automático; lo único
// que requiero siempre es que mis ediciones en el archivo sean las que manden y siempre se respeten"*.
// Las dos mitades importan igual: las pestañas se siguen regenerando solas cada dos horas, Y ninguna
// celda que él tocó se pisa. Bloquear la PESTAÑA entera —que es lo que hacían el candado y el
// auto-candado, apagado el 05/08 justo por esto— cumple la segunda mitad rompiendo la primera.
//
// ═══ EL AGUJERO QUE CIERRA ═══
//
// La decisión celda por celda existía desde el 05/08 (`huella-celda.mjs`) pero vivía SÓLO adentro de
// `escribirPreservando`. Los pasos del pipeline que escriben con `updateCells` o con `values` crudos
// —cheques-emitidos-tablero, los diez de Proveedores, libro-movimientos, tarjeta-pestana, cobranzas-
// control, caja-anexo, recibos-raw…— no pasaban por ninguna verificación por celda: un `updateCells`
// con valores se clasifica DESTRUCTIVO y sólo se frenaba si la pestaña entera estaba candada. O sea:
// o se congelaba todo, o se pisaba todo. Este módulo agrega el estado del medio, que es el único que
// el dueño pidió.
//
// ═══ LA REGLA, UNA SOLA, LA MISMA QUE YA ESTABA ESCRITA ═══
//
// No se duplica: se REUSA `aplicarHuella`. Lo que hace este módulo es traducir su veredicto —pensado
// para `fusionar()`, donde `''` significa "conservá lo que hay"— al mundo crudo, donde `''` BORRA.
// La traducción es un RECORTE: la celda respetada se saca del pedido, así el rango que sale para la
// API no la menciona. Recortar sólo puede escribir MENOS, nunca más.
//
//   veredicto `''` sobre una celda que quería escribir  →  no es mía  →  la saco del pedido
//   veredicto `MIA_PROBADA`                             →  limpieza probada mía → escribo vacío
//   payload vacío sobre una celda con contenido         →  nunca limpia → la saco del pedido
//   el resto                                            →  escribo, y sello huella
//
// FAIL-CLOSED CON LA BASE CAÍDA. Sin base no hay huellas: no se puede distinguir lo mío de lo suyo.
// Entonces no se escribe sobre NINGUNA celda que hoy tenga contenido (sí sobre las vacías, que no
// pueden destruir nada). Es más angosto que el fail-closed por pestaña que ya hace `evaluarBloqueadas`
// —aquél descarta la escritura entera— y por eso convive con él sin aflojarlo.

import { footprintDeRango, MIA_PROBADA, VACIO, sinCentinela } from './no-borrar.mjs'
import { letraCol } from './preservar-anotaciones.mjs'
import { conHuellaDeCelda, hayContenido, quiereEscribir } from './huella-celda.mjs'

/** Cuántas celdas respetadas se registran en la base por pestaña y corrida. El resto se cuenta. */
export const TOPE_REGISTRO = 200

/** ref citada para la API ("Cheques Emitidos" → "'Cheques Emitidos'"). */
export function citarTab(tab) {
  return /[^A-Za-z0-9_]/.test(String(tab)) ? `'${String(tab).replace(/'/g, "''")}'` : String(tab)
}

/** "AB" → 27 (1-based, como lo usa la API A1). */
function nDeLetras(s) {
  let n = 0
  for (const c of String(s).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n
}

/**
 * La VENTANA que una escritura de valores ocupa: dónde arranca y cuánto mide. Pura.
 *
 * Se calcula sobre el FOOTPRINT (ancla + tamaño de la grilla), no sobre el rango literal: media
 * docena de generadores anclan en `Proveedores!A121` y escriben 100×16 desde ahí. Leer el ancla sola
 * fue el defecto que se pagó dos veces en `no-borrar.mjs` y en el cinturón vacío-sobre-lleno.
 *
 * Devuelve null cuando el rango no delimita filas ("Tab!A:P", la pestaña entera): ahí no se puede
 * afirmar qué celda es cuál, y sin coordenada la huella no puede decidir nada.
 */
export function ventanaDeRango(range, values = []) {
  const fp = footprintDeRango(range, values)
  const s = String(fp ?? '')
  const corte = s.lastIndexOf('!')
  if (corte < 0) return null
  const tab = s.slice(0, corte).replace(/^'(.*)'$/, '$1').replace(/''/g, "'")
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(s.slice(corte + 1).trim().toUpperCase())
  if (!m) return null
  const col0 = nDeLetras(m[1]) - 1
  const fila0 = Number(m[2])
  const alto = m[4] ? Number(m[4]) - fila0 + 1 : (values || []).length
  const ancho = m[3] ? nDeLetras(m[3]) - col0 : (values || []).reduce((mx, f) => Math.max(mx, (f || []).length), 0)
  if (!(alto > 0) || !(ancho > 0)) return null
  return { tab, fila0, col0, alto, ancho }
}

/** A1 absoluta de una celda de la ventana (fila 1-based, col 0-based). */
export function a1De(fila, col) {
  return `${letraCol(col)}${fila}`
}

/**
 * CLASIFICA CELDA POR CELDA lo que se puede escribir. Pura, y es el corazón de todo el módulo.
 *
 * @param {any[][]} generado lo que el escritor quiere poner
 * @param {any[][]} actual   el mismo rectángulo leído con render FORMULA
 * @param {any[][]} veredicto la grilla que devolvió `aplicarHuella` sobre esos dos
 * @returns {{escribible:boolean[][], payload:any[][], respetadas:Array}}
 */
export function clasificarGrilla(generado = [], actual = [], veredicto = []) {
  const escribible = []; const payload = []; const respetadas = []
  generado.forEach((f, i) => {
    escribible[i] = []; payload[i] = []
    ;(f || []).forEach((g, j) => {
      const a = (actual[i] || [])[j]
      const v = (veredicto[i] || [])[j]
      // (f) EL PAYLOAD VACÍO NUNCA LIMPIA. Un `''` en la grilla de un generador significa "esta
      // columna no es mía" muchísimo más seguido de lo que significa "borrá esto" — la única orden de
      // limpieza que el OS reconoce es el centinela, y la decide el camino de abajo.
      if (!quiereEscribir(g)) {
        escribible[i][j] = !hayContenido(a)
        payload[i][j] = g
        return
      }
      if (g === VACIO) {
        // Limpieza pedida: sólo ocurre si la huella probó que la celda es mía (MIA_PROBADA).
        if (v === MIA_PROBADA) { escribible[i][j] = true; payload[i][j] = '' ; return }
        escribible[i][j] = false; payload[i][j] = ''
        respetadas.push({ i, j, valorDueno: a ?? null, valorOs: null })
        return
      }
      if (v === '' || v === undefined) {
        escribible[i][j] = false; payload[i][j] = g
        respetadas.push({ i, j, valorDueno: a ?? null, valorOs: g })
        return
      }
      escribible[i][j] = true
      payload[i][j] = v === MIA_PROBADA ? '' : v
    })
  })
  return { escribible, payload, respetadas }
}

/**
 * POR QUÉ se respetó cada celda, según en qué lista del veredicto cayó. Informativo: si no se
 * encuentra, la celda se registra igual con la causa genérica. Las listas de `aplicarHuella` no usan
 * todas la misma coordenada de fila (unas la del mapa, otras la de hoy), así que se indexan las dos.
 */
export function causasDeVeredicto(h) {
  const idx = new Map()
  const off = h?.alineacion?.off ?? 0
  const poner = (fila, col, causa) => { const k = `${fila}:${col}`; if (!idx.has(k)) idx.set(k, causa) }
  for (const s of h?.suprimidas ?? []) poner(s.filaHoy ?? s.fila, s.col, 'borrada por el dueño')
  for (const e of h?.editadas ?? []) poner(e.fila, e.col, 'la escribí yo y hoy dice otra cosa: la editaste vos')
  for (const a of h?.ajenas ?? []) { poner(a.fila + off, a.col, 'nunca fue mía y tiene contenido tuyo'); poner(a.fila, a.col, 'nunca fue mía y tiene contenido tuyo') }
  for (const n of h?.noRepuestas ?? []) poner(n.filaHoy ?? n.fila, n.col, 'sin mapa de posición: no repongo lo que ya no está')
  return (fila, col) => idx.get(`${fila}:${col}`) ?? 'no puedo probar que esa celda sea mía'
}

/**
 * Parte una grilla en BLOQUES RECTANGULARES escribibles. Pura.
 *
 * El caso normal —nada respetado— devuelve un solo bloque que cubre todo, así el rango que sale para
 * la API es idéntico al que entró y el comportamiento no cambia en nada. Cuando hay celdas
 * respetadas, se emiten los rectángulos que las esquivan: primero segmentos de columnas contiguas por
 * fila, después se fusionan las filas consecutivas con los mismos límites (un cuadro con una celda
 * editada en el medio sale en tres bloques, no en doscientos).
 */
export function bloquesEscribibles(escribible = [], payload = []) {
  const tramos = []
  escribible.forEach((f, i) => {
    let j = 0
    while (j < (f || []).length) {
      if (!f[j]) { j++; continue }
      const desde = j
      while (j < f.length && f[j]) j++
      tramos.push({ i, desde, hasta: j - 1 })
    }
  })
  const bloques = []
  for (const t of tramos) {
    const ult = bloques[bloques.length - 1]
    if (ult && ult.desde === t.desde && ult.hasta === t.hasta && ult.iFin === t.i - 1) { ult.iFin = t.i; continue }
    bloques.push({ i0: t.i, iFin: t.i, desde: t.desde, hasta: t.hasta })
  }
  return bloques.map((b) => ({
    ...b,
    values: payload.slice(b.i0, b.iFin + 1).map((f) => (f || []).slice(b.desde, b.hasta + 1)),
  }))
}

/** ¿Está TODA la grilla escribible? Entonces el pedido sale tal cual entró. */
export function todoEscribible(escribible = []) {
  return escribible.every((f) => (f || []).every(Boolean))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CICLO IMPURO: leer el destino, decidir, recortar, y sellar después de escribir
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Decide una ventana. Devuelve la clasificación por celda y un `sellar()` para después de escribir.
 *
 * `estado`:
 *   · 'decidido'   la huella pudo juzgar (con base y con destino releído)
 *   · 'sin-base'   fail-closed angosto: sólo se escribe sobre celdas hoy vacías
 *   · 'sin-leer'   no se pudo releer el destino: no se escribe nada de esta ventana
 */
export async function decidirVentana(cliente, fileId, ventana, generado) {
  const { tab, fila0, col0, alto, ancho } = ventana
  const rango = `${citarTab(tab)}!${a1De(fila0, col0)}:${a1De(fila0 + alto - 1, col0 + ancho - 1)}`
  let actual
  try { actual = await cliente.readSheetValues(fileId, rango, { render: 'FORMULA' }) } catch { actual = undefined }
  if (actual === undefined) return { estado: 'sin-leer', escribible: [], payload: [], respetadas: [], sellar: async () => {} }
  // La base es la que guarda las huellas. Si no responde, ninguna celda se puede probar mía.
  try {
    const { query } = await import('./db.mjs')
    await query('select 1')
  } catch {
    const escribible = generado.map((f, i) => (f || []).map((_, j) => !hayContenido((actual[i] || [])[j])))
    const respetadas = []
    generado.forEach((f, i) => (f || []).forEach((g, j) => {
      if (!escribible[i][j] && quiereEscribir(g)) respetadas.push({ i, j, valorDueno: (actual[i] || [])[j] ?? null, valorOs: g, causa: 'sin base: no puedo verificar de quién es la celda (fail-closed)' })
    }))
    return { estado: 'sin-base', escribible, payload: generado, respetadas, sellar: async () => {} }
  }
  const h = await conHuellaDeCelda(fileId, tab, generado, actual, { fila0, col0 })
  const c = clasificarGrilla(generado, actual, h.grid)
  const porQue = causasDeVeredicto(h)
  for (const r of c.respetadas) { r.causa = porQue(fila0 + r.i, col0 + r.j) }
  return {
    estado: 'decidido',
    ...c,
    huella: h,
    // Se sella lo que QUEDÓ escrito: la grilla del veredicto con las respetadas ya en `''`, que no
    // dejan forma y por lo tanto no dejan huella. Reclamar una celda que no se escribió sería
    // exactamente el error que este módulo existe para no cometer.
    sellar: () => h.guardar(sinCentinela(h.grid.map((f, i) => (f || []).map((v, j) => (c.escribible[i]?.[j] ? v : ''))))),
  }
}

/** Las celdas respetadas de una ventana, con su A1 y su pestaña, listas para registrar y avisar. */
export function detallarRespetadas(ventana, respetadas = []) {
  return respetadas.map((r) => ({
    pestana: ventana.tab,
    celda: a1De(ventana.fila0 + r.i, ventana.col0 + r.j),
    valorDueno: r.valorDueno == null ? null : String(r.valorDueno).slice(0, 300),
    valorOs: r.valorOs == null ? null : String(r.valorOs).slice(0, 300),
    causa: r.causa ?? 'no puedo probar que esa celda sea mía',
  }))
}

/**
 * LA LÍNEA QUE EL DUEÑO LEE. Sale una por pestaña, al final de cada script, y es la única forma que
 * tiene de enterarse de qué se respetó sin abrir la base. El runner del pipeline la vuelve a sumar
 * al cierre de la corrida.
 */
export function avisarRespetadas(respetadas = [], log = console.log) {
  const porTab = new Map()
  for (const r of respetadas) {
    if (!porTab.has(r.pestana)) porTab.set(r.pestana, [])
    porTab.get(r.pestana).push(r)
  }
  for (const [tab, celdas] of porTab) {
    const muestra = celdas.slice(0, 20).map((c) => c.celda).join(', ')
    log(`  ✋ ${celdas.length} celda(s) tuya(s) respetada(s) en ${tab}: ${muestra}${celdas.length > 20 ? `, … y ${celdas.length - 20} más` : ''}`)
  }
  return porTab
}

/**
 * Registra las respetadas en `public.sheet_reconciliacion_celda`. Nunca lanza: la visibilidad no
 * puede tumbar una escritura.
 *
 * `estado:'registrada'` A PROPÓSITO, y no 'activa': una celda 'activa' la RE-INYECTA el choke point
 * sobre lo que produce el generador, y eso es una decisión distinta —adoptar el valor del dueño como
 * propio— que acá nadie tomó. Acá sólo se deja constancia de que no se la pisó.
 */
export async function registrarRespetadas(fileId, respetadas = [], deps = {}) {
  if (!respetadas.length) return { registradas: 0 }
  try {
    const { registrarCelda } = await import('./reconciliacion-firma.mjs')
    let n = 0
    const porTab = new Map()
    for (const r of respetadas) {
      const usadas = porTab.get(r.pestana) ?? 0
      if (usadas >= TOPE_REGISTRO) continue
      porTab.set(r.pestana, usadas + 1)
      await registrarCelda(deps, fileId, r.pestana, r.celda, {
        valorDueno: r.valorDueno, valorOs: r.valorOs, causa: r.causa,
        accion: 'respetada', estado: 'registrada',
      })
      n++
    }
    return { registradas: n }
  } catch (e) {
    console.warn(`  ⚠ no pude registrar las celdas respetadas (${String(e.message).slice(0, 80)})`)
    return { registradas: 0 }
  }
}

/**
 * LA GUARDA POR CELDA PARA UN `data` DE batchUpdateValues / updateSheetValues.
 *
 * Devuelve el `data` recortado a lo que se puede escribir y un `sellar()` para llamar DESPUÉS de que
 * la API confirme. Un rango cuya pestaña no es protegible (espejo `_`) o cuya ventana no se puede
 * determinar pasa intacto: sin coordenada no hay propiedad que decidir.
 */
export async function filtrarValues(cliente, fileId, data = [], { esProtegible = (t) => Boolean(t) && !String(t).startsWith('_') } = {}) {
  const salida = []; const respetadas = []; const sellos = []; const descartados = []
  for (const d of data) {
    const ventana = ventanaDeRango(d?.range, d?.values ?? [])
    if (!ventana || !esProtegible(ventana.tab)) { salida.push(d); continue }
    const r = await decidirVentana(cliente, fileId, ventana, d.values ?? [])
    if (r.estado === 'sin-leer') {
      descartados.push({ range: d.range, motivo: 'no pude releer el destino para saber de quién es cada celda (fail-closed)' })
      continue
    }
    respetadas.push(...detallarRespetadas(ventana, r.respetadas))
    if (r.sellar) sellos.push(r.sellar)
    if (todoEscribible(r.escribible)) { salida.push({ ...d, values: r.payload }); continue }
    for (const b of bloquesEscribibles(r.escribible, r.payload)) {
      const f0 = ventana.fila0 + b.i0
      const c0 = ventana.col0 + b.desde
      salida.push({
        ...d,
        range: `${citarTab(ventana.tab)}!${a1De(f0, c0)}:${a1De(ventana.fila0 + b.iFin, ventana.col0 + b.hasta)}`,
        values: b.values,
      })
    }
  }
  return { data: salida, respetadas, descartados, sellar: async () => { for (const s of sellos) await s() } }
}
