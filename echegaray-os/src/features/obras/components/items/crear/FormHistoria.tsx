'use client'

// B03 — LA HISTORIA NUEVA TRAE EL COSTO DE MANO DE OBRA (aside de 420 · a pantalla completa en el teléfono).
//
//   «Historia nueva · dentro de Obra gruesa › Preparación de terreno» 11,5 faint · nombre 16/600
//   Unidad («sin unidad») · Cantidad
//   Costo de mano de obra — «fuente de la ponderación» — «$ 1.775.059   → 100 % de la obra» en vivo
//   Partida del presupuesto (sin presupuesto: «sin presupuesto vinculado · el costo se carga a mano»)
//   Tareas desde una plantilla — opcional · Comentario
//   comprobaciones: «Primera historia con costo: la obra pasa a ponderar por costo de MO» · «Pesa 100 %
//   hasta que otra historia cargue costo» · «Sin unidad ni cantidad, su avance sale del promedio de sus tareas»
//   «Crear y seguir con otra» (primaria) · «Crear y bajar a tarea»
//
// Se eliminó «ponderación en el padre»: el peso lo deriva el costo. Nadie tipea un %.

import { useEffect, useMemo, useState, type MutableRefObject } from 'react'
import { C } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Aviso, CabeceraTelefono, Campo, ESTILO_PRIMARIA_32, ESTILO_SECUNDARIA_32, PiePrimaria, Resultado, estiloControl } from './Piezas'
import type { PartidaParaConvertir } from '../../../services/partidasParaConvertir'
import type { PlantillaTareas } from '../../../services/insumosService'
import { rotuloPeso, rotuloPesos } from '../../../services/pesoMO'
import { rotuloUniCant } from '../../../services/estructura'
import { UNIDADES } from '../../../types'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import type { PreviaNuevo } from './ArbolEstructura'

export type ModoEnvio = 'seguir' | 'bajar' | 'abrir'

