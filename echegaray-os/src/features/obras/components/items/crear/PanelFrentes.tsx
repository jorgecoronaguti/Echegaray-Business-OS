'use client'

// C07 · MC8 — DIVIDIR UNA HISTORIA EN FRENTES. Porte literal del aside de `C07.html` (420) y de `MC8.html`.
//
//   escritorio  aside `padding:18px 24px 28px`, gap 18, `min-height:560`: camino 11,5 faint · nombre 16/600 ·
//               «kg · 1.840 · 01/09 → 04/09 · 40 % de Platea» 12,5 muted; eyebrow «Dividir en frentes»; el
//               campo mono de 32 «Nombres de los frentes, separados por coma»; el párrafo 12,5 (1.55);
//               «Se puede porque» con las razones en 12 muted (tilde verde / triángulo ámbar); al pie la
//               primaria «Dividir en N frentes». La VISTA PREVIA va debajo del árbol (caja punteada).
//   teléfono    a pantalla completa: «‹ Fundaciones › Platea» / «Armadura · kg · 1.840»; campo de 44; el
//               párrafo corto; «Vista previa» (filas de 44); «Se puede porque»; primaria «Dividir en N frentes»

import { useState } from 'react'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Aviso, CabeceraTelefono, Eyebrow, ESTILO_PRIMARIA_32, PiePrimaria, Resultado, estiloControl } from './Piezas'
import { razonesParaDividir, rotuloPlan, rotuloUniCant, textoDeFrentes, vistaPreviaFrentes } from '../../../services/estructura'
import type { NodoObra } from '../../../services/wbs'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

