'use client'

// ═══ DICTAR PARTE — la maqueta aprobada por el dueño el 25/09/2026 (dictar-parte.html) ═══
//
// TELÉFONO, cuatro pasos: 1) «Dictar parte» amarillo arriba del parte de siempre; 2) grabando, con
// círculo, reloj, onda, «Terminar» y «Cancelar»; 3) revisión: el formulario lleno, en amarillo lo
// tomado del audio y en naranja lo dudoso con «confirmar», el aviso «Entendí N personas…», «Guardar
// parte» y «Dictar de nuevo»; 4) guardado, con el audio adjunto y «ver lo que dijo».
//
// COMPUTADORA: el mismo botón en la cabecera del Parte diario. A la izquierda el parte lleno (tabla de
// personas, estado, tarea y horas; avance, material y novedades); a la derecha «Lo que dijo», con cada
// dato resaltado donde se tomó; abajo «Descartar lo dictado» y «Guardar parte».
//
// LO QUE NUNCA HACE: guardar sin que la persona toque Guardar (`guardarDictado` sólo corre desde ese
// botón y `armarEnvio` rechaza si queda algo naranja), usar personas o tareas de otra obra (la
// propuesta sólo conoce las de esta, y la acción lo vuelve a controlar), perder lo que no entendió
// (arranca escrito en Novedades).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { C, DICTADO, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { UNIDADES } from '@/features/materiales/logica/pedidos'
import {
  armarEnvio, avisoDeConfirmar, faltaConfirmar, horasPorTarea, reloj, renglonesDeGente, resumenDeRevision,
  revisionInicial, textoDeAvance, textoGuardado, tramosDelTexto, nombreCortoDeTarea, textoDeMaterial,
  type Dictado, type EstadoDictado, type FilaMaterial, type FilaPersona, type Opcion,
  type ResultadoGuardado, type Revision,
} from '../../services/dictadoParte'
import { audioDelDictado, descartarDictado, dictadosDelDia, guardarDictado, leerDictado } from '../../services/dictadoParteActions'
import { subirDictado } from '../../services/subidaDictado'
import { empezarGrabacion, type Grabacion } from './grabadora'

const EYEBROW: CSSProperties = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }
const BOTON: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '44px', borderRadius: '8px',
  fontWeight: 600, fontSize: '14px', border: `1px solid ${C.bordeFuerte}`, background: C.superficie, color: C.tinta,
  fontFamily: 'inherit', cursor: 'pointer', padding: '0 16px',
}
const PRIMARIO: CSSProperties = { ...BOTON, background: C.marca, borderColor: C.marca, color: C.grafito }
const OSCURO: CSSProperties = { ...BOTON, background: C.grafito, borderColor: C.grafito, color: C.superficie }
const CONTROL: CSSProperties = {
  boxSizing: 'border-box', width: '100%', minWidth: 0, minHeight: '44px', padding: '0 10px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px',
  font: 'inherit', fontSize: '14px', background: C.superficie, color: C.tinta,
}
const CONTROL_PC: CSSProperties = { ...CONTROL, minHeight: '32px', fontSize: '13px', padding: '0 8px' }

const Mic = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)
const Stop = () => (<svg width={16} height={16} viewBox="0 0 24 24" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>)

// ═══════════════════════════════════════════ EL ESTADO ═══════════════════════════════════════════

type Fase =
  | { f: 'reposo' }
  | { f: 'grabando'; segundos: number; niveles: number[] }
  | { f: 'subiendo'; segundos: number }
  | { f: 'esperando'; id: string; estado: EstadoDictado; segundos: number; desde: number }
  | { f: 'revision'; dictado: Dictado; rev: Revision; error: string | null; guardando: boolean }
  | { f: 'guardado'; dictado: Dictado; resultado: ResultadoGuardado; rev: Revision; hora: string }
  | { f: 'error'; mensaje: string }

const horaAR = (iso?: string | null) => new Date(iso ?? Date.now()).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/San_Juan' })

export function useDictado(obraId: string, dia: string) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>({ f: 'reposo' })
  const [delDia, setDelDia] = useState<Dictado[]>([])
  const grabacion = useRef<Grabacion | null>(null)

  const releer = useCallback(async () => {
    const r = await dictadosDelDia(obraId, dia)
    if (r.ok) setDelDia(r.dato)
    return r.ok ? r.dato : []
  }, [obraId, dia])

  // Al cambiar de día: lo dictado ese día, y si quedó uno transcribiéndose, se lo sigue esperando.
  useEffect(() => {
    let vivo = true
    void dictadosDelDia(obraId, dia).then((r) => {
      if (!vivo) return
      const ds = r.ok ? r.dato : []
      setDelDia(ds)
      const enCurso = ds.find((d) => d.estado === 'pendiente' || d.estado === 'transcribiendo')
      setFase(enCurso
        ? { f: 'esperando', id: enCurso.id, estado: enCurso.estado, segundos: Number(enCurso.duracion_s), desde: Date.parse(enCurso.creado_en) }
        : { f: 'reposo' })
    })
    return () => { vivo = false; grabacion.current?.cancelar(); grabacion.current = null }
  }, [obraId, dia])

  // Mientras la VM transcribe, se pregunta cada 2 s.
  const esperandoId = fase.f === 'esperando' ? fase.id : null
  useEffect(() => {
    if (!esperandoId) return
    let vivo = true
    const t = setInterval(async () => {
      const r = await leerDictado(esperandoId)
      if (!vivo) return
      if (!r.ok) { setFase({ f: 'error', mensaje: r.error }); return }
      const d = r.dato
      if (d.estado === 'listo' && d.propuesta) setFase({ f: 'revision', dictado: d, rev: revisionInicial(d.propuesta), error: null, guardando: false })
      else if (d.estado === 'error') setFase({ f: 'error', mensaje: `No se pudo transcribir: ${d.motivo ?? 'error de la transcripción'}. Podés dictar de nuevo o cargarlo a mano.` })
      else if (d.estado === 'descartado' || d.estado === 'guardado') setFase({ f: 'reposo' })
      else setFase((f) => (f.f === 'esperando' ? { ...f, estado: d.estado } : f))
    }, 2000)
    return () => { vivo = false; clearInterval(t) }
  }, [esperandoId])

  const terminar = useCallback(async () => {
    const g = grabacion.current
    grabacion.current = null
    if (!g) return
    const { wav, segundos } = await g.terminar()
    if (segundos < 1) { setFase({ f: 'error', mensaje: 'La grabación quedó vacía: tocá «Dictar parte» y hablá unos segundos.' }); return }
    setFase({ f: 'subiendo', segundos })
    const r = await subirDictado(obraId, dia, wav, segundos)
    if (!r.ok) { setFase({ f: 'error', mensaje: r.error }); return }
    setFase({ f: 'esperando', id: r.id, estado: 'pendiente', segundos, desde: Date.now() })
  }, [obraId, dia])

  const empezar = useCallback(async () => {
    setFase({ f: 'grabando', segundos: 0, niveles: [] })
    const g = await empezarGrabacion({
      alNivel: (n, segundos) => setFase((f) => (f.f === 'grabando' ? { f: 'grabando', segundos, niveles: [...f.niveles.slice(-23), n] } : f)),
      alTope: () => { void terminar() },
    })
    if ('error' in g) { setFase({ f: 'error', mensaje: g.error }); return }
    grabacion.current = g
  }, [terminar])

  const cancelar = useCallback(() => { grabacion.current?.cancelar(); grabacion.current = null; setFase({ f: 'reposo' }) }, [])

  const descartar = useCallback(async (yDictar = false) => {
    const id = fase.f === 'revision' ? fase.dictado.id : fase.f === 'esperando' ? fase.id : null
    if (id) await descartarDictado(id)
    void releer()
    if (yDictar) void empezar()
    else setFase({ f: 'reposo' })
  }, [fase, releer, empezar])

  const editar = useCallback((cambio: (r: Revision) => Revision) => {
    setFase((f) => (f.f === 'revision' ? { ...f, rev: cambio(f.rev), error: null } : f))
  }, [])

  const guardar = useCallback(async (novedadActividad: string | null) => {
    if (fase.f !== 'revision') return
    const armado = armarEnvio(fase.rev, dia)
    if (!armado.ok) { setFase({ ...fase, error: armado.error }); return }
    setFase({ ...fase, guardando: true, error: null })
    const r = await guardarDictado(obraId, fase.dictado.id, armado.envio, novedadActividad)
    if (!r.ok) { setFase({ ...fase, guardando: false, error: r.error }); return }
    setFase({ f: 'guardado', dictado: fase.dictado, resultado: r.dato, rev: fase.rev, hora: horaAR() })
    void releer()
    router.refresh()
  }, [fase, dia, obraId, releer, router])

  const retomar = useCallback((d: Dictado) => {
    if (d.estado === 'listo' && d.propuesta) setFase({ f: 'revision', dictado: d, rev: revisionInicial(d.propuesta), error: null, guardando: false })
  }, [])

  return { fase, delDia, empezar, terminar, cancelar, descartar, editar, guardar, retomar, volver: () => setFase({ f: 'reposo' }) }
}

