'use client'

// M05 · QUÉ HAY EN ESTA OBRA — la lista del lugar con casillas; «Mover» lleva lo marcado a M06.
//
// Desvío: sin «Control físico» (etapa 2): la primaria es Mover. Sin «no visto en el último control»
// (no hay controles todavía).

import Link from 'next/link'
import { useState } from 'react'
import { MONO, V } from '../estilo'
import { IcoRodado } from '../iconos'
import { primarioTelefono, secundarioTelefono } from './MarcoTelefono'

export interface ItemLugar {
  id: string
  codigo: string
  nombre: string
  clase: string
  patente: string | null
  detalle: string
  problema: boolean
  lleva: number
}

type Filtro = 'todo' | 'problema' | 'equipos'

export function ListaDelLugar({ items, en }: { items: ItemLugar[]; en: string }) {
  const [sel, setSel] = useState<string[]>([])
  const [f, setF] = useState<Filtro>('todo')
  const prob = items.filter((x) => x.problema).length
  const equipos = items.filter((x) => x.clase !== 'herramienta').length
  const lista = f === 'problema' ? items.filter((x) => x.problema) : f === 'equipos' ? items.filter((x) => x.clase !== 'herramienta') : items
  const chips: { v: Filtro; t: string; warn?: boolean; n: number }[] = [
    { v: 'todo', t: 'Todo', n: items.length },
    ...(prob ? [{ v: 'problema' as const, t: 'Con problema', warn: true, n: prob }] : []),
    ...(equipos ? [{ v: 'equipos' as const, t: 'Maquinarias y rodados', n: equipos }] : []),
  ]
  const moverHref = `/campo/herramientas/mover?ids=${sel.join(',')}&en=${encodeURIComponent(en)}`
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chips.map((c) => (
          <button key={c.v} type="button" onClick={() => setF(c.v)}
            style={{ height: 36, padding: '0 12px', borderRadius: 6, fontSize: '13px', border: `1px solid ${c.v === f ? V.grafito : V.linea}`, fontWeight: c.v === f ? 600 : 400, color: c.warn ? V.warn : c.v === f ? V.tinta : V.apagado }}>
            {c.t} {c.n}
          </button>
        ))}
      </div>
      <div data-testid="lista-lugar">
        {items.length === 0 && <div style={{ fontSize: '13.5px', color: V.apagado }}>No hay nada registrado en este lugar.</div>}
        {lista.map((x, i) => (
          <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 58, borderBottom: i < lista.length - 1 ? `1px solid ${V.linea}` : undefined, cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.includes(x.id)} onChange={() => setSel((s) => (s.includes(x.id) ? s.filter((y) => y !== x.id) : [...s, x.id]))}
              aria-label={`Marcar ${x.nombre}`} style={{ width: 22, height: 22, accentColor: V.grafito, flexShrink: 0 }} />
            {x.clase === 'rodado' && <IcoRodado tam={16} color={V.apagado} />}
            <Link href={`/campo/herramientas/a/${encodeURIComponent(x.codigo)}?en=${encodeURIComponent(en)}`} prefetch={false} style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: '15px', fontWeight: 500 }}>
                {x.nombre}{x.patente && <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado, fontWeight: 400 }}> {x.patente}</span>}
              </div>
              <div style={{ fontSize: '12.5px', color: x.problema ? V.warn : V.apagado }}>{x.clase === 'rodado' ? `rodado · lleva ${x.lleva}` : x.detalle}</div>
            </Link>
          </label>
        ))}
      </div>
      <div style={{ position: 'sticky', bottom: 0, marginTop: 'auto', margin: '0 -16px -18px', padding: '12px 16px 18px', borderTop: `1px solid ${V.linea}`, background: '#FFFFFF', display: 'flex', gap: 10 }}>
        {sel.length > 0 ? (
          <Link href={moverHref} prefetch={false} style={primarioTelefono} data-testid="mover-marcadas">Mover {sel.length === 1 ? '1' : `las ${sel.length}`}</Link>
        ) : (
          <button type="button" disabled style={{ ...primarioTelefono, opacity: 0.45 }}>Marcá qué mover</button>
        )}
        {items.length > 0 && (
          <button type="button" onClick={() => setSel(sel.length === items.length ? [] : items.map((x) => x.id))} style={secundarioTelefono}>
            {sel.length === items.length ? 'Ninguna' : 'Todas'}
          </button>
        )}
      </div>
    </>
  )
}