export function PanelFrentes({ nodo, camino, pesoEnPadre, nAvances, nPasos, texto, alCambiarTexto, dividir, alCerrar, alDividido }: {
  nodo: NodoObra
  /** «Obra gruesa › Fundaciones › Platea». */
  camino: string
  /** «40 % de Platea» · null. */
  pesoEnPadre: string | null
  nAvances: number
  nPasos: number
  texto: string
  alCambiarTexto: (v: string) => void
  dividir: AccionFormulario
  alCerrar: () => void
  alDividido: () => void
}) {
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const previa = vistaPreviaFrentes(nodo.nombre, nodo.cantidad_objetivo, texto)
  const razonesLargas = razonesParaDividir(nodo, nAvances, nPasos, true)
  const razonesCortas = razonesParaDividir(nodo, nAvances, nPasos, false)
  const sePuede = razonesLargas.every((r) => r.ok)
  const n = previa.nombres.length
  const listo = sePuede && n >= 2
  const rotulo = `Dividir en ${n} ${n === 1 ? 'frente' : 'frentes'}`
  const uniCant = rotuloUniCant(nodo.unidad, nodo.cantidad_objetivo)
  const sub = [uniCant, rotuloPlan(nodo.inicio_plan, nodo.fin_plan), pesoEnPadre].filter(Boolean).join(' · ')

  const enviar = async () => {
    if (!listo || pendiente) return
    setPendiente(true)
    const form = new FormData()
    form.set('nombres', texto)
    const r = await dividir(form)
    setPendiente(false)
    if (r.ok) { setResultado({ ok: true, texto: r.mensaje ?? 'Dividida en frentes.' }); alDividido() }
    else setResultado({ ok: false, texto: r.error })
  }

  const razones = (lista: typeof razonesLargas, tam: 12 | 13) => lista.map((r, i) => <Aviso key={i} tono={r.ok ? 'ok' : 'warn'} tam={tam}>{r.texto}</Aviso>)

  return (
    <>
      {/* ═══ ESCRITORIO (C07) ═══ */}
      <aside className="hidden md:flex" data-testid="panel-frentes" style={{ borderLeft: `1px solid ${C.borde}`, padding: '18px 24px 28px', flexDirection: 'column', gap: '18px', minHeight: '560px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '11.5px', color: C.tenue, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>{camino}</span>
            <button type="button" onClick={alCerrar} aria-label="Cerrar" data-testid="cerrar-frentes" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}><Ico d={P.cerrar} s={14} /></button>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: C.tinta }}>{nodo.nombre}</div>
          {sub && <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{sub}</div>}
        </div>
        <Resultado r={resultado} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Eyebrow>Dividir en frentes</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.tintaSuave }}><span>Nombres de los frentes, separados por coma</span></div>
            <input value={texto} onChange={(e) => alCambiarTexto(e.target.value)} placeholder="Eje 1–4, Eje 5–8" data-testid="campo-nombres-frentes" style={estiloControl(32, true)} />
          </div>
          <div style={{ fontSize: '12.5px', color: C.tintaMedia, lineHeight: 1.55 }}>{textoDeFrentes(nodo.cantidad_objetivo, nodo.unidad, true)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: `1px solid ${C.borde}`, paddingTop: '14px' }}>
          <Eyebrow>Se puede porque</Eyebrow>
          {razones(razonesLargas, 12)}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <button type="button" onClick={enviar} disabled={!listo || pendiente} data-testid="primaria-dividir" style={{ ...ESTILO_PRIMARIA_32, opacity: listo ? 1 : 0.5 }}>
            <Ico d={P.ok} s={13} />{pendiente ? 'Dividiendo…' : rotulo}
          </button>
        </div>
      </aside>

      {/* ═══ TELÉFONO (MC8) ═══ */}
      <div className="flex md:hidden" data-testid="panel-frentes-telefono" style={{ position: 'fixed', top: '44px', left: 0, right: 0, bottom: '64px', flexDirection: 'column', background: C.superficie, zIndex: 30, overflowY: 'auto' }}>
        <CabeceraTelefono miga={camino} titulo={[nodo.nombre, uniCant].filter(Boolean).join(' · ')} alVolver={alCerrar} />
        <div style={{ padding: '16px 16px 110px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Resultado r={resultado} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>Nombres de los frentes, separados por coma</div>
            <input value={texto} onChange={(e) => alCambiarTexto(e.target.value)} placeholder="Eje 1–4, Eje 5–8" style={estiloControl(44, true)} />
          </div>
          <div style={{ fontSize: '13px', color: C.tintaMedia, lineHeight: 1.5 }}>{textoDeFrentes(nodo.cantidad_objetivo, nodo.unidad, false)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Eyebrow>Vista previa</Eyebrow>
            <div style={{ minHeight: '44px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${C.borde}`, fontSize: '14px', color: C.tinta }}>
              <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nodo.nombre} <span style={{ color: C.tenue }}>· contenedor</span></div>
              <span style={{ fontFamily: MONO }}>{uniCant ?? ''}</span>
            </div>
            {previa.filas.map((f, i) => (
              <div key={i} style={{ minHeight: '44px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: i < previa.filas.length - 1 ? `1px solid ${C.borde}` : 'none', fontSize: '14px', color: C.tinta }}>
                <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: '16px' }}>{f.nombre}</div>
                <span style={{ fontFamily: MONO }}>{rotuloUniCant(nodo.unidad, f.cantidad) ?? ''}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Eyebrow>Se puede porque</Eyebrow>
            {razones(razonesCortas, 12)}
          </div>
        </div>
      </div>
      <PiePrimaria rotulo={rotulo} icono={<Ico d={P.ok} s={15} />} onClick={enviar} apagada={!listo} testid="primaria-dividir-telefono" pendiente={pendiente} />
    </>
  )
}

/** LA VISTA PREVIA DEBAJO DEL ÁRBOL (C07): caja punteada con el contenedor y sus frentes. */
export function VistaPreviaFrentes({ nodo, codigo, texto }: { nodo: NodoObra; codigo: string; texto: string }) {
  const previa = vistaPreviaFrentes(nodo.nombre, nodo.cantidad_objetivo, texto)
  return (
    <div className="hidden md:flex" data-testid="vista-previa-frentes" style={{ marginTop: '14px', padding: '12px 14px', border: `1px dashed ${C.bordeFuerte}`, borderRadius: '8px', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: C.tinta }}>
      <Eyebrow>Vista previa</Eyebrow>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: C.tintaSuave }}>
        <span style={{ paddingLeft: '54px' }}>{codigo} {nodo.nombre} <span style={{ color: C.tenue }}>· contenedor</span></span>
        <span style={{ fontFamily: MONO }}>{rotuloUniCant(nodo.unidad, nodo.cantidad_objetivo) ?? ''}</span>
      </div>
      {previa.filas.map((f, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ paddingLeft: '72px' }}>{f.nombre}</span>
          <span style={{ fontFamily: MONO }}>{rotuloUniCant(nodo.unidad, f.cantidad) ?? ''}</span>
        </div>
      ))}
    </div>
  )
}
