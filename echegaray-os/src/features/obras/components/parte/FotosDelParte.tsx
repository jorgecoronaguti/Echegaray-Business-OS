'use client'

// ═══ FOTOS Y REGISTRO DEL DÍA — el bloque multimedia del parte diario (06 aside · M08 «Fotos») ═══
//
// Pedido del dueño, 23/09/2026: «necesito que los partes diarios permitan la carga de muchas imágenes,
// fotos, registro multimedia de todo; actualmente se hace así: foto y descripción». La 06 y la M08
// NO lo dibujan: se diseñó con `diseno-ui-ux-producto-os` sobre las medidas de la 06/M08 — grid de
// 8, tokens `C.*`, una sola primaria amarilla por pantalla (que sigue siendo «Guardar/Registrar el
// parte»; acá todo es secundario o grafito), sin sombras ni gradientes, radios 6/10, empty state corto.
//
// LO QUE DIBUJA
//   · eyebrow «Fotos y registro del día» (escritorio) / «Fotos» (teléfono) + resumen «3 fotos · 1 video»
//   · la grilla de miniaturas CUADRADAS, 3 por fila, con la descripción debajo (o «sin descripción»)
//   · escritorio: botón secundario «Agregar fotos»; teléfono: «Sacar foto» (cámara trasera) y
//     «Elegir de la galería», dos secundarios de 48
//   · la cola: lo elegido y todavía no subido, con estado por archivo, texto propio, frente y
//     descripción del conjunto, «Subir» (grafito) y «Reintentar» por archivo
//   · el visor a pantalla completa: la foto/video/PDF, descripción editable, hora y peso, «Borrar»
//     (quien subió o Administración), ‹ › y Esc
//
// EL ARCHIVO NO VIAJA POR LA SERVER ACTION: `subidaAdjuntosDeParte.ts` lo pone en el bucket desde
// el navegador y registra la fila al terminar cada uno. Las miniaturas se dibujan con URL firmada
// de diez minutos que genera el servidor (`adjuntosDelDia`): nunca bucket público.
//
// VIVE DENTRO DEL <form> DEL PARTE: ningún control lleva `name` (no viaja con el parte) y Enter en
// una descripción no dispara «Guardar el parte».

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { C, ESTILO_SECUNDARIA, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import {
  ACCEPT, agruparPorFrente, claseDe, esHeic, horaDe, pesoLegible, resumenDeAdjuntos, revisarLote,
} from '../../services/parteAdjuntos.ts'
import type { AdjuntoFirmado } from '../../services/parteAdjuntosService.ts'
import { adjuntosDelDia, borrarAdjuntoDeParte, describirAdjuntoDeParte } from '../../services/parteAdjuntosActions.ts'
import { subirAdjunto, type AdjuntoParaSubir, type EstadoArchivo } from '../../services/subidaAdjuntosDeParte.ts'

const EYEBROW: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
}
const INPUT: CSSProperties = {
  boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 9px', border: `1px solid ${C.borde}`,
  borderRadius: '6px', font: 'inherit', fontSize: '13px', background: C.superficie, color: C.tinta,
}
/** El botón grafito: acción, no marca. La única amarilla de la pantalla es la del parte. */
const GRAFITO: CSSProperties = {
  ...ESTILO_SECUNDARIA, background: C.grafito, border: `1px solid ${C.grafito}`, color: C.superficie, fontWeight: 600,
}

interface Props {
  obraId: string
  dia: string
  frentes: readonly { id: string; nombre: string }[]
  usuario: { id: string; esAdministracion: boolean } | null
  telefono: boolean
}

interface EnCola extends AdjuntoParaSubir {
  estado: EstadoArchivo
  error: string | null
  /** Vista previa local (`URL.createObjectURL`), sólo imágenes que el navegador puede dibujar. */
  vista: string | null
}

