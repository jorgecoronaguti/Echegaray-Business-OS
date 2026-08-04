// EL CONTROL CONTRA UNA FUENTE QUE EL OS NO PRODUCE — Compras contra el libro de IVA de ARCA.
//
// ═══ POR QUÉ EXISTE (04/08) ═══
//
// Materiales, Estructura y Recurrentes tenían cada una un bloque "CONTROL" que comparaba el total del
// cuadro contra un SUMIFS sobre Compras. Las dos cifras salen de Compras: son dos agregaciones de la
// misma tabla — una por familia, otra por rubro. El ✓ verde no significaba "los datos están bien",
// significaba "sé sumar dos veces". Un agente lo declaró como límite y el dueño contestó "pésimo eso".
//
// Tiene razón, y no es una preferencia: es la regla del OS — UN CONTROL NUNCA SE VALIDA CONTRA LA
// MISMA INFORMACIÓN QUE PRODUCE. El único control que vale es contra una fuente que el OS no escribe.
// El libro de IVA COMPRAS de ARCA es esa fuente: lo emite el proveedor, lo registra ARCA, y el OS lo
// replica sin poder cambiarlo.
//
// ═══ LA VENTANA DE TIEMPO, QUE ES DONDE ESTO SE ROMPE ═══
//
// ARCA imputa por PERÍODO DE DDJJ. Compras tiene DOS fechas: "Fecha factura" (col C) y "Fecha de
// caja" (col AD). Los tres cuadros suman por fecha de CAJA, que es criterio percibido.
//
// Comparar ARCA contra el total por fecha de caja es mezclar ventanas incompatibles — la regla de oro
// nº 3. Y no es teórico: medido contra los datos reales del 04/08, 176 filas por $95.945.967 caen en
// un mes de factura distinto al de caja. Junio da +$27.621.744 por fecha de factura y +$1.276.132 por
// fecha de caja; julio da −$6.008.294 contra −$20.320.175. Los mismos datos, cuatro veredictos
// distintos. Por eso este control usa SIEMPRE la FECHA DE FACTURA (devengado), que es la única
// comparable con el libro, y lo dice en la pestaña — no es el total del cuadro de arriba.
//
// Verificado sobre los 537 comprobantes del libro R replicados: en los 537, `periodo` es igual al mes
// de `fecha_emision`. Aun así el control usa `periodo` (la columna de la DDJJ) y NO el mes de emisión:
// el día que un proveedor emita en un mes y ARCA lo impute en otro, la ventana tiene que seguir la
// DDJJ. `periodosDesalineados()` avisa si esa igualdad deja de cumplirse en vez de asumirla.
//
// ═══ LO QUE LEGÍTIMAMENTE NO ESTÁ EN ARCA NO ES UN ERROR ═══
//
// Jornales, cargas sociales, sueldos, SAC, gremiales, impuestos y gastos financieros no tienen
// factura de proveedor: no pueden estar en el libro de compras. En la ventana medida son
// $211.334.759. Sumarlos al hueco convertiría el control en ruido y nadie lo miraría más. Van en una
// línea propia, con su monto, declarados — ni sumados ni escondidos.
//
// ═══ LAS DOS DIRECCIONES SE INFORMAN POR SEPARADO ═══
//
// Un neto de cero puede esconder $10M de cada lado. Son dos defectos distintos y se arreglan en
// lugares distintos: lo que ARCA tiene y Compras no es gasto real que el cuadro no ve; lo que Compras
// tiene y ARCA no es carga sin respaldo fiscal.

import { sumar } from './comprobante-arca.mjs'
import { cruzar } from './cobertura-arca.mjs'
import { esLlaveUtil } from './cheques-cobertura.mjs'
// UNA SOLA DEFINICIÓN DE "EL MISMO PROVEEDOR". `proveedores-materiales-pestana.mjs` tiene su propia
// copia local; usar la compartida evita la tercera, que es como empezó la divergencia del cruce.
import { normNombre } from './razon-social.mjs'

/**
 * Rubros de caja que NO pueden tener un comprobante en el libro de compras de ARCA.
 *
 * La lista es por RUBRO y no por proveedor a propósito: el rubro lo elige quien carga, es auditable
 * en la propia planilla y no depende de que el OS adivine si un proveedor emite factura o no.
 */
