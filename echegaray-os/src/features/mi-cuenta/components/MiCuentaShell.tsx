// EL MARCO DE MI CUENTA — el título, la línea de identidad y las siete solapas.
//
// Las solapas van DEBAJO del encabezado y no en un `layout.tsx`, porque el encabezado cambia por
// pantalla: en Perfil dice «Mi cuenta» y en Mis horas dice «Mis horas» con la categoría y la obra al
// lado. Un layout sólo puede poner las solapas ANTES o DESPUÉS de todo el contenido, nunca en el
// medio — y en el medio es donde el handoff las pone.
//
// LA LÍNEA DE IDENTIDAD (categoría · cuadrilla · obra actual · alta) sale del legajo y aparece sólo
// cuando hay legajo. Cada campo dice su ausencia POR SU NOMBRE: un guión suelto no distingue «no
// tiene cuadrilla» de «nadie la cargó».

import Link from 'next/link'
import type { ReactNode } from 'react'
import { VERSIONES_DE_CUENTA, type ParteDeCuenta } from '@/shared/utils/cuentaPropia'
import { Num, Volver } from '@/shared/components/ds'
import { PageShell } from '@/shared/components/ui'
import { NavMiCuenta } from './NavMiCuenta'

export interface CampoIdentidad {
  rotulo: string
  valor: string | null
  /** Cómo se llama la ausencia de ESTE campo. «sin cuadrilla» y «sin obra asignada» no son lo mismo. */
  falta: string
  /** Fechas y números van en mono tabular: se comparan con la vista. */
  num?: boolean
}

export function MiCuentaShell({
  titulo,
  descripcion,
  campos,
  volver = true,
  parte,
  children,
}: {
  titulo: string
  descripcion?: ReactNode
  campos?: CampoIdentidad[]
  /** La raíz no vuelve a sí misma. */
  volver?: boolean
  /** Qué parte de la cuenta es (legajo, horas, documentos): con eso se ofrece la MISMA pantalla en
   *  su versión del teléfono, sólo por debajo de `lg`. Ver `shared/utils/cuentaPropia.ts`. */
  parte?: ParteDeCuenta
  children: ReactNode
}) {
  const telefono = parte ? VERSIONES_DE_CUENTA[parte].telefono : null
  return (
    <PageShell
      eyebrow={volver ? <Volver href="/mi-cuenta">Mi cuenta</Volver> : undefined}
      title={titulo}
      subtitle={descripcion}
    >
      {campos && campos.length > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]" data-testid="identidad">
          {campos.map((c) => (
            <span key={c.rotulo}>
              <span className="text-faint">{c.rotulo}: </span>
              {c.valor == null || c.valor === '' ? (
                <span className="text-faint">{c.falta}</span>
              ) : c.num ? (
                <Num>{c.valor}</Num>
              ) : (
                <span className="text-ink-soft">{c.valor}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <NavMiCuenta />
      {/* LAS DOS CARAS SE ENLAZAN (dueño, 23/09/2026 · duda 8): desde el teléfono, esta misma pantalla
          se mira mejor en su versión de barra inferior. En escritorio el enlace no se dibuja. */}
      {telefono && (
        <Link href={telefono} prefetch={false} data-testid="ir-version-telefono" className="mt-3 inline-flex min-h-[44px] items-center text-[12.5px] text-muted underline lg:hidden">
          Ver en la versión del teléfono
        </Link>
      )}
      <div className="mt-7">{children}</div>
    </PageShell>
  )
}

/** El renglón `rótulo · valor` de las fichas de sólo lectura de Mi cuenta. Rótulo a la izquierda y
 *  valor a la derecha, como en el handoff: acá la columna es ancha y los dos entran en la línea. */
export function Dato({
  rotulo,
  children,
  ancho = 'w-[190px]',
}: {
  rotulo: string
  children: ReactNode
  ancho?: string
}) {
  return (
    <div className="flex items-baseline gap-4 border-b border-surface-sunken py-2.5">
      <span className={`${ancho} shrink-0 text-[12.5px] text-muted`}>{rotulo}</span>
      <span className="min-w-0 flex-1 text-[13px] text-ink">{children}</span>
    </div>
  )
}
