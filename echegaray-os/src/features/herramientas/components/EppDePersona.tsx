'use client'

// «EPP Y ROPA DE TRABAJO» — la solapa del legajo que reemplaza a «Auditoría» (dueño, 25/09/2026):
// «crees una lista tomada del módulo herramientas de cada sección que corresponde, "epp" "ropa de
// trabajo" y se pueda designar de manera sencilla a una persona determinada esos dos».
//
// ═══ CÓMO SE LEE ═══
// Arriba, sus talles (los usa la entrega para proponer el talle). Después dos bloques, EPP y Ropa de
// trabajo, con lo que tiene HOY: ítem, talle, cantidad, cuándo se le entregó y quién. La entrega se abre
// EN EL BLOQUE, sin salir del legajo: ítem → talle → cantidad → Entregar. Devolver y dar de baja van en
// la fila. Abajo, el historial (base de la constancia de la Res. SRT 299/11, que queda como siguiente paso).
//
// ═══ SIN STOCK ═══
// La base no deja entregar lo que no hay (no hay stock negativo). Si el inventario dice 0, la entrega
// pide una de dos: contar el lugar ahora (recuento) o marcar «ya la tenía» (se entregó antes de cargarla
// acá: no descuenta de ningún lado). Las dos dejan la cuenta verdadera.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import {
  ETIQUETA_CAMPO_TALLE, ETIQUETA_EVENTO, ETIQUETA_PERSONAL, normalizarTalle,
  type CampoTalle, type ClasePersonal, type TallesPersona,
} from '../logica/vestimenta'
import type { FilaHistorial, FilaTiene, PrendaPlana } from '../services/vestimentaDePersona'
import {
  bajaDePersonaAction, devolverDePersonaAction, entregarAPersonaAction, guardarTallesAction,
} from '../services/acciones-vestimenta'
import { diaMesAnio } from './formato'

const MONO = "'IBM Plex Mono', ui-monospace, monospace"
const rotulo = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' as const }
const campo = { height: 36, padding: '0 10px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13px', color: V.tinta, background: '#FFFFFF' }
const primario = { height: 36, padding: '0 14px', borderRadius: 6, background: V.marca, color: V.tinta, fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' as const }
const secundario = { height: 36, padding: '0 12px', borderRadius: 6, border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta, fontSize: '13px', whiteSpace: 'nowrap' as const }
const enlace = { fontSize: '12.5px', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: V.linea }

export interface PropsEpp {
  personaId: string
  enLaEmpresa: boolean
  ubicacionPersona: string | null
  tallerId: string | null
  tiene: FilaTiene[]
  catalogo: Record<ClasePersonal, PrendaPlana[]>
  historial: FilaHistorial[]
  talles: TallesPersona | null
  tallesSinBase: boolean
}

export function EppDePersona(p: PropsEpp) {
  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid="bloque-epp-ropa">
      <Talles personaId={p.personaId} talles={p.talles} sinBase={p.tallesSinBase} />
      {(['epp', 'ropa'] as const).map((c) => (
        <Seccion key={c} clase={c} {...p} filas={p.tiene.filter((t) => t.clase === c)} />
      ))}
      <Historial filas={p.historial} />
    </div>
  )
}

