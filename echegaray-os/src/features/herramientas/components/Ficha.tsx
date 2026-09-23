'use client'

// LA FICHA DE UN ACTIVO (D02, lado derecho): qué es, dónde está, cómo está, qué hacer, qué le pasó.
//
// Las acciones dependen del estado y no del rol (permisos iguales para todos, dueño 21/09):
//   · con problema y fuera del Taller → «Mover al taller» es la primaria;
//   · con problema → «Enviar a reparación externa» (etapa 1: es un ESTADO; el remito y el presupuesto
//     son etapa 2) y «Marcar operativa»;
//   · operativa → «Mover» y «Reportar un problema» (los nombres del teléfono, M03).
// La baja es texto rojo abajo: la única acción que no se deshace no compite con las demás.

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ACCION } from '../logica/acciones-lugar'
import { historial, operadorDe } from '../logica/historial'
import type { Activo } from '../types'
import {
  UNIDAD, seVerifica, textoLectura, textoVerificacion, ultimaLectura, ultimaVerificacion, verificacionDe,
} from '../logica/verificacion'
import {
  ETIQUETA_ESTADO, MOTIVO_BAJA, TONO_ESTADO, conProblema, lugaresDe, rotuloLugares, rotuloUbicacion, tipoDe, ubicacionDelRodado, activosEn,
} from '../logica/parque'
import { NOMBRE_PAPEL, enlaceDrive, estadoDePapel, papelesDe, type Papel } from '../logica/papeles'
import { ajustarExistenciaAction, cambiarEstadoAction } from '../services/acciones'
import { useHerramientas } from './Espacio'
import { QR } from './QR'
import { ResumenRevision } from './FichaRevision'
import { Unidades } from './Unidades'
import { SacarFoto } from './campo/SacarFoto'
import { AZUL, COLOR_TONO, eyebrow, MONO, SUPERFICIE, V, vacio } from './estilo'
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
            {a.patente ? ` · ${a.patente}` : ''} · {a.categoria ?? <span style={vacio}>sin categoría</span>} · {a.ubicacion_id ? `en ${a.estado === 'baja' ? rotuloUbicacion(parque, a.ubicacion_id) : rotuloLugares(parque, a)}` : <span style={vacio}>sin ubicación cargada</span>}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, width: 118 }}>
          <div style={{ width: 118, height: 88, border: `1px solid ${V.linea}`, borderRadius: 6, background: SUPERFICIE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px', color: V.tenue, overflow: 'hidden' }}>
          {a.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto pública del bucket `herramientas`, tamaño libre
            <img src={a.foto_url} alt={a.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : 'sin foto'}
          </div>
          {/* La misma pieza que «Sacar una foto» en el teléfono (M03): la foto de la ficha se cambia desde las dos caras. */}
          {a.estado !== 'baja' && <SacarFoto activo={a.id} variante="escritorio" onGuardada={refrescar} tieneFoto={!!a.foto_url} />}
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

      {a.estado !== 'baja' && a.cantidad > 1 && <Reparto id={a.id} />}
      {/* Códigos por unidad del lote (23/09): se piden cuando hacen falta, nunca los 580 de golpe. */}
      <Unidades activo={a} unidades={parque.unidades} onHecho={refrescar} />

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
            {!problema && <button type="button" style={btn(false)} onClick={() => abrir({ tipo: 'reportar', ids: [id] })}>{ACCION.reportar}</button>}
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
          <div style={{ fontSize: '12px', color: V.apagado }}>Plan de service: <span style={vacio}>sin cargar</span>.</div>
        </div>
      )}

      <Papeles id={a.id} clase={a.clase} />

      <ResumenRevision id={a.id} />

      {seVerifica(a) && <Uso id={a.id} clase={a.clase} />}

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

/**
 * LOS PAPELES DE LA UNIDAD (migración 20260922T2400). Cada papel con lo que DICE —tipo, número, emisor,
 * titular, emisión, vencimiento— y el PDF de Drive del que salió, para que cualquiera pueda ir a mirar el
 * original en vez de creerle a la pantalla. Un campo que el papel no trae no se dibuja: no hay «—» que
 * después alguien lea como «no tiene seguro».
 *
 * El titular se muestra tal cual figura: la F100 y una de las Hilux están a nombre de personas, no de la
 * empresa, y eso es un dato del papel, no un error que la pantalla deba esconder.
 */
function Papeles({ id, clase }: { id: string; clase: Activo['clase'] }) {
  const { parque } = useHerramientas()
  // Sin la vista, el aviso sólo tiene sentido donde hay papeles que cargar: 178 herramientas de mano no
  // tienen título ni RTO, y repetir el aviso en cada una lo convierte en ruido que nadie lee.
  if (!parque.papeles) {
    if (clase === 'herramienta') return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-papeles">
        <div style={{ ...eyebrow, paddingTop: 10 }}>Papeles</div>
        <div style={{ fontSize: '12.5px', color: V.tenue }}>Falta aplicar la migración 20260922T2400 de los papeles.</div>
      </div>
    )
  }
  const papeles = papelesDe(parque.papeles, id)
  if (papeles.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-papeles">
      <div style={{ ...eyebrow, paddingTop: 10 }}>Papeles</div>
      {papeles.map((p) => <UnPapel key={p.id} p={p} />)}
    </div>
  )
}

