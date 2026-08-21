import { EstadoNoEncontrado } from '@/shared/components/estado'

// EL DOCUMENTO NO ES TUYO, O NO EXISTE — y el sistema no dice cuál de las dos.
//
// La página trata los dos casos igual a propósito: contestar «existe, pero es de otro» le confirma
// a quien preguntó por un documento ajeno que ese documento existe. La ausencia es la respuesta.
export default function NoEncontrado() {
  return (
    <EstadoNoEncontrado
      entidad="ese documento"
      volver={{ href: '/mi-informacion/documentos', texto: 'Mis documentos' }}
      detalle="No figura entre tus documentos. Si esperabas encontrarlo acá, lo carga Administración."
    />
  )
}