// ── TALLES ──────────────────────────────────────────────────────────────────────────────────────
function Talles({ personaId, talles, sinBase }: { personaId: string; talles: TallesPersona | null; sinBase: boolean }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [v, setV] = useState<Record<CampoTalle, string>>({ camisa: talles?.camisa ?? '', pantalon: talles?.pantalon ?? '', calzado: talles?.calzado ?? '' })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const campos: CampoTalle[] = ['camisa', 'pantalon', 'calzado']

  async function guardar() {
    setEnviando(true)
    setError(null)
    const r = await guardarTallesAction({ persona: personaId, ...v })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    setEditando(false)
    router.refresh()
  }

  return (
    <div data-testid="talles-persona" className="flex flex-wrap items-center gap-x-6 gap-y-3" style={{ fontSize: '13px' }}>
      <span style={rotulo}>Talles</span>
      {!editando ? (
        <>
          {campos.map((k) => (
            <span key={k} style={{ color: V.apagado }}>
              {ETIQUETA_CAMPO_TALLE[k]}{' '}
              {talles?.[k] ? <b style={{ color: V.tinta, fontWeight: 600 }}>{talles[k]}</b> : <i style={{ color: V.tenue }}>sin cargar</i>}
            </span>
          ))}
          {sinBase
            ? <span style={{ color: V.tenue }}>se guardan cuando se aplique la migración 20260925T1100</span>
            : <button type="button" onClick={() => setEditando(true)} style={enlace} data-testid="editar-talles">{talles ? 'Editar' : 'Cargar talles'}</button>}
        </>
      ) : (
        <>
          {campos.map((k) => (
            <label key={k} className="flex items-center gap-2" style={{ color: V.apagado }}>
              {ETIQUETA_CAMPO_TALLE[k]}
              <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={12} placeholder={k === 'camisa' ? 'M' : k === 'pantalon' ? '44' : '42'}
                style={{ ...campo, height: 32, width: 64 }} data-testid={`talle-${k}`} />
            </label>
          ))}
          <button type="button" onClick={guardar} disabled={enviando} style={{ ...primario, height: 32 }} data-testid="guardar-talles">{enviando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" onClick={() => setEditando(false)} style={enlace}>cancelar</button>
          {error && <span role="alert" style={{ color: V.neg }}>{error}</span>}
        </>
      )}
    </div>
  )
}

// ── UNA SECCIÓN: EPP o ROPA ─────────────────────────────────────────────────────────────────────
function Seccion({ clase, filas, ...p }: PropsEpp & { clase: ClasePersonal; filas: FilaTiene[] }) {
  const [entregando, setEntregando] = useState(false)
  const catalogo = p.catalogo[clase]
  const unidades = filas.reduce((s, f) => s + f.cantidad, 0)
  return (
    <section data-testid={`seccion-${clase}`} className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2" style={{ paddingBottom: 8, borderBottom: `1px solid ${V.linea}` }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}>{ETIQUETA_PERSONAL[clase]}</h2>
        <span style={{ fontSize: '12.5px', color: V.tenue }}>{filas.length ? `${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}` : 'nada entregado'}</span>
        <div className="ml-auto flex items-center gap-4">
          <Link href={`/herramientas/inventario?clase=${clase}`} style={enlace}>ver stock</Link>
          {p.enLaEmpresa && !entregando && (
            <button type="button" onClick={() => setEntregando(true)} style={{ ...secundario, height: 30 }} data-testid={`entregar-${clase}`}>
              Entregar {clase === 'epp' ? 'EPP' : 'ropa'}
            </button>
          )}
        </div>
      </div>
      {entregando && (
        <FormEntrega clase={clase} catalogo={catalogo} personaId={p.personaId} talles={p.talles} tallerId={p.tallerId} onCerrar={() => setEntregando(false)} />
      )}
      {filas.map((f) => (
        <FilaTenencia key={f.activoId} f={f} personaId={p.personaId} ubicacionPersona={p.ubicacionPersona} tallerId={p.tallerId} />
      ))}
      {!filas.length && !entregando && (
        <div style={{ fontSize: '13px', color: V.tenue, padding: '12px 0' }}>
          {catalogo.length ? 'Sin entregas registradas.' : `No hay ${clase === 'epp' ? 'EPP' : 'ropa'} en el inventario.`}
        </div>
      )}
    </section>
  )
}

function FilaTenencia({ f, personaId, ubicacionPersona, tallerId }: { f: FilaTiene; personaId: string; ubicacionPersona: string | null; tallerId: string | null }) {
  const router = useRouter()
  const [accion, setAccion] = useState<null | 'devolver' | 'baja'>(null)
  const [n, setN] = useState(String(f.cantidad))
  const [motivo, setMotivo] = useState<'descartada' | 'perdida' | 'robada'>('descartada')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function confirmar() {
    if (!ubicacionPersona) return
    const cantidad = Math.trunc(Number(n))
    if (!(cantidad >= 1 && cantidad <= f.cantidad)) return setError(`Entre 1 y ${f.cantidad}`)
    setEnviando(true)
    setError(null)
    const r = accion === 'devolver'
      ? (tallerId ? await devolverDePersonaAction({ persona: personaId, ubicacionPersona, activo: f.activoId, cantidad, destino: tallerId }) : { ok: false as const, error: 'No hay Taller cargado para devolver' })
      : await bajaDePersonaAction({ persona: personaId, ubicacionPersona, activo: f.activoId, cantidad, motivo })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    setAccion(null)
    router.refresh()
  }

  return (
    <div data-testid="fila-tenencia" data-codigo={f.codigo} style={{ borderBottom: `1px solid ${V.linea}`, padding: '10px 0', fontSize: '13px' }}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1.6fr)_56px_48px_minmax(0,1.2fr)_auto]">
        <div className="min-w-0">
          <div style={{ fontWeight: 500, color: V.tinta }}>{f.nombre}</div>
          <div style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>{f.codigo}</div>
        </div>
        <div className="text-right sm:text-left" style={{ color: V.tintaSuave }}>
          <span className="sm:hidden" style={{ color: V.tenue }}>talle </span>{f.talle ?? (f.sinTalle ? 'sin talle' : 'único')}
          <span className="sm:hidden" style={{ color: V.tenue }}> · × </span><span className="sm:hidden" style={{ fontWeight: 600 }}>{f.cantidad}</span>
        </div>
        <div className="hidden text-right sm:block" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{f.cantidad}</div>
        <div className="col-span-2 sm:col-span-1" style={{ color: V.apagado, fontSize: '12.5px' }}>
          {f.fecha ? `${f.yaLaTenia ? 'ya la tenía · cargado' : 'entregado'} el ${diaMesAnio(f.fecha)}${f.quien && !f.historica ? ` · ${f.quien}` : ''}` : 'sin registro de entrega'}
          {f.respaldo && <> · <a href={f.respaldo} target="_blank" rel="noreferrer" style={{ color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 3 }} data-testid="respaldo-constancia">constancia firmada</a></>}
        </div>
        <div className="col-span-2 flex gap-4 sm:col-span-1 sm:justify-end">
          <button type="button" onClick={() => { setAccion(accion === 'devolver' ? null : 'devolver'); setN(String(f.cantidad)); setError(null) }} style={enlace} data-testid="devolver">Devolver</button>
          <button type="button" onClick={() => { setAccion(accion === 'baja' ? null : 'baja'); setN(String(f.cantidad)); setError(null) }} style={enlace} data-testid="dar-baja">Dar de baja</button>
        </div>
      </div>
      {accion && (
        <div className="mt-3 flex flex-wrap items-center gap-3" style={{ padding: 12, background: '#FAFAF8', border: `1px solid ${V.linea}`, borderRadius: 6 }}>
          <span style={{ color: V.apagado }}>{accion === 'devolver' ? 'Vuelve al Taller' : 'Baja por'}</span>
          {accion === 'baja' && (
            <select value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)} style={campo} aria-label="Motivo">
              <option value="descartada">gastada o rota</option>
              <option value="perdida">perdida</option>
              <option value="robada">robada</option>
            </select>
          )}
          <label className="flex items-center gap-2" style={{ color: V.apagado }}>
            cantidad
            <input type="number" min={1} max={f.cantidad} value={n} onChange={(e) => setN(e.target.value)} style={{ ...campo, width: 72 }} aria-label="Cantidad" />
          </label>
          <button type="button" onClick={confirmar} disabled={enviando} style={primario} data-testid="confirmar-accion">
            {enviando ? 'Guardando…' : accion === 'devolver' ? 'Devolver' : 'Dar de baja'}
          </button>
          <button type="button" onClick={() => setAccion(null)} style={enlace}>cancelar</button>
          {error && <span role="alert" style={{ color: V.neg, flexBasis: '100%' }}>{error}</span>}
        </div>
      )}
    </div>
  )
}