/** Un papel del rodado, con su vencimiento y su enlace a Drive. Lo usa también la ficha del teléfono. */
export function UnPapel({ p }: { p: Papel }) {
  const e = estadoDePapel(p)
  const color = e.tono === 'neg' ? V.neg : e.tono === 'warn' ? V.warn : e.tono === 'pos' ? V.pos : V.tenue
  const enlace = enlaceDrive(p)
  const detalle = [
    p.numero ? `N° ${p.numero}` : null,
    p.emisor,
    p.titular ? `a nombre de ${p.titular}` : null,
    p.emitido_en ? `emitido ${diaMesAnio(p.emitido_en)}` : null,
  ].filter(Boolean)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '12.5px' }} data-testid="ficha-papel">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontWeight: 500 }}>{NOMBRE_PAPEL[p.tipo]}</span>
        <span style={{ color, textAlign: 'right' }}>{e.texto}</span>
      </div>
      {detalle.length > 0 && <div style={{ color: V.apagado }}>{detalle.join(' · ')}</div>}
      {p.observacion && <div style={{ color: V.tenue }}>{p.observacion}</div>}
      {enlace ? (
        <a href={enlace} target="_blank" rel="noreferrer" style={{ color: '#175CD3' }} data-testid="papel-drive">
          {p.drive_nombre ?? 'Ver el PDF en Drive'}
        </a>
      ) : (
        <span style={vacio}>sin archivo en Drive</span>
      )}
    </div>
  )
}

/** D03 «Uso»: el km (u horas) de la última lectura y la última verificación, con quién la hizo. Verificar abre el panel (el mismo M10/M13 del teléfono). */
function Uso({ id, clase }: { id: string; clase: 'rodado' | 'equipo' }) {
  const { parque, abrir } = useHerramientas()
  const fila = (rotulo: string, valor: ReactNode, testid?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '12.5px' }} data-testid={testid}>
      <span style={{ color: V.apagado }}>{rotulo}</span><span style={{ textAlign: 'right' }}>{valor}</span>
    </div>
  )
  const sinBase = !parque.lecturas
  const l = ultimaLectura(parque, id)
  const ult = ultimaVerificacion(parque, id)
  const quien = ult ? operadorDe(parque, ult) : null
  const v = verificacionDe(parque, id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-uso">
      <div style={{ ...eyebrow, paddingTop: 10 }}>Uso</div>
      {sinBase ? (
        <div style={{ fontSize: '12.5px', color: V.tenue }}>Falta aplicar la migración 20260922T1200 de la verificación de uso.</div>
      ) : (
        <>
          {fila(clase === 'rodado' ? 'Kilometraje' : 'Horómetro', <span style={l ? undefined : vacio}>{textoLectura(l, UNIDAD[clase])}</span>, 'ficha-lectura')}
          {fila('Última verificación', <span style={ult ? { color: v.tipo === 'hoy' ? V.tinta : V.warn } : vacio}>
            {textoVerificacion(v)}{quien ? ` · ${quien}` : ''}{ult && ult.criticos_mal.length ? ' · no pasó' : ''}
          </span>, 'ficha-verificacion')}
          <button type="button" onClick={() => abrir({ tipo: 'verificar', id })} style={{ fontSize: '12px', color: AZUL, textAlign: 'left' }} data-testid="abrir-verificar">
            {clase === 'rodado' ? 'Verificar antes de salir' : 'Verificar antes de arrancar'}
          </button>
        </>
      )}
    </div>
  )
}

