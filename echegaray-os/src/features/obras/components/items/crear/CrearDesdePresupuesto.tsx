'use client'

// C02 · MC5 — CREAR DESDE EL PRESUPUESTO. Porte literal de `C02.html` (1440) y `MC5.html` (390).
//
//   escritorio  `padding:22px 30px 34px`, grilla `minmax(0,1fr) 400px`, gap 44
//               chips de 32 (Todas · Sin elegir · Sin análisis) y buscador de 220×32 a la derecha
//               tabla `24px 60px minmax(0,1fr) 80px 80px 80px 110px`, gap 14, cabecera 34
//               rubro 38px: chevron 12 faint · «01 · Obra gruesa» 12/600 uppercase · «8 partidas · 8 elegidas» mono 11,5
//               partida 44px: casilla 14 · código mono 11,5 faint · nombre 13 (muted si no está elegida) ·
//               uni mono 12 muted · cant · HH («sin análisis» itálica faint) · costo «$ 0,86 M»
//               aside (400, línea a la izquierda, `padding-left:34`): «Cómo queda en el plan» (8 renglones
//               13px), «Frentes · opcional» con el campo mono de 32, y el aviso ámbar «N partidas sin
//               análisis entran sin HH plan» + la nota de `partida_id` / `analisis_id`
//   teléfono    «PR-0042 · R03» 15/600 · «14 de 19 elegidas» 12 muted · chips de 36 corribles ·
//               grupos de 36 con «8/8» · partidas de 52 con casilla 16, «HH 96» o «sin análisis» en warn,
//               «un · 4» mono a la derecha · la nota «Partida → historia · …» · primaria «Convertir 14 partidas»
//
// La cabecera de la obra recibe por `estadoCabecera`: Presupuesto · Partidas · Elegidas · HH del análisis,
// y la primaria «Convertir N partidas en plan». Nada se escribe hasta apretarla.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Buscador } from '../../canon/Piezas'
import { Aviso, Casilla, Chip, Eyebrow, Falta, PiePrimaria, Resultado, estiloControl } from './Piezas'
import { publicarCifras, publicarPrimaria, retirar } from './estadoCabecera'
import {
  agruparPartidas, avisoSinAnalisis, elegibles, FILTROS_PARTIDAS, resumenDeConversion, rotuloConvertir,
  type FiltroPartidas, type PartidaParaConvertir,
} from '../../../services/partidasParaConvertir'
import { millones } from '../../../services/estructura'
import type { PresupuestoDeLaObra } from '../../../services/estructuraService'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

const GRID = '24px 60px minmax(0,1fr) 80px 80px 80px 110px'
const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
const mono12 = (color: string = C.tinta) => ({ fontFamily: MONO, fontSize: '12px', color, textAlign: 'right' as const })