const ROTULO_ESTADO: Record<EstadoArchivo, string> = {
  'en cola': 'en cola', preparando: 'preparando…', subiendo: 'subiendo…', registrando: 'registrando…', subido: 'subida', 'falló': 'falló',
}

export function FotosDelParte({ obraId, dia, frentes, usuario, telefono }: Props) {
  const [adjuntos, setAdjuntos] = useState<AdjuntoFirmado[] | null>(null)
  const [fallaLectura, setFallaLectura] = useState<string | null>(null)
  const [cola, setCola] = useState<EnCola[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [frenteId, setFrenteId] = useState<string>('')
  const [conjunto, setConjunto] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const camara = useRef<HTMLInputElement>(null)

  // La lectura del día es una suscripción a un sistema externo (la base): el `setState` va en el
  // callback de la promesa, no en el cuerpo del efecto, y `vivo` descarta la respuesta de un día
  // que ya no se mira (el mismo patrón que `PanelVerificar` de Herramientas).
  const recargar = useCallback(() => adjuntosDelDia(obraId, dia).then((r) => {
    if (r.ok) { setAdjuntos(r.dato); setFallaLectura(null) } else { setAdjuntos((prev) => prev ?? []); setFallaLectura(r.error) }
  }), [obraId, dia])

  useEffect(() => {
    let vivo = true
    adjuntosDelDia(obraId, dia).then((r) => {
      if (!vivo) return
      if (r.ok) { setAdjuntos(r.dato); setFallaLectura(null) } else { setAdjuntos([]); setFallaLectura(r.error) }
    }).catch((e: unknown) => { if (vivo) { setAdjuntos([]); setFallaLectura(e instanceof Error ? e.message : String(e)) } })
    return () => { vivo = false }
  }, [obraId, dia])

  // Las vistas previas locales se sueltan al desmontar: un objectURL vivo es memoria que no vuelve.
  // Se lee de un ref para no revocar, en cada cambio de la cola, las vistas de lo que sigue en ella.
  const colaRef = useRef<EnCola[]>([])
  useEffect(() => { colaRef.current = cola }, [cola])
  useEffect(() => () => { for (const c of colaRef.current) if (c.vista) URL.revokeObjectURL(c.vista) }, [])

  function elegir(lista: FileList | null) {
    if (!lista?.length) return
    const r = revisarLote(Array.from(lista))
    setAviso(r.aviso)
    setCola((prev) => [...prev, ...r.aceptados.map((a): EnCola => ({
      id: crypto.randomUUID(), archivo: a.archivo, mediaType: a.mediaType, clase: a.clase, descripcion: '',
      estado: 'en cola', error: null,
      vista: a.clase === 'imagen' && !esHeic(a.mediaType) ? URL.createObjectURL(a.archivo) : null,
    }))])
  }

  const cambiarEstado = (id: string, estado: EstadoArchivo, error?: string) =>
    setCola((prev) => prev.map((c) => (c.id === id ? { ...c, estado, error: error ?? null } : c)))

  async function subir(soloId?: string) {
    const pendientes = cola.filter((c) => (soloId ? c.id === soloId : c.estado === 'en cola' || c.estado === 'falló'))
    if (!pendientes.length) return
    setSubiendo(true)
    const destino = { obraId, fecha: dia, actividadId: frenteId || null, descripcionDelConjunto: conjunto }
    // De a tres a la vez, como el resto de las subidas del OS; cada archivo corre su suerte.
    let i = 0
    const obrero = async () => { for (let k = i++; k < pendientes.length; k = i++) await subirAdjunto(pendientes[k], destino, cambiarEstado) }
    await Promise.all(Array.from({ length: Math.min(3, pendientes.length) }, obrero))
    setSubiendo(false)
    await recargar()
    // Lo que entró sale de la cola; lo que falló se queda con su motivo y su «Reintentar».
    setCola((prev) => prev.filter((c) => c.estado !== 'subido'))
  }

  const vivos = adjuntos ?? []
  const grupos = agruparPorFrente(vivos, frentes)
  const enCola = cola.length
  const abiertoIdx = abierto ? vivos.findIndex((a) => a.id === abierto) : -1

  const sinEnter = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') e.preventDefault() }

  const puedeBorrar = (a: AdjuntoFirmado) => !!usuario && (usuario.esAdministracion || a.subido_por === usuario.id)

  return (
    <div data-testid="parte-fotos" style={{ display: 'flex', flexDirection: 'column', gap: telefono ? '10px' : '11px' }}>
      {/* Los dos inputs: galería (múltiple) y cámara trasera. Sin `name`: no viajan con el parte. */}
      <input ref={galeria} type="file" accept={ACCEPT} multiple hidden data-testid="parte-fotos-galeria-input"
        onChange={(e) => { elegir(e.target.files); e.target.value = '' }} />
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden data-testid="parte-fotos-camara-input"
        onChange={(e) => { elegir(e.target.files); e.target.value = '' }} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div style={EYEBROW}>{telefono ? 'Fotos' : 'Fotos y registro del día'}</div>
        <div data-testid="parte-fotos-resumen" style={{ fontSize: '12px', color: C.tintaSuave }}>
          {adjuntos === null && !fallaLectura ? 'leyendo…' : resumenDeAdjuntos(vivos)}
        </div>
      </div>

      {fallaLectura && (
        <div data-testid="parte-fotos-fallo" style={{ fontSize: '12.5px', color: C.neg }}>No se pudieron leer las fotos: {fallaLectura}</div>
      )}

      {/* LA GRILLA: cuadradas, 3 por fila, descripción debajo. Agrupada por frente cuando hay más de un grupo. */}
      {adjuntos !== null && vivos.length === 0 && enCola === 0 && (
        <div data-testid="parte-fotos-vacio" style={{ fontSize: '12.5px', color: C.tenue }}>sin fotos del día</div>
      )}
      {grupos.map((g) => (
        <div key={g.actividadId ?? 'dia'} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {grupos.length > 1 && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{g.rotulo}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
            {g.adjuntos.map((a) => <Miniatura key={a.id} a={a} abrir={() => setAbierto(a.id)} />)}
          </div>
        </div>
      ))}

      {/* LA COLA: lo elegido y todavía no subido. */}
      {enCola > 0 && (
        <div data-testid="parte-fotos-cola" style={{
          display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', border: `1px solid ${C.borde}`,
          borderRadius: '10px', background: C.tenueFondo,
        }}>
          <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{enCola === 1 ? '1 archivo por subir' : `${enCola} archivos por subir`}</div>
          {cola.map((c) => (
            <div key={c.id} data-testid={`parte-fotos-cola-${c.id}`} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr)', gap: '8px', alignItems: 'start' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '6px', border: `1px solid ${C.borde}`, background: C.superficie, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tenue }}>
                {c.vista
                  // eslint-disable-next-line @next/next/no-img-element -- objectURL local: next/image no lo optimiza
                  ? <img src={c.vista} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Ico d={c.clase === 'video' ? P.equipo : c.clase === 'pdf' ? P.doc : P.foto} s={14} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '12px' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.tinta }}>{c.archivo.name}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0, color: c.estado === 'falló' ? C.neg : c.estado === 'subido' ? C.pos : C.tintaSuave, fontFamily: MONO, fontSize: '11px' }}>
                    {ROTULO_ESTADO[c.estado]}
                  </span>
                </div>
                {c.estado === 'en cola' && (
                  <input type="text" placeholder="qué se ve (opcional)" maxLength={1000} value={c.descripcion} onKeyDown={sinEnter}
                    aria-label={`Descripción de ${c.archivo.name}`} data-testid={`parte-fotos-cola-texto-${c.id}`}
                    onChange={(e) => setCola((prev) => prev.map((x) => (x.id === c.id ? { ...x, descripcion: e.target.value } : x)))} style={INPUT} />
                )}
                {c.estado === 'falló' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.neg }}>
                    <span style={{ minWidth: 0 }}>{c.error}</span>
                    <button type="button" disabled={subiendo} onClick={() => void subir(c.id)} data-testid={`parte-fotos-reintentar-${c.id}`}
                      style={{ ...ESTILO_SECUNDARIA, padding: '3px 8px', fontSize: '12px', flexShrink: 0 }}>Reintentar</button>
                    <button type="button" aria-label="Sacar de la cola" onClick={() => setCola((prev) => prev.filter((x) => x.id !== c.id))}
                      style={{ border: 'none', background: 'transparent', color: C.tenue, cursor: 'pointer', padding: 0, display: 'flex' }}><Ico d={P.cerrar} s={12} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: telefono ? '1fr' : '1fr 1fr', gap: '8px' }}>
            <select value={frenteId} onChange={(e) => setFrenteId(e.target.value)} aria-label="Frente" data-testid="parte-fotos-frente"
              disabled={subiendo} style={{ ...INPUT, padding: '0 6px' }}>
              <option value="">Del día</option>
              {frentes.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
            <input type="text" placeholder="descripción del conjunto (opcional)" maxLength={1000} value={conjunto} onKeyDown={sinEnter}
              onChange={(e) => setConjunto(e.target.value)} aria-label="Descripción del conjunto" data-testid="parte-fotos-conjunto"
              disabled={subiendo} style={INPUT} />
          </div>
          <button type="button" disabled={subiendo || !cola.some((c) => c.estado === 'en cola' || c.estado === 'falló')} onClick={() => void subir()}
            data-testid="parte-fotos-subir" style={{ ...GRAFITO, height: telefono ? '48px' : '30px', justifyContent: 'center', fontSize: telefono ? '14px' : '12.5px' }}>
            <Ico d={P.subir} s={14} />{subiendo ? 'Subiendo…' : enCola === 1 ? 'Subir el archivo' : `Subir ${enCola} archivos`}
          </button>
        </div>
      )}

      {aviso && <div data-testid="parte-fotos-aviso" style={{ fontSize: '12px', color: C.warn }}>{aviso}</div>}

      {/* LOS DISPARADORES. Escritorio: «Agregar fotos», secundario de 30. Teléfono: dos de 48. */}
      {telefono
        ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button type="button" onClick={() => camara.current?.click()} data-testid="parte-fotos-sacar"
              style={{ ...ESTILO_SECUNDARIA, height: '48px', justifyContent: 'center', fontSize: '14px', border: `1px solid ${C.bordeFuerte}` }}>
              <Ico d={P.foto} s={15} />Sacar foto
            </button>
            <button type="button" onClick={() => galeria.current?.click()} data-testid="parte-fotos-galeria"
              style={{ ...ESTILO_SECUNDARIA, height: '48px', justifyContent: 'center', fontSize: '14px', border: `1px solid ${C.bordeFuerte}` }}>
              <Ico d={P.adjuntar} s={15} />Elegir de la galería
            </button>
          </div>
          )
        : (
          <button type="button" onClick={() => galeria.current?.click()} data-testid="parte-fotos-agregar"
            style={{ ...ESTILO_SECUNDARIA, height: '30px', justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Ico d={P.foto} s={13} />Agregar fotos
          </button>
          )}

      {abiertoIdx >= 0 && (
        // `key` por adjunto: al pasar a otra foto el visor nace de nuevo con SU descripción, sin efectos.
        <Visor
          key={vivos[abiertoIdx].id}
          lista={vivos} idx={abiertoIdx} frentes={frentes}
          cerrar={() => setAbierto(null)}
          ir={(i) => setAbierto(vivos[i]?.id ?? null)}
          puedeBorrar={puedeBorrar(vivos[abiertoIdx])}
          alCambiar={recargar}
        />
      )}
    </div>
  )
}

