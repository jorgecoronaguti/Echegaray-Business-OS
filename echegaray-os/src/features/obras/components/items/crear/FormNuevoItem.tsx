'use client'

// C04 · MC3 — LA FICHA DE LA TAREA NUEVA. Porte literal del aside de `C04.html` (420px) y de `MC3.html`.
//
//   escritorio  aside con línea a la izquierda, `padding:18px 24px 28px`, gap 18, `min-height:760`
//               «Tarea nueva · dentro de <camino>» 11,5 faint · nombre 16/600
//               grilla de 2 columnas, gap 12: Unidad · Cantidad · Ponderación en <padre> («quedan 35 %») ·
//               Método de avance («m³ ejecutados / 38») · Comienzo · Fin («1 día hábil») · Partida del
//               presupuesto (2 col, «PR-0042») · HH plan («del análisis · 2,5 HH/m³») · Cuadrilla ·
//               Responsable (2 col) · Comentario (2 col); casilla «Es un hito (una fecha, sin duración)»
//               las tres comprobaciones (verde/ámbar) con línea arriba; al pie «Crear y seguir con otra»
//               (primaria) y «Crear y abrir» (borde)
//   teléfono    a pantalla completa: «‹ Tarea nueva · Fundaciones › Platea» / nombre; controles de 44;
//               la comprobación «Platea cierra en 100 %»; primaria «Crear la tarea»

import { useMemo, useState } from 'react'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Aviso, CabeceraTelefono, Campo, ESTILO_PRIMARIA_32, ESTILO_SECUNDARIA_32, PiePrimaria, Resultado, estiloControl } from './Piezas'
import { diasHabilesEntre } from '../filasDeItems'
import { ROTULO_NIVEL, type NivelEstructura } from '../../../services/estructura'
import type { PartidaParaConvertir } from '../../../services/partidasParaConvertir'
import { UNIDADES, type Persona } from '../../../types'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import { nombreDePersona } from '../../../../../shared/personas/nombre.ts'

export interface PadreNuevo { id: string | null; nombre: string; camino: string; abuelo: string | null }

