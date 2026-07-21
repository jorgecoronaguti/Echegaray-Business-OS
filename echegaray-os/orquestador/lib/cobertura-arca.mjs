// ¿QUÉ DE LO QUE ARCA REGISTRÓ ESTÁ CARGADO EN COMPRAS? — una sola definición.
//
// POR QUÉ EXISTE (21/07). Este cruce estaba escrito DOS VECES: en
// `proveedores-materiales-pestana.mjs` (para listar lo que falta, proveedor por proveedor) y en
// `cheques-cobertura-sheet.mjs` (para el bloque de cobertura del Cash Flow Mensual). Las dos copias
// ya habían empezado a divergir —una excluía las notas de crédito y la otra no, una hacía la
// segunda pasada por importe y la otra no— así que el mismo archivo mostraba dos verdades distintas
// sobre el mismo hecho, en dos pestañas. Es exactamente lo que la regla de oro prohíbe.
//
// ═══ LAS DOS PASADAS, Y POR QUÉ HACEN FALTA LAS DOS ═══
//
// 1. POR N° DE COMPROBANTE. Es la llave buena: identifica la factura sin ambigüedad.
// 2. POR PROVEEDOR + IMPORTE. Hace falta porque 223 filas de Compras NO tienen número cargado.
//    Sin esta pasada el OS reportó "$71.191.410 facturados sin cargar" cuando $38.411.092 nunca
//    faltaron: la factura de ALUMETAL por $18.166.381 estaba en la fila 669 con el número vacío, y
//    la de $75.415 escrita "0038-0002471", a la que le falta un dígito.
//
// Cada fila de Compras se consume UNA sola vez. Sin eso, dos facturas del mismo importe se
// emparejan las dos contra la misma fila y el faltante vuelve a mentir, ahora para el otro lado.
//
// ═══ LAS NOTAS DE CRÉDITO NO SON "CARGA QUE FALTA" ═══
//
// Una nota de crédito que no está en Compras no es un gasto que alguien olvidó anotar: es plata que
// el proveedor devolvió. Va contada aparte, restando. Ver lib/comprobante-arca.mjs y
// lib/notas-credito.mjs.

import { signo, sumar } from './comprobante-arca.mjs'

/** Cuánto puede diferir el importe para considerar que es la misma factura (neto vs total, ajustes). */
export const TOL_IMPORTE = 0.03

/**
 * NÚCLEO PURO: el cruce completo.
 *
 * @param {Array} comprobantes de comprobantes_arca (tipo_libro='R'), con tipo_comprobante,
 *   emisor_nombre, punto_venta, numero, imp_total
 * @param {Array<{fila:number, prov:string, total:number}>} filasCompras filas reales de Compras,
 *   con el proveedor YA normalizado por el llamador (cada planilla escribe el nombre a su manera)
 * @param {{norm:(s:any)=>string, clave:(c:any)=>string}} fns normalizadores inyectados, para que
 *   esta lib no imponga los suyos y el resto del OS use los que ya tiene
 */
export function cruzar(comprobantes = [], filasCompras = [], { norm = (s) => String(s ?? ''), clave = (c) => `${c.punto_venta}-${c.numero}` } = {}) {
  const enCompras = new Set(filasCompras.map((f) => f.comprobante).filter(Boolean))
  const usadas = new Set()

  const porNumero = [], porImporte = [], faltan = [], notas = [], desconocidos = []

  for (const c of comprobantes) {
    const s = signo(c.tipo_comprobante)
    if (s === null) { desconocidos.push(c); continue }
    if (s < 0) { notas.push(c); continue }

    if (enCompras.has(clave(c))) { porNumero.push(c); continue }

    const monto = Number(c.imp_total) || 0
    const p = norm(c.emisor_nombre)
    const cand = filasCompras.find((f) =>
      !usadas.has(f.fila) && f.prov === p && Math.abs(f.total - monto) <= Math.max(1, monto * TOL_IMPORTE))
    if (cand) { usadas.add(cand.fila); porImporte.push({ ...c, fila: cand.fila }); continue }

    faltan.push(c)
  }

  const t = (l) => l.reduce((s, c) => s + (Number(c.imp_total) || 0), 0)
  return {
    porNumero, porImporte, faltan, notas, desconocidos,
    totales: {
      n: comprobantes.length,
      // El total NETO: las notas de crédito restan.
      neto: sumar(comprobantes, 'imp_total').neto,
      porNumero: t(porNumero),
      porImporte: t(porImporte),
      faltan: t(faltan),
      notas: t(notas),
    },
  }
}

/**
 * NÚCLEO PURO: ¿el cruce cierra? Los cuatro grupos tienen que reconstruir el total neto.
 *
 * Sin este control, un comprobante que se cae de las cuatro listas por un bug de clasificación
 * desaparece sin que nadie lo note: cada grupo sigue pareciendo razonable por separado.
 */
export function verificar(r) {
  const t = r.totales
  const reconstruido = t.porNumero + t.porImporte + t.faltan - t.notas
  const diferencia = Math.round((t.neto - reconstruido) * 100) / 100
  const contados = r.porNumero.length + r.porImporte.length + r.faltan.length + r.notas.length + r.desconocidos.length
  return {
    ok: Math.abs(diferencia) < 1 && contados === t.n,
    diferencia,
    contados,
    esperados: t.n,
  }
}