/** Una celda cuadrada de la grilla, con su descripción debajo. */
function Miniatura({ a, abrir }: { a: AdjuntoFirmado; abrir: () => void }) {
  const clase = claseDe(a.tipo_mime)
  const heic = esHeic(a.tipo_mime)
  return (
    <button type="button" onClick={abrir} data-testid={`parte-foto-${a.id}`} aria-label={a.descripcion ?? a.nombre_archivo}
      style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
      <div style={{
        width: '100%', aspectRatio: '1 / 1', borderRadius: '6px', border: `1px solid ${C.borde}`, background: C.tenueFondo,
        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tenue, position: 'relative',
      }}>
        {clase === 'imagen' && a.url && !heic
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de 10 minutos: next/image la cachearía vencida
          ? <img src={a.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <Ico d={clase === 'video' ? P.equipo : clase === 'pdf' ? P.doc : P.foto} s={18} />
              {clase === 'video' ? 'video' : clase === 'pdf' ? 'pdf' : heic ? 'heic' : 'sin vista'}
            </div>
            )}
      </div>
      <div style={{
        fontSize: '12px', color: a.descripcion ? C.tintaSuave : C.tenue, lineHeight: 1.3, overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontStyle: a.descripcion ? 'normal' : 'italic', width: '100%',
      }}>{a.descripcion ?? 'sin descripción'}</div>
    </button>
  )
}

