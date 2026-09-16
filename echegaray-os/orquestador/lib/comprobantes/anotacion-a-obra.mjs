// LO ESCRITO A MANO → LA COLUMNA «Obra» (L) Y SU UNIDAD Y DETALLE. NÚCLEO PURO, CERO MODELO.
//
// ═══ EL DEFECTO (15/09/2026, fajo dc2d0273, 8 tickets del canal) ═══
//
// La visión SÍ transcribió lo manuscrito: «Estrella Filtraciones OFICINA Y FÁB. · c/c», «Ford XLS»,
// «QUATTROPANI», «Messino Dilucion», «SF Pisos Industriales». Y los 8 entraron con la columna «Obra»
// VACÍA, sin Unidad de Negocio, y con el historial del proveedor proponiendo «LA ESTRELLA» a
// confirmar. El dueño: «no está leyendo bien… ni lo escrito a mano y no está ubicando bien en las
// obras». Tenía razón por una razón concreta: `imputacionDeAnotacion` matchea la anotación contra el
// desplegable de la columna J —que son CLIENTES— y contra el vocabulario ya usado en la K. Ninguna de
// las dos listas contiene las obras. Nadie le preguntaba nunca al catálogo de obras.
//
// Acá se le pregunta. La anotación se resuelve contra `obra_canonica` (código, nombre, cliente y
// `obra_alias`), que es la MISMA fuente con la que el sync asigna la obra de una fila: si el cargador
// resolviera contra otra cosa, la fila cambiaría de obra en la hora siguiente.
//
// ═══ LO MANUSCRITO MANDA SOBRE EL HISTORIAL, Y ESO NO ES UN MATIZ ═══
//
// El historial es una estadística sobre OTROS gastos del mismo proveedor; la anotación es la decisión
// del dueño sobre ÉSTE. Por eso esto corre ANTES de `completarUno` y por eso lo que resuelve se
// escribe sin pedir confirmación.
//
// ═══ LA LÍNEA ENTRE TOLERAR Y ADIVINAR (la misma de `imputacion.mjs`) ═══
//
// Se tolera el plural, la abreviatura («FÁB.» por FÁBRICA), el error de tipeo y el error del OCR
// («Messino» por MESSINA) — porque eso es lo que dice una mano sobre un papel fotografiado. No se
// tolera el empate: **si la coincidencia no es única, no hay coincidencia** y la celda queda vacía
// con el motivo escrito. Imputar a la obra equivocada ensucia el margen de las dos y no lo nota nadie
// hasta el cierre.
//
// ═══ «Sin obra – CLIENTE» SE PROPONE, NO SE ESCRIBE ═══
//
// Cuando la anotación nombra al cliente y el cliente tiene varias obras, esto devuelve
// «Sin obra – X» con confianza POR DEBAJO del umbral de escritura. Es deliberado y es la única
// tensión que quedó viva con `obra-destino.mjs`: ahí el dueño decidió (14/09) que «Sin obra – X»
// significa «DECIDÍ que no va a ninguna», y deducir esa decisión de una anotación que no la dice
// sería fabricarla. Se devuelve para que el mensaje pueda ofrecerla como opción; no llega sola a la
// celda.

import { normalizar } from '../carga-comprobantes.mjs'
import { normAlias } from '../jornales-a-registros-hh.mjs'
import { DESTINO, FIJOS, rotuloDeObra, rotuloSinObra } from '../obra-destino.mjs'
import { difiereEnUno, VACIAS } from './imputacion.mjs'
import { MARCA_A_MANO } from './lectura.mjs'

/**
 * Cuánto se puede afirmar de cada camino. No son porcentajes: son el ORDEN en que un camino le gana
 * a otro, y el corte por debajo del cual la celda queda vacía.
 */
export const CONFIANZA = Object.freeze({
  CODIGO: 1, ALIAS: 0.95, NOMBRE: 0.9, CLIENTE_Y_OBRA: 0.85, UNICA_DEL_CLIENTE: 0.8,
  ESTRUCTURA: 0.75, SIN_OBRA: 0.5,
})

/** Desde acá se ESCRIBE la celda. Debajo se propone y se pregunta. */
export const UMBRAL = 0.75

