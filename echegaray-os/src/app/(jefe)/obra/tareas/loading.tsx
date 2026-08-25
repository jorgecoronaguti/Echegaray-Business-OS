import { EsqueletoJefe } from '@/features/jefe/components/EsqueletoJefe'

// J03 · TAREAS — un solo panel, largo: es una lista. Sin franja de cifras arriba.
export default function Cargando() {
  return <EsqueletoJefe paneles={1} testid="esqueleto-jefe-tareas" />
}
