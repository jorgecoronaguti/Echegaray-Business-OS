// EL MEDIO DE PAGO DE UNA FILA DE COMPRAS — y, si es «A rendir», de qué entrega salió la plata (D07).
//
// Diseño «Efectivo a rendir», D07: *«lo rendido no tiene grilla propia: es una fila más, con su medio de
// pago»*. Lo único nuevo es el número de entrega dentro del medio. Sale de `efectivo_rendicion.compra_clave`
// = la clave de la fila; si esa lectura no está (migración 20260922T1500 sin aplicar), dice «Efectivo a
// rendir» a secas — el número es un agregado, nunca una condición para listar.

import { V } from '@/shared/components/v2/patron'

export function MedioDeLaFila({ tipoPago, entrega, className, cuerpo }: {
  tipoPago: string | null
  /** El código de la entrega (ER-0147) que rinde esta fila, si se sabe. */
  entrega: string | null | undefined
  className: string
  cuerpo: string
}) {
  // NO BLOQUEA NADA y por eso es apagado, no ámbar: sin forma de pago la compra existe igual; lo único
  // que no se puede es proyectar cuándo sale la plata.
  if (!tipoPago) return <span className={className} style={{ fontSize: cuerpo, color: V.tenue }}>sin cargar</span>
  if (tipoPago !== 'A rendir') return <span className={className} style={{ fontSize: cuerpo, color: V.tintaSuave }}>{tipoPago}</span>
  return (
    <span className={className} style={{ fontSize: cuerpo, color: V.tintaSuave }} data-testid="medio-a-rendir" data-entrega={entrega ?? undefined}>
      Efectivo a rendir
      {entrega && <span className="font-mono" style={{ fontSize: '11.5px', color: V.apagado }}> {entrega}</span>}
    </span>
  )
}
