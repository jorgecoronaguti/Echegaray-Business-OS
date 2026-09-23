'use client'

// C03 · MC6 — CREAR PEGANDO LA PLANILLA. Porte literal de `C03.html` (1440) y `MC6.html` (390).
//
//   escritorio  `padding:22px 30px 34px`, grilla `380px minmax(0,1fr)`, gap 40
//               izquierda: eyebrow «Pegado del Sheet» + «pestaña NUEVO de <obra>» 12 muted; el área de
//               420px (mono 11, 1.75, borde line-strong, radio 6, `padding:10px 12px`) y la nota faint
//               derecha: eyebrow «Cómo se leyó» con los avisos (13px, ámbar; el último en verde), la
//               tabla `70px minmax(0,1fr) 60px 70px 90px 90px 60px 150px` gap 12, filas de 40, la
//               sangría de 14 por nivel, «—» para las filas sin número, y el pie «Se muestran 15 de 38…»
//   teléfono    «Se pega desde la computadora» 15/600 · «En el teléfono se revisa lo reconocido.» ·
//               los avisos cortos · la lista con código mono 10,5 y «un · 4 · 5 d» · primaria apagada
//               «Crear N ítems» con la nota «desde la computadora»
//
// Nada se escribe hasta «Crear»; la vista previa y la escritura leen con la misma función.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Aviso, Eyebrow, PiePrimaria, Resultado } from './Piezas'
import { publicarCifras, publicarPrimaria, retirar } from './estadoCabecera'
import { bajadaPlanilla, itemsReconocidos, leerPlanilla, rotuloNivel } from '../../../services/planillaPegada'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

const GRID = '70px minmax(0,1fr) 60px 70px 90px 90px 60px 150px'
const MAX_FILAS = 15
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')
const mono12 = (color: string = C.tinta) => ({ fontFamily: MONO, fontSize: '12px', color, textAlign: 'right' as const })

