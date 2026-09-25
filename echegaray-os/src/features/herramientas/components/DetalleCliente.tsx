'use client'

// D04 · EL CLIENTE ELEGIDO EN UBICACIONES — todo lo que hay en su predio, sumando sus obras (dueño, 25/09/2026:
// «si quiero ver todo lo que hay en un cliente que me salga eso, y después ver por obra; pero en realidad
// la ubicación es la misma, en un cliente»).
//
// El cliente es el lugar físico; la obra es a qué se imputa. Por eso la tabla trae la columna «Obra» y los
// chips filtran por obra sin salir del cliente, y la obra sola se abre desde el árbol (con sus acciones de
// lugar: recuento, planilla, alta). Mover desde acá es el mismo panel de siempre: si lo marcado está en una
// sola obra, sale de ahí; entre obras del mismo cliente, el movimiento se lee como reimputación.

import Link from 'next/link'
import { useState } from 'react'
import { activosDelCliente, type ClienteLugar } from '../logica/clientes-lugar'
import { ETIQUETA_ESTADO_CORTA, TONO_ESTADO, conProblema } from '../logica/parque'
import { useHerramientas } from './Espacio'
import { IcoFlecha, IcoRodado } from './iconos'
import { COLOR_TONO, MONO, SUPERFICIE, V, botonPrimario, eyebrow, vacio } from './estilo'

const COLS = '24px minmax(0,1.5fr) minmax(0,1.3fr) 150px 64px'

export function DetalleCliente({ cliente }: { cliente: ClienteLugar }) {
  const { parque, abrir } = useHerramientas()
  const [obra, setObra] = useState<string | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const todo = activosDelCliente(parque, cliente)
  const lista = obra ? activosDelCliente(parque, cliente, obra) : todo
  const conProb = todo.filter((x) => conProblema(x.activo)).length
  const marcadas = sel.filter((id) => lista.some((x) => x.activo.id === id))
  const ids = marcadas.length ? marcadas : lista.map((x) => x.activo.id)
  const unidades = lista.reduce((s, x) => s + x.total, 0)
  const marcar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((y) => y !== id) : [...s, id]))
  const n = cliente.obras.length

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="detalle-cliente">
        <div style={{ fontSize: '12.5px', color: V.apagado }}>Cliente · un solo predio · {n} {n === 1 ? 'obra' : 'obras'}</div>
        <h2 style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em' }} data-testid="titulo-lugar">{cliente.nombre ?? 'Sin cliente cargado'}</h2>
        <div style={{ fontSize: '13px', color: V.apagado }}>
          {cliente.n} {cliente.n === 1 ? 'activo' : 'activos'}{cliente.unidades !== cliente.n ? ` · ${cliente.unidades} unidades` : ''}{conProb ? ` · ${conProb} con problema` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" data-testid="mover-desde-cliente" disabled={!lista.length}
          onClick={() => abrir({ tipo: 'mover', ids, origen: obra })} style={{ ...botonPrimario, opacity: lista.length ? 1 : 0.45 }}>
          <IcoFlecha tam={13} />{marcadas.length ? `Mover ${marcadas.length} marcad${marcadas.length === 1 ? 'o' : 'os'}` : `Mover todo${obra ? ' lo de esta obra' : ''}`}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '12.5px', flexWrap: 'wrap', paddingBottom: 4 }} data-testid="obras-del-cliente">
        <span style={{ ...eyebrow, marginRight: 4 }}>Por obra</span>
        {[{ id: null as string | null, t: 'Todas', c: cliente.n }, ...cliente.obras.map((o) => ({ id: o.ubicacionId as string | null, t: o.rotulo, c: o.n }))].map((f) => {
          const on = f.id === obra
          return (
            <button key={f.id ?? 'todas'} type="button" onClick={() => { setObra(f.id); setSel([]) }} data-testid="chip-obra"
              style={{ fontWeight: on ? 500 : 400, color: on ? V.tinta : V.apagado, boxShadow: on ? `inset 0 -1.5px 0 ${V.grafito}` : 'none', paddingBottom: 2, textAlign: 'left' }}>
              {f.t} <span style={{ color: V.tenue, fontWeight: 400 }}>{f.c}</span>
            </button>
          )
        })}
        {obra && (
          <Link href={`/herramientas/ubicaciones?u=${obra}`} prefetch={false} style={{ marginLeft: 'auto', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            abrir la obra
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="activos-del-cliente">
        <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 36, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
          <div /><div>Activo</div><div>Obra</div><div>Estado</div><div style={{ textAlign: 'right' }}>Unid.</div>
        </div>
        {lista.length === 0 && <div style={{ fontSize: '13px', color: V.tenue, padding: '14px 0' }}>No hay nada en este cliente.</div>}
        {lista.map(({ activo: a, porObra, total }, i) => {
          const tono = COLOR_TONO[TONO_ESTADO[a.estado]]
          const on = marcadas.includes(a.id)
          return (
            <div key={a.id} className="hover:bg-surface-quiet" data-testid="fila-activo-cliente"
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 48, alignItems: 'center', borderBottom: i < lista.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px', background: on ? SUPERFICIE : undefined }}>
              <input type="checkbox" checked={on} onChange={() => marcar(a.id)} aria-label={`Marcar ${a.nombre}`} style={{ width: 16, height: 16, accentColor: V.grafito }} />
              <Link href={`/herramientas/inventario?clase=todo&activo=${encodeURIComponent(a.codigo)}`} prefetch={false} style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                {a.clase === 'rodado' && <IcoRodado tam={14} />}
                <span style={{ fontWeight: 500 }} className="truncate">{a.nombre}</span>
                <span style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>{a.patente ?? a.codigo}</span>
              </Link>
              <div style={{ color: V.tintaSuave, fontSize: '12.5px', minWidth: 0 }} className="truncate" title={porObra.map((o) => `${o.rotulo} ${o.cantidad}`).join(' · ')}>
                {porObra.length === 1 ? porObra[0].rotulo : porObra.map((o) => `${o.rotulo} ${o.cantidad}`).join(' · ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tono }}>
                {a.estado !== 'fuera_servicio' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: tono, flexShrink: 0 }} />}
                {ETIQUETA_ESTADO_CORTA[a.estado]}
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...(total ? { color: V.tintaSuave } : vacio) }}>{total}</div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        {lista.length} {lista.length === 1 ? 'activo' : 'activos'} · {unidades} {unidades === 1 ? 'unidad' : 'unidades'}. Entre obras de este cliente, mover es reimputar: no cambia de predio.
      </div>
    </>
  )
}