export function FormHistoria({
  padre, nombre, alCambiarNombre, costoOtras, hayOtraConCosto, partidas, presupuesto, plantillas, crear, alCreada, alCerrar, enviarRef, alPrevia,
}: {
  padre: { id: string; camino: string }
  nombre: string
  alCambiarNombre: (v: string) => void
  /** Σ costo de MO de las OTRAS historias de la obra (el denominador sin ésta). */
  costoOtras: number
  hayOtraConCosto: boolean
  partidas: PartidaParaConvertir[]
  presupuesto: string | null
  plantillas: PlantillaTareas[]
  crear: AccionFormulario
  alCreada: (id: string | null, modo: ModoEnvio) => void
  alCerrar: () => void
  /** El árbol dispara el envío con Enter (seguir) y Tab (bajar). */
  enviarRef: MutableRefObject<((m: ModoEnvio) => void) | null>
  alPrevia: (p: PreviaNuevo) => void
}) {
  const [unidad, setUnidad] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [partidaId, setPartidaId] = useState('')
  const [plantillaId, setPlantillaId] = useState('')
  const [comentario, setComentario] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  const costoN = costo.trim() === '' ? null : Number(costo.replace(/\./g, '').replace(',', '.').replace(/[$\s]/g, ''))
  const costoValido = costoN != null && Number.isFinite(costoN) && costoN >= 0
  const peso = costoValido && costoN! + costoOtras > 0 ? costoN! / (costoN! + costoOtras) : null
  const cant = cantidad.trim() === '' ? null : Number(cantidad.replace(',', '.'))

  useEffect(() => {
    alPrevia({
      uniCant: rotuloUniCant(unidad || null, cant != null && Number.isFinite(cant) ? cant : null),
      costo: costoValido ? { texto: rotuloPesos(costoN!), tono: 'normal' } : null,
      peso: peso != null ? { texto: rotuloPeso(peso), tono: 'normal' } : null,
    })
  }, [unidad, cant, costoValido, costoN, peso, alPrevia])

  const comprobaciones = useMemo(() => {
    const s: { tono: 'ok' | 'warn' | 'muted'; texto: string }[] = []
    if (costoValido && !hayOtraConCosto) {
      s.push({ tono: 'ok', texto: 'Primera historia con costo: la obra pasa a ponderar por costo de MO' })
      s.push({ tono: 'ok', texto: 'Pesa 100 % hasta que otra historia cargue costo' })
    } else if (costoValido && peso != null) s.push({ tono: 'ok', texto: `Pesa ${rotuloPeso(peso)} de la obra; las demás se recalculan` })
    else if (costo.trim() !== '' && !costoValido) s.push({ tono: 'warn', texto: 'El costo tiene que ser un número' })
    else s.push({ tono: 'warn', texto: 'Sin costo de MO no pesa: se marca «sin costo de MO · no pesa»' })
    if (!unidad && !cantidad) s.push({ tono: 'muted', texto: 'Sin unidad ni cantidad, su avance sale del promedio de sus tareas' })
    return s
  }, [costoValido, hayOtraConCosto, peso, costo, unidad, cantidad])

  const enviar = async (modo: ModoEnvio) => {
    if (pendiente || nombre.trim().length < 2) return
    if (costo.trim() !== '' && !costoValido) { setResultado({ ok: false, texto: 'El costo tiene que ser un número.' }); return }
    setPendiente(true)
    const form = new FormData()
    form.set('nombre', nombre.trim()); form.set('padre_id', padre.id)
    form.set('unidad', unidad); form.set('cantidad', cantidad.replace(',', '.'))
    form.set('costo_mo', costoValido ? String(costoN) : '')
    form.set('partida_id', partidaId); form.set('plantilla_id', plantillaId); form.set('comentario', comentario)
    const r = await crear(form)
    setPendiente(false)
    if (r.ok) {
      setUnidad(''); setCantidad(''); setCosto(''); setPartidaId(''); setPlantillaId(''); setComentario(''); setResultado(null)
      alCreada(r.id ?? null, modo)
    } else setResultado({ ok: false, texto: r.error })
  }
  // El árbol dispara el envío (Enter / Tab): se registra la versión de este render, sin deps.
  useEffect(() => { enviarRef.current = (m) => { void enviar(m) } })
  useEffect(() => () => { enviarRef.current = null }, [enviarRef])

  const campos = (alto: 32 | 44) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Campo rotulo="Unidad" alto={alto}>
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)} data-testid="historia-unidad" style={{ ...estiloControl(alto), fontStyle: unidad ? 'normal' : 'italic', color: unidad ? C.tinta : C.tenue }}>
            <option value="">sin unidad</option>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Cantidad" alto={alto}>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" data-testid="historia-cantidad" style={estiloControl(alto, true)} />
        </Campo>
      </div>
      <Campo rotulo="Costo de mano de obra" nota="fuente de la ponderación" alto={alto}>
        <div style={{ ...estiloControl(alto), display: 'flex', alignItems: 'center', gap: '6px', borderColor: C.grafito }}>
          <span style={{ color: C.tintaSuave, fontFamily: 'var(--font-plex-mono), monospace' }}>$</span>
          <input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" data-testid="historia-costo-mo" aria-label="Costo de mano de obra"
            className="focus:outline-none focus-visible:outline-none focus:ring-0"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', boxShadow: 'none', borderRadius: 0, background: 'transparent', font: 'inherit', fontFamily: 'var(--font-plex-mono), monospace', color: C.tinta }} />
          {peso != null && <span style={{ fontSize: '11.5px', color: C.tintaSuave, whiteSpace: 'nowrap' }}>→ {rotuloPeso(peso)} de la obra</span>}
        </div>
      </Campo>
      <Campo rotulo="Partida del presupuesto" nota={presupuesto ?? (alto === 32 ? 'cuando exista el módulo Presupuestos' : undefined)} alto={alto}>
        {partidas.length ? (
          <select value={partidaId} onChange={(e) => setPartidaId(e.target.value)} data-testid="historia-partida" style={estiloControl(alto)}>
            <option value="">sin partida · el costo se carga a mano</option>
            {partidas.map((p) => <option key={p.id} value={p.id}>{[p.codigo, p.descripcion].filter(Boolean).join(' ')}</option>)}
          </select>
        ) : (
          <div style={{ ...estiloControl(alto), border: `1px dashed ${C.bordeFuerte}`, display: 'flex', alignItems: 'center', fontStyle: 'italic', color: C.tenue, fontSize: '12.5px' }}>
            sin presupuesto vinculado · el costo se carga a mano
          </div>
        )}
      </Campo>
      <Campo rotulo="Tareas desde una plantilla" nota="opcional" alto={alto}>
        <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} data-testid="historia-plantilla" style={{ ...estiloControl(alto), fontStyle: plantillaId ? 'normal' : 'italic', color: plantillaId ? C.tinta : C.tenue }}>
          <option value="">sin plantilla · las tareas se cargan a mano</option>
          {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.pasos} {p.pasos === 1 ? 'tarea' : 'tareas'}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Comentario" alto={alto}>
        <input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={400} data-testid="historia-comentario" style={estiloControl(alto)} />
      </Campo>
    </>
  )

  const listaComprobaciones = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: `1px solid ${C.borde}`, paddingTop: '14px' }}>
      {comprobaciones.map((c, i) => <Aviso key={i} tono={c.tono} tam={12}>{c.texto}</Aviso>)}
    </div>
  )

  return (
    <>
      <aside className="hidden md:flex" data-testid="form-historia" style={{ borderLeft: `1px solid ${C.borde}`, padding: '18px 24px 28px', flexDirection: 'column', gap: '16px', minHeight: '680px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '11.5px', color: C.tenue, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>Historia nueva · dentro de <span style={{ color: C.tintaMedia }}>{padre.camino}</span></span>
            <button type="button" onClick={alCerrar} aria-label="Cerrar" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}><Ico d={P.cerrar} s={14} /></button>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: nombre ? C.tinta : C.tenue }}>{nombre || 'sin nombre todavía'}</div>
        </div>
        <Resultado r={resultado} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{campos(32)}</div>
        {listaComprobaciones}
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <button type="button" onClick={() => enviar('seguir')} disabled={pendiente || nombre.trim().length < 2} data-testid="crear-y-seguir" style={{ ...ESTILO_PRIMARIA_32, opacity: nombre.trim().length < 2 ? 0.5 : 1 }}>
            <Ico d={P.ok} s={13} />{pendiente ? 'Creando…' : 'Crear y seguir con otra'}
          </button>
          <button type="button" onClick={() => enviar('bajar')} disabled={pendiente || nombre.trim().length < 2} data-testid="crear-y-bajar" style={ESTILO_SECUNDARIA_32}>Crear y bajar a tarea</button>
        </div>
      </aside>

      <div className="flex md:hidden" data-testid="form-historia-telefono" style={{ position: 'fixed', top: '44px', left: 0, right: 0, bottom: '64px', flexDirection: 'column', background: C.superficie, zIndex: 30, overflowY: 'auto' }}>
        <CabeceraTelefono miga={`Historia nueva · ${padre.camino}`} titulo={nombre || 'sin nombre todavía'} alVolver={alCerrar} />
        <div style={{ padding: '16px 16px 110px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Resultado r={resultado} />
          <Campo rotulo="Nombre" alto={44}>
            <input value={nombre} onChange={(e) => alCambiarNombre(e.target.value)} style={estiloControl(44)} placeholder="Historia nueva" data-testid="historia-nombre-telefono" />
          </Campo>
          {campos(44)}
          {listaComprobaciones}
        </div>
      </div>
      <PiePrimaria rotulo="Crear la historia" icono={<Ico d={P.ok} s={15} />} onClick={() => enviar('bajar')} apagada={nombre.trim().length < 2} testid="crear-la-historia" pendiente={pendiente} />
    </>
  )
}
