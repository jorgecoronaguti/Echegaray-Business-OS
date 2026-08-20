// LAS PIEZAS DE TABLA DEL MÓDULO DE OBRAS — hoy son el design system, con otro nombre.
//
// ═══ QUÉ CAMBIÓ (20/08/2026, Design Handoff V2) ═══
//
// Dibujaban su propia tabla: caja con borde `line` y radio, encabezado con `tracking-wide` y filas
// con `border-line/60`. El handoff aprobado dice lo contrario —*«las tablas no van en caja:
// hairline superior + divisores de fila»*— y esa tabla ya existe en
// `@/shared/components/ds`. Dos definiciones de la misma tabla es cómo se llega a que dos
// pantallas del mismo módulo tengan densidades distintas sin que nadie lo decida.
//
// ═══ POR QUÉ EL ARCHIVO SIGUE EXISTIENDO ═══
//
// `VistaLista` —la lista de la cartera— todavía lo importa, y no es de este bloque de trabajo. Es
// una CAPA DE COMPATIBILIDAD, no un componente: no agrega ni una decisión visual propia, sólo
// traduce la firma vieja (`cols`, `Fila`, `C`) a la del sistema. Cuando `VistaLista` importe el DS
// directo, este archivo se borra entero.
//
// NO AGREGAR NADA ACÁ. Lo que le falte a una tabla del OS le falta al design system.

import type { ReactNode } from 'react'
import { Td, Th, THead, Tr, Tabla as TablaDS, Vacio as VacioDS } from '@/shared/components/ds'

export function Vacio({ children }: { children: ReactNode }) {
  return <VacioDS>{children}</VacioDS>
}

export function Tabla({
  testid, cols, children,
}: {
  testid: string
  cols: { k: string; num?: boolean }[]
  children: ReactNode
}) {
  return (
    <TablaDS testid={testid}>
      <THead>
        {cols.map((c) => <Th key={c.k} num={c.num}>{c.k}</Th>)}
      </THead>
      <tbody>{children}</tbody>
    </TablaDS>
  )
}

/**
 * Una fila. `obra` viaja al DOM aunque no se dibuje: es lo que permite CONTAR desde afuera cuántas
 * filas de una obra dibujó cada lista, sin depender de cómo se ven. Los tests lo usan como clave.
 *
 * Va por spread porque `Tr` tipa sus props y los atributos `data-*` no están declarados ahí: el
 * spread de JSX no hace control de propiedades de más, y el atributo llega igual al `<tr>`.
 */
export function Fila({ children, obra }: { children: ReactNode; obra?: string | null }) {
  return <Tr {...{ 'data-obra': obra ?? undefined }}>{children}</Tr>
}

export function C({ children, num, fuerte }: { children: ReactNode; num?: boolean; fuerte?: boolean }) {
  return <Td num={num} fuerte={fuerte}>{children}</Td>
}
