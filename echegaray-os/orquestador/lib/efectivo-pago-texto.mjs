// LO QUE SE PAGÓ EN EFECTIVO, ESCRITO EN EL CANAL EFECTIVO — gramática pura, sin base ni modelo.
//
// ═══ EL PEDIDO (dueño, 30/09/2026) ═══
//
// «arreglar la carga de efectivo por lenguaje natural en el chat; intenté dos cargas y las dos fallaron» y
// «necesito cargarle pagos a subcontratistas también en lenguaje natural por el canal efectivo». Los mensajes
// que fallaron, textuales:
//
//   «hoy le pague 100 a rodrigo»
//   «hoy le pague 150000 de adelanto a emiliano maldonado»
//   «se pagaron 220000 en efectivo de arreglo de fordf100»
//
// Los dos primeros son PAGOS A CUENTA DE LA LIQUIDACIÓN de una persona del plantel, en efectivo; el tercero es un
// GASTO pagado en efectivo sin ticket. A éstos se suma el pago a un SUBCONTRATISTA. Este archivo sólo LEE el
// mensaje (con el padrón que le pasan) y dice qué es y qué falta: no escribe nada ni llama a nadie.
//
// ═══ QUÉ NO ES ESTO ═══
//
//   · «150 a Jorge», «le di 150 a Jorge»: es la ENTREGA de plata a rendir (`entregas-efectivo`). Acá hace falta un
//     verbo de PAGO (pagué, se pagaron, compré, transferí, abonamos) o «adelanto»/«a cuenta» con una persona.
//   · varias líneas: es la libreta. Un pago suelto es una sola línea.
//   · un cheque: tiene su propio circuito.
import { leerImporte, leerFechaAdelanto, elegirEmpleado, armarPadron } from './adelanto-sueldo-texto.mjs'
import { claveDeLinea } from './libreta-texto.mjs'

export { armarPadron }

export const plano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Verbos de PAGO, sin acentos («pagué» → «pague»). «di» suelto NO está: «le di 150» es una entrega.
const RE_VERBO_PAGO = /\b(?:pagu(?:e|ey|amos)|pagaron|pago|pagado|abon(?:e|amos|aron)|compr(?:e|amos|aron)|transfer(?:i|imos|io)|deposit(?:e|amos)|cancel(?:e|amos)|gast(?:e|amos))\b/
const RE_PAGARON_CON_SE = /\bse (?:pago|pagaron|abono|abonaron|compro|compraron|gasto|gastaron)\b/
const RE_DATIVO = /\ble (?:pague|pagamos|abone|abonamos|transferi|transferimos|deposite)\b|\bles (?:pague|pagamos)\b/
const RE_A_CUENTA = /\badelant(?:o|os|e|ar|ado|ada)\b|\ba cuenta\b|\banticip(?:o|os|e)\b|\bsueldo\b|\bquincena\b/
const RE_EN_EFECTIVO = /\ben efectivo\b|\bcash\b|\ben mano\b/
const RE_TRANSFERENCIA = /\btransfer(?:i|imos|io|encia)\b|\bdeposit(?:e|amos)\b/
const RE_CHEQUE = /\bech?eq(?:ue)?s?\b|\bcheques?\b/
const RE_ENTREGA_ER = /\ber-?\d{2,}\b/
// Lo que dice que es un vehículo o su gasto: el tipo de costo es Indirecto (no impacta en una obra).
const RE_RODADO = /\b(?:camioneta|camion|auto|rodado|vehiculo|hilux|amarok|ranger|f-?100|ford|toyota|volkswagen|fiat|patente|nafta|gasoil|combustible|neumaticos?|cubiertas?|aceite|service|taller|mecanico)\b/

// Palabras que aparecen en muchos nombres de proveedor y no distinguen a ninguno.
const GENERICAS = new Set(`
  srl sa sas sociedad anonima responsabilidad limitada hermanos hnos construcciones constructora materiales servicios
  ferreteria corralon obras obra sanjuan san juan argentina arg cia compania sucesores
`.split(/\s+/).filter(Boolean))
const VACIAS = new Set(`
  hoy ayer le les se me te mi su sus lo la el los las al del de en por para con sin un una unos unas y o a
  pague pagamos pagaron pago pagado abone abonamos compre compramos transferi transferimos deposite gaste
  efectivo cash mano adelanto cuenta anticipo sueldo quincena pesos peso mil lucas plata
  cargar cargalo anota anotalo registra registralo favor porfa que del
`.split(/\s+/).filter(Boolean))

