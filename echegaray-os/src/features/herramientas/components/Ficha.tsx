'use client'

// LA FICHA DE UN ACTIVO (D02, lado derecho): qué es, dónde está, cómo está, qué hacer, qué le pasó.
//
// Las acciones dependen del estado y no del rol (permisos iguales para todos, dueño 21/09):
//   · con problema y fuera del Taller → «Mover al taller» es la primaria;
//   · con problema → «Enviar a reparación externa» (etapa 1: es un ESTADO; el remito y el presupuesto
//     son etapa 2) y «Marcar operativa»;
//   · operativa → «Mover» y «Reportar problema».
// La baja es texto rojo abajo: la única acción que no se deshace no compite con las demás.

import Link from 'next/link'
import { useState } from 'react'
import { historial } from '../logica/historial'
import {
  ETIQUETA_ESTADO, MOTIVO_BAJA, TONO_ESTADO, conProblema, rotuloUbicacion, tipoDe, ubicacionDelRodado, activosEn,
} from '../logica/parque'
import { cambiarEstadoAction } from '../services/acciones'
import { useHerramientas } from './Espacio'
import { QR } from './QR'
import { COLOR_TONO, eyebrow, MONO, SUPERFICIE, V, vacio } from './estilo'
import { diaMes, diaMesAnio, mesAnio, pesos } from './formato'

const btn = (primario: boolean) => ({
  height: 32, padding: '0 13px', borderRadius: 6, fontSize: '12.5px', cursor: 'pointer',
  border: primario ? 0 : `1px solid ${V.lineaFuerte}`, background: primario ? V.marca : '#FFFFFF',
  color: primario ? V.grafito : V.tinta, fontWeight: primario ? 600 : 400,
})

