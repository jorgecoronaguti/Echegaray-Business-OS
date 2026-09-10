// LA ECONOMÍA DE UNA OBRA EN CARTERA — contratado, costo MO, costo materiales y margen — COMO UN
// SOLO CONCEPTO, DEFINIDO UNA VEZ.
//
// ═══ POR QUÉ EXISTE (08/09/2026) ═══
//
// El dueño: «en la pestaña OBRAS del Sheet Flujo de Fondos están los montos contratados y los valores
// de costeo de mano de obra y materiales de cada obra; agregarlos en Clientes». La pantalla decía
// «sin contrato» en las nueve obras activas porque leía `obra_canonica.monto_contratado`, que nadie
// carga, mientras la pestaña OBRAS publicaba el contrato leído de la ORDEN DE COMPRA de Cobranzas.
// Dos caras, dos verdades: es lo que REALIDAD ÚNICA prohíbe.
//
// Acá NO se lee ninguna fuente: se recibe lo que ya leyó `obras-pestana.mjs` (`contratoDeObra`) y lo
// que suma `obra_egreso_proyectado`, y se resuelve con las MISMAS reglas que la columna D de OBRAS
// (`contratado()` en obras-grilla.mjs): OC en pesos > U$S × TC > suma viva de sus filas.

import { filasDeObra, normalizarMoneda, prefiereContratoUsd } from './cobranzas-contrato.mjs'

/** Lo que Cobranzas escribe en Estado para una fila que NO es venta (mismo criterio que OBRAS). */
export const NO_VENTA = 'CANCELAR'

/** El origen de cada contratado, como texto: quien audita tiene que saber por cuál camino salió. */
export const ORIGEN = Object.freeze({
  ocPesos: 'oc-pesos', ocUsd: 'oc-usd-x-tc', ocCliente: 'oc-cliente', sumaViva: 'suma-viva', sinDato: null,
})

/** La alícuota general de IVA con la que el cliente emite sus órdenes de compra. */
export const IVA = 1.21

/**
 * TOLERANCIA DE LA COMPARACIÓN ORDEN vs COBRANZAS: UN PESO.
 *
 * No es holgura para tapar diferencias: es el redondeo. La OC 2266 dice $24.309.950,07 y sus dos
 * certificaciones suman $20.090.867,84 contra $20.090.867,83 de dividir por 1,21 — un centavo, que
 * es el resto de partir un número impar en dos. Con tolerancia CERO esa obra saldría marcada como
 * discrepante para siempre; con una tolerancia amplia, una obra a la que le falta un hito de
 * $50.000 pasaría por respaldada. Un peso separa las dos cosas.
 */
export const TOLERANCIA = 1

/**
 * EL IMPORTE DE UNA ORDEN DE COMPRA, SIN IVA.
 *
 * ARCOR emite sus órdenes en NETO y Messina con IVA — verificado el 10/09/2026 contra la propia
 * base: las cobranzas que citan cada OC de ARCOR suman exactamente el importe de la orden (0,5+0,5;
 * 0,3+0,1+0,3+0,3; 1,0), y las de Messina sólo cierran dividiendo por 1,21. La diferencia la declara
 * `cliente_orden.importe_es_neto`, no un `if` con el nombre del cliente adentro: el día que entre un
 * cliente nuevo, un `if` lo pone del lado equivocado en silencio y una columna obliga a decidirlo.
 *
 * Réplica de `public.neto_de_orden()`.
 */
export function netoDeOrden(importe, esNeto = false) {
  const n = aNum(importe)
  if (n === null) return null
  return esNeto ? n : n / IVA
}