const palabrasDe = (t) => plano(t).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
const compacto = (t) => plano(t).replace(/[^a-z0-9]/g, '')
const util = (w) => w.length >= 4 && !GENERICAS.has(w) && !VACIAS.has(w) && !/^\d+$/.test(w)
export const pesos = (n) => `$ ${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
export const ddmm = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`

/**
 * ¿Es de este especialista, mirando sólo la FORMA? Un verbo de pago (o «adelanto»/«a cuenta») y un importe, en
 * una sola línea, sin foto ni «ER-nnnn». La base no se consulta acá: el padrón decide después QUÉ pago es.
 * @returns {boolean}
 */
export function pareceUnPago(texto) {
  const t = plano(texto).trim()
  if (!t || t.length > 300 || t.includes('\n')) return false
  // «ER-nnnn» ya no la excluye: «pagué 50.000 de flete con la ER-0021» es un pago con plata de una entrega.
  if (RE_CHEQUE.test(t)) return false
  // Sin importe sólo se reclama «le pagué a X»: el bot contesta qué entendió y pide el importe (no calla).
  if (!/\d/.test(t) && !/\b(?:mil|lucas|millon|millones)\b/.test(t) && !RE_DATIVO.test(t)) return false
  return RE_VERBO_PAGO.test(t) || RE_PAGARON_CON_SE.test(t) || RE_DATIVO.test(t) && /\d/.test(t)
    || RE_A_CUENTA.test(t) && /\d/.test(t)
}

// «con la plata de Maldonado», «del efectivo de Nievas», «de la entrega de Nievas»: plata que tiene otra persona.
// «la plata de la caja / de la oficina» NO es de nadie: es la caja.
const RE_PLATA_DE_ALGUIEN = /\b(?:de|con|del)(?: la| el)? (?:plata|efectivo|entrega|rendicion)(?: de| a)? (?!la\b|el\b|caja|oficina|cajon)[a-z]{3,}/
// El que paga puede ir de sujeto: «Nievas le pagó 200.000 a Nasser».
const RE_SUJETO_PAGA = /^(?:hoy |ayer )?([a-z]{3,}(?: [a-z]{3,})?) (?:le |les )?(?:pago|pagaron|abono|abonaron|gasto|compro|transferio)\b/
const RE_NO_NOMBRE = /^(?:se|hoy|ayer|ya|yo|nosotros|alguien|el|la)$/

/** ¿Qué entrega nombra el texto por su código? «ER-0021» → 21. */
export function codigoDeEntrega(texto) {
  const m = plano(texto).match(/\ber-?(\d{2,})\b/)
  return m ? Number(m[1]) : null
}

/**
 * Los nombres de quien tiene la plata, tal como el texto los dice: «con la plata de Maldonado», «de la entrega de
 * Nievas», o el sujeto («Nievas le pagó…»). Sólo palabras; quién es lo decide el que las cruza con las entregas.
 * @returns {{palabras:string[], sujeto:boolean}|null}
 */
export function tenedorDicho(texto) {
  const t = plano(texto)
  const m1 = t.match(/\b(?:de|con|del)(?: la| el)? (?:plata|efectivo|entrega|rendicion)(?: de| a)? (?!la\b|el\b|caja|oficina|cajon)([a-z]{3,}(?: [a-z]{3,})?)/)
  if (m1) return { palabras: m1[1].split(' ').filter((w) => w.length >= 4), sujeto: false }
  const m2 = t.match(RE_SUJETO_PAGA)
  if (m2) {
    const palabras = m2[1].split(' ').filter((w) => w.length >= 4 && !RE_NO_NOMBRE.test(w) && w !== 'pago')
    return palabras.length ? { palabras, sujeto: true } : null
  }
  return null
}