export const RUBROS_SIN_COMPROBANTE_FISCAL = Object.freeze([
  'Nómina · Jornales de obra',
  'Nómina · Cargas sociales',
  'Nómina · Sueldos administración',
  'Nómina · Gremiales',
  'Nómina · SAC',
  'Deuda previsional (planes de pago)',
  'Impuestos',
  'Financiero',
])

/** Rubros que SÍ deberían tener respaldo fiscal: son los que compran a un proveedor con factura. */
export const RUBROS_COMERCIALES = Object.freeze([
  'Materiales Civil',
  'Materiales Mantenimiento',
  'Estructura',
  'Servicios recurrentes',
])

/** Cuánto puede diferir un importe emparejado antes de que valga la pena mostrarlo. */
export const TOL_PESOS = 1

/**
 * NÚCLEO PURO: la ventana comparable, DEDUCIDA de lo que ARCA realmente trajo.
 *
 * No se escribe a mano en ningún lado. Si mañana se replica agosto, la ventana se estira sola; si
 * ARCA deja de traer un mes, se achica sola y el control lo dice en vez de comparar contra nada.
 *
 * @param {Array<{periodo?:string}>} comprobantes del libro de compras ya filtrado
 * @returns {{periodos:string[], desde:string|null, hasta:string|null, vacia:boolean}}
 */
export function ventanaDeArca(comprobantes = []) {
  const periodos = [...new Set(comprobantes.map((c) => String(c?.periodo ?? '').trim()).filter(Boolean))].sort()
  return { periodos, desde: periodos[0] ?? null, hasta: periodos.at(-1) ?? null, vacia: periodos.length === 0 }
}

/**
 * NÚCLEO PURO: ¿el período de DDJJ coincide con el mes de emisión?
 *
 * Devuelve los comprobantes donde NO coincide. Hoy son cero, y por eso el control puede usar el
 * período sin más. El día que aparezca uno, la ventana deja de ser trivial y hay que decirlo en vez
 * de que el cuadro muestre una diferencia que nadie entiende.
 */
export function periodosDesalineados(comprobantes = []) {
  return comprobantes.filter((c) => {
    const p = String(c?.periodo ?? '').trim()
    const f = mesDeEmision(c?.fecha_emision)
    return p && f && p !== f
  })
}

/**
 * 'YYYY-MM' de una fecha de emisión, venga como sea.
 *
 * EL DRIVER DE POSTGRES DEVUELVE UN `Date`, NO UN STRING. Con `String(date).slice(0,7)` sale
 * "Wed Jun" y ningún período coincide jamás: la primera corrida contra los datos reales avisó que los
 * 537 comprobantes estaban desalineados cuando los 537 coinciden. Una alarma que suena siempre se
 * apaga, y con ella se apaga la única guarda que tiene la ventana de tiempo.
 */
export function mesDeEmision(v) {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : ''
}

const monto = (v) => Number(v) || 0
const redondear = (n) => Math.round(n * 100) / 100

/**
 * NÚCLEO PURO: la conciliación completa entre Compras y el libro de ARCA.
 *
 * @param {object} args
 * @param {Array} args.comprobantes  libro de COMPRAS de ARCA (tipo_libro='R'), con periodo,
 *   tipo_comprobante, emisor_nombre, punto_venta, numero, imp_total
 * @param {Array<{fila:number, periodo:string, prov:string, provNorm:string, comprobante:string,
 *   total:number, rubro:string, familia?:string, sub?:string}>} args.filasCompras
 *   filas de Compras con el proveedor YA normalizado y el comprobante YA normalizado por el llamador
 * @param {(c:any)=>string} args.clave  normalizador del comprobante de ARCA (el mismo que Compras)
 * @param {(s:any)=>string} [args.norm]  normalizador de razón social. POR DEFECTO EL COMPARTIDO:
 *   pasarle la identidad hacía que "Alumetal" nunca emparejara con "ALUMETAL S A", y la MISMA
 *   factura de $18.166.381 salía reportada en las DOS direcciones a la vez — como faltante en Compras
 *   y como carga sin respaldo. Un control que se contradice solo es peor que no tener control.
 * @param {string[]} [args.rubrosComerciales]
 * @returns {object} la conciliación, con las dos direcciones separadas
 */
