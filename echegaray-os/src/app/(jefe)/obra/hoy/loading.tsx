import { EsqueletoJefe } from '@/features/jefe/components/EsqueletoJefe'

// J01 · HOY — franja de tres cifras + «Resolver hoy» + frentes + gente. Es la pantalla a la que se
// vuelve todo el tiempo desde la barra, así que es la que más veces se ve cargando.
export default function Cargando() {
  return <EsqueletoJefe metricas paneles={3} testid="esqueleto-jefe-hoy" />
}