/** El texto sin lo que sólo dice de dónde sale la plata, para que el que lee el pago no lo confunda con el destinatario. */
export function sinOrigenDeEntrega(texto) {
  return String(texto ?? '')
    .replace(/\b(?:con|de|del)(?: la| el)? (?:plata|efectivo|entrega|rendici[oó]n)(?: de| a)? (?!la\b|el\b|caja|oficina|cajon)[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}(?: [A-Za-zÁÉÍÓÚáéíóúñÑ]{3,})?/gi, '')
    .replace(/\b(?:con|de|del)(?: la| el)? (?:entrega|plata a rendir)\b/gi, '')
    .replace(/\b(?:con|de|en)(?: la)? ER-?\d{2,}\b|\bER-?\d{2,}\b/gi, '')
    .replace(/^\s*(?:hoy |ayer )?[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}(?: [A-Za-zÁÉÍÓÚáéíóúñÑ]{3,})? (?=(?:le |les )?(?:pag[oó]|pagaron|abon[oó]|abonaron|gast[oó]|compr[oó]|transfiri[oó])\b)/i, (m) => (/^\s*(?:hoy|ayer)\b/i.test(m) ? m.match(/^\s*(?:hoy|ayer) /i)[0] : ''))
    .replace(/\s{2,}/g, ' ').trim()
}

/** ¿Dice de dónde salió la plata? «de la caja», «con la plata de ER-0012». */
export function dijoDeDondeSalio(texto) {
  const t = plano(texto)
  if (RE_ENTREGA_ER.test(t) || /\b(?:de|con) (?:la )?(?:entrega|plata a rendir|plata que tengo)\b/.test(t)) return 'entrega'
  if (RE_PLATA_DE_ALGUIEN.test(t)) return 'entrega'
  if (/\b(?:de|con|por|desde) (?:la )?(?:caja|oficina|cajon)\b|\bcaja\b/.test(t)) return 'caja'
  return null
}

/** La respuesta a «¿de la entrega o de la caja?». */
export function leerOrigen(texto) {
  const t = plano(texto).trim()
  if (/^(?:no|cancela(?:r|lo)?|dejalo|olvidalo|ninguno)$/.test(t)) return { cancelar: true }
  if (RE_ENTREGA_ER.test(t) || /\b(?:entrega|rendir|rendicion)\b/.test(t)) return { origen: 'entrega' }
  if (/\b(?:caja|oficina|cajon|la caja)\b/.test(t)) return { origen: 'caja' }
  return null
}

/** El importe: «100», «150000», «1.200.000», «20 mil», «8500*8». */
export const leerPlata = (texto) => leerImporte(texto)

/** Medio de pago: Efectivo salvo que el texto diga transferencia. */
export function formaDePago(texto) {
  return RE_TRANSFERENCIA.test(plano(texto)) ? 'Transferencia' : 'Efectivo'
}

/** ¿Hay un vehículo o un gasto de vehículo? */
export const esDeRodado = (texto) => RE_RODADO.test(plano(texto))

/**
 * El proveedor nombrado. Compara las palabras DISTINTIVAS de cada nombre (4+ letras, no genéricas, que no estén en
 * más de dos proveedores) con las del texto. Gana el que más palabras comparte; con empate se devuelven todos.
 * @param {string} texto
 * @param {Array<{id?:string, nombre:string, razon_social?:string|null, subcontratista?:boolean}>} proveedores
 * @returns {{proveedor?:object, candidatos?:object[]}}
 */
export function elegirProveedor(texto, proveedores = []) {
  const ws = new Set(palabrasDe(texto).filter(util))
  if (!ws.size) return {}
  const docs = new Map()
  const armados = proveedores.map((p) => {
    const pal = new Set([p.nombre, p.razon_social].filter(Boolean).flatMap(palabrasDe).filter(util))
    for (const w of pal) docs.set(w, (docs.get(w) ?? 0) + 1)
    return { p, pal }
  })
  const puntuados = armados.map(({ p, pal }) => {
    const hits = [...pal].filter((w) => ws.has(w) && (docs.get(w) ?? 0) <= 2)
    return { p, n: hits.length, de: pal.size }
  }).filter((x) => x.n > 0)
  if (!puntuados.length) return {}
  const max = Math.max(...puntuados.map((x) => x.n))
  const top = puntuados.filter((x) => x.n === max).map((x) => x.p)
  return top.length === 1 ? { proveedor: top[0] } : { candidatos: top }
}

/**
 * La obra nombrada: nombre o alias (normalizado) dentro del texto. La más larga gana.
 * @param {Array<{id:string, nombre:string, alias?:string[]}>} obras
 */
