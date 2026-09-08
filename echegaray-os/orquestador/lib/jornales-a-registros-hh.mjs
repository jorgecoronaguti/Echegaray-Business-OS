// JORNALES → registros_hh: LA TRADUCCIÓN, PURA.
//
// El dueño (08/09/2026): «leer el sheet jornales completo y dejar todo el año cargado según
// corresponde, empleados activos e inactivos, quiero que todo el registro esté en app.ecsas.com.ar».
// app.ecsas.com.ar lee `public.registros_hh`; JORNALES sigue siendo lo que es y NO se toca.
//
// Este módulo no habla con Google ni con Postgres: entra la grilla que devolvió `readSheetGrid` y
// los catálogos leídos de la base (personas, alias de obra, obras canónicas, asignaciones), sale el
// plan de filas a escribir más TODO lo que no se pudo traducir, con nombre y cantidad. Nada se
// inventa: una persona que no está en `personas` no se crea, una obra que ningún alias reconoce
// queda como FALTA_DATO, una celda que no es un número de horas se declara.
//
// Trampas ya pagadas que acá se respetan:
//   · desde abril/26 la planilla invierte nombre y apellido → se empareja por CONJUNTO de tokens.
//   · una celda vacía NO es 0: el 0 explícito es una ausencia registrada; la vacía, nada.
//   · una fórmula `=9+4*1,3` son horas normales + extras: se separan, no se pisan ni se suman a ciegas.
//   · JORNALES 25 tiene bloques de liquidación al final cuyas «fechas» son la misma tres veces y cuyos
//     «valores» son importes → se descartan por estructura (fechas duplicadas, horas > 24).
import { detectarBloques, trabajadoresDeBloque, leerCeldaDiaria } from './jornales-estructura.mjs'
import { interpretarCarga, FORMA } from './horas-extra.mjs'

export const FUENTE = 'sheet:jornales'
export const HORAS_MAX_DIA = 24
export const JORNADA_DEFAULT = 8.8
const UUID_CERO = '00000000-0000-0000-0000-000000000000'

export const FALTA = Object.freeze({
  PERSONA_NO_ENCONTRADA: 'persona_no_encontrada',
  PERSONA_AMBIGUA: 'persona_ambigua',
  OBRA_SIN_RESOLVER: 'obra_sin_resolver',
  CELDA_NO_INTERPRETABLE: 'celda_no_interpretable',
  BLOQUE_DESCARTADO: 'bloque_descartado',
})

/** Minúsculas, sin acentos, sólo letras y números separados por un espacio. */
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ').trim()
}
const tokens = (s) => norm(s).split(' ').filter((t) => t && !/^\d+$/.test(t))
/** La MISMA clave que `public.norm_obra` (la que indexa `obra_alias`): sin artículos ni «de/del».
 *  Si acá se normaliza distinto que en la base, un alias cargado no se encuentra y parece que falta. */
