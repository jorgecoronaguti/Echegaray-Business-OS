'use client'

// CREAR LA ESTRUCTURA — el conmutador de las pantallas C02–C09 dentro de Trabajo › Ítems.
//
//   ?crear=presupuesto   C02 / MC5   ?crear=planilla   C03 / MC6   ?crear=mano[&nuevo=<padre>]  C04 / MC2 / MC3
//   ?act=<id>&panel=ponderacion  C05 / MC4   &panel=frentes  C07 / MC8   &panel=subtareas  C08 / MC9
//   ?sel=1               C09 / MC10
//
// Es estado del cliente con la URL sincronizada (`replaceState`), igual que el panel de la tarea: abrir
// una pantalla no vuelve al servidor. Las ESCRITURAS sí van por sus server actions y revalidan.

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '../../canon/tokens'
import { ArbolEstructura } from './ArbolEstructura'
import { CrearDesdePresupuesto } from './CrearDesdePresupuesto'
import { CrearPegandoPlanilla } from './CrearPegandoPlanilla'
import { FormNuevoItem } from './FormNuevoItem'
import { PanelPonderacion } from './PanelPonderacion'
import { PanelFrentes, VistaPreviaFrentes } from './PanelFrentes'
import { PanelSubtareas } from './PanelSubtareas'
import { BarraMasiva, CajaMasiva, type AccionMasiva } from './BarraMasiva'
import { Ico, P } from '../../canon/Ico'
import { PiePrimaria } from './Piezas'
import {
  filasDelArbol, hijasDe, nivelDe, nivelDeHijaNueva, filasDePonderacion, porId, problemaDePonderacion, quedanPorRepartir,
  rotuloProblema, type Ponderaciones,
} from '../../../services/estructura'
import { frenteDeCamino } from '../../../services/frente'
import type { NodoObra } from '../../../services/wbs'
import type { PresupuestoDeLaObra } from '../../../services/estructuraService'
import type { Persona } from '../../../types'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'

import { esModoEstructura, type ModoCrear, type ModoEstructura, type PanelEstructura } from './modo'
export { esModoEstructura, type ModoCrear, type ModoEstructura, type PanelEstructura }

export interface AccionesEstructura {
  convertir: AccionFormulario
  crearPlanilla: AccionFormulario
  crearItem: AccionFormulario
  guardarPonderacion: (padreId: string, form: FormData) => ReturnType<AccionFormulario>
  dividir: (actividadId: string, form: FormData) => ReturnType<AccionFormulario>
  guardarSubtareas: (tareaId: string, form: FormData) => ReturnType<AccionFormulario>
  aplicarMasiva: AccionFormulario
}

export interface DatosEstructura {
  presupuesto: PresupuestoDeLaObra | null
  presupuestoError: string | null
  obra: { nombre: string; inicio: string | null; fin: string | null; diasHabiles: number | null }
  cuadrillas: { id: string; nombre: string }[]
  personas: Persona[]
  subtareaEstados: Record<string, string | null>
  /** Cuántos avances y pasos tiene cada actividad (C07 «Se puede porque»). */
  avancesPor: Record<string, number>
  pasosPor: Record<string, number>
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
  const filas = useMemo(() => filasDelArbol(nodos, ponds), [nodos, ponds])
  const base = `/obras/${obraId}?vista=tareas&sub=arbol`
  const ir = useCallback((sufijo: string) => { router.replace(`${base}${sufijo}`); router.refresh() }, [router, base])
  const abrir = (id: string) => ir(`&act=${id}`)
  const cerrar = () => ir('')

  // ── C04: el ítem nuevo ──
  const [nuevo, setNuevo] = useState<{ padreId: string | null; nombre: string } | null>(
    () => modo.crear === 'mano' && modo.nuevo ? { padreId: modo.nuevo === 'raiz' ? null : modo.nuevo, nombre: '' } : null,
  )
  const [textoFrentes, setTextoFrentes] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [accionMasiva, setAccionMasiva] = useState<AccionMasiva | null>(null)
  const [resultadoMasivo, setResultadoMasivo] = useState<{ ok: boolean; texto: string } | null>(null)