export function elegirObra(texto, obras = []) {
  const t = ` ${palabrasDe(texto).join(' ')} `
  let mejor = null
  for (const o of obras) {
    for (const a of [o.nombre, ...(o.alias ?? [])]) {
      const f = palabrasDe(a).join(' ')
      if (f.length >= 4 && t.includes(` ${f} `) && (!mejor || f.length > mejor.largo)) mejor = { o, largo: f.length }
    }
  }
  return mejor?.o ?? null
}

/** El rodado nombrado: patente o nombre («ford f100») comparado sin espacios ni guiones. */
export function elegirRodado(texto, rodados = []) {
  const c = compacto(texto)
  const hits = rodados.filter((r) => {
    const pat = compacto(r.patente)
    const nom = compacto(r.nombre)
    return (pat.length >= 5 && c.includes(pat)) || (nom.length >= 5 && c.includes(nom))
      || (compacto(r.codigo).length >= 5 && c.includes(compacto(r.codigo)))
  })
  return hits.length === 1 ? hits[0] : null
}

/**
 * Los subcontratos posibles para un pago. Con proveedor: los suyos. Sin proveedor pero con obra: los de esa obra
 * cuyo nombre o alcance comparte un tronco de 5 letras con una palabra del texto («plomero» ↔ «plomería»).
 * @returns {object[]}
 */
export function subcontratosPosibles(texto, { proveedor = null, obra = null, subcontratos = [] } = {}) {
  let lista = subcontratos
  if (proveedor) {
    lista = lista.filter((s) => (s.proveedor_id && proveedor.id && s.proveedor_id === proveedor.id)
      || (s.proveedor_texto && plano(s.proveedor_texto) === plano(proveedor.nombre)))
    if (obra) lista = lista.filter((s) => s.obra_id === obra.id)
    return lista
  }
  if (!obra) return []
  const troncos = new Set(palabrasDe(texto).filter((w) => w.length >= 5 && !GENERICAS.has(w) && !VACIAS.has(w)).map((w) => w.slice(0, 5)))
  const propias = new Set(palabrasDe(obra.nombre).map((w) => w.slice(0, 5)))
  return lista.filter((s) => s.obra_id === obra.id && palabrasDe(`${s.nombre} ${s.alcance ?? ''} ${s.proveedor_texto ?? ''}`)
    .some((w) => w.length >= 5 && troncos.has(w.slice(0, 5)) && !propias.has(w.slice(0, 5))))
}

/**
 * NÚCLEO PURO. Lee el mensaje y dice qué pago es, o qué falta.
 *
 * @param {string} texto
 * @param {object} ctx
 * @param {string} ctx.hoy ISO de San Juan
 * @param {Array} [ctx.padron] ya armado (`armarPadron`)
 * @param {Array} [ctx.proveedores] {id,nombre,razon_social,subcontratista}
 * @param {Array} [ctx.obras] {id,nombre,alias[]}
 * @param {Array} [ctx.subcontratos] {id,obra_id,obra_nombre,proveedor_id,proveedor_texto,nombre,alcance,precio_contratado}
 * @param {Array} [ctx.rodados] {id,codigo,nombre,patente}
 * @returns {{estado:'nada'}
 *   |{estado:'fuera', motivo:string}
 *   |{estado:'pregunta', falta:'monto'|'persona'|'persona_ambigua'|'proveedor_ambiguo'|'subcontrato_varios', ...}
 *   |{estado:'listo', tipo:'sueldo'|'gasto'|'subcontrato', ...}}
 */