export const normAlias = (s) => norm(s).replace(/\b(la|el|los|las|de|del)\b/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Lee TODAS las celdas diarias de una pestaña: una marca por (trabajador, fecha) escrita.
 * Un bloque con la misma fecha repetida en el encabezado no es una quincena: se descarta y se dice.
 */
export function marcasDeGrid(grid, { pestana, anio } = {}) {
  const marcas = []
  const hallazgos = []
  for (const b of detectarBloques(grid, { anio })) {
    const isos = b.fechas.map((f) => f.iso)
    if (new Set(isos).size !== isos.length) {
      hallazgos.push({ tipo: FALTA.BLOQUE_DESCARTADO, pestana, fila1: b.fila1, detalle: 'fechas repetidas en el encabezado' })
      continue
    }
    let trabajadores
    try { trabajadores = trabajadoresDeBloque(grid, b) } catch (e) {
      hallazgos.push({ tipo: FALTA.BLOQUE_DESCARTADO, pestana, fila1: b.fila1, detalle: e.message })
      continue
    }
    for (const t of trabajadores) {
      for (const f of b.fechas) {
        const celda = leerCeldaDiaria(grid, t.fila, f.col)
        if (!celda.escrita) continue
        marcas.push({
          pestana, bloque_fila1: b.fila1, fila1: t.fila1, fecha: f.iso,
          nombre: t.nombre_original.trim(), cliente: t.cliente_original.trim(), obra: t.obra_original.trim(),
          categoria: t.categoria, celda,
        })
      }
    }
  }
  return { marcas, hallazgos }
}

/**
 * Qué dice una celda diaria en términos de `registros_hh.tipo_hora`.
 *   0        → ausencia (horas = jornada de la obra; la base exige horas > 0, igual que la web)
 *   n        → normal n
 *   =a+b     → normal a + extra b (el recargo no está declarado: se dice en `detalle`)
 *   =a+c*k   → normal a + extra c, con k=1,5 → extra_50 · k=2 → extra_100 · otro k → extra_50 y se declara
 *   otra cosa → null: la celda no se traduce y quien llama la reporta.
 */
export function partesDeCelda(celda, { jornada = JORNADA_DEFAULT, licencia = false } = {}) {
  const c = interpretarCarga(celda)
  if (c.forma === FORMA.VACIA) return []
  if (c.forma === FORMA.TEXTO || c.forma === FORMA.ERROR) return null
  if (c.total != null && (c.total > HORAS_MAX_DIA || c.total < 0)) return null
  if (c.forma === FORMA.NO_INTERPRETABLE) {
    if (!(c.total > 0)) return null
    return [{ tipo_hora: licencia ? 'licencia' : 'normal', horas: c.total, detalle: `fórmula no descompuesta ${c.formula_original}` }]
  }
  if (c.total === 0) return [{ tipo_hora: 'ausencia', horas: jornada, detalle: null }]
  if (licencia) return [{ tipo_hora: 'licencia', horas: c.total, detalle: null }]
  const out = []
  if (c.normales > 0) out.push({ tipo_hora: 'normal', horas: c.normales, detalle: null })
  if (c.extras > 0) out.push(parteExtra(c))
  return out
}

function parteExtra(c) {
  const k = c.coeficiente
  if (k == null) return { tipo_hora: 'extra_50', horas: c.extras, detalle: `extras ${c.formula_original} (recargo no declarado en JORNALES)` }
  if (k === 2) return { tipo_hora: 'extra_100', horas: c.cantidad_extra, detalle: `extras ${c.formula_original}` }
  if (k === 1.5) return { tipo_hora: 'extra_50', horas: c.cantidad_extra, detalle: `extras ${c.formula_original}` }
  return { tipo_hora: 'extra_50', horas: c.cantidad_extra, detalle: `extras ${c.formula_original} (coeficiente ${k} no es 1,5 ni 2)` }
}

/** Índice de personas listo para emparejar. Las de prueba no entran. */
export function indicePersonas(personas = []) {
  return personas.filter((p) => !p.es_prueba).map((p) => ({
    id: p.id, nombre_completo: p.nombre_completo, en_la_empresa: !!p.en_la_empresa,
    tokens: tokens(p.nombre_completo),
  }))
}

/** Un token del rótulo «es» el de la persona si son iguales, si uno es prefijo del otro («Emi» ~
 *  «Emiliano», «Zogber» ~ «Zogbe») o si sólo difieren en s/z («Gonzales» ~ «Gonzalez»). Nunca alcanza
 *  solo: el resto de los tokens también tiene que cerrar, y la candidata tiene que ser única. */
const sz = (x) => x.replace(/z/g, 's')
const tokenMatch = (t, p) => t === p || sz(t) === sz(p) || (t.length >= 3 && p.startsWith(t)) || (p.length >= 4 && t.startsWith(p))

/**
 * «Aguero Cristian», «Eduardo Ochoa», «Emi Maldonado» → la persona cuyos tokens CONTIENEN a los del
 * rótulo. Si hay más de una (Quiroga Sebastian: Sebastián Adolfo y Alexander Sebastián), gana la que
 * tiene apellido y primer nombre en el rótulo; si siguen siendo varias, es ambigua y no se elige.
 */
export function emparejarPersona(nombre, indice) {
  const ts = tokens(nombre)
  if (ts.length === 0) return { estado: FALTA.PERSONA_NO_ENCONTRADA, candidatos: [] }
  const cubre = (p) => ts.every((t) => p.tokens.some((pt) => tokenMatch(t, pt)))
  let cands = indice.filter(cubre)
  if (cands.length > 1) {
    const primeros = cands.filter((p) => p.tokens.slice(0, 2).every((pt) => ts.some((t) => tokenMatch(t, pt))))
    if (primeros.length >= 1) cands = primeros
  }
  if (cands.length === 1) return { estado: 'ok', persona: cands[0] }
  if (cands.length === 0) return { estado: FALTA.PERSONA_NO_ENCONTRADA, candidatos: [] }
  return { estado: FALTA.PERSONA_AMBIGUA, candidatos: cands.map((c) => c.nombre_completo) }
}

/** ¿El cliente de la obra canónica es el mismo que el rótulo de cliente de la planilla? */
function clienteCompatible(canonica, clienteSheet, clienteAlias) {
  const ct = normAlias(canonica.cliente_texto)
  if (!ct) return false
  const cs = normAlias(clienteSheet)
  const canon = normAlias(clienteAlias.get(cs) ?? '')
  return [cs, canon].filter(Boolean).some((x) => ct === x || ct.startsWith(x))
}

/**
 * Resolutor de obra a partir de los rótulos CLIENTE · OBRA de la planilla, en orden de especificidad:
 *   1. `obra_alias` con «cliente obra» o con «obra» solos       → obra_por_alias
 *   2. una obra canónica que se LLAME así y sea de ESE cliente  → obra_por_nombre
 *   3. `obra_alias` con el cliente solo, o una canónica que se llame como el cliente (la obra «madre»)
 *                                                               → obra_por_alias_cliente
 *   4. SÓLO si la planilla no nombra ni cliente ni obra (una licencia, una fila sin rótulo):
 *      la asignación vigente de la persona en esa fecha         → obra_por_asignacion
 *      y si no, la última obra que tuvo en la planilla           → obra_por_ultimo_bloque
 *   5. nada → FALTA_DATO. Un rótulo que no se reconoce NO se reemplaza por la asignación: la
 *      planilla dijo LA ESTRELLA, y la asignación (sin fechas) decía PISOS INDUSTRIALES — se midió.
 */
export function resolutorDeObra({ alias = new Map(), canonicas = [], clienteAlias = new Map() } = {}) {
  const porNombre = new Map()
  for (const c of canonicas) {
    const k = normAlias(c.nombre)
    if (!porNombre.has(k)) porNombre.set(k, [])
    porNombre.get(k).push(c)
  }
  return function resolver({ cliente, obra }, { asignacion = null, ultima = null } = {}) {
    const c = normAlias(cliente); const o = normAlias(obra)
    if (o && alias.has(`${c} ${o}`)) return { obra_id: alias.get(`${c} ${o}`), origen: 'obra_por_alias' }
    if (o && o !== c && alias.has(o)) return { obra_id: alias.get(o), origen: 'obra_por_alias' }
    if (o) {
      const compat = (porNombre.get(o) ?? []).filter((x) => clienteCompatible(x, cliente, clienteAlias))
      if (compat.length === 1) return { obra_id: compat[0].id, origen: 'obra_por_nombre' }
    }
    if (c && alias.has(c)) return { obra_id: alias.get(c), origen: 'obra_por_alias_cliente' }
    if (c) {
      const madre = (porNombre.get(c) ?? []).filter((x) => clienteCompatible(x, cliente, clienteAlias))
      if (madre.length === 1) return { obra_id: madre[0].id, origen: 'obra_por_alias_cliente' }
    }
    if (c || o) return { obra_id: null, origen: null }
    if (asignacion) return { obra_id: asignacion, origen: 'obra_por_asignacion' }
    if (ultima) return { obra_id: ultima, origen: 'obra_por_ultimo_bloque' }
    return { obra_id: null, origen: null }
  }
}

/** Asignación vigente de la persona en la fecha: `desde`/`hasta` nulos valen como abiertos. */
export function asignacionVigente(asignaciones = [], personaId, fecha) {
  const v = asignaciones.filter((a) => a.persona_id === personaId
    && (!a.desde || String(a.desde).slice(0, 10) <= fecha) && (!a.hasta || String(a.hasta).slice(0, 10) >= fecha))
  const ids = [...new Set(v.map((a) => a.obra_id))]
  return ids.length === 1 ? ids[0] : null
}

const esLicencia = (m) => /enfermedad|licencia|vacacion/i.test(`${m.cliente} ${m.obra}`)
const ORIGEN_EN_NOTA = {
  obra_por_alias_cliente: 'obra por alias de cliente', obra_por_asignacion: 'obra por asignación',
  obra_por_ultimo_bloque: 'obra por último bloque de JORNALES',
}
function notaDe(m, origen, detalle) {
  const partes = [`JORNALES ${m.pestana} f${m.fila1}`, [m.cliente, m.obra].filter(Boolean).join(' · ')]
  if (ORIGEN_EN_NOTA[origen]) partes.push(ORIGEN_EN_NOTA[origen])
  if (detalle) partes.push(detalle)
  return partes.filter(Boolean).join(' · ')
}
/** Para ausencia/licencia `notas` es la CLAVE del catálogo de motivos (lo que la web etiqueta), o null. */
const notaNoTrabajado = (parte, m) => (parte.tipo_hora === 'licencia' && /enfermedad/i.test(`${m.cliente} ${m.obra}`) ? 'enfermedad' : null)

/**
 * De las marcas a las filas de `registros_hh`. Devuelve también lo que NO se pudo traducir, agrupado
 * para que el dueño decida: personas sin legajo (con días), obras sin resolver (con horas), celdas
 * que no son horas. Las filas del mismo (persona, fecha, obra, tipo) se funden sumando horas.
 */
export function planDeRegistros(marcas, { personas, resolver, asignaciones = [], jornadaPorObra = new Map() }) {
  const indice = indicePersonas(personas)
  const cachePersona = new Map()
  const ultimaObra = new Map()
  const filas = new Map()
  const falta = { personas: new Map(), obras: new Map(), celdas: [] }
  const ordenadas = [...marcas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila1 - b.fila1)
  for (const m of ordenadas) {
    if (!cachePersona.has(m.nombre)) cachePersona.set(m.nombre, emparejarPersona(m.nombre, indice))
    const emp = cachePersona.get(m.nombre)
    if (emp.estado !== 'ok') { acumularPersona(falta.personas, m, emp); continue }
    const pid = emp.persona.id
    const licencia = esLicencia(m)
    const contexto = { asignacion: asignacionVigente(asignaciones, pid, m.fecha), ultima: ultimaObra.get(pid) ?? null }
    const res = resolver(licencia ? { cliente: '', obra: '' } : { cliente: m.cliente, obra: m.obra }, contexto)
    const jornada = jornadaPorObra.get(res.obra_id) ?? JORNADA_DEFAULT
    const partes = partesDeCelda(m.celda, { jornada, licencia })
    if (partes === null) { falta.celdas.push({ ...sinCelda(m), valor: m.celda.formula ?? m.celda.valor_crudo }); continue }
    if (partes.length === 0) continue
    if (!res.obra_id) { acumularObra(falta.obras, m, emp.persona, partes); continue }
    if (!licencia) ultimaObra.set(pid, res.obra_id)
    for (const p of partes) fundir(filas, m, emp.persona, res, p)
  }
  return { filas: [...filas.values()], falta: aplanarFalta(falta) }
}

const sinCelda = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'celda'))
function acumularPersona(mapa, m, emp) {
  const k = m.nombre
  if (!mapa.has(k)) mapa.set(k, { nombre: m.nombre, estado: emp.estado, candidatos: emp.candidatos ?? [], dias: new Set(), pestanas: new Set(), horas: 0 })
  const e = mapa.get(k)
  e.dias.add(m.fecha); e.pestanas.add(m.pestana)
  const h = typeof m.celda.horas === 'number' && m.celda.horas <= HORAS_MAX_DIA ? m.celda.horas : 0
  e.horas += h
}
function acumularObra(mapa, m, persona, partes) {
  const k = `${m.cliente}|${m.obra}`
  if (!mapa.has(k)) mapa.set(k, { cliente: m.cliente, obra: m.obra, personas: new Set(), dias: new Set(), horas: 0, pestanas: new Set() })
  const e = mapa.get(k)
  e.personas.add(persona.nombre_completo); e.dias.add(m.fecha); e.pestanas.add(m.pestana)
  for (const p of partes) if (p.tipo_hora !== 'ausencia') e.horas += p.horas
}
function aplanarFalta(f) {
  const set = (o, k) => ({ ...o, [k]: [...o[k]].sort() })
  return {
    personas: [...f.personas.values()].map((p) => set(set(p, 'dias'), 'pestanas')).map((p) => ({ ...p, n_dias: p.dias.length })).sort((a, b) => b.n_dias - a.n_dias),
    obras: [...f.obras.values()].map((o) => set(set(set(o, 'personas'), 'dias'), 'pestanas')).map((o) => ({ ...o, n_dias: o.dias.length })).sort((a, b) => b.horas - a.horas),
    celdas: f.celdas,
  }
}

