// El QR de un activo, dibujado en SVG con el codificador propio (`logica/qr.ts`). Codifica la URL de la
// etiqueta (`https://app.ecsas.com.ar/h/<CÓDIGO>`): abierta con la cámara del teléfono cae en la ficha.

import { matrizQR, trazoQR } from '../logica/qr'
import { urlDeEtiqueta } from '../logica/codigo'

export function QR({ codigo, lado, margen = 1, titulo }: { codigo: string; lado: number | string; margen?: number; titulo?: string }) {
  const m = matrizQR(urlDeEtiqueta(codigo))
  const n = m.length + margen * 2
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`} width={lado} height={lado} shapeRendering="crispEdges" role="img"
      aria-label={titulo ?? `QR de ${codigo}`} style={{ display: 'block', background: '#FFFFFF', color: '#000000' }}
    >
      <path d={trazoQR(m, margen)} fill="currentColor" />
    </svg>
  )
}
