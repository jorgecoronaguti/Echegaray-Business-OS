import { EstadoNoEncontrado } from '@/shared/components/estado'

// LA PERSONA NO ESTÁ EN EL LEGAJO.
//
// Una baja NO borra a nadie —la nómina conserva a quien ya no está en la empresa—, así que llegar
// acá no significa «se fue»: significa que ese identificador no existe. Decir «ya no trabaja acá»
// sería inventar un hecho laboral a partir de una consulta vacía.
export default function NoEncontrada() {
  return (
    <EstadoNoEncontrado
      entidad="esa persona"
      volver={{ href: '/administracion/personas', texto: 'Personas' }}
      detalle="Ningún legajo responde a esa dirección. Una baja no borra el legajo: si la persona existió, sigue en la lista."
    />
  )
}
