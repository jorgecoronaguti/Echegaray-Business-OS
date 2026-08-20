import type { ReactNode } from 'react'
import { Volver } from './Boton'
import { TituloPantalla, Nulo } from './texto'

// EL ENCABEZADO DE UNA ENTIDAD — `design/system/COMPONENTS.md` §Entity header.
//
// Tres renglones y ni uno más: de dónde vine · quién es esta entidad · sus cuatro o cinco campos
// de identidad. A la derecha, su estado o su ciclo de vida.
//
// «Cada campo dice su ausencia por su nombre, nunca un guión suelto». Un `—` obliga a adivinar si
// el dato no existe, no se cargó o no aplica; «sin fecha» contesta las tres.

export type CampoHeader = { rotulo: string; valor: ReactNode | null; falta?: string }

export function EntityHeader({
  volverA,
  volverLabel,
  titulo,
  campos = [],
  derecha,
  acciones,
}: {
  volverA?: string
  volverLabel?: ReactNode
  titulo: ReactNode
  campos?: CampoHeader[]
  /** Estado o ciclo de vida. Va a la derecha del título, no debajo. */
  derecha?: ReactNode
  acciones?: ReactNode
}) {
  return (
    <header className="pb-4" data-testid="entity-header">
      {volverA && <div className="mb-2"><Volver href={volverA}>{volverLabel ?? 'Volver'}</Volver></div>}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <TituloPantalla>{titulo}</TituloPantalla>
          {campos.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]" data-testid="campos-header">
              {campos.map((c) => (
                <span key={c.rotulo} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-faint">{c.rotulo}:</span>
                  {c.valor === null || c.valor === undefined || c.valor === '' ? (
                    <Nulo>{c.falta ?? 'sin cargar'}</Nulo>
                  ) : (
                    <span className="text-ink-soft">{c.valor}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        {(derecha || acciones) && (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-3">
            {derecha}
            {acciones}
          </div>
        )}
      </div>
    </header>
  )
}