export function interpretarPago(texto, { hoy, padron = [], proveedores = [], obras = [], subcontratos = [], rodados = [] } = {}) {
  if (!pareceUnPago(texto)) return { estado: 'nada' }
  const t = plano(texto)
  const fecha = leerFechaAdelanto(texto, hoy)
  const monto = leerPlata(texto)
  const forma = formaDePago(texto)
  const quien = elegirEmpleado(texto, padron)
  const prov = elegirProveedor(texto, proveedores)
  const obra = elegirObra(texto, obras)
  const dativo = RE_DATIVO.test(t) || RE_A_CUENTA.test(t)
  const base = { fecha, ...(monto ?? {}) }

  // ¿A una PERSONA del plantel? Hace falta que el texto la nombre Y que sea un pago a ella (le pagué, adelanto,
  // a cuenta, sueldo) — «compré 3 bolsas de cemento» no es un pago a nadie aunque haya un Cemento en el padrón.
  // Si el mismo nombre es también de un proveedor, sin «adelanto»/«a cuenta»/«le pagué» gana el proveedor.
  const nombraPersona = Boolean(quien.persona || quien.candidatos?.length)
  const conPersona = nombraPersona && (dativo || (RE_VERBO_PAGO.test(t) && !prov.proveedor && !prov.candidatos))
  if (conPersona && !(prov.proveedor && !RE_A_CUENTA.test(t))) {
    if (forma === 'Transferencia') {
      return { estado: 'fuera', motivo: 'transferencia_a_persona' }
    }
    if (!monto) return { estado: 'pregunta', falta: 'monto', tipo: 'sueldo', ...base, candidatos: quien.persona ? [quien.persona] : quien.candidatos }
    if (quien.candidatos?.length && !quien.persona) return { estado: 'pregunta', falta: 'persona_ambigua', tipo: 'sueldo', ...base, candidatos: quien.candidatos }
    if (quien.desconocido) return { estado: 'pregunta', falta: 'persona', tipo: 'sueldo', ...base, desconocido: quien.desconocido, candidatos: quien.candidatos ?? [] }
    return { estado: 'listo', tipo: 'sueldo', ...base, persona: quien.persona }
  }

  if (!monto) return { estado: 'pregunta', falta: 'monto', tipo: 'gasto', ...base }

  // «le pagué 500 a Fulanito»: dativo + alguien que no es del plantel ni proveedor ni nada conocido. Se dice, no
  // se carga como gasto con «Fulanito» perdido en el concepto.
  if (RE_DATIVO.test(t) && quien.desconocido && !prov.proveedor && !prov.candidatos) {
    return { estado: 'pregunta', falta: 'persona', tipo: 'sueldo', ...base, desconocido: quien.desconocido, candidatos: quien.candidatos ?? [] }
  }

  if (prov.candidatos?.length) return { estado: 'pregunta', falta: 'proveedor_ambiguo', ...base, candidatos: prov.candidatos }

  const limpio = String(texto).trim().replace(/\s+/g, ' ')
  const rodado = elegirRodado(texto, rodados)
  const propio = { ...base, forma, obra, proveedor: prov.proveedor ?? null, rodado, concepto: limpio }

  // ¿A un SUBCONTRATISTA? Un proveedor que tiene paquetes de subcontrato, o la obra + el oficio («el plomero de
  // Messina»). Un proveedor común («Hormiserv» si no tiene subcontrato) es un gasto con proveedor, no un subcontrato.
  const posibles = subcontratosPosibles(texto, { proveedor: prov.proveedor?.subcontratista ? prov.proveedor : null, obra, subcontratos })
  const esSub = (prov.proveedor?.subcontratista === true) || (!prov.proveedor && posibles.length > 0)
  if (esSub) {
    const obras_ = [...new Set(posibles.map((s) => s.obra_id))]
    if (posibles.length > 1 && !obra) return { estado: 'pregunta', falta: 'subcontrato_varios', tipo: 'subcontrato', ...propio, candidatos: posibles }
    if (posibles.length > 1 && obras_.length === 1) return { estado: 'pregunta', falta: 'subcontrato_varios', tipo: 'subcontrato', ...propio, candidatos: posibles }
    const sub = posibles[0] ?? null
    const proveedor = prov.proveedor ?? (sub ? { id: sub.proveedor_id, nombre: sub.proveedor_texto ?? sub.nombre } : null)
    return {
      estado: 'listo', tipo: 'subcontrato', ...propio, proveedor, subcontrato: sub,
      obra: sub ? { id: sub.obra_id, nombre: sub.obra_nombre } : obra,
      tipoCosto: 'Directo',
    }
  }

  return { estado: 'listo', tipo: 'gasto', ...propio, tipoCosto: rodado || esDeRodado(texto) ? 'Indirecto' : (obra ? 'Directo' : null) }
}

/**
 * El ítem de Compras (el mismo que arma la libreta): Efectivo, contado, pagado, sin comprobante. Nunca «A rendir».
 * El concepto lleva el texto tal cual, el rodado y el tipo de costo deducido.
 */
