// «TIPO DE COSTO» DE UNA FILA DE COMPRAS — Directo / Indirecto (/ Estructura), por evidencia y con motivo.
//
// ═══ EL PEDIDO (dueño, 18/09/2026, textual) ═══
//
// «En pestaña Compras del Sheet Flujo de Fondos hay una columna que indica "Tipo de Costo". Quiero que
// crees un criterio y determines los que son directos de los indirectos, siendo los directos aquellos que
// impactan en la obra; determinalos y escribilos en esa columna.»
//
// ═══ EL CRITERIO ═══
//
//   DIRECTO    = el costo impacta en UNA OBRA (o en las obras de un cliente): materiales, subcontratos,
//                alquiler de equipos, fletes, combustible de máquinas de obra, servicios contratados para
//                esa obra. La señal que lo dice es la columna «Obra» (L): `OB-####` o «Sin obra – cliente».
//   INDIRECTO  = no se imputa a ninguna obra: administración, taller, vehículos y combustible no asignados,
//                honorarios, comunicaciones, EPP de stock, reparaciones de flota. La señal: L = ES-ADM /
//                ES-TAL.
//   ESTRUCTURA = NO es un criterio nuevo: es la convención que el dueño YA usa en la columna para lo que
//                no es una compra —nómina, cargas, impuestos, préstamo— y que por decisión suya (14/09:
//                «para todos esos tipos de gastos ya teníamos pestañas») no debería estar en Compras. Se
//                reproduce porque es unánime: 109 de 109 filas de Sueldos / SAC / ARCA / FCL / SINDICATOS /
//                Banco o de Unidad Impuestos / Financiero llevan «Estructura» (espejo del 18/09/2026).
//
// ═══ POR QUÉ MANDA LA COLUMNA L Y NO EL CONCEPTO ═══
//
// Realidad única: `sync-compras.mjs` ya decide, con `proyectarObraDeFila`, a qué obra va cada fila y con
// eso arma `costos_obra` y `compra_obra_asignada`. Una fila que hoy suma en el costo de una obra ES
// directa por definición, y una que el dueño mandó a ES-ADM/ES-TAL no lo es. Inventar acá una segunda
// lectura por palabras del concepto («cemento» = directo) es tener dos verdades; el concepto sólo se
// usa para frenar —no para decidir— cuando contradice a la L (ver `PROVEEDORES_DE_ESTRUCTURA`).
//
// ═══ LO QUE LAS 491 ETIQUETAS DEL DUEÑO ENSEÑAN (medido, no supuesto) ═══
//
// Las etiquetas «Directo/Indirecto» de ene–abr/2026 NO son función de la obra ni del proveedor: Corralón
// Progreso × LE Cierre Perimetral tiene 7 Directo y 8 Indirecto; Combustibles Barceló × Taller, 9 y 10.
// Cemento para Mampostería figura Indirecto y los honorarios del contador figuran Directo. Esa columna
// histórica codificó otra cosa (no se sabe cuál) y por eso NO se toca ni se «corrige»: se informa. El
// bloque «Estructura» (filas 349–478) sí es consistente para nómina/impuestos y trae 18 filas de
// materiales de LA ESTRELLA/San Francisco que contradicen cualquier criterio: también se informan.
//
// ═══ QUÉ NO ESCRIBE (excepciones, para el dueño) ═══
//
//   · L vacía y la inferencia J/K no resuelve una obra.
//   · L inválida (no es una opción del desplegable).
//   · L dice obra pero el proveedor sólo factura estructura (contador, telefonía, GPS…): contradicción.
//   · Fila anulada, sin proveedor y sin plata, o con «Tipo de Costo» ya cargado (nunca se pisa).
//
// ═══ CÓMO SE ENCHUFA AL CARGADOR (no enchufado: la rama del cargador está en revisión) ═══
//
// En `lib/carga-comprobantes.mjs`, donde se arma la fila (`set('obraFila', c.obraFila)`), el destino ya
// está resuelto por `obraParaLaColumna` (`lib/comprobantes/obra-y-destino.mjs`): con ese `destino` se
// llama `tipoDeCosto({ proveedor, unidad_negocio, destino, obra_id })` y se hace `set('tipoCosto', tipo)`.
// Para eso `DECLARACION` (`lib/comprobantes/contrato-columnas.mjs`) tiene que pasar «Tipo de Costo» de
// `PERSONA` a `CARGADOR` con `rol: 'tipoCosto'`; `contrato-columnas.test.mjs` va a pedir que se declare.

