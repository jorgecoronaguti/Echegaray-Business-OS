import { redirect } from 'next/navigation'

// `/h` sin código: no hay nada que abrir. Al resumen de Herramientas.
export default function PuertaQRSinCodigo() {
  redirect('/herramientas')
}
