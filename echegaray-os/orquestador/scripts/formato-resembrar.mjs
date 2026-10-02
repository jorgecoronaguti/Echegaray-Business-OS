#!/usr/bin/env node
// RESEMBRAR LA HUELLA DE FORMATO DE UNA PESTAÑA — para destrabar una congelada, con la evidencia a la vista.
//
// ═══ POR QUÉ EXISTE (01/10/2026) ═══
//
// Desde el 01/10 la guarda de formato reconoce su propio formato CELDA POR CELDA, así que un layout que
// crece una fila ya no congela la pestaña (`lib/huella-formato-celda.mjs`). Pero eso vale desde que hay
// sellos por celda, y las pestañas que se congelaron antes —«OBRAS» (65 requests retenidos por corrida
// desde el 07/09), «Calendario de Cobros» (73), «Materiales» (6), «Impuestos y Financieros» (2)— no los
// tienen: con la regla nueva siguen congeladas, a propósito. Que el código decida solo que un formato
// sin sello es del OS sería exactamente aflojar la guarda que protege el diseño del dueño.
//
// Destrabar es una decisión de una persona, y este script le da con qué tomarla:
//
// · QUÉ BORRARÍA, por tipo de huella: las de celdas y rangos (`celda`, `celda1`, `celda1p`) y, aparte,
//   las de anchos, altos, merges y pestaña, que `--aplicar` CONSERVA salvo que se pidan por su bandera.
// · LAS CELDAS QUE NO PUEDO PROBAR QUE SEAN MÍAS, con su A1: formato vivo que no coincide con ningún
//   sello del OS (ni el de esa celda, ni el pendiente, ni el de un rango sellado que sigue igual). Ésa
//   es la lista que la corrida siguiente pisaría.
// · Un inventario de lo que el OS no produce (familia de fuente, fondos y tintas fuera de la paleta,
//   tachado, subrayado). Es una PISTA, no un veredicto: no ve negrita, cursiva, tamaño, formato de
//   número, bordes ni alineación, ni un color de la casa que haya puesto el dueño (02/10, auditoría:
//   decía «nada fuera del estilo» y se leía como «no hay nada tuyo»). Lo dice al imprimirse.
//
// Con `--aplicar` borra las huellas de celdas y rangos de ESA pestaña y deja la marca de resembrado
// (`lib/huella-formato-celda.mjs`): la corrida siguiente es «primera pasada» para las celdas, aplica el
// formato entero y siembra los sellos. Anchos, altos, merges y pestaña sólo se borran nombrándolos.
//
//   node orquestador/scripts/formato-resembrar.mjs --pestana "OBRAS"            # en seco: no toca nada
//   node orquestador/scripts/formato-resembrar.mjs --pestana "OBRAS" --aplicar  # celdas y rangos
//   … --aplicar --tambien-anchos --tambien-altos --tambien-merges --tambien-pestana
//
// LA PRIMERA PASADA PISA (re-auditoría 02/10): lo que no se puede probar del OS, la corrida siguiente lo
// sobrescribe entero. El seco lo dice con esas palabras y `--aplicar` se NIEGA si esa lista no está
// vacía, salvo `--pisar-lo-no-probado`: pisar el diseño del dueño se pide a sabiendas o no se hace.
//
// No escribe el Sheet: lo lee con alcance de sólo lectura. Lo único que cambia es la base.

import { COLOR, FUENTE } from '../lib/estilo-pestana.mjs'
import { PIEL_NOMINA } from '../lib/nomina-formato.mjs'
import { INK, MUTED, HAIR, ACENTO } from '../lib/estilo-statement.mjs'
import { a1DeCelda, huellaDeCelda, cubre, TIPO_CELDA1, TIPO_CELDA1P, TIPO_RESEMBRAR } from '../lib/huella-formato-celda.mjs'
import { huellaDeRango, TIPO } from '../lib/huella-formato.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** `#rrggbb` de un color de la API (canales 0–1; el que falta vale 0). PURA. */
export function hexDe(c) {
  if (!c || typeof c !== 'object') return null
  const h = (x) => Math.round((x ?? 0) * 255).toString(16).padStart(2, '0')
  return `#${h(c.red)}${h(c.green)}${h(c.blue)}`
}

