// EL COSTO POR OBRA QUE PUBLICA app.ecsas.com.ar, CONTRA LA PESTAÑA QUE LO ORIGINA — la regla, pura.
//
// ═══ POR QUÉ EXISTE (dueño, 15/09/2026) ═══
//
// «Revisión de MO, MA, SUB en cada obra que aparece en app.ecsas.com.ar, al detalle; no puede fallar
// nunca eso». Encontró DOS defectos a mano, y los dos son de imputación, no de suma:
//
//   · el subcontrato de PEDRO TELLO ($15.884.000) colgaba de Quattropani y es de Pisos Industriales;
//   · «Galpón 5» (Compras fila 806) estaba en SF - PISOS INDUSTRIALES y es OB-0005.
//
// Los dos comparten forma: la columna L dice una obra y el TEXTO de la fila (K «Detalles / Obra»,
// M «Concepto», J «Cliente / Asignación») nombra otra. Ninguna suma da error —el total general es
// el mismo— así que ningún control por totales los ve. Por eso acá se cruza fila por fila y no
// solamente obra por obra.
//
// ═══ LAS CINCO CAPAS QUE TIENEN QUE DECIR LO MISMO ═══
//
//   1. la pestaña «Compras» viva, agrupada por la columna L («Obra»)
//   2. `public.compra_sheet` — el espejo de la pestaña
//   3. `public.costos_obra` + `public.compra_obra_asignada` — la proyección que consume la app
//   4. `public.costo_de_obras_a_la_fecha(obras)` — lo que la pantalla muestra
//   5. `public.obra_costo_real` — la vista vieja, por TEXTO de obra (se mide, no se cree)
//
// Entre 1 y 2 sólo puede haber desfasaje temporal (el sync). Entre 2 y 3 hay una REGLA
// (`esCostoDeObra`) que descarta filas: cada descarte es un hallazgo con su importe, porque una fila
// que el dueño ve en su pestaña y la app no suma es exactamente lo que él pidió que no pase.
//
// Nada de este módulo toca la red ni la base: recibe filas y devuelve hallazgos. El IO vive en
// `orquestador/scripts/auditar-costo-por-obra.mjs`.

/** Dos decimales. El peso tiene dos por ley; más precisión que ésa es ruido de flotante. */
export const pesos = (n) => Math.round((Number(n) || 0) * 100) / 100

/** La tolerancia: «Total» es una FÓRMULA (`=Importe+IVA`) y vuelve con cola binaria. */
export const TOLERANCIA = 1

const sinAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Texto comparable: sin acentos, sin puntuación, minúsculas, un espacio. */
export const norm = (s) => sinAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * LA COLUMNA L, DECODIFICADA. Cuatro formas y ninguna más:
 *   «OB-0005 · SF - GALPONES…» · «Sin obra – LA ESTRELLA» · «ES-ADM · …» / «ES-TAL · …» · vacía.
 *
 * «Sin obra – CLIENTE» NO ES UNA OBRA: es el cajón del cliente. Confundirlo con una obra fue lo que
 * hizo que el costo de un cliente apareciera repartido en obras que no lo gastaron.
 */
export function parseObraCelda(celda) {
  const t = String(celda ?? '').trim()
  if (!t) return { tipo: 'vacia', clave: '(vacía)', codigo: null, cliente: null }
  const obra = /^(OB-\d{4}|ZZ-\d{4})\s*[·|-]\s*(.*)$/u.exec(t)
  if (obra) return { tipo: 'obra', clave: obra[1], codigo: obra[1], nombre: obra[2].trim(), cliente: null }
  const sin = /^sin\s+obra\s*[–—-]\s*(.+)$/iu.exec(t)
  if (sin) return { tipo: 'sin_obra', clave: `sin-obra:${norm(sin[1])}`, codigo: null, cliente: sin[1].trim() }
  const es = /^(ES-ADM|ES-TAL|IMP|FIN)\b/u.exec(t)
  if (es) return { tipo: 'estructura', clave: es[1], codigo: null, cliente: null, destino: es[1] }
  return { tipo: 'desconocida', clave: `?:${t}`, codigo: null, cliente: null }
}

/**
 * UN DÍA, EN ISO, VENGA DE DONDE VENGA.
 *
 * `pg` devuelve las columnas `date` como objetos `Date` y el Sheet las devuelve como texto ISO. Un
 * `String(fecha).slice(0, 10)` sobre el Date da «Fri Mar 17», que comparado con «2026-09-16» ordena
 * por la «F» y da TODO por futuro: la primera corrida de este script publicó cero materiales en las
 * 26 obras sin un solo error. Un comparador de fechas que nunca tira es peor que uno que tira.
 */