  const padreNuevo = nuevo?.padreId ? mapa.get(nuevo.padreId) ?? null : null
  const nivelNuevo = nivelDeHijaNueva(padreNuevo, mapa)
  const pedirNuevo = (padreId: string | null) => {
    setNuevo({ padreId, nombre: '' })
    const p = new URLSearchParams(window.location.search)
    p.set('crear', 'mano'); p.set('nuevo', padreId ?? 'raiz')
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }
  const crearContenedor = async () => {
    if (!nuevo || nuevo.nombre.trim().length < 2) return
    const form = new FormData()
    form.set('nombre', nuevo.nombre.trim()); form.set('padre_id', nuevo.padreId ?? '')
    const r = await acciones.crearItem(form)
    if (r.ok) { setNuevo({ padreId: nuevo.padreId, nombre: '' }); router.refresh() }
  }
  const confirmarNuevo = () => {
    if (nivelNuevo === 'tarea' || nivelNuevo === 'subtarea') return
    void crearContenedor()
  }
  const tab = (direccion: 'bajar' | 'subir') => {
    if (!nuevo) return
    if (direccion === 'subir') { setNuevo({ ...nuevo, padreId: padreNuevo?.padre_id ?? null }); return }
    const hermanas = hijasDe(nodos, nuevo.padreId)
    const ultima = hermanas[hermanas.length - 1]
    if (ultima && (ultima.es_contenedor || nivelDe(ultima, mapa) === 'tarea')) setNuevo({ ...nuevo, padreId: ultima.id })
  }
  const creada = (id: string | null, abrirla: boolean) => {
    if (abrirla && id) { setNuevo(null); ir(`&act=${id}`); return }
    setNuevo((n) => (n ? { ...n, nombre: '' } : n))
    router.refresh()
  }

  const act = modo.act ? mapa.get(modo.act) ?? null : null
  const caminoDe = (n: NodoObra) => frenteDeCamino(n.camino, n.nombre) ?? ''

  if (modo.crear === 'presupuesto') {
    return <CrearDesdePresupuesto obraId={obraId} presupuesto={datos.presupuesto} error={datos.presupuestoError} inicioObra={datos.obra.inicio} convertir={acciones.convertir} />
  }
  if (modo.crear === 'planilla') {
    return <CrearPegandoPlanilla obraId={obraId} nombreObra={datos.obra.nombre} plazo={{ inicio: datos.obra.inicio, fin: datos.obra.fin }} diasHabiles={datos.obra.diasHabiles} crear={acciones.crearPlanilla} />
  }
  if (modo.panel === 'ponderacion' && act) {
    const hijas = filasDePonderacion(nodos, ponds, act.id)
    const primeraHija = hijasDe(nodos, act.id)[0]
    const nivelHijas = primeraHija ? nivelDe(primeraHija, mapa) : nivelDeHijaNueva(act, mapa)
    return (
      <PanelPonderacion nodos={nodos} ponds={ponds} padre={act} hijas={hijas} nivelHijas={nivelHijas} camino={caminoDe(act)}
        guardar={acciones.guardarPonderacion.bind(null, act.id)} alCerrar={cerrar} alGuardado={() => router.refresh()} />
    )
  }

  const problemas = problemaDePonderacion(nodos, ponds)
  const abuelo = padreNuevo?.padre_id ? mapa.get(padreNuevo.padre_id) ?? null : null
  const problemaAbuelo = abuelo ? (() => { const p = problemas.find((x) => x.nombre === abuelo.nombre); return p ? `${abuelo.nombre} sigue en ${rotuloProblema(p)?.replace(`${abuelo.nombre} `, '')}: falta repartir en sus ${nivelDe(padreNuevo!, mapa) === 'epica' ? 'épicas' : 'hijas'}` : null })() : null

  const alternarSel = (id: string) => setSel((s) => {
    const n = new Set(s)
    const f = filas.find((x) => x.id === id)
    const descendientes = f?.esContenedor ? filas.filter((x) => { let p = x.padreId; while (p) { if (p === id) return true; p = filas.find((y) => y.id === p)?.padreId ?? null } return false }).map((x) => x.id) : []
    const todos = [id, ...descendientes]
    if (n.has(id)) for (const t of todos) n.delete(t); else for (const t of todos) n.add(t)
    return n
  })
  const contenedores = nodos.filter((n) => n.es_contenedor).map((n) => ({ id: n.id, nombre: `${'  '.repeat(n.nivel)}${n.nombre}` }))

  const arbol = (
    <ArbolEstructura filas={filas} modo={modo.sel ? 'sel' : modo.crear === 'mano' ? 'mano' : 'foco'} foco={modo.panel ? modo.act : null}
      nuevo={modo.crear === 'mano' ? nuevo : null} nivelNuevo={nivelNuevo}
      alCambiarNuevo={(v) => setNuevo((n) => (n ? { ...n, nombre: v } : { padreId: null, nombre: v }))}
      alConfirmarNuevo={confirmarNuevo} alPedirNuevo={pedirNuevo} alTab={tab}
      sel={sel} alAlternarSel={alternarSel} alAbrir={abrir} query={query} />
  )