/**
 * Los colores que producen los formateadores del OS: la paleta de `estilo-pestana`, la de los estados
 * (`estilo-statement`: tinta, gris, línea y el acento de Impuestos/Materiales/CAJA), la piel de Nómina
 * (que `obras-pestana` repite con sus propias constantes) y el blanco del reset.
 */
export function coloresDeLaCasa() {
  return [...Object.values(COLOR), INK, MUTED, HAIR, ACENTO, ...Object.values(PIEL_NOMINA), { red: 1, green: 1, blue: 1 }].map(hexDe)
}

// CON TOLERANCIA Y NO POR IGUALDAD: las paletas están escritas con dos o tres decimales (`0.063` es
// #10, `0.078` da #14 y el hex declarado es #13), y `obras-pestana` escribe la tinta de Nómina como
// `0.10, 0.13, 0.20`. Comparar exacto marcaba como ajeno el negro del propio archivo en 994 celdas de
// OBRAS. Tres pasos de 255 por canal no confunden ningún color de la casa con otro.
const TOLERANCIA = 3
const canales = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
export function esDeLaCasa(hex, colores = coloresDeLaCasa()) {
  const a = canales(hex)
  return colores.some((c) => canales(c).every((v, i) => Math.abs(v - a[i]) <= TOLERANCIA))
}

const anotar = (mapa, clave, a1) => {
  if (!mapa.has(clave)) mapa.set(clave, { n: 0, muestra: [] })
  const x = mapa.get(clave)
  x.n++
  if (x.muestra.length < 6) x.muestra.push(a1)
}

/**
 * NÚCLEO PURO: lo que el formato vivo tiene y el OS no produce. No decide nada: lo enumera.
 * @returns {{celdasConFormato:number, fuentes:Map, fondos:Map, tintas:Map, tachado:Map, subrayado:Map}}
 */
export function inventarioFueraDeEstilo(lectura, { fuente = FUENTE, colores = coloresDeLaCasa() } = {}) {
  const inv = { celdasConFormato: 0, fuentes: new Map(), fondos: new Map(), tintas: new Map(), tachado: new Map(), subrayado: new Map() }
  ;(lectura?.filas ?? []).forEach((fila, f) => (fila ?? []).forEach((celda, c) => {
    const fmt = celda?.formato
    if (!fmt) return
    inv.celdasConFormato++
    const a1 = a1DeCelda(f, c)
    const t = fmt.textFormat ?? {}
    if (t.fontFamily && t.fontFamily !== fuente) anotar(inv.fuentes, t.fontFamily, a1)
    const fondo = hexDe(fmt.backgroundColor)
    if (fondo && !esDeLaCasa(fondo, colores)) anotar(inv.fondos, fondo, a1)
    const tinta = hexDe(t.foregroundColor)
    if (tinta && !esDeLaCasa(tinta, colores)) anotar(inv.tintas, tinta, a1)
    if (t.strikethrough) anotar(inv.tachado, 'tachado', a1)
    if (t.underline) anotar(inv.subrayado, 'subrayado', a1)
  }))
  return inv
}

/** Cuántas huellas hay de cada tipo. PURA. */
export function contarPorTipo(filas = []) {
  const out = new Map()
  for (const h of filas) out.set(h.tipo, (out.get(h.tipo) ?? 0) + 1)
  return out
}

