// D04 · UBICACIONES — el parque por dónde está.
//
// Desvíos: sin «Control físico» ni la columna «Último control» (los controles no son de esta etapa); en
// su lugar va quién lo trajo, que sale del último movimiento. «Depósito» no existe: Taller y almacén
// son un solo lugar. Las obras se nombran por el índice (`rotuloDeObra`).

import Link from 'next/link'
import { Fragment } from 'react'
import {
  ETIQUETA_ESTADO_CORTA, ETIQUETA_TIPO, ORDEN_TIPO, TONO_ESTADO, activosEn, autorDe, conProblema, diasDesde, llegoEn,
  rotuloUbicacion, vivo, type Parque,
} from '../logica/parque'
import type { TipoUbicacion, Ubicacion } from '../types'
import { BotonMover } from './Botones'
import { IconoLugar, IcoRodado } from './iconos'
import { NuevaUbicacion } from './NuevaUbicacion'
import { COLOR_TONO, MONO, SUPERFICIE, V, eyebrow, vacio } from './estilo'
import { diaMes } from './formato'

export type FiltroLugar = 'todo' | 'problema' | 'viejas'

const COLS = 'minmax(0,1.6fr) 130px 160px 110px 140px'
const SINGULAR: Record<TipoUbicacion, string> = {
  taller: 'Taller', obra: 'Obra', rodado: 'Rodado', servicio_tecnico: 'Servicio técnico', tercero: 'Tercero',
}

export function elegirUbicacion(p: Parque, u: string | null, tipo: string | null): Ubicacion | null {
  if (u) return p.ubicacionPorId.get(u) ?? null
  const conAlgo = (x: Ubicacion) => activosEn(p, x.id).length > 0
  const deTipo = p.ubicaciones.filter((x) => !x.archivada && (!tipo || x.tipo === tipo))
  return deTipo.find(conAlgo) ?? deTipo.find((x) => x.tipo === 'taller') ?? deTipo[0] ?? null
}

export function VistaUbicaciones({ parque, ubicacion, filtro, hoy = new Date() }: {
  parque: Parque
  ubicacion: Ubicacion | null
  filtro: FiltroLugar
  hoy?: Date
}) {
  const sinUbic = parque.activos.filter((a) => vivo(a) && !a.ubicacion_id).length
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 620 }}>
      <div style={{ width: 330, flexShrink: 0, padding: '22px 20px 28px', borderRight: `1px solid ${V.linea}`, display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="arbol-ubicaciones">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '14px', fontWeight: 600 }}>Ubicaciones</h1>
          <NuevaUbicacion />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px' }}>
          {ORDEN_TIPO.map((tipo, i) => <Grupo key={tipo} parque={parque} tipo={tipo} primero={i === 0} actual={ubicacion?.id ?? null} />)}
          {sinUbic > 0 && (
            <Link href="/herramientas/inventario?clase=todo&ubicacion=sin" prefetch={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, color: V.warn, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><IconoLugar tipo="sin_ubicacion" />Sin ubicación cargada</span>
              <span>{sinUbic}</span>
            </Link>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: '22px 26px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {ubicacion ? <Detalle parque={parque} u={ubicacion} filtro={filtro} hoy={hoy} /> : (
          <div style={{ fontSize: '13px', color: V.tenue }}>Todavía no hay ubicaciones con activos.</div>
        )}
      </div>
    </div>
  )
}

function Grupo({ parque, tipo, primero, actual }: { parque: Parque; tipo: TipoUbicacion; primero: boolean; actual: string | null }) {
  const lugares = parque.ubicaciones
    .filter((u) => u.tipo === tipo && !u.archivada)
    .map((u) => ({ u, n: activosEn(parque, u.id).length }))
    .filter((x) => x.n > 0 || x.u.tipo === 'taller' || x.u.tipo === 'servicio_tecnico' || x.u.tipo === 'tercero')
    .sort((a, b) => b.n - a.n || rotuloUbicacion(parque, a.u.id).localeCompare(rotuloUbicacion(parque, b.u.id)))
  if (lugares.length === 0) return null
  const total = lugares.reduce((s, x) => s + x.n, 0)
  return (
    <Fragment>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, borderBottom: `1px solid ${V.linea}`, marginTop: primero ? 0 : 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 500 }}><IconoLugar tipo={tipo} />{ETIQUETA_TIPO[tipo]}</span>
        <span style={{ color: V.apagado }}>{total}</span>
      </div>
      {lugares.map(({ u, n }) => {
        const on = u.id === actual
        return (
          <Link
            key={u.id} href={`/herramientas/ubicaciones?u=${u.id}`} prefetch={false} data-testid="lugar" className="hover:bg-surface-quiet"
            aria-current={on ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 34, paddingLeft: 14, borderBottom: `1px solid ${V.linea}`,
              color: on ? V.tinta : V.tintaSuave, fontWeight: on ? 500 : 400, background: on ? SUPERFICIE : undefined, boxShadow: on ? `inset 2px 0 0 ${V.marca}` : undefined,
            }}
          >
            <span style={{ ...(u.tipo === 'rodado' ? { fontFamily: MONO, fontSize: '12.5px' } : {}), minWidth: 0 }} className="truncate">{rotuloUbicacion(parque, u.id)}</span>
            <span style={{ color: on ? V.apagado : V.tenue }}>{n}</span>
          </Link>
        )
      })}
    </Fragment>
  )
}

