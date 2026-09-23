'use client'

// D04 · EL LUGAR ELEGIDO EN UBICACIONES — lo que hay, y LAS MISMAS ACCIONES QUE EL TELÉFONO PARADO AHÍ
// (M01): «Mover» (lo marcado, o todo), «Reportar un problema» (lo marcado), «Verificar el rodado …» /
// «Verificar …» por cada rodado o máquina que está acá (o elegirlo de la lista si no hay ninguno) y
// «Dar de alta una herramienta» (entra en este lugar) y «Recuento del lugar» (M05 «Control físico»,
// 23/09: contar todo contra lo esperado y cerrar ajustando o guardando la evidencia). Paridad funcional,
// dueño 23/09/2026: «en app mobile encontré módulos que en compu no están». Los rótulos salen de
// `logica/acciones-lugar`. Los recuentos cerrados del lugar se listan abajo, del más nuevo al más viejo.
//
// Es cliente porque marca casillas y abre paneles; el parque lo toma del espacio de trabajo (el mismo
// objeto que miran los paneles). «Planilla» queda sólo acá: imprimir es de escritorio.

import Link from 'next/link'
import { useState } from 'react'
import { ACCION, rotuloQueHay, rotuloVerificar, textoMoverDelLugar, verificablesDelLugar, verificablesDelParque } from '../logica/acciones-lugar'
import {
  ETIQUETA_ESTADO_CORTA, TONO_ESTADO, activosEn, autorDe, cantidadEn, conProblema, diasDesde, llegoEn, rotuloUbicacion,
} from '../logica/parque'
import type { TipoUbicacion } from '../types'
import { textoVerificacion, verificacionDe } from '../logica/verificacion'
import { lineasDe, recuentoAbierto, recuentosDelLugar, resumenCerrado, textoResumen } from '../logica/recuento'
import { useHerramientas } from './Espacio'
import { IcoFlecha, IcoRodado } from './iconos'
import { COLOR_TONO, MONO, SUPERFICIE, V, botonPrimario, botonSecundario, eyebrow, vacio } from './estilo'
import { diaMes, fechaHora } from './formato'

export type FiltroLugar = 'todo' | 'problema' | 'viejas'

const COLS = '24px minmax(0,1.6fr) 130px 160px 110px 140px'
const SINGULAR: Record<TipoUbicacion, string> = {
  taller: 'Taller', obra: 'Obra', rodado: 'Rodado', servicio_tecnico: 'Servicio técnico', tercero: 'Tercero',
}

