import { EstadoNoEncontrado } from '@/shared/components/estado'

// LA TAREA NO EXISTE O YA NO ESTÁ ASIGNADA. La página distingue antes el fallo de lectura —que
// muestra el mensaje de la fuente— de la consulta que anduvo y devolvió nada, que es esto.
export default function NoEncontrada() {
  return (
    <EstadoNoEncontrado
      entidad="esa tarea"
      volver={{ href: '/mi-trabajo/tareas', texto: 'Mis tareas' }}
      detalle="No figura entre tus tareas. Pudo cerrarse, o pasar a otra persona."
    />
  )
}
