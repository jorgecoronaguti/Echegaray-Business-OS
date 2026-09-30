// LA RESTA DE UN RECIBO ANTERIOR, AL LADO DEL NETO (dueño, 30/09/2026). La celda sigue mostrando el neto del recibo
// —lo que el estudio liquidó—; la marca dice cuánto más sale por banco y de dónde viene, y en la quincena de origen a
// cuál se fue. Sin ella, el saldo banco (neto + resta − pagado) no se explica desde la fila.

import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { textoDelArrastre } from '../../../services/liquidacionArrastre'
import type { LineaConOverrides } from '../../../services/liquidacionOverrides'

export function MarcaDeArrastre({ l, testid }: { l: LineaConOverrides; testid: string }) {
  const titulo = textoDelArrastre(l, pesos)
  if (!titulo) return null
  const a = l.arrastre
  const texto = a?.estado === 'aplicado' ? `+${pesos(a.importe)}`
    : a?.estado === 'no_alcanza' ? `${pesos(a.importe)} ⚠`
    : `→ ${pesos(l.arrastradoA?.importe ?? null)}`
  // «NO ALCANZA» EN ÁMBAR: es lo único de la marca que pide que alguien decida.
  const color = a?.estado === 'no_alcanza' ? V.warn : V.apagado
  return (
    <span data-testid={testid} data-arrastre={a?.estado ?? 'saliente'} title={titulo}
      style={{ display: 'block', fontSize: '10.5px', lineHeight: '14px', color, whiteSpace: 'nowrap', fontStyle: 'normal' }}>{texto}</span>
  )
}
