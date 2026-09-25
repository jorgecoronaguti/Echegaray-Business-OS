'use client'

// B05 · MB2 — LA TAREA NUEVA: SE MIDE, NO PESA.
//
//   escritorio (aside 420)  «Tarea nueva · dentro de Excavaciones › Base» · nombre 16/600
//     Unidad · Cantidad · Comienzo · Fin («4 días hábiles») · Método de avance («un ejecutadas / 2»)
//     Insumos («4 · 1 activo de Herramientas»): chips con la ubicación del activo + «+ Insumo»
//     Subtareas («0 · no entran al cronograma») con «Nueva subtarea · Enter»
//     Cuadrilla · Responsable · Comentario con destino: Sólo nota · Pedido · Impedimento
//     ✓ Entra en el plazo de la obra · ✓ Base pasa a un · 22 y sigue pesando $ 725.793 · 27,4 %
//     · Sin peso propio: el avance de Base es el promedio de sus 3 tareas
//     «Crear y seguir con otra» (primaria) · «Crear y abrir»
//   teléfono (MB2)  controles de 44, sin método/cuadrilla/responsable; «Base sigue pesando $ … · 3,9 %.
//     La tarea no pide peso.»; primaria a lo ancho «Crear la tarea»
//
// Se eliminó «Ponderación en {padre}». Lo que el diseño no dibuja (el pedido y el impedimento piden
// cuánto / quién y para cuándo) se agrega con los mismos campos de 32.

