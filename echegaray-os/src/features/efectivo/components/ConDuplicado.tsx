'use client'

// «CON DUPLICADO» — la casilla que decide si el PDF del recibo de pago sale con original y duplicado (dueño,
// 02/10/2026: «no quiero duplicado, dame la opción en recibos de módulo de efectivo si quiero duplicado»).
// Apagada por defecto: el recibo sale con una sola copia.

import { V } from './estilo'

export function ConDuplicado({ valor, cambiar, testid }: { valor: boolean; cambiar: (v: boolean) => void; testid: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 32, fontSize: '13px', color: V.tinta, cursor: 'pointer' }}>
      <input type="checkbox" checked={valor} onChange={(e) => cambiar(e.target.checked)} data-testid={testid}
        style={{ width: 16, height: 16, accentColor: V.grafito }} />
      Con duplicado
    </label>
  )
}