function fundir(filas, m, persona, res, parte) {
  const clave = `${persona.id}|${m.fecha}|${res.obra_id}|${parte.tipo_hora}`
  const nota = parte.tipo_hora === 'ausencia' || parte.tipo_hora === 'licencia' ? notaNoTrabajado(parte, m) : notaDe(m, res.origen, parte.detalle)
  if (filas.has(clave)) {
    const f = filas.get(clave)
    // Dos filas del mismo día en la misma obra: una ausencia no se suma; las horas sí.
    if (parte.tipo_hora !== 'ausencia') f.horas = redondear(f.horas + parte.horas)
    if (nota && f.notas && !f.notas.includes(nota)) f.notas = `${f.notas} | ${nota}`
    return
  }
  filas.set(clave, {
    persona_id: persona.id, persona: persona.nombre_completo, en_la_empresa: persona.en_la_empresa,
    obra_canonica_id: res.obra_id, origen_obra: res.origen, fecha: m.fecha, tipo_hora: parte.tipo_hora,
    horas: redondear(parte.horas), notas: nota, fuente_legacy: FUENTE, pestana: m.pestana,
    rotulo: [m.cliente, m.obra].filter(Boolean).join(' · ') || '(sin rótulo)',
  })
}
const redondear = (x) => Math.round(x * 1000) / 1000
/** `date` de Postgres llega como Date LOCAL a medianoche; `toISOString` la corre un día en UTC-3. */
export function isoDe(f) {
  if (f instanceof Date) return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
  return String(f ?? '').slice(0, 10)
}

