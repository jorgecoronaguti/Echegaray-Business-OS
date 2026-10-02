// EL LOTE DE FORMATO, DE PUNTA A PUNTA: qué se informa, qué evidencia se escribe antes de aplicar y
// cómo se sella después. Lo usa `filtrarFormato` (huella-formato.mjs); la DECISIÓN no vive acá.
//
// ═══ TRES PROMESAS QUE ESTE ARCHIVO CUMPLE (02/10/2026, auditoría) ═══
//
// 1. `respetadas` NUNCA lista una celda que el lote pisa. Una celda puede ser ajena para un request
//    (que se recorta a su alrededor) y quedar cubierta por otro que entra entero por una regla que sí
//    la alcanza (primera pasada, rango idéntico al sellado). Informarla como «respetada» era mentirle
//    al dueño. Antes de devolver el lote se cruza lo informado contra lo que efectivamente se aplica.
// 2. Antes de aplicar se guarda el sello PENDIENTE (lo que el OS va a dejar en cada celda). Si no se
//    puede guardar, las capas de celdas de esa pestaña NO se aplican: sin evidencia escrita, la
//    corrida siguiente las vería como del dueño y las recortaría para siempre.
// 3. El sellado posterior reintenta y, si igual falla, LO DICE con el motivo. Hasta el 01/10 un
//    `.catch(() => {})` lo tragaba, y el candado por celda nacía en silencio.
//
// LÍMITE DE LA RECUPERACIÓN: el pendiente existe sólo donde se sabe predecir (`repeatCell` con máscara
// explícita). Una celda tocada por un `updateBorders`, un `updateCells` o una máscara `*` no lleva
// pendiente: si además falla el sello posterior, queda sin evidencia y la corrida siguiente la respeta
// como del dueño hasta resembrar. Y un pendiente de un lote que al final no se aplicó sigue valiendo:
// si el dueño pone a mano exactamente ese formato, se toma como del OS.

import { TIPO_CELDA1P, TIPO_RESEMBRAR, cubre, huellasDeCeldas } from './huella-formato-celda.mjs'
import { predecirCeldas } from './huella-formato-prediccion.mjs'
import {
  guardarHuellaFormato, guardarHuellasDeCeldas, invalidarFormato, leerFormatoDePestana, borrarHuellasPorTipo,
} from './huella-formato-base.mjs'

const ESPERAS_POR_DEFECTO = [0, 250, 1000]
let esperas = ESPERAS_POR_DEFECTO

/** Sólo para los tests: reintentos sin espera. `null` vuelve a los de producción. */
export function fijarEsperasDeReintento(ms) { esperas = ms ?? ESPERAS_POR_DEFECTO }

/** Corre `fn` con reintentos. Nunca lanza: devuelve el resultado o el motivo del último fallo. */
export async function conReintentos(fn) {
  let ultimo = null
  for (const ms of esperas) {
    if (ms) await new Promise((r) => setTimeout(r, ms))
    try { return { ok: true, valor: await fn() } } catch (e) { ultimo = e }
  }
  return { ok: false, motivo: String(ultimo?.message ?? ultimo).slice(0, 140) }
}

/** El estado de un lote mientras se decide. */
export function nuevoLote(requests) {
  return { salida: requests.map((r) => [r]), respetadas: [], aSellar: [], aplicados: new Map(), porCelda: new Map(), vistas: new Set() }
}

/** Informa una celda o rango que no se tocó. `pos` marca las entradas de UNA celda, para depurarlas. */
export function respetar(lote, tab, celda, causa, pos = null) {
  const k = `${tab}|${celda}`
  if (lote.vistas.has(k)) return
  lote.vistas.add(k)
  const e = { pestana: tab, celda, valorDueno: null, valorOs: null, causa }
  lote.respetadas.push(e)
  if (pos) lote.porCelda.set(k, { ...pos, tab, e })
}

/** Anota lo que SÍ se va a aplicar sobre celdas, en el orden del lote: lo leen el pendiente y la depuración. */
export function anotarAplicado(lote, tab, entradas) {
  if (!lote.aplicados.has(tab)) lote.aplicados.set(tab, [])
  lote.aplicados.get(tab).push(...entradas)
}

/** Promesa 1: fuera de `respetadas` toda celda que otra capa del mismo lote pisa. */
export function depurarRespetadas(lote) {
  for (const [k, { fila, col, tab, e }] of lote.porCelda) {
    if (!(lote.aplicados.get(tab) ?? []).some((a) => cubre(a.gr, fila, col))) continue
    lote.respetadas.splice(lote.respetadas.indexOf(e), 1)
    lote.porCelda.delete(k)
    console.log(`  🎨 "${tab}"!${e.celda}: la cubre otra capa del lote que sí entra — no la informo como respetada.`)
  }
}

/**
 * Promesa 2: el sello pendiente, ANTES de aplicar. Sólo viaja lo que no está ya probado (sello o
 * pendiente igual): en régimen no escribe nada. Si falla, se retiran las capas de celdas de la pestaña.
 */
