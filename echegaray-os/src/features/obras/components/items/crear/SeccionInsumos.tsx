'use client'

// B06 · INSUMOS DE LA TAREA — eyebrow «Insumos» con «1 fuera de la obra» (warn) a la derecha; filas de 44
// (52 en el teléfono): ícono · nombre · estado a la derecha («en la obra» verde · «en Taller · traer»
// warn con el enlace a la ficha del activo · «material · Pedir»); al pie «+ Insumo · activo de
// Herramientas o material». Cada gesto escribe al toque (no espera al «Guardar» de las subtareas).

import Link from 'next/link'
import { useState } from 'react'
import { C } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Eyebrow, Resultado } from './Piezas'
import { BuscadorInsumo } from './Insumos'
import { alertaFueraDeObra, estadoDeInsumo, type InsumoTarea } from '../../../services/insumosTarea'
import type { ActivoElegible } from '../../../services/insumosService'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'

export interface AccionesInsumos {
  agregar: (tareaId: string, form: FormData) => Promise<ResultadoAccion>
  quitar: (insumoId: string) => Promise<ResultadoAccion>
  pedir: (insumoId: string, form: FormData) => Promise<ResultadoAccion>
}

export function SeccionInsumos({ obraId, tareaId, insumos, activos, acciones, alCambio, alto }: {
  obraId: string; tareaId: string; insumos: InsumoTarea[]; activos: ActivoElegible[]; acciones: AccionesInsumos; alCambio: () => void; alto: 44 | 52
}) {
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pidiendo, setPidiendo] = useState<string | null>(null)
  const [cant, setCant] = useState('')
  const alerta = alertaFueraDeObra(insumos, obraId)
  const tras = (r: ResultadoAccion) => {
    if (r.ok) { setResultado(r.mensaje ? { ok: true, texto: r.mensaje } : null); alCambio() } else setResultado({ ok: false, texto: r.error })
  }
  return (
    <div data-testid="seccion-insumos" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <Eyebrow derecha={alerta ? <span style={{ color: C.warn }}>{alerta}</span> : insumos.length ? `${insumos.length}` : null}>Insumos</Eyebrow>
      <Resultado r={resultado} />
      {insumos.map((i) => {
        const e = estadoDeInsumo(i, obraId)
        return (
          <div key={i.id} data-testid={`insumo-${i.id}`} style={{ minHeight: `${alto}px`, display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: alto === 44 ? '13.5px' : '14px', color: C.tinta }}>
            <span style={{ color: C.tintaSuave, display: 'flex' }}><Ico d={i.tipo === 'activo' ? P.herramienta : P.material} s={13} /></span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nombre}{i.cantidad != null ? ` · ${i.cantidad.toLocaleString('es-AR')}${i.unidad ? ` ${i.unidad}` : ''}` : ''}</span>
            {pidiendo === i.id ? (
              <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                <input autoFocus value={cant} onChange={(ev) => setCant(ev.target.value)} inputMode="decimal" placeholder="cuánto" aria-label={`Cuánto ${i.nombre}`} data-testid="pedir-cantidad"
                  style={{ width: '64px', height: '28px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', padding: '0 8px', font: 'inherit', fontSize: '12.5px' }} />
                <button type="button" data-testid="pedir-confirmar" onClick={async () => { const f = new FormData(); f.set('cantidad', cant); f.set('unidad', i.unidad ?? ''); const r = await acciones.pedir(i.id, f); if (r.ok) { setPidiendo(null); setCant('') } tras(r) }}
                  style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: '12px', color: C.tinta, textDecoration: 'underline', cursor: 'pointer' }}>Pedir</button>
              </span>
            ) : (
              <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: e.clase === 'en_obra' ? C.pos : e.clase === 'fuera' ? C.warn : C.tintaSuave }}>
                {e.texto}
                {e.clase === 'fuera' && i.activo_codigo && <> · <Link href={`/herramientas/inventario?activo=${encodeURIComponent(i.activo_codigo)}`} prefetch={false} style={{ color: C.warn, textDecoration: 'underline' }}>traer</Link></>}
                {e.clase === 'material' && <> · <button type="button" onClick={() => setPidiendo(i.id)} data-testid={`pedir-${i.id}`} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: C.tinta, textDecoration: 'underline', cursor: 'pointer' }}>Pedir</button></>}
              </span>
            )}
            <button type="button" onClick={async () => tras(await acciones.quitar(i.id))} aria-label={`Quitar ${i.nombre}`} style={{ border: 'none', background: 'none', padding: 0, color: C.tenue, cursor: 'pointer', display: 'flex' }}><Ico d={P.cerrar} s={11} /></button>
          </div>
        )
      })}
      <div style={{ paddingTop: '8px' }}>
        <BuscadorInsumo activos={activos} obraId={obraId} rotulo="Insumo · activo de Herramientas o material"
          alElegir={async (i) => { const f = new FormData(); f.set('insumo', JSON.stringify({ tipo: i.tipo, activo_id: i.activo_id, nombre: i.nombre })); tras(await acciones.agregar(tareaId, f)) }} />
      </div>
    </div>
  )
}
