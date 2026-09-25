'use client'

// CREAR LA ESTRUCTURA — el conmutador de la Fase 3 dentro de Trabajo › Tareas (serie B).
//
//   ?crear=mano[&nuevo=<padre>|raiz]   B01–B05 · MB1 · MB2   (Enter agrega hermano · Tab baja · Shift+Tab sube)
//   ?panel=ponderacion                 B07  la obra entera, derivada del costo de MO
//   ?act=<id>&panel=ponderacion        C05  el reparto a mano entre hermanas (override «A mano»)
//   ?act=<id>&panel=subtareas          B06  subtareas e insumos        &panel=frentes  C07
//   ?crear=presupuesto  C02   ?crear=planilla  C03   ?sel=1  C09
//
// Estado del cliente con la URL sincronizada (`replaceState`); las ESCRITURAS van por server actions.

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '../../canon/tokens'
import { ArbolEstructura, type PreviaNuevo, type Tecla } from './ArbolEstructura'
import { CrearDesdePresupuesto } from './CrearDesdePresupuesto'
import { CrearPegandoPlanilla } from './CrearPegandoPlanilla'
import { FormHistoria, type ModoEnvio } from './FormHistoria'
import { FormTarea } from './FormTarea'
import { AsideRubroNuevo, RubrosPropuestos } from './NuevoRubro'
import { PanelPonderacion } from './PanelPonderacion'
import { PanelPonderacionObra } from './PanelPonderacionObra'
import { PanelFrentes, VistaPreviaFrentes } from './PanelFrentes'
import { PanelSubtareas } from './PanelSubtareas'
import { BarraMasiva, CajaMasiva, type AccionMasiva } from './BarraMasiva'
import { Resultado } from './Piezas'
import { filasDePonderacion, hijasDe, nivelDe, nivelDeHijaNueva, porId, type Ponderaciones } from '../../../services/estructura'
import { filasDelArbol, itemsMO } from '../../../services/arbolEstructura'
import { pesosDeLaObra, rotuloPeso, rotuloPesos, type MetodoPonderacion } from '../../../services/pesoMO'
import { frenteDeCamino } from '../../../services/frente'
import type { NodoObra } from '../../../services/wbs'
import type { PresupuestoDeLaObra } from '../../../services/estructuraService'
import type { InsumoTarea } from '../../../services/insumosTarea'
import type { ActivoElegible, PlantillaTareas, RubroPropuesto } from '../../../services/insumosService'
import type { HistoriaPeso } from '../../../services/obrasService'
import type { Persona } from '../../../types'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui/FormAccion'

import { esModoEstructura, type ModoCrear, type ModoEstructura, type PanelEstructura } from './modo'
export { esModoEstructura, type ModoCrear, type ModoEstructura, type PanelEstructura }

export interface AccionesEstructura {
  convertir: AccionFormulario
  crearPlanilla: AccionFormulario
  crearItem: AccionFormulario
  guardarPonderacion: (padreId: string, form: FormData) => Promise<ResultadoAccion>
  dividir: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  guardarSubtareas: (tareaId: string, form: FormData) => Promise<ResultadoAccion>
  aplicarMasiva: AccionFormulario
  guardarCosto: (historiaId: string, form: FormData) => Promise<ResultadoAccion>
  elegirMetodo: AccionFormulario
  agregarInsumo: (tareaId: string, form: FormData) => Promise<ResultadoAccion>
  quitarInsumo: (insumoId: string) => Promise<ResultadoAccion>
  pedirInsumo: (insumoId: string, form: FormData) => Promise<ResultadoAccion>
  alternarSubtarea: (subtareaId: string, hecha: boolean) => Promise<ResultadoAccion>
}

export interface DatosEstructura {
  presupuesto: PresupuestoDeLaObra | null
  presupuestoError: string | null
  /** `archivada`: la obra cerrada no ofrece «Nueva actividad» (Z01: una obra archivada no crea trabajo). */
  obra: { nombre: string; inicio: string | null; fin: string | null; diasHabiles: number | null; archivada?: boolean }
  cuadrillas: { id: string; nombre: string }[]
  personas: Persona[]
  subtareaEstados: Record<string, string | null>
  avancesPor: Record<string, number>
  pasosPor: Record<string, number>
  metodo: MetodoPonderacion
  insumosPor: Record<string, InsumoTarea[]>
  activos: ActivoElegible[]
  plantillas: PlantillaTareas[]
  rubrosPropuestos: RubroPropuesto[]
  historiasVista: HistoriaPeso[]
}