/** La Unidad de Negocio que le corresponde a cada destino. Sale del dato, no de una opinión: las 42
 *  filas de «AR - MANTENIMIENTO» están en «Mantenimiento» y las 361 de obras `tipo='obra'` en
 *  «Civil»; estructura (taller y administración) es «Estructura» en las 229 suyas. */
export const UNIDAD = Object.freeze({ OBRA: 'Civil', MANTENIMIENTO: 'Mantenimiento', ESTRUCTURA: 'Estructura' })

/** La J («Cliente / Asignación») de los dos destinos fijos, tal como la escribe el dueño. */
const J_FIJA = Object.freeze({ 'ES-TAL': 'Taller', 'ES-ADM': 'Administracion' })

/** Lo que la mano escribe cuando el gasto es del taller o de un vehículo, con el detalle (K) que le
 *  corresponde. El dueño lo fijó el 15/09: «Ford XLS» y «Ford F 100» → Vehiculos; «tablero» → Taller. */
const PALABRAS_TALLER = Object.freeze([
  ['vehiculo', 'Vehiculos'], ['vehiculos', 'Vehiculos'], ['camioneta', 'Vehiculos'], ['camion', 'Vehiculos'],
  ['ford', 'Vehiculos'], ['hilux', 'Vehiculos'], ['toyota', 'Vehiculos'], ['amarok', 'Vehiculos'],
  ['ranger', 'Vehiculos'], ['autoelevador', 'Vehiculos'], ['neumatico', 'Vehiculos'], ['cubierta', 'Vehiculos'],
  ['patente', 'Vehiculos'], ['rodado', 'Vehiculos'],
  ['taller', 'Taller'], ['tablero', 'Taller'], ['almacen', 'Taller'], ['deposito', 'Taller'],
  ['herramienta', 'Taller'], ['soldadura', 'Taller'],
])

/** Y cuando es de la estructura administrativa. */
const PALABRAS_ADMIN = Object.freeze([
  ['oficina', 'Oficina'], ['administracion', 'Administración'], ['sueldo', 'Administración'],
  ['sueldos', 'Administración'], ['impuesto', 'Administración'], ['impuestos', 'Administración'],
  ['banco', 'Administración'], ['honorarios', 'Administración'], ['contador', 'Administración'],
])

/** Una patente escrita a mano es un vehículo: «EEA-885», «AB123CD». */
const RE_PATENTE = /\b([a-z]{3}[\s-]?\d{3}|[a-z]{2}[\s-]?\d{3}[\s-]?[a-z]{2})\b/

const RE_CODIGO = /\b(ob)\s*-?\s*(\d{4,})\b/i
const RE_FIJO = /\bes\s*-?\s*(adm|tal)\b/i

const nada = (porque) => ({ valor: null, obra_id: null, destino: null, cliente: null, unidad: null, detalle: null, confianza: 0, porque })

/** Texto → tokens comparables, y aparte las SIGLAS (lo que venía en mayúsculas: «SF», «QP»). */
export function palabrasDe(texto) {
  const tokens = new Set()
  const siglas = new Set()
  for (const bruto of String(texto ?? '').split(/[^\p{L}\p{N}]+/u)) {
    const t = normalizar(bruto)
    if (!t || VACIAS.has(t)) continue
    tokens.add(t)
    if (t.length >= 5 && t.endsWith('s')) tokens.add(t.slice(0, -1))
    if (t.length <= 3 && bruto === bruto.toUpperCase()) siglas.add(t)
  }
  return { tokens, siglas }
}

/** ¿Este token del catálogo está en la anotación? Exacto, abreviado o con un error de una letra. */
function coincide(token, tokens) {
  if (tokens.has(token)) return true
  for (const a of tokens) {
    // ABREVIATURA: «FÁB.» es FÁBRICA y «TABLER» es TABLERO. Sólo en ese sentido —lo escrito a mano es
    // lo corto— y con tres letras mínimo: con dos, cualquier palabra es prefijo de cualquier otra.
    if (a.length >= 3 && token.length > a.length && token.startsWith(a)) return true
    if (a.length >= 5 && token.length >= 5 && difiereEnUno(a, token)) return true
  }
  return false
}

