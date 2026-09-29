'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Drawer, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { TarjetaLista, mono } from '@/shared/components/movil/Piezas'
import { C, diaMes } from '@/shared/components/movil/tokens'
import { numeroRemito, type Remito } from '../logica/stock'
import { RemitoImprimible } from './RemitoImprimible'

// LOS REMITOS EMITIDOS — para reimprimir uno o controlar qué se movió.
//
// PC: tabla densa y el remito en el panel lateral (se mira sin irse de la lista). Teléfono: una fila por
// remito que lleva a su propia pantalla (`/campo/material/remitos/[remito]`, detalle = [param]).
// Sólo lista lo que la base deja ver: Administración todo, el resto los remitos de sus obras.

const fecha = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' })
const resumen = (r: Remito) => (r.items.length === 1 ? r.items[0].material : `${r.items.length} materiales`)

export function ListaRemitos({ remitos, cara }: { remitos: Remito[]; cara: 'escritorio' | 'telefono' }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const elegido = remitos.find((r) => r.id === abierto) ?? null
  if (remitos.length === 0) return <Vacio>Todavía no se emitió ningún remito. Sale solo al mandar sobrante al Taller o a otra obra.</Vacio>

  if (cara === 'telefono') {
    return (
      <TarjetaLista testid="lista-remitos">
        <ul>
          {remitos.map((r, i) => (
            <li key={r.id} style={{ borderBottom: i === remitos.length - 1 ? undefined : `1px solid ${C.divisor}` }}>
              <Link href={`/campo/material/remitos/${r.id}`} data-testid="remito-fila" style={{ display: 'block', minHeight: 56, padding: '8px 14px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ ...mono, fontSize: 14, color: C.ink }}>{numeroRemito(r.numero)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted }}>{diaMes(fecha(r.emitido_en))}</span>
                </div>
                <div style={{ fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.origen_rotulo} → {r.destino_rotulo}</div>
                <div style={{ fontSize: 12.5, color: C.muted }}>{resumen(r)}</div>
              </Link>
            </li>
          ))}
        </ul>
      </TarjetaLista>
    )
  }

  return (
    <>
      <Tabla testid="tabla-remitos" minWidth={720}>
        <THead>
          <Th>Remito</Th>
          <Th>Fecha</Th>
          <Th>Origen</Th>
          <Th>Destino</Th>
          <Th>Qué</Th>
          <Th>Recibe</Th>
        </THead>
        <tbody>
          {remitos.map((r) => (
            <Tr key={r.id} compacta data-testid="remito-fila" data-id={r.id}>
              <Td fuerte className="whitespace-nowrap">
                <button type="button" onClick={() => setAbierto(r.id)} className="font-mono hover:underline" data-testid="remito-abrir">{numeroRemito(r.numero)}</button>
              </Td>
              <Td className="whitespace-nowrap">{fecha(r.emitido_en)}</Td>
              <Td>{r.origen_rotulo}</Td>
              <Td>{r.destino_rotulo}</Td>
              <Td>{resumen(r)}</Td>
              <Td>{r.recibe_nombre ?? <span className="text-faint">—</span>}</Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>
      {elegido && <PanelRemito remito={elegido} alCerrar={() => setAbierto(null)} />}
    </>
  )
}

export function PanelRemito({ remito, alCerrar }: { remito: Remito; alCerrar: () => void }) {
  return (
    <Drawer titulo={`Remito ${numeroRemito(remito.numero)}`} subtitulo={`${remito.origen_rotulo} → ${remito.destino_rotulo}`} onCerrar={alCerrar} ancho={560} testid="panel-remito">
      <RemitoImprimible remito={remito} />
    </Drawer>
  )
}
