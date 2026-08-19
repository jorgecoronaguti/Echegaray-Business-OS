import { PantallaEsqueleto, EncabezadoEsqueleto, TablaEsqueleto } from '@/shared/components/carga'

// PERSONAL — las cinco columnas del listado, sin los datos. Se reusa el vocabulario de esqueletos
// del OS en vez de dibujar otro: cinco columnas acá son las cinco que van a aparecer, así que la
// tabla no se reacomoda cuando llega el contenido.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto ancho="w-32" />
      <TablaEsqueleto cols={5} filas={8} />
    </PantallaEsqueleto>
  )
}
