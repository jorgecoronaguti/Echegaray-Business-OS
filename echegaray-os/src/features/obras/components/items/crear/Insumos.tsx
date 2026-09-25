'use client'

// LOS INSUMOS DE UNA TAREA (B05 · B06 · MB2): chips con la ubicación real del activo de Herramientas y el
// buscador «+ Insumo · activo de Herramientas o material». El diseño no dibuja el buscador abierto: se
// resuelve con el mismo vocabulario del resto (campo de 32, lista de filas de 36, lugar a la derecha).

import { useMemo, useState } from 'react'
import { C } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { estadoDeInsumo, type LugarActivo } from '../../../services/insumosTarea'
import type { ActivoElegible } from '../../../services/insumosService'

export interface InsumoElegido { tipo: 'activo' | 'material'; activo_id: string | null; nombre: string; lugar: LugarActivo | null }

/** El chip de un insumo elegido: «⚲ Mini excavadora · en la obra» (el activo con borde grafito). */
export function ChipInsumo({ i, obraId, alQuitar, alto = 32 }: { i: InsumoElegido; obraId: string; alQuitar?: () => void; alto?: 32 | 38 }) {
  const e = estadoDeInsumo({ tipo: i.tipo, lugar: i.lugar, pedido_id: null }, obraId)
  const activo = i.tipo === 'activo'
  return (
    <span data-testid="chip-insumo" style={{
      height: `${alto}px`, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '6px',
      border: `1px solid ${activo ? C.grafito : C.borde}`, fontSize: '12.5px', color: C.tinta, background: C.superficie, whiteSpace: 'nowrap',
    }}>
      {activo && <Ico d={P.herramienta} s={12} />}
      {i.nombre}
      {activo && <span style={{ fontSize: '11px', color: e.clase === 'fuera' ? C.warn : C.tenue }}>· {e.texto}</span>}
      {alQuitar && <button type="button" onClick={alQuitar} aria-label={`Quitar ${i.nombre}`} style={{ border: 'none', background: 'none', padding: 0, color: C.tenue, cursor: 'pointer', display: 'flex' }}><Ico d={P.cerrar} s={11} /></button>}
    </span>
  )
}

export function BuscadorInsumo({ activos, obraId, alElegir, rotulo = 'Insumo', alto = 32 }: {
  activos: ActivoElegible[]; obraId: string; alElegir: (i: InsumoElegido) => void; rotulo?: string; alto?: 32 | 38
}) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const coinciden = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = t ? activos.filter((a) => `${a.nombre} ${a.codigo ?? ''}`.toLowerCase().includes(t)) : activos
    // Primero lo que ya está en la obra: es lo que se usa sin mover nada.
    return [...base].sort((a, b) => Number(b.lugar?.obra_id === obraId) - Number(a.lugar?.obra_id === obraId)).slice(0, 8)
  }, [activos, q, obraId])
  const elegir = (i: InsumoElegido) => { alElegir(i); setQ(''); setAbierto(false) }
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} data-testid="agregar-insumo"
        style={{ height: `${alto}px`, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '6px', border: `1px dashed ${C.bordeFuerte}`, background: C.superficie, font: 'inherit', fontSize: '12.5px', color: C.tintaSuave, cursor: 'pointer' }}>
        <Ico d={P.mas} s={11} />{rotulo}
      </button>
    )
  }
  return (
    <div data-testid="buscador-insumo" style={{ width: '100%', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', background: C.superficie, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px', height: '34px', borderBottom: `1px solid ${C.bordeTarjeta}` }}>
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.buscar} s={13} /></span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Activo de Herramientas o material" aria-label="Buscar insumo" data-testid="campo-buscar-insumo"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAbierto(false)
            if (e.key === 'Enter') { e.preventDefault(); if (q.trim().length >= 2) elegir({ tipo: 'material', activo_id: null, nombre: q.trim(), lugar: null }) }
          }}
          style={{ flex: 1, border: 'none', outline: 'none', font: 'inherit', fontSize: '13px', background: 'transparent', color: C.tinta }} />
        <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" style={{ border: 'none', background: 'none', padding: 0, color: C.tenue, cursor: 'pointer', display: 'flex' }}><Ico d={P.cerrar} s={12} /></button>
      </div>
      {coinciden.map((a) => {
        const e = estadoDeInsumo({ tipo: 'activo', lugar: a.lugar, pedido_id: null }, obraId)
        return (
          <button key={a.id} type="button" onClick={() => elegir({ tipo: 'activo', activo_id: a.id, nombre: a.nombre, lugar: a.lugar })} data-testid={`elegir-activo-${a.id}`}
            style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px', border: 'none', borderBottom: `1px solid ${C.bordeLista}`, background: 'none', font: 'inherit', fontSize: '13px', color: C.tinta, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.herramienta} s={12} /></span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</span>
            <span style={{ fontSize: '11.5px', color: e.clase === 'en_obra' ? C.pos : e.clase === 'fuera' ? C.warn : C.tenue }}>{e.texto}</span>
          </button>
        )
      })}
      {coinciden.length === 0 && <div style={{ padding: '8px 10px', fontSize: '12px', color: C.tenue }}>Ningún activo coincide.</div>}
      <button type="button" disabled={q.trim().length < 2} onClick={() => elegir({ tipo: 'material', activo_id: null, nombre: q.trim(), lugar: null })} data-testid="elegir-material"
        style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px', border: 'none', background: 'none', font: 'inherit', fontSize: '13px', color: q.trim().length < 2 ? C.tenue : C.tinta, cursor: q.trim().length < 2 ? 'default' : 'pointer', textAlign: 'left' }}>
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.material} s={12} /></span>
        {q.trim().length < 2 ? 'Escribí el material para agregarlo' : <>Material «{q.trim()}»</>}
      </button>
    </div>
  )
}
