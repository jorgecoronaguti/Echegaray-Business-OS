'use client'

// B07 — PONDERACIÓN · LA OBRA ENTERA, DERIVADA DEL COSTO (`?vista=tareas&sub=arbol&panel=ponderacion`).
//
//   «Salón Comercial · 4 rubros › 12 épicas › 45 historias» 11,5 faint · título 17/600 «Las historias
//   pesan por su costo de mano de obra: $ 18.766.718 en 15 de 45.»
//   chips: $ Por costo de MO (default) · A mano · Parejo · Por días teóricos · Por HH plan — apagados con
//   su motivo («HH plan: 45 de 45 sin HH → apagado»)
//   tabla: Historia (con «Rubro › Épica» en gris) · Uni · cant · Costo MO · Peso · barra de 6
//   «Suma · 15 historias · $ 18.766.718 · 100 %» (verde) · «30 historias sin costo de MO · no pesan»
//   (warn) con «cargar» por fila y «… y 27 más · verlas»
//   aside 380: «Regla» y «Cómo queda la obra» por rubro (sin costo: «sin costo · no pesa»), «Mano de obra»
//
// Cargar, editar o borrar un costo recalcula TODO el árbol en el acto (pesoMO sobre lo que hay en
// pantalla) y se guarda en la base; la vista `obra_historia_peso` publica el mismo número.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { publicarPrimaria, retirar } from './estadoCabecera'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { Barra6, Chip, EYEBROW, Resultado } from './Piezas'
import { pesosDeLaObra, rotuloPeso, rotuloPesos, type ItemMO, type MetodoPonderacion } from '../../../services/pesoMO'
import { rotuloUniCant } from '../../../services/estructura'
import type { NodoObra } from '../../../services/wbs'
import type { HistoriaPeso } from '../../../services/obrasService'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui/FormAccion'

const METODOS: { id: MetodoPonderacion; label: string; icono: React.ReactNode }[] = [
  { id: 'costo_mo', label: 'Por costo de MO', icono: <Ico d={P.costo} s={12} /> },
  { id: 'manual', label: 'A mano', icono: <Ico d={P.editar} s={12} /> },
  { id: 'parejo', label: 'Parejo', icono: <Ico d={P.todo} s={12} /> },
  { id: 'dias_teoricos', label: 'Por días teóricos', icono: <Ico d={P.fecha} s={12} /> },
  { id: 'hh_plan', label: 'Por HH plan', icono: <Ico d={P.hh} s={12} /> },
]
const GRID = 'minmax(0,1fr) 110px 130px 80px 200px'
const MAS = 3

