import { SeccionEsqueleto } from '@/shared/components/carga'

// COMPRAS — la pantalla más pesada del área (el listado del Sheet con sus filtros). Es justamente
// donde más se nota no tener esqueleto propio: es la que más tarda en volver.
export default function Cargando() {
  return <SeccionEsqueleto cols={7} filas={10} anchoTitulo="w-28" vistas={3} />
}
