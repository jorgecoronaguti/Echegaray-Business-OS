import { EstadoNoEncontrado } from '@/shared/components/estado'

// EL CLIENTE NO EXISTE. La ficha ya distingue el fallo de lectura —que dibuja el mensaje de la
// base— de la consulta que anduvo y no encontró nada, que es esto.
export default function NoEncontrado() {
  return (
    <EstadoNoEncontrado
      entidad="ese cliente"
      volver={{ href: '/clientes', texto: 'Cartera de clientes' }}
      detalle="Ningún cliente responde a esa dirección. Puede haber cambiado de nombre, o el enlace ser de antes."
    />
  )
}
