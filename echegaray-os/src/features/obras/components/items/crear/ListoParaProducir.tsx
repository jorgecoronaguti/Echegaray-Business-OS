'use client'

// C10 · MC11 — LISTO PARA PRODUCIR · SELLAR LA LÍNEA BASE. Porte literal de `C10.html` y `MC11.html`.
//
//   escritorio  `padding:26px 30px 36px`, grilla `minmax(0,1fr) 380px`, gap 52, `max-width:1380`
//               «Preparación · 5 de 9» 17/600 con la barra de 120×6 en marca; la lista con línea arriba, filas
//               de 52 (gap 14, 13,5): tilde verde o círculo hueco faint · título de 220 muted · el detalle
//               (faint cuando está hecho) · «Repartir ›» / «Cargar ›» / «Fijar ›» / «Vincular ›» 12,5/500
//               la nota con el círculo «!» ámbar: «Sellar está apagado: 4 pendientes. Al sellar…»
//               aside: «La obra» (Mano de obra · Costo teórico · HH plan · Avance) y «Qué escribe sellar»
//   teléfono    «Preparación · 5 de 9» 15/600 + barra de 90; filas de 52 (13px, título de 96, chevron faint
//               donde hay trabajo); «Al sellar, Previo → Desarrollo.»; primaria «Sellar línea base» apagada
//               con la nota «4 pendientes»
//
// La primaria de la cabecera («Sellar línea base») la publica esta pantalla; apagada mientras haya pendientes.

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Barra6, Eyebrow, Falta, PiePrimaria, Resultado } from './Piezas'
import { publicarPrimaria, retirar } from './estadoCabecera'
import type { Preparacion } from '../../../services/listoParaProducir'