// ═══ QUÉ BORRA `--aplicar` (02/10/2026, auditoría) ═══
//
// Hasta el 02/10 borraba TODAS las huellas de la pestaña —anchos, altos, merges, congeladas, color de
// pestaña— mientras el inventario sólo hablaba de celdas: el dueño autorizaba una cosa y se borraba
// otra. Ahora por defecto sólo las de celdas y rangos; el resto, cada uno con su bandera.
export const TIPOS_DE_CELDA = [TIPO.CELDA, TIPO_CELDA1, TIPO_CELDA1P]
export const BANDERAS_POR_TIPO = {
  '--tambien-anchos': TIPO.ANCHO, '--tambien-altos': TIPO.ALTO, '--tambien-merges': TIPO.MERGE, '--tambien-pestana': TIPO.PESTANA,
}

/** Los tipos de huella que borraría `--aplicar` con estos argumentos. PURA. */
export function tiposABorrar(args = []) {
  return [...TIPOS_DE_CELDA, ...Object.entries(BANDERAS_POR_TIPO).filter(([b]) => args.includes(b)).map(([, t]) => t)]
}

/** Qué se borra y qué queda, por tipo, con sus cantidades. La marca de resembrado no cuenta. PURA. */
export function planDeBorrado(conteo, tipos) {
  const plan = { borra: [], conserva: [] }
  for (const [t, n] of conteo) if (t !== TIPO_RESEMBRAR) (tipos.includes(t) ? plan.borra : plan.conserva).push([t, n])
  return plan
}

/** GridRange de un A1 como lo escribe `a1DeGridRange` (`B10:B18`, `A1:K`, `A1:`). PURA. */
export function grDeA1(a1) {
  const m = /^([A-Z]+)(\d+):([A-Z]*)(\d*)$/.exec(String(a1 ?? ''))
  if (!m) return null
  const col = (l) => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const gr = { startRowIndex: Number(m[2]) - 1, startColumnIndex: col(m[1]) }
  if (m[4]) gr.endRowIndex = Number(m[4])
  if (m[3]) gr.endColumnIndex = col(m[3]) + 1
  return gr
}

/**
 * LAS CELDAS QUE NO PUEDO PROBAR QUE SEAN MÍAS. PURA. Una celda con formato es del OS sólo si su huella
 * viva es la del sello de ESA celda, la del pendiente, o si cae en un rango cuya huella sellada sigue
 * siendo la viva (el rango entero quedó como el OS lo dejó). Todo lo demás se lista.
 * @param {{tipo:string, rango_a1:string, huella:string}[]} huellas
 * @returns {{fila:number, col:number}[]}
 */
export function celdasSinPrueba(lectura, huellas = []) {
  const deCelda = new Map()
  const rangosIntactos = []
  for (const h of huellas) {
    if (h.tipo === TIPO_CELDA1 || h.tipo === TIPO_CELDA1P) deCelda.set(h.rango_a1, [...(deCelda.get(h.rango_a1) ?? []), h.huella])
    if (h.tipo !== TIPO.CELDA) continue
    const gr = grDeA1(h.rango_a1)
    if (gr && huellaDeRango(TIPO.CELDA, lectura, gr) === h.huella) rangosIntactos.push(gr)
  }
  const out = []
  ;(lectura?.filas ?? []).forEach((fila, f) => (fila ?? []).forEach((celda, c) => {
    if (!celda?.formato) return
    if ((deCelda.get(a1DeCelda(f, c)) ?? []).includes(huellaDeCelda(lectura, f, c))) return
    if (rangosIntactos.some((gr) => cubre(gr, f, c))) return
    out.push({ fila: f, col: c })
  }))
  return out
}