export async function registrarPendientes(fileId, ctxPorTab, lote) {
  for (const [tab, aplicados] of [...lote.aplicados]) {
    const ctx = ctxPorTab.get(tab)
    const previstas = predecirCeldas(ctx.vivo, aplicados)
    for (const [a1, h] of [...previstas]) {
      if (h === null || ctx.pendientes.get(a1) === h || ctx.sellos.get(a1) === h) previstas.delete(a1)
    }
    const r = await conReintentos(() => guardarHuellasDeCeldas({}, fileId, tab, previstas, TIPO_CELDA1P))
    if (!r.ok) retirarCapasDeCeldas(lote, tab, `no pude guardar el sello pendiente (${r.motivo})`)
  }
}

/** Fail-closed de UNA pestaña: sus capas de celdas salen del lote y se informan con la causa. */
function retirarCapasDeCeldas(lote, tab, causa) {
  console.warn(`  ⚠ "${tab}": ${causa} — no aplico su formato de celdas en este lote (fail-closed).`)
  for (const a of lote.aplicados.get(tab) ?? []) {
    lote.salida[a.i] = []
    respetar(lote, tab, a.rango, `diseño: ${causa}: no lo aplico (fail-closed)`)
  }
  lote.aSellar = lote.aSellar.filter((s) => !(s.tab === tab && s.deCeldas))
  lote.aplicados.delete(tab)
}

/**
 * LA MARCA DE RESEMBRADO VALE UNA APLICACIÓN (02/10, re-auditoría). Se consume ANTES de aplicar, no al
 * sellar: si se quitaba sólo cuando el sellado salía bien, una relectura caída la dejaba viva y la
 * corrida siguiente volvía a ser primera pasada encima de lo que el dueño hubiera tocado en el medio.
 * Lo recién aplicado lo prueba el sello pendiente, como en cualquier corrida. Si la marca no se puede
 * quitar, las capas de celdas de esa pestaña no se aplican.
 */
export async function consumirMarcasDeResembrado(fileId, ctxPorTab, lote) {
  for (const tab of [...lote.aplicados.keys()]) {
    const ctx = ctxPorTab.get(tab)
    if (!ctx?.marcaResembrar) continue
    const b = await conReintentos(() => borrarHuellasPorTipo({}, fileId, tab, [TIPO_RESEMBRAR]))
    if (b.ok) ctx.marcaResembrar = false
    else retirarCapasDeCeldas(lote, tab, `no pude quitar la marca de resembrado (${b.motivo})`)
  }
}

// Lo que pasa de verdad cuando el sellado falla (re-auditoría: el aviso anterior prometía más).
function avisar(fallas, tab, motivo) {
  fallas.push({ pestana: tab, motivo })
  console.warn(`  ⚠ sello de formato "${tab}": ${motivo}. La corrida siguiente reconoce como mías sólo las celdas que tengan sello pendiente y sigan exactamente así; las demás (bordes, updateCells, máscara *, o lo que cambie) quedan como tuyas hasta resembrar.`)
}

/**
 * Promesa 3: EL SELLO, DESPUÉS DE APLICAR. La huella sale de RELEER el formato que quedó —nunca del
 * request, ni de la lectura cacheada de antes del lote—. Devuelve las fallas; nunca las calla.
 * @returns {Promise<{fallas:{pestana:string, motivo:string}[]}>}
 */
export async function sellarAplicados(cliente, fileId, aSellar, porTab, ctxPorTab, huellaDeRango) {
  const fallas = []
  const porPestana = new Map()
  for (const s of aSellar) porPestana.set(s.tab, [...(porPestana.get(s.tab) ?? []), s])
  for (const [tab, items] of porPestana) {
    const lectura = await conReintentos(async () => {
      invalidarFormato(fileId, tab)   // se acaba de aplicar formato: lo cacheado ya no es lo que hay
      const x = await leerFormatoDePestana(cliente, fileId, tab, porTab.get(tab) ?? {})
      if (!x) throw new Error('la lectura volvió vacía')
      return x
    })
    if (!lectura.ok) { avisar(fallas, tab, `no pude releer el formato después del lote (${lectura.motivo})`); continue }
    const releido = lectura.valor
    for (const s of items.filter((x) => x.sellarRango)) {
      const h = huellaDeRango(s.tipo, releido, s.gr)
      const r = h ? await conReintentos(() => guardarHuellaFormato({}, fileId, tab, s.tipo, s.rango, h)) : { ok: true }
      if (!r.ok) avisar(fallas, tab, `no pude sellar ${s.rango} (${r.motivo})`)
    }
    const previos = ctxPorTab.get(tab)?.sellos ?? new Map()
    const nuevas = huellasDeCeldas(releido, items.flatMap((s) => s.partes))
    for (const [a1, h] of [...nuevas]) if (previos.get(a1) === h) nuevas.delete(a1)
    const r = await conReintentos(() => guardarHuellasDeCeldas({}, fileId, tab, nuevas))
    if (!r.ok) avisar(fallas, tab, `no pude sellar ${nuevas.size} celda(s) (${r.motivo})`)
  }
  return { fallas }
}
