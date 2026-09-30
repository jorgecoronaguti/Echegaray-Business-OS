// LOS OCHO CHIPS DE LA CARTERA DE PROVEEDORES, y de dónde sale el número de cada uno.
//
// Pedido del dueño (30/09/2026): poder acotar una cartera de cien filas de un clic. Esto no dibuja
// nada: arma las opciones que `FiltrosSuaves` pinta, para poder probar cada número y cada destino
// sin React ni base.
//
// EL NÚMERO DE CADA CHIP es lo que se ve al activarlo SOLO sobre la cartera del corte que se está
// mirando (`todos`: activos o archivados, sin los otros chips). «Sin CUIT» es la excepción heredada:
// cuenta fija sobre los activos porque es trabajo pendiente de la empresa y tiene que ser estable.
//
// UN DATO QUE NO SE PUDO LEER NO DIBUJA EL CHIP con un 0 ni lo ofrece: recortaría por un conjunto
// vacío y mostraría una cartera sin nadie, o afirmaría «no hay ninguno» por un error de red.

import type { OpcionFiltro } from '@/shared/components/v2/FiltrosSuaves'
import type { Proveedor } from '../types/index.ts'
import { coincideDeuda, type DeudaProveedor } from './proveedoresService.ts'
import { alternarChip, contarChipUso, type ChipUso, type DatosUso } from './usoProveedores.ts'

/** Lo que un clic en un chip cambia en la URL. `undefined` explícito = sacar el parámetro. */
export interface CambiosChip {
  f?: string | undefined; tipo?: string | undefined; cuit?: string | undefined
  deuda?: string | undefined; activo?: string | undefined
}

export interface EntradaChips {
  /** La cartera del corte activo/archivados que se está mirando. */
  todos: Proveedor[]
  datos: DatosUso
  chips: ChipUso[]
  soloSub: boolean
  soloSinCuit: boolean
  conDeuda: boolean
  archivados: boolean
  subs: Set<string> | null
  deudas: Map<string, DeudaProveedor> | null
  /** De la base, sobre los activos. `null` = no se pudo contar. */
  nSinCuit: number | null
  nArchivados: number | null
  /** La URL con esos cambios, conservando el buscador y reiniciando el panel abierto y la página. */
  href: (c: CambiosChip) => string
}

const ETIQUETA: Record<ChipUso, string> = {
  usados: 'Más usados', mes: 'Compré este mes', '90d': 'Últimos 90 días', inactivo: 'Sin movimiento > 6 meses',
}

export function opcionesChips(e: EntradaChips): OpcionFiltro[] {
  const usoLeido = e.datos.uso !== null
  const deLaCompra = (c: ChipUso): OpcionFiltro | null => {
    // «Sin movimiento» lee la última compra histórica de la vista; los otros tres, las filas de 12 m.
    if (c === 'inactivo' ? e.datos.comprado === null : !usoLeido) return null
    return {
      clave: c, etiqueta: ETIQUETA[c], activo: e.chips.includes(c),
      href: e.href({ f: alternarChip(e.chips, c) }), cuenta: contarChipUso(e.todos, c, e.datos),
    }
  }
  const saldo: OpcionFiltro | null = e.deudas
    ? {
        clave: 'saldo', etiqueta: 'Con saldo pendiente', activo: e.conDeuda,
        href: e.href({ deuda: e.conDeuda ? undefined : 'con' }),
        cuenta: e.todos.filter((p) => coincideDeuda(p, e.deudas ?? new Map(), 'con')).length,
      }
    : null
  const sub: OpcionFiltro | null = e.subs
    ? {
        clave: 'sub', etiqueta: 'Subcontratistas', activo: e.soloSub,
        href: e.href({ tipo: e.soloSub ? undefined : 'sub' }),
        cuenta: e.todos.filter((p) => e.subs?.has(p.id)).length,
      }
    : null
  const opciones: Array<OpcionFiltro | null> = [
    deLaCompra('usados'), saldo, deLaCompra('mes'), deLaCompra('90d'), sub,
    {
      clave: 'sin-cuit', etiqueta: 'Sin CUIT', activo: e.soloSinCuit,
      href: e.href({ cuit: e.soloSinCuit ? undefined : 'falta' }), cuenta: e.nSinCuit,
    },
    deLaCompra('inactivo'),
    {
      clave: 'archivados', etiqueta: 'Archivados', activo: e.archivados,
      href: e.href({ activo: e.archivados ? undefined : 'archivados' }), cuenta: e.nArchivados,
    },
  ]
  return opciones.filter((o): o is OpcionFiltro => o !== null)
}
