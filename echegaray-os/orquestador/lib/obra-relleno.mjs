// LA PROPUESTA DE RELLENO DE LA COLUMNA «Obra» — Compras L y Cobranzas H, en seco. NÚCLEO PURO.
//
// ═══ POR QUÉ (dueño, 14/09/2026) ═══
//
// La columna nace vacía en ~1.050 filas de 2026. Llenarla a mano es inviable y llenarla a ciegas
// fabrica la decisión que la columna registra. Lo que se hace es PROPONER cada valor con su fuerza,
// y darle al dueño la lista de lo que no se puede decidir sin él. Nada de acá escribe.
//
// ═══ LOS NIVELES ═══
//
//   alta     — la regla que ya escriben el sync y el cargador: alias o nombre exacto, ES-ADM/ES-TAL por
//              la J; en Cobranzas, la OC cargada en esa obra.
//   media    — el cliente tiene UNA sola obra; o en Cobranzas el texto nombra una obra por alias; o
//              las palabras de la K son EXACTAMENTE las de un alias/nombre de UNA obra del cliente,
//              en otro orden («Planta de BSA» = alias «bsa planta»).
//   baja     — las palabras de la K están CONTENIDAS en las de una sola obra del cliente («Bases de
//              Tanque» ⊂ «bases tanque so2»); o la regla de hoy contradice la asignación guardada.
//   ambigua  — nada de lo anterior. Va a la lista del dueño con sus candidatas.
//   fuera_de_compras — impuestos, cargas, financieros (`rubro-caja.mjs`): no llevan obra.
//
// «Sin obra – X» aparece como CANDIDATA, nunca como propuesta: es una decisión del dueño, y deducirla
// de una K vacía es exactamente fabricarla. Y ninguna coincidencia por palabras se acepta si toca a
// dos obras: única o nada, como en el resto del repo.

import { normAlias } from './jornales-a-registros-hh.mjs'
import { FIJOS, rotuloDeObra, rotuloSinObra } from './obra-destino.mjs'
import { referenciaDeCompra, rotulosDeDetalle } from './compras-obra-asignada.mjs'
import { resolverObraDeCobranza } from './cobranza-obra.mjs'
import { obraParaLaColumna, pestanaDelComprobante, PESTANA_COMPRAS } from './comprobantes/obra-y-destino.mjs'

export const CONFIANZA = Object.freeze({
  ALTA: 'alta', MEDIA: 'media', BAJA: 'baja', AMBIGUA: 'ambigua', FUERA: 'fuera_de_compras',
})

/** «ME - », «SF - »: el prefijo de cliente del formato «CÓDIGO - NOMBRE» (14/09/2026). */
const PREFIJO = /^\s*[A-Z]{2,3}\s*-\s*/

/** Las palabras que nombran. Los números cuentan aunque sean de un dígito: «Galpón 7» ≠ «Galpón 9». */
export function palabras(texto) {
  return new Set(normAlias(texto).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 || /\d/.test(w)))
}

const esCodigoDeObra = (o) => /^OB-/i.test(String(o?.codigo ?? ''))
const fijo = (codigo) => {
  const f = FIJOS.find((x) => x.codigo === codigo)
  return rotuloDeObra({ codigo: f.codigo, nombre: f.nombre })
}
const prop = (valor, confianza, via, porque, extra = {}) =>
  ({ valor, obra_id: null, confianza, via, porque: porque ?? null, candidatos: [], guardada: null, ...extra })

/**
 * Las obras vivas con código de cada cliente canónico, con los conjuntos de palabras que las nombran:
 * su nombre sin prefijo y cada alias (un alias de una obra fusionada nombra a la viva).
 */
