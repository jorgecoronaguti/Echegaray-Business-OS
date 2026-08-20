import { PantallaEsqueleto, EncabezadoEsqueleto, TablaEsqueleto } from '@/shared/components/carga'

// CUADRILLAS — cuatro columnas: cuadrilla, responsable, integrantes y obra actual.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-36" />
      <TablaEsqueleto cols={4} filas={5} />
    </PantallaEsqueleto>
  )
}