/** El nombre de la obra sin el prefijo del cliente: «SF - PISOS INDUSTRIALES» → «PISOS INDUSTRIALES». */
export function nombreSinPrefijo(nombre) {
  return String(nombre ?? '').replace(/^\s*[A-ZÁÉÍÓÚÑ]{2,3}\s*[-–]\s*/, '').trim()
}

/** La sigla con la que el nombre nombra al cliente: «SF - PISOS…» → «sf». null si no la tiene. */
function siglaDe(nombre) {
  const m = /^\s*([A-ZÁÉÍÓÚÑ]{2,3})\s*[-–]\s*/.exec(String(nombre ?? ''))
  return m ? normalizar(m[1]) : null
}

/**
 * Los tokens con los que un rótulo del catálogo se deja reconocer, YA EN SINGULAR.
 *
 * El singular no es cosmética: el puntaje cuenta palabras DISTINTAS, y el alias «oficinas y fabrica»
 * más el nombre «OFICINA Y FÁBRICA» daban dos puntos por la misma palabra. Con eso, «sueldos oficina»
 * —que es administración— le ganaba a la administración y se iba a una obra.
 */
const significativos = (texto, min = 3) => [...palabrasDe(texto).tokens]
  .map((t) => (t.length >= 5 && t.endsWith('s') ? t.slice(0, -1) : t))
  .filter((t) => t.length >= min)

/**
 * EL CATÁLOGO INDEXADO, ARMADO UNA VEZ. Se arma con lo mismo que `catalogosDeAsignacion` devuelve.
 *
 * `obras`: filas de `obra_canonica` (id, codigo, nombre, cliente_texto, tipo, fusionada_en) ·
 * `clienteAlias`: normAlias(rótulo) → cliente canónico · `alias`: normAlias(alias) → obra_id.
 */
export function indiceDeAnotacion({ obras = [], clienteAlias = new Map(), alias = new Map() } = {}) {
  const clienteDe = (t) => (normAlias(t) ? clienteAlias.get(normAlias(t)) ?? null : null)
  const aliasDeObra = new Map()
  for (const [a, id] of alias) aliasDeObra.set(id, [...(aliasDeObra.get(id) ?? []), a])
  const vivas = obras.filter((o) => !o.fusionada_en && /^OB-/i.test(String(o.codigo ?? '')))
  const clientes = new Map() // canónico → {tokens:Set, siglas:Set, obras:[]}
  const deCliente = (c) => {
    if (!clientes.has(c)) clientes.set(c, { tokens: new Set(), siglas: new Set(), obras: [] })
    return clientes.get(c)
  }
  for (const [rotulo, canonico] of clienteAlias) {
    for (const t of significativos(rotulo, 4)) deCliente(canonico).tokens.add(t)
    for (const t of significativos(canonico, 4)) deCliente(canonico).tokens.add(t)
  }
  const fichas = vivas.map((o) => {
    const cliente = clienteDe(o.cliente_texto)
    const propios = new Set([
      ...significativos(nombreSinPrefijo(o.nombre)),
      ...(aliasDeObra.get(o.id) ?? []).flatMap((a) => significativos(a)),
    ])
    if (cliente) {
      const c = deCliente(cliente)
      c.obras.push(o.id)
      const sig = siglaDe(o.nombre)
      if (sig) c.siglas.add(sig)
    }
    return { obra: o, cliente, propios }
  })
  // Una sigla que dos clientes comparten no nombra a ninguno.
  const cuantos = new Map()
  for (const [, c] of clientes) for (const s of c.siglas) cuantos.set(s, (cuantos.get(s) ?? 0) + 1)
  for (const [, c] of clientes) for (const s of [...c.siglas]) if (cuantos.get(s) > 1) c.siglas.delete(s)
  return {
    esIndice: true,
    fichas,
    clientes,
    clienteAlias,
    porCodigo: new Map(vivas.map((o) => [String(o.codigo).toUpperCase(), o])),
    porAlias: new Map([...alias].map(([a, id]) => [a, fichas.find((f) => f.obra.id === id)?.obra ?? null])),
  }
}

