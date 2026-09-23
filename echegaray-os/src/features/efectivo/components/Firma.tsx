import { imagenDeFirma } from '../logica/firmaImagen'
import { V } from './estilo'

/** La firma dibujada, con quién y cuándo. Sin trazo no dibuja nada: no hay «firma» que mostrar. */
export function Firma({ svg, rotulo, testid }: { svg: string | null | undefined; rotulo: string; testid?: string }) {
  const src = imagenDeFirma(svg)
  if (!src) return null
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={testid}>
      <img src={src} alt={`Firma: ${rotulo}`} style={{ height: 56, width: 160, objectFit: 'contain', background: '#FFFFFF', border: `1px solid ${V.lineaFila}`, borderRadius: 4 }} />
      <figcaption style={{ fontSize: '11px', color: V.tenue }}>{rotulo}</figcaption>
    </figure>
  )
}
