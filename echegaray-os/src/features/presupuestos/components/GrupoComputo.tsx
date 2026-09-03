'use client'

// UN GRUPO DEL CÓMPUTO = LAS PARTIDAS DE UN PASO — porte de la columna derecha de «Lectura del
// plano» (líneas 172-195). El importe se formatea acá, nunca en el backend: `pasos-vista.mjs`
// manda las cifras crudas (`c`, `p`, `imp`) para que la pantalla decida cómo mostrar el hueco —
// «sin cotizar», nunca `$0`.

import { C } from '@/shared/components/canon'
import { formatoCantidad, formatoPesos, type GrupoComputo as TGrupo, type ItemComputo } from '../services/trabajoLectura'

export function GrupoComputo({ g }: { g: TGrupo }) {
  return (
    <div style={{ paddingTop: 20 }} data-testid={`grupo-${g.pasoId}`}>
      <div className="flex items-baseline gap-3" style={{ paddingBottom: 8 }}>
        <span className="font-mono text-[10px] font-semibold" style={{ letterSpacing: '.08em', color: C.tenue }}>{g.rotulo}</span>
        <span className="min-w-0 truncate text-[11.5px]" style={{ color: C.apagado }}>{g.titulo}</span>
        <div className="flex-1" />
        <span className="font-mono text-[11.5px]" style={{ color: C.tintaSuave }}>{formatoPesos(g.subtotal) ?? 'sin importe'}</span>
      </div>
      {g.items.map((it, i) => <FilaItem key={`${it.d}-${i}`} it={it} />)}
    </div>
  )
}

function FilaItem({ it }: { it: ItemComputo }) {
  const importe = formatoPesos(it.imp)
  return (
    <div className="grid items-center gap-3.5" style={{ gridTemplateColumns: 'minmax(0,1fr) 92px 40px 106px 128px', minHeight: 48, borderTop: '1px solid #EDECE7' }}>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[12.5px]" style={{ color: C.tinta }}>{it.d}</span>
        {it.nota && <span className="text-[11px]" style={{ lineHeight: 1.5, color: C.tenue }}>{it.nota}</span>}
      </span>
      <span className="text-right font-mono text-[12px]" style={{ color: it.c === null ? C.tenue : C.tintaSuave }}>{formatoCantidad(it.c) ?? '—'}</span>
      <span className="text-[11px]" style={{ color: C.tenue }}>{it.u}</span>
      <span className="text-right font-mono text-[12px]" style={{ color: C.apagado }}>{formatoPesos(it.p) ?? '—'}</span>
      <span className="text-right font-mono text-[12.5px]" style={{ color: it.imp === null ? C.tenue : C.tinta }}>{importe ?? 'sin cotizar'}</span>
    </div>
  )
}