/** Acepta el índice, el `destinos` del cargador o los catálogos crudos. Uno solo de los tres. */
function indiceDe(catalogo) {
  if (!catalogo) return null
  if (catalogo.esIndice) return catalogo
  if (catalogo.indice?.esIndice) return catalogo.indice
  if (Array.isArray(catalogo.obras)) return indiceDeAnotacion(catalogo)
  if (Array.isArray(catalogo.canonicas)) {
    return indiceDeAnotacion({ obras: catalogo.canonicas, clienteAlias: catalogo.clienteAlias, alias: catalogo.alias })
  }
  return null
}

/** El resultado para una obra concreta del catálogo. Unidad y detalle salen de la obra, no de la mano. */
function deObra(ficha, confianza, porque) {
  const mantenimiento = String(ficha.obra.tipo ?? '').toLowerCase() === 'mantenimiento'
  return {
    valor: rotuloDeObra(ficha.obra), obra_id: ficha.obra.id, destino: DESTINO.OBRA, cliente: ficha.cliente,
    unidad: mantenimiento ? UNIDAD.MANTENIMIENTO : UNIDAD.OBRA,
    detalle: nombreSinPrefijo(ficha.obra.nombre) || null,
    obraEstado: ficha.obra.estado ?? null,
    confianza, porque,
  }
}

/** El resultado de un destino fijo (ES-TAL / ES-ADM). */
function deFijo(codigo, detalle, porque) {
  const f = FIJOS.find((x) => x.codigo === codigo)
  return {
    valor: rotuloDeObra({ codigo: f.codigo, nombre: f.nombre }), obra_id: null, destino: f.destino,
    cliente: J_FIJA[codigo] ?? null, unidad: UNIDAD.ESTRUCTURA, detalle, confianza: CONFIANZA.ESTRUCTURA, porque,
  }
}

/** Lo que dicen las palabras de taller/vehículos/oficina, o null. Empate entre las dos familias = null. */
function porPalabrasFijas(tokens, anotacion) {
  const hit = (lista) => lista.filter(([p]) => coincide(p, tokens)).map(([p, det]) => ({ p, det }))
  const taller = hit(PALABRAS_TALLER)
  const admin = hit(PALABRAS_ADMIN)
  if (!taller.length && RE_PATENTE.test(normalizar(anotacion))) {
    return deFijo('ES-TAL', 'Vehiculos', 'la anotación tiene una patente')
  }
  if (taller.length && admin.length) {
    return nada(`«${String(anotacion).slice(0, 60)}» dice «${taller[0].p}» y «${admin[0].p}» a la vez: esa la lee una persona con el papel delante`)
  }
  if (taller.length) return deFijo('ES-TAL', taller[0].det, `la anotación dice «${taller[0].p}»`)
  if (admin.length) return deFijo('ES-ADM', admin[0].det, `la anotación dice «${admin[0].p}»`)
  return null
}

/** Las obras del índice que la anotación identifica, con su puntaje. `sinTokens` los descarta. */
function puntuar(fichas, tokens, sinTokens = new Set()) {
  let mejor = 0
  let ganadoras = []
  for (const f of fichas) {
    let p = 0
    for (const t of f.propios) if (!sinTokens.has(t) && coincide(t, tokens)) p++
    if (!p) continue
    if (p > mejor) { mejor = p; ganadoras = [f] } else if (p === mejor) ganadoras.push(f)
  }
  return { mejor, ganadoras }
}

/** El código de obra escrito a mano, si está. Es lo más fuerte: el código es inmutable. */
function porCodigo(texto, idx) {
  const fijo = RE_FIJO.exec(texto)
  if (fijo) return deFijo(`ES-${fijo[1].toUpperCase()}`, null, `la anotación dice «ES-${fijo[1].toUpperCase()}»`)
  const cod = RE_CODIGO.exec(texto)
  if (!cod) return null
  const codigo = `OB-${cod[2]}`
  const o = idx.porCodigo.get(codigo)
  const ficha = idx.fichas.find((f) => f.obra.id === o?.id)
  return ficha ? deObra(ficha, CONFIANZA.CODIGO, `la anotación dice «${codigo}»`) : nada(`${codigo} no es una obra viva`)
}

