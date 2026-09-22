'use client'

// M06 · MOVER — a dónde, en un toque. El origen no se elige: es donde están hoy (un lote sale del
// lugar donde está parado el teléfono). Un lote pregunta cuántas van (dueño, 22/09).
//
// Destinos a la vista: el Taller y los rodados. «Otra obra…» despliega las obras ACTIVAS del índice y
// «Servicio técnico o tercero…» los lugares de ese tipo. Si se mueve un rodado con carga, se pregunta
// qué pasa con la carga antes de confirmar.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { moverExistenciasAction } from '../../services/acciones'
import { MONO, V, eyebrow } from '../estilo'
import { primarioTelefono } from './MarcoTelefono'

export interface OpcionTel { clave: string; rotulo: string; grupo: string; patente?: string | null }

export function MoverTelefono({ items, desde, nombres, opciones, cargas, volverA, bajaCargaEn }: {
  items: { id: string; origen: string | null; disponible: number }[]
  desde: { rotulo: string; cuenta: number }[]
  nombres: { nombre: string; problema: string | null }[]
  opciones: OpcionTel[]
  cargas: { rodado: string; carga: number }[]
  volverA: string
  bajaCargaEn: string | null
}) {
  const router = useRouter()
  const ids = items.map((it) => it.id)
  const [cant, setCant] = useState<Record<string, number>>(() => Object.fromEntries(items.map((it) => [it.id, it.disponible])))
  const [destino, setDestino] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<'obra' | 'otro' | null>(null)
  const [bajar, setBajar] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const directas = opciones.filter((o) => o.grupo === 'taller' || o.grupo === 'rodado')
  const obras = opciones.filter((o) => o.grupo === 'obra')
  const otros = opciones.filter((o) => o.grupo === 'servicio_tecnico' || o.grupo === 'tercero')
  const puede = !!destino && ids.length > 0 && (cargas.length === 0 || bajar !== null) && !enviando

  async function confirmar() {
    if (!destino) return
    setEnviando(true)
    setError(null)
    const r = await moverExistenciasAction({
      items: items.map((it) => ({ activo: it.id, origen: it.origen, cantidad: Math.min(Math.max(Math.trunc(cant[it.id]) || 1, 1), it.disponible) })),
      destino, bajarCarga: bajar ?? false,
    })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    router.push(volverA)
    router.refresh()
  }

  const radio = (o: OpcionTel) => (
    <label key={o.clave} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 57, borderBottom: `1px solid ${V.linea}`, cursor: 'pointer' }}>
      <input type="radio" name="destino" checked={destino === o.clave} onChange={() => setDestino(o.clave)} style={{ width: 22, height: 22, accentColor: V.grafito }} data-testid="destino" />
      <span style={{ fontSize: '15px' }}>{o.rotulo}{o.patente && <span style={{ fontFamily: MONO, fontSize: '12.5px', color: V.apagado }}> {o.patente}</span>}</span>
    </label>
  )

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={eyebrow}>Desde</div>
        {desde.map((d) => (
          <div key={d.rotulo} style={{ fontSize: '15px' }}>{d.rotulo}{desde.length > 1 && <span style={{ color: V.apagado, fontSize: '13px' }}> · {d.cuenta}</span>}</div>
        ))}
        <div style={{ fontSize: '12.5px', color: V.apagado }}>Es donde están hoy. No se elige.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 16, borderTop: `1px solid ${V.linea}` }}>
        <div style={eyebrow}>Hacia</div>
        {directas.map(radio)}
        <button type="button" onClick={() => setAbierto(abierto === 'obra' ? null : 'obra')} style={{ minHeight: 57, display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${V.linea}`, fontSize: '15px', textAlign: 'left' }}>
          <span style={{ width: 22, height: 22, border: `1.5px solid ${V.lineaFuerte}`, borderRadius: '50%', flexShrink: 0 }} />Otra obra…
        </button>
        {abierto === 'obra' && <div style={{ paddingLeft: 20 }}>{obras.length ? obras.map(radio) : <div style={{ fontSize: '13px', color: V.apagado, padding: '10px 0' }}>No hay otras obras activas en el índice.</div>}</div>}
        <button type="button" onClick={() => setAbierto(abierto === 'otro' ? null : 'otro')} style={{ minHeight: 57, display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${V.linea}`, fontSize: '15px', textAlign: 'left' }}>
          <span style={{ width: 22, height: 22, border: `1.5px solid ${V.lineaFuerte}`, borderRadius: '50%', flexShrink: 0 }} />Servicio técnico o tercero…
        </button>
        {abierto === 'otro' && <div style={{ paddingLeft: 20 }}>{otros.length ? otros.map(radio) : <div style={{ fontSize: '13px', color: V.apagado, padding: '10px 0' }}>No hay ninguno cargado. Se crean desde la computadora, en Ubicaciones.</div>}</div>}
      </div>
      {cargas.map((c) => (
        <div key={c.rodado} data-testid="pregunta-carga" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '14px' }}>
          <div>{c.rodado} lleva {c.carga} encima. ¿Qué pasa con la carga?</div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}><input type="radio" name="carga" checked={bajar === false} onChange={() => setBajar(false)} style={{ width: 20, height: 20 }} />Viaja con el rodado</label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}><input type="radio" name="carga" checked={bajar === true} onChange={() => setBajar(true)} style={{ width: 20, height: 20 }} />Baja{bajaCargaEn ? ` en ${bajaCargaEn}` : ' donde está el rodado'}</label>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 16, borderTop: `1px solid ${V.linea}` }}>
        <div style={eyebrow}>Qué se mueve</div>
        {nombres.map((n, i) => {
          const it = items[i]
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '14px', minHeight: it.disponible > 1 ? 48 : undefined }}>
              <span style={{ flex: 1 }}>{n.nombre}{n.problema && <span style={{ color: V.warn, fontSize: '13px' }}> · {n.problema}</span>}</span>
              {it.disponible > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: V.apagado }}>
                  <input type="number" inputMode="numeric" min={1} max={it.disponible} value={cant[it.id]} data-testid="cantidad-telefono"
                    aria-label={`Cuántas de ${n.nombre}`}
                    onChange={(e) => setCant((c) => ({ ...c, [it.id]: e.target.valueAsNumber }))}
                    style={{ width: 64, height: 40, border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: '0 8px', fontSize: '15px' }} />
                  de {it.disponible}
                </label>
              )}
            </div>
          )
        })}
      </div>
      {error && <div role="alert" style={{ fontSize: '13px', color: V.neg }}>{error}</div>}
      <div style={{ position: 'sticky', bottom: 0, margin: 'auto -16px -18px', padding: '12px 16px 12px', borderTop: `1px solid ${V.linea}`, background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" onClick={confirmar} disabled={!puede} style={{ ...primarioTelefono, flex: 'none', opacity: puede ? 1 : 0.45 }} data-testid="confirmar-movimiento">
          {enviando ? 'Moviendo…' : 'Confirmar movimiento'}
        </button>
        <div style={{ fontSize: '12px', color: V.apagado, textAlign: 'center' }}>Queda con tu nombre y la hora.</div>
      </div>
    </>
  )
}