/**
 * Lo que ya está en la base y NO es nuestro manda: si para (persona, fecha) hay una fila de otra
 * fuente (la web, el bot, una prueba), ese día no se toca y se reporta.
 *
 * Lo nuestro se puede MOVER pero no borrar: si una fila propia (persona, fecha, tipo) ya no sale con
 * la misma obra —porque el dueño agregó un alias y el rótulo ahora resuelve a la sub-obra—, la fila
 * existente se actualiza de obra en vez de dejar dos (la vieja y la nueva, sumando doble). Lo que no
 * tiene a dónde moverse queda declarado obsoleto — y queda: nunca se borra desde acá.
 */
export function separarConflictos(filas, existentes = []) {
  const ajenas = new Map()
  const propias = new Map()
  for (const e of existentes) {
    const dia = `${e.persona_id}|${isoDe(e.fecha)}`
    if (e.fuente_legacy === FUENTE) { propias.set(`${dia}|${e.obra_canonica_id}|${e.tipo_hora}`, e); continue }
    if (!ajenas.has(dia)) ajenas.set(dia, [])
    ajenas.get(dia).push(e)
  }
  const escribir = []; const conflictos = []; const mover = []
  const nuestras = new Set()
  for (const f of filas) {
    const dia = `${f.persona_id}|${f.fecha}`
    nuestras.add(`${dia}|${f.obra_canonica_id}|${f.tipo_hora}`)
    if (ajenas.has(dia)) conflictos.push({ fila: f, existentes: ajenas.get(dia) })
    else escribir.push(f)
  }
  const sinDestino = [...propias.keys()].filter((k) => !nuestras.has(k))
  const obsoletas = []
  for (const k of sinDestino) {
    const e = propias.get(k)
    const destino = escribir.filter((f) => `${f.persona_id}|${f.fecha}|${f.tipo_hora}` === `${k.split('|')[0]}|${k.split('|')[1]}|${e.tipo_hora}`
      && !propias.has(`${f.persona_id}|${f.fecha}|${f.obra_canonica_id}|${f.tipo_hora}`))
    if (destino.length === 1 && e.id) mover.push({ id: e.id, desde: e.obra_canonica_id, fila: destino[0] })
    else obsoletas.push(k)
  }
  const movidas = new Set(mover.map((m) => m.fila))
  return { escribir: escribir.filter((f) => !movidas.has(f)), conflictos, obsoletas, mover }
}