export function CrearDesdePresupuesto({ obraId, presupuesto, error, inicioObra, convertir }: {
  obraId: string
  presupuesto: PresupuestoDeLaObra | null
  error: string | null
  /** El inicio previsto de la obra: la conversión lo necesita. null = sin cargar. */
  inicioObra: string | null
  convertir: AccionFormulario
}) {
  const router = useRouter()
  const partidas = useMemo(() => presupuesto?.partidas ?? [], [presupuesto])
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(elegibles(partidas).filter((id) => !partidas.find((p) => p.id === id)?.sinAnalisis)))
  const [filtro, setFiltro] = useState<FiltroPartidas>('todas')
  const [query, setQuery] = useState('')
  const [frentes, setFrentes] = useState('')
  const [plegados, setPlegados] = useState<Set<string>>(new Set())
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  const grupos = useMemo(() => agruparPartidas(partidas, elegidas, filtro, query), [partidas, elegidas, filtro, query])
  const resumen = useMemo(() => resumenDeConversion(partidas, elegidas), [partidas, elegidas])
  const aviso = avisoSinAnalisis(resumen)
  const puede = Boolean(presupuesto) && resumen.elegidas > 0 && inicioObra != null && presupuesto?.estado === 'adjudicada' && presupuesto?.congelada
  const motivo = !presupuesto ? 'sin presupuesto vinculado'
    : presupuesto.estado !== 'adjudicada' ? 'el presupuesto no está adjudicado'
      : !presupuesto.congelada ? 'el presupuesto no está congelado'
        : inicioObra == null ? 'la obra no tiene inicio previsto' : resumen.elegidas === 0 ? 'no hay partidas elegidas' : null

  const alternar = (id: string) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const plegar = (r: string) => setPlegados((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n })

  const enviar = async () => {
    if (!puede || pendiente) return
    setPendiente(true)
    const form = new FormData()
    for (const id of elegidas) form.append('partida', id)
    form.set('frentes', frentes)
    const r = await convertir(form)
    setPendiente(false)
    if (r.ok) {
      setResultado({ ok: true, texto: r.mensaje ?? 'Partidas convertidas.' })
      router.replace(`/obras/${obraId}?vista=tareas&sub=arbol`)
      router.refresh()
    } else setResultado({ ok: false, texto: r.error })
  }

  useEffect(() => {
    publicarCifras({
      presupuesto: presupuesto?.rotulo ?? null,
      partidas: presupuesto ? String(resumen.partidas) : null,
      elegidas: presupuesto ? String(resumen.elegidas) : null,
      hh: resumen.hh == null ? null : num(Math.round(resumen.hh)),
    })
    publicarPrimaria({
      rotulo: rotuloConvertir(resumen.elegidas, true), icono: 'flecha', apagada: !puede, motivo,
      testid: 'primaria-convertir', alPulsar: enviar, pendiente,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumen.elegidas, resumen.hh, resumen.partidas, puede, motivo, pendiente, presupuesto?.rotulo, frentes])
  useEffect(() => () => retirar(), [])

  const cuerpoVacio = error
    ? <p style={{ fontSize: '13px', color: C.neg }} data-testid="presupuesto-error">No pude leer el presupuesto: {error}</p>
    : !presupuesto
      ? <p style={{ fontSize: '13px', color: C.tintaSuave }} data-testid="sin-presupuesto">Esta obra no tiene presupuesto vinculado. Se vincula desde el presupuesto, en Administración.</p>
      : partidas.length === 0
        ? <p style={{ fontSize: '13px', color: C.tintaSuave }} data-testid="sin-partidas">El presupuesto no tiene partidas, o no tenés permiso para verlas.</p>
        : null

  const chips = (alto: 32 | 36) => FILTROS_PARTIDAS.map((f) => (
    <Chip key={f.id} activo={filtro === f.id} onClick={() => setFiltro(f.id)} alto={alto} testid={`filtro-${f.id}`}
      icono={f.id === 'sin_analisis' ? <Ico d={P.alerta} s={12} /> : undefined}>{f.label}</Chip>
  ))

  return (
    <>
      {/* ═══ ESCRITORIO (C02) ═══ */}
      <div className="hidden md:grid" data-testid="crear-presupuesto" style={{ padding: '22px 30px 34px', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: '44px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Resultado r={resultado} />
          {cuerpoVacio}
          {!cuerpoVacio && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>{chips(32)}</div>
                <div style={{ marginLeft: 'auto' }}>
                  <Buscador valor={query} alCambiar={setQuery} alLimpiar={() => setQuery('')} placeholder="Buscar partida" ancho={220} testid="buscar-partida" />
                </div>
              </div>
<div style={{ overflowX: 'auto' }}><div style={{ minWidth: '720px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '14px', height: '34px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>
                  <span /><span>Cód.</span><span>Partida</span><span style={{ textAlign: 'right' }}>Uni</span><span style={{ textAlign: 'right' }}>Cant.</span><span style={{ textAlign: 'right' }}>HH</span><span style={{ textAlign: 'right' }}>Costo</span>
                </div>
                {grupos.map((g) => {
                  const abierto = !plegados.has(g.rubro)
                  return (
                    <div key={g.rubro} data-testid={`rubro-partidas-${g.rubro}`}>
                      <button type="button" onClick={() => plegar(g.rubro)} style={{
                        width: '100%', height: '38px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${C.borde}`,
                        fontSize: '12px', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, color: C.tinta,
                        background: 'none', border: 'none', borderBottomStyle: 'solid', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                      }}>
                        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={abierto ? P.abajo : P.derecha} s={12} /></span>
                        <span>{g.rotulo}</span>
                        <span style={{ fontFamily: MONO, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: C.tenue, fontSize: '11.5px' }}>
                          {g.n} {g.n === 1 ? 'partida' : 'partidas'} · {g.elegidas} {g.elegidas === 1 ? 'elegida' : 'elegidas'}
                        </span>
                      </button>
                      {abierto && g.partidas.map((p) => <FilaPartida key={p.id} p={p} elegida={elegidas.has(p.id)} alternar={() => alternar(p.id)} />)}
                    </div>
                  )
                })}
              </div>
</div></div>
            </>
          )}
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Eyebrow>Cómo queda en el plan</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: C.tinta }}>
              {([
                ['Rubro del presupuesto', '→ Rubro'],
                ['Partida', '→ Historia'],
                ['Épicas', <Falta key="e">se arman después, a mano</Falta>],
                ['Unidad y cantidad', 'se conservan'],
                ['HH plan', resumen.sinAnalisis > 0 ? `del análisis · ${resumen.sinAnalisis} sin análisis` : 'del análisis'],
                ['Método de avance', 'cantidad'],
                ['Ponderación', 'por costo · 100 % por rubro'],
                ['Fechas', inicioObra ? `desde ${inicioObra.slice(8, 10)}/${inicioObra.slice(5, 7)} · inicio de la obra` : <Falta key="f">sin cargar</Falta>],
              ] as const).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}><span style={{ color: C.tintaSuave }}>{k}</span><span>{v}</span></div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Eyebrow derecha="opcional">Frentes</Eyebrow>
            <div style={{ fontSize: '13px', color: C.tintaMedia }}>Partir cada historia en frentes al convertir</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.tintaSuave }}><span>Nombres, separados por coma</span></div>
              <input value={frentes} onChange={(e) => setFrentes(e.target.value)} placeholder="Sector A, Sector B" data-testid="campo-frentes-conversion"
                style={estiloControl(32, true)} />
            </div>
            <div style={{ fontSize: '12px', color: C.tenue }}>La cantidad se reparte en partes iguales y se conserva; si no cierra en diezmilésimos, no genera.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: `1px solid ${C.borde}` }}>
            {aviso && <Aviso tono="warn">{aviso}</Aviso>}
            {motivo && !aviso && <Aviso tono="warn">No se puede convertir: {motivo}</Aviso>}
            <div style={{ fontSize: '12px', color: C.tenue }}>Cada partida guarda <span style={{ fontFamily: MONO }}>partida_id</span> y <span style={{ fontFamily: MONO }}>analisis_id</span>: el ID no ordena la obra.</div>
          </div>
        </aside>
      </div>

      {/* ═══ TELÉFONO (MC5) ═══ */}
      <div className="flex md:hidden" data-testid="crear-presupuesto-telefono" style={{ padding: '16px 16px 120px', flexDirection: 'column', gap: '12px' }}>
        <Resultado r={resultado} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: C.tinta }}>{presupuesto?.rotulo ?? <Falta>sin presupuesto</Falta>}</div>
          {presupuesto && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{resumen.elegidas} de {resumen.partidas} elegidas</div>}
        </div>
        {cuerpoVacio}
        {!cuerpoVacio && (
          <>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', scrollbarWidth: 'none' }}>{chips(36)}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {grupos.map((g) => (
                <div key={g.rubro}>
                  <div style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${C.borde}`, fontSize: '11.5px', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, color: C.tinta }}>
                    <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.abajo} s={12} /></span>{g.rotulo}
                    <span style={{ fontFamily: MONO, fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: C.tenue }}>{g.elegidas}/{g.n}</span>
                  </div>
                  {g.partidas.map((p) => (
                    <button key={p.id} type="button" onClick={() => !p.convertida && !p.sinCantidad && alternar(p.id)} data-testid={`partida-telefono-${p.id}`}
                      style={{ width: '100%', minHeight: '52px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '14px', background: 'none', border: 'none', borderBottomStyle: 'solid', padding: 0, font: 'inherit', textAlign: 'left', color: C.tinta, cursor: 'pointer' }}>
                      <Casilla marcada={elegidas.has(p.id)} onClick={() => alternar(p.id)} etiqueta={`Elegir ${p.descripcion}`} tam={16} apagada={p.convertida || p.sinCantidad} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.codigo && <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, marginRight: '8px' }}>{p.codigo}</span>}{p.descripcion}
                        </div>
                        <div style={{ fontSize: '12px', color: C.tintaSuave }}>
                          {p.convertida ? 'ya convertida' : p.sinAnalisis ? <span style={{ color: C.warn }}>sin análisis</span> : `HH ${num(p.hh ?? 0)}`}
                        </div>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: '12px', color: C.tintaSuave, flexShrink: 0 }}>
                        {p.unidad && p.cantidad != null ? `${p.unidad} · ${num(p.cantidad)}` : <Falta>sin cómputo</Falta>}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: C.tenue }}>Partida → historia · la cantidad se conserva · ponderación por costo.</div>
          </>
        )}
      </div>
      <PiePrimaria rotulo={rotuloConvertir(resumen.elegidas, false)} icono={<Ico d={P.flecha} s={15} />} onClick={enviar}
        apagada={!puede} nota={motivo} testid="primaria-convertir-telefono" pendiente={pendiente} />
    </>
  )
}

function FilaPartida({ p, elegida, alternar }: { p: PartidaParaConvertir; elegida: boolean; alternar: () => void }) {
  const apagada = p.convertida || p.sinCantidad
  return (
    <div role="row" data-testid={`partida-${p.id}`} onClick={() => !apagada && alternar()} style={{
      display: 'grid', gridTemplateColumns: GRID, gap: '14px', height: '44px', alignItems: 'center',
      borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13px', cursor: apagada ? 'default' : 'pointer', color: C.tinta,
    }}>
      <Casilla marcada={elegida} onClick={alternar} etiqueta={`Elegir ${p.descripcion}`} apagada={apagada} testid={`elegir-${p.id}`} />
      <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tenue }}>{p.codigo ?? ''}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: elegida ? C.tinta : C.tintaSuave }}>
        {p.descripcion}{p.convertida && <span style={{ fontSize: '11.5px', color: C.tenue }}> · ya convertida</span>}
      </span>
      <span style={mono12(C.tintaSuave)}>{p.unidad ?? ''}</span>
      <span style={mono12()}>{p.cantidad == null ? <Falta>sin cómputo</Falta> : num(p.cantidad)}</span>
      <span style={mono12()}>{p.hh == null ? <Falta>sin análisis</Falta> : num(p.hh)}</span>
      <span style={mono12()}>{p.costo == null ? <Falta>sin costo</Falta> : millones(p.costo)}</span>
    </div>
  )
}
