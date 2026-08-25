import { EsqueletoJefe } from '@/features/jefe/components/EsqueletoJefe'

// J05 · AVANCE MASIVO — una lista larga de tareas con su control. Un solo bloque alto: el pie de
// acción es fijo y no ocupa lugar en el flujo, así que el esqueleto no lo dibuja.
export default function Cargando() {
  return <EsqueletoJefe paneles={1} testid="esqueleto-jefe-avance-masivo" />
}
