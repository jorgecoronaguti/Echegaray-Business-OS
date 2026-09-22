import { EsqueletoJefe } from '@/features/jefe/components/EsqueletoJefe'

// D15 · MI EFECTIVO DE LA OBRA — las tres cifras + la lista de lo rendido.
export default function Cargando() {
  return <EsqueletoJefe metricas paneles={2} testid="esqueleto-jefe-efectivo" />
}