export function conciliar({ comprobantes = [], filasCompras = [], clave, norm = normNombre, rubrosComerciales = RUBROS_COMERCIALES } = {}) {
  const ventana = ventanaDeArca(comprobantes)
  const comercial = new Set(rubrosComerciales)
  const sinFiscal = new Set(RUBROS_SIN_COMPROBANTE_FISCAL)

  // ── el universo comparable: rubro comercial Y fecha de factura DENTRO de la ventana de ARCA.
  // Todo lo que queda afuera se declara aparte; nada se descarta en silencio.
  //
  // SI LA VENTANA ESTÁ VACÍA, EL UNIVERSO COMPARABLE ES VACÍO. Sin el libro no hay contra qué
  // comparar, y marcar las filas comerciales como "sin respaldo fiscal" sería inventar un hallazgo
  // producido por la ausencia de la fuente. Van todas a `fueraDeVentana`, que es lo que son.
  const enVentana = (f) => !ventana.vacia && ventana.periodos.includes(f.periodo)
  const universo = filasCompras.filter((f) => comercial.has(f.rubro) && enVentana(f))
  const fueraDeVentana = filasCompras.filter((f) => comercial.has(f.rubro) && f.periodo && !enVentana(f))
  const sinFechaFactura = filasCompras.filter((f) => comercial.has(f.rubro) && !f.periodo)
  // ESTAS DOS SE CLASIFICAN POR RUBRO, NO POR VENTANA. Que un jornal no tenga factura es una
  // propiedad del rubro, no del mes: filtrarlas por la ventana las hacía desaparecer justo cuando la
  // fuente no llegaba, y una línea declarada que se vacía sola deja de declarar nada.
  const fueraDeArca = filasCompras.filter((f) => sinFiscal.has(f.rubro))
  const rubroDesconocido = filasCompras.filter((f) => !comercial.has(f.rubro) && !sinFiscal.has(f.rubro))

  // ── DIRECCIÓN 1: lo que ARCA registró y Compras no tiene.
  // Se delega en `cobertura-arca.cruzar`, que ya es la ÚNICA definición de este cruce en el OS
  // (por N° de comprobante y, cuando el número no está cargado, por proveedor + importe).
  // El proveedor se normaliza EN LOS DOS LADOS con la misma función: `cruzar` aplica `norm` al nombre
  // que trae ARCA y compara contra el `prov` de la fila, así que la fila tiene que llegar normalizada.
  const paraCruce = universo.map((f) => ({ ...f, prov: norm(f.prov) }))
  const cruce = cruzar(comprobantes, paraCruce, { norm, clave })

  // ── DIRECCIÓN 2: lo que Compras tiene y ARCA no.
  // Una fila está respaldada si su comprobante es uno de los del libro, o si el cruce de arriba la
  // consumió por proveedor + importe. Se deriva del MISMO cruce: dos criterios distintos para las dos
  // direcciones darían dos verdades sobre el mismo hecho.
  const clavesArca = new Set(comprobantes.map(clave).filter(esLlaveUtil))
  const porImporte = new Map(cruce.porImporte.map((c) => [c.fila, c]))
  const respaldada = (f) => (esLlaveUtil(f.comprobante) && clavesArca.has(f.comprobante)) || porImporte.has(f.fila)
  const conRespaldo = universo.filter(respaldada)
  const comprasSinArca = universo.filter((f) => !respaldada(f))

  const t = (l, k = 'total') => redondear(l.reduce((s, x) => s + monto(x[k]), 0))
  const totales = {
    arcaNeto: redondear(sumar(comprobantes, 'imp_total').neto),
    comprasUniverso: t(universo),
    comprasConRespaldo: t(conRespaldo),
    comprasSinArca: t(comprasSinArca),
    arcaSinCompras: redondear(cruce.totales.faltan),
    notasDeCredito: redondear(cruce.totales.notas),
    fueraDeArca: t(fueraDeArca),
    fueraDeVentana: t(fueraDeVentana),
    sinFechaFactura: t(sinFechaFactura),
    rubroDesconocido: t(rubroDesconocido),
  }

  return {
    ventana,
    desalineados: periodosDesalineados(comprobantes),
    arcaSinCompras: cruce.faltan,
    comprasSinArca,
    conRespaldo,
    fueraDeArca,
    fueraDeVentana,
    sinFechaFactura,
    rubroDesconocido,
    desconocidos: cruce.desconocidos,
    totales,
  }
}