/**
 * LOS TOTALES DE LAS ÓRDENES DE UNA OBRA, PARTIDOS POR LA VENTANA DEL AÑO.
 *
 * ═══ POR QUÉ SE PARTEN Y NO SE SUMAN ═══
 *
 * `bsa-planta` se fusionó en `messina-bsa` y arrastró sus tres OC de 2024 ($38.321.214,36). Sumadas
 * a las dos de 2026 daban «OC · OP c/IVA $49.886.583» al lado de un contratado de $17,7 M: la regla
 * de oro 3 —nunca mezclar ventanas de tiempo incompatibles— con dos años de distancia y sin ninguna
 * señal en pantalla. La ventana es la MISMA que acota el contratado (el `ANO` de la pestaña OBRAS),
 * y lo de afuera no se tira: se cuenta aparte, porque son papeles reales de la misma obra.
 *
 * @param {{importe:number|null, importeEsNeto?:boolean, fecha?:string|Date|null, numero?:string|null}[]} ordenes
 * @param {number|null} anio la ventana; sin ella TODAS las órdenes son de la ventana
 * @returns {{netoVentana:number|null, cIvaVentana:number, cIvaHistorico:number, nVentana:number,
 *   nHistorico:number, numeros:string[]}}
 */
export function totalesDeOrdenes(ordenes = [], anio = null) {
  let netoVentana = 0; let cIvaVentana = 0; let cIvaHistorico = 0
  let nVentana = 0; let nHistorico = 0
  const numeros = []
  for (const o of ordenes) {
    const civa = aNum(o?.importe)
    if (civa === null) continue
    const ano = anioDe(o?.fecha)
    if (anio && ano !== null && ano !== anio) { cIvaHistorico += civa; nHistorico++; continue }
    netoVentana += netoDeOrden(civa, o?.importeEsNeto) ?? 0
    cIvaVentana += civa
    nVentana++
    if (o?.numero) numeros.push(String(o.numero))
  }
  return {
    netoVentana: nVentana ? netoVentana : null,
    cIvaVentana,
    cIvaHistorico,
    nVentana,
    nHistorico,
    // ORDENADOS POR NÚMERO, no por el orden en que los devolvió la consulta: «según OC 2097, 2226» y
    // «según OC 2226, 2097» son el mismo hecho escrito de dos formas, y un texto que cambia sin que
    // cambie nada obliga a mirar dos veces cada vez que el sync reescribe la fila.
    numeros: numeros.sort((a, b) => Number(corto(a)) - Number(corto(b))),
  }
}

/** El año de una fecha ISO o de un Date. `null` cuando no se puede leer — y entonces NO es histórica:
 *  descartar una orden por un formato le sacaría plata a la obra sin dejar rastro. */
const anioDe = (v) => {
  if (v instanceof Date) return v.getUTCFullYear()
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(v ?? '').trim())
  return m ? Number(m[1]) : null
}

/**
 * LA VENTA VIVA DE UNA OBRA: el NETO de sus filas de Cobranzas que no están canceladas, en pesos.
 * Es la tercera forma del contrato (obras sin OC declarada, p. ej. las de MESSINA) — la misma suma
 * que la fórmula `venta()` de OBRAS, hecha en JS para poder persistirla.
 *
 * @returns {{pesos:number|null, filas:number, sinMoneda:number}} `pesos` es null cuando la obra no
 *   tiene ninguna fila (no se sabe → no es cero) o cuando una fila en USD no pudo valuarse.
 */
export function ventaViva(filas = [], cols = {}, selector = {}, tc = null) {
  const indices = filasDeObra(filas, cols, selector)
  let pesos = 0
  let n = 0
  let sinMoneda = 0
  for (const i of indices) {
    const f = filas[i] ?? []
    if (String(f[cols.estado] ?? '').trim().toUpperCase() === NO_VENTA) continue
    const neto = Number(f[cols.neto]) || 0
    const moneda = normalizarMoneda(f[cols.moneda])
    if (moneda === 'USD') {
      if (!Number.isFinite(tc) || tc <= 0) { sinMoneda++; continue }
      pesos += neto * tc
    } else pesos += neto
    n++
  }
  if (!n || sinMoneda) return { pesos: null, filas: n, sinMoneda }
  return { pesos, filas: n, sinMoneda }
}