export function ListoParaProducir({ obraId, preparacion, puedeSellar, sellar, editar }: {
  obraId: string
  preparacion: Preparacion
  puedeSellar: boolean
  sellar: () => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>
  /** La puerta para corregir los campos de la obra (jefe, fechas): la misma del Resumen. */
  editar?: ReactNode
}) {
  const router = useRouter()
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const p = preparacion
  const apagada = p.pendientes > 0 || !puedeSellar
  const pct = p.total === 0 ? 0 : Math.round((p.hechas / p.total) * 100)

  const enviar = async () => {
    if (apagada || pendiente) return
    setPendiente(true)
    const r = await sellar()
    setPendiente(false)
    if (r.ok) { setResultado({ ok: true, texto: r.mensaje ?? 'Línea base sellada.' }); router.refresh() }
    else setResultado({ ok: false, texto: r.error })
  }

  useEffect(() => {
    publicarPrimaria({
      rotulo: 'Sellar línea base', icono: 'ok', apagada, motivo: !puedeSellar ? 'sellar es de Administración' : p.pendientes > 0 ? `${p.pendientes} pendientes` : null,
      testid: 'primaria-sellar', alPulsar: enviar, pendiente,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apagada, p.pendientes, pendiente, puedeSellar])
  useEffect(() => () => retirar(), [])

  const icono = (listo: boolean, s: 13 | 14) => (
    <span style={{ width: '14px', display: 'flex', justifyContent: 'center', color: listo ? C.pos : C.tenue, flexShrink: 0 }}>
      <Ico d={listo ? P.ok : P.pend} s={s} />
    </span>
  )
  const valor = (v: string | null, falta: string, italica = false) => v == null ? <Falta>{falta}</Falta> : <span style={{ fontFamily: italica ? undefined : MONO }}>{v}</span>

  return (
    <>
      {/* ═══ ESCRITORIO (C10) ═══ */}
      <div className="hidden md:grid" data-testid="listo-para-producir" style={{ padding: '26px 30px 36px', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '52px', alignItems: 'start', maxWidth: '1380px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Resultado r={resultado} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '17px', fontWeight: 600, color: C.tinta }} data-testid="preparacion-cuenta">{p.titulo}</div>
            <Barra6 pct={pct} color={C.marca} ancho="120px" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.borde}` }} data-testid="checklist-producir">
            {p.lineas.map((l) => (
              <div key={l.clave} data-testid={`producir-${l.clave}`} data-listo={l.listo ? 'si' : 'no'} style={{ height: '52px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: `1px solid ${C.borde}`, fontSize: '13.5px' }}>
                {icono(l.listo, 14)}
                <span style={{ width: '220px', color: C.tintaSuave, flexShrink: 0 }}>{l.titulo}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: l.listo ? C.tenue : C.tinta }}>{l.detalle}</span>
                {l.accion && (
                  <Link href={l.accion.href} prefetch={false} data-testid={`producir-accion-${l.clave}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: C.tinta, fontWeight: 500, textDecoration: 'none' }}>
                    {l.accion.label}<Ico d={P.derecha} s={12} />
                  </Link>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: C.tintaSuave }} data-testid="producir-nota">
            <span style={{ display: 'flex', color: p.pendientes > 0 ? C.warn : C.pos }}><Ico d={p.pendientes > 0 ? P.bloqueo : P.ok} s={13} /></span>{p.nota}
          </div>
          {editar}
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Eyebrow>La obra</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '13.5px', color: C.tinta }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.tintaSuave }}>Mano de obra</span>{valor(p.obra.manoDeObra, 'sin cargar')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.tintaSuave }}>Costo teórico</span>{valor(p.obra.costoTeorico, 'sin cargar')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.tintaSuave }}>HH plan</span>{valor(p.obra.hhPlan, 'sin cargar')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.tintaSuave }}>Avance</span>{valor(p.obra.avance, 'sin medir · no arrancó')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Eyebrow>Qué escribe sellar</Eyebrow>
            <div style={{ fontSize: '13px', color: C.tintaMedia, lineHeight: 1.55 }}><span style={{ fontFamily: MONO }}>inicio_base · fin_base</span> de cada ítem, una sola vez. Desde ahí, mover una fecha mide desvío en vez de borrarlo.</div>
          </div>
        </aside>
      </div>

      {/* ═══ TELÉFONO (MC11) ═══ */}
      <div className="flex md:hidden" data-testid="listo-para-producir-telefono" style={{ padding: '16px 16px 130px', flexDirection: 'column', gap: '12px' }}>
        <Resultado r={resultado} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: C.tinta }}>{p.titulo}</div>
          <Barra6 pct={pct} color={C.marca} ancho="90px" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.borde}` }}>
          {p.lineas.map((l) => {
            const fila = (
              <>
                {icono(l.listo, 13)}
                <span style={{ width: '96px', color: C.tintaSuave, flexShrink: 0 }}>{l.tituloCorto}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: l.listo ? C.tenue : C.tinta }}>{l.detalleCorto}</span>
                {l.accion && <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.derecha} s={12} /></span>}
              </>
            )
            const estilo = { minHeight: '52px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13px', textDecoration: 'none', color: C.tinta } as const
            return l.accion
              ? <Link key={l.clave} href={l.accion.href} prefetch={false} style={estilo} data-testid={`producir-telefono-${l.clave}`}>{fila}</Link>
              : <div key={l.clave} style={estilo} data-testid={`producir-telefono-${l.clave}`}>{fila}</div>
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.tintaSuave }}>
          <span style={{ display: 'flex', color: p.pendientes > 0 ? C.warn : C.pos }}><Ico d={p.pendientes > 0 ? P.bloqueo : P.ok} s={12} /></span>{p.notaCorta}
        </div>
        {editar}
      </div>
      <PiePrimaria rotulo="Sellar línea base" icono={<Ico d={P.ok} s={15} />} onClick={enviar} apagada={apagada} testid="primaria-sellar-telefono" pendiente={pendiente}
        nota={p.pendientes > 0 ? `${p.pendientes} ${p.pendientes === 1 ? 'pendiente' : 'pendientes'}` : !puedeSellar ? 'sellar es de Administración' : null} />
    </>
  )
}