/** El alias completo: la anotación entera, o uno de sus tramos, ES el nombre con que se la conoce. */
function porAliasExacto(texto, idx) {
  const tramos = [texto, ...texto.split(/\s*[·/,;|]\s*|\s+-\s+/)]
  for (const t of tramos) {
    const o = idx.porAlias.get(normAlias(t))
    const ficha = o ? idx.fichas.find((f) => f.obra.id === o.id) : null
    if (ficha) return deObra(ficha, CONFIANZA.ALIAS, `«${t.trim().slice(0, 60)}» es un alias de esa obra`)
  }
  return null
}

/** Los clientes que la anotación nombra, por palabra o por sigla («SF»). */
function clientesNombrados({ tokens, siglas }, idx) {
  const out = []
  for (const [nombre, c] of idx.clientes) {
    const porToken = [...c.tokens].some((t) => coincide(t, tokens))
    const porSigla = [...c.siglas].some((s) => siglas.has(s))
    if (porToken || porSigla) out.push({ nombre, ficha: c })
  }
  return out
}

/**
 * LO ESCRITO A MANO → LA OPCIÓN DEL DESPLEGABLE DE «Obra», o `valor:null` con el motivo.
 *
 * Siempre devuelve un objeto (nunca `null` pelado): un resolutor que a veces devuelve null y a veces
 * un objeto obliga a cada llamador a acordarse, y el día que uno se olvide la celda queda en blanco
 * sin que nadie diga por qué.
 *
 * @param {string|null} anotacion  la transcripción literal de lo manuscrito (o el texto del chat)
 * @param {object} catalogo  el índice, el `destinos` del cargador o `catalogosDeAsignacion`
 * @returns {{valor:string|null, obra_id:string|null, destino:string|null, cliente:string|null,
 *            unidad:string|null, detalle:string|null, confianza:number, porque:string}}
 */
export function anotacionAObra(anotacion, catalogo) {
  return frenoDeObraCerrada(resolver(anotacion, catalogo), indiceDe(catalogo))
}

/**
 * UNA OBRA CERRADA NO RECIBE UN GASTO NUEVO POR PARECIDO.
 *
 * «Estrella» es, en `obra_alias`, un alias de OB-0003 (LE - OBRA GENERAL), que está cerrada desde
 * hace meses. Con el alias mandando, cualquier ticket anotado sólo «Estrella» iría a parar al costo
 * de una obra terminada y le movería el margen a una obra que ya se cerró. Se devuelve igual —con su
 * obra y su porqué, para que el mensaje la pueda ofrecer— pero por debajo del umbral: lo escribe una
 * persona. El código escrito a mano (OB-0003) sí se respeta: ahí no hay parecido, hay una decisión.
 */
function frenoDeObraCerrada(r, idx) {
  const cerrada = r.destino === DESTINO.OBRA && String(r.obraEstado ?? '').toLowerCase() === 'cerrada'
  if (!cerrada || r.confianza >= CONFIANZA.CODIGO) return r
  const porque = `${r.porque} — pero ${r.valor} está CERRADA`
  // Si el cliente tiene obras vivas, lo que corresponde ofrecer es SU cliente sin obra: «Messina» ya
  // no es la obra general de 2025, y cuál de las vivas es lo dice una persona.
  const vivas = (idx?.fichas ?? []).filter((f) => f.cliente === r.cliente && String(f.obra.estado).toLowerCase() !== 'cerrada')
  if (r.cliente && vivas.length) {
    return { ...nada(`${porque}: ${r.cliente} tiene ${vivas.length} obra(s) viva(s) y no dice cuál`), cliente: r.cliente, valor: rotuloSinObra(r.cliente), confianza: CONFIANZA.SIN_OBRA }
  }
  return { ...r, confianza: Math.min(r.confianza, CONFIANZA.SIN_OBRA), porque }
}