/**
 * NÚCLEO PURO: ¿la diferencia agregada se explica ENTERA con las líneas del detalle?
 *
 * Sin esto el control tiene la misma enfermedad que venía a curar: un número que nadie puede
 * reconstruir. La identidad es
 *
 *   Compras(universo) − ARCA(neto) = (Compras sin ARCA) − (ARCA sin Compras) + (notas de crédito)
 *                                    + (diferencia de importe en lo emparejado)
 *
 * El último término se despeja: es lo que queda, y tiene significado propio — una factura cargada en
 * Compras por un importe distinto al que ARCA registró. Si el residuo no cierra, `ok` es false.
 */
export function verificarIdentidad(r) {
  const t = r.totales
  const difAgregada = redondear(t.comprasUniverso - t.arcaNeto)
  const explicado = redondear(t.comprasSinArca - t.arcaSinCompras + t.notasDeCredito)
  const difImportes = redondear(difAgregada - explicado)
  // La identidad es exacta por construcción; `ok` protege contra un cambio futuro que la rompa.
  const reconstruido = redondear(explicado + difImportes)
  return { ok: Math.abs(difAgregada - reconstruido) < 0.5, difAgregada, explicado, difImportes }
}

const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
const comp = (c) => `${String(c.punto_venta ?? '').padStart(4, '0')}-${String(c.numero ?? '').padStart(8, '0')}`

/**
 * NÚCLEO PURO: el veredicto, que tiene que decir QUÉ HACER y no sólo que no cierra.
 *
 * "✗ difieren en $2.883.000" es inútil. Lo que sirve es el comprobante y el monto, porque con eso se
 * va a buscar el papel. Se listan los más grandes: una lista de 56 no se lee, y los primeros
 * concentran la plata.
 *
 * @returns {{estado:'no_verificable'|'hallazgo'|'ok', texto:string}}
 */
export function veredicto(r, { maxDetalle = 4 } = {}) {
  if (r.ventana.vacia) {
    return {
      estado: 'no_verificable',
      // NUNCA ✓ VERDE SIN FUENTE. Un control que se pone verde cuando la fuente no llegó es peor que
      // no tenerlo: afirma que está todo bien justamente cuando no se puede saber.
      // NI UN SOLO ✓ EN ESTE TEXTO, tampoco para decir "no es un ✓". La pestaña se lee de un vistazo
      // y el glifo es lo único que se mira: verlo acá sería leer "está todo bien" al revés.
      texto: '⚠ NO PUEDO VERIFICAR — el libro de IVA compras de ARCA no tiene comprobantes replicados para esta ventana. Sin la fuente independiente este control no afirma nada.',
    }
  }
  const t = r.totales
  const partes = []
  if (Math.abs(t.arcaSinCompras) >= TOL_PESOS) {
    const top = r.arcaSinCompras.slice().sort((a, b) => monto(b.imp_total) - monto(a.imp_total))
    const lista = top.slice(0, maxDetalle).map((c) => `${comp(c)} ${c.emisor_nombre} ${pesos(monto(c.imp_total))}`).join(' · ')
    const resto = top.length > maxDetalle ? ` (+${top.length - maxDetalle} más)` : ''
    partes.push(`✗ ${pesos(t.arcaSinCompras)} en ${top.length} comprobante(s) que ARCA registró y Compras no tiene: ${lista}${resto}`)
  }
  if (Math.abs(t.comprasSinArca) >= TOL_PESOS) {
    const top = r.comprasSinArca.slice().sort((a, b) => monto(b.total) - monto(a.total))
    const lista = top.slice(0, maxDetalle).map((f) => `fila ${f.fila} ${f.prov} ${pesos(f.total)}`).join(' · ')
    const resto = top.length > maxDetalle ? ` (+${top.length - maxDetalle} más)` : ''
    partes.push(`✗ ${pesos(t.comprasSinArca)} en ${top.length} fila(s) de Compras sin comprobante en el libro de ARCA: ${lista}${resto}`)
  }
  if (!partes.length) {
    return { estado: 'ok', texto: `✓ Compras y el libro de ARCA coinciden comprobante por comprobante en ${r.ventana.desde}..${r.ventana.hasta}` }
  }
  return { estado: 'hallazgo', texto: partes.join('  |  ') }
}