export function CrearPegandoPlanilla({ obraId, nombreObra, plazo, diasHabiles, crear }: {
  obraId: string
  nombreObra: string
  plazo: { inicio: string | null; fin: string | null }
  diasHabiles: number | null
  crear: AccionFormulario
}) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const lectura = useMemo(() => leerPlanilla(texto, plazo), [texto, plazo])
  const reconocidos = itemsReconocidos(lectura)
  const avisosWarn = lectura.avisos.filter((a) => a.tono === 'warn').length
  const puede = reconocidos > 0 && lectura.filas[0]?.nivel === 'rubro'
  const motivo = reconocidos === 0 ? 'pegá la planilla' : lectura.filas[0]?.nivel !== 'rubro' ? 'la primera fila tiene que ser un rubro' : null

  const enviar = async () => {
    if (!puede || pendiente) return
    setPendiente(true)
    const form = new FormData()
    form.set('planilla', texto)
    const r = await crear(form)
    setPendiente(false)
    if (r.ok) {
      setResultado({ ok: true, texto: r.mensaje ?? 'Ítems creados.' })
      router.replace(`/obras/${obraId}?vista=tareas&sub=arbol`)
      router.refresh()
    } else setResultado({ ok: false, texto: r.error })
  }

  useEffect(() => {
    publicarCifras({
      filas: reconocidos > 0 ? String(lectura.filasPegadas) : null,
      reconocidos: reconocidos > 0 ? String(reconocidos) : null,
      avisos: reconocidos > 0 ? String(avisosWarn) : null,
    })
    publicarPrimaria({
      rotulo: `Crear ${reconocidos} ${reconocidos === 1 ? 'ítem' : 'ítems'}`, icono: 'mas', apagada: !puede, motivo,
      testid: 'primaria-crear-planilla', alPulsar: enviar, pendiente,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, reconocidos, avisosWarn, puede, motivo, pendiente])
  useEffect(() => () => retirar(), [])

  const avisos = (cortos: boolean) => lectura.avisos.map((a, i) => (
    <Aviso key={i} tono={a.tono}>{cortos ? a.texto.replace(/ de «.*»$/, '').replace(' · se reparte por días teóricos', ': se reparte por días').replace(/ del plazo.*$/, ' dentro del plazo').replace('Ponderación: la planilla no la trae: se reparte por días', 'Ponderación: se reparte por días') : a.texto}</Aviso>
  ))

  return (
    <>
      {/* ═══ ESCRITORIO (C03) ═══ */}
      <div className="hidden md:grid" data-testid="crear-planilla" style={{ padding: '22px 30px 34px', gridTemplateColumns: '380px minmax(0,1fr)', gap: '40px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Eyebrow derecha={`pestaña NUEVO de ${nombreObra}`}>Pegado del Sheet</Eyebrow>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="campo-planilla" spellCheck={false}
            placeholder={'#\tActividad\tUni\tCant\tComienzo\tFin\tDías'}
            style={{
              height: '420px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', padding: '10px 12px', fontFamily: MONO,
              fontSize: '11px', lineHeight: 1.75, color: C.tintaMedia, whiteSpace: 'pre', overflow: 'auto', resize: 'none', outline: 'none',
              background: C.superficie, width: '100%', boxSizing: 'border-box',
            }} />
          <div style={{ fontSize: '12px', color: C.tenue }}>
            El nivel sale de la numeración; una fila sin número es hija de la anterior. Fechas en el calendario de la obra
            {diasHabiles != null ? ` (L–V, ${diasHabiles} hábiles)` : ''}.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Resultado r={resultado} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Eyebrow>Cómo se leyó</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {lectura.avisos.length === 0
                ? <div style={{ fontSize: '12.5px', color: C.tenue, fontStyle: 'italic' }}>todavía no hay nada pegado</div>
                : avisos(false)}
            </div>
          </div>
<div style={{ overflowX: 'auto' }}><div style={{ minWidth: '800px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '12px', height: '34px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>
              <span>#</span><span>Ítem</span><span style={{ textAlign: 'right' }}>Uni</span><span style={{ textAlign: 'right' }}>Cant.</span>
              <span style={{ textAlign: 'right' }}>Comienzo</span><span style={{ textAlign: 'right' }}>Fin</span><span style={{ textAlign: 'right' }}>Días</span><span style={{ textAlign: 'right' }}>Nivel</span>
            </div>
            {lectura.filas.slice(0, MAX_FILAS).map((f, i) => (
              <div key={i} role="row" data-testid={`fila-planilla-${i}`} style={{ display: 'grid', gridTemplateColumns: GRID, gap: '12px', height: '40px', alignItems: 'center', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13px', color: C.tinta }}>
                <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tenue }}>{f.codigo ?? '—'}</span>
                <span style={{ paddingLeft: `${f.profundidad * 14}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: f.profundidad <= 1 ? 600 : 400 }}>{f.nombre}</span>
                <span style={mono12(C.tintaSuave)}>{f.unidad ?? ''}</span>
                <span style={mono12()}>{f.cantidad == null ? '' : f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                <span style={mono12()}>{dm(f.inicio)}</span>
                <span style={mono12()}>{dm(f.fin)}</span>
                <span style={mono12()}>{f.dias ?? ''}</span>
                <span style={{ fontSize: '12px', color: f.aviso ? C.warn : C.tintaSuave, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '5px' }}>
                  {f.aviso ? <><Ico d={P.alerta} s={12} />{f.aviso}</> : rotuloNivel(f.nivel)}
                </span>
              </div>
            ))}
          </div>
</div></div>
          <div style={{ fontSize: '12px', color: C.tenue }}>
            {reconocidos > 0 ? `Se muestran ${Math.min(MAX_FILAS, reconocidos)} de ${reconocidos}. ` : ''}Nada se escribe hasta «Crear»; después cada ítem se edita en el árbol.
          </div>
        </div>
      </div>

      {/* ═══ TELÉFONO (MC6) ═══ */}
      <div className="flex md:hidden" data-testid="crear-planilla-telefono" style={{ padding: '16px 16px 130px', flexDirection: 'column', gap: '12px' }}>
        <Resultado r={resultado} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: C.tinta }}>Se pega desde la computadora</div>
          <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>En el teléfono se revisa lo reconocido.</div>
        </div>
        {lectura.avisos.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{avisos(true)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lectura.filas.slice(0, MAX_FILAS).map((f, i) => {
            const contenedor = f.profundidad <= 1
            return (
              <div key={i} style={{ minHeight: contenedor ? '40px' : '46px', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: `${f.profundidad * 12}px`, borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: contenedor ? '13px' : '13.5px', fontWeight: contenedor ? 600 : 400, color: C.tinta }}>
                <span style={{ fontFamily: MONO, fontSize: '10.5px', color: C.tenue, fontWeight: 400, width: f.profundidad >= 3 ? '46px' : '26px', flexShrink: 0 }}>{f.codigo ?? '—'}</span>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</span>
                <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tintaSuave, fontWeight: 400 }}>{bajadaPlanilla(f)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <PiePrimaria rotulo={`Crear ${reconocidos} ${reconocidos === 1 ? 'ítem' : 'ítems'}`} icono={<Ico d={P.mas} s={15} />} onClick={enviar}
        apagada nota="desde la computadora" testid="primaria-crear-planilla-telefono" />
    </>
  )
}