function resolver(anotacion, catalogo) {
  const texto = String(anotacion ?? '').trim()
  if (!texto) return nada('no hay nada escrito a mano')
  const idx = indiceDe(catalogo)
  if (!idx) return nada('sin catálogo de obras')
  const cod = porCodigo(texto, idx)
  if (cod) return cod
  const { tokens, siglas } = palabrasDe(texto)
  const corto = texto.slice(0, 60)
  const porAlias = porAliasExacto(texto, idx)
  if (porAlias) return porAlias
  const clientes = clientesNombrados({ tokens, siglas }, idx)
  if (clientes.length > 1) {
    return nada(`«${corto}» nombra a ${clientes.map((c) => c.nombre).join(' y a ')}: no elijo entre dos clientes`)
  }
  if (clientes.length === 1) return delCliente(clientes[0], { idx, tokens, corto })
  const suyas = puntuar(idx.fichas, tokens)
  // Sin cliente nombrado hace falta MÁS evidencia: dos palabras de la obra, no una. Con una sola
  // —«pisos», «galpón»— la misma palabra vive en obras de tres clientes distintos.
  if (suyas.ganadoras.length === 1 && suyas.mejor >= 2) {
    return deObra(suyas.ganadoras[0], CONFIANZA.NOMBRE, `«${corto}» nombra ${suyas.mejor} palabras de esa obra`)
  }
  const fija = porPalabrasFijas(tokens, texto)
  if (fija) return fija
  if (suyas.ganadoras.length > 1) {
    return nada(`«${corto}» le cabe igual a ${suyas.ganadoras.map((f) => f.obra.codigo).join(' y a ')}`)
  }
  return nada(`«${corto}» no nombra ninguna obra, cliente ni destino que conozca`)
}

/** Lo que se puede afirmar cuando la anotación nombró a UN cliente. */
function delCliente({ nombre, ficha }, { idx, tokens, corto }) {
  const suyas = idx.fichas.filter((f) => f.cliente === nombre)
  const { mejor, ganadoras } = puntuar(suyas, tokens, ficha.tokens)
  if (ganadoras.length === 1) {
    const conf = mejor >= 2 ? CONFIANZA.NOMBRE : CONFIANZA.CLIENTE_Y_OBRA
    return deObra(ganadoras[0], conf, `«${corto}» dice ${nombre} y ${mejor} palabra(s) de esa obra`)
  }
  if (ganadoras.length > 1) {
    return nada(`«${corto}» dice ${nombre} pero le cabe igual a ${ganadoras.map((f) => f.obra.codigo).join(' y a ')}`)
  }
  if (suyas.length === 1) {
    return deObra(suyas[0], CONFIANZA.UNICA_DEL_CLIENTE, `${nombre} tiene una sola obra viva`)
  }
  // El cliente está, la obra no. Se propone «Sin obra – X» —que es lo que el desplegable ofrece para
  // este caso— pero por debajo del umbral: quién decide que no va a ninguna obra es una persona.
  return {
    ...nada(`«${corto}» dice ${nombre} pero no cuál de sus ${suyas.length} obras`),
    valor: suyas.length > 1 ? rotuloSinObra(nombre) : null,
    cliente: nombre,
    confianza: CONFIANZA.SIN_OBRA,
  }
}

/**
 * LO QUE ESTE COMPROBANTE TIENE DE ESCRITO A MANO, venga como venga.
 *
 * En el ítem del chat la transcripción vive en `anotacion`. En el `fajo.json` que llega al cargador
 * NO hay campo propio: `conceptoConAnotacion` la pegó dentro del concepto como `· a mano: "…"` (y
 * ésa es la única copia que viaja). Las dos formas se leen acá para que el cargador vea lo mismo que
 * vio el chat — el defecto del 15/09 entró por los dos caminos.
 */
export function anotacionDelComprobante(c = {}) {
  const propia = String(c.anotacion ?? '').trim()
  if (propia) return propia
  const concepto = String(c.concepto ?? '')
  const i = concepto.indexOf(MARCA_A_MANO)
  if (i < 0) return null
  const resto = concepto.slice(i + MARCA_A_MANO.length).trim()
  const m = /^"([^"]*)"/.exec(resto)
  return (m ? m[1] : resto).trim() || null
}

/**
 * LA ANOTACIÓN (o el texto del chat) APLICADA AL COMPROBANTE. Muta, como `completarUno`.
 *
 * Sólo llena lo que está VACÍO y sólo si la confianza llega al umbral: lo que el papel ya dice y lo
 * que una persona ya eligió no se pisan. Lo que escribe queda marcado `*Via = 'anotacion'`, que es lo
 * que después distingue un dato leído de una inferencia del historial.
 *
 * `listas` son los desplegables ESTRICTOS de Compras (`listasDeCompras`): la J y la I sólo se
 * escriben con un valor que la lista tenga, letra por letra. Sin listas no se tocan —una celda fuera
 * del desplegable queda en rojo y parte los cruces en dos—; la L y la K sí, que no dependen de ellas.
 *
 * @param {object} comprobante  se muta
 * @param {object} catalogo     índice/destinos/catálogos de obras
 * @param {{listas?:object, campoDetalle?:string, texto?:string|null, umbral?:number}} [o]
 * @returns {{aplicado:string[], resultado:object, anotacion:string|null}}
 */