export function FormNuevoItem({
  padre, nivel, nombre, alCambiarNombre, quedan, problemaAbuelo, plazo, partidas, presupuesto, cuadrillas, personas,
  crear, alCreada, alCerrar,
}: {
  padre: PadreNuevo
  nivel: NivelEstructura
  nombre: string
  alCambiarNombre: (v: string) => void
  /** Lo que queda libre entre las hermanas (C04 «quedan 35 %»). */
  quedan: number
  /** «Fundaciones sigue en 65 %: falta repartir en sus épicas» · null. */
  problemaAbuelo: string | null
  plazo: { inicio: string | null; fin: string | null }
  partidas: PartidaParaConvertir[]
  presupuesto: string | null
  cuadrillas: { id: string; nombre: string }[]
  personas: Persona[]
  crear: AccionFormulario
  alCreada: (id: string | null, abrir: boolean) => void
  alCerrar: () => void
}) {
  const [unidad, setUnidad] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [pond, setPond] = useState(quedan > 0 ? String(quedan) : '')
  const [metodo, setMetodo] = useState<'cantidad' | 'pasos' | 'manual' | ''>('')
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [partidaId, setPartidaId] = useState('')
  const [hh, setHh] = useState('')
  const [cuadrillaId, setCuadrillaId] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [comentario, setComentario] = useState('')
  const [hito, setHito] = useState(false)
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  const partida = partidas.find((p) => p.id === partidaId) ?? null
  const cant = Number(cantidad.replace(',', '.'))
  const hhSugerida = partida?.hsUnitarias != null && cantidad && Number.isFinite(cant) ? Math.round(partida.hsUnitarias * cant) : null
  const diasHabiles = inicio && fin && fin >= inicio ? diasHabilesEntre(inicio, fin) : null
  const pondN = pond === '' ? null : Number(pond.replace(',', '.'))
  const cierra = pondN != null && Math.round((pondN - quedan) * 10) === 0
  const enPlazo = inicio && fin ? (!plazo.inicio || inicio >= plazo.inicio) && (!plazo.fin || fin <= plazo.fin) : null
  const esTarea = nivel === 'tarea' || nivel === 'subtarea'
  const metodoEfectivo = metodo || (unidad && cantidad ? 'cantidad' : 'manual')

  const comprobaciones = useMemo(() => {
    const salida: { tono: 'ok' | 'warn'; texto: string }[] = []
    if (padre.id) salida.push(cierra
      ? { tono: 'ok', texto: `Con ${pond} % ${padre.nombre} cierra en 100 %` }
      : { tono: 'warn', texto: pondN == null ? `${padre.nombre} queda con ${quedan.toLocaleString('es-AR')} % sin repartir` : `Con ${pond} % ${padre.nombre} no cierra en 100 %` })
    if (enPlazo != null) salida.push(enPlazo ? { tono: 'ok', texto: 'Entra en el plazo de la obra' } : { tono: 'warn', texto: 'Sale del plazo de la obra' })
    if (problemaAbuelo) salida.push({ tono: 'warn', texto: problemaAbuelo })
    return salida
  }, [cierra, pond, pondN, padre, quedan, enPlazo, problemaAbuelo])

  const enviar = async (abrir: boolean) => {
    if (pendiente) return
    setPendiente(true)
    const form = new FormData()
    form.set('nombre', nombre)
    form.set('padre_id', padre.id ?? '')
    form.set('unidad', unidad); form.set('cantidad', cantidad.replace(',', '.'))
    form.set('ponderacion', pond.replace(',', '.')); form.set('metodo', metodoEfectivo)
    form.set('inicio_plan', inicio); form.set('fin_plan', fin)
    form.set('partida_id', partidaId); form.set('hh_plan', hh.replace(',', '.') || (hhSugerida != null ? String(hhSugerida) : ''))
    form.set('cuadrilla_id', cuadrillaId); form.set('responsable_id', responsableId)
    form.set('comentario', comentario); form.set('es_hito', hito ? 'on' : '')
    const r = await crear(form)
    setPendiente(false)
    if (r.ok) alCreada(r.id ?? null, abrir)
    else setResultado({ ok: false, texto: r.error })
  }

  const campos = (alto: 32 | 44) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Campo rotulo="Unidad" alto={alto}>
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)} data-testid="nuevo-unidad" style={estiloControl(alto)}>
            <option value="">sin unidad</option>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Cantidad" alto={alto}>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" data-testid="nuevo-cantidad" style={estiloControl(alto, true)} />
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: alto === 44 ? '1fr' : '1fr 1fr', gap: '12px' }}>
        <Campo rotulo={`Ponderación en ${padre.nombre}`} nota={`quedan ${quedan.toLocaleString('es-AR')} %`} alto={alto}>
          <input value={pond} onChange={(e) => setPond(e.target.value)} inputMode="decimal" data-testid="nuevo-ponderacion" style={estiloControl(alto, true)} />
        </Campo>
        <Campo rotulo="Método de avance" alto={alto} nota={alto === 32 && unidad && cantidad ? `${unidad} ejecutados / ${cantidad}` : undefined}>
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)} data-testid="nuevo-metodo" style={estiloControl(alto)}>
            <option value="">{unidad && cantidad ? 'Cantidad' : 'Manual'}</option>
            <option value="cantidad">Cantidad</option><option value="pasos">Pasos</option><option value="manual">Manual</option>
          </select>
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Campo rotulo="Comienzo" alto={alto}>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} data-testid="nuevo-inicio" style={estiloControl(alto, true)} />
        </Campo>
        <Campo rotulo="Fin" alto={alto} nota={diasHabiles != null ? `${diasHabiles} ${alto === 32 ? (diasHabiles === 1 ? 'día hábil' : 'días hábiles') : (diasHabiles === 1 ? 'día' : 'días')}` : undefined}>
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} data-testid="nuevo-fin" style={estiloControl(alto, true)} />
        </Campo>
      </div>
      <Campo rotulo={alto === 32 ? 'Partida del presupuesto' : 'Partida'} nota={alto === 32 ? presupuesto ?? undefined : undefined} alto={alto}>
        <select value={partidaId} onChange={(e) => setPartidaId(e.target.value)} data-testid="nuevo-partida" style={estiloControl(alto)}>
          <option value="">{partidas.length ? 'sin partida' : presupuesto ? 'sin partidas' : 'sin presupuesto vinculado'}</option>
          {partidas.map((p) => <option key={p.id} value={p.id}>{[p.codigo, p.descripcion].filter(Boolean).join(' ')}</option>)}
        </select>
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Campo rotulo="HH plan" alto={alto} nota={partida?.hsUnitarias != null ? (alto === 32 ? `del análisis · ${partida.hsUnitarias.toLocaleString('es-AR', { maximumFractionDigits: 2 })} HH/${partida.unidad ?? 'un'}` : 'del análisis') : undefined}>
          <input value={hh || (hhSugerida != null ? String(hhSugerida) : '')} onChange={(e) => setHh(e.target.value)} inputMode="decimal" data-testid="nuevo-hh" style={estiloControl(alto, true)} />
        </Campo>
        <Campo rotulo="Cuadrilla" alto={alto}>
          <select value={cuadrillaId} onChange={(e) => setCuadrillaId(e.target.value)} data-testid="nuevo-cuadrilla" style={estiloControl(alto)}>
            <option value="">sin asignar</option>
            {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      </div>
      {alto === 32 && (
        <>
          <Campo rotulo="Responsable" alto={alto}>
            <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} data-testid="nuevo-responsable" style={estiloControl(alto)}>
              <option value="">sin asignar</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{nombreDePersona(p.nombre_completo)}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Comentario" alto={alto}>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={400} data-testid="nuevo-comentario" style={estiloControl(alto)} />
          </Campo>
        </>
      )}
    </>
  )

  const titulo = `${ROTULO_NIVEL[nivel]} nueva`
  return (
    <>
      {/* ═══ ESCRITORIO (C04, el aside de 420) ═══ */}
      <aside className="hidden md:flex" data-testid="form-nuevo-item" style={{ borderLeft: `1px solid ${C.borde}`, padding: '18px 24px 28px', flexDirection: 'column', gap: '18px', minHeight: '760px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '11.5px', color: C.tenue, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>{titulo}{padre.id ? <> · dentro de <span style={{ color: C.tintaMedia }}>{padre.camino}</span></> : ''}</span>
            <button type="button" onClick={alCerrar} aria-label="Cerrar" data-testid="cerrar-nuevo" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}><Ico d={P.cerrar} s={14} /></button>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: nombre ? C.tinta : C.tenue }}>{nombre || 'sin nombre todavía'}</div>
        </div>
        <Resultado r={resultado} />
        {esTarea ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{campos(32)}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Campo rotulo={`Ponderación en ${padre.nombre}`} nota={padre.id ? `quedan ${quedan.toLocaleString('es-AR')} %` : undefined}>
              <input value={pond} onChange={(e) => setPond(e.target.value)} inputMode="decimal" data-testid="nuevo-ponderacion" style={estiloControl(32, true)} />
            </Campo>
            <div style={{ fontSize: '12px', color: C.tenue }}>Un contenedor: unidad, cantidad y fechas van en las tareas que cuelguen adentro.</div>
          </div>
        )}
        {esTarea && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: C.tintaSuave, cursor: 'pointer' }}>
            <input type="checkbox" checked={hito} onChange={(e) => setHito(e.target.checked)} data-testid="nuevo-hito" style={{ width: '14px', height: '14px', margin: 0 }} />
            Es un hito (una fecha, sin duración)
          </label>
        )}
        {comprobaciones.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: `1px solid ${C.borde}`, paddingTop: '14px' }}>
            {comprobaciones.map((c, i) => <Aviso key={i} tono={c.tono} tam={12}>{c.texto}</Aviso>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <button type="button" onClick={() => enviar(false)} disabled={pendiente || nombre.trim().length < 2} data-testid="crear-y-seguir" style={{ ...ESTILO_PRIMARIA_32, opacity: nombre.trim().length < 2 ? 0.5 : 1 }}>
            <Ico d={P.ok} s={13} />{pendiente ? 'Creando…' : 'Crear y seguir con otra'}
          </button>
          <button type="button" onClick={() => enviar(true)} disabled={pendiente || nombre.trim().length < 2} data-testid="crear-y-abrir" style={ESTILO_SECUNDARIA_32}>Crear y abrir</button>
        </div>
      </aside>

      {/* ═══ TELÉFONO (MC3) ═══ */}
      <div className="flex md:hidden" data-testid="form-nuevo-item-telefono" style={{ position: 'fixed', top: '44px', left: 0, right: 0, bottom: '64px', flexDirection: 'column', background: C.superficie, zIndex: 30, overflowY: 'auto' }}>
        <CabeceraTelefono miga={`${titulo}${padre.id ? ` · ${padre.camino}` : ''}`} titulo={nombre || 'sin nombre todavía'} alVolver={alCerrar} />
        <div style={{ padding: '16px 16px 110px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Resultado r={resultado} />
          <Campo rotulo="Nombre" alto={44}>
            <input value={nombre} onChange={(e) => alCambiarNombre(e.target.value)} data-testid="nuevo-nombre-telefono" style={estiloControl(44)} placeholder={titulo} />
          </Campo>
          {esTarea ? campos(44) : (
            <Campo rotulo={`Ponderación en ${padre.nombre}`} nota={padre.id ? `quedan ${quedan.toLocaleString('es-AR')} %` : undefined} alto={44}>
              <input value={pond} onChange={(e) => setPond(e.target.value)} inputMode="decimal" style={estiloControl(44, true)} />
            </Campo>
          )}
          {comprobaciones[0] && <Aviso tono={comprobaciones[0].tono}>{comprobaciones[0].texto.replace(`Con ${pond} % `, '')}</Aviso>}
        </div>
      </div>
      <PiePrimaria rotulo={`Crear la ${ROTULO_NIVEL[nivel].toLowerCase()}`} icono={<Ico d={P.ok} s={15} />} onClick={() => enviar(true)}
        apagada={nombre.trim().length < 2} testid="crear-la-tarea" pendiente={pendiente} />
    </>
  )
}
