// LA NOTA «QUÉ HACER» DE CADA FILA DE «A QUIÉN LE DEBO» — la misma que el dueño ve en Proveedores del Sheet.
//
// ═══ LA NOTA ES DEL NOMBRE DE COMPRAS, NO DE LA FICHA ═══
//
// En el Sheet la nota cuelga del texto que la dinámica escribe en la A — el proveedor tal como está
// en Compras («Hormiserv») —, y `public.proveedor_notas` la guarda por ese texto normalizado
// (`claveProv`). La tabla de la app agrupa por ficha del maestro, y una ficha puede juntar dos grafías.
// Se toma la nota de la grafía que MÁS se debe (es la fila que el dueño ve arriba en el Sheet), y si
// ésa no tiene, la de otra grafía de la misma ficha. Editar escribe en la grafía que se muestra.
//
// ═══ LO QUE ESPERA AL SHEET SE DICE ═══
//
// Pedir un cambio no cambia la nota (gana el Sheet: ver 20260917T1410). Mientras el worker no la
// escribió, la fila muestra la nota vigente y el pedido aparte; si el Sheet la contradijo, el rechazo
// con lo que dice el Sheet. Núcleo puro: se prueba sin base.

import { claveProv } from '../../../../orquestador/lib/proveedor-notas.mjs'
import type { CompraConSaldo, DeudaDeProveedor, LineaDeuda } from './deudaProveedores.ts'

export interface NotaGuardada { clave: string; nota: string; actualizado_en: string | null }
export interface PedidoDeNota {
  clave: string; nota_nueva: string; estado: string; motivo: string | null; creado_at: string
  /** app = pedido desde la pantalla · sheet = borrados retenidos que la sonda o el pipeline dejaron constancia. */
  origen?: 'app' | 'sheet' | null
}

export interface NotaDeProveedor {
  /** La grafía de Compras a la que va la nota. */
  proveedorSheet: string
  claveNota: string
  /** Lo vigente en la base (= lo que muestra el Sheet). '' = sin nota. */
  nota: string
  /** Lo pedido desde la app que todavía no llegó al Sheet. */
  pendiente: string | null
  /** El conflicto con el Sheet más nuevo —pedido rechazado o borrado retenido—, si es posterior a la nota. */
  rechazo: string | null
}

/** Grafías de Compras por fila de la tabla, de la que más se debe a la que menos. */
function grafiasPorClave(compras: CompraConSaldo[], lineas: LineaDeuda[]): Map<string, string[]> {
  const textoDeFila = new Map(compras.map((c) => [c.fila, String(c.proveedor ?? '').trim()]))
  const saldos = new Map<string, Map<string, number>>()
  for (const l of lineas) {
    const texto = textoDeFila.get(l.fila)
    if (!texto) continue
    const m = saldos.get(l.clave) ?? new Map<string, number>()
    m.set(texto, (m.get(texto) ?? 0) + l.saldo)
    saldos.set(l.clave, m)
  }
  return new Map([...saldos].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1]).map(([t]) => t)]))
}

/** Un pedido de la app «no se guardó»; una constancia del Sheet no es un pedido: se dice lo que pasó allá. */
function textoDelRechazo(p: PedidoDeNota): string {
  const motivo = p.motivo ?? 'no se pudo escribir en el Sheet'
  return p.origen === 'sheet' ? motivo : `No se guardó: ${motivo}`
}

export function notasDeLaDeuda({ filas, lineas, compras, notas, pedidos }: {
  filas: DeudaDeProveedor[]; lineas: LineaDeuda[]; compras: CompraConSaldo[]
  notas: NotaGuardada[]; pedidos: PedidoDeNota[]
}): Map<string, NotaDeProveedor> {
  const porClave = new Map(notas.map((n) => [n.clave, n]))
  // El pedido MÁS NUEVO de cada proveedor: `pedidos` llega ordenado por fecha descendente.
  const ultimo = new Map<string, PedidoDeNota>()
  for (const p of pedidos) if (!ultimo.has(p.clave)) ultimo.set(p.clave, p)
  const grafias = grafiasPorClave(compras, lineas)
  const salida = new Map<string, NotaDeProveedor>()
  for (const f of filas) {
    const textos = grafias.get(f.clave) ?? []
    if (!textos.length) continue
    const conNota = textos.find((t) => porClave.get(claveProv(t))?.nota)
    const proveedorSheet = conNota ?? textos[0]
    const claveNota = claveProv(proveedorSheet)
    const guardada = porClave.get(claveNota)
    const p = ultimo.get(claveNota)
    const vivo = p && (p.estado === 'pendiente' || p.estado === 'procesando')
    const posterior = p && (!guardada?.actualizado_en || p.creado_at > guardada.actualizado_en)
    salida.set(f.clave, {
      proveedorSheet, claveNota, nota: guardada?.nota ?? '',
      pendiente: vivo ? p.nota_nueva : null,
      rechazo: p && posterior && (p.estado === 'rechazado' || p.estado === 'error') ? textoDelRechazo(p) : null,
    })
  }
  return salida
}