export function Ficha({ id, onCerrar }: { id: string; onCerrar?: () => void }) {
  const { parque, abrir, avisar, refrescar } = useHerramientas()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const a = parque.activoPorId.get(id)
  if (!a) return null
  const taller = parque.ubicaciones.find((u) => u.tipo === 'taller' && !u.archivada)
  const enTaller = tipoDe(parque, a.ubicacion_id) === 'taller'
  const problema = conProblema(a)
  const quienEstado = a.estado_por ? parque.nombres[a.estado_por] : null
  const renglones = historial(parque, a.id)
  const ultimaInc = parque.incDe.get(a.id)?.find((i) => !i.cerrada_en)
  const carga = a.clase === 'rodado' ? (() => { const u = ubicacionDelRodado(parque, a.id); return u ? activosEn(parque, u.id) : [] })() : []

  async function estado(e: 'operativo' | 'reparacion_externa') {
    setEnviando(true)
    setError(null)
    const r = await cambiarEstadoAction({ activo: id, estado: e })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    avisar(`${a!.nombre}: ${e === 'operativo' ? 'marcada operativa' : 'en reparación externa'}.`)
    refrescar()
  }

  const compra = [
    a.compra_fecha ? `Comprada ${mesAnio(a.compra_fecha)}` : null,
    a.compra_precio != null ? pesos(a.compra_precio) : null,
    a.numero_serie ? `serie ${a.numero_serie}` : null,
  ].filter(Boolean)

  return (
    <div data-testid="ficha-activo" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em', color: a.estado === 'baja' ? V.tenue : V.tinta }}>{a.nombre}</div>
          <div style={{ fontSize: '12.5px', color: V.apagado }}>
            <span style={{ fontFamily: MONO }}>{a.codigo}</span>
            {a.patente ? ` · ${a.patente}` : ''} · {a.categoria ?? <span style={vacio}>sin categoría</span>} · {a.ubicacion_id ? `en ${rotuloUbicacion(parque, a.ubicacion_id)}` : <span style={vacio}>sin ubicación cargada</span>}
          </div>
        </div>
        {/* «Editar datos» y la × van en la misma fila, una al lado de la otra: con la × flotando
            encima se tapaban (dueño, 22/09). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {a.estado !== 'baja' && (
            <button type="button" onClick={() => abrir({ tipo: 'editar', id })} style={{ fontSize: '12.5px', color: V.apagado, whiteSpace: 'nowrap' }} data-testid="editar-ficha">
              Editar datos
            </button>
          )}
          {onCerrar && (
            <button type="button" onClick={onCerrar} aria-label="Cerrar la ficha" data-testid="cerrar-ficha"
              style={{ width: 28, height: 28, borderRadius: 6, fontSize: '18px', lineHeight: 1, color: V.tenue, border: `1px solid ${V.linea}` }}>×</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 118, height: 88, border: `1px solid ${V.linea}`, borderRadius: 6, background: SUPERFICIE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px', color: V.tenue, overflow: 'hidden', flexShrink: 0 }}>
          {a.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto pública del bucket `herramientas`, tamaño libre
            <img src={a.foto_url} alt={a.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : 'sin foto'}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: `1px solid ${V.linea}`, borderRadius: 6, background: SUPERFICIE }}>
            <div style={{ width: 26, height: 26, border: `1px solid ${V.lineaFuerte}`, borderRadius: 3, background: '#FFFFFF', padding: 1, flexShrink: 0 }}>
              <QR codigo={a.codigo} lado={22} margen={0} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
              <span>{a.etiqueta_impresa_en ? `Etiqueta impresa el ${diaMesAnio(a.etiqueta_impresa_en)}` : 'Sin etiqueta impresa'}</span>
              {a.estado !== 'baja' && (
                <Link href={`/herramientas/etiquetas?codigos=${encodeURIComponent(a.codigo)}`} prefetch={false} style={{ color: '#175CD3' }}>
                  {a.etiqueta_impresa_en ? 'Reimprimir etiqueta' : 'Imprimir etiqueta'}
                </Link>
              )}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: V.apagado }}>
            {compra.length ? compra.join(' · ') : <span style={vacio}>compra sin cargar</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={eyebrow}>Estado</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: COLOR_TONO[TONO_ESTADO[a.estado]] }}>
            {a.estado === 'baja' ? `Baja por ${MOTIVO_BAJA[a.baja_motivo ?? ''] ?? '—'}` : ETIQUETA_ESTADO[a.estado]}
          </span>
          <span style={{ fontSize: '12px', color: V.apagado }}>
            {a.estado_asumido ? 'asumido al importar · nadie lo revisó' : `desde el ${diaMes(a.estado_desde)}${quienEstado ? ` · ${quienEstado}` : ''}`}
          </span>
        </div>
        {(ultimaInc?.texto || a.estado_nota) && (
          <div style={{ fontSize: '13px', color: V.tintaSuave, lineHeight: 1.5, borderLeft: `2px solid ${V.linea}`, paddingLeft: 12 }}>
            «{ultimaInc?.texto ?? a.estado_nota}»
          </div>
        )}
        {a.estado !== 'baja' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
            {problema && !enTaller && taller && (
              <button type="button" style={btn(true)} onClick={() => abrir({ tipo: 'mover', ids: [id], destino: `u:${taller.id}` })} data-testid="mover-al-taller">Mover al taller</button>
            )}
            {!(problema && !enTaller && taller) && (
              <button type="button" style={btn(true)} onClick={() => abrir({ tipo: 'mover', ids: [id] })} data-testid="mover-activo">Mover</button>
            )}
            {problema && a.estado !== 'reparacion_externa' && (
              <button type="button" disabled={enviando} style={btn(false)} onClick={() => estado('reparacion_externa')}>Enviar a reparación externa</button>
            )}
            {problema && <button type="button" disabled={enviando} style={btn(false)} onClick={() => estado('operativo')} data-testid="marcar-operativa">Marcar operativa</button>}
            {!problema && <button type="button" style={btn(false)} onClick={() => abrir({ tipo: 'reportar', ids: [id] })}>Reportar problema</button>}
            {a.estado_asumido && !problema && (
              <button type="button" disabled={enviando} style={btn(false)} onClick={() => estado('operativo')} data-testid="confirmar-operativa">Confirmar operativa</button>
            )}
          </div>
        )}
        {error && <div role="alert" style={{ fontSize: '12.5px', color: V.neg }}>{error}</div>}
      </div>

      {a.clase === 'rodado' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }}>
          <div style={{ ...eyebrow, paddingTop: 10 }}>Lleva encima</div>
          {carga.length === 0 ? <div style={{ fontSize: '12.5px', color: V.tenue }}>Nada cargado.</div> : carga.map((c) => (
            <div key={c.id} style={{ fontSize: '12.5px', color: V.tintaSuave }}>{c.nombre} <span style={{ fontFamily: MONO, color: V.tenue }}>{c.codigo}</span></div>
          ))}
          <div style={{ fontSize: '12px', color: V.apagado }}>Km, papeles, service y verificación: <span style={vacio}>sin cargar</span>.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, borderTop: `1px solid ${V.linea}` }}>
        <div style={{ ...eyebrow, paddingTop: 10 }}>Historial</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '12.5px' }} data-testid="historial">
          {renglones.map((r, i) => (
            <div key={`${r.fecha}-${i}`} style={{ display: 'grid', gridTemplateColumns: '76px minmax(0,1fr)', gap: 12 }}>
              <div style={{ color: V.tenue }}>{diaMesAnio(r.fecha)}</div>
              <div style={{ color: V.tintaSuave }}>
                {r.texto}
                {r.tipo === 'reporte' && <span style={{ color: V.tenue }}> · la ubicación no cambió</span>}
                {r.nota && <div style={{ color: V.tenue }}>{r.nota}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {a.estado !== 'baja' && (
        <div style={{ paddingTop: 6 }}>
          <button type="button" onClick={() => abrir({ tipo: 'baja', id })} style={{ fontSize: '12.5px', color: V.neg }} data-testid="abrir-baja">Dar de baja…</button>
        </div>
      )}
    </div>
  )
}
