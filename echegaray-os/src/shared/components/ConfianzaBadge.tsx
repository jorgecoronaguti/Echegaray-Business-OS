import type { NaturalezaDato } from '@/shared/types/datoTrazado'

// UX-5: confianza/frescura visible sin ensuciar la pantalla. Antes cada pantalla
// mostraba "Confianza: calculado" suelto, sin explicar qué significa ni por qué
// importa -- un badge corto + un título (tooltip nativo) alcanza, no hace falta un
// párrafo. Un solo componente reutilizado en vez de repetir el mapeo en cada feature.
const CONFIANZA_LABEL: Record<NaturalezaDato, string> = {
  confirmado: 'Confirmado',
  conciliado: 'Conciliado',
  observado: 'Dato real',
  calculado: 'Calculado',
  estimado: 'Estimado',
  inferido: 'Estimación preliminar',
  conflictivo: 'Con conflicto',
  sin_dato: 'Sin dato',
}

const CONFIANZA_EXPLICACION: Record<NaturalezaDato, string> = {
  confirmado: 'Verificado contra la fuente original.',
  conciliado: 'Cruzado entre dos o más fuentes y coincide.',
  observado: 'Cargado directamente desde la fuente real, sin cálculo intermedio.',
  calculado: 'Calculado a partir de datos reales, con una regla conocida.',
  estimado: 'Calculado con supuestos que pueden no cumplirse siempre.',
  inferido: 'Primera aproximación con cobertura parcial -- no tratar como definitivo.',
  conflictivo: 'Hay más de una fuente y no coinciden -- requiere revisión.',
  sin_dato: 'No hay información suficiente para calcular esto todavía.',
}

const CONFIANZA_CLASSNAME: Record<NaturalezaDato, string> = {
  confirmado: 'bg-green-100 text-green-800',
  conciliado: 'bg-green-100 text-green-800',
  observado: 'bg-gray-200 text-gray-800',
  calculado: 'bg-gray-200 text-gray-800',
  estimado: 'bg-amber-100 text-amber-800',
  inferido: 'bg-amber-100 text-amber-800',
  conflictivo: 'bg-red-100 text-red-800',
  sin_dato: 'bg-gray-100 text-gray-400',
}

export function ConfianzaBadge({ naturaleza }: { naturaleza: NaturalezaDato }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${CONFIANZA_CLASSNAME[naturaleza]}`}
      title={CONFIANZA_EXPLICACION[naturaleza]}
      data-testid="confianza-badge"
    >
      {CONFIANZA_LABEL[naturaleza]}
    </span>
  )
}