function Detalle({ parque, u, filtro, hoy }: { parque: Parque; u: Ubicacion; filtro: FiltroLugar; hoy: Date }) {
  const aca = activosEn(parque, u.id).sort((a, b) => Number(b.clase === 'rodado') - Number(a.clase === 'rodado') || a.nombre.localeCompare(b.nombre, 'es'))
  const viejo = (id: string) => { const l = llegoEn(parque, parque.activoPorId.get(id)!); return l ? diasDesde(l, hoy) > 60 : false }
  const lista = filtro === 'problema' ? aca.filter(conProblema) : filtro === 'viejas' ? aca.filter((a) => viejo(a.id)) : aca
  const obra = u.obra_id ? parque.obraPorId.get(u.obra_id) : null
  const rodado = u.activo_id ? parque.activoPorId.get(u.activo_id) : null
  const encima = [
    SINGULAR[u.tipo],
    obra?.cliente ? `cliente ${obra.cliente}` : null,
    obra?.estado ? obra.estado : null,
    rodado ? `el rodado está en ${rotuloUbicacion(parque, rodado.ubicacion_id)}` : null,
    u.contacto ? u.contacto : null,
  ].filter(Boolean).join(' · ')
  const conProb = aca.filter(conProblema).length
  const filtros: { v: FiltroLugar; t: string; n: number; warn?: boolean }[] = [
    { v: 'todo', t: 'Todo', n: aca.length },
    { v: 'problema', t: 'Con problema', n: conProb, warn: true },
    { v: 'viejas', t: 'Hace +60 días acá', n: aca.filter((a) => viejo(a.id)).length },
  ]
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '12.5px', color: V.apagado }}>{encima}</div>
          <h2 style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 8 }} data-testid="titulo-lugar">
            {u.tipo === 'rodado' && <IcoRodado tam={16} />}{rotuloUbicacion(parque, u.id)}
          </h2>
          <div style={{ fontSize: '13px', color: V.apagado }}>
            {aca.length} {aca.length === 1 ? 'activo' : 'activos'}{conProb ? ` · ${conProb} con problema` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href={`/herramientas/planilla?u=${u.id}`} prefetch={false} data-testid="ver-planilla"
            style={{ height: 32, padding: '0 14px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13px', display: 'inline-flex', alignItems: 'center' }}>
            Planilla
          </Link>
          {aca.length > 0 && <BotonMover ids={aca.map((a) => a.id)} testid="mover-desde-aca">Mover desde acá</BotonMover>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '12.5px', paddingBottom: 4 }}>
        {filtros.map((f) => {
          const on = f.v === filtro
          return (
            <Link key={f.v} href={`/herramientas/ubicaciones?u=${u.id}${f.v === 'todo' ? '' : `&f=${f.v}`}`} prefetch={false}
              style={{ fontWeight: on ? 500 : 400, color: on ? V.tinta : f.warn && f.n ? V.warn : V.apagado, boxShadow: on ? `inset 0 -1.5px 0 ${V.grafito}` : 'none', paddingBottom: 2 }}>
              {f.t} <span style={{ color: V.tenue, fontWeight: 400 }}>{f.n}</span>
            </Link>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="activos-del-lugar">
        <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 36, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
          <div>Activo</div><div>Categoría</div><div>Estado</div><div>Llegó</div><div style={{ textAlign: 'right' }}>Quién lo trajo</div>
        </div>
        {lista.length === 0 && <div style={{ fontSize: '13px', color: V.tenue, padding: '14px 0' }}>{aca.length ? 'Nada con este filtro.' : 'No hay nada acá.'}</div>}
        {lista.map((a, i) => {
          const llego = llegoEn(parque, a)
          const mov = parque.movsDe.get(a.id)?.find((m) => m.destino_id === u.id)
          const quien = mov ? autorDe(parque, mov) : null
          const tono = COLOR_TONO[TONO_ESTADO[a.estado]]
          const carga = a.clase === 'rodado' ? parque.ubicaciones.find((x) => x.activo_id === a.id) : null
          const lleva = carga ? activosEn(parque, carga.id).length : 0
          return (
            <Link key={a.id} href={`/herramientas/inventario?clase=todo&activo=${encodeURIComponent(a.codigo)}`} prefetch={false} className="hover:bg-surface-quiet"
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 48, alignItems: 'center', borderBottom: i < lista.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                {a.clase === 'rodado' && <IcoRodado tam={14} />}
                <span style={{ fontWeight: 500 }}>{a.nombre}</span>
                <span style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>{a.patente ?? a.codigo}</span>
              </div>
              <div style={a.clase === 'rodado' ? { color: V.tintaSuave } : a.categoria ? { color: V.tintaSuave } : vacio}>
                {a.clase === 'rodado' ? 'Rodado' : a.categoria ?? 'sin categoría'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tono }}>
                {a.estado !== 'fuera_servicio' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: tono, flexShrink: 0 }} />}
                {ETIQUETA_ESTADO_CORTA[a.estado]}
              </div>
              <div style={llego ? { color: V.tintaSuave } : vacio}>{llego ? diaMes(llego) : 'sin registro'}</div>
              <div style={{ textAlign: 'right', ...(quien || lleva ? { color: V.apagado } : vacio) }}>
                {a.clase === 'rodado' ? `lleva ${lleva}` : quien ?? 'sin registro'}
              </div>
            </Link>
          )
        })}
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        {lista.length} de {aca.length}{aca.some((a) => a.clase === 'rodado') ? ' · el rodado va primero' : ''}.
        {u.tipo === 'obra' && aca.length > 0 && ` Si la obra deja de estar activa, la base manda ${aca.length === 1 ? 'éste' : `los ${aca.length}`} al Taller.`}
      </div>
    </>
  )
}