export function indiceDePalabras({ alias = new Map(), canonicas = [] } = {}, destinos) {
  const viva = (id) => {
    const o = destinos.porId.get(id)
    return destinos.porId.get(o?.fusionada_en) ?? o
  }
  const porObra = new Map()
  for (const o of canonicas) {
    const cliente = destinos.cat.clienteDe(o.cliente_texto)
    if (o.fusionada_en || !esCodigoDeObra(o) || !cliente) continue
    porObra.set(o.id, { obra_id: o.id, cliente, rotulo: rotuloDeObra(o), conjuntos: [palabras(String(o.nombre ?? '').replace(PREFIJO, ''))] })
  }
  for (const [a, id] of alias) porObra.get(viva(id)?.id)?.conjuntos.push(palabras(a))
  const porCliente = new Map()
  for (const x of porObra.values()) porCliente.set(x.cliente, [...(porCliente.get(x.cliente) ?? []), x])
  return porCliente
}

const igual = (a, b) => a.size === b.size && [...a].every((w) => b.has(w))
const contenida = (a, b) => a.size > 0 && [...a].every((w) => b.has(w))

/** La K contra las obras del cliente, por palabras. Primero igualdad, después contención. Única o nada. */
export function obraPorPalabras(detalle, obras = []) {
  for (const [confianza, cumple, dice] of [[CONFIANZA.MEDIA, igual, 'tiene las mismas palabras que'], [CONFIANZA.BAJA, contenida, 'está contenida en']]) {
    for (const rotulo of rotulosDeDetalle(detalle)) {
      const k = palabras(rotulo)
      if (!k.size) continue
      const hits = obras.filter((o) => o.conjuntos.some((c) => cumple(k, c)))
      if (hits.length === 1) return { obra: hits[0], confianza, porque: `columna K «${rotulo}» ${dice} ${hits[0].rotulo}` }
    }
  }
  return null
}

/** Una propuesta que contradice la asignación que el sync ya guardó baja a «baja» y lo dice. */
function conGuardada(p, guardada) {
  const g = guardada?.obra_id ?? null
  if (!g || !p.obra_id || g === p.obra_id) return { ...p, guardada: g }
  return { ...p, confianza: CONFIANZA.BAJA, guardada: g, porque: `${p.porque}; la asignación guardada dice ${g}` }
}

/**
 * LA PROPUESTA PARA UNA FILA DE `compra_sheet`.
 * @param {object} f fila de compra_sheet (fila, sheet_id, proveedor, unidad_negocio, obra_texto, detalle_obra, concepto)
 * @param {{destinos:object, palabras:Map, guardadas?:Map}} ctx
 */
export function propuestaCompra(f, ctx) {
  const c = { proveedor: f.proveedor, unidad: f.unidad_negocio, obra: f.obra_texto, detalle: f.detalle_obra, concepto: f.concepto }
  const { pestana, rubro } = pestanaDelComprobante(c)
  if (pestana !== PESTANA_COMPRAS) return prop(null, CONFIANZA.FUERA, 'rubro', `rubro «${rubro}»: va a «${pestana}»`)
  const guardada = ctx.guardadas?.get(referenciaDeCompra(f)) ?? null
  const r = obraParaLaColumna(c, ctx.destinos)
  if (r.valor) {
    const confianza = r.via === 'unica_obra_del_cliente' ? CONFIANZA.MEDIA : CONFIANZA.ALTA
    return conGuardada(prop(r.valor, confianza, r.via ?? 'columna_j', r.porque, { obra_id: r.obra_id }), guardada)
  }
  // La Unidad contradice lo que la J dice: cuál de las dos está mal lo decide quien las escribió.
  if (/^Unidad «/.test(r.porque ?? '')) return prop(null, CONFIANZA.AMBIGUA, 'unidad', r.porque, { guardada: guardada?.obra_id ?? null })
  const a = ctx.destinos.asignar({ obra_texto: f.obra_texto, detalle_obra: f.detalle_obra })
  if (!a.cliente) {
    const estructura = normAlias(f.unidad_negocio) === 'estructura'
    return prop(null, CONFIANZA.AMBIGUA, a.via, r.porque, { candidatos: estructura ? FIJOS.map((x) => fijo(x.codigo)) : [] })
  }
  const obras = ctx.palabras.get(a.cliente) ?? []
  const candidatos = [...obras.map((o) => o.rotulo), rotuloSinObra(a.cliente)]
  const x = obraPorPalabras(f.detalle_obra, obras)
  if (x) return conGuardada(prop(x.obra.rotulo, x.confianza, 'palabras', x.porque, { obra_id: x.obra.obra_id, candidatos }), guardada)
  return prop(null, CONFIANZA.AMBIGUA, a.via, r.porque, { candidatos, guardada: guardada?.obra_id ?? null })
}

