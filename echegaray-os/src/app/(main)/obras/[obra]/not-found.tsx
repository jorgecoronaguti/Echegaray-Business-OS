import { EstadoNoEncontrado } from '@/shared/components/estado'

// LA OBRA NO EXISTE — y eso no es lo mismo que no poder leerla.
//
// `obras/[obra]/page.tsx` separa los dos casos a propósito: si la lectura falla dibuja el error con
// el mensaje de la base, y sólo llama a `notFound()` cuando la consulta anduvo y devolvió nada. La
// confusión ya costó caro (17/08/2026): faltaba un `grant` y el módulo entero se veía como «página
// no encontrada», así que el defecto se buscó en el ruteo en vez de en los permisos.
export default function NoEncontrada() {
  return (
    <EstadoNoEncontrado
      entidad="esa obra"
      volver={{ href: '/obras', texto: 'Cartera de obras' }}
      detalle="Ninguna obra responde a esa dirección. Puede haber cambiado de nombre, o el enlace ser de antes."
    />
  )
}