export function DetalleLugar({ ubicacionId, filtro }: { ubicacionId: string; filtro: FiltroLugar }) {
  const { parque, abrir } = useHerramientas()
  const [sel, setSel] = useState<string[]>([])
  const hoy = new Date()
  const u = parque.ubicacionPorId.get(ubicacionId)
  if (!u) return null
  const aca = activosEn(parque, u.id).sort((a, b) => Number(b.clase === 'rodado') - Number(a.clase === 'rodado') || a.nombre.localeCompare(b.nombre, 'es'))
  const viejo = (id: string) => { const l = llegoEn(parque, parque.activoPorId.get(id)!, u.id); return l ? diasDesde(l, hoy) > 60 : false }
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
  const unidadesAca = aca.reduce((s, a) => s + cantidadEn(parque, a.id, u.id), 0)
  const filtros: { v: FiltroLugar; t: string; n: number; warn?: boolean }[] = [
    { v: 'todo', t: 'Todo', n: aca.length },
    { v: 'problema', t: 'Con problema', n: conProb, warn: true },
    { v: 'viejas', t: 'Hace +60 días acá', n: aca.filter((a) => viejo(a.id)).length },
  ]
  // Lo marcado que sigue acá (si la lista se refrescó, lo que ya no está no se mueve).
  const marcadas = sel.filter((id) => aca.some((a) => a.id === id))
  const idsMover = marcadas.length ? marcadas : aca.map((a) => a.id)
  const verificables = verificablesDelLugar(parque, u.id)
  const paraElegir = verificables.length === 0 ? verificablesDelParque(parque) : []
  const marcar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((y) => y !== id) : [...s, id]))
  const recuentos = recuentosDelLugar(parque.recuentos, u.id)
  const abiertoRec = recuentoAbierto(parque.recuentos, u.id)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '12.5px', color: V.apagado }}>{encima}</div>
          <h2 style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 8 }} data-testid="titulo-lugar">
            {u.tipo === 'rodado' && <IcoRodado tam={16} />}{rotuloUbicacion(parque, u.id)}
          </h2>
          <div style={{ fontSize: '13px', color: V.apagado }}>
            {aca.length} {aca.length === 1 ? 'activo' : 'activos'}{unidadesAca !== aca.length ? ` · ${unidadesAca} unidades` : ''}{conProb ? ` · ${conProb} con problema` : ''}
          </div>
        </div>
        {/* Sólo escritorio: imprimir la planilla del lugar. En el teléfono no hay impresora. */}
        <Link href={`/herramientas/planilla?u=${u.id}`} prefetch={false} data-testid="ver-planilla" style={botonSecundario}>
          Planilla
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} data-testid="acciones-del-lugar">
        <button type="button" data-testid="mover-desde-aca" disabled={aca.length === 0} onClick={() => abrir({ tipo: 'mover', ids: idsMover, origen: u.id })}
          style={{ ...botonPrimario, opacity: aca.length ? 1 : 0.45 }}>
          <IcoFlecha tam={13} />{textoMoverDelLugar(marcadas.length, aca.length)}
        </button>
        <button type="button" data-testid="reportar-desde-aca" disabled={marcadas.length === 0} onClick={() => abrir({ tipo: 'reportar', ids: marcadas })}
          title={marcadas.length ? undefined : 'Marcá cuál en la lista'} style={{ ...botonSecundario, opacity: marcadas.length ? 1 : 0.55 }}>
          {ACCION.reportar}{marcadas.length > 1 ? ` · ${marcadas.length}` : ''}
        </button>
        {verificables.map((a) => {
          const v = verificacionDe(parque, a.id, hoy)
          return (
            <button key={a.id} type="button" data-testid="verificar-desde-aca" onClick={() => abrir({ tipo: 'verificar', id: a.id })} style={botonSecundario}>
              {rotuloVerificar(a)}
              <span style={{ fontSize: '11.5px', color: v.tipo === 'hoy' ? V.pos : V.apagado }}>
                {v.tipo === 'hoy' ? `hecha ${textoVerificacion(v)}` : v.tipo === 'sin_base' ? 'sin la migración' : `última: ${textoVerificacion(v)}`}
              </span>
            </button>
          )
        })}
        {paraElegir.length > 0 && (
          <select aria-label={ACCION.verificarElegir} value="" data-testid="verificar-elegir" onChange={(e) => { if (e.target.value) abrir({ tipo: 'verificar', id: e.target.value }) }}
            style={{ ...botonSecundario, paddingRight: 10, color: V.tintaSuave }}>
            <option value="">{ACCION.verificarElegir}…</option>
            {paraElegir.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.patente ? ` ${a.patente}` : ''} · {rotuloUbicacion(parque, a.ubicacion_id)}</option>)}
          </select>
        )}
        <button type="button" data-testid="nuevo-activo" onClick={() => abrir({ tipo: 'alta', destino: `u:${u.id}` })} style={botonSecundario}>
          {ACCION.alta}
        </button>
        <button type="button" data-testid="recuento-desde-aca" disabled={aca.length === 0} onClick={() => abrir({ tipo: 'recuento', ubicacionId: u.id })}
          title={aca.length ? undefined : 'No hay nada registrado acá: no hay qué contar'} style={{ ...botonSecundario, opacity: aca.length ? 1 : 0.55 }}>
          {ACCION.recuento}
          <span style={{ fontSize: '11.5px', color: abiertoRec ? V.warn : V.apagado }}>
            {parque.recuentos == null ? 'sin la migración' : abiertoRec ? `abierto desde el ${diaMes(abiertoRec.iniciado_en)}` : recuentos[0] ? `último: ${diaMes(recuentos[0].cerrado_en!)}` : 'nunca'}
          </span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '12.5px', paddingBottom: 4 }}>
        <span style={{ ...eyebrow, marginRight: 4 }}>{rotuloQueHay(u.tipo === 'obra')}</span>
        {filtros.map((f) => {
          const on = f.v === filtro
          return (
            <Link key={f.v} href={`/herramientas/ubicaciones?u=${u.id}${f.v === 'todo' ? '' : `&f=${f.v}`}`} prefetch={false}
              style={{ fontWeight: on ? 500 : 400, color: on ? V.tinta : f.warn && f.n ? V.warn : V.apagado, boxShadow: on ? `inset 0 -1.5px 0 ${V.grafito}` : 'none', paddingBottom: 2 }}>
              {f.t} <span style={{ color: V.tenue, fontWeight: 400 }}>{f.n}</span>
            </Link>
          )
        })}
        {aca.length > 0 && (
          <button type="button" onClick={() => setSel(marcadas.length === aca.length ? [] : aca.map((a) => a.id))} style={{ marginLeft: 'auto', color: V.apagado, textDecoration: 'underline' }} data-testid="marcar-todas">
            {marcadas.length === aca.length ? 'Ninguna' : 'Todas'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="activos-del-lugar">
        <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 36, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
          <div /><div>Activo</div><div>Categoría</div><div>Estado</div><div>Llegó</div><div style={{ textAlign: 'right' }}>Quién lo trajo</div>
        </div>
        {lista.length === 0 && <div style={{ fontSize: '13px', color: V.tenue, padding: '14px 0' }}>{aca.length ? 'Nada con este filtro.' : 'No hay nada acá.'}</div>}
        {lista.map((a, i) => {
          const llego = llegoEn(parque, a, u.id)
          const aqui = cantidadEn(parque, a.id, u.id)
          const mov = parque.movsDe.get(a.id)?.find((m) => m.destino_id === u.id)
          const quien = mov ? autorDe(parque, mov) : null
          const tono = COLOR_TONO[TONO_ESTADO[a.estado]]
          const carga = a.clase === 'rodado' ? parque.ubicaciones.find((x) => x.activo_id === a.id) : null
          const lleva = carga ? activosEn(parque, carga.id).length : 0
          const on = marcadas.includes(a.id)
          return (
            <div key={a.id} className="hover:bg-surface-quiet"
              style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 48, alignItems: 'center', borderBottom: i < lista.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px', background: on ? SUPERFICIE : undefined }}>
              <input type="checkbox" checked={on} onChange={() => marcar(a.id)} aria-label={`Marcar ${a.nombre}`} style={{ width: 16, height: 16, accentColor: V.grafito }} />
              <Link href={`/herramientas/inventario?clase=todo&activo=${encodeURIComponent(a.codigo)}`} prefetch={false} style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                {a.clase === 'rodado' && <IcoRodado tam={14} />}
                <span style={{ fontWeight: 500 }}>{a.nombre}</span>
                {a.cantidad > 1 && <span data-testid="cantidad-lugar" style={{ padding: '1px 6px', borderRadius: 4, background: V.hover, fontSize: '11.5px', color: V.tintaSuave, fontWeight: 500 }}>× {aqui}{aqui !== a.cantidad ? ` de ${a.cantidad}` : ''}</span>}
                <span style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>{a.patente ?? a.codigo}</span>
              </Link>
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
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        {lista.length} de {aca.length}{aca.some((a) => a.clase === 'rodado') ? ' · el rodado va primero' : ''}.
        {u.tipo === 'obra' && aca.length > 0 && ` Si la obra deja de estar activa, la base manda ${aca.length === 1 ? 'éste' : `los ${aca.length}`} al Taller.`}
      </div>

      {recuentos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: `1px solid ${V.linea}` }} data-testid="recuentos-del-lugar">
          <div style={{ ...eyebrow, paddingTop: 8 }}>Recuentos del lugar</div>
          {recuentos.slice(0, 8).map((r) => {
            const res = resumenCerrado(lineasDe(parque.recuentoLineas, r.id))
            const quien = r.cerrado_por ? parque.nombres[r.cerrado_por] : null
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 12, fontSize: '12.5px' }} data-testid="recuento-cerrado">
                <div style={{ color: V.tenue }}>{fechaHora(r.cerrado_en!)}</div>
                <div style={{ color: V.tintaSuave }}>
                  {textoResumen(res)} de {res.total} · <span style={{ color: r.aplicado ? V.pos : res.conDiferencia ? V.warn : V.apagado }}>{r.aplicado ? 'inventario ajustado' : 'guardado sin ajustar'}</span>{quien ? ` · ${quien}` : ''}
                  {r.observaciones && <div style={{ color: V.tenue }}>{r.observaciones}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
