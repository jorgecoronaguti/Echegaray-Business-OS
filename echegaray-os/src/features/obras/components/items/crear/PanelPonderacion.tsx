'use client'

// C05 · MC4 — PONDERACIÓN · REPARTIR EL PESO ENTRE HERMANAS. Porte literal de `C05.html` y `MC4.html`.
//
//   escritorio  `padding:24px 30px 36px`, grilla `minmax(0,1fr) 380px`, gap 52, `max-width:1380`
//               «Obra gruesa › Fundaciones · 40 % de Obra gruesa» 11,5 faint · título 17/600
//               cinco chips de 32 (A mano · Parejo · Por días teóricos · Por HH plan · Por costo teórico) y
//               el motivo del apagado en 12 faint; tabla `minmax(0,1fr) 120px 110px 90px 200px` gap 20:
//               Historia · Días teór. · HH plan · Pond. (campo de 32, mono 13, «%» faint; borde ámbar en 0)
//               · barra de 6 grafito; la fila «Suma» de 48 (13/600, la barra ámbar si no cierra)
//               aside: «Regla», «Cómo queda la obra» (13, valores mono verde/ámbar, «sin hijas» itálica) y
//               la nota «“Por costo teórico” necesita una partida en cada historia; hoy faltan 2.»
//   teléfono    a pantalla completa: «‹ Obra gruesa › Fundaciones» / «Repartir el peso · 65 %»; cuatro chips
//               de 36; filas de 56 con el stepper 40 · 52 · 40; «Suma» + barra + «Cada nivel suma 100 %
//               entre hermanas.»; primaria «Guardar el reparto», apagada mientras no cierre

import { useEffect, useMemo, useState } from 'react'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Barra6, CabeceraTelefono, Chip, Eyebrow, Falta, PiePrimaria, Resultado } from './Piezas'
import { publicarPrimaria, retirar } from './estadoCabecera'
import {
  comoQuedaLaObra, METODOS_REPARTO, motivoMetodoApagado, pesoEnElAbuelo, repartir, sumaPonderacion, tituloPonderacion,
  type FilaPonderacion, type MetodoReparto, type NivelEstructura, type Ponderaciones,
} from '../../../services/estructura'
import type { NodoObra } from '../../../services/wbs'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

const GRID = 'minmax(0,1fr) 120px 110px 90px 200px'
const ICONO: Record<MetodoReparto, React.ReactNode> = {
  mano: <Ico d={P.editar} s={12} />, parejo: <Ico d={P.todo} s={12} />, dias_teoricos: <Ico d={P.fecha} s={12} />,
  hh_plan: <Ico d={P.hh} s={12} />, costo_mo: <Ico d={P.costo} s={12} />,
}
const num = (n: number | null, dec = 1) => (n == null ? '' : n.toLocaleString('es-AR', { maximumFractionDigits: dec }))