export function Estructura({ obraId, nodos, ponds, modo, datos, acciones, query = '' }: {
  obraId: string
  nodos: NodoObra[]
  ponds: Ponderaciones
  modo: ModoEstructura
  datos: DatosEstructura
  acciones: AccionesEstructura
  query?: string
}) {
  const router = useRouter()
  const mapa = useMemo(() => porId(nodos), [nodos])
  const items = useMemo(() => itemsMO(nodos, ponds), [nodos, ponds])
  const pesos = useMemo(() => pesosDeLaObra(items, datos.metodo), [items, datos.metodo])
  const nInsumos = useMemo(() => Object.fromEntries(Object.entries(datos.insumosPor).map(([k, v]) => [k, v.length])), [datos.insumosPor])
  const filas = useMemo(() => filasDelArbol(nodos, ponds, { metodo: datos.metodo, insumosPor: nInsumos, pesos }), [nodos, ponds, datos.metodo, nInsumos, pesos])
  const base = `/obras/${obraId}?vista=tareas&sub=arbol`
  const ir = useCallback((sufijo: string) => { router.replace(`${base}${sufijo}`); router.refresh() }, [router, base])
  const cerrar = () => ir('')

  const [nuevo, setNuevo] = useState<{ padreId: string | null; nombre: string } | null>(
    () => modo.crear !== 'mano' ? null
      : modo.nuevo ? { padreId: modo.nuevo === 'raiz' ? null : modo.nuevo, nombre: '' }
        : nodos.length === 0 ? { padreId: null, nombre: '' } : null,
  )
  const [previa, setPrevia] = useState<PreviaNuevo | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const enviarRef = useRef<((m: ModoEnvio) => void) | null>(null)
  const [textoFrentes, setTextoFrentes] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [accionMasiva, setAccionMasiva] = useState<AccionMasiva | null>(null)
  const [resultadoMasivo, setResultadoMasivo] = useState<{ ok: boolean; texto: string } | null>(null)

  const padreNuevo = nuevo?.padreId ? mapa.get(nuevo.padreId) ?? null : null
  const nivelNuevo = nivelDeHijaNueva(padreNuevo, mapa, ponds)
  const alPrevia = useCallback((p: PreviaNuevo) => setPrevia(p), [])
  const fijarNuevo = (padreId: string | null, nombre = '') => {
    setNuevo({ padreId, nombre }); setPrevia(null)
    const p = new URLSearchParams(window.location.search)
    p.set('crear', 'mano'); p.set('nuevo', padreId ?? 'raiz'); p.delete('panel'); p.delete('act')
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }
  const caminoDe = (n: NodoObra | null): string => {
    const partes: string[] = []
    let x: NodoObra | undefined | null = n
    while (x) { partes.unshift(x.nombre); x = x.padre_id ? mapa.get(x.padre_id) : null }
    return partes.join(' › ')
  }

  // Rubro, épica y subtarea se crean desde la fila misma (Enter / Tab): no llevan más que el nombre.
  const crearRapido = async (m: ModoEnvio) => {
    if (!nuevo || nuevo.nombre.trim().length < 2 || pendiente) return
    setPendiente(true)
    const form = new FormData()
    form.set('nombre', nuevo.nombre.trim()); form.set('padre_id', nuevo.padreId ?? '')
    const r = await acciones.crearItem(form)
    setPendiente(false)
    if (!r.ok) { setResultado({ ok: false, texto: r.error }); return }
    setResultado(null)
    creada(r.id ?? null, m)
  }
  const creada = (id: string | null, m: ModoEnvio) => {
    if (m === 'abrir' && id) { setNuevo(null); ir(`&act=${id}&panel=subtareas`); return }
    if (m === 'bajar' && id) fijarNuevo(id)
    else fijarNuevo(nuevo?.padreId ?? null)
    router.refresh()
  }
  const conAsideForm = nivelNuevo === 'historia' || nivelNuevo === 'tarea'
  const alTecla = (t: Tecla) => {
    if (!nuevo) return
    if (t === 'escape') { setNuevo(null); return }
    if (t === 'shiftTab') { if (padreNuevo) fijarNuevo(padreNuevo.padre_id, nuevo.nombre); return }
    const conNombre = nuevo.nombre.trim().length >= 2
    if (t === 'enter') { if (conAsideForm) enviarRef.current?.('seguir'); else void crearRapido('seguir'); return }
    // Tab con nombre: crea y baja adentro. Sin nombre: la fila nueva pasa a colgar de la última hermana.
    if (conNombre) { if (conAsideForm) enviarRef.current?.('bajar'); else void crearRapido('bajar'); return }
    const hermanas = hijasDe(nodos, nuevo.padreId).filter((h) => nivelDe(h, mapa, ponds) !== 'subtarea')
    const ultima = hermanas[hermanas.length - 1]
    if (ultima && nivelDe(ultima, mapa, ponds) !== 'subtarea') fijarNuevo(ultima.id)
  }

  const act = modo.act ? mapa.get(modo.act) ?? null : null

  if (modo.crear === 'presupuesto') {
    return <CrearDesdePresupuesto obraId={obraId} presupuesto={datos.presupuesto} error={datos.presupuestoError} inicioObra={datos.obra.inicio} convertir={acciones.convertir} />
  }
  if (modo.crear === 'planilla') {
    return <CrearPegandoPlanilla obraId={obraId} nombreObra={datos.obra.nombre} plazo={{ inicio: datos.obra.inicio, fin: datos.obra.fin }} diasHabiles={datos.obra.diasHabiles} crear={acciones.crearPlanilla} />
  }
  if (modo.panel === 'ponderacion' && !act) {
    return (
      <PanelPonderacionObra obraId={obraId} nombreObra={datos.obra.nombre} nodos={nodos} items={items} fuentes={Object.fromEntries(Object.entries(ponds).map(([k, v]) => [k, v.fuente]))} metodo={datos.metodo} historiasVista={datos.historiasVista}
        guardarCosto={acciones.guardarCosto} elegirMetodo={acciones.elegirMetodo} alCerrar={cerrar}
        alRepartirAMano={(id) => ir(`&act=${id}&panel=ponderacion`)} alGuardado={() => router.refresh()} />
    )
  }
  if (modo.panel === 'ponderacion' && act) {
    const hijas = filasDePonderacion(nodos, ponds, act.id)
    const primeraHija = hijasDe(nodos, act.id)[0]
    const nivelHijas = primeraHija ? nivelDe(primeraHija, mapa, ponds) : nivelDeHijaNueva(act, mapa, ponds)
    return (
      <PanelPonderacion nodos={nodos} ponds={ponds} padre={act} hijas={hijas} nivelHijas={nivelHijas} camino={frenteDeCamino(act.camino, act.nombre) ?? ''}
        guardar={acciones.guardarPonderacion.bind(null, act.id)} alCerrar={() => ir('&panel=ponderacion')} alGuardado={() => router.refresh()} />
    )
  }

  const alternarSel = (id: string) => setSel((s) => {
    const n = new Set(s)
    const desc = [id]
    for (const f of filas) { let p = f.padreId; while (p) { if (p === id) { desc.push(f.id); break } p = filas.find((y) => y.id === p)?.padreId ?? null } }
    if (n.has(id)) for (const t of desc) n.delete(t); else for (const t of desc) if (filas.find((f) => f.id === t)?.nivel !== 'subtarea') n.add(t)
    return n
  })
  const contenedores = filas.filter((f) => f.esContenedor).map((f) => ({ id: f.id, nombre: `${'  '.repeat(f.profundidad)}${f.nombre}` }))

  // La historia de la que cuelga la tarea nueva: su nombre, lo que pesa y cuántas tareas tiene.
  const historiaDeNuevo = (() => {
    if (nivelNuevo !== 'tarea' || !padreNuevo) return null
    const f = filas.find((x) => x.id === padreNuevo.id)
    const p = pesos.get(padreNuevo.id)
    return {
      nombre: padreNuevo.nombre, uniCant: f?.uniCant ?? null,
      costo: p?.costo != null ? rotuloPesos(p.costo) : null, peso: p?.peso != null ? rotuloPeso(p.peso) : null,
      nTareas: hijasDe(nodos, padreNuevo.id).filter((h) => nivelDe(h, mapa, ponds) === 'tarea').length,
    }
  })()
  const costoOtras = items.filter((i) => i.nivel === 'historia').reduce((s, h) => s + (h.costo_mo ?? 0), 0)
  const enMano = modo.crear === 'mano' && nuevo != null

  const aside = enMano && nuevo.padreId == null ? (
    <AsideRubroNuevo nombre={nuevo.nombre} pendiente={pendiente} alEnviar={(m) => void crearRapido(m)} alCerrar={() => setNuevo(null)} />
  ) : enMano && nivelNuevo === 'historia' && padreNuevo ? (
    <FormHistoria padre={{ id: padreNuevo.id, camino: caminoDe(padreNuevo) }} nombre={nuevo.nombre} alCambiarNombre={(v) => setNuevo({ ...nuevo, nombre: v })}
      costoOtras={costoOtras} hayOtraConCosto={costoOtras > 0} partidas={datos.presupuesto?.partidas ?? []} presupuesto={datos.presupuesto?.rotulo ?? null}
      plantillas={datos.plantillas} crear={acciones.crearItem} alCreada={creada} alCerrar={() => setNuevo(null)} enviarRef={enviarRef} alPrevia={alPrevia} />
  ) : enMano && nivelNuevo === 'tarea' && padreNuevo ? (
    <FormTarea obraId={obraId} padre={{ id: padreNuevo.id, camino: caminoDe(padreNuevo) }} nombre={nuevo.nombre} alCambiarNombre={(v) => setNuevo({ ...nuevo, nombre: v })}
      historia={historiaDeNuevo} plazo={{ inicio: datos.obra.inicio, fin: datos.obra.fin }} cuadrillas={datos.cuadrillas} personas={datos.personas}
      activos={datos.activos} crear={acciones.crearItem} alCreada={creada} alCerrar={() => setNuevo(null)} enviarRef={enviarRef} alPrevia={alPrevia} />
  ) : act && modo.panel === 'frentes' ? (
    <PanelFrentes nodo={act} camino={frenteDeCamino(act.camino, act.nombre) ?? ''} pesoEnPadre={null}
      nAvances={datos.avancesPor[act.id] ?? 0} nPasos={datos.pasosPor[act.id] ?? 0} texto={textoFrentes} alCambiarTexto={setTextoFrentes}
      dividir={acciones.dividir.bind(null, act.id)} alCerrar={cerrar} alDividido={() => ir(`&act=${act.id}`)} />
  ) : act && modo.panel === 'subtareas' ? (
    <PanelSubtareas obraId={obraId} nodo={act} camino={caminoDe(act.padre_id ? mapa.get(act.padre_id) ?? null : null)}
      subtareas={hijasDe(nodos, act.id).filter((h) => nivelDe(h, mapa, ponds) === 'subtarea')} estados={datos.subtareaEstados}
      insumos={datos.insumosPor[act.id] ?? []} activos={datos.activos}
      accionesInsumos={{ agregar: acciones.agregarInsumo, quitar: acciones.quitarInsumo, pedir: acciones.pedirInsumo }}
      guardar={acciones.guardarSubtareas.bind(null, act.id)} alCerrar={cerrar} alGuardado={() => router.refresh()} alDividir={() => ir(`&act=${act.id}&panel=frentes`)} />
  ) : null

  // Un clic en una fila: la tarea abre su panel (B06); un contenedor, en modo mano, recibe la hija nueva.
  const alAbrir = (f: (typeof filas)[number]) => {
    if (f.nivel === 'subtarea') return
    if (f.nivel === 'tarea' && !f.esContenedor) { ir(`&act=${f.id}&panel=subtareas`); return }
    if (modo.crear === 'mano') fijarNuevo(f.id)
    else ir(`&crear=mano&nuevo=${f.id}`)
  }
  const sinRubros = !nodos.some((n) => !n.padre_id)

  return (
    <>
      {modo.sel && <BarraMasiva n={sel.size} accion={accionMasiva} setAccion={setAccionMasiva} alSalir={cerrar} resultado={resultadoMasivo} />}
      <div className="md:grid" style={{ gridTemplateColumns: aside ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', alignItems: 'start' }}>
        <div className="max-md:px-4">
          {resultado && <div style={{ padding: '10px 20px 0' }}><Resultado r={resultado} /></div>}
          <ArbolEstructura filas={filas} modo={modo.sel ? 'sel' : modo.crear === 'mano' ? 'mano' : 'foco'} foco={modo.panel ? modo.act : null}
            nuevo={enMano ? nuevo : null} nivelNuevo={nivelNuevo} previa={previa}
            alCambiarNuevo={(v) => setNuevo((n) => (n ? { ...n, nombre: v } : { padreId: null, nombre: v }))}
            alTecla={alTecla} alPedirNuevo={(id) => fijarNuevo(id)}
            sel={sel} alAlternarSel={alternarSel} alAbrir={alAbrir} angosto={Boolean(aside)}
            alAlternarSubtarea={async (id, hecha) => { const r = await acciones.alternarSubtarea(id, hecha); if (r.ok) router.refresh(); else setResultado({ ok: false, texto: r.error }) }}
            query={query} />
          {enMano && sinRubros && <RubrosPropuestos rubros={datos.rubrosPropuestos} alElegir={(nombre) => fijarNuevo(null, nombre)} />}
          {act && modo.panel === 'frentes' && <div className="hidden md:block" style={{ padding: '0 20px 30px' }}><VistaPreviaFrentes nodo={act} codigo={filas.find((f) => f.id === act.id)?.codigo ?? ''} texto={textoFrentes} /></div>}
          {modo.sel && (
            <CajaMasiva ids={[...sel]} datos={{ contenedores, cuadrillas: datos.cuadrillas, personas: datos.personas }} aplicar={acciones.aplicarMasiva}
              alAplicado={(r) => { setResultadoMasivo(r); setSel(new Set()); router.refresh() }} accion={accionMasiva} setAccion={setAccionMasiva} />
          )}
        </div>
        {aside}
      </div>
    </>
  )
}
