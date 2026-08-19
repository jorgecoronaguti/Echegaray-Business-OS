import { PantallaEsqueleto, EncabezadoEsqueleto, TablaEsqueleto } from '@/shared/components/carga'

// LA CARTERA DE CLIENTES — misma tabla, sin los datos.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-36" />
      <TablaEsqueleto cols={5} filas={7} />
    </PantallaEsqueleto>
  )
}