export function PanelPonderacion({ nodos, ponds, padre, hijas, nivelHijas, camino, guardar, alCerrar, alGuardado }: {
  nodos: NodoObra[]
  ponds: Ponderaciones
  padre: NodoObra
  hijas: FilaPonderacion[]
  nivelHijas: NivelEstructura
  /** «Obra gruesa › Fundaciones». */
  camino: string
  guardar: AccionFormulario
  alCerrar: () => void
  alGuardado: () => void
}) {
  const [metodo, setMetodo] = useState<MetodoReparto>('mano')
  const [valores, setValores] = useState<Record<string, number | null>>(() => Object.fromEntries(hijas.map((h) => [h.id, h.pond])))
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const suma = sumaPonderacion(valores)
  const cierra = suma === 100
  const como = useMemo(() => comoQuedaLaObra(nodos, ponds, { padreId: padre.id, valores }), [nodos, ponds, padre.id, valores])
  const enAbuelo = pesoEnElAbuelo(nodos, ponds, padre.id)
  const apagados = Object.fromEntries(METODOS_REPARTO.map((m) => [m.id, motivoMetodoApagado(hijas, m.id)])) as Record<MetodoReparto, string | null>
  const motivoVisible = apagados.costo_mo ?? apagados.hh_plan ?? apagados.dias_teoricos

  const elegirMetodo = (m: MetodoReparto) => {
    setMetodo(m)
    if (m === 'mano') return
    const r = repartir(hijas, m)
    if (r) setValores(r)
  }
  const fijar = (id: string, v: string) => {
    setMetodo('mano')
    const t = v.trim().replace(',', '.')
    if (t === '') { setValores((p) => ({ ...p, [id]: null })); return }
    const n = Number(t)
    if (Number.isFinite(n)) setValores((p) => ({ ...p, [id]: Math.max(0, Math.min(100, n)) }))
  }
  const paso = (id: string, d: number) => fijar(id, String(Math.round(((valores[id] ?? 0) + d) * 10) / 10))

  const enviar = async () => {
    if (pendiente) return
    setPendiente(true)
    const form = new FormData()
    form.set('metodo', metodo)
    for (const h of hijas) form.set(`pond_${h.id}`, valores[h.id] == null ? '' : String(valores[h.id]))
    const r = await guardar(form)
    setPendiente(false)
    if (r.ok) { setResultado({ ok: true, texto: r.mensaje ?? 'Reparto guardado.' }); alGuardado() }
    else setResultado({ ok: false, texto: r.error })
  }

  useEffect(() => {
    publicarPrimaria({ rotulo: 'Guardar el reparto', icono: 'ok', apagada: hijas.length === 0, motivo: hijas.length === 0 ? 'sin hijas' : null, testid: 'primaria-guardar-reparto', alPulsar: enviar, pendiente })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores, metodo, pendiente, hijas.length])
  useEffect(() => () => retirar(), [])

  const filaComo = (c: (typeof como)[number]) => (
    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: `${c.profundidad * 14}px` }}>
      <span style={{ color: C.tintaSuave }}>{c.nombre}</span>
      {c.suma == null ? <Falta>sin hijas</Falta> : <span style={{ fontFamily: MONO, color: c.tono === 'pos' ? C.pos : C.warn }}>{num(c.suma)} %</span>}
    </div>
  )

  return (
    <>
      {/* ═══ ESCRITORIO (C05) ═══ */}
      <div className="hidden md:grid" data-testid="panel-ponderacion" style={{ padding: '24px 30px 36px', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '52px', alignItems: 'start', maxWidth: '1380px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '11.5px', color: C.tenue, display: 'flex', justifyContent: 'space-between' }}>
              <span>{camino ? <>{camino} › </> : ''}<span style={{ color: C.tintaMedia }}>{padre.nombre}</span>{enAbuelo ? ` · ${enAbuelo}` : ''}</span>
              <button type="button" onClick={alCerrar} aria-label="Cerrar" data-testid="cerrar-ponderacion" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}><Ico d={P.cerrar} s={14} /></button>
            </div>
            <div style={{ fontSize: '17px', fontWeight: 600, color: C.tinta }} data-testid="titulo-ponderacion">{tituloPonderacion(padre, nivelHijas, suma)}</div>
          </div>
          <Resultado r={resultado} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {METODOS_REPARTO.map((m) => (
                <Chip key={m.id} activo={metodo === m.id} apagado={apagados[m.id] != null} onClick={() => elegirMetodo(m.id)} icono={ICONO[m.id]} testid={`reparto-${m.id}`} titulo={apagados[m.id] ?? undefined}>{m.label}</Chip>
              ))}
            </div>
            {motivoVisible && <span style={{ fontSize: '12px', color: C.tenue, marginLeft: '6px' }}>{motivoVisible}</span>}
          </div>
<div style={{ overflowX: 'auto' }}><div style={{ minWidth: '700px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '34px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>
              <div>{nivelHijas === 'historia' ? 'Historia' : nivelHijas === 'epica' ? 'Épica' : nivelHijas === 'tarea' ? 'Tarea' : 'Ítem'}</div>
              <div style={{ textAlign: 'right' }}>Días teór.</div><div style={{ textAlign: 'right' }}>HH plan</div><div style={{ textAlign: 'right' }}>Pond.</div><div />
            </div>
            {hijas.length === 0 && <div style={{ padding: '18px 0', fontSize: '12.5px', color: C.tintaSuave }}>Este ítem no tiene hijas que repartir.</div>}
            {hijas.map((h) => {
              const v = valores[h.id]
              const vacio = v == null || v === 0
              return (
                <div key={h.id} role="row" data-testid={`pond-${h.id}`} style={{ display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '52px', alignItems: 'center', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13.5px', color: C.tinta }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.nombre}</div>
                  <div style={{ fontFamily: MONO, fontSize: '12.5px', color: C.tintaSuave, textAlign: 'right' }}>{h.diasTeoricos == null ? <Falta>sin días</Falta> : h.diasTeoricos}</div>
                  <div style={{ fontFamily: MONO, fontSize: '12.5px', color: C.tintaSuave, textAlign: 'right' }}>{h.hhPlan == null ? <Falta>sin HH</Falta> : num(h.hhPlan, 0)}</div>
                  <div style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 10px', border: `1px solid ${vacio ? C.warn : C.bordeFuerte}`, borderRadius: '6px', fontFamily: MONO, fontSize: '13px' }}>
                    <input value={v == null ? '' : String(v)} onChange={(e) => fijar(h.id, e.target.value)} inputMode="decimal" aria-label={`Ponderación de ${h.nombre}`} data-testid={`pond-campo-${h.id}`}
                      style={{ width: '100%', textAlign: 'right', border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: C.tinta, padding: 0 }} />
                    <span style={{ color: C.tenue, marginLeft: '3px' }}>%</span>
                  </div>
                  <Barra6 pct={v ?? 0} color={C.grafito} />
                </div>
              )
            })}
            {hijas.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '48px', alignItems: 'center', fontSize: '13px', fontWeight: 600, color: C.tinta }} data-testid="pond-suma">
                <div>Suma</div>
                <div style={{ fontFamily: MONO, fontWeight: 400, color: C.tintaSuave, textAlign: 'right' }}>{hijas.some((h) => h.diasTeoricos == null) ? `${hijas.reduce((s, h) => s + (h.diasTeoricos ?? 0), 0)} + ?` : hijas.reduce((s, h) => s + (h.diasTeoricos ?? 0), 0)}</div>
                <div style={{ fontFamily: MONO, fontWeight: 400, color: C.tintaSuave, textAlign: 'right' }}>{hijas.some((h) => h.hhPlan == null) ? `${num(hijas.reduce((s, h) => s + (h.hhPlan ?? 0), 0), 0)} + ?` : num(hijas.reduce((s, h) => s + (h.hhPlan ?? 0), 0), 0)}</div>
                <div style={{ textAlign: 'right', fontFamily: MONO, color: cierra ? C.pos : C.warn }}>{num(suma)} %</div>
                <Barra6 pct={suma} color={cierra ? C.grafito : C.warn} />
              </div>
            )}
          </div>
</div></div>
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Eyebrow>Regla</Eyebrow>
            <div style={{ fontSize: '13px', color: C.tintaMedia, lineHeight: 1.55 }}>Cada nivel suma 100 % entre hermanas. El avance de la obra es la suma ponderada de las tareas medidas; una hermana en 0 % no cuenta y se marca.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Eyebrow>Cómo queda la obra</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }} data-testid="como-queda">{como.map(filaComo)}</div>
          </div>
          {apagados.costo_mo && <div style={{ fontSize: '12px', color: C.tenue }}>«Por costo teórico» necesita una partida en cada {nivelHijas === 'historia' ? 'historia' : 'hija'}; hoy faltan {hijas.filter((h) => !h.tienePartida || h.costoMo == null).length}.</div>}
        </aside>
      </div>

      {/* ═══ TELÉFONO (MC4) ═══ */}
      <div className="flex md:hidden" data-testid="panel-ponderacion-telefono" style={{ position: 'fixed', top: '44px', left: 0, right: 0, bottom: '64px', flexDirection: 'column', background: C.superficie, zIndex: 30, overflowY: 'auto' }}>
        <CabeceraTelefono miga={camino ? `${camino} › ${padre.nombre}` : padre.nombre} alVolver={alCerrar}
          titulo={<>Repartir el peso · <span style={{ color: cierra ? C.pos : C.warn }}>{num(suma)} %</span></>} />
        <div style={{ padding: '16px 16px 110px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Resultado r={resultado} />
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', scrollbarWidth: 'none' }}>
            {METODOS_REPARTO.filter((m) => m.id !== 'costo_mo').map((m) => (
              <Chip key={m.id} activo={metodo === m.id} apagado={apagados[m.id] != null} onClick={() => elegirMetodo(m.id)} icono={ICONO[m.id]} alto={36} testid={`reparto-telefono-${m.id}`}>{m.corto}</Chip>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {hijas.map((h) => {
              const v = valores[h.id]
              const vacio = v == null || v === 0
              const boton = { width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', color: C.tintaSuave, background: C.superficie, cursor: 'pointer', padding: 0 } as const
              return (
                <div key={h.id} style={{ minHeight: '56px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '14px', color: C.tinta }}>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.nombre}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button type="button" onClick={() => paso(h.id, -5)} aria-label={`Menos peso a ${h.nombre}`} style={boton}><Ico d={P.menos} s={13} /></button>
                    <span style={{ width: '52px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${vacio ? C.warn : C.bordeFuerte}`, borderRadius: '6px', fontFamily: MONO, fontSize: '14px' }}>{v == null ? '—' : `${num(v)}%`}</span>
                    <button type="button" onClick={() => paso(h.id, 5)} aria-label={`Más peso a ${h.nombre}`} style={boton}><Ico d={P.mas} s={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: C.tinta }}>Suma</span>
              <span style={{ fontFamily: MONO, color: cierra ? C.pos : C.warn }}>{num(suma)} %</span>
            </div>
            <Barra6 pct={suma} color={cierra ? C.grafito : C.warn} />
            <div style={{ fontSize: '12px', color: C.tenue }}>Cada nivel suma 100 % entre hermanas.</div>
          </div>
        </div>
      </div>
      <PiePrimaria rotulo="Guardar el reparto" icono={<Ico d={P.ok} s={15} />} onClick={enviar} apagada={!cierra} testid="guardar-reparto-telefono" pendiente={pendiente}
        nota={cierra ? null : `suman ${num(suma)} %`} />
    </>
  )
}
