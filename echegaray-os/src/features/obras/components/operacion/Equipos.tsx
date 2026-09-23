'use client'

// 11 · M14 — EQUIPOS: qué hay en obra ahora y cómo llegó, del modelo nuevo de Herramientas.
//
// Escritorio (11): dos columnas `minmax(0,1.15fr) minmax(0,1fr)` con `gap 52`. Izquierda «Qué hay en
// obra ahora» —Herramienta · Código · Desde · Estado, filas de 52, «En obra» en verde y el problema en
// warn con borde—; derecha «Cómo llegó» —Fecha · Herramienta · Desde · Quién—. Teléfono (M14): «En obra»
// y «Últimos movimientos» con eyebrow, conteo y filas de 60.
//
// 11b (detalle de un equipo en la obra) NO TIENE FRAGMENTO: se diseña con `diseno-ui-ux-producto-os`
// —Figma: panel para la entidad, sin navegar— como la fila desplegada en el lugar: código, clase,
// estado, cuándo y de dónde entró, sus viajes que tocan esta obra, y el enlace a Herramientas.
// 11c (mover/trasladar) TAMPOCO: la escritura ya existe en Herramientas (`mover_activo`), con su
// pantalla, su validación y su RLS. Duplicar el formulario acá sería una segunda puerta al mismo
// dato; la fila desplegada enlaza a esa pantalla. Declarado en el informe.

import { useState } from 'react'
import Link from 'next/link'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import type { EquiposDeObra } from '../../services/equiposDeObraService'
import {
  diaMes, estadoActivoEnObra, sublineaActivo, sublineaMovimiento, tituloMovimiento,
} from '../../services/operacionCanon'
import { Celda, DerechaM, Eyebrow, Falta, FilaM, GridCab, GridFila, TituloBloque } from './piezas'

const COLS_OBRA = 'minmax(0,1fr) 116px 108px 96px'
const COLS_MOV = '88px minmax(0,1fr) 108px 108px'