export type EstadoDictar = ReturnType<typeof useDictado>

// ═══════════════════════════════════════════ PIEZAS ══════════════════════════════════════════════

/** El botón amarillo. En el teléfono va de ancho completo arriba del parte; en la PC, en la cabecera. */
export function BotonDictar({ d, telefono }: { d: EstadoDictar; telefono: boolean }) {
  const ocupado = d.fase.f !== 'reposo' && d.fase.f !== 'error'
  return (
    <button type="button" onClick={() => void d.empezar()} disabled={ocupado} data-testid="dictar-parte"
      style={{ ...PRIMARIO, width: telefono ? '100%' : undefined, minHeight: telefono ? '48px' : '36px', fontSize: telefono ? '14px' : '13px', opacity: ocupado ? 0.6 : 1 }}>
      <Mic />Dictar parte
    </button>
  )
}

function Chip({ tipo, children, onClick }: { tipo: 'd' | 'q' | 'ok' | 'x'; children: ReactNode; onClick?: () => void }) {
  const st: Record<string, CSSProperties> = {
    d: { background: DICTADO.datoChip, color: DICTADO.datoChipTexto },
    q: { background: DICTADO.dudaChip, color: C.warn },
    ok: { background: DICTADO.posFondo, color: C.pos },
    x: { background: C.tenueFondo, color: C.tenue },
  }
  const base: CSSProperties = { fontFamily: MONO, fontSize: '10.5px', fontWeight: 500, borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap', border: 'none', ...st[tipo] }
  if (!onClick) return <span style={base}>{children}</span>
  // Como control, la zona de toque llega a 44 aunque el chip se vea chico.
  return (
    <button type="button" onClick={onClick} style={{ background: 'transparent', border: 'none', padding: '0', minHeight: '44px', minWidth: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: 'inherit' }}>
      <span style={base}>{children}</span>
    </button>
  )
}

/** Un chip por fila: dictado (amarillo), confirmar (naranja, toca para confirmar), confirmado, quitado. */
function chipDe(f: { incluida: boolean; dudoso: boolean; confirmada: boolean; persona_id?: string | null }, confirmar?: () => void) {
  if (!f.incluida) return <Chip tipo="x">quitado</Chip>
  if (faltaConfirmar(f)) return <Chip tipo="q" onClick={'persona_id' in f && f.persona_id == null ? undefined : confirmar}>confirmar</Chip>
  if (f.dudoso && f.confirmada) return <Chip tipo="ok">confirmado</Chip>
  return <Chip tipo="d">dictado</Chip>
}

const fondoFila = (f: { incluida: boolean; dudoso: boolean; confirmada: boolean; persona_id?: string | null }): CSSProperties => (
  !f.incluida ? { opacity: 0.5 } : faltaConfirmar(f) ? { background: DICTADO.dudaFondo } : { background: DICTADO.datoFondo }
)

function Aviso({ tono, children, testid }: { tono: 'info' | 'warn' | 'pos' | 'neg'; children: ReactNode; testid?: string }) {
  const st: Record<string, CSSProperties> = {
    info: { background: DICTADO.infoFondo, color: DICTADO.infoTexto },
    warn: { background: DICTADO.dudaFondo, color: C.warn },
    pos: { background: DICTADO.posFondo, color: C.pos },
    neg: { background: C.negFondo, color: C.neg },
  }
  return <div data-testid={testid} role={tono === 'neg' || tono === 'warn' ? 'alert' : undefined} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12.5px', borderRadius: '8px', padding: '9px 11px', ...st[tono] }}>{children}</div>
}

/** «Lo que dijo», con cada dato marcado donde se tomó. */
function Transcripcion({ dictado }: { dictado: Dictado }) {
  const texto = dictado.transcripcion ?? dictado.propuesta?.texto ?? ''
  const tramos = tramosDelTexto(texto, dictado.propuesta?.marcas ?? [])
  return (
    <p data-testid="dictado-transcripcion" style={{ fontSize: '13px', color: C.tintaMedia, lineHeight: 1.55, margin: 0 }}>
      «{tramos.map((t, i) => t.tipo == null ? <span key={i}>{t.texto}</span> : (
        <mark key={i} style={{ background: t.tipo === 'duda' ? DICTADO.dudaChip : DICTADO.datoChip, borderRadius: '3px', padding: '0 2px', color: 'inherit' }}>{t.texto}</mark>
      ))}»
    </p>
  )
}

function Escuchar({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (src) return <audio controls src={src} autoPlay style={{ width: '100%', height: '44px' }} data-testid="dictado-audio" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <button type="button" style={{ ...BOTON, fontWeight: 500, fontSize: '13px' }} data-testid="dictado-escuchar"
        onClick={async () => { const r = await audioDelDictado(id); if (r.ok) setSrc(r.dato); else setError(r.error) }}>
        ▶ Escuchar el audio
      </button>
      {error && <span style={{ fontSize: '12px', color: C.neg }}>{error}</span>}
    </div>
  )
}

function Leyenda() {
  const sw = (bg: string): CSSProperties => ({ width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${C.borde}`, background: bg, display: 'inline-block' })
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: C.tintaSuave }}>
      <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><i style={sw(DICTADO.datoChip)} />tomado del audio</span>
      <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}><i style={sw(DICTADO.dudaChip)} />para confirmar</span>
    </div>
  )
}

/** «Lo que dijo» de un dictado ya guardado: se abre desde el parte. */
export function VerLoQueDijo({ dictado, cerrar }: { dictado: Dictado; cerrar: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Lo que dijo" data-testid="dictado-ver"
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(31,31,30,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={cerrar}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.superficie, width: '100%', maxWidth: '560px', borderRadius: '12px 12px 0 0', padding: '16px 16px 24px', display: 'grid', gap: '12px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={EYEBROW}>Lo que dijo · {reloj(Number(dictado.duracion_s))}</div>
          <button type="button" aria-label="Cerrar" onClick={cerrar} style={{ ...BOTON, width: '44px', padding: 0, border: 'none' }}><Ico d={P.cerrar} s={16} /></button>
        </div>
        <Transcripcion dictado={dictado} />
        <Leyenda />
        <Escuchar id={dictado.id} />
      </div>
    </div>
  )
}

/** Lo dictado del día, en el parte de siempre: «Dictado 0:52 · ver lo que dijo», y el que quedó sin revisar. */
export function DictadosDelDia({ d }: { d: EstadoDictar }) {
  const [viendo, setViendo] = useState<Dictado | null>(null)
  const guardados = d.delDia.filter((x) => x.estado === 'guardado')
  const sinRevisar = d.delDia.find((x) => x.estado === 'listo')
  if (!guardados.length && !sinRevisar) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} data-testid="dictados-del-dia">
      <div style={EYEBROW}>Dictado</div>
      {sinRevisar && d.fase.f === 'reposo' && (
        <button type="button" onClick={() => d.retomar(sinRevisar)} data-testid="dictado-retomar"
          style={{ ...BOTON, justifyContent: 'space-between', fontWeight: 500, background: DICTADO.dudaFondo, borderColor: DICTADO.dudaBorde, color: C.warn }}>
          <span>Hay un dictado sin revisar</span><span>Revisar</span>
        </button>
      )}
      {guardados.map((g) => (
        <button key={g.id} type="button" onClick={() => setViendo(g)} data-testid="dictado-ver-lo-que-dijo"
          style={{ ...BOTON, justifyContent: 'flex-start', fontWeight: 400, fontFamily: MONO, fontSize: '12.5px', color: C.tintaSuave }}>
          <Mic s={14} />{reloj(Number(g.duracion_s))} · guardado {horaAR(g.cerrado_en)} · ver lo que dijo
        </button>
      ))}
      {viendo && <VerLoQueDijo dictado={viendo} cerrar={() => setViendo(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════ LA PANTALLA ═════════════════════════════════════════════

interface Pantalla {
  d: EstadoDictar
  telefono: boolean
  /** Cuántos esperados tiene la obra ese día: «Asistencia · 6 de 7». */
  plantel: number
  /** Las tareas de la obra que se pueden elegir al corregir (las de la 04, sin resumen ni archivadas). */
  tareas: Opcion[]
  /** A qué frente se cuelga la novedad (el primero en curso, igual que el parte tipeado). */
  novedadActividad: string | null
}

/** Lo que reemplaza al formulario mientras se dicta, se espera, se revisa o se acaba de guardar. */
export function PantallaDictado(p: Pantalla) {
  const { fase } = p.d
  if (fase.f === 'reposo') return null
  if (fase.f === 'grabando') return <Grabando {...p} segundos={fase.segundos} niveles={fase.niveles} />
  if (fase.f === 'subiendo' || fase.f === 'esperando') {
    return <Esperando {...p} segundos={fase.segundos} titulo={fase.f === 'subiendo' ? 'Subiendo el audio…' : 'Escuchando lo que dijiste…'} />
  }
  if (fase.f === 'error') {
    return (
      <div style={{ padding: p.telefono ? '16px 16px 24px' : '22px 30px', display: 'grid', gap: '12px', maxWidth: '640px' }}>
        <Aviso tono="neg" testid="dictado-error">{fase.mensaje}</Aviso>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" style={PRIMARIO} onClick={() => void p.d.empezar()}><Mic />Dictar de nuevo</button>
          <button type="button" style={BOTON} onClick={p.d.volver}>Cargar a mano</button>
        </div>
      </div>
    )
  }
  if (fase.f === 'guardado') return <Guardado {...p} fase={fase} />
  return p.telefono ? <RevisionTelefono {...p} fase={fase} /> : <RevisionPC {...p} fase={fase} />
}

function Grabando({ d, telefono, segundos, niveles }: Pantalla & { segundos: number; niveles: number[] }) {
  const arriba = useArriba<HTMLDivElement>(telefono)
  const barras = Array.from({ length: 12 }, (_, i) => niveles[niveles.length - 12 + i] ?? 0)
  const cuerpo = (
    <div style={{ display: 'grid', placeItems: 'center', gap: '14px', padding: '18px 0 6px', textAlign: 'center' }} data-testid="dictado-grabando">
      <div style={{ width: '112px', height: '112px', borderRadius: '50%', background: C.marca, display: 'grid', placeItems: 'center', color: C.tinta, boxShadow: '0 0 0 10px rgba(253,201,0,.22),0 0 0 22px rgba(253,201,0,.10)' }}>
        <Mic s={40} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: '22px', fontWeight: 500 }} aria-live="off" data-testid="dictado-reloj">{reloj(segundos)}</div>
      <div aria-hidden style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '34px' }}>
        {barras.map((n, i) => <i key={i} style={{ display: 'block', width: '4px', borderRadius: '2px', background: C.grafito, opacity: 0.8, height: `${Math.max(6, Math.round(6 + n * 28))}px`, transition: 'height .1s' }} />)}
      </div>
      <p style={{ fontSize: '13px', color: C.tintaMedia, background: C.bordeFila, borderRadius: '8px', padding: '10px 12px', textAlign: 'left', margin: 0, maxWidth: '420px' }}>
        Contá quién vino, cuántas horas y en qué, cuánto se avanzó, qué falta y cualquier novedad.
      </p>
      {segundos > 150 && <span style={{ fontSize: '12px', color: C.warn }}>Quedan {Math.max(0, 180 - Math.round(segundos))} s: a los 3 minutos se corta solo.</span>}
    </div>
  )
  const botones = (
    <>
      <button type="button" style={{ ...OSCURO, minHeight: telefono ? '48px' : '44px' }} onClick={() => void d.terminar()} data-testid="dictado-terminar"><Stop />Terminar</button>
      <button type="button" style={{ ...BOTON, minHeight: telefono ? '48px' : '44px' }} onClick={d.cancelar} data-testid="dictado-cancelar">Cancelar</button>
    </>
  )
  if (!telefono) {
    return (
      <div style={{ padding: '22px 30px 30px', display: 'grid', justifyItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700 }}>Dictando el parte</div>
        {cuerpo}
        <div style={{ display: 'flex', gap: '10px' }}>{botones}</div>
      </div>
    )
  }
  return (
    <div ref={arriba} style={{ padding: '16px 16px 150px', scrollMarginTop: '56px' }}>
      <div style={{ fontSize: '16px', fontWeight: 700 }}>Dictando el parte</div>
      {cuerpo}
      <Pie>{botones}</Pie>
    </div>
  )
}

/** En el teléfono, cada pantalla del dictado arranca arriba: la cabecera de la obra se va de la vista
 *  y queda lugar para el círculo, el reloj y la onda (o para «Revisá el parte») sobre el pie fijo. */
function useArriba<T extends HTMLElement>(telefono: boolean) {
  const ref = useRef<T | null>(null)
  useEffect(() => { if (telefono) ref.current?.scrollIntoView({ block: 'start' }) }, [telefono])
  return ref
}

/** El pie fijo del teléfono, sobre la barra de abajo (como «Registrar el parte» de la M08). */
function Pie({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '10px 16px 12px', background: C.superficie,
      borderTop: `1px solid ${C.borde}`, zIndex: 10, margin: '0 auto', maxWidth: '430px', display: 'grid', gap: '8px',
    }}>{children}</div>
  )
}

function Esperando({ d, telefono, segundos, titulo }: Pantalla & { segundos: number; titulo: string }) {
  const arriba = useArriba<HTMLDivElement>(telefono)
  return (
    <div ref={arriba} style={{ scrollMarginTop: '56px', padding: telefono ? '16px 16px 150px' : '22px 30px 30px', display: 'grid', justifyItems: telefono ? 'stretch' : 'center', gap: '14px' }} data-testid="dictado-esperando">
      <div style={{ fontSize: '16px', fontWeight: 700 }}>{titulo}</div>
      <div style={{ display: 'grid', placeItems: 'center', gap: '10px', padding: '12px 0' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: DICTADO.datoFondo, border: `1px solid ${DICTADO.datoBorde}`, display: 'grid', placeItems: 'center' }}><Mic s={28} /></div>
        <div style={{ fontFamily: MONO, fontSize: '13px', color: C.tintaSuave }}>{reloj(segundos)} de audio</div>
        <p style={{ fontSize: '13px', color: C.tintaMedia, margin: 0, textAlign: 'center', maxWidth: '380px' }}>
          Se transcribe en el servidor de la empresa: tarda unos segundos por minuto de audio. Nada se guarda hasta que lo revises.
        </p>
      </div>
      {telefono
        ? <Pie><button type="button" style={{ ...BOTON, minHeight: '48px' }} onClick={() => void d.descartar()}>Cancelar</button></Pie>
        : <button type="button" style={BOTON} onClick={() => void d.descartar()}>Cancelar</button>}
    </div>
  )
}

// ── LA REVISIÓN: EDITAR UNA FILA ─────────────────────────────────────────────────────────────────

type Rev = Extract<Fase, { f: 'revision' }>
const cambiarPersona = (clave: string, c: Partial<Revision['personas'][number]>) => (r: Revision): Revision =>
  ({ ...r, personas: r.personas.map((f) => (f.clave === clave ? { ...f, ...c } : f)) })
const cambiarAvance = (clave: string, c: Partial<Revision['avances'][number]>) => (r: Revision): Revision =>
  ({ ...r, avances: r.avances.map((f) => (f.clave === clave ? { ...f, ...c } : f)) })
const cambiarMaterial = (clave: string, c: Partial<Revision['materiales'][number]>) => (r: Revision): Revision =>
  ({ ...r, materiales: r.materiales.map((f) => (f.clave === clave ? { ...f, ...c } : f)) })

const leerNum = (v: string): number | null => {
  const n = Number(v.replace(',', '.'))
  return v.trim() === '' || !Number.isFinite(n) ? null : n
}

/** Las opciones de tarea: las que la propuesta dudó primero, después todas las de la obra. */
function opcionesDeTarea(tareas: Opcion[], candidatas: Opcion[] = []): Opcion[] {
  const ya = new Set(candidatas.map((c) => c.id))
  return [...candidatas, ...tareas.filter((t) => !ya.has(t.id))]
}

function EditorPersona({ f, p, pc = false }: { f: Revision['personas'][number]; p: Pantalla; pc?: boolean }) {
  const ed = p.d.editar
  const ctrl = pc ? CONTROL_PC : CONTROL
  return (
    <div style={{ display: 'grid', gap: '8px', padding: '10px', background: C.superficie, borderTop: `1px solid ${C.bordeFila}` }} data-testid={`dictado-editor-${f.clave}`}>
      {f.candidatos && f.candidatos.length > 1 && (
        <label style={{ display: 'grid', gap: '4px' }}>
          <span style={EYEBROW}>¿Cuál {f.nombre}?</span>
          <select value={f.persona_id ?? ''} style={ctrl} onChange={(e) => {
            const c = f.candidatos?.find((x) => x.id === e.target.value)
            ed(cambiarPersona(f.clave, { persona_id: c?.id ?? null, nombre: c?.nombre ?? f.nombre, confirmada: Boolean(c) }))
          }}>
            <option value="">Elegí a la persona</option>
            {f.candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['presente', 'ausente'] as const).map((e) => (
          <button key={e} type="button" onClick={() => ed(cambiarPersona(f.clave, { estado: e, horas: e === 'presente' ? (f.horas ?? 8) : f.horas }))}
            aria-pressed={f.estado === e}
            style={{ ...BOTON, ...(pc ? { minHeight: '32px', fontSize: '13px' } : {}), flex: 1, fontWeight: f.estado === e ? 600 : 400, background: f.estado === e ? C.grafito : C.superficie, color: f.estado === e ? C.superficie : C.tinta }}>
            {e === 'presente' ? 'Vino' : 'Faltó'}
          </button>
        ))}
      </div>
      {f.estado === 'presente' && (
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '8px' }}>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={EYEBROW}>Horas</span>
            <input inputMode="decimal" defaultValue={f.horas ?? ''} style={{ ...ctrl, fontFamily: MONO, textAlign: 'right' }} aria-label={`Horas de ${f.nombre}`}
              onChange={(e) => ed(cambiarPersona(f.clave, { horas: leerNum(e.target.value) }))} />
          </label>
          <label style={{ display: 'grid', gap: '4px', minWidth: 0 }}>
            <span style={EYEBROW}>Tarea</span>
            <select value={f.tarea_id ?? ''} style={{ ...ctrl, minWidth: 0 }} aria-label={`Tarea de ${f.nombre}`}
              onChange={(e) => ed(cambiarPersona(f.clave, { tarea_id: e.target.value || null, tarea_nombre: p.tareas.find((t) => t.id === e.target.value)?.nombre ?? null }))}>
              <option value="">sin tarea</option>
              {opcionesDeTarea(p.tareas, f.tarea_candidatos).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
        </div>
      )}
      {f.motivo && f.incluida && faltaConfirmar(f) && <span style={{ fontSize: '12px', color: C.warn }}>{f.motivo}</span>}
      <div style={{ display: 'flex', gap: '8px' }}>
        {f.incluida && faltaConfirmar(f) && f.persona_id != null && (
          <button type="button" style={{ ...OSCURO, ...(pc ? { minHeight: '32px', fontSize: '13px' } : {}), flex: 1 }} onClick={() => ed(cambiarPersona(f.clave, { confirmada: true }))}>Confirmar</button>
        )}
        <button type="button" style={{ ...BOTON, ...(pc ? { minHeight: '32px', fontSize: '13px' } : {}), flex: 1, fontWeight: 500 }} onClick={() => ed(cambiarPersona(f.clave, { incluida: !f.incluida }))}>
          {f.incluida ? 'Quitar' : 'Volver a poner'}
        </button>
      </div>
    </div>
  )
}

function EditorAvance({ a, p, pc = false }: { a: Revision['avances'][number]; p: Pantalla; pc?: boolean }) {
  const ed = p.d.editar
  const ctrl = pc ? CONTROL_PC : CONTROL
  const btn = pc ? { minHeight: '32px', fontSize: '13px' } : {}
  return (
    <div style={{ display: 'grid', gap: '8px', padding: '10px', borderTop: `1px solid ${C.bordeFila}`, background: C.superficie }}>
      <select value={a.tarea_id} style={ctrl} aria-label="Tarea del avance"
        onChange={(e) => ed(cambiarAvance(a.clave, { tarea_id: e.target.value, tarea_nombre: p.tareas.find((t) => t.id === e.target.value)?.nombre ?? a.tarea_nombre }))}>
        {opcionesDeTarea(p.tareas, a.candidatos.length ? a.candidatos : [{ id: a.tarea_id, nombre: a.tarea_nombre }]).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
      </select>
      <label style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '12.5px', color: C.tintaSuave }}>Hoy ({a.unidad || '%'}) · antes {a.actual} {a.unidad}</span>
        <input inputMode="decimal" defaultValue={a.produccion ?? ''} style={{ ...ctrl, fontFamily: MONO, textAlign: 'right' }} aria-label="Avance de hoy"
          onChange={(e) => ed(cambiarAvance(a.clave, { produccion: leerNum(e.target.value) }))} />
      </label>
      {a.motivo && faltaConfirmar(a) && <span style={{ fontSize: '12px', color: C.warn }}>{a.motivo}</span>}
      <div style={{ display: 'flex', gap: '8px' }}>
        {faltaConfirmar(a) && <button type="button" style={{ ...OSCURO, ...btn, flex: 1 }} onClick={() => ed(cambiarAvance(a.clave, { confirmada: true }))}>Confirmar</button>}
        <button type="button" style={{ ...BOTON, ...btn, flex: 1, fontWeight: 500 }} onClick={() => ed(cambiarAvance(a.clave, { incluida: !a.incluida }))}>{a.incluida ? 'Quitar' : 'Volver a poner'}</button>
      </div>
    </div>
  )
}

function EditorMaterial({ m, p, pc = false }: { m: Revision['materiales'][number]; p: Pantalla; pc?: boolean }) {
  const ed = p.d.editar
  const ctrl = pc ? CONTROL_PC : CONTROL
  const unidades = [...new Set([m.unidad, ...UNIDADES])]
  return (
    <div style={{ display: 'grid', gap: '8px', padding: '10px', borderTop: `1px solid ${C.bordeFila}`, background: C.superficie }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 96px 1fr', gap: '8px' }}>
        <input inputMode="decimal" defaultValue={m.cantidad} aria-label="Cantidad" style={{ ...ctrl, fontFamily: MONO, textAlign: 'right' }}
          onChange={(e) => ed(cambiarMaterial(m.clave, { cantidad: leerNum(e.target.value) ?? 0 }))} />
        <select value={m.unidad} aria-label="Unidad" style={ctrl} onChange={(e) => ed(cambiarMaterial(m.clave, { unidad: e.target.value }))}>
          {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input defaultValue={m.material} aria-label="Material" style={{ ...ctrl, minWidth: 0 }} onChange={(e) => ed(cambiarMaterial(m.clave, { material: e.target.value }))} />
      </div>
      <button type="button" style={{ ...BOTON, ...(pc ? { minHeight: '32px', fontSize: '13px' } : {}), fontWeight: 500 }} onClick={() => ed(cambiarMaterial(m.clave, { incluida: !m.incluida }))}>{m.incluida ? 'Quitar' : 'Volver a poner'}</button>
    </div>
  )
}

const nombreCorto = (f: FilaPersona) => f.nombre

// ── LA REVISIÓN EN EL TELÉFONO (paso 3) ──────────────────────────────────────────────────────────

function RevisionTelefono(p: Pantalla & { fase: Rev }) {
  const { rev, dictado, error, guardando } = p.fase
  const [abierta, setAbierta] = useState<string | null>(null)
  const [verGrupo, setVerGrupo] = useState<Set<string>>(new Set())
  const renglones = useMemo(() => renglonesDeGente(rev.personas), [rev.personas])
  const presentes = rev.personas.filter((f) => f.incluida && f.estado === 'presente').length
  const alternar = (k: string) => setAbierta((a) => (a === k ? null : k))
  const avisos = dictado.propuesta?.avisos ?? []
  const arriba = useArriba<HTMLDivElement>(true)

  const filaPersona = (f: Revision['personas'][number]) => (
    <div key={f.clave}>
      <button type="button" onClick={() => alternar(f.clave)} data-testid={`dictado-persona-${f.clave}`} aria-expanded={abierta === f.clave}
        data-duda={faltaConfirmar(f) ? '1' : undefined}
        style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'center', padding: '0 10px', minHeight: '44px', border: 'none', borderTop: `1px solid ${C.bordeFila}`, font: 'inherit', fontSize: '14px', textAlign: 'left', cursor: 'pointer', color: C.tinta, ...fondoFila(f) }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreCorto(f)}{f.persona_id == null ? ' ?' : ''}</span>
        <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{f.estado === 'presente' && f.horas != null ? `${String(f.horas).replace('.', ',')} h` : '—'}</span>
        <span style={{ fontSize: '12px', color: f.estado === 'presente' ? C.pos : C.neg }}>{f.estado === 'presente' ? 'Presente' : faltaConfirmar(f) ? 'Faltó ?' : 'Faltó'}</span>
      </button>
      {abierta === f.clave && <EditorPersona f={f} p={p} />}
    </div>
  )

  return (
    <div ref={arriba} style={{ padding: '16px 16px 170px', display: 'grid', gap: '12px', alignContent: 'start', scrollMarginTop: '56px' }} data-testid="dictado-revision">
      <div style={{ fontSize: '16px', fontWeight: 700 }}>Revisá el parte</div>
      <Aviso tono="info" testid="dictado-resumen">{resumenDeRevision(rev)}</Aviso>
      {avisos.map((a, i) => <Aviso key={i} tono="warn">{a.texto}</Aviso>)}

      <div style={{ display: 'grid', gap: '4px' }}>
        <div style={EYEBROW}>Asistencia · {presentes} de {Math.max(p.plantel, presentes)}</div>
        {rev.personas.length === 0
          ? <div style={{ ...CAJA, color: C.tenue }}>No entendí a nadie del plantel</div>
          : (
            <div style={{ display: 'grid', border: `1px solid ${C.borde}`, borderRadius: '6px', overflow: 'hidden' }}>
              {renglones.map((r, i) => {
                if (r.tipo === 'persona') return filaPersona(r.fila)
                const k = `g${i}`
                const abierto = verGrupo.has(k)
                const f0 = r.filas[0]
                return (
                  <div key={k}>
                    <button type="button" data-testid={`dictado-grupo-${i}`} aria-expanded={abierto}
                      onClick={() => setVerGrupo((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}
                      style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'center', padding: '0 10px', minHeight: '44px', border: 'none', borderTop: `1px solid ${C.bordeFila}`, font: 'inherit', fontSize: '14px', textAlign: 'left', cursor: 'pointer', color: C.tinta, ...fondoFila({ incluida: r.incluida, dudoso: r.dudoso, confirmada: r.filas.every((f) => f.confirmada) }) }}>
                      <span>{r.n} más{f0.tarea_nombre ? ` · ${nombreCortoDeTarea(f0.tarea_nombre)}` : ''}</span>
                      <span style={{ fontFamily: MONO }}>{String(r.horas).replace('.', ',')} h</span>
                      <span style={{ fontSize: '12px', color: C.pos }}>Presentes</span>
                    </button>
                    {abierto && r.filas.map(filaPersona)}
                  </div>
                )
              })}
            </div>
            )}
      </div>

      <div style={{ display: 'grid', gap: '4px' }}>
        <div style={EYEBROW}>Avance</div>
        {rev.avances.length === 0 && <div style={{ ...CAJA, color: C.tenue }}>Sin avance dictado</div>}
        {rev.avances.map((a) => <CajaAvance key={a.clave} a={a} p={p} abierta={abierta === a.clave} alternar={() => alternar(a.clave)} />)}
      </div>

      <div style={{ display: 'grid', gap: '4px' }}>
        <div style={EYEBROW}>Material que falta</div>
        {rev.materiales.length === 0 && <div style={{ ...CAJA, color: C.tenue }}>Nada pedido</div>}
        {rev.materiales.map((m) => <CajaMaterial key={m.clave} m={m} p={p} abierta={abierta === m.clave} alternar={() => alternar(m.clave)} />)}
        {rev.materiales.some((m) => m.incluida) && <Urgencia p={p} rev={rev} />}
      </div>

      <Novedades p={p} rev={rev} />

      <details style={{ fontSize: '13px' }}>
        <summary style={{ ...EYEBROW, cursor: 'pointer', minHeight: '44px', display: 'flex', alignItems: 'center' }}>Lo que dijo · {reloj(Number(dictado.duracion_s))}</summary>
        <div style={{ display: 'grid', gap: '10px', paddingTop: '6px' }}>
          <Transcripcion dictado={dictado} />
          <Leyenda />
          <Escuchar id={dictado.id} />
        </div>
      </details>

      {error && <Aviso tono="neg" testid="dictado-guardar-error">{error}</Aviso>}
      <Pie>
        <button type="button" style={{ ...PRIMARIO, minHeight: '48px' }} disabled={guardando} onClick={() => void p.d.guardar(p.novedadActividad)} data-testid="dictado-guardar">
          {guardando ? 'Guardando…' : 'Guardar parte'}
        </button>
        <button type="button" style={{ ...BOTON, minHeight: '48px' }} disabled={guardando} onClick={() => void p.d.descartar(true)} data-testid="dictado-de-nuevo"><Mic />Dictar de nuevo</button>
      </Pie>
    </div>
  )
}

const CAJA: CSSProperties = {
  border: `1px solid ${C.borde}`, borderRadius: '6px', padding: '9px 10px', minHeight: '44px', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: C.superficie, boxSizing: 'border-box', fontSize: '14px',
}
const cajaDe = (f: { incluida: boolean; dudoso: boolean; confirmada: boolean }): CSSProperties => ({
  ...CAJA, ...(!f.incluida ? { opacity: 0.5 } : faltaConfirmar(f) ? { background: DICTADO.dudaFondo, borderColor: DICTADO.dudaBorde } : { background: DICTADO.datoFondo, borderColor: DICTADO.datoBorde }),
})

function CajaAvance({ a, p, abierta, alternar, pc = false }: { a: Revision['avances'][number]; p: Pantalla; abierta: boolean; alternar: () => void; pc?: boolean }) {
  const t = textoDeAvance(a)
  return (
    <div style={{ border: abierta ? `1px solid ${C.borde}` : 'none', borderRadius: '6px', overflow: 'hidden' }}>
      <button type="button" onClick={alternar} aria-expanded={abierta} data-testid={`dictado-avance-${a.clave}`} data-duda={faltaConfirmar(a) ? '1' : undefined} style={{ ...cajaDe(a), width: '100%', font: 'inherit', fontSize: pc ? '13px' : '14px', cursor: 'pointer', color: C.tinta, textAlign: 'left' }}>
        <span style={{ minWidth: 0 }}>{pc ? a.tarea_nombre : nombreCortoDeTarea(a.tarea_nombre)} · <b style={{ fontFamily: MONO }}>{t.dicho}</b>{t.hoy && <span style={{ color: C.tintaSuave, fontSize: '12px' }}> ({t.hoy})</span>}</span>
        {chipDe(a)}
      </button>
      {abierta && <EditorAvance a={a} p={p} pc={pc} />}
    </div>
  )
}

function CajaMaterial({ m, p, abierta, alternar, pc = false }: { m: Revision['materiales'][number]; p: Pantalla; abierta: boolean; alternar: () => void; pc?: boolean }) {
  return (
    <div style={{ border: abierta ? `1px solid ${C.borde}` : 'none', borderRadius: '6px', overflow: 'hidden' }}>
      <button type="button" onClick={alternar} aria-expanded={abierta} data-testid={`dictado-material-${m.clave}`} style={{ ...cajaDe(m), width: '100%', font: 'inherit', fontSize: pc ? '13px' : '14px', cursor: 'pointer', color: C.tinta, textAlign: 'left' }}>
        <span>{(() => { const [n, ...resto] = textoDeMaterial(m).split(' '); return <><b style={{ fontFamily: MONO }}>{n}</b> {resto.join(' ')}</> })()}</span>
        {chipDe(m)}
      </button>
      {abierta && <EditorMaterial m={m} p={p} pc={pc} />}
    </div>
  )
}

function Urgencia({ p, rev, pc = false }: { p: Pantalla; rev: Revision; pc?: boolean }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '8px', alignItems: 'center', fontSize: '12.5px', color: C.tintaSuave }}>
      Para cuándo
      <select value={rev.urgencia} style={pc ? CONTROL_PC : CONTROL} aria-label="Urgencia del pedido"
        onChange={(e) => p.d.editar((r) => ({ ...r, urgencia: e.target.value as FilaMaterial['urgencia'] }))}>
        <option value="hoy">Hoy (frena el trabajo)</option>
        <option value="semana">Esta semana</option>
        <option value="cuando_se_pueda">Cuando se pueda</option>
      </select>
    </label>
  )
}

function Novedades({ p, rev, pc = false }: { p: Pantalla; rev: Revision; pc?: boolean }) {
  const lleno = rev.novedad.trim().length > 0
  return (
    <label style={{ display: 'grid', gap: '4px' }}>
      <span style={EYEBROW}>Novedades{lleno ? ' · lo que no entendí' : ''}</span>
      <textarea value={rev.novedad} maxLength={1000} placeholder="—" aria-label="Novedades" data-testid="dictado-novedad"
        onChange={(e) => p.d.editar((r) => ({ ...r, novedad: e.target.value }))}
        style={{ boxSizing: 'border-box', width: '100%', minHeight: pc ? '72px' : '88px', padding: '10px', border: `1px solid ${lleno ? DICTADO.datoBorde : C.borde}`, background: lleno ? DICTADO.datoFondo : C.superficie, borderRadius: '6px', font: 'inherit', fontSize: '13px', resize: 'vertical', color: C.tinta }} />
    </label>
  )
}

// ── LA REVISIÓN EN LA COMPUTADORA ────────────────────────────────────────────────────────────────

function RevisionPC(p: Pantalla & { fase: Rev }) {
  const { rev, dictado, error, guardando } = p.fase
  const ed = p.d.editar
  const [abierta, setAbierta] = useState<string | null>(null)
  const [verGrupo, setVerGrupo] = useState<Set<string>>(new Set())
  const renglones = useMemo(() => renglonesDeGente(rev.personas), [rev.personas])
  const aviso = avisoDeConfirmar(rev)
  const avisos = dictado.propuesta?.avisos ?? []
  const th: CSSProperties = { ...EYEBROW, textAlign: 'left', padding: '8px', borderBottom: `1px solid ${C.borde}` }
  const td: CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.bordeFila}`, verticalAlign: 'middle' }

  const fila = (f: Revision['personas'][number], sangria = false) => (
    <tr key={f.clave} data-testid={`dictado-persona-${f.clave}`} style={fondoFila(f)}>
      <td style={{ ...td, paddingLeft: sangria ? '22px' : '8px' }}>
        {f.candidatos && f.candidatos.length > 1 && f.persona_id == null
          ? (
            <select value="" style={CONTROL_PC} aria-label={`¿Cuál ${f.nombre}?`} onChange={(e) => {
              const c = f.candidatos?.find((x) => x.id === e.target.value)
              if (c) ed(cambiarPersona(f.clave, { persona_id: c.id, nombre: c.nombre, confirmada: true }))
            }}>
              <option value="">¿Cuál {f.nombre}?</option>
              {f.candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            )
          : f.nombre}
      </td>
      <td style={td}>
        <select value={f.estado} style={{ ...CONTROL_PC, color: f.estado === 'presente' ? C.pos : C.neg }} aria-label={`Estado de ${f.nombre}`}
          onChange={(e) => ed(cambiarPersona(f.clave, { estado: e.target.value as FilaPersona['estado'], horas: e.target.value === 'presente' ? (f.horas ?? 8) : f.horas }))}>
          <option value="presente">Presente</option>
          <option value="ausente">{faltaConfirmar(f) && f.estado === 'ausente' ? 'Ausente ?' : 'Ausente'}</option>
        </select>
      </td>
      <td style={td}>
        {f.estado === 'presente'
          ? (
            <select value={f.tarea_id ?? ''} style={{ ...CONTROL_PC, maxWidth: '220px' }} aria-label={`Tarea de ${f.nombre}`}
              onChange={(e) => ed(cambiarPersona(f.clave, { tarea_id: e.target.value || null, tarea_nombre: p.tareas.find((t) => t.id === e.target.value)?.nombre ?? null }))}>
              <option value="">—</option>
              {opcionesDeTarea(p.tareas, f.tarea_candidatos).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            )
          : '—'}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        {f.estado === 'presente'
          ? <input inputMode="decimal" defaultValue={f.horas ?? ''} aria-label={`Horas de ${f.nombre}`} style={{ ...CONTROL_PC, width: '64px', textAlign: 'right', fontFamily: MONO }} onChange={(e) => ed(cambiarPersona(f.clave, { horas: leerNum(e.target.value) }))} />
          : <span style={{ fontFamily: MONO }}>—</span>}
      </td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        <span title={f.motivo ?? undefined}>{chipDe(f, () => ed(cambiarPersona(f.clave, { confirmada: true })))}</span>
        <button type="button" aria-label={f.incluida ? `Quitar a ${f.nombre}` : `Volver a poner a ${f.nombre}`} title={f.incluida ? 'Quitar' : 'Volver a poner'}
          onClick={() => ed(cambiarPersona(f.clave, { incluida: !f.incluida }))}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.tenue, padding: '0 6px', minHeight: '32px' }}>
          {f.incluida ? <Ico d={P.cerrar} s={13} /> : <Ico d={P.reiniciar} s={13} />}
        </button>
      </td>
    </tr>
  )

  return (
    <div data-testid="dictado-revision" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <div style={{ padding: '16px 18px 16px 30px', display: 'grid', gap: '14px', alignContent: 'start', borderRight: `1px solid ${C.borde}` }}>
          {aviso ? <Aviso tono="warn" testid="dictado-aviso-confirmar">{aviso}</Aviso> : <Aviso tono="info" testid="dictado-resumen">{resumenDeRevision(rev)}</Aviso>}
          {avisos.map((a, i) => <Aviso key={i} tono="warn">{a.texto}</Aviso>)}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '560px' }}>
              <thead><tr><th style={th}>Persona</th><th style={th}>Estado</th><th style={th}>Tarea</th><th style={{ ...th, textAlign: 'right' }}>Horas</th><th style={th} /></tr></thead>
              <tbody>
                {rev.personas.length === 0 && <tr><td colSpan={5} style={{ ...td, color: C.tenue }}>No entendí a nadie del plantel</td></tr>}
                {renglones.map((r, i) => {
                  if (r.tipo === 'persona') return fila(r.fila)
                  const k = `g${i}`
                  const abierto = verGrupo.has(k)
                  const f0 = r.filas[0]
                  return [
                    <tr key={k} data-testid={`dictado-grupo-${i}`} style={fondoFila({ incluida: r.incluida, dudoso: r.dudoso, confirmada: r.filas.every((f) => f.confirmada) })}>
                      <td style={td}>
                        <button type="button" aria-expanded={abierto} onClick={() => setVerGrupo((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}
                          style={{ border: 'none', background: 'transparent', font: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '6px', minHeight: '32px', color: C.tinta }}>
                          <Ico d={abierto ? P.abajo : P.derecha} s={12} />{r.n} más
                        </button>
                      </td>
                      <td style={{ ...td, color: C.pos }}>Presentes</td>
                      <td style={td}>{f0.tarea_nombre ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{String(r.horas).replace('.', ',')}</td>
                      <td style={td}>{r.dudoso && r.filas.some(faltaConfirmar)
                        ? <Chip tipo="q" onClick={() => ed((rv) => r.claves.reduce((acc, c) => cambiarPersona(c, { confirmada: true })(acc), rv))}>confirmar</Chip>
                        : <Chip tipo="d">dictado</Chip>}</td>
                    </tr>,
                    ...(abierto ? r.filas.map((f) => fila(f, true)) : []),
                  ]
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '12px', alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: '4px' }}>
              <div style={EYEBROW}>Avance</div>
              {rev.avances.length === 0 && <div style={{ ...CAJA, minHeight: '40px', fontSize: '13px', color: C.tenue }}>—</div>}
              {rev.avances.map((a) => <CajaAvance key={a.clave} a={a} p={p} pc abierta={abierta === a.clave} alternar={() => setAbierta((x) => (x === a.clave ? null : a.clave))} />)}
            </div>
            <div style={{ display: 'grid', gap: '4px' }}>
              <div style={EYEBROW}>Material que falta</div>
              {rev.materiales.length === 0 && <div style={{ ...CAJA, minHeight: '40px', fontSize: '13px', color: C.tenue }}>—</div>}
              {rev.materiales.map((m) => <CajaMaterial key={m.clave} m={m} p={p} pc abierta={abierta === m.clave} alternar={() => setAbierta((x) => (x === m.clave ? null : m.clave))} />)}
              {rev.materiales.some((m) => m.incluida) && <Urgencia p={p} rev={rev} pc />}
            </div>
            <Novedades p={p} rev={rev} pc />
          </div>
        </div>
        <div style={{ padding: '16px 30px 16px 18px', display: 'grid', gap: '12px', alignContent: 'start', background: C.tenueFondo }}>
          <div style={EYEBROW}>Lo que dijo · {reloj(Number(dictado.duracion_s))}</div>
          <Transcripcion dictado={dictado} />
          <Leyenda />
          <Escuchar id={dictado.id} />
        </div>
      </div>
      {error && <div style={{ padding: '0 30px 8px' }}><Aviso tono="neg" testid="dictado-guardar-error">{error}</Aviso></div>}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', padding: '12px 30px', borderTop: `1px solid ${C.borde}` }}>
        <button type="button" style={{ ...BOTON, minHeight: '38px', fontSize: '13.5px' }} disabled={guardando} onClick={() => void p.d.descartar()} data-testid="dictado-descartar">Descartar lo dictado</button>
        <button type="button" style={{ ...PRIMARIO, minHeight: '38px', fontSize: '13.5px' }} disabled={guardando} onClick={() => void p.d.guardar(p.novedadActividad)} data-testid="dictado-guardar">
          {guardando ? 'Guardando…' : 'Guardar parte'}
        </button>
      </div>
    </div>
  )
}

// ── GUARDADO (paso 4) ───────────────────────────────────────────────────────────────────────────

function Guardado(p: Pantalla & { fase: Extract<Fase, { f: 'guardado' }> }) {
  const { resultado: r, rev, dictado, hora } = p.fase
  const [viendo, setViendo] = useState(false)
  const arriba = useArriba<HTMLDivElement>(p.telefono)
  const puertas: [string, ResultadoGuardado['asistencia']][] = [['Asistencia', r.asistencia], ['Avance y novedades', r.parte], ['Material', r.material]]
  const hpt = r.horasPorTarea.length ? r.horasPorTarea : horasPorTarea(rev.personas.filter((f) => f.incluida))
  const avances = rev.avances.filter((a) => a.incluida)
  const caja = (etiqueta: string, contenido: ReactNode, chip?: ReactNode) => (
    <div style={{ display: 'grid', gap: '4px' }}>
      <div style={EYEBROW}>{etiqueta}</div>
      <div style={{ ...CAJA, fontSize: p.telefono ? '14px' : '13px' }}><span>{contenido}</span>{chip}</div>
    </div>
  )
  return (
    <div ref={arriba} style={{ scrollMarginTop: '56px', padding: p.telefono ? '16px 16px 96px' : '22px 30px 30px', display: 'grid', gap: '12px', maxWidth: p.telefono ? undefined : '640px' }} data-testid="dictado-guardado">
      <Aviso tono="pos" testid="dictado-guardado-aviso">{textoGuardado(r, hora)}</Aviso>
      {puertas.filter(([, x]) => x && !x.ok).map(([n, x]) => <Aviso key={n} tono="warn">{n} NO se guardó: {x?.mensaje}. Cargalo a mano.</Aviso>)}
      {r.asistencia && caja('Asistencia', <><b style={{ fontFamily: MONO }}>{r.presentes}</b> presentes · {r.ausentes} {r.ausentes === 1 ? 'ausente' : 'ausentes'}</>, r.asistencia.ok ? <Chip tipo="ok">cargado</Chip> : <Chip tipo="q">no entró</Chip>)}
      {hpt.length > 0 && caja('Horas por tarea', hpt.map((h, i) => <span key={h.tarea}>{i > 0 ? ' · ' : ''}{nombreCortoDeTarea(h.tarea)} <b style={{ fontFamily: MONO }}>{String(h.horas).replace('.', ',')} h</b></span>))}
      {avances.length > 0 && caja('Avance', avances.map((a, i) => <span key={a.clave}>{i > 0 ? ' · ' : ''}{nombreCortoDeTarea(a.tarea_nombre)} <b style={{ fontFamily: MONO }}>{textoDeAvance(a).dicho}</b></span>))}
      {r.pedido && caja('Material que falta', r.pedido)}
      <div style={{ display: 'grid', gap: '4px' }}>
        <div style={EYEBROW}>Audio</div>
        <button type="button" onClick={() => setViendo(true)} data-testid="dictado-ver-lo-que-dijo" style={{ ...CAJA, cursor: 'pointer', fontFamily: MONO, fontSize: '13px', color: C.tintaSuave, textAlign: 'left' }}>
          {reloj(Number(dictado.duracion_s))} · ver lo que dijo
        </button>
      </div>
      <button type="button" style={{ ...BOTON, justifySelf: p.telefono ? 'stretch' : 'start' }} onClick={p.d.volver} data-testid="dictado-volver">Volver al parte</button>
      {viendo && <VerLoQueDijo dictado={dictado} cerrar={() => setViendo(false)} />}
    </div>
  )
}

