// EL REGISTRO DE LO QUE EL DUEÑO YA DECIDIÓ SOBRE UN HALLAZGO DE CONTROL.
//
// ═══ POR QUÉ EXISTE (13/08) ═══
//
// El pipeline corre cada 2 horas y varios de sus avisos son de cosas que el dueño YA MIRÓ. El de
// ventas sin cobranza reaparecía con los mismos $129.499.724 en cada corrida después de que él
// contestara "no considerarlas"; el duplicado de la fila 39 después de "no es duplicado"; los dos
// vencimientos de julio después de "no afectan". Este repo ya tiene escrita la consecuencia —*"un
// aviso siempre rojo se ignora"*— y es exactamente cómo mueren los controles que sí importan: no se
// apagan, se dejan de leer, y el día que uno dice algo nuevo nadie lo distingue del ruido.
//
// ═══ LO QUE ESTE REGISTRO NO ES ═══
//
// No apaga un CONTROL. Silenciar "el control de ventas sin cobranza" taparía el próximo hallazgo
// real: lo que se silencia es ESE comprobante, con ESE importe. Por eso cada decisión lleva dos
// partes separadas, y las dos tienen que coincidir para que la decisión aplique:
//
//     clave  →  QUÉ hallazgo es      (el comprobante · la fila · el impuesto y su período)
//     forma  →  con QUÉ DATOS estaba cuando el dueño lo miró
//
// Si mañana esa factura cambia de importe, la decisión vieja NO se aplica: el dueño decidió sobre
// otra cosa. Es el mismo criterio que la huella por celda —una decisión vale para esa FORMA del
// dato— y es lo único que separa un registro de decisiones de una alfombra debajo de la cual barrer.
//
// ═══ LIBERAR NO ES CALLAR ═══
//
// Un hallazgo con decisión se sigue contando y se sigue listando, con quién decidió, cuándo y el
// texto textual de lo que dijo. Lo único que pierde es la línea de aviso: el `⚠` que el pipeline
// levanta de la salida (`flujo-caja-rehacer-todo.mjs`) y por el que el paso figura entre los que "no
// cierran". Mismo criterio que ya se aplicó al freno de generadores (`generadores-revisados.json`) y
// al marcado de cheques. Dentro de tres meses nadie va a recordar por qué esos $115M no se
// consideran: por eso el texto del dueño se guarda literal.
//
// ═══ POR QUÉ SÓLO EL DUEÑO PUEDE DECIDIR ═══
//
// Un agente que pudiera cargar una decisión tendría la llave para apagar su propio control. La
// autoridad es la persona, no el que produce el aviso — es la misma razón por la que ningún trabajo
// lo cierra quien lo construyó. Una entrada con `quien` fuera de `AUTORIDADES` no aplica y se
// reporta como inválida: no se ignora en silencio.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Dónde vive el registro. JSON versionado en git, como `generadores-revisados.json`: se lee en un
 *  diff, sobrevive a una base caída y deja rastro de quién agregó qué. */
export const RUTA_REGISTRO = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'decisiones-del-dueno.json',
)

/** Quién puede liberar un hallazgo. UNA sola autoridad, y no es ningún agente. */
export const AUTORIDADES = Object.freeze(['dueño'])

/**
 * EL NOMBRE DE CADA CONTROL, DECLARADO UNA SOLA VEZ.
 *
 * El registro guarda ese nombre como texto y el generador lo pasa al pedir el veredicto. Si cada uno
 * lo tipeara por su cuenta, un renombre dejaría al registro apuntando a un control que ya no existe
 * y TODAS sus decisiones dejarían de aplicar sin un solo error — los avisos volverían de golpe y
 * nadie sabría por qué. Acá el renombre rompe el test de que toda decisión apunta a un control vivo.
 */
export const CONTROLES = Object.freeze({
  ventasSinCobranza: 'proveedores-materiales-pestana · factura emitida que Cobranzas no tiene',
  cobroDuplicado: 'cobranzas-control · posible cobro duplicado',
  vencimientoVencido: 'impuestos-pestana · vencimiento fiscal vencido',
})

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))

/**
 * NÚCLEO PURO: un valor de la forma, normalizado para comparar.
 *
 * Un importe que llega como 75000000 y otro como "75.000.000,00" son el mismo importe; "LA ESTRELLA"
 * y "la estrella" el mismo cliente. Lo que NO se toca es la magnitud: 75.000.000 y 75.000.001 son
 * datos distintos y la decisión no puede saltar de uno al otro.
 */