import { normAlias } from './jornales-a-registros-hh.mjs'

export const TIPO = Object.freeze({ DIRECTO: 'Directo', INDIRECTO: 'Indirecto', ESTRUCTURA: 'Estructura' })

/** El vocabulario que el dueño ya usa en la columna. Nada fuera de esto se escribe. */
export const VOCABULARIO = Object.freeze(Object.values(TIPO))

/**
 * Los «proveedores» que no son proveedores: nómina, cargas, impuestos, préstamo. El dueño los carga a
 * mano en Compras y les pone «Estructura» siempre (109/109 al 18/09/2026).
 */
export const PROVEEDORES_NOMINA_IMPUESTOS = Object.freeze(['sueldos', 'sac', 'arca', 'fcl', 'sindicatos', 'banco'])

/** Las Unidades de Negocio que, por decisión del dueño (14/09), no van en Compras: tienen su pestaña. */
export const UNIDADES_FUERA_DE_COMPRAS = Object.freeze(['impuestos', 'financiero'])

/**
 * Proveedores que en TODO el espejo (980 filas, 18/09/2026) facturan 100 % a estructura con n ≥ 3:
 * contador, telefonía, rastreo satelital, Workspace, gomería, service de tanques, estación de servicio
 * de la administración. Si una fila de éstos trae una obra en la L, hay contradicción y no se escribe.
 * Nómina e impuestos no van acá: los toma antes `PROVEEDORES_NOMINA_IMPUESTOS`.
 */
export const PROVEEDORES_DE_ESTRUCTURA = Object.freeze([
  'movistar', 'rsv', 'robles jose maria', 'google', 'diesel rodriguez', 'neumagom', 'estacion central',
])

export const SENAL = Object.freeze({
  NOMINA_IMPUESTOS: 'nómina/impuestos (convención del dueño)',
  COLUMNA_OBRA: 'columna Obra (L) = obra',
  COLUMNA_ESTRUCTURA: 'columna Obra (L) = estructura',
  INFERENCIA_JK: 'L vacía · obra inferida de J/K por el asignador del OS',
})

const T = (v) => String(v ?? '').trim()
const estaEn = (lista, v) => lista.includes(normAlias(v))

/** ¿La fila es candidata a recibir un valor? Anulada, vacía o ya cargada no lo es. */
export function esCandidata(f = {}) {
  if (f.anulada) return false
  if (/^(eliminado|cancelado)$/i.test(T(f.estado))) return false
  if (T(f.tipo_costo)) return false
  const total = Number(f.total ?? f.importe)
  if (!T(f.proveedor) && !(Number.isFinite(total) && total !== 0)) return false
  return true
}

/**
 * NÚCLEO PURO: el tipo de costo de una fila y la señal que lo decidió.
 *
 * @param {object} f  la fila como la deja `filaACompra` + `proyectarObraDeFila` (+ `via` del asignador si L vacía)
 *   · proveedor, unidad_negocio, obra_texto, obra_celda
 *   · destino: 'obra' | 'estructura_admin' | 'estructura_taller' | null   (de la L)
 *   · obra_id: string|null · obra_inconsistencia: string|null
 *   · via: string|null  (VIA.* de `compras-obra-asignada.mjs`, sólo cuando L está vacía)
 * @returns {{tipo:string|null, senal:string|null, motivo:string, nota?:string}}
 *   `tipo: null` = no hay evidencia suficiente (o hay contradicción): NO se escribe; `motivo` dice por qué.
 */
