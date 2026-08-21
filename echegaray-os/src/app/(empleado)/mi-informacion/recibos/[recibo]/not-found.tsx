import { EstadoNoEncontrado } from '@/shared/components/estado'

// EL RECIBO NO ESTÁ ENTRE LOS TUYOS. Igual que con los documentos, «no existe» y «es de otro» se
// contestan igual: distinguirlos sería confirmarle a alguien el recibo de un compañero.
export default function NoEncontrado() {
  return (
    <EstadoNoEncontrado
      entidad="ese recibo"
      volver={{ href: '/mi-informacion/recibos', texto: 'Mis recibos' }}
      detalle="No figura entre tus recibos. Los publica Administración cuando cierra la liquidación."
    />
  )
}