/** Mueve una fila propia de obra (y actualiza horas y notas). Sólo toca filas `sheet:jornales`. */
export const SQL_MOVER = `
update public.registros_hh set obra_canonica_id = $2, horas = $3, notas = $4
 where id = $1 and fuente_legacy = '${FUENTE}' returning id`

/** Resumen por mes y por obra: filas, horas trabajadas (normal+extras), ausencias, personas. */
export function resumir(filas) {
  const porMes = new Map(); const porObra = new Map(); const personas = new Set()
  const trabajada = (t) => t === 'normal' || t === 'extra_50' || t === 'extra_100'
  const acc = (mapa, k, f) => {
    if (!mapa.has(k)) mapa.set(k, { clave: k, filas: 0, horas: 0, ausencias: 0, licencias: 0, personas: new Set() })
    const e = mapa.get(k); e.filas++; e.personas.add(f.persona_id)
    if (trabajada(f.tipo_hora)) e.horas = redondear(e.horas + f.horas)
    else if (f.tipo_hora === 'ausencia') e.ausencias++
    else e.licencias++
  }
  for (const f of filas) { acc(porMes, f.fecha.slice(0, 7), f); acc(porObra, f.obra_canonica_id, f); personas.add(f.persona_id) }
  const cerrar = (m) => [...m.values()].sort((a, b) => String(a.clave).localeCompare(String(b.clave))).map((e) => ({ ...e, personas: e.personas.size }))
  return { filas: filas.length, personas: personas.size, por_mes: cerrar(porMes), por_obra: cerrar(porObra) }
}