export function normalizarValor(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : ''
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  return String(v).trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * NÚCLEO PURO: la forma canónica de un hallazgo — sus datos ordenados por clave.
 *
 * El conjunto de claves ES parte de la forma. Una decisión declarada sobre `{importe}` no cubre un
 * hallazgo que hoy trae `{importe, cuit}`: si el control empieza a mirar un campo más, las decisiones
 * viejas caducan solas en vez de seguir aplicando sobre una identidad que ya no es la misma.
 */
export function formaDe(datos = {}) {
  return Object.keys(datos).sort()
    .map((k) => `${k}=${normalizarValor(datos[k])}`)
    .join('|')
}

/** Hash corto de la forma. Se compara la forma; el hash es para dejarlo escrito en un log. */
export const huellaDe = (datos = {}) => createHash('sha1').update(formaDe(datos)).digest('hex').slice(0, 12)

/**
 * NÚCLEO PURO: qué le falta a una decisión para ser una decisión. Devuelve la lista de problemas.
 *
 * Se valida ANTES de aplicar, no al cargar: una entrada rota no puede pasar por "no había decisión"
 * ni por "estaba silenciado". Tiene que decir en voz alta que está rota.
 */
export function problemasDe(d = {}) {
  const p = []
  if (!String(d.control ?? '').trim()) p.push('sin control')
  if (!String(d.clave ?? '').trim()) p.push('sin clave del hallazgo')
  if (!d.forma || typeof d.forma !== 'object' || Array.isArray(d.forma) || !Object.keys(d.forma).length) {
    p.push('sin forma del dato: una decisión sin los datos sobre los que se tomó se aplicaría para siempre')
  }
  if (!String(d.decision ?? '').trim()) p.push('sin el texto de la decisión')
  if (!AUTORIDADES.includes(String(d.quien ?? '').trim())) {
    p.push(`"${d.quien ?? ''}" no puede decidir: sólo ${AUTORIDADES.join(', ')}`)
  }
  if (!esFecha(d.cuando)) p.push('sin fecha de la decisión (YYYY-MM-DD)')
  if (d.hasta !== undefined && !esFecha(d.hasta)) p.push('"hasta" tiene que ser YYYY-MM-DD')
  return p
}

/**
 * NÚCLEO PURO: el veredicto para UN hallazgo contra el registro.
 *
 * Estados, y ninguno es silencioso salvo el primero:
 *   · `sin-decision`  nadie lo miró           → sigue gritando
 *   · `aplica`        misma clave, misma forma → se libera (contado y listado, sin ⚠)
 *   · `otra-forma`    misma clave, dato CAMBIÓ → sigue gritando, y se dice que la decisión caducó
 *   · `vencida`       la decisión tenía plazo  → sigue gritando
 *   · `invalida`      la entrada está rota     → sigue gritando, y se dice qué le falta
 *
 * @param {string} control  el nombre del control, tal como lo declara el generador
 * @param {{clave:string, forma:object}} hallazgo
 * @param {{decisiones:Array}} registro
 * @param {string} hoy  fecha ISO para evaluar `hasta` (inyectada: un control no depende del reloj)
 */
export function veredicto(control, hallazgo, registro = { decisiones: [] }, hoy = new Date().toISOString().slice(0, 10)) {
  const candidatas = (registro.decisiones ?? []).filter((d) => (
    String(d.control ?? '') === control && String(d.clave ?? '') === String(hallazgo.clave)
  ))
  if (!candidatas.length) return { estado: 'sin-decision' }
  const forma = formaDe(hallazgo.forma ?? {})
  for (const d of candidatas) {
    const problemas = problemasDe(d)
    if (problemas.length) return { estado: 'invalida', decision: d, problemas }
    if (formaDe(d.forma) !== forma) {
      return {
        estado: 'otra-forma',
        decision: d,
        porQue: `el dueño decidió sobre ${formaDe(d.forma)} y hoy el dato es ${forma}`,
      }
    }
    if (d.hasta && d.hasta < hoy) return { estado: 'vencida', decision: d, porQue: `la decisión valía hasta el ${d.hasta}` }
    return { estado: 'aplica', decision: d }
  }
  return { estado: 'sin-decision' }
}

/**
 * NÚCLEO PURO: parte una lista de hallazgos en los que siguen gritando y los que el dueño liberó.
 *
 * `vivos` es lo que ocupa la línea de aviso y lo que hace fallar un paso si el control así lo decide.
 * `silenciados` se cuenta y se lista. `caducadas` es el subconjunto de vivos que TENÍA una decisión y
 * ya no la tiene: son los que hay que volver a preguntar, y por eso viajan aparte.
 */
export function aplicarDecisiones(control, hallazgos = [], registro = { decisiones: [] }, hoy) {
  const vivos = []; const silenciados = []; const caducadas = []; const rotas = []
  for (const h of hallazgos) {
    const v = veredicto(control, h, registro, hoy)
    if (v.estado === 'aplica') { silenciados.push({ ...h, decision: v.decision }); continue }
    vivos.push(h)
    if (v.estado === 'otra-forma' || v.estado === 'vencida') caducadas.push({ ...h, decision: v.decision, porQue: v.porQue })
    if (v.estado === 'invalida') rotas.push({ ...h, decision: v.decision, problemas: v.problemas })
  }
  return { vivos, silenciados, caducadas, rotas }
}

/** Lee el registro del disco. Sin archivo o con JSON roto NO se silencia nada: los hallazgos gritan
 *  todos. Fallar cerrado acá significa ruido; fallar abierto significaría tapar un hallazgo real. */
export function leerRegistro(ruta = RUTA_REGISTRO) {
  try {
    const j = JSON.parse(readFileSync(ruta, 'utf8'))
    return { decisiones: Array.isArray(j.decisiones) ? j.decisiones : [], _ruta: ruta }
  } catch (e) {
    return { decisiones: [], _error: e.message, _ruta: ruta }
  }
}

const ddmmaa = (iso) => (esFecha(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : String(iso ?? ''))

/**
 * LA VOZ DEL REGISTRO, EN UN SOLO LUGAR.
 *
 * Los silenciados salen SIN `⚠` a propósito: ese carácter es lo que el pipeline levanta de la salida
 * para reportar el paso entre los que "no cierran" (ver `flujo-caja-rehacer-todo.mjs`). Salen igual,
 * contados y con el texto del dueño, porque liberar no es callar. Lo que sí lleva `⚠` es una decisión
 * caducada o rota: eso es trabajo nuevo, no ruido viejo.
 */
export function explicarDecisiones(r, log = console.log, { detalle = (h) => h.clave } = {}) {
  if (r.silenciados.length) {
    log(`  · ${r.silenciados.length} hallazgo(s) con decisión del dueño — no ocupan la línea de aviso, se siguen contando:`)
    for (const s of r.silenciados) {
      log(`      ${detalle(s)} → "${s.decision.decision}" (${s.decision.quien}, ${ddmmaa(s.decision.cuando)})`)
    }
  }
  for (const c of r.caducadas) {
    log(`  ⚠ la decisión del dueño sobre ${detalle(c)} YA NO APLICA: ${c.porQue}. Vuelve a avisar hasta que la decida de nuevo.`)
  }
  for (const x of r.rotas) {
    log(`  ⚠ hay una decisión cargada para ${detalle(x)} que NO se puede usar: ${x.problemas.join(' · ')}`)
  }
}

/** El registro leído del disco y aplicado de una: lo que usa un control en una línea. */
export function decidir(control, hallazgos, { ruta = RUTA_REGISTRO, hoy } = {}) {
  return aplicarDecisiones(control, hallazgos, leerRegistro(ruta), hoy)
}

/**
 * Las decisiones USABLES de un control, sin hallazgos que cruzar.
 *
 * Existe para el único control que no enumera sus hallazgos en JavaScript: el de cobros duplicados
 * vive como fórmula dentro de la pestaña, y la liberación tiene que viajar DENTRO de esa fórmula. Las
 * entradas rotas se descartan acá mismo — una decisión sin autoridad o sin forma no puede terminar
 * convertida en una condición del Sheet que nadie puede auditar.
 */
export function decisionesDe(control, { ruta = RUTA_REGISTRO, hoy = new Date().toISOString().slice(0, 10) } = {}) {
  return (leerRegistro(ruta).decisiones ?? []).filter((d) => (
    String(d.control ?? '') === control && !problemasDe(d).length && !(d.hasta && d.hasta < hoy)
  ))
}

/** Cómo se lee una decisión adentro de una pestaña: quién, cuándo y su palabra. Nunca lleva `⚠`. */
export function rotuloDecision(d) {
  return `✓ ${ddmmaa(d.cuando)} · lo revisó el ${d.quien}: "${d.decision}"`
}