export function tipoDeCosto(f = {}) {
  const prov = T(f.proveedor)
  const unidad = T(f.unidad_negocio)
  const celda = T(f.obra_celda)

  // 1 · Nómina, cargas, impuestos y préstamo: la convención del dueño, antes que cualquier otra señal
  //     (él etiquetó «Estructura» incluso los Sueldos con obra en la J).
  if (estaEn(PROVEEDORES_NOMINA_IMPUESTOS, prov) || estaEn(UNIDADES_FUERA_DE_COMPRAS, unidad)) {
    return { tipo: TIPO.ESTRUCTURA, senal: SENAL.NOMINA_IMPUESTOS,
      motivo: `proveedor «${prov}»${unidad ? ` · unidad «${unidad}»` : ''}: nómina/cargas/impuestos/financiero → Estructura (109/109 en las etiquetas del dueño)` }
  }

  // 2 · La columna Obra decide.
  if (f.destino === 'obra') {
    if (estaEn(PROVEEDORES_DE_ESTRUCTURA, prov)) {
      return { tipo: null, senal: null,
        motivo: `contradicción: la L dice obra («${celda}») pero «${prov}» sólo factura estructura en todo el historial` }
    }
    const nota = f.obra_inconsistencia ? `la I dice «${unidad}»; manda la L (regla del OS 14/09)` : undefined
    const que = f.obra_id ? `obra ${f.obra_id}` : 'costo del cliente sin sub-obra («Sin obra – …»)'
    return { tipo: TIPO.DIRECTO, senal: SENAL.COLUMNA_OBRA, motivo: `L «${celda}» → ${que}`, ...(nota ? { nota } : {}) }
  }
  if (f.destino === 'estructura_admin' || f.destino === 'estructura_taller') {
    const nota = f.obra_inconsistencia ? `la I dice «${unidad}»; manda la L (regla del OS 14/09)` : undefined
    return { tipo: TIPO.INDIRECTO, senal: SENAL.COLUMNA_ESTRUCTURA, motivo: `L «${celda}» → ${f.destino}`, ...(nota ? { nota } : {}) }
  }

  // 3 · L con texto pero sin destino: no es una opción del desplegable. No se adivina.
  if (celda) {
    return { tipo: null, senal: null, motivo: `L «${celda}» no se entiende: ${f.obra_inconsistencia ?? 'no es una opción del desplegable'}` }
  }

  // 4 · L vacía: sólo si el asignador del OS (J/K) resuelve UNA obra concreta. «Sin obra» o «no es
  //     cliente» no alcanzan sin la L: el dueño no decidió y el concepto no decide por él.
  if (f.obra_id && ['obra_por_alias', 'obra_por_nombre', 'unica_obra_del_cliente'].includes(String(f.via ?? ''))) {
    if (estaEn(PROVEEDORES_DE_ESTRUCTURA, prov)) {
      return { tipo: null, senal: null, motivo: `contradicción: J/K resuelven la obra ${f.obra_id} pero «${prov}» sólo factura estructura` }
    }
    return { tipo: TIPO.DIRECTO, senal: SENAL.INFERENCIA_JK, motivo: `L vacía · J «${T(f.obra_texto)}» + K «${T(f.detalle_obra).slice(0, 40)}» → obra ${f.obra_id} (${f.via})` }
  }
  const j = T(f.obra_texto)
  return { tipo: null, senal: null,
    motivo: `L vacía y J/K no resuelven una obra${j ? ` (J «${j}»${f.via ? `, ${f.via}` : ''})` : ' (J vacía)'}` }
}

/**
 * EL PLAN: qué filas reciben qué valor, cuáles quedan como excepción y cuáles no se tocan.
 * @param {object[]} filas  todas las filas de la pestaña (ya proyectadas)
 * @returns {{escribir:object[], excepciones:object[], yaTenian:number, fueraDeAlcance:number}}
 */
export function planDeTipoCosto(filas = []) {
  const escribir = []
  const excepciones = []
  let yaTenian = 0
  let fueraDeAlcance = 0
  for (const f of filas) {
    if (T(f.tipo_costo)) { yaTenian++; continue }
    if (!esCandidata(f)) { fueraDeAlcance++; continue }
    const r = tipoDeCosto(f)
    const base = {
      fila: f.fila, proveedor: T(f.proveedor) || null, concepto: T(f.concepto) || null,
      detalle: T(f.detalle_obra) || null, cliente: T(f.obra_texto) || null, obra_celda: T(f.obra_celda) || null,
      unidad: T(f.unidad_negocio) || null, total: f.total ?? null, motivo: r.motivo, ...(r.nota ? { nota: r.nota } : {}),
    }
    if (r.tipo) escribir.push({ ...base, valor: r.tipo, senal: r.senal })
    else excepciones.push(base)
  }
  return { escribir, excepciones, yaTenian, fueraDeAlcance }
}