/** EL VISOR a pantalla completa: sin librerías. Esc cierra, ← → mueven, la descripción se edita ahí. Se remonta por `key` al cambiar de foto. */
function Visor({ lista, idx, frentes, cerrar, ir, puedeBorrar, alCambiar }: {
  lista: AdjuntoFirmado[]
  idx: number
  frentes: readonly { id: string; nombre: string }[]
  cerrar: () => void
  ir: (i: number) => void
  puedeBorrar: boolean
  alCambiar: () => Promise<void>
}) {
  const a = lista[idx]
  const [texto, setTexto] = useState(a.descripcion ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => {
    const tecla = (e: globalThis.KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') cerrar()
      if (e.key === 'ArrowLeft' && idx > 0) ir(idx - 1)
      if (e.key === 'ArrowRight' && idx < lista.length - 1) ir(idx + 1)
    }
    window.addEventListener('keydown', tecla)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = previo }
  }, [idx, lista.length, cerrar, ir])

  async function guardar() {
    setOcupado(true)
    const r = await describirAdjuntoDeParte({ id: a.id, descripcion: texto.trim() || null })
    setOcupado(false)
    setMensaje(r.ok ? { ok: true, texto: 'Descripción guardada.' } : { ok: false, texto: r.error })
    if (r.ok) await alCambiar()
  }

  async function borrar() {
    setOcupado(true)
    const r = await borrarAdjuntoDeParte(a.id)
    setOcupado(false)
    if (!r.ok) { setMensaje({ ok: false, texto: r.error }); setConfirmar(false); return }
    await alCambiar()
    if (lista.length <= 1) cerrar()
    else ir(Math.min(idx, lista.length - 2))
  }

  const clase = claseDe(a.tipo_mime)
  const frente = a.actividad_id ? (frentes.find((f) => f.id === a.actividad_id)?.nombre ?? 'frente sin nombre') : 'del día'
  const flecha: CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', borderRadius: '6px',
    border: `1px solid ${C.sobreGrafitoBorde}`, background: 'transparent', color: C.superficie, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Visor de fotos del parte" data-testid="parte-fotos-visor"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.grafito, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: '48px', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', color: C.superficie, flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: '12px', color: C.sobreGrafitoTenue }} data-testid="parte-fotos-visor-posicion">{idx + 1} / {lista.length}</span>
        <span style={{ fontSize: '12.5px', color: C.sobreGrafitoTenue, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre_archivo}</span>
        <button type="button" onClick={cerrar} aria-label="Cerrar" data-testid="parte-fotos-visor-cerrar"
          style={{ marginLeft: 'auto', width: '36px', height: '36px', border: 'none', background: 'transparent', color: C.superficie, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ico d={P.cerrar} s={18} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 56px' }}>
        {clase === 'imagen' && a.url && !esHeic(a.tipo_mime) && (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta vida
          <img src={a.url} alt={a.descripcion ?? ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
        )}
        {clase === 'video' && a.url && (
          <video src={a.url} controls playsInline style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
        )}
        {(clase === 'pdf' || esHeic(a.tipo_mime) || !a.url) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: C.sobreGrafitoTenue, fontSize: '13px' }}>
            <Ico d={clase === 'pdf' ? P.doc : P.foto} s={28} />
            <span>{!a.url ? 'No se pudo abrir el archivo.' : clase === 'pdf' ? 'PDF' : 'Foto HEIC: este navegador no la puede mostrar.'}</span>
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" data-testid="parte-fotos-visor-abrir"
                style={{ ...ESTILO_SECUNDARIA, textDecoration: 'none' }}><Ico d={P.descargar} s={13} />Abrir</a>
            )}
          </div>
        )}
        {idx > 0 && <button type="button" aria-label="Anterior" onClick={() => ir(idx - 1)} style={{ ...flecha, left: '8px' }}><Ico d={P.izquierda} s={16} /></button>}
        {idx < lista.length - 1 && <button type="button" aria-label="Siguiente" onClick={() => ir(idx + 1)} style={{ ...flecha, right: '8px' }}><Ico d={P.derecha} s={16} /></button>}
      </div>

      <div style={{ background: C.superficie, borderTop: `1px solid ${C.borde}`, padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, maxWidth: '720px', width: '100%', margin: '0 auto', boxSizing: 'border-box', borderRadius: '10px 10px 0 0' }}>
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: C.tintaSuave, flexWrap: 'wrap' }}>
          <span>{horaDe(a)}</span><span>·</span><span>{frente}</span><span>·</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{pesoLegible(a.tamano_bytes)}</span>
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} rows={2} placeholder="qué se ve"
          aria-label="Descripción de la foto" data-testid="parte-foto-descripcion" style={{ ...INPUT, height: 'auto', padding: '8px 9px', resize: 'none', border: `1px solid ${C.bordeFuerte}` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" disabled={ocupado || (texto.trim() || null) === a.descripcion} onClick={() => void guardar()} data-testid="parte-foto-guardar"
            style={{ ...GRAFITO, height: '32px' }}>{ocupado ? 'Guardando…' : 'Guardar descripción'}</button>
          {puedeBorrar && !confirmar && (
            <button type="button" disabled={ocupado} onClick={() => setConfirmar(true)} data-testid="parte-foto-borrar"
              style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: C.neg, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0' }}>Borrar</button>
          )}
          {puedeBorrar && confirmar && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: C.tintaSuave }}>
              ¿Borrar esta foto?
              <button type="button" disabled={ocupado} onClick={() => void borrar()} data-testid="parte-foto-borrar-confirmar"
                style={{ ...ESTILO_SECUNDARIA, color: C.neg, border: `1px solid ${C.negBorde}`, padding: '4px 9px' }}>Sí, borrar</button>
              <button type="button" onClick={() => setConfirmar(false)} style={{ ...ESTILO_SECUNDARIA, padding: '4px 9px' }}>No</button>
            </span>
          )}
        </div>
        {mensaje && <div data-testid={mensaje.ok ? 'parte-foto-ok' : 'parte-foto-error'} style={{ fontSize: '12px', color: mensaje.ok ? C.pos : C.neg }}>{mensaje.texto}</div>}
      </div>
    </div>
  )
}
