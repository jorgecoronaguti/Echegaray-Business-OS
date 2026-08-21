import { EstadoNoEncontrado } from '@/shared/components/estado'

// EL 404 DEL SISTEMA — una dirección que no existe.
//
// Sin este archivo, Next dibuja su propia pantalla: «404 · This page could not be found», en inglés
// y sin salida. Dos cosas que el OS no admite —la interfaz va en español y ninguna pantalla deja a
// la persona sin a dónde ir.
export default function NoEncontrado() {
  return (
    <EstadoNoEncontrado
      entidad="esa pantalla"
      volver={{ href: '/', texto: 'Ir al inicio' }}
      detalle="La dirección no corresponde a ninguna pantalla del sistema. Puede ser un enlace viejo o un error de tipeo."
    />
  )
}
