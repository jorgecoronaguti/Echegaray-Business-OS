'use client'

// EFECTIVO: EDITAR Y BORRAR TODO (dueño, 25/09/2026) — los paneles.
//
// «dejámelo todo habilitado 100% editable porque sino se guardan cosas mal y no me las deja borrar,
// cambiar, editar». Un panel al costado por cosa (entrega, devolución, ticket), como los de entregar y
// devolver: se edita sin dejar la ficha, y en el teléfono el panel ocupa la pantalla entera
// (`PANEL_CLASE`). Borrar pide UNA confirmación, que dice lo que arrastra. La base propaga y registra
// (migración 20260925T1200): acá no se decide nada que la base no vuelva a decidir.

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import type { Comprobante, Devolucion, Entrega, ObraOpcion, PersonaOpcion, Rendicion } from '../types'
import { ddmm, ddmmHora, pesos } from '../logica/entregas'
import { validarMonto } from '../logica/formularios'
import {
  borradorDe, efectosDeGuardar, estadoDelAviso, loQueArrastraBorrar, ROTULO_AVISO, type BorradorEdicion, type EstadoEntrega,
} from '../logica/edicion'
import { urlEfectivo } from '../logica/url'
import {
  borrarAvisoAction, borrarComprobanteAction, borrarDevolucionAction, borrarEntregaAction, borrarFirmaAction,
  borrarRendicionAction, cambiarEstadoAction, editarAvisoAction, editarDevolucionAction, editarEntregaAction,
  editarRendicionAction, moverComprobanteAction,
} from '../services/edicion'
import type { AvisoDeFicha } from '../services/edicionDatos'
import { FirmaEnElPanel } from './FirmaEnElPanel'
import { Campo, Cerrar, ErrorPanel, PANEL_CLASE } from './Piezas'
import {
  COLOR_TONO, SUPERFICIE, V, areaTexto, botonClaro, botonClaroGrande, botonOscuroGrande, botonPeligro, cajaConfirmar, campo,
  campoMonto, panel,
} from './estilo'

type Resultado = { ok: true } | { ok: false; error: string }

/** Dos a cuatro botones iguales que eligen uno: destino, estado. */
function Opciones<T extends string>({ valor, opciones, onCambio, rotulo, testid }: {
  valor: T; opciones: readonly (readonly [T, string])[]; onCambio: (v: T) => void; rotulo: string; testid: string
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label={rotulo}>
      {opciones.map(([v, texto]) => (
        <button
          key={v} type="button" role="radio" aria-checked={valor === v} onClick={() => onCambio(v)} data-testid={`${testid}-${v}`}
          style={{
            flex: 1, height: 34, borderRadius: 6, fontSize: '13px', cursor: 'pointer',
            border: `1px solid ${valor === v ? V.grafito : V.lineaFuerte}`, background: valor === v ? SUPERFICIE : '#FFFFFF',
            color: valor === v ? V.tinta : V.apagado, fontWeight: valor === v ? 500 : 400,
          }}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}

/**
 * BORRAR CON UNA SOLA CONFIRMACIÓN (pedido del dueño): el primer toque muestra lo que se va a perder y el
 * segundo borra. No se pide escribir el código: una confirmación, no un examen.
 */
export function Borrar({ rotulo, detalle, accion, alBorrar, testid }: {
  rotulo: string; detalle: ReactNode; accion: () => Promise<Resultado>; alBorrar: () => void; testid: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{ ...botonPeligro, height: 34, padding: 0, alignSelf: 'flex-start', textDecoration: 'underline', textUnderlineOffset: 2 }} data-testid={testid}>
        {rotulo}
      </button>
    )
  }
  const borrar = () => empezar(async () => {
    setError(null)
    const r = await accion()
    if (!r.ok) { setError(r.error); return }
    alBorrar()
  })
  return (
    <div style={{ ...cajaConfirmar, borderColor: V.neg }} data-testid={`${testid}-confirmar`}>
      <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.5 }}>{detalle}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={borrar} disabled={pendiente} style={{ ...botonClaroGrande, color: V.neg, borderColor: V.neg, opacity: pendiente ? 0.6 : 1 }} data-testid={`${testid}-si`}>
          {pendiente ? 'Borrando…' : 'Sí, borrar'}
        </button>
        <button type="button" onClick={() => { setAbierto(false); setError(null) }} style={botonClaroGrande}>No</button>
      </div>
      <ErrorPanel texto={error} />
    </div>
  )
}

