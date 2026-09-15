// «COMPLETALAS COMO CORRESPONDE» — la decisión de qué fila del relleno se escribe y con qué. NÚCLEO PURO.
//
// ═══ POR QUÉ (dueño, 15/09/2026) ═══
//
// `obra-relleno-dry.mjs` PROPONE (alta · media · baja · ambigua · fuera_de_compras) y no escribe. El dueño
// aprobó llenar la columna con estas reglas, y acá viven, separadas del script que las aplica, para que
// se puedan probar sin base ni Sheet:
//
//   alta · media                       → se escribe el valor propuesto.
//   ambigua, J = cliente con VARIAS obras vivas (San Francisco, LA ESTRELLA, MESSINA y sus alias)
//                                      → «Sin obra – <CLIENTE>», el rótulo exacto del desplegable.
//   ambigua, J = cliente con UNA obra  → esa obra (ARCOR → OB-0001).
//   ambigua, J = Taller / Administracion → ES-TAL / ES-ADM. En la práctica no queda ninguna: las que
//                                      la J resolvía ya son «alta»; las que quedaron ambiguas con esa J
//                                      lo son porque la UNIDAD las contradice, y ésas NO se escriben.
//   ambigua, J = Almacen               → no está definido a qué destino va: se lista, no se inventa.
//   baja · el resto de ambigua (proveedores que no son clientes de obra: MACRO, ADDATO, LIRIO…)
//                                      → NO se escriben; van a la lista del dueño.
//   fuera_de_compras                   → no se toca.
//   celda con valor (en el Sheet o `obra_celda` en la base) → NUNCA se pisa: lo escribió una persona o la app.
//
// Y todo valor que se escribe tiene que ser LETRA POR LETRA una opción del desplegable vivo: una regla
// que produce un rótulo que no existe lista la fila en vez de escribirla.

import { normAlias } from './jornales-a-registros-hh.mjs'
import { FIJOS, rotuloDeObra, rotuloSinObra } from './obra-destino.mjs'
import { PESTANAS } from './columnas-por-encabezado.mjs'
import { CONFIANZA } from './obra-relleno.mjs'

export const ACCION = Object.freeze({ ESCRIBIR: 'escribir', OMITIR: 'omitir', LISTAR: 'listar' })

export const REGLA = Object.freeze({
  ALTA_MEDIA: 'alta_o_media', SIN_OBRA: 'sin_obra_del_cliente', UNICA: 'unica_obra_del_cliente',
  ESTRUCTURA: 'estructura_por_j', YA_TIENE_VALOR: 'ya_tiene_valor', FUERA: 'fuera_de_compras',
  BAJA: 'baja', UNIDAD: 'unidad_contradice_la_j', ALMACEN: 'almacen_sin_destino_definido',
  NO_CLIENTE: 'no_es_cliente_de_obra', NO_ES_OPCION: 'valor_no_es_opcion_del_desplegable',
})

/** La J que ya dice estructura. Las mismas dos de `comprobantes/obra-y-destino.mjs`. */
const FIJO_POR_J = Object.freeze({ administracion: 'ES-ADM', taller: 'ES-TAL' })
const rotuloFijo = (codigo) => { const f = FIJOS.find((x) => x.codigo === codigo); return rotuloDeObra({ codigo: f.codigo, nombre: f.nombre }) }

/** La fila física de una cobranza: el ID de Cobranzas es `ROW()-4`. */
export const filaDeCobranza = (id) => Number(id) + PESTANAS.Cobranzas.primeraFila - 1

/** La clave con la que se mira si la celda ya tiene valor. */
export const claveDeCelda = (pestana, fila) => `${pestana}:${fila}`

/**
 * EL CSV DEL DRY, LEÍDO. Comillas dobles escapadas como `""`, saltos de línea adentro de comillas.
 * Devuelve objetos por encabezado. Sin librería: el dry lo escribe con estas mismas reglas (`aCsv`).
 */
export function parsearCsv(texto) {
  const filas = []
  let fila = []; let celda = ''; let entreComillas = false
  const t = String(texto ?? '').replace(/\r\n/g, '\n')
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i]
    if (entreComillas) {
      if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i += 1 } else entreComillas = false } else celda += c
    } else if (c === '"') entreComillas = true
    else if (c === ',') { fila.push(celda); celda = '' }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = '' }
    else celda += c
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila) }
  // `linea`, no `f`: el guardián de letras fijas (columnas-fijas.mjs) lee `f[0]` como una columna por posición.
  const [encabezado, ...datos] = filas.filter((linea) => linea.length > 1 || linea[0] !== '')
  if (!encabezado) return []
  return datos.map((linea) => Object.fromEntries(encabezado.map((k, i) => [k, linea[i] ?? ''])))
}

/**
 * EL CLIENTE QUE NOMBRA LA J. Primero el texto entero; si no, sus tramos separados por «/»
 * («IMOTOR/San Francisco/JAVI SANCHEZ» → SAN FRANCISCO). Único o nada: dos tramos que resuelven a
 * dos clientes distintos no dicen de quién es la fila.
 * @param {string} j @param {(texto:string)=>string|null} clienteDe normAlias(rótulo) → canónico
 */
export function clienteDeJ(j, clienteDe) {
  const entero = clienteDe(j)
  if (entero) return entero
  const hallados = new Set(String(j ?? '').split('/').map((x) => clienteDe(x.trim())).filter(Boolean))
  return hallados.size === 1 ? [...hallados][0] : null
}

const decision = (f, accion, regla, valor = null, detalle = null) => ({
  pestana: f.pestana, fila: f.pestana === 'Cobranzas' ? filaDeCobranza(f.id) : Number(f.fila), id: f.id,
  fecha: f.fecha, quien: f.quien, j: f.j, k: f.k, total: f.total, confianza: f.confianza, via: f.via,
  propuesto: f.valor || null, accion, regla, valor, detalle,
})