/**
 * LO ANTICIPADO NO ES UN HECHO. La planilla trae la quincena entera abierta y a veces ya tiene horas
 * puestas en días que todavía no pasaron; el 08/09 entraron el 09, 10 y 11/09 y sumaron en hh_real.
 * Sólo se importa hasta `hasta` (hoy en San Juan, por defecto); el resto se devuelve aparte para
 * decirlo, y entrará en la corrida siguiente cuando el día haya pasado.
 */
export function separarAnticipadas(filas, hasta) {
  const h = isoDe(hasta)
  const importar = []; const anticipadas = []
  for (const f of filas) (f.fecha > h ? anticipadas : importar).push(f)
  return { importar, anticipadas }
}

/** Cada rótulo CLIENTE · OBRA de la planilla → a qué obra canónica fue, por qué, y cuántas horas. */
export function mapaDeRotulos(filas) {
  const m = new Map()
  for (const f of filas) {
    const k = `${f.rotulo}→${f.obra_canonica_id}`
    if (!m.has(k)) m.set(k, { rotulo: f.rotulo, obra_id: f.obra_canonica_id, origen: f.origen_obra, filas: 0, horas: 0 })
    const e = m.get(k); e.filas++
    if (f.tipo_hora !== 'ausencia' && f.tipo_hora !== 'licencia') e.horas = redondear(e.horas + f.horas)
  }
  return [...m.values()].sort((a, b) => b.horas - a.horas)
}

/** Las columnas del UPSERT, en el orden de los arrays de `SQL_UPSERT`. */
export function columnasParaUpsert(filas) {
  return [
    filas.map((f) => f.persona_id), filas.map((f) => f.obra_canonica_id), filas.map((f) => f.fecha),
    filas.map((f) => f.horas), filas.map((f) => f.tipo_hora), filas.map((f) => f.notas),
  ]
}

/** El UPSERT contra el índice único real (`registros_hh_persona_unico`). Sólo pisa filas propias;
 *  una fila ajena en la misma clave NO se actualiza (el `where` del `do update`) y no se borra nada. */
export const SQL_UPSERT = `
insert into public.registros_hh
  (persona_id, obra_canonica_id, fecha, fecha_inicio_semana, horas, tipo_hora, notas, fuente_legacy, actividad_id)
select u.p, u.o, u.f, u.f, u.h, u.t, u.n, '${FUENTE}', null
  from unnest($1::uuid[], $2::text[], $3::date[], $4::numeric[], $5::text[], $6::text[]) as u(p, o, f, h, t, n)
on conflict (obra_canonica_id, persona_id, fecha, (coalesce(actividad_id, '${UUID_CERO}'::uuid)), tipo_hora, improductiva, (coalesce(causa_desvio, '')))
  where persona_id is not null
do update set horas = excluded.horas, notas = excluded.notas
  where public.registros_hh.fuente_legacy = '${FUENTE}'
    and (public.registros_hh.horas is distinct from excluded.horas or public.registros_hh.notas is distinct from excluded.notas)
returning id, (xmax = 0) as insertada`
