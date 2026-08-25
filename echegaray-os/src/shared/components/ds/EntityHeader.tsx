import Link from 'next/link'
import type { ReactNode } from 'react'
import { TituloPantalla, Nulo } from './texto'

// EL ENCABEZADO DE UNA ENTIDAD — los mockups del zip ganan a `COMPONENTS.md`, orden del dueño 24/08.
//
// Tres renglones y ni uno más: de dónde vine · quién es esta entidad · sus cuatro o cinco campos
// de identidad. A la derecha, su estado o su ciclo de vida.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN ANTERIOR (medido de `02 · Obra Resumen` y `03 · Obra Tareas`) ═══
//
//   1 · MIGA DE PAN EN VEZ DE «← Obras». El zip escribe «Obras / Escuela San Juan» en 11,5px
//       `#91918B`, con el último tramo en `#3A3A38`. La flecha decía A DÓNDE VUELVO; la miga dice
//       DÓNDE ESTOY, que es la pregunta que se hace alguien que llegó por un link o por la URL. El
//       destino es el mismo `volverA` de antes: no se perdió ninguna vuelta.
//
//   2 · EL ESTADO VA PEGADO AL TÍTULO, no en una columna a la derecha. El zip pone la pastilla «En
//       ejecución» a 12px del título, en el mismo renglón. Es `derecha`, que ya existía — lo que
//       cambió es dónde aterriza.
//
//   3 · LOS CAMPOS SE SEPARAN CON «·», no con espacio. Antes eran cinco islas separadas por 20px:
//       a igual distancia entre sí y del borde, no se leían como una línea sino como cinco cosas
//       sueltas. El interpunto de `#D7D5CF` los cose en una sola frase de identidad.
//
//   4 · EL RÓTULO ES OPCIONAL. El zip escribe «Etapa: Estructura» con rótulo y «Orica» sin él: el
//       cliente no necesita que le digan que es el cliente. `rotulo: ''` omite la etiqueta.
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
  /** Estado o ciclo de vida. Va al lado del título, en su mismo renglón. */
  derecha?: ReactNode
  acciones?: ReactNode
}) {
  return (
    <header className="pb-4" data-testid="entity-header">
      {volverA && (
        <nav className="mb-[5px] flex items-center gap-[7px] text-[11.5px] text-faint" data-testid="miga">
          <Link prefetch={false} href={volverA} className="hover:text-ink hover:underline">
            {volverLabel ?? 'Volver'}
          </Link>
          <span aria-hidden>/</span>
          {/* El tramo actual NO es un link: ya estás acá. Se escribe para cerrar la frase. */}
          <span className="min-w-0 truncate text-ink-soft">{titulo}</span>
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <TituloPantalla>{titulo}</TituloPantalla>
        {derecha}
        {acciones && (
          // `ml-auto` y no `justify-between`: con el estado pegado al título, lo que empuja las
          // acciones al borde derecho es el margen, no la distribución del contenedor — si no,
          // la pastilla se iría con ellas.
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">{acciones}</div>
        )}
      </div>

      {campos.length > 0 && (
        <div
          className="mt-[3px] flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted"
          data-testid="campos-header"
        >
          {campos.map((c, i) => (
            <span key={c.rotulo || i} className="inline-flex items-center gap-x-4">
              {/* El separador va ANTES de cada campo salvo el primero: así el último no queda con
                  un «·» colgando cuando la línea envuelve. */}
              {i > 0 && <span className="text-line-strong" aria-hidden>·</span>}
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {c.rotulo && <span className="text-faint">{c.rotulo}:</span>}
                {c.valor === null || c.valor === undefined || c.valor === '' ? (
                  <Nulo>{c.falta ?? 'sin cargar'}</Nulo>
                ) : (
                  <span className="text-ink-soft">{c.valor}</span>
                )}
              </span>
            </span>
          ))}
        </div>
      )}
    </header>
  )
}