/** Escribir sólo si es una opción viva del desplegable; si no, listar nombrando el rótulo que no existe. */
function escribirSiEsOpcion(f, regla, valor, ctx) {
  if (ctx.opciones.has(valor)) return decision(f, ACCION.ESCRIBIR, regla, valor)
  return decision(f, ACCION.LISTAR, REGLA.NO_ES_OPCION, null, `«${valor}» no es una opción del desplegable vivo`)
}

function decidirAmbigua(f, ctx) {
  if (f.via === 'unidad') return decision(f, ACCION.LISTAR, REGLA.UNIDAD, null, f.porque)
  const j = normAlias(f.j)
  if (FIJO_POR_J[j]) return escribirSiEsOpcion(f, REGLA.ESTRUCTURA, rotuloFijo(FIJO_POR_J[j]), ctx)
  if (j === 'almacen') return decision(f, ACCION.LISTAR, REGLA.ALMACEN, null, 'la J dice Almacen y no hay destino definido para eso')
  const cliente = clienteDeJ(f.j, ctx.clienteDe)
  if (!cliente) return decision(f, ACCION.LISTAR, REGLA.NO_CLIENTE, null, f.porque)
  const vivas = ctx.obrasVivas.get(cliente) ?? []
  if (vivas.length === 1) return escribirSiEsOpcion(f, REGLA.UNICA, vivas[0], ctx)
  if (vivas.length > 1) return escribirSiEsOpcion(f, REGLA.SIN_OBRA, rotuloSinObra(cliente), ctx)
  return decision(f, ACCION.LISTAR, REGLA.NO_CLIENTE, null, `${cliente} no tiene obras vivas con código`)
}

/**
 * LA DECISIÓN PARA UNA FILA DEL CSV DEL DRY.
 * @param {object} f fila del csv (pestana, fila, id, j, valor, confianza, via, porque…)
 * @param {{opciones:Set<string>, obrasVivas:Map<string,string[]>, clienteDe:Function, ocupada:Map<string,string>}} ctx
 *   `opciones` = el desplegable vivo · `obrasVivas` = cliente canónico → rótulos de sus obras vivas con
 *   código · `ocupada` = claveDeCelda → lo que la celda ya dice (Sheet o base)
 */
export function decidirRelleno(f, ctx) {
  if (f.confianza === CONFIANZA.FUERA) return decision(f, ACCION.OMITIR, REGLA.FUERA)
  const fila = f.pestana === 'Cobranzas' ? filaDeCobranza(f.id) : Number(f.fila)
  const actual = ctx.ocupada.get(claveDeCelda(f.pestana, fila))
  if (actual) return decision(f, ACCION.OMITIR, REGLA.YA_TIENE_VALOR, null, `ya dice «${actual}»`)
  if (f.confianza === CONFIANZA.ALTA || f.confianza === CONFIANZA.MEDIA) return escribirSiEsOpcion(f, REGLA.ALTA_MEDIA, f.valor, ctx)
  if (f.confianza === CONFIANZA.BAJA) return decision(f, ACCION.LISTAR, REGLA.BAJA, null, f.porque)
  return decidirAmbigua(f, ctx)
}

export const planDeRelleno = (filas, ctx) => filas.map((f) => decidirRelleno(f, ctx))

const contar = (xs, clave) => {
  const c = {}
  for (const x of xs) c[clave(x)] = (c[clave(x)] ?? 0) + 1
  return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]))
}

/** Conteos por rótulo (lo que se escribe), por regla, por pestaña, y la lista de lo que NO se escribe. */
export function resumenDeRelleno(plan) {
  const escritas = plan.filter((d) => d.accion === ACCION.ESCRIBIR)
  const porPestana = {}
  for (const p of ['Compras', 'Cobranzas']) porPestana[p] = contar(plan.filter((d) => d.pestana === p), (d) => d.accion)
  return {
    filas: plan.length, escribir: escritas.length,
    porPestana, porRotulo: contar(escritas, (d) => d.valor), porRegla: contar(plan, (d) => `${d.accion}:${d.regla}`),
    noEscritas: plan.filter((d) => d.accion === ACCION.LISTAR),
  }
}

/** `n` filas repartidas a lo largo de la lista (no las primeras): la muestra de relectura del Sheet. */
export function muestraRepartida(xs, n = 20) {
  if (xs.length <= n) return [...xs]
  const paso = xs.length / n
  return Array.from({ length: n }, (_, i) => xs[Math.floor(i * paso)])
}

/** El resumen como líneas para la consola, con la lista de no escritas al final. */
export function textoDelResumen(r) {
  const lineas = [`filas: ${r.filas} · a escribir: ${r.escribir}`]
  for (const [p, c] of Object.entries(r.porPestana)) lineas.push(`  ${p}: ${JSON.stringify(c)}`)
  lineas.push('por rótulo (se escribe):')
  for (const [k, v] of Object.entries(r.porRotulo)) lineas.push(`  ${String(v).padStart(4)}  ${k}`)
  lineas.push('por regla:')
  for (const [k, v] of Object.entries(r.porRegla)) lineas.push(`  ${String(v).padStart(4)}  ${k}`)
  lineas.push(`NO se escriben (${r.noEscritas.length}), para el dueño:`)
  for (const d of r.noEscritas) {
    lineas.push(`  ${d.pestana} fila ${d.fila} [${d.id}] ${d.fecha} ${d.quien ?? ''} · J «${d.j ?? ''}» · K «${String(d.k ?? '').slice(0, 50)}» · $${d.total} → ${d.regla}${d.detalle ? `: ${d.detalle}` : ''}`)
  }
  return lineas
}