export function dia(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

/** Una fila cuenta como gasto: ni anulada ni ELIMINADO. El resto de los filtros son de la app. */
export const esFilaViva = (f) => !f.anulada && String(f.estado ?? '').trim().toUpperCase() !== 'ELIMINADO'

/** ¿La fila entra en el «a la fecha» que hoy calcula la RPC? Sólo mira la fecha del comprobante. */
export const esALaFecha = (f, hoy) => !dia(f.fecha) || dia(f.fecha) <= hoy

const vacio = () => ({
  materiales: 0, subcontratos: 0, n_materiales: 0, n_subcontratos: 0,
  materiales_por_vencer: 0, subcontratos_por_vencer: 0, bruto: 0, filas: [],
})

/**
 * SUMA POR DESTINO DE LA COLUMNA L, PARTIDA POR RUBRO Y POR MOMENTO DE CAJA.
 *
 * `pagado`/`vencido`/`por_vencer` implementan la regla que el dueño fijó el 15/09/2026: el costo «a
 * la fecha» es lo PAGADO más lo VENCIDO, y las cuotas por vencer viajan aparte. Hoy la RPC no la
 * aplica —cuenta todo comprobante con fecha ≤ hoy—, así que las tres columnas se publican para
 * poder medir la brecha antes de que la regla exista en SQL.
 *
 * @param {Array} filas filas del Sheet o del espejo, ya normalizadas
 * @param {{hoy: string, esSubcontrato?: (f:any)=>boolean}} ctx
 */
export function totalesPorDestino(filas, { hoy, esSubcontrato = (f) => f.es_subcontrato === true }) {
  const out = new Map()
  for (const f of filas) {
    if (!esFilaViva(f)) continue
    const d = parseObraCelda(f.obra_celda)
    if (!out.has(d.clave)) out.set(d.clave, { ...vacio(), destino: d })
    const g = out.get(d.clave)
    const { a_la_fecha: ahora, por_vencer: luego } = aLaFecha(f, hoy)
    const sub = esSubcontrato(f)
    g.bruto = pesos(g.bruto + pesos(f.total))
    if (sub) { g.subcontratos = pesos(g.subcontratos + ahora); g.subcontratos_por_vencer = pesos(g.subcontratos_por_vencer + luego); g.n_subcontratos += 1 } else { g.materiales = pesos(g.materiales + ahora); g.materiales_por_vencer = pesos(g.materiales_por_vencer + luego); g.n_materiales += 1 }
    g.filas.push(f.fila)
  }
  return out
}

/**
 * CUÁNTO DE ESTA FILA ES COSTO «A LA FECHA» Y CUÁNTO FALTA VENCER. La regla del dueño (15/09/2026).
 *
 * Es el espejo en JS de la «REGLA A LA FECHA» de `public.costo_de_obra_filas`, y está escrito aparte
 * A PROPÓSITO: el SQL la calcula sobre `costos_obra` y esto la calcula sobre la pestaña. Dos caminos
 * que arrancan en fuentes distintas y tienen que llegar al mismo peso — si convergen, el número es
 * verdad; si divergen, el hallazgo es real y no un artefacto de haber sumado dos veces lo mismo.
 *
 *   negativo (nota de crédito) → entero, siempre: una devolución ya ocurrió.
 *   «Pagado»                   → entero: ya es caja.
 *   vence después de hoy       → sólo lo efectivamente pagado, acotado al total.
 *   el resto (vencido impago)  → entero: vencido es costo aunque no se haya pagado.
 */
export function aLaFecha(f, hoy) {
  const total = pesos(f.total)
  if (total < 0) return { a_la_fecha: total, por_vencer: 0 }
  if (String(f.estado ?? '').trim().toUpperCase() === 'PAGADO') return { a_la_fecha: total, por_vencer: 0 }
  const vence = dia(f.fecha_prevista) ?? dia(f.fecha_caja)
  const futura = (vence && vence > hoy) || (dia(f.fecha) && dia(f.fecha) > hoy)
  if (!futura) return { a_la_fecha: total, por_vencer: 0 }
  const pagado = Math.min(Math.max(pesos(f.monto_pagado), 0), total)
  return { a_la_fecha: pagado, por_vencer: pesos(total - pagado) }
}

/** Una diferencia de plata que supera la tolerancia, o null. */
export function diferencia(campo, izq, der, tol = TOLERANCIA) {
  const a = pesos(izq); const b = pesos(der)
  return Math.abs(a - b) > tol ? { campo, izquierda: a, derecha: b, dif: pesos(a - b) } : null
}

/**
 * ¿EL TEXTO DE LA FILA NOMBRA OTRA OBRA QUE LA COLUMNA L? — el defecto de «Galpón 5».
 *
 * Se busca sólo lo que NO admite interpretación: un código `OB-####` distinto del de la columna, o
 * el nombre propio de otra obra (su parte distintiva, sin el prefijo del cliente) presente en el
 * texto cuando el nombre de la obra de la columna NO lo está. Un «galpón» suelto no alcanza: lo que
 * dispara es «galpón 5» contra una obra que se llama «GALPÓN 5» y una columna que dice otra cosa.
 *
 * @param {any} fila con obra_celda, detalle_obra, concepto, obra_texto
 * @param {Array<{codigo:string,nombre:string,huella:string,id:string}>} obras catálogo
 */
export function otraObraNombrada(fila, obras) {
  const d = parseObraCelda(fila.obra_celda)
  const texto = norm([fila.detalle_obra, fila.concepto].filter(Boolean).join(' '))
  if (!texto) return null
  const propia = obras.find((o) => o.codigo === d.codigo)
  if (propia && texto.includes(propia.huella)) return null
  const otras = obras.filter((o) => o.codigo !== d.codigo && o.huella && texto.includes(o.huella))
  if (!otras.length) return null
  // Entre varias candidatas gana la huella más larga: «galpon 5» le gana a «galpon».
  const elegida = otras.sort((a, b) => b.huella.length - a.huella.length)[0]
  return { obra: elegida, huella: elegida.huella }
}

/**
 * LA HUELLA DE UNA OBRA: lo que la distingue de sus hermanas, ya normalizado.
 *
 * El nombre viene como «LE - GALPÓN 7»: el prefijo del cliente lo comparten todas, así que buscarlo
 * en el texto daría positivo en cada fila de ese cliente. La huella es lo que va después del guión,
 * y sólo si tiene al menos un dígito o dos palabras — «mamposteria» sola aparece en conceptos de
 * albañilería que no nombran ninguna obra.
 */
export function huellaDeObra(nombre) {
  const sinPrefijo = norm(String(nombre ?? '').replace(/^[A-Z]{2,3}\s*-\s*/u, ''))
  if (!sinPrefijo) return null
  if (!/\d/.test(sinPrefijo) && sinPrefijo.split(' ').length < 2) return null
  return sinPrefijo
}

/**
 * DUPLICADOS PROBABLES: misma fecha, mismo proveedor y mismo importe.
 *
 * No afirma que sean duplicados —dos remitos del mismo día por el mismo monto existen— sino que
 * nadie los miró. Por eso la salida trae las filas, no una conclusión.
 *
 * ═══ LO QUE NO ES UN DUPLICADO: UN PLAN DE CUOTAS ═══
 *
 * PEDRO TELLO factura $6.450.400 y se carga como SEIS filas de $1.075.066,67 con la misma fecha de
 * factura y fechas de pago semanales. La primera versión de este detector llamó «duplicado con el
 * mismo N° de comprobante» a esas seis filas —y a las cinco de Pedro Fredes— por $8,4 M, porque el
 * comprobante estaba VACÍO en las seis y «vacío = vacío» daba igualdad. Dos alarmas falsas de ese
 * tamaño alcanzan para que nadie vuelva a mirar la lista.
 *
 * Una cuota se distingue por su fecha de pago: si todas las filas del grupo vencen en días distintos
 * es un plan, no una repetición. Un duplicado real repite también el día en que se paga.
 */
export function duplicadosProbables(filas) {
  const por = new Map()
  for (const f of filas) {
    if (!esFilaViva(f) || !f.proveedor || !f.fecha || !pesos(f.total)) continue
    const k = `${dia(f.fecha)}|${norm(f.proveedor)}|${pesos(f.total)}`
    if (!por.has(k)) por.set(k, [])
    por.get(k).push(f)
  }
  return [...por.values()]
    .filter((g) => g.length > 1 && !esPlanDeCuotas(g))
    // Mismo comprobante repetido en dos filas es MÁS grave que dos comprobantes distintos: se marca.
    .map((g) => ({
      fecha: dia(g[0].fecha), proveedor: g[0].proveedor, total: pesos(g[0].total),
      filas: g.map((f) => f.fila), comprobantes: [...new Set(g.map((f) => f.comprobante ?? '—'))],
      mismo_comprobante: g.every((f) => String(f.comprobante ?? '').trim())
        && new Set(g.map((f) => String(f.comprobante).trim())).size === 1,
      obras: [...new Set(g.map((f) => parseObraCelda(f.obra_celda).clave))],
      importe_en_riesgo: pesos(pesos(g[0].total) * (g.length - 1)),
    }))
    .sort((a, b) => b.importe_en_riesgo - a.importe_en_riesgo)
}

/** Filas del mismo monto que vencen todas en días distintos: es un plan de pago, no una repetición. */
export function esPlanDeCuotas(grupo) {
  const vencimientos = grupo.map((f) => dia(f.fecha_prevista) ?? dia(f.fecha_caja))
  if (vencimientos.some((v) => v === null)) return false
  return new Set(vencimientos).size === grupo.length
}

/** Agrupa hallazgos por tipo con su cuenta y su importe — el resumen que abre el informe. */
export function resumen(hallazgos) {
  const m = new Map()
  for (const h of hallazgos) {
    if (!m.has(h.tipo)) m.set(h.tipo, { tipo: h.tipo, n: 0, importe: 0 })
    const g = m.get(h.tipo); g.n += 1; g.importe = pesos(g.importe + Math.abs(pesos(h.importe)))
  }
  return [...m.values()].sort((a, b) => b.importe - a.importe || b.n - a.n)
}

/** Los N hallazgos de mayor importe, de cualquier tipo. */
export const mayores = (hallazgos, n = 10) =>
  [...hallazgos].sort((a, b) => Math.abs(pesos(b.importe)) - Math.abs(pesos(a.importe))).slice(0, n)