/**
 * LA MEDICIÓN contra las filas que el dueño ya etiquetó: cuántas reproduce la regla y cuáles no.
 * Las que la regla deja sin decisión no cuentan como acierto ni como desacuerdo: se listan aparte.
 */
export function medirContraEtiquetas(filas = []) {
  const etiquetadas = filas.filter((f) => T(f.tipo_costo))
  const porTipo = {}
  const desacuerdos = []
  const sinDecision = []
  let aciertos = 0
  for (const f of etiquetadas) {
    const suyo = T(f.tipo_costo)
    const r = tipoDeCosto(f)
    porTipo[suyo] ??= { n: 0, aciertos: 0, desacuerdos: 0, sinDecision: 0 }
    porTipo[suyo].n++
    const item = { fila: f.fila, dueno: suyo, regla: r.tipo, proveedor: T(f.proveedor), concepto: T(f.concepto).slice(0, 50), cliente: T(f.obra_texto), obra_celda: T(f.obra_celda), motivo: r.motivo }
    if (!r.tipo) { porTipo[suyo].sinDecision++; sinDecision.push(item); continue }
    if (r.tipo === suyo) { aciertos++; porTipo[suyo].aciertos++; continue }
    porTipo[suyo].desacuerdos++
    desacuerdos.push(item)
  }
  return { total: etiquetadas.length, aciertos, desacuerdos, sinDecision, porTipo }
}

/**
 * Los rangos a escribir: tramos contiguos de filas del plan, una columna. `[{range, values}]` para
 * `batchUpdateValues`. Nunca incluye una fila que no esté en el plan (ni siquiera con '').
 */
export function tramosDeEscritura(escribir = [], { pestana = 'Compras', letra } = {}) {
  if (!letra) throw new Error('tramosDeEscritura: falta la letra de la columna')
  const orden = [...escribir].sort((a, b) => a.fila - b.fila)
  const tramos = []
  for (const e of orden) {
    const u = tramos[tramos.length - 1]
    if (u && e.fila === u.hasta + 1) { u.hasta = e.fila; u.valores.push(e.valor); continue }
    tramos.push({ desde: e.fila, hasta: e.fila, valores: [e.valor] })
  }
  return tramos.map((t) => ({ range: `'${pestana}'!${letra}${t.desde}:${letra}${t.hasta}`, values: t.valores.map((v) => [v]) }))
}

/**
 * LA VERIFICACIÓN: la columna releída, celda por celda, contra el plan y contra el respaldo.
 * @param {Array<{fila:number, valor:string}>} respaldo  la columna entera ANTES
 * @param {object[]} escribir  el plan
 * @param {Map<number,string>} leido  fila → valor DESPUÉS (todas las filas del respaldo)
 */
export function verificarRelectura({ respaldo = [], escribir = [], leido = new Map() }) {
  const previsto = new Map(escribir.map((e) => [e.fila, e.valor]))
  const noAterrizo = []
  const ajenasCambiadas = []
  let confirmadas = 0
  for (const r of respaldo) {
    const ahora = T(leido.get(r.fila))
    if (previsto.has(r.fila)) {
      if (ahora === previsto.get(r.fila)) confirmadas++
      else noAterrizo.push({ fila: r.fila, esperaba: previsto.get(r.fila), leido: ahora })
    } else if (ahora !== T(r.valor)) {
      ajenasCambiadas.push({ fila: r.fila, antes: T(r.valor), ahora })
    }
  }
  return { previstas: escribir.length, confirmadas, noAterrizo, ajenasCambiadas }
}

/**
 * LA REVERSA: qué celdas devolver a su valor previo. Sólo las del plan cuyo valor actual es EXACTAMENTE el
 * que se escribió y cuyo valor previo en el respaldo es el que el plan dice que había (vacío en el relleno;
 * `antes` en una corrección). Si alguien ya la cambió, no es mía y no se toca.
 * @returns {{vaciar:object[], restaurar:object[], noSonMias:object[]}}  `vaciar` = previo vacío; `restaurar` = previo con texto
 */