/** Las celdas agrupadas en rectángulos A1 (tramos por fila que se repiten en filas seguidas). PURA. */
export function comprimirA1(celdas) {
  const porFila = new Map()
  for (const { fila, col } of celdas) porFila.set(fila, [...(porFila.get(fila) ?? []), col])
  const abiertos = new Map()
  const cerrados = []
  for (const f of [...porFila.keys()].sort((a, b) => a - b)) {
    const tramos = []
    for (const c of porFila.get(f).sort((a, b) => a - b)) {
      const t = tramos[tramos.length - 1]
      if (t && t[1] === c - 1) t[1] = c
      else tramos.push([c, c])
    }
    const vistos = new Set()
    for (const [c0, c1] of tramos) {
      const k = `${c0}-${c1}`
      vistos.add(k)
      const a = abiertos.get(k)
      if (a && a.f1 === f - 1) a.f1 = f
      else { if (a) cerrados.push(a); abiertos.set(k, { f0: f, f1: f, c0, c1 }) }
    }
    for (const [k, a] of [...abiertos]) if (!vistos.has(k) && a.f1 < f) { cerrados.push(a); abiertos.delete(k) }
  }
  return [...cerrados, ...abiertos.values()]
    .sort((x, y) => x.f0 - y.f0 || x.c0 - y.c0)
    .map((r) => (r.f0 === r.f1 && r.c0 === r.c1 ? a1DeCelda(r.f0, r.c0) : `${a1DeCelda(r.f0, r.c0)}:${a1DeCelda(r.f1, r.c1)}`))
}

const QUE_MIRA = 'familia de fuente, fondo y tinta fuera de la paleta de la casa, tachado y subrayado'
const QUE_NO_MIRA = 'negrita, cursiva, tamaño, formato de número, bordes, alineación, ajuste, ni un color de la casa puesto por el dueño'
// Lo que NINGUNA de las dos listas detecta (re-auditoría 02/10): la huella no proyecta subrayado ni
// rotación, así que un cambio sólo de eso no entra a «sin prueba»; y la rotación no la mira nadie.
const NO_DETECTO = 'la lista de celdas sin prueba NO detecta subrayado ni rotación (no entran a la huella); el subrayado sólo aparece acá como pista, y la rotación no la ve ninguna de las dos'

/** La lista que la primera pasada va a PISAR, dicha con esas palabras. PURA. */
export function lineasSinPrueba(celdas) {
  if (!celdas.length) return ['ninguna celda con formato sin prueba: todo lo que tiene formato coincide con un sello del OS']
  return [
    `estas ${celdas.length} celda(s) tienen un formato que no puedo probar que sea mío: con --aplicar la corrida siguiente lo PISA`,
    `  ${comprimirA1(celdas).join(', ')}`,
  ]
}

/**
 * `--aplicar` se niega a borrar si la primera pasada va a pisar algo que no se puede probar del OS,
 * salvo que se pida a sabiendas. Devuelve el motivo de la negativa, o null. PURA.
 */
export function negativaAAplicar(celdas, args = []) {
  if (!celdas.length || args.includes('--pisar-lo-no-probado')) return null
  return `no borro: la corrida siguiente PISARÍA ${celdas.length} celda(s) con formato que no puedo probar que sea mío (${comprimirA1(celdas).slice(0, 12).join(', ')}${celdas.length > 12 ? ', …' : ''}). Si es a sabiendas: --pisar-lo-no-probado`
}

/** Las líneas del inventario: siempre dicen qué miran y qué no, y nunca «no hay nada tuyo». PURA. */
export function lineasDelInventario(inv) {
  const grupos = [['familias de fuente', inv.fuentes], ['fondos', inv.fondos], ['tintas', inv.tintas], ['tachado', inv.tachado], ['subrayado', inv.subrayado]]
  const out = [`formato vivo: ${inv.celdasConFormato} celda(s) con formato propio`, `  inventario de pistas — miro: ${QUE_MIRA}. NO miro: ${QUE_NO_MIRA}.`, `  ojo: ${NO_DETECTO}.`]
  if (!grupos.some(([, m]) => m.size)) return [...out, '  ninguna pista en lo que miro. Eso NO prueba que no haya nada tuyo: lo que prueba es la lista de celdas sin prueba.']
  out.push('  FUERA DEL ESTILO DE LA CASA — puede ser diseño del dueño:')
  for (const [nombre, m] of grupos) {
    for (const [clave, x] of m) out.push(`    ${nombre}: ${clave} · ${x.n} celda(s) · ${x.muestra.join(', ')}${x.n > x.muestra.length ? ', …' : ''}`)
  }
  return out
}