/**
 * DÓNDE ESTÁN LAS UNIDADES DE UN LOTE (dueño, 22/09): «Taller 5 · Entrepiso 3». Cada lugar se puede
 * corregir si al contar hay otra cantidad (recuento: queda en el historial con quién y cuándo). Para
 * llevar unidades a otro lado es «Mover»; para las que se rompieron o se perdieron, «Dar de baja».
 */
function Reparto({ id }: { id: string }) {
  const { parque, avisar, refrescar } = useHerramientas()
  const a = parque.activoPorId.get(id)!
  const lugares = lugaresDe(parque, id)
  const [editando, setEditando] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function guardar(ubicacion: string) {
    const n = Math.trunc(Number(valor))
    if (!Number.isFinite(n) || n < 1) return setError('Es un número de 1 o más. Para dejar el lugar en 0: moverlas o darlas de baja.')
    setEnviando(true)
    setError(null)
    const r = await ajustarExistenciaAction({ activo: id, ubicacion, cantidad: n, detalle: 'recuento desde la ficha' })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    avisar(`${a.nombre}: en ${rotuloUbicacion(parque, ubicacion)} quedaron ${n}.`)
    setEditando(null)
    refrescar()
  }

  return (
    <div data-testid="reparto-lote" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={eyebrow}>Dónde están las {a.cantidad} unidades</div>
      {lugares.map((e) => (
        <div key={e.ubicacion_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '13px', minHeight: 30, borderBottom: `1px solid ${V.linea}` }}>
          <span style={{ flex: 1, minWidth: 0, color: V.tintaSuave }}>{rotuloUbicacion(parque, e.ubicacion_id)}</span>
          {editando === e.ubicacion_id ? (
            <>
              <input type="number" min={1} autoFocus value={valor} onChange={(ev) => setValor(ev.target.value)} data-testid="recuento-cantidad"
                onKeyDown={(ev) => { if (ev.key === 'Enter') guardar(e.ubicacion_id); if (ev.key === 'Escape') setEditando(null) }}
                style={{ width: 64, height: 28, border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, padding: '0 8px', fontSize: '13px' }} />
              <button type="button" disabled={enviando} onClick={() => guardar(e.ubicacion_id)} style={{ fontSize: '12.5px', fontWeight: 500 }} data-testid="recuento-guardar">Guardar</button>
              <button type="button" onClick={() => { setEditando(null); setError(null) }} style={{ fontSize: '12.5px', color: V.apagado }}>cancelar</button>
            </>
          ) : (
            <>
              <b style={{ fontWeight: 600 }}>{e.cantidad}</b>
              <button type="button" onClick={() => { setEditando(e.ubicacion_id); setValor(String(e.cantidad)); setError(null) }}
                style={{ fontSize: '12px', color: V.apagado, textDecoration: 'underline', textDecorationColor: V.linea }} data-testid="recuento-corregir">
                corregir
              </button>
            </>
          )}
        </div>
      ))}
      {error && <div role="alert" style={{ fontSize: '12.5px', color: V.neg }}>{error}</div>}
    </div>
  )
}