export function itemDePago(l) {
  const partes = [l.concepto, l.forma === 'Efectivo' ? 'sin comprobante' : 'sin comprobante · transferencia']
  if (l.rodado) partes.push(`rodado ${l.rodado.codigo}${l.rodado.patente ? ` ${l.rodado.patente}` : ''}`)
  if (l.subcontrato) partes.push(`subcontrato ${l.subcontrato.nombre}`)
  if (l.tipoCosto) partes.push(`tipo de costo: ${l.tipoCosto}${l.tipo === 'subcontrato' ? ' (subcontrato)' : ''}`)
  const comprobante = {
    fecha: l.fecha,
    concepto: partes.join(' · '),
    total: l.importe,
    formaPago: l.forma,
    condicion: 'Contado',
    pagado: l.importe,
  }
  if (l.proveedor?.nombre) comprobante.proveedor = l.proveedor.nombre
  if (l.obra?.nombre) comprobante.obra = l.obra.nombre
  return {
    origenCarga: 'libreta',
    clave: claveDeLinea({ fecha: l.fecha, concepto: l.concepto, monto: l.importe }),
    comprobante,
  }
}

/** Lo que el bot pregunta cuando falta algo. Siempre dice qué entendió. */
export function textoDePregunta(r) {
  const cuanto = r.importe ? ` de ${pesos(r.importe)}` : ''
  const lista = (r.candidatos ?? [])
  if (r.falta === 'monto') {
    return 'Entendí que es un pago en efectivo pero no encuentro el importe. Contestá en este hilo sólo el importe (por ejemplo **20.000** o **1.200.000**).'
  }
  if (r.falta === 'persona_ambigua') {
    return [`Entendí un pago en efectivo${cuanto} a una persona del plantel, pero hay más de una con ese nombre. Contestá en este hilo con el número:`, '',
      ...lista.map((p, i) => `${i + 1} · ${p.nombre}`)].join('\n')
  }
  if (r.falta === 'persona') {
    const quien = r.desconocido ? `**${r.desconocido}**` : 'la persona'
    return [`Entendí un pago en efectivo${cuanto} a ${quien}, pero no figura en el plantel ni entre los proveedores, así que no cargué nada.`,
      ...(lista.length ? ['¿Es alguno de éstos? Contestá en este hilo con el número:', '', ...lista.map((p, i) => `${i + 1} · ${p.nombre}`)]
        : ['Escribilo de nuevo con el apellido como figura en el legajo: «le pagué 100 a Maldonado».'])].join('\n')
  }
  if (r.falta === 'proveedor_ambiguo') {
    return [`Entendí un pago${cuanto}, pero el nombre puede ser más de un proveedor. Contestá en este hilo con el número:`, '',
      ...lista.map((p, i) => `${i + 1} · ${p.nombre}`)].join('\n')
  }
  if (r.falta === 'subcontrato_varios') {
    return [`Entendí un pago${cuanto} a un subcontratista, pero tiene más de un subcontrato activo. ¿De cuál? Contestá en este hilo con el número:`, '',
      ...lista.map((s, i) => `${i + 1} · ${s.obra_nombre ?? s.obra_id} · ${s.nombre}`)].join('\n')
  }
  if (r.falta === 'origen') {
    return `Entendí un pago${cuanto} en efectivo. ¿Lo pagaste con la plata de **${r.codigo}** o con la caja? Contestá en este hilo **caja** o **${r.codigo}**.`
  }
  return 'No entendí el pago. Escribilo, por ejemplo: «le pagué 100 a Rodrigo», «pagué 50.000 de gasoil» o «le pagué 500.000 a Nasser por Quattropani».'
}

/** La respuesta a una pregunta de lista: «1», «el 2», «Emiliano Gonzalez», «no». */
export function leerEleccion(texto, candidatos = []) {
  const t = plano(texto).trim()
  if (/^(?:no|cancela(?:r|lo)?|ninguno|ninguna|dejalo|olvidalo)$/.test(t)) return { cancelar: true }
  const n = t.match(/^(?:el |la |opcion |nro |numero )?(\d{1,2})$/)
  if (n) return candidatos[Number(n[1]) - 1] ? { elegido: candidatos[Number(n[1]) - 1] } : null
  const cand = candidatos.filter((c) => c?.nombre)
  if (cand.length) {
    const q = elegirEmpleado(texto, armarPadron(cand.map((c) => ({ id: c.id, nombre_completo: c.nombre, nombre_para_mostrar: c.nombre }))))
    if (q.persona && !q.desconocido) return { elegido: cand.find((c) => c.id === q.persona.id) ?? null }
  }
  return null
}
export { elegirEmpleado as elegirEmpleadoEnPadron }
