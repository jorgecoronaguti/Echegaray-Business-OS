import { EstadoNoEncontrado } from '@/shared/components/estado'

// LA PARTIDA NO EXISTE. Puede haberse quitado del presupuesto —es una edición legítima mientras
// está en borrador— o el enlace puede apuntar a otra versión del mismo presupuesto: la partida
// vive colgada de UNA versión, y crear la versión siguiente copia las partidas con ids nuevos.
export default function NoEncontrada() {
  return (
    <EstadoNoEncontrado
      entidad="esa partida"
      volver={{ href: '/presupuestos', texto: 'Presupuestos' }}
      detalle="Puede haberse quitado del presupuesto, o el enlace ser de otra versión: al crear una versión nueva, las partidas se copian con identificadores nuevos."
    />
  )
}