/**
 * EL CONTRATADO EN PESOS, POR EL MISMO CAMINO QUE LA COLUMNA D DE OBRAS — MÁS EL PAPEL QUE FALTABA.
 *
 * ═══ EL DEFECTO QUE CIERRA `oc`  (10/09/2026) ═══
 *
 * Cuatro obras de nueve salían marcadas `suma-viva` —«no lo respalda ningún papel»— teniendo la
 * orden de compra cargada en `cliente_orden`: Adicional Tercer Muro (OC 2256), Playón Dilución de
 * Ácido (OC 2266), Pisos 120 m² (OC 2097 + 2226). En las tres, la suma de las órdenes SIN IVA
 * coincide al centavo con la suma viva de Cobranzas. El número no cambia; cambia lo que se puede
 * AFIRMAR de él, y eso es lo que decide si se reclama o no.
 *
 * SI LAS ÓRDENES NO COINCIDEN, EL ORIGEN NO MEJORA. BSA tiene cinco OC por $49.886.583 c/IVA contra
 * $17.704.199,40 de Cobranzas: publicar «según OC» ahí sería firmar un número con un papel que dice
 * otra cosa. Sale `suma-viva` con la diferencia ESCRITA en `nota` — una discrepancia declarada se
 * resuelve; una que sólo existe entre dos pantallas, no.
 *
 * EL PAPEL NO PISA EL NÚMERO, LO RESPALDA. Cuando coincide se publica la SUMA VIVA y no el neto de
 * la orden: son el mismo número salvo el redondeo, y publicar el de la orden metería un centavo de
 * diferencia contra la celda de la pestaña por ninguna razón.
 *
 * @param {{contrato?:number|null, contratoUsd?:number|null, ventaViva?:number|null,
 *   oc?:{netoVentana:number|null, cIvaVentana:number, nVentana:number, numeros:string[]}|null}} c
 * @param {number|null} tc tipo de cambio USD leído del Sheet
 * @returns {{contratado:number|null, contratadoUsd:number|null, origen:string|null,
 *   referencia:string|null, nota:string|null}}
 */
export function contratadoEnPesos(c = {}, tc = null) {
  const oc = c.oc ?? null
  // EL DÓLAR LE GANA AL PESO CUANDO EL PESO ES MÁS CHICO QUE EL DÓLAR (ver `prefiereContratoUsd`):
  // es imposible, y significa que el "pesos" leído no era un contrato. Quattropani se publicaba
  // contratada en $1.504 por ese camino.
  if (prefiereContratoUsd(c.contrato, c.contratoUsd)) {
    // EL PESO NO SE PERSISTE COMO VERDAD: lo valúa `public.contratado_valuado()` con el TC vigente
    // cada vez que alguien mira. El que se guarda acá es el respaldo para cuando `tipo_cambio` esté
    // vacía — degradarse al dólar de la última corrida es peor que el vivo y mucho mejor que un NULL.
    const pesos = Number.isFinite(tc) && tc > 0 ? c.contratoUsd * tc : null
    return marcar({ contratado: pesos, contratadoUsd: c.contratoUsd, origen: pesos === null ? ORIGEN.sinDato : ORIGEN.ocUsd }, oc)
  }
  if (Number.isFinite(c.contrato) && c.contrato > 0) {
    return marcar({ contratado: c.contrato, contratadoUsd: null, origen: ORIGEN.ocPesos }, oc)
  }
  const viva = Number.isFinite(c.ventaViva) && c.ventaViva > 0 ? c.ventaViva : null
  if (viva !== null && oc?.nVentana && oc.netoVentana !== null
      && Math.abs(oc.netoVentana - viva) <= TOLERANCIA) {
    return {
      contratado: viva, contratadoUsd: null, origen: ORIGEN.ocCliente,
      referencia: `según OC ${oc.numeros.map(corto).join(', ')}`, nota: null,
    }
  }
  if (viva !== null) return marcar({ contratado: viva, contratadoUsd: null, origen: ORIGEN.sumaViva }, oc)
  return marcar({ contratado: null, contratadoUsd: null, origen: ORIGEN.sinDato }, oc)
}