export function completarDesdeAnotacion(comprobante, catalogo, o = {}) {
  const { listas = null, campoDetalle = 'detalle', texto = null, umbral = UMBRAL } = o
  const c = comprobante ?? {}
  const anotacion = anotacionDelComprobante(c)
  let r = anotacionAObra(anotacion, catalogo)
  // LA OTRA LECTURA DE LA MISMA TINTA. El modelo la declara cuando dudó («Messino» / «Messina»): si
  // la literal no resuelve y la alternativa sí, resuelve la alternativa — el papel dice una sola
  // cosa y quien elige cuál es el catálogo de obras, no el que mira la foto.
  const alt = String(c.anotacionAlt ?? '').trim()
  if (r.confianza < umbral && alt) {
    const porAlt = anotacionAObra(alt, catalogo)
    if (porAlt.confianza > r.confianza) r = { ...porAlt, porque: `${porAlt.porque} (lectura alternativa)` }
  }
  // EL TEXTO DEL CHAT ES LA SEGUNDA FUENTE, NUNCA LA PRIMERA. Mandar la foto con «SF pisos» al lado
  // es la forma más común de decir la obra; el papel manda igual si dijo algo.
  if (r.confianza < umbral && texto) {
    const porTexto = anotacionAObra(texto, catalogo)
    if (porTexto.confianza > r.confianza || !anotacion) r = { ...porTexto, porque: `${porTexto.porque} (en el mensaje)` }
  }
  if (r.confianza < umbral || !r.valor) return { aplicado: [], resultado: r, anotacion }
  const aplicado = []
  const poner = (campo, dim, valor) => {
    if (!valor || String(c[campo] ?? '').trim()) return
    c[campo] = valor
    c[`${dim}Via`] = 'anotacion'
    aplicado.push(dim)
  }
  poner('obraFila', 'obraFila', r.valor)
  // EL PORQUÉ VIAJA CON EL VALOR. `obraParaLaColumna` lo imprime tal cual: sin él, el informe del
  // cargador diría «elegida por una persona» de algo que salió de una foto.
  if (c.obraFilaVia === 'anotacion') c.obraFilaPorque = r.porque
  poner('obra', 'obra', jDelCliente(r.cliente, listas?.obras, indiceDe(catalogo)?.clienteAlias))
  poner('unidad', 'unidad', deLaLista(r.unidad, listas?.unidades))
  poner(campoDetalle, 'detalle', r.detalle)
  return { aplicado, resultado: r, anotacion }
}

/** El valor TAL COMO lo escribe el desplegable, o null si la lista no lo tiene. Sin lista, null. */
export function deLaLista(valor, lista) {
  const v = normalizar(valor)
  if (!v || !Array.isArray(lista)) return null
  return lista.find((x) => normalizar(x) === v) ?? null
}

/**
 * LA J («Cliente / Asignación») DE ESTE CLIENTE, CON EL RÓTULO EXACTO DEL DESPLEGABLE.
 *
 * El cliente canónico y el rótulo del desplegable no son el mismo texto: el catálogo dice
 * «QUATTROPANI» y la columna J dice «Quattropani - Melisa García SAS». Comparar los dos como texto
 * deja la J vacía… y entonces el historial la llena con el cliente de OTRA obra, que es exactamente
 * la fila incoherente que este arreglo evita (L de una obra, J de otro cliente). El puente es
 * `cliente_alias`, el MISMO mapa con el que el sync decide de quién es cada fila.
 */
export function jDelCliente(cliente, lista, clienteAlias = null) {
  const exacto = deLaLista(cliente, lista)
  if (exacto || !cliente || !Array.isArray(lista) || !clienteAlias) return exacto
  return lista.find((x) => clienteAlias.get(normAlias(x)) === cliente) ?? null
}