/**
 * EL DICCIONARIO DE `cobranza-obra.mjs` RECORTADO AL CLIENTE — igual que la SQL de `cobranza_imputacion`
 * y que `cobranza-obra.pg.test.mjs`. La vista no sirve desde el orquestador: filtra por `ve_economia()`
 * y sin sesión de usuario devuelve cero filas.
 */
export function diccionariosDeCobranzas({ ordenes = [], alias = [], bolsas = [], fusion = new Map() } = {}, { normObra, numeroCanonico }) {
  const diccDe = (clienteId) => {
    const obraPorOc = new Map()
    for (const o of ordenes) {
      if (o.cliente_id !== clienteId) continue
      const canon = numeroCanonico(o.numero_canonico ?? o.numero)
      const viva = fusion.get(o.obra_id)
      if (!canon || !viva) continue
      obraPorOc.set(canon, obraPorOc.has(canon) && obraPorOc.get(canon) !== viva ? null : viva)
    }
    for (const [k, v] of obraPorOc) if (!v) obraPorOc.delete(k)
    const aliasesLibres = alias
      .filter((a) => a.en_texto_libre && a.cliente_id === clienteId && ['obra', 'mantenimiento'].includes(a.clasificacion))
      .map((a) => ({ alias: a.alias, obraId: fusion.get(a.obra_id) }))
    return { obraPorOc, aliasesLibres }
  }
  const bolsaDe = (etiqueta) => {
    const b = bolsas.find((x) => x.alias === normObra(etiqueta))
    return b ? fusion.get(b.obra_id) : null
  }
  return { diccDe, bolsaDe }
}

/**
 * LA PROPUESTA PARA UNA FILA DE `cobranzas`. OC → alta · alias → media · bolsa del cliente → ambigua
 * (la bolsa es «no se pudo», no una obra probada).
 */
export function propuestaCobranza(f, ctx) {
  const r = resolverObraDeCobranza(f, { ...ctx.cobranzas.diccDe(f.cliente_id), bolsa: ctx.cobranzas.bolsaDe(f.obra_cliente) })
  const o = r.obraId ? ctx.destinos.porId.get(r.obraId) : null
  const cliente = ctx.destinos.cat.clienteDe(o?.cliente_texto) ?? ctx.destinos.cat.clienteDe(f.obra_cliente) ?? null
  const obras = cliente ? (ctx.palabras.get(cliente) ?? []) : []
  const candidatos = [...obras.map((x) => x.rotulo), ...(cliente ? [rotuloSinObra(cliente)] : [])]
  if (!o || r.imputacion === 'cliente') return prop(null, CONFIANZA.AMBIGUA, r.imputacion ?? 'sin_imputacion', r.porque, { candidatos })
  if (!esCodigoDeObra(o)) return prop(null, CONFIANZA.AMBIGUA, r.imputacion, `la obra ${o.nombre} no tiene código interno`, { candidatos })
  const confianza = r.imputacion === 'oc' ? CONFIANZA.ALTA : CONFIANZA.MEDIA
  return prop(rotuloDeObra(o), confianza, r.imputacion, r.porque, { obra_id: o.id, candidatos })
}

/** ¿Va a la lista del dueño? Lo ambiguo y lo de confianza baja. */
export const paraElDueno = (p) => p.confianza === CONFIANZA.AMBIGUA || p.confianza === CONFIANZA.BAJA