/** La persona de la entrega puede ya no estar en la empresa: se agrega a la lista para no perderla. */
function conLaActual(personas: PersonaOpcion[], id: string | null, nombre: string | null): PersonaOpcion[] {
  if (!id || personas.some((p) => p.id === id)) return personas
  return [{ id, nombre: nombre ?? 'persona actual', puesto: null }, ...personas]
}

// ═══ LA ENTREGA ═══════════════════════════════════════════════════════════════════════════════════

export function PanelEditarEntrega({ e, personas, obras, tickets, devoluciones, cerrarHref }: {
  e: Entrega
  personas: PersonaOpcion[]
  obras: ObraOpcion[]
  /** Tickets de la entrega (todos): borrar la entrega los borra. */
  tickets: number
  devoluciones: number
  cerrarHref: string
}) {
  const router = useRouter()
  const inicial = borradorDe(e)
  const [b, setB] = useState<BorradorEdicion>(inicial)
  const [estado, setEstado] = useState<EstadoEntrega>(e.estado)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const set = (x: Partial<BorradorEdicion>) => { setB((v) => ({ ...v, ...x })); setError(null); setHecho(null) }

  const lista = conLaActual(personas, e.persona_id, e.persona)
  const opcionesObra = obras.filter((o) => o.activa || o.id === e.obra_id)
  const cambiaronDatos = JSON.stringify(b) !== JSON.stringify(inicial)
  const cambioEstado = estado !== e.estado
  const efectos = efectosDeGuardar(e, b)
  if (cambioEstado && estado === 'anulada') efectos.push('Anular: sus filas de Compras pasan a Cancelado, sus tickets quedan descartados, su devolución se borra y sale de CAJA.')
  if (cambioEstado && e.estado === 'anulada') efectos.push('Sacar la anulación: vuelve a CAJA con su importe. Lo que la anulación canceló (filas de Compras, tickets, devolución) no vuelve solo.')
  if (cambioEstado && estado === 'cerrada' && e.en_su_poder !== 0) efectos.push(`Se cierra con ${pesos(e.en_su_poder)} en su poder.`)

  const guardar = () => empezar(async () => {
    setError(null)
    if (cambiaronDatos) {
      const r = await editarEntregaAction(e.id, b)
      if (!r.ok) { setError(r.error); return }
    }
    if (cambioEstado) {
      const r = await cambiarEstadoAction({ entrega: e.id, estado, motivo: motivo.trim() || null })
      if (!r.ok) { setError(cambiaronDatos ? `Los datos se guardaron; el estado no: ${r.error}` : r.error); return }
    }
    router.push(cerrarHref, { scroll: false })
    router.refresh()
  })

  const firmada = e.conformidad || !!e.conformidad_en
  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Editar entrega" data-testid="panel-editar-entrega">
      <Cerrar titulo={`Editar ${e.codigo}`} bajada="Todo se puede cambiar. Queda registrado quién y cuándo." href={cerrarHref} />

      <Campo rotulo="A quién">
        <select value={b.persona} onChange={(x) => set({ persona: x.target.value })} style={campo} aria-label="A quién" data-testid="editar-persona">
          {lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ''}</option>)}
        </select>
      </Campo>

      <Campo rotulo="Destino económico">
        <Opciones valor={b.destino} onCambio={(d) => set({ destino: d })} rotulo="Destino económico" testid="editar-destino"
          opciones={[['obra', 'Una obra'], ['estructura', 'Estructura']] as const} />
        {b.destino === 'obra' && (
          <select value={b.obra} onChange={(x) => set({ obra: x.target.value })} style={campo} aria-label="Obra" data-testid="editar-obra">
            <option value="">Elegí la obra</option>
            {opcionesObra.map((o) => <option key={o.id} value={o.id}>{o.nombre}{o.cliente ? ` · ${o.cliente}` : ''}</option>)}
          </select>
        )}
      </Campo>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
        <Campo rotulo="Importe">
          <input value={b.monto} onChange={(x) => set({ monto: x.target.value })} inputMode="decimal" style={campoMonto} aria-label="Importe" data-testid="editar-monto" />
        </Campo>
        <Campo rotulo="Fecha">
          <input type="date" value={b.fecha} onChange={(x) => set({ fecha: x.target.value })} style={campo} aria-label="Fecha" data-testid="editar-fecha" />
        </Campo>
      </div>

      <Campo rotulo="Para qué">
        <textarea value={b.paraQue} onChange={(x) => set({ paraQue: x.target.value })} rows={2} maxLength={400} style={areaTexto} aria-label="Para qué" data-testid="editar-para-que" />
      </Campo>

      <Campo rotulo="Estado">
        <Opciones valor={estado} onCambio={(v) => { setEstado(v); setError(null) }} rotulo="Estado" testid="editar-estado"
          opciones={[['abierta', 'Abierta'], ['cerrada', 'Cerrada'], ['anulada', 'Anulada']] as const} />
        {cambioEstado && estado === 'anulada' && (
          <input value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder="Motivo (opcional)" maxLength={400} style={campo} aria-label="Motivo de la anulación" data-testid="editar-motivo" />
        )}
        {e.estado === 'anulada' && e.anulada_motivo && !cambioEstado && (
          <div style={{ fontSize: '12px', color: V.apagado }}>Anulada: {e.anulada_motivo}</div>
        )}
      </Campo>

      <Campo rotulo="Firma de conformidad">
        {firmada ? <BorrarFirma entrega={e.id} cuando={e.conformidad_en ? `firmada en el teléfono ${ddmmHora(e.conformidad_en)}` : 'firmada en papel'} />
          : <div style={{ fontSize: '12.5px', color: V.warn }}>Sin firmar</div>}
      </Campo>

      {efectos.length > 0 && (
        <div style={cajaConfirmar} data-testid="editar-efectos">
          <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Al guardar</div>
          {efectos.map((f) => <div key={f} style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>{f}</div>)}
        </div>
      )}

      <ErrorPanel texto={error} />
      {hecho && <div style={{ fontSize: '12.5px', color: V.pos }}>{hecho}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={guardar} disabled={pendiente || (!cambiaronDatos && !cambioEstado)} style={{ ...botonOscuroGrande, opacity: pendiente || (!cambiaronDatos && !cambioEstado) ? 0.5 : 1 }} data-testid="editar-guardar">
          {pendiente ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => router.push(cerrarHref, { scroll: false })} style={botonClaroGrande}>Cancelar</button>
      </div>

      <div style={{ paddingTop: 16, borderTop: `1px solid ${V.linea}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Borrar
          rotulo="Borrar la entrega" testid="borrar-entrega"
          detalle={<><strong>¿Borrar {e.codigo} de {e.persona} ({pesos(e.entregado)})?</strong> {loQueArrastraBorrar({ filas: e.filas_rendidas, tickets, devoluciones })}</>}
          accion={() => borrarEntregaAction(e.id)}
          alBorrar={() => { router.push(urlEfectivo({})); router.refresh() }}
        />
      </div>
    </aside>
  )
}

function BorrarFirma({ entrega, cuando }: { entrega: string; cuando: string }) {
  const router = useRouter()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: '12.5px', color: V.pos }}>Conformidad {cuando}</div>
      <Borrar
        rotulo="Borrar la firma" testid="borrar-firma"
        detalle="Se borra la firma (y el papel, si hay) y a la persona le llega de nuevo el pedido de firma por mensaje directo."
        accion={() => borrarFirmaAction(entrega)}
        alBorrar={() => router.refresh()}
      />
    </div>
  )
}

// ═══ LA DEVOLUCIÓN ════════════════════════════════════════════════════════════════════════════════

export function PanelEditarDevolucion({ e, d, personas, cerrarHref }: {
  e: Entrega; d: Devolucion; personas: PersonaOpcion[]; cerrarHref: string
}) {
  const router = useRouter()
  const [monto, setMonto] = useState(String(d.monto).replace('.', ','))
  const [fecha, setFecha] = useState(d.fecha.slice(0, 10))
  const [recibe, setRecibe] = useState(d.recibida_por ?? '')
  const [nota, setNota] = useState(d.nota ?? '')
  const [firma, setFirma] = useState<string | null>(null)
  const [refirmar, setRefirmar] = useState(false)
  const [sinFirmaEntrega, setSinFirmaEntrega] = useState(false)
  const [sinFirmaRecibe, setSinFirmaRecibe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const lista = conLaActual(personas, d.recibida_por, d.recibe)

  const guardar = () => empezar(async () => {
    setError(null)
    const r = await editarDevolucionAction({
      devolucion: d.id, monto, fecha, recibidaPor: recibe || null, nota,
      firmaRecibe: refirmar ? firma : null, borrarFirmaEntrega: sinFirmaEntrega, borrarFirmaRecibe: sinFirmaRecibe,
    })
    if (!r.ok) { setError(r.error); return }
    router.push(cerrarHref, { scroll: false })
    router.refresh()
  })

  const m = validarMonto(monto)
  const casilla = (checked: boolean, onChange: (v: boolean) => void, texto: string, testid: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12.5px', color: V.tintaSuave, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(x) => onChange(x.target.checked)} data-testid={testid} /> {texto}
    </label>
  )
  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Editar devolución" data-testid="panel-editar-devolucion">
      <Cerrar titulo="Editar devolución" bajada={`${e.codigo} · ${e.persona} · ${pesos(d.monto)} del ${ddmm(d.fecha)}`} href={cerrarHref} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
        <Campo rotulo="Devolvió">
          <input value={monto} onChange={(x) => { setMonto(x.target.value); setError(null) }} inputMode="decimal" style={campoMonto} aria-label="Importe devuelto" data-testid="editar-dev-monto" />
        </Campo>
        <Campo rotulo="Fecha">
          <input type="date" value={fecha} onChange={(x) => setFecha(x.target.value)} style={campo} aria-label="Fecha" data-testid="editar-dev-fecha" />
        </Campo>
      </div>
      <Campo rotulo="Quién la recibió">
        <select value={recibe} onChange={(x) => setRecibe(x.target.value)} style={campo} aria-label="Quién la recibió" data-testid="editar-dev-recibe">
          <option value="">Sin dato</option>
          {lista.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ''}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Nota">
        <textarea value={nota} onChange={(x) => setNota(x.target.value)} rows={2} maxLength={400} style={areaTexto} aria-label="Nota" data-testid="editar-dev-nota" />
      </Campo>
      <Campo rotulo="Firmas">
        {d.firmo_entrega
          ? casilla(sinFirmaEntrega, setSinFirmaEntrega, `Borrar la firma de ${e.persona} (devolvió)`, 'editar-dev-sin-firma-entrega')
          : <div style={{ fontSize: '12.5px', color: V.warn }}>Sin la firma de quien devolvió</div>}
        {d.firmo_recibe && !refirmar && casilla(sinFirmaRecibe, setSinFirmaRecibe, 'Borrar la firma de quien recibió', 'editar-dev-sin-firma-recibe')}
        {!refirmar
          ? <button type="button" onClick={() => setRefirmar(true)} style={{ ...botonClaro, alignSelf: 'flex-start' }} data-testid="editar-dev-refirmar">
              {d.firmo_recibe ? 'Volver a firmar quien recibió' : 'Firmar quien recibió'}
            </button>
          : <FirmaEnElPanel rotulo="Firma de quien recibió" onCambio={setFirma} />}
      </Campo>
      {m.ok && Math.abs(m.dato - d.monto) >= 0.005 && (
        <div style={cajaConfirmar}>
          <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
            CAJA pasa a sumar {pesos(m.dato)} en vez de {pesos(d.monto)} por esta devolución, y en su poder queda {pesos(e.en_su_poder + d.monto - m.dato)}.
          </div>
        </div>
      )}
      <ErrorPanel texto={error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={guardar} disabled={pendiente || (refirmar && !firma)} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="editar-dev-guardar">
          {pendiente ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => router.push(cerrarHref, { scroll: false })} style={botonClaroGrande}>Cancelar</button>
      </div>
      <div style={{ paddingTop: 16, borderTop: `1px solid ${V.linea}` }}>
        <Borrar
          rotulo="Borrar la devolución" testid="borrar-devolucion"
          detalle={<><strong>¿Borrar la devolución de {pesos(d.monto)}?</strong> Sale de CAJA y vuelve a estar en su poder. La entrega no cambia de estado.</>}
          accion={() => borrarDevolucionAction(d.id)}
          alBorrar={() => { router.push(cerrarHref, { scroll: false }); router.refresh() }}
        />
      </div>
    </aside>
  )
}

// ═══ EL TICKET O LA RENDICIÓN ═════════════════════════════════════════════════════════════════════

export function PanelEditarComprobante({ e, comprobante, rendicion, fila, entregas, rotulo, cerrarHref }: {
  e: Entrega
  comprobante: Comprobante | null
  rendicion: Rendicion | null
  /** La fila de Compras que escribió, si ya existe. */
  fila: number | null
  /** Las entregas a las que se puede pasar (no anuladas). */
  entregas: Pick<Entrega, 'id' | 'codigo' | 'persona' | 'estado'>[]
  rotulo: string
  cerrarHref: string
}) {
  const router = useRouter()
  const [destino, setDestino] = useState(e.id)
  const [monto, setMonto] = useState(rendicion ? String(rendicion.monto).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const nueva = entregas.find((x) => x.id === destino) ?? null

  const guardar = () => empezar(async () => {
    setError(null)
    if (destino !== e.id && comprobante) {
      const r = await moverComprobanteAction(comprobante.id, destino)
      if (!r.ok) { setError(r.error); return }
    }
    if (rendicion) {
      const m = validarMonto(monto)
      if (!m.ok) { setError(m.error); return }
      if (Math.abs(m.dato - rendicion.monto) >= 0.005 || (destino !== e.id && !comprobante)) {
        const r = await editarRendicionAction(rendicion.id, monto, destino)
        if (!r.ok) { setError(r.error); return }
      }
    }
    // Movido a otra entrega: la ficha que tiene sentido mirar es la de destino.
    router.push(destino !== e.id && nueva ? urlEfectivo({ entrega: nueva.codigo }) : cerrarHref, { scroll: false })
    router.refresh()
  })

  const detalleBorrar = fila
    ? `La fila ${fila} de Compras pasa a Cancelado (la escribe el worker en minutos) y deja de rendir en ${e.codigo}.`
    : rendicion ? `Deja de rendir en ${e.codigo}; su fila de Compras pasa a Cancelado.` : `El ticket sale de ${e.codigo} y no se carga en Compras.`
  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Editar comprobante" data-testid="panel-editar-comprobante">
      <Cerrar titulo="Editar comprobante" bajada={rotulo} href={cerrarHref} />
      <Campo rotulo="Entrega">
        <select value={destino} onChange={(x) => { setDestino(x.target.value); setError(null) }} style={campo} aria-label="Entrega" data-testid="editar-comp-entrega">
          {entregas.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.persona}{x.estado !== 'abierta' ? ` · ${x.estado}` : ''}</option>)}
        </select>
      </Campo>
      {rendicion && (
        <Campo rotulo="Importe que rinde">
          <input value={monto} onChange={(x) => { setMonto(x.target.value); setError(null) }} inputMode="decimal" style={campoMonto} aria-label="Importe que rinde" data-testid="editar-comp-monto" />
          <div style={{ fontSize: '12px', color: V.apagado }}>La fila de Compras no cambia: su Total se corrige en Compras.</div>
        </Campo>
      )}
      <ErrorPanel texto={error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={guardar} disabled={pendiente} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="editar-comp-guardar">
          {pendiente ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => router.push(cerrarHref, { scroll: false })} style={botonClaroGrande}>Cancelar</button>
      </div>
      <div style={{ paddingTop: 16, borderTop: `1px solid ${V.linea}` }}>
        <Borrar
          rotulo={comprobante ? 'Borrar el ticket' : 'Borrar la rendición'} testid="borrar-comprobante"
          detalle={<><strong>¿Borrarlo?</strong> {detalleBorrar}</>}
          accion={() => (comprobante ? borrarComprobanteAction(comprobante.id) : borrarRendicionAction(rendicion!.id))}
          alBorrar={() => { router.push(cerrarHref, { scroll: false }); router.refresh() }}
        />
      </div>
    </aside>
  )
}

// ═══ LOS AVISOS ═══════════════════════════════════════════════════════════════════════════════════

/** El aviso como se lee en Mattermost: sin los ** del markdown, con la persona y sin emojis que la fuente no dibuja. */
function textoLegible(texto: string, persona: string): string {
  return texto.replaceAll('{persona}', persona).replace(/\*\*/g, '').replace(/\p{Extended_Pictographic}\uFE0F?\s?/gu, '')
}

export function AvisosDeLaEntrega({ avisos, persona }: { avisos: AvisoDeFicha[]; persona: string }) {
  if (!avisos.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 18, borderTop: `1px solid ${V.linea}` }} data-testid="ficha-avisos">
      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Avisos</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {avisos.map((a) => <FilaAviso key={a.id} a={a} persona={persona} />)}
      </div>
    </div>
  )
}

function FilaAviso({ a, persona }: { a: AvisoDeFicha; persona: string }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(a.texto)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const est = estadoDelAviso(a)
  const guardar = () => empezar(async () => {
    const r = await editarAvisoAction(a.id, texto)
    if (!r.ok) { setError(r.error); return }
    setEditando(false); router.refresh()
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', borderBottom: `1px solid ${V.lineaFila}`, fontSize: '12.5px' }} data-testid="fila-aviso" data-enviado={a.enviado_en ? 'si' : 'no'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: V.tinta }}>{ROTULO_AVISO[a.tipo] ?? a.tipo}</span>
        <span style={{ color: COLOR_TONO[est.tono] }}>{est.texto}{a.enviado_en ? ` ${ddmmHora(a.enviado_en)}` : ''}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12 }}>
          {!a.enviado_en && !editando && (
            <button type="button" onClick={() => setEditando(true)} style={{ color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 2 }} data-testid="aviso-editar">Editar</button>
          )}
        </span>
      </div>
      {editando ? (
        <>
          <textarea value={texto} onChange={(x) => { setTexto(x.target.value); setError(null) }} rows={3} maxLength={2000} style={areaTexto} aria-label="Texto del aviso" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={guardar} disabled={pendiente} style={{ ...botonClaro, height: 30 }} data-testid="aviso-guardar">{pendiente ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={() => { setEditando(false); setTexto(a.texto) }} style={{ fontSize: '12.5px', color: V.apagado }}>Cancelar</button>
          </div>
        </>
      ) : (
        <div className="line-clamp-2" style={{ color: V.apagado, whiteSpace: 'pre-line' }}>{textoLegible(a.texto, persona)}</div>
      )}
      <Borrar
        rotulo={a.enviado_en ? 'Borrar del registro' : 'Quitar de la cola'} testid="aviso-borrar"
        detalle={a.enviado_en ? 'Se borra de la app. El mensaje que ya salió en Mattermost no se borra desde acá.' : 'No se manda.'}
        accion={() => borrarAvisoAction(a.id)}
        alBorrar={() => router.refresh()}
      />
      <ErrorPanel texto={error} />
    </div>
  )
}