export function Equipos({ equipos, nombreObra }: { equipos: EquiposDeObra; nombreObra: string }) {
  const [sel, setSel] = useState<string | null>(null)
  const entradas = equipos.movimientos.filter((m) => m.sentido === 'entro')
  const nada = equipos.sinUbicacion ? 'Esta obra todavía no tiene ubicación en Herramientas: nada puede figurar acá.'
    : equipos.enObra.length === 0 ? 'Ningún activo figura hoy en esta obra.' : null

  return (
    <>
      {/* ═══ ESCRITORIO (11) ═══ */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: '52px', alignItems: 'start' }}
        data-testid="equipos-escritorio">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <TituloBloque titulo="Qué hay en obra ahora" meta={`${equipos.enObra.length} herramientas con ubicación ${nombreObra}`} />
          <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="tabla-en-obra">
            <GridCab columnas={COLS_OBRA} gap={18} alto={32} celdas={[{ t: 'Herramienta' }, { t: 'Código' }, { t: 'Desde' }, { t: 'Estado' }]} />
            {nada && <div style={{ padding: '18px 0', fontSize: '13px', color: C.tenue }} data-testid="equipos-vacio">{nada}</div>}
            {equipos.enObra.map((a, i) => {
              const e = estadoActivoEnObra(a.estado)
              const abierto = sel === a.id
              return (
                <div key={a.id}>
                  <GridFila columnas={COLS_OBRA} gap={18} alto={52} ultima={i === equipos.enObra.length - 1 && !abierto}
                    bordeIzq={e.problema ? C.warn : null} sangria={12} onClick={() => setSel(abierto ? null : a.id)}
                    testid={`activo-${a.id}`} seleccionada={abierto}>
                    <Celda>{a.nombre}</Celda>
                    <Celda tono="suave" sub mono>{a.codigo}</Celda>
                    <Celda tono="suave">{diaMes(a.desde) ?? '—'}</Celda>
                    <Celda tono={e.tono} sub>{e.texto}</Celda>
                  </GridFila>
                  {abierto && <DetalleActivo id={a.id} equipos={equipos} />}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <TituloBloque titulo="Cómo llegó" meta="movimientos hacia esta obra" />
          <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="tabla-como-llego">
            <GridCab columnas={COLS_MOV} gap={18} alto={32} celdas={[{ t: 'Fecha' }, { t: 'Herramienta' }, { t: 'Desde' }, { t: 'Quién' }]} />
            {entradas.length === 0 && <div style={{ padding: '18px 0', fontSize: '13px', color: C.tenue }}>Ningún movimiento hacia esta obra registrado.</div>}
            {entradas.map((m, i) => (
              <GridFila key={m.id} columnas={COLS_MOV} gap={18} alto={52} ultima={i === entradas.length - 1} sangria={0} testid={`movimiento-${m.id}`}>
                <Celda tono="suave">{diaMes(m.fechaHora.slice(0, 10))}</Celda>
                <Celda>{m.activoNombre}</Celda>
                <Celda tono="media">{m.otroLugar ?? <Falta>sin registrar</Falta>}</Celda>
                <Celda tono="media">{m.quien ?? <Falta>sin registrar</Falta>}</Celda>
              </GridFila>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ TELÉFONO (M14) ═══ */}
      <div className="flex md:hidden" style={{ flexDirection: 'column', gap: '14px' }} data-testid="equipos-telefono">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Eyebrow derecha={equipos.enObra.length}>En obra</Eyebrow>
          {nada && <div style={{ padding: '14px 0', fontSize: '13px', color: C.tenue }}>{nada}</div>}
          {equipos.enObra.map((a, i) => {
            const abierto = sel === a.id
            return (
              <div key={a.id}>
                <FilaM icono={<Ico d={P.equipo} s={15} />} titulo={a.nombre} sub={sublineaActivo(a)}
                  derecha={<DerechaM fecha={diaMes(a.desde) ?? '—'} />} ultima={i === equipos.enObra.length - 1 && !abierto}
                  onClick={() => setSel(abierto ? null : a.id)} testid={`activo-telefono-${a.id}`} />
                {abierto && <DetalleActivo id={a.id} equipos={equipos} />}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Eyebrow derecha={equipos.movimientos.length}>Últimos movimientos</Eyebrow>
          {equipos.movimientos.length === 0 && <div style={{ padding: '14px 0', fontSize: '13px', color: C.tenue }}>Ningún movimiento registrado.</div>}
          {equipos.movimientos.map((m, i) => (
            <FilaM key={m.id} icono={<Ico d={P.equipo} s={15} />} titulo={tituloMovimiento(m)} sub={sublineaMovimiento(m)}
              derecha={<DerechaM fecha={diaMes(m.fechaHora.slice(0, 10))} />} ultima={i === equipos.movimientos.length - 1}
              testid={`movimiento-telefono-${m.id}`} />
          ))}
        </div>
      </div>
    </>
  )
}

/** 11b, diseñado con la skill: la fila desplegada del equipo en la obra. Sólo hechos del modelo. */
function DetalleActivo({ id, equipos }: { id: string; equipos: EquiposDeObra }) {
  const a = equipos.enObra.find((x) => x.id === id)
  if (!a) return null
  const e = estadoActivoEnObra(a.estado)
  const viajes = equipos.movimientos.filter((m) => m.activoId === a.id)
  const dato = (k: string, v: React.ReactNode) => (
    <span style={{ whiteSpace: 'nowrap' }}><span style={{ color: C.tenue }}>{k}: </span>{v}</span>
  )
  return (
    <div data-testid="detalle-activo" style={{
      display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0 14px', borderBottom: `1px solid ${C.borde}`,
      fontSize: '12.5px', color: C.tintaMedia,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'center' }}>
        {dato('Código', <span style={{ fontFamily: MONO }}>{a.codigo}</span>)}
        {dato('Estado', <span style={{ color: e.tono === 'pos' ? C.pos : C.warn }}>{e.texto}</span>)}
        {dato('Entró', a.desde ? `${diaMes(a.desde)} · ${sublineaActivo(a)}` : <Falta>sin movimiento registrado</Falta>)}
        <Link href="/herramientas/movimientos" prefetch={false} data-testid="ir-a-mover"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', color: C.tintaMedia, whiteSpace: 'nowrap' }}>
          Mover desde Herramientas <Ico d={P.flecha} s={12} />
        </Link>
      </div>
      {viajes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {viajes.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
              <span style={{ fontFamily: MONO, color: C.tenue, width: '44px', flexShrink: 0 }}>{diaMes(m.fechaHora.slice(0, 10))}</span>
              <span>{tituloMovimiento(m)}</span>
              <span style={{ color: C.tenue }}>{sublineaMovimiento(m)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