/** «00002-00002256» → «2256». Es lo que se lee en pantalla; el número entero está en `cliente_orden`. */
const corto = (n) => String(n ?? '').match(/\d+/g)?.map((t) => t.replace(/^0+/, '')).filter(Boolean).pop() ?? String(n)

/**
 * LA DISCREPANCIA CONTRA LOS PAPELES, ESCRITA — o nada si no hay papeles o si cierran.
 *
 * Playón de Azufre declara su contrato en Cobranzas ($65.000.000 blanco + $37.500.000 negro) y su
 * única OC cargada cubre sólo el blanco: la nota lo dice en vez de dejar dos números sueltos en dos
 * columnas que nadie puede reconciliar.
 */
function marcar(r, oc) {
  const salida = { ...r, referencia: null, nota: null }
  if (!oc?.nVentana || oc.netoVentana === null || r.contratado === null) return salida
  if (Math.abs(oc.netoVentana - r.contratado) <= TOLERANCIA) {
    salida.referencia = `según OC ${oc.numeros.map(corto).join(', ')}`
    return salida
  }
  salida.nota = `OC ${pesos(oc.cIvaVentana)} c/IVA (${pesos(oc.netoVentana)} neto)`
    + ` vs Cobranzas ${pesos(r.contratado)}`
  return salida
}

const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/**
 * EL MARGEN PROYECTADO: contratado − MO − materiales, en $ y en % del contratado.
 * Un dato que falta hace faltar el margen: un margen sobre un costo desconocido sería un invento.
 */
export function margenDe({ contratado, costoMo, costoMateriales } = {}) {
  const c = aNum(contratado); const mo = aNum(costoMo); const ma = aNum(costoMateriales)
  if (c === null || mo === null || ma === null) return { margen: null, margenPct: null }
  const margen = c - mo - ma
  return { margen, margenPct: c > 0 ? (margen / c) * 100 : null }
}

const aNum = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * LA FILA QUE SE PERSISTE EN `obra_economia_sheet`, para una obra.
 *
 * @param {object} o la obra de `obras-datos.mjs` (clave, inicio, fin)
 * @param {{contrato, contratoUsd}} c lo que devolvió `contratoDeObra`
 * @param {{mo:number|null, material:number|null}} costos sumas de `obra_egreso_proyectado`
 * @param {{ventaViva:number|null, tc:number|null, obraCanonicaId:string|null,
 *   oc:{netoVentana:number|null, cIvaVentana:number, cIvaHistorico:number, nVentana:number,
 *       nHistorico:number, numeros:string[]}|null}} ctx
 */
export function filaEconomia(o = {}, c = {}, costos = {}, ctx = {}) {
  const oc = ctx.oc ?? null
  const k = contratadoEnPesos({ ...c, ventaViva: ctx.ventaViva ?? null, oc }, ctx.tc ?? null)
  const costoMo = aNum(costos.mo)
  const costoMateriales = aNum(costos.material)
  const m = margenDe({ contratado: k.contratado, costoMo, costoMateriales })
  return {
    obra_clave: o.clave,
    obra_canonica_id: ctx.obraCanonicaId ?? null,
    contratado: k.contratado,
    contratado_usd: k.contratadoUsd,
    costo_mo: costoMo,
    costo_materiales: costoMateriales,
    margen: m.margen,
    plazo_desde: o.inicio ?? null,
    plazo_hasta: o.fin ?? null,
    origen: k.origen,
    referencia: k.referencia,
    nota: k.nota,
    // LOS DOS TOTALES DE OC VIAJAN AUNQUE NO DECIDAN NADA: son lo que la pantalla necesita para
    // mostrar «OC · OP c/IVA» sin sumar 2024 con 2026, y sin ellos el panel vuelve a inventar la
    // ventana por su cuenta.
    oc_civa_ventana: oc ? oc.cIvaVentana : null,
    oc_civa_historico: oc ? oc.cIvaHistorico : null,
    oc_n_ventana: oc ? oc.nVentana : null,
    oc_n_historico: oc ? oc.nHistorico : null,
  }
}