function imprimirSinPrueba(celdas) {
  console.log(`\n${lineasSinPrueba(celdas).join('\n')}`)
  console.log('  (límites: un formato tuyo idéntico al sellado no se distingue; rotación, márgenes, link y subrayado no entran a la huella; debajo de la fila 2000 o a la derecha de BZ no se lee)')
}

function imprimirPlan(plan, pestana, aplicar) {
  const lista = (xs) => xs.map(([t, n]) => `${t} ${n}`).join(' · ') || 'nada'
  const banderas = Object.entries(BANDERAS_POR_TIPO).map(([b, t]) => `${t}: ${b}`).join(', ')
  console.log(`\n${aplicar ? 'borro' : '--aplicar borraría'} en "${pestana}": ${lista(plan.borra)}`)
  console.log(`  y ${aplicar ? 'conservo' : 'conservaría'}: ${lista(plan.conserva)}${plan.conserva.length ? ` (para borrarlas, su bandera — ${banderas})` : ''}`)
}

async function main() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--pestana')
  const pestana = i >= 0 ? args[i + 1] : null
  const aplicar = args.includes('--aplicar')
  if (!pestana || pestana.startsWith('--')) { console.error(`uso: formato-resembrar.mjs --pestana "<nombre>" [--aplicar] [--pisar-lo-no-probado] [${Object.keys(BANDERAS_POR_TIPO).join('] [')}]`); process.exit(1) }
  const { makeGoogleClient, READONLY_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const { query } = await import('../lib/db.mjs')
  const { citarTab } = await import('../lib/propiedad-celda.mjs')
  const { TECHO_FILAS_FORMATO } = await import('../lib/firma-formato.mjs')
  const { borrarHuellasPorTipo, guardarHuellaFormato } = await import('../lib/huella-formato-base.mjs')

  const r = await query('select tipo, rango_a1, huella from public.sheet_huella_formato where file_id = $1 and pestana = $2', [ID, pestana])
  const huellas = r.rows ?? []
  const plan = planDeBorrado(contarPorTipo(huellas), tiposABorrar(args))
  console.log(`"${pestana}": ${huellas.length} huella(s) de formato — ${[...contarPorTipo(huellas)].map(([t, n]) => `${t} ${n}`).join(' · ') || 'ninguna'}`)
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const lectura = await google.readSheetUserFormats(ID, `${citarTab(pestana)}!A1:BZ${TECHO_FILAS_FORMATO}`)
  if (!lectura) { console.error(`no pude leer el formato vivo de "${pestana}": no sigo`); process.exit(1) }
  const sinPrueba = celdasSinPrueba(lectura, huellas)
  imprimirSinPrueba(sinPrueba)
  console.log(`\n${lineasDelInventario(inventarioFueraDeEstilo(lectura)).join('\n')}`)
  imprimirPlan(plan, pestana, aplicar)
  if (!aplicar) { console.log('\n(en seco: no borré nada)'); return }
  const negativa = negativaAAplicar(sinPrueba, args)
  if (negativa) { console.error(`\n⛔ ${negativa}`); process.exit(1) }
  const n = await borrarHuellasPorTipo({ query }, ID, pestana, plan.borra.map(([t]) => t))
  // Si quedan huellas de otro tipo la pestaña no es virgen: sin la marca, el resembrado no destraba nada.
  if (plan.conserva.length) await guardarHuellaFormato({ query }, ID, pestana, TIPO_RESEMBRAR, 'celdas', 'marca')
  console.log(`\n🧹 ${n} huella(s) borradas. La corrida siguiente de su generador es «primera pasada» para las celdas: aplica entero, PISA ${sinPrueba.length} celda(s) sin prueba, y siembra.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