export function PanelPonderacionObra({
  obraId, nombreObra, nodos, items, metodo, historiasVista, guardarCosto, elegirMetodo, alCerrar, alRepartirAMano, alGuardado,
}: {
  obraId: string
  nombreObra: string
  nodos: NodoObra[]
  items: ItemMO[]
  metodo: MetodoPonderacion
  /** Lo que publica `obra_historia_peso` (el peso de los métodos que no son por costo). */
  historiasVista: HistoriaPeso[]
  guardarCosto: (historiaId: string, form: FormData) => Promise<ResultadoAccion>
  elegirMetodo: AccionFormulario
  alCerrar: () => void
  /** «A mano»: abrir el reparto entre hermanas de un contenedor (C05). */
  alRepartirAMano: (contenedorId: string) => void
  alGuardado: () => void
}) {
  const router = useRouter()
  // B07: la primaria de la cabecera es «Sellar la línea base»; lleva al checklist de preparación (C10),
  // que es donde se sella con sus nueve comprobaciones a la vista.
  useEffect(() => {
    publicarPrimaria({ rotulo: 'Sellar la línea base', icono: 'ok', apagada: false, motivo: null, testid: 'b07-sellar', alPulsar: () => router.push(`/obras/${obraId}?vista=resumen`) })
    return () => retirar()
  }, [router, obraId])
  const [costos, setCostos] = useState<Record<string, number | null>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [verTodas, setVerTodas] = useState(false)
  const [abiertaSinCosto, setAbiertaSinCosto] = useState(true)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  const vivos = useMemo(() => items.map((i) => (i.id in costos ? { ...i, costo_mo: costos[i.id] } : i)), [items, costos])
  const pesos = useMemo(() => pesosDeLaObra(vivos, metodo === 'costo_mo' || metodo === 'parejo' || metodo === 'manual' ? metodo : 'costo_mo'), [vivos, metodo])
  const pesoVista = useMemo(() => new Map(historiasVista.map((h) => [h.actividad_id, h.peso])), [historiasVista])
  const pesoDe = (id: string) => (metodo === 'dias_teoricos' || metodo === 'hh_plan' ? pesoVista.get(id) ?? null : pesos.get(id)?.peso ?? null)

  const porId = useMemo(() => new Map(nodos.map((n) => [n.id, n])), [nodos])
  const nombreDe = (id: string | null) => (id ? porId.get(id)?.nombre ?? '' : '')
  const ruta = (h: ItemMO) => {
    const partes: string[] = []
    let p = h.padre_id
    while (p) { partes.unshift(nombreDe(p)); p = vivos.find((x) => x.id === p)?.padre_id ?? null }
    return partes.join(' › ')
  }
  const historias = vivos.filter((i) => i.nivel === 'historia')
  const conCosto = historias.filter((h) => h.costo_mo != null)
  const sinCosto = historias.filter((h) => h.costo_mo == null)
  const total = conCosto.reduce((s, h) => s + (h.costo_mo ?? 0), 0)
  const rubros = vivos.filter((i) => i.nivel === 'rubro')
  const epicas = vivos.filter((i) => i.nivel === 'epica')

  // Los métodos sin datos se apagan con su motivo.
  const tareasDe = (id: string) => nodos.filter((n) => n.padre_id === id)
  const sinHH = historias.filter((h) => (porId.get(h.id)?.hh_plan ?? null) == null && tareasDe(h.id).every((t) => t.hh_plan == null)).length
  const sinDias = historias.filter((h) => tareasDe(h.id).every((t) => !t.inicio_plan || !t.fin_plan)).length
  const apagado: Partial<Record<MetodoPonderacion, string>> = {}
  if (historias.length && sinHH === historias.length) apagado.hh_plan = `HH plan: ${sinHH} de ${historias.length} sin HH → apagado`
  if (historias.length && sinDias === historias.length) apagado.dias_teoricos = `Días teóricos: ${sinDias} de ${historias.length} sin fechas → apagado`
  if (historias.length === 0) apagado.costo_mo = 'Sin historias todavía'

  const cambiarMetodo = async (m: MetodoPonderacion) => {
    const f = new FormData(); f.set('metodo', m)
    const r = await elegirMetodo(f)
    if (r.ok) alGuardado(); else setResultado({ ok: false, texto: r.error })
  }
  const guardar = async (id: string) => {
    const t = borrador.trim()
    const valor = t === '' ? null : Number(t.replace(/\./g, '').replace(',', '.').replace(/[$\s]/g, ''))
    if (valor != null && (!Number.isFinite(valor) || valor < 0)) { setResultado({ ok: false, texto: 'El costo tiene que ser un número positivo.' }); return }
    setCostos((c) => ({ ...c, [id]: valor }))   // el árbol entero se recalcula ya
    setEditando(null)
    const f = new FormData(); f.set('costo_mo', valor == null ? '' : String(valor))
    const r = await guardarCosto(id, f)
    setResultado(r.ok ? { ok: true, texto: r.mensaje ?? 'Guardado.' } : { ok: false, texto: r.error })
    if (r.ok) alGuardado()
  }
  const celdaCosto = (h: ItemMO) => {
    if (editando === h.id) {
      return (
        <input autoFocus value={borrador} onChange={(e) => setBorrador(e.target.value)} onBlur={() => guardar(h.id)} data-testid={`costo-${h.id}`}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardar(h.id) } if (e.key === 'Escape') setEditando(null) }}
          placeholder="$" inputMode="decimal" style={{ width: '100%', height: '32px', border: `1px solid ${C.grafito}`, borderRadius: '6px', padding: '0 10px', textAlign: 'right', fontFamily: MONO, fontSize: '13px', boxSizing: 'border-box' }} />
      )
    }
    return h.costo_mo == null ? (
      <button type="button" onClick={() => { setEditando(h.id); setBorrador('') }} data-testid={`cargar-${h.id}`}
        style={{ width: '100%', height: '32px', border: `1px dashed ${C.bordeFuerte}`, borderRadius: '6px', background: C.superficie, font: 'inherit', fontSize: '12.5px', fontStyle: 'italic', color: C.tenue, textAlign: 'right', padding: '0 10px', cursor: 'pointer' }}>cargar</button>
    ) : (
      <button type="button" onClick={() => { setEditando(h.id); setBorrador(String(h.costo_mo)) }} title="Editar o borrar (vacío) el costo" data-testid={`editar-costo-${h.id}`}
        style={{ width: '100%', border: 'none', background: 'none', fontFamily: MONO, fontSize: '13px', color: C.tinta, textAlign: 'right', padding: 0, cursor: 'pointer' }}>{rotuloPesos(h.costo_mo)}</button>
    )
  }
  const fila = (h: ItemMO, sangria = 0) => {
    const n = porId.get(h.id)
    const p = pesoDe(h.id)
    return (
      <div key={h.id} data-testid={`pond-historia-${h.id}`} className="md:grid flex flex-wrap" style={{ gridTemplateColumns: GRID, gap: '20px', minHeight: '45px', alignItems: 'center', borderBottom: `1px solid ${C.bordeTarjeta}`, paddingLeft: `${sangria}px`, columnGap: '20px', rowGap: '4px', padding: '6px 0 6px ' + sangria + 'px' }}>
        <div style={{ fontSize: '13.5px', color: C.tinta, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 100%' }}>
          {n?.nombre} <span style={{ fontSize: '12px', color: C.tenue }}>{ruta(h)}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: '12.5px', color: C.tintaSuave, textAlign: 'right' }}>{n ? rotuloUniCant(n.unidad, n.cantidad_objetivo) ?? '' : ''}</div>
        <div style={{ minWidth: '120px' }}>{celdaCosto(h)}</div>
        <div style={{ fontFamily: p == null ? 'inherit' : MONO, fontSize: '13px', textAlign: 'right', color: p == null ? C.warn : C.tinta, fontStyle: p == null ? 'italic' : 'normal' }}>{p == null ? 'no pesa' : rotuloPeso(p)}</div>
        <div className="hidden md:block">{p != null && <Barra6 pct={p * 100} color={C.grafito} />}</div>
      </div>
    )
  }

  const titulo = metodo === 'costo_mo'
    ? <>Las historias pesan por su costo de mano de obra: {rotuloPesos(total)} en {conCosto.length} de {historias.length}.</>
    : <>Las historias pesan {METODOS.find((m) => m.id === metodo)?.label.toLowerCase()}. {sinCosto.length ? `${sinCosto.length} sin costo de MO.` : ''}</>
  const visiblesSin = verTodas ? sinCosto : sinCosto.slice(0, MAS)
  const sumaPeso = conCosto.reduce((s, h) => s + (pesoDe(h.id) ?? 0), 0)

  return (
    <div data-testid="panel-ponderacion-obra" className="md:grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '52px', padding: '24px 30px 36px', maxWidth: '1380px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '11.5px', color: C.tenue }}>{nombreObra} · {rubros.length} {rubros.length === 1 ? 'rubro' : 'rubros'} › {epicas.length} {epicas.length === 1 ? 'épica' : 'épicas'} › {historias.length} {historias.length === 1 ? 'historia' : 'historias'}</div>
            <div style={{ fontSize: '17px', fontWeight: 600, color: C.tinta }} data-testid="titulo-ponderacion">{titulo}</div>
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0, alignSelf: 'flex-start' }}><Ico d={P.cerrar} s={14} /></button>
        </div>
        <Resultado r={resultado} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {METODOS.map((m) => (
            <Chip key={m.id} activo={metodo === m.id} apagado={Boolean(apagado[m.id])} onClick={() => cambiarMetodo(m.id)} icono={m.icono} testid={`metodo-pond-${m.id}`} titulo={apagado[m.id]}>{m.label}</Chip>
          ))}
          {(apagado.hh_plan ?? apagado.dias_teoricos) && <span style={{ fontSize: '12px', color: C.tenue }}>{apagado.hh_plan ?? apagado.dias_teoricos}</span>}
        </div>
        {metodo === 'manual' && (
          <div style={{ fontSize: '12.5px', color: C.tintaSuave, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            A mano (override): cada nivel reparte 100 % entre hermanas.
            {rubros.map((r) => <button key={r.id} type="button" onClick={() => alRepartirAMano(r.id)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: C.tinta, textDecoration: 'underline', cursor: 'pointer' }}>Repartir en {nombreDe(r.id)}</button>)}
          </div>
        )}
        {/* En escritorio la grilla; en el teléfono cada historia es una fila que se parte (flex-wrap). */}
        <div style={{ overflowX: 'auto' }}>
          <div className="hidden md:grid" style={{ gridTemplateColumns: GRID, gap: '20px', height: '34px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, ...EYEBROW }}>
            <div>Historia</div><div style={{ textAlign: 'right' }}>Uni · cant</div><div style={{ textAlign: 'right' }}>Costo MO</div><div style={{ textAlign: 'right' }}>Peso</div><div />
          </div>
          {conCosto.map((h) => fila(h))}
          {conCosto.length > 0 && (
            <div className="md:grid flex" style={{ gridTemplateColumns: GRID, gap: '20px', minHeight: '48px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, fontSize: '13px', fontWeight: 600 }}>
              <div style={{ flex: 1 }}>Suma · {conCosto.length} {conCosto.length === 1 ? 'historia' : 'historias'}</div>
              <div className="hidden md:block" />
              <div style={{ fontFamily: MONO, textAlign: 'right' }}>{rotuloPesos(total)}</div>
              <div style={{ fontFamily: MONO, textAlign: 'right', color: Math.round(sumaPeso * 1000) === 1000 ? C.pos : C.warn }}>{rotuloPeso(sumaPeso)}</div>
              <div className="hidden md:block"><Barra6 pct={sumaPeso * 100} color={C.grafito} /></div>
            </div>
          )}
          {sinCosto.length > 0 && (
            <>
              <button type="button" onClick={() => setAbiertaSinCosto((v) => !v)} data-testid="sin-costo-plegar"
                style={{ width: '100%', height: '46px', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', borderBottom: `1px solid ${C.bordeTarjeta}`, background: 'none', font: 'inherit', cursor: 'pointer', padding: 0 }}>
                <span style={{ color: C.warn, display: 'flex' }}><Ico d={abiertaSinCosto ? P.abajo : P.derecha} s={12} /></span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: C.warn, flex: 1, textAlign: 'left' }}>{sinCosto.length} {sinCosto.length === 1 ? 'historia sin costo de MO · no pesa' : 'historias sin costo de MO · no pesan'}</span>
                <span className="hidden md:inline" style={{ fontSize: '12px', color: C.tintaSuave, width: '200px', textAlign: 'left' }}>cargar el costo las incorpora</span>
              </button>
              {abiertaSinCosto && visiblesSin.map((h) => fila(h, 20))}
              {abiertaSinCosto && sinCosto.length > MAS && !verTodas && (
                <div style={{ padding: '12px 20px', fontSize: '13px', color: C.tintaSuave }}>… y {sinCosto.length - MAS} más <button type="button" onClick={() => setVerTodas(true)} style={{ border: 'none', background: 'none', padding: 0, marginLeft: '6px', font: 'inherit', color: C.tinta, textDecoration: 'underline', cursor: 'pointer' }}>verlas</button></div>
              )}
            </>
          )}
          {historias.length === 0 && <div style={{ padding: '18px 0', fontSize: '13px', color: C.tintaSuave }}>Todavía no hay historias: el peso nace cuando una historia carga su costo de mano de obra.</div>}
        </div>
      </div>

      <aside style={{ borderLeft: `1px solid ${C.borde}`, paddingLeft: '34px', display: 'flex', flexDirection: 'column', gap: '12px', alignSelf: 'start', marginTop: '6px' }} className="max-md:!border-l-0 max-md:!pl-0 max-md:mt-6">
        <div style={EYEBROW}>Regla</div>
        <div style={{ fontSize: '13px', color: C.tintaMedia, lineHeight: 1.55 }}>
          El peso de una historia es su costo de MO sobre el total cargado. El avance de la obra = Σ (% de la historia × su peso); el costo teórico = avance × MO total. Una historia sin costo no pesa y se marca; cargarlo la incorpora y recalcula todo.
        </div>
        <div style={{ ...EYEBROW, marginTop: '10px' }}>Cómo queda la obra</div>
        {rubros.map((r) => {
          const p = pesos.get(r.id)
          return (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: C.tintaMedia }}>
              <span>{nombreDe(r.id)}</span>
              {p?.peso != null && p.costo != null
                ? <span style={{ fontFamily: MONO, color: C.tinta }}>{rotuloPesos(p.costo)} · {rotuloPeso(p.peso)}</span>
                : <span style={{ fontStyle: 'italic', color: p?.estado === 'sin_hijas' ? C.tenue : C.warn }}>{p?.estado === 'sin_hijas' ? 'sin hijas' : 'sin costo · no pesa'}</span>}
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, borderTop: `1px solid ${C.borde}`, paddingTop: '10px' }}>
          <span>Mano de obra</span><span style={{ fontFamily: MONO }}>{total > 0 ? rotuloPesos(total) : <span style={{ fontStyle: 'italic', color: C.tenue, fontFamily: 'inherit', fontWeight: 400 }}>sin cargar</span>}</span>
        </div>
      </aside>
    </div>
  )
}