export function planDeReversa({ escribir = [], respaldo = [], leido = new Map() }) {
  const previo = new Map(respaldo.map((r) => [r.fila, T(r.valor)]))
  const vaciar = []
  const restaurar = []
  const noSonMias = []
  for (const e of escribir) {
    const ahora = T(leido.get(e.fila))
    const esperado = T(e.antes)
    if (previo.get(e.fila) !== esperado) { noSonMias.push({ fila: e.fila, motivo: `el respaldo dice «${previo.get(e.fila) ?? ''}» y el plan esperaba «${esperado}»` }); continue }
    if (ahora !== e.valor) { noSonMias.push({ fila: e.fila, motivo: `dice «${ahora}» y yo escribí «${e.valor}»` }); continue }
    if (esperado) restaurar.push({ fila: e.fila, valor: e.valor, antes: esperado })
    else vaciar.push({ fila: e.fila, valor: e.valor })
  }
  return { vaciar, restaurar, noSonMias }
}

/**
 * LA CORRECCIÓN QUE ORDENÓ EL DUEÑO (18/09/2026). Se le mostraron las 18 filas que él marcó «Estructura»
 * y que tienen una obra (OB-####) en la columna Obra —bloque 349–378, $33.434.550— y contestó, textual:
 * «no son de estructura entonces, son CIVIL, cambialas». Las 18 ya tienen Unidad de Negocio «Civil»;
 * «Civil» no es un valor de Tipo de Costo, así que la orden es Tipo de Costo «Estructura» → «Directo»
 * (su criterio de la mañana: directo es lo que impacta en la obra). La Unidad de Negocio no se toca.
 *
 * Fila + proveedor: el ID de Compras es `=ROW()-4`, una posición; si alguien inserta una fila arriba, la
 * fila 349 es otra compra y el proveedor lo delata.
 */
export const CORRECCION_ESTRUCTURA_A_DIRECTO_1809 = Object.freeze({
  pedido: '«no son de estructura entonces, son CIVIL, cambialas» — dueño, 18/09/2026',
  de: TIPO.ESTRUCTURA,
  a: TIPO.DIRECTO,
  filas: Object.freeze([
    [349, 'FEMENIA'], [351, 'Diego Sosa'], [352, 'Metalis'], [353, 'Metalis'], [354, 'DUPEC'], [355, 'Gerson Castro'],
    [359, 'Fernandez'], [360, 'FEMENIA'], [361, 'FEMENIA'], [362, 'Herrero'], [363, 'Pocero'], [364, 'Pocero'],
    [365, 'FEMENIA'], [366, 'Diego Sosa'], [367, 'DUPEC'], [368, 'DUPEC'], [377, 'Industrias Castel'], [378, 'Alumetal'],
  ].map(([fila, proveedor]) => Object.freeze({ fila, proveedor }))),
})

/**
 * NÚCLEO PURO: el plan de una corrección con GUARDA POR VALOR ESPERADO. Se escribe `a` sólo en la celda
 * que hoy dice exactamente `de`, en la fila del proveedor esperado y con una obra en la columna Obra.
 * Cualquier otra cosa no se toca y se informa.
 * @param {object[]} filas  la pestaña proyectada (fila, proveedor, tipo_costo, destino, obra_celda, …)
 * @returns {{escribir:object[], noSeTocan:object[]}}  cada `escribir` lleva `antes` (para la reversa)
 */
export function planDeCorreccion(filas = [], correccion = CORRECCION_ESTRUCTURA_A_DIRECTO_1809) {
  const porFila = new Map(filas.map((f) => [f.fila, f]))
  const escribir = []
  const noSeTocan = []
  for (const o of correccion.filas) {
    const f = porFila.get(o.fila)
    const base = { fila: o.fila, proveedor: T(f?.proveedor) || null, concepto: T(f?.concepto) || null, obra_celda: T(f?.obra_celda) || null, unidad: T(f?.unidad_negocio) || null, total: f?.total ?? null }
    if (!f) { noSeTocan.push({ ...base, motivo: 'la fila no existe o no tiene ID' }); continue }
    if (normAlias(f.proveedor) !== normAlias(o.proveedor)) { noSeTocan.push({ ...base, motivo: `esperaba proveedor «${o.proveedor}»: la fila se movió` }); continue }
    if (T(f.tipo_costo) !== correccion.de) { noSeTocan.push({ ...base, motivo: `Tipo de Costo dice «${T(f.tipo_costo)}», no «${correccion.de}»: ya cambió, no se toca` }); continue }
    if (f.destino !== 'obra') { noSeTocan.push({ ...base, motivo: `la columna Obra dice «${T(f.obra_celda)}», no una obra` }); continue }
    escribir.push({ ...base, valor: correccion.a, antes: correccion.de, motivo: correccion.pedido })
  }
  return { escribir, noSeTocan }
}