// ── ENTREGAR: ítem → talle → cantidad → confirmar ───────────────────────────────────────────────
function FormEntrega({ clase, catalogo, personaId, talles, tallerId, onCerrar }: {
  clase: ClasePersonal; catalogo: PrendaPlana[]; personaId: string; talles: TallesPersona | null; tallerId: string | null; onCerrar: () => void
}) {
  const router = useRouter()
  const [prendaIdx, setPrendaIdx] = useState<number | null>(null)
  const prenda = prendaIdx == null ? null : catalogo[prendaIdx]
  const sugerido = useMemo(() => {
    if (!prenda) return null
    if (prenda.talles.length === 1) return prenda.talles[0].activoId
    const suyo = prenda.campo && talles ? normalizarTalle(talles[prenda.campo]) : null
    return prenda.talles.find((t) => suyo && t.talle === suyo)?.activoId ?? null
  }, [prenda, talles])
  const [elegido, setElegido] = useState<string | null>(null)
  const activoId = elegido ?? sugerido
  const talle = prenda?.talles.find((t) => t.activoId === activoId) ?? null
  const [cantidad, setCantidad] = useState('1')
  const [origen, setOrigen] = useState<string | null>(null)
  const [yaLaTenia, setYaLaTenia] = useState(false)
  const [contado, setContado] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const origenElegido = origen && talle?.origenes.some((o) => o.ubicacionId === origen) ? origen : (talle?.origenes[0]?.ubicacionId ?? null)
  const hayEnOrigen = talle?.origenes.find((o) => o.ubicacionId === origenElegido)?.cantidad ?? 0
  const n = Math.trunc(Number(cantidad))
  const sinStock = !!talle && !yaLaTenia && hayEnOrigen < (n || 1)

  async function entregar() {
    if (!talle) return setError(prenda ? 'Elegí el talle' : 'Elegí qué se entrega')
    if (!(n >= 1)) return setError('La cantidad es 1 o más')
    let contadoN: number | undefined
    // Sin unidades en ningún lado no hay origen: se cuenta y sale del Taller.
    const desde = origenElegido ?? tallerId
    if (sinStock) {
      contadoN = Math.trunc(Number(contado))
      if (!contado.trim() || !(contadoN >= 0)) return setError('Escribí cuántas contaste, o marcá «ya la tenía»')
      if (contadoN < n) return setError(`Contaste ${contadoN}: no alcanza para entregar ${n}. Marcá «ya la tenía» si se la diste antes.`)
    }
    setEnviando(true)
    setError(null)
    const r = await entregarAPersonaAction({
      persona: personaId, activo: talle.activoId, cantidad: n, yaLaTenia,
      origen: yaLaTenia ? null : desde,
      ...(sinStock && contadoN != null ? { contadoEnOrigen: contadoN } : {}),
    })
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    onCerrar()
    router.refresh()
  }

  return (
    <div data-testid={`form-entrega-${clase}`} className="mt-3 flex flex-col gap-4" style={{ padding: 16, background: '#FAFAF8', border: `1px solid ${V.linea}`, borderRadius: 6, fontSize: '13px' }}>
      <label className="flex flex-col gap-2">
        <span style={rotulo}>Qué se entrega</span>
        <select value={prendaIdx ?? ''} onChange={(e) => { setPrendaIdx(e.target.value === '' ? null : Number(e.target.value)); setElegido(null); setOrigen(null); setContado('') }}
          style={{ ...campo, maxWidth: 420 }} data-testid="entrega-item" autoFocus>
          <option value="">Elegí de la lista de {ETIQUETA_PERSONAL[clase]}</option>
          {catalogo.map((g, i) => <option key={g.nombre} value={i}>{g.nombre} · {g.talles.reduce((s, t) => s + t.disponible, 0)} en stock</option>)}
        </select>
      </label>

      {prenda && prenda.talles.length > 1 && (
        <div className="flex flex-col gap-2">
          <span style={rotulo}>Talle{prenda.campo && talles?.[prenda.campo] ? ` · el suyo: ${talles[prenda.campo]}` : ''}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Talle">
            {prenda.talles.map((t) => {
              const on = t.activoId === activoId
              return (
                <button key={t.activoId} type="button" role="radio" aria-checked={on} onClick={() => { setElegido(t.activoId); setOrigen(null); setContado('') }}
                  data-testid="entrega-talle"
                  style={{ minWidth: 48, height: 36, padding: '0 10px', borderRadius: 6, border: `1px solid ${on ? V.tinta : V.linea}`, background: '#FFFFFF',
                    color: t.disponible ? V.tinta : V.tenue, fontWeight: on ? 600 : 400, display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {t.talle ?? 'sin talle'}<span style={{ fontSize: '11px', color: V.tenue, fontWeight: 400 }}>{t.disponible}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {talle && (
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-2">
            <span style={rotulo}>Cantidad</span>
            <input type="number" min={1} max={1000} value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ ...campo, width: 88 }} data-testid="entrega-cantidad" />
          </label>
          {!yaLaTenia && talle.origenes.length > 1 && (
            <label className="flex flex-col gap-2">
              <span style={rotulo}>Sale de</span>
              <select value={origenElegido ?? ''} onChange={(e) => setOrigen(e.target.value)} style={campo}>
                {talle.origenes.map((o) => <option key={o.ubicacionId} value={o.ubicacionId}>{o.rotulo} · {o.cantidad}</option>)}
              </select>
            </label>
          )}
          {!yaLaTenia && talle.origenes.length === 1 && (
            <span style={{ color: V.apagado, paddingBottom: 9 }}>sale de {talle.origenes[0].rotulo} · hay {talle.origenes[0].cantidad}</span>
          )}
          <label className="flex items-center gap-2" style={{ color: V.tintaSuave, paddingBottom: 9 }}>
            <input type="checkbox" checked={yaLaTenia} onChange={(e) => setYaLaTenia(e.target.checked)} style={{ accentColor: V.tinta }} data-testid="entrega-ya-la-tenia" />
            Ya la tenía (se entregó antes de cargarla acá)
          </label>
        </div>
      )}

      {sinStock && (
        <div data-testid="entrega-sin-stock" className="flex flex-wrap items-center gap-3" style={{ color: V.warn }}>
          {hayEnOrigen ? `En el inventario hay ${hayEnOrigen}.` : 'En el inventario no hay stock de este talle.'}
          <label className="flex items-center gap-2" style={{ color: V.tintaSuave }}>
            ¿Cuántas hay en {talle?.origenes.find((o) => o.ubicacionId === origenElegido)?.rotulo ?? 'el Taller'}, contadas ahora?
            <input type="number" min={0} value={contado} onChange={(e) => setContado(e.target.value)} style={{ ...campo, width: 80 }} data-testid="entrega-contado" />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={entregar} disabled={enviando || !talle} style={{ ...primario, opacity: talle ? 1 : 0.5 }} data-testid="confirmar-entrega">
          {enviando ? 'Guardando…' : yaLaTenia ? 'Registrar' : 'Entregar'}
        </button>
        <button type="button" onClick={onCerrar} style={enlace}>cancelar</button>
        {error && <span role="alert" style={{ color: V.neg }}>{error}</span>}
      </div>
    </div>
  )
}

// ── HISTORIAL ───────────────────────────────────────────────────────────────────────────────────
function Historial({ filas }: { filas: FilaHistorial[] }) {
  return (
    <section data-testid="historial-epp" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-3" style={{ paddingBottom: 8, borderBottom: `1px solid ${V.linea}` }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: V.tinta }}>Historial</h2>
        <span style={{ fontSize: '12.5px', color: V.tenue }}>{filas.length ? `${filas.length} ${filas.length === 1 ? 'registro' : 'registros'}` : 'sin registros'}</span>
      </div>
      {filas.slice(0, 40).map((h, i) => (
        <div key={i} className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 sm:grid-cols-[88px_104px_minmax(0,1fr)_40px_minmax(0,1fr)]" style={{ fontSize: '12.5px', color: V.apagado, padding: '4px 0' }}>
          <span style={{ fontFamily: MONO, fontSize: '11.5px' }}>{diaMesAnio(h.fecha)}</span>
          <span style={{ color: h.tipo === 'baja' ? V.warn : V.tintaSuave }}>{ETIQUETA_EVENTO[h.tipo]}</span>
          <span className="col-start-2 sm:col-start-auto" style={{ color: V.tinta }}>{h.nombre}</span>
          <span className="col-start-2 sm:col-start-auto" style={{ fontVariantNumeric: 'tabular-nums' }}>× {h.cantidad}</span>
          <span className="col-start-2 sm:col-start-auto">
            {[h.tipo === 'historica' ? null : h.quien, h.lugar && (h.tipo === 'devolucion' ? `a ${h.lugar}` : `de ${h.lugar}`)].filter(Boolean).join(' · ')}
            {h.respaldo && <a href={h.respaldo} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>constancia</a>}
          </span>
        </div>
      ))}
    </section>
  )
}
