import { EsqueletoJefe } from '@/features/jefe/components/EsqueletoJefe'

// J06 · FRENTE — cifras del frente + sus paneles. Es la que más lecturas hace de las seis.
export default function Cargando() {
  return <EsqueletoJefe metricas paneles={3} testid="esqueleto-jefe-frente" />
}