/**
 * LA SEGUNDA CORRECCIÓN QUE ORDENÓ EL DUEÑO (18/09/2026, tarde). Regla vigente, textual: Directo = impacta en
 * una obra; Indirecto = Administración (ES-ADM) y Taller (ES-TAL). Las filas cuya columna Obra dice estructura
 * y que él había etiquetado «Directo» pasan a «Indirecto»: «sí». Medido sobre el espejo y sobre la pestaña viva
 * el 18/09: 71 filas (Administracion 36 · Taller 23 · TALLER 3 · Almacen 9 — todas con L = ES-ADM/ES-TAL).
 *
 * No se nombran filas: la orden es la REGLA, y la fila la elige la columna Obra que él mismo cargó. La guarda
 * es por valor esperado: se escribe `a` sólo donde la celda dice exactamente `de` y la L dice estructura.
 */
export const CORRECCION_DIRECTO_A_INDIRECTO_ESTRUCTURA_1809 = Object.freeze({
  nombre: 'directo-a-indirecto-estructura',
  pedido: 'Administración y Taller marcadas «Directo» pasan a «Indirecto»: «sí» — dueño, 18/09/2026',
  de: TIPO.DIRECTO,
  a: TIPO.INDIRECTO,
  destinos: Object.freeze(['estructura_admin', 'estructura_taller']),
  /** Filas que quedan afuera aunque cumplan la regla (decisión del dueño). */
  excluir: Object.freeze([983]),
})

/** Las correcciones que el script acepta por nombre (`--corregir <nombre>`). */
export const CORRECCIONES = Object.freeze({
  [CORRECCION_DIRECTO_A_INDIRECTO_ESTRUCTURA_1809.nombre]: CORRECCION_DIRECTO_A_INDIRECTO_ESTRUCTURA_1809,
})

/**
 * NÚCLEO PURO: el plan de una corrección POR DESTINO con guarda por valor esperado. Recorre la pestaña entera:
 * escribe `a` en toda fila cuyo `destino` (de la columna Obra) esté en `destinos` y cuyo Tipo de Costo diga
 * exactamente `de`. Lo demás no se toca. Devuelve también el conteo por texto de la J, para cotejarlo con lo
 * que se le mostró al dueño antes de escribir.
 * @param {object[]} filas  la pestaña proyectada (fila, proveedor, tipo_costo, destino, obra_celda, obra_texto, …)
 * @returns {{escribir:object[], porCliente:Object<string,number>, excluidas:object[]}}
 */
export function planDeCorreccionPorDestino(filas = [], correccion = CORRECCION_DIRECTO_A_INDIRECTO_ESTRUCTURA_1809) {
  const escribir = []
  const excluidas = []
  const porCliente = {}
  for (const f of filas) {
    if (!correccion.destinos.includes(f.destino)) continue
    if (T(f.tipo_costo) !== correccion.de) continue
    const base = {
      fila: f.fila, proveedor: T(f.proveedor) || null, concepto: T(f.concepto) || null, cliente: T(f.obra_texto) || null,
      obra_celda: T(f.obra_celda) || null, unidad: T(f.unidad_negocio) || null, total: f.total ?? null,
    }
    if ((correccion.excluir ?? []).includes(f.fila)) { excluidas.push({ ...base, motivo: 'excluida por decisión del dueño' }); continue }
    if (esAnuladaTC(f)) { excluidas.push({ ...base, motivo: 'fila anulada' }); continue }
    porCliente[base.cliente ?? '(vacía)'] = (porCliente[base.cliente ?? '(vacía)'] ?? 0) + 1
    escribir.push({ ...base, valor: correccion.a, antes: correccion.de, motivo: `L «${base.obra_celda}» → ${f.destino}: ${correccion.pedido}` })
  }
  return { escribir, porCliente, excluidas }
}

const esAnuladaTC = (f) => Boolean(f.anulada) || /^(eliminado|cancelado)$/i.test(T(f.estado))