import { useEffect, useMemo, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import { C, MONO } from '../../canon/tokens'
import { CampoFecha, Combo } from '../../canon/Controles'
import { Ico, P } from '../../canon/Ico'
import { Aviso, CabeceraTelefono, Campo, Chip, ESTILO_PRIMARIA_32, ESTILO_SECUNDARIA_32, PiePrimaria, Resultado, estiloControl } from './Piezas'
import { BuscadorInsumo, ChipInsumo, type InsumoElegido } from './Insumos'
import { diasHabilesEntre } from '../filasDeItems'
import { rotuloPlan, rotuloUniCant } from '../../../services/estructura'
import { contadorInsumos } from '../../../services/insumosTarea'
import type { ActivoElegible } from '../../../services/insumosService'
import { UNIDADES, type Persona } from '../../../types'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import { nombreDePersona } from '../../../../../shared/personas/nombre.ts'
import type { PreviaNuevo } from './ArbolEstructura'
import type { ModoEnvio } from './FormHistoria'

type Destino = 'nota' | 'pedido' | 'impedimento'
const DESTINOS: { id: Destino; label: string }[] = [{ id: 'nota', label: 'Sólo nota' }, { id: 'pedido', label: 'Pedido' }, { id: 'impedimento', label: 'Impedimento' }]

export function FormTarea({
  obraId, padre, nombre, alCambiarNombre, historia, plazo, cuadrillas, personas, activos, crear, alCreada, alCerrar, enviarRef, alPrevia,
  insumosPropuestos = [],
}: {
  obraId: string
  padre: { id: string; camino: string }
  nombre: string
  alCambiarNombre: (v: string) => void
  /** La historia de la que cuelga: su nombre, «un · 22», lo que pesa y cuántas tareas tiene ya. */
  historia: { nombre: string; uniCant: string | null; costo: string | null; peso: string | null; nTareas: number; inicio?: string | null; fin?: string | null } | null
  /** B05 · MB2: los insumos de las tareas hermanas, propuestos de entrada (se quitan con ×). */
  insumosPropuestos?: InsumoElegido[]
  plazo: { inicio: string | null; fin: string | null }
  cuadrillas: { id: string; nombre: string }[]
  personas: Persona[]
  activos: ActivoElegible[]
  crear: AccionFormulario
  alCreada: (id: string | null, modo: ModoEnvio) => void
  alCerrar: () => void
  enviarRef: MutableRefObject<((m: ModoEnvio) => void) | null>
  alPrevia: (p: PreviaNuevo) => void
}) {
  const [unidad, setUnidad] = useState('')
  const [cantidad, setCantidad] = useState('')
  // B05: las fechas arrancan con las de la historia madre («01/09/2026 · 4 días hábiles»).
  const [inicio, setInicio] = useState(historia?.inicio?.slice(0, 10) ?? '')
  const [fin, setFin] = useState(historia?.fin?.slice(0, 10) ?? '')
  const [metodo, setMetodo] = useState<'cantidad' | 'pasos' | 'partes' | 'manual' | ''>('')
  const [insumos, setInsumos] = useState<InsumoElegido[]>(insumosPropuestos)
  // La fila nueva se mudó de historia (Tab, clic en otra rama): fechas e insumos vuelven a los de la nueva madre.
  const [padreVisto, setPadreVisto] = useState(padre.id)
  if (padre.id !== padreVisto) {
    setPadreVisto(padre.id)
    setInicio(historia?.inicio?.slice(0, 10) ?? ''); setFin(historia?.fin?.slice(0, 10) ?? ''); setInsumos(insumosPropuestos)
  }
  const [subtareas, setSubtareas] = useState<string[]>([])
  const [borradorSub, setBorradorSub] = useState('')
  const [cuadrillaId, setCuadrillaId] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [comentario, setComentario] = useState('')
  const [destino, setDestino] = useState<Destino>('nota')
  const [pedCant, setPedCant] = useState('')
  const [pedUni, setPedUni] = useState('')
  const [impQuien, setImpQuien] = useState('')
  const [impCuando, setImpCuando] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  const cant = cantidad.trim() === '' ? null : Number(cantidad.replace(',', '.'))
  const diasHabiles = inicio && fin && fin >= inicio ? diasHabilesEntre(inicio, fin) : null
  const metodoEfectivo = metodo || (unidad && cantidad ? 'cantidad' : subtareas.length ? 'pasos' : 'manual')
  const enPlazo = inicio && fin ? (!plazo.inicio || inicio >= plazo.inicio) && (!plazo.fin || fin <= plazo.fin) : null
  const n = (historia?.nTareas ?? 0) + 1
  const anioBase = Number((inicio || plazo.inicio || new Date().toISOString()).slice(0, 4))

  useEffect(() => {
    alPrevia({
      uniCant: rotuloUniCant(unidad || null, cant != null && Number.isFinite(cant) ? cant : null),
      plan: rotuloPlan(inicio || null, fin || null), dias: diasHabiles, metodo: metodoEfectivo,
    })
  }, [unidad, cant, inicio, fin, diasHabiles, metodoEfectivo, alPrevia])

  const comprobaciones = useMemo(() => {
    const s: { tono: 'ok' | 'warn' | 'muted'; texto: string }[] = []
    if (enPlazo != null) s.push(enPlazo ? { tono: 'ok', texto: 'Entra en el plazo de la obra' } : { tono: 'warn', texto: 'Sale del plazo de la obra' })
    if (historia) {
      const pesa = historia.costo && historia.peso ? `sigue pesando ${historia.costo} · ${historia.peso}` : 'sigue sin costo de MO: no pesa'
      s.push({ tono: historia.costo ? 'ok' : 'warn', texto: `${historia.nombre}${historia.uniCant ? ` pasa a ${historia.uniCant} y` : ''} ${pesa}` })
      s.push({ tono: 'muted', texto: `Sin peso propio: el avance de ${historia.nombre} es el promedio de sus ${n} ${n === 1 ? 'tarea' : 'tareas'}` })
    }
    return s
  }, [enPlazo, historia, n])

  const agregarSub = () => { const t = borradorSub.trim(); if (t.length >= 2) { setSubtareas((p) => [...p, t]); setBorradorSub('') } }
  const teclaSub = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); agregarSub() } }

  const limpiar = () => {
    setUnidad(''); setCantidad(''); setMetodo(''); setInsumos(insumosPropuestos); setSubtareas([]); setBorradorSub(''); setComentario(''); setDestino('nota')
    setPedCant(''); setPedUni(''); setImpQuien(''); setImpCuando(''); setResultado(null)
  }
  const enviar = async (modo: ModoEnvio) => {
    if (pendiente || nombre.trim().length < 2) return
    setPendiente(true)
    const form = new FormData()
    form.set('nombre', nombre.trim()); form.set('padre_id', padre.id)
    form.set('unidad', unidad); form.set('cantidad', cantidad.replace(',', '.'))
    form.set('inicio_plan', inicio); form.set('fin_plan', fin); form.set('metodo', metodoEfectivo)
    form.set('cuadrilla_id', cuadrillaId); form.set('responsable_id', responsableId)
    form.set('comentario', comentario); form.set('destino', destino)
    form.set('ped_cantidad', pedCant.replace(',', '.')); form.set('ped_unidad', pedUni)
    form.set('imp_responsable', impQuien); form.set('imp_compromiso', impCuando)
    for (const i of insumos) form.append('insumo', JSON.stringify({ tipo: i.tipo, activo_id: i.activo_id, nombre: i.nombre }))
    for (const s of [...subtareas, ...(borradorSub.trim().length >= 2 ? [borradorSub.trim()] : [])]) form.append('subtarea', s)
    const r = await crear(form)
    setPendiente(false)
    if (r.ok) { limpiar(); alCreada(r.id ?? null, modo) } else setResultado({ ok: false, texto: r.error })
  }
  // El árbol dispara el envío (Enter / Tab): se registra la versión de este render, sin deps.
  useEffect(() => { enviarRef.current = (m) => { void enviar(m) } })
  useEffect(() => () => { enviarRef.current = null }, [enviarRef])

  const insumosBloque = (alto: 32 | 44) => (
    <Campo rotulo="Insumos" nota={alto === 32 ? contadorInsumos(insumos) : `${insumos.filter((i) => i.tipo === 'activo').length} activo${insumos.filter((i) => i.tipo === 'activo').length === 1 ? '' : 's'}`} alto={alto}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {insumos.map((i, k) => <ChipInsumo key={`${i.nombre}-${k}`} i={i} obraId={obraId} alto={alto === 44 ? 38 : 32} alQuitar={() => setInsumos((p) => p.filter((_, j) => j !== k))} />)}
        <BuscadorInsumo activos={activos} obraId={obraId} alto={alto === 44 ? 38 : 32} alElegir={(i) => setInsumos((p) => [...p, i])} />
      </div>
    </Campo>
  )
  const subtareasBloque = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.tintaSuave }}>
        <span>Subtareas</span><span style={{ color: C.tenue }}>{subtareas.length} · no entran al cronograma</span>
      </div>
      {subtareas.map((s, k) => (
        <div key={`${s}-${k}`} style={{ height: '34px', display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px', color: C.tinta, borderBottom: `1px solid ${C.bordeTarjeta}` }}>
          <span style={{ width: '12px', height: '12px', border: `1.5px solid ${C.bordeFuerte}`, borderRadius: '3px' }} />
          <span style={{ flex: 1 }}>{s}</span>
          <button type="button" onClick={() => setSubtareas((p) => p.filter((_, j) => j !== k))} aria-label={`Quitar ${s}`} style={{ border: 'none', background: 'none', padding: 0, color: C.tenue, cursor: 'pointer', display: 'flex' }}><Ico d={P.cerrar} s={11} /></button>
        </div>
      ))}
      <div style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px', color: C.tintaSuave }}>
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={12} /></span>
        <input value={borradorSub} onChange={(e) => setBorradorSub(e.target.value)} onKeyDown={teclaSub} onBlur={agregarSub} placeholder="Nueva subtarea" aria-label="Nueva subtarea" data-testid="tarea-nueva-subtarea"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: C.tinta, padding: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>Enter</span>
      </div>
    </div>
  )
  const comentarioBloque = (alto: 32 | 44) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Campo rotulo="Comentario" nota={alto === 32 ? 'destino' : undefined} alto={alto}>
        <input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={400} data-testid="tarea-comentario" style={estiloControl(alto)} />
      </Campo>
      <div style={{ display: 'flex', gap: '6px' }}>
        {DESTINOS.map((d) => <Chip key={d.id} activo={destino === d.id} onClick={() => setDestino(d.id)} alto={alto === 44 ? 36 : 32} testid={`destino-${d.id}`}>{d.label}</Chip>)}
      </div>
      {destino === 'pedido' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Campo rotulo="Cuánto" nota="el material es el comentario" alto={alto}><input value={pedCant} onChange={(e) => setPedCant(e.target.value)} inputMode="decimal" data-testid="pedido-cantidad" style={estiloControl(alto, true)} /></Campo>
          <Campo rotulo="Unidad" alto={alto}><input value={pedUni} onChange={(e) => setPedUni(e.target.value)} maxLength={24} data-testid="pedido-unidad" style={estiloControl(alto)} /></Campo>
        </div>
      )}
      {destino === 'impedimento' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Campo rotulo="Quién lo destraba" alto={alto}><input value={impQuien} onChange={(e) => setImpQuien(e.target.value)} maxLength={120} data-testid="impedimento-responsable" style={estiloControl(alto)} /></Campo>
          <Campo rotulo="Compromete" alto={alto}><CampoFecha valor={impCuando} alCambiar={setImpCuando} alto={alto} testid="impedimento-compromiso" etiqueta="Compromete" /></Campo>
        </div>
      )}
    </div>
  )
  const fechas = (alto: 32 | 44) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      <Campo rotulo="Comienzo" alto={alto}><CampoFecha valor={inicio} alCambiar={setInicio} alto={alto} testid="tarea-inicio" etiqueta="Comienzo" anioBase={anioBase} /></Campo>
      <Campo rotulo="Fin" nota={diasHabiles != null ? `${diasHabiles} ${alto === 32 ? (diasHabiles === 1 ? 'día hábil' : 'días hábiles') : (diasHabiles === 1 ? 'día' : 'días')}` : undefined} alto={alto}>
        <CampoFecha valor={fin} alCambiar={setFin} alto={alto} testid="tarea-fin" etiqueta="Fin" anioBase={anioBase} />
      </Campo>
    </div>
  )
  const uniCant = (alto: 32 | 44) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      <Campo rotulo="Unidad" alto={alto}>
        <Combo valor={unidad} alCambiar={setUnidad} alto={alto} vacio="sin unidad" testid="tarea-unidad" etiqueta="Unidad"
          opciones={[{ valor: '', etiqueta: 'sin unidad' }, ...UNIDADES.map((u) => ({ valor: u, etiqueta: u }))]} />
      </Campo>
      <Campo rotulo="Cantidad" alto={alto}><input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" data-testid="tarea-cantidad" style={estiloControl(alto, true)} /></Campo>
    </div>
  )

  return (
    <>
      <aside className="hidden md:flex" data-testid="form-tarea" style={{ borderLeft: `1px solid ${C.borde}`, padding: '18px 24px 28px', flexDirection: 'column', gap: '14px', minHeight: '760px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '11.5px', color: C.tenue, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>Tarea nueva · dentro de <span style={{ color: C.tintaMedia }}>{padre.camino}</span></span>
            <button type="button" onClick={alCerrar} aria-label="Cerrar" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}><Ico d={P.cerrar} s={14} /></button>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: nombre ? C.tinta : C.tenue }}>{nombre || 'sin nombre todavía'}</div>
        </div>
        <Resultado r={resultado} />
        {uniCant(32)}
        {fechas(32)}
        <Campo rotulo="Método de avance" nota={unidad && cantidad && metodoEfectivo === 'cantidad' ? `${unidad} ejecutadas / ${cantidad}` : undefined}>
          <Combo valor={metodoEfectivo} alCambiar={(v) => setMetodo(v as typeof metodo)} testid="tarea-metodo" etiqueta="Método de avance"
            opciones={[{ valor: 'cantidad', etiqueta: 'Cantidad' }, { valor: 'pasos', etiqueta: 'Pasos' }, { valor: 'partes', etiqueta: 'Partes' }, { valor: 'manual', etiqueta: 'Manual' }]} />
        </Campo>
        {insumosBloque(32)}
        {subtareasBloque}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Campo rotulo="Cuadrilla">
            <Combo valor={cuadrillaId} alCambiar={setCuadrillaId} vacio="sin asignar" testid="tarea-cuadrilla" etiqueta="Cuadrilla"
              opciones={[{ valor: '', etiqueta: 'sin asignar' }, ...cuadrillas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]} />
          </Campo>
          <Campo rotulo="Responsable">
            <Combo valor={responsableId} alCambiar={setResponsableId} vacio="sin asignar" testid="tarea-responsable" etiqueta="Responsable" alinearMenu="derecha"
              opciones={[{ valor: '', etiqueta: 'sin asignar' }, ...personas.map((p) => ({ valor: p.id, etiqueta: nombreDePersona(p) }))]} />
          </Campo>
        </div>
        {comentarioBloque(32)}
        {comprobaciones.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: `1px solid ${C.borde}`, paddingTop: '14px' }}>
            {comprobaciones.map((c, i) => <Aviso key={i} tono={c.tono} tam={12}>{c.texto}</Aviso>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <button type="button" onClick={() => enviar('seguir')} disabled={pendiente || nombre.trim().length < 2} data-testid="crear-y-seguir" style={{ ...ESTILO_PRIMARIA_32, opacity: nombre.trim().length < 2 ? 0.5 : 1 }}>
            <Ico d={P.ok} s={13} />{pendiente ? 'Creando…' : 'Crear y seguir con otra'}
          </button>
          <button type="button" onClick={() => enviar('abrir')} disabled={pendiente || nombre.trim().length < 2} data-testid="crear-y-abrir" style={ESTILO_SECUNDARIA_32}>Crear y abrir</button>
        </div>
      </aside>

      <div className="flex md:hidden" data-testid="form-tarea-telefono" style={{ position: 'fixed', top: '44px', left: 0, right: 0, bottom: '64px', flexDirection: 'column', background: C.superficie, zIndex: 30, overflowY: 'auto' }}>
        {/* MB2: el nombre se escribe en la cabecera de la hoja (16/600), no en un campo «Nombre» aparte. */}
        <CabeceraTelefono miga={`Tarea nueva · ${padre.camino.split(' › ').slice(-2).join(' › ')}`} alVolver={alCerrar}
          titulo={<input value={nombre} onChange={(e) => alCambiarNombre(e.target.value)} placeholder="Nombre de la tarea" aria-label="Nombre de la tarea" data-testid="tarea-nombre-telefono"
            className="focus:outline-none focus-visible:outline-none focus:ring-0"
            style={{ border: 'none', outline: 'none', boxShadow: 'none', padding: 0, background: 'transparent', font: 'inherit', fontSize: '15px', fontWeight: 600, color: C.tinta, width: '100%' }} />} />
        <div style={{ padding: '16px 16px 120px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Resultado r={resultado} />
          {uniCant(44)}
          {fechas(44)}
          {insumosBloque(44)}
          {subtareasBloque}
          {comentarioBloque(44)}
          {historia && (
            <Aviso tono={historia.costo ? 'ok' : 'warn'}>
              {historia.costo && historia.peso ? `${historia.nombre} sigue pesando ${historia.costo} · ${historia.peso}. La tarea no pide peso.` : `${historia.nombre} no tiene costo de MO: no pesa. La tarea no pide peso.`}
            </Aviso>
          )}
        </div>
      </div>
      <PiePrimaria rotulo="Crear la tarea" icono={<Ico d={P.ok} s={15} />} onClick={() => enviar('seguir')} apagada={nombre.trim().length < 2} testid="crear-la-tarea" pendiente={pendiente} />
    </>
  )
}
