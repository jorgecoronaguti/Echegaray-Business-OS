// LA BARRA DE CONTEXTO DE OBRA — grafito con el filo amarillo de la marca.
//
// Es el cromo que el contrato visual pone arriba de toda pantalla de obra (§0.2): migaja, nombre
// de la obra, y a la derecha los KPI que esa pantalla contesta. El amarillo aparece SÓLO en el
// filo de 4px y en el KPI proyectado — nunca pintando estado.
//
// Vive en `features/obras` y no en el design system a propósito: el workspace de la obra se está
// rehaciendo en otro frente y su versión definitiva va a ser la que suba a `shared/components/ds`.
// Poner ésta ahí ahora sería fijar como sistema algo que todavía se está decidiendo.

import Link from 'next/link'
import type { ReactNode } from 'react'

export interface KpiObra {
  rotulo: string
  valor: ReactNode
  /** El KPI proyectado va en amarillo, y es el único. `null` se dibuja con su palabra, no con 0. */
  proyectado?: boolean
  falta?: string
}

export function BarraContextoObra({
  volverA, volverLabel, titulo, subtitulo, kpis = [],
}: {
  volverA: string
  volverLabel: string
  titulo: string
  subtitulo?: string
  kpis?: KpiObra[]
}) {
  return (
    <div
      className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-l-4 border-marca bg-accent px-4 py-3"
      data-testid="barra-obra"
    >
      <div className="min-w-0">
        <Link href={volverA} className="text-[11px] text-faint hover:text-marca">← {volverLabel}</Link>
        <h1 className="truncate text-[20px] font-semibold leading-tight text-white">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-[11.5px] text-[color:var(--os-line-strong)]">{subtitulo}</p>}
      </div>
      {kpis.length > 0 && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2" data-testid="kpis-obra">
          {kpis.map((k) => (
            <div key={k.rotulo}>
              <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{k.rotulo}</div>
              <div
                className={`text-[19px] font-semibold leading-tight tnum ${
                  k.valor == null ? 'text-faint' : (k.proyectado ? 'text-marca' : 'text-white')
                }`}
              >
                {k.valor ?? (k.falta ?? 'sin dato')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