  const asideTarea = modo.crear === 'mano' && nuevo && (nivelNuevo === 'tarea' || nivelNuevo === 'subtarea') && (
    <FormNuevoItem
      padre={{ id: padreNuevo?.id ?? null, nombre: padreNuevo?.nombre ?? '', camino: padreNuevo ? padreNuevo.camino : '', abuelo: abuelo?.nombre ?? null }}
      nivel={nivelNuevo} nombre={nuevo.nombre} alCambiarNombre={(v) => setNuevo({ ...nuevo, nombre: v })}
      quedan={quedanPorRepartir(nodos, ponds, nuevo.padreId)} problemaAbuelo={problemaAbuelo}
      plazo={{ inicio: datos.obra.inicio, fin: datos.obra.fin }} partidas={datos.presupuesto?.partidas ?? []} presupuesto={datos.presupuesto?.rotulo ?? null}
      cuadrillas={datos.cuadrillas} personas={datos.personas} crear={acciones.crearItem} alCreada={creada} alCerrar={() => setNuevo(null)} />
  )
  // Un contenedor nuevo (rubro, épica, historia) también abre la ficha en el teléfono: sin Enter no hay otra puerta.
  const asideContenedor = modo.crear === 'mano' && nuevo && !(nivelNuevo === 'tarea' || nivelNuevo === 'subtarea') && (
    <div className="md:hidden">
      <FormNuevoItem
        padre={{ id: padreNuevo?.id ?? null, nombre: padreNuevo?.nombre ?? '', camino: padreNuevo ? padreNuevo.camino : '', abuelo: abuelo?.nombre ?? null }}
        nivel={nivelNuevo} nombre={nuevo.nombre} alCambiarNombre={(v) => setNuevo({ ...nuevo, nombre: v })}
        quedan={quedanPorRepartir(nodos, ponds, nuevo.padreId)} problemaAbuelo={problemaAbuelo}
        plazo={{ inicio: datos.obra.inicio, fin: datos.obra.fin }} partidas={[]} presupuesto={null}
        cuadrillas={datos.cuadrillas} personas={datos.personas} crear={acciones.crearItem} alCreada={creada} alCerrar={() => setNuevo(null)} />
    </div>
  )

  const asidePanel = act && modo.panel === 'frentes' ? (
    <PanelFrentes nodo={act} camino={caminoDe(act)} pesoEnPadre={act.padre_id && ponds[act.id]?.ponderacion != null ? `${ponds[act.id]!.ponderacion!.toLocaleString('es-AR')} % de ${mapa.get(act.padre_id)?.nombre ?? ''}` : null}
      nAvances={datos.avancesPor[act.id] ?? 0} nPasos={datos.pasosPor[act.id] ?? 0} texto={textoFrentes} alCambiarTexto={setTextoFrentes}
      dividir={acciones.dividir.bind(null, act.id)} alCerrar={cerrar} alDividido={() => ir(`&act=${act.id}`)} />
  ) : act && modo.panel === 'subtareas' ? (
    <PanelSubtareas nodo={act} camino={caminoDe(act)} subtareas={hijasDe(nodos, act.id)} estados={datos.subtareaEstados}
      guardar={acciones.guardarSubtareas.bind(null, act.id)} alCerrar={cerrar} alGuardado={() => router.refresh()} alDividir={() => ir(`&act=${act.id}&panel=frentes`)} />
  ) : null

  const conAside = Boolean(asideTarea || asidePanel)
  return (
    <>
      {modo.sel && <BarraMasiva n={sel.size} accion={accionMasiva} setAccion={setAccionMasiva} alSalir={cerrar} resultado={resultadoMasivo} />}
      <div className="md:grid" style={{ gridTemplateColumns: conAside ? 'minmax(0,1fr) 420px' : 'minmax(0,1fr)', alignItems: 'start' }}>
        <div className="max-md:px-4">
          {arbol}
          {act && modo.panel === 'frentes' && <div className="hidden md:block" style={{ padding: '0 20px 30px' }}><VistaPreviaFrentes nodo={act} codigo={filas.find((f) => f.id === act.id)?.codigo ?? ''} texto={textoFrentes} /></div>}
          {act && modo.panel === 'subtareas' && (
            <div className="hidden md:flex" style={{ padding: '14px 20px 30px 20px', gap: '28px', fontSize: '12px', color: C.tenue }}>
              Las subtareas no pesan en el promedio ni entran al cronograma: descomponen la tarea. Con método «pasos», el avance de la tarea es la fracción de subtareas hechas.
            </div>
          )}
          {modo.sel && (
            <CajaMasiva ids={[...sel]} datos={{ contenedores, cuadrillas: datos.cuadrillas, personas: datos.personas }} aplicar={acciones.aplicarMasiva}
              alAplicado={(r) => { setResultadoMasivo(r); setSel(new Set()); router.refresh() }} accion={accionMasiva} setAccion={setAccionMasiva} />
          )}
        </div>
        {asideTarea}
        {asidePanel}
      </div>
      {asideContenedor}
      {modo.crear === 'mano' && !nuevo && (
        <PiePrimaria rotulo="Nueva actividad" icono={<Ico d={P.mas} s={15} />} testid="primaria-nueva-actividad-mano"
          onClick={() => { const historias = nodos.filter((n) => n.es_contenedor && n.nivel === 2); pedirNuevo(historias.length ? historias[historias.length - 1].id : null) }} />
      )}
    </>
  )
}
