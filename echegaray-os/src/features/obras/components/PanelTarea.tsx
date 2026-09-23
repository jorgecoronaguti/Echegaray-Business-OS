'use client'

// ═══ 04 · TAREA — PANEL LATERAL. PORTE LITERAL DE «04 · Tarea Panel lateral.dc.html» ═══
//
//   tarjeta   `background:#FFFFFF; border:1px solid #E7E6E2; borderRadius:10px; overflow:hidden`
//   cabecera  `padding:14px 16px 0`
//   primaria  amarilla, `padding:7px 13px`, 12,5px/600; los íconos, 30×30 con borde
//   título    15,5px/600, `lineHeight:1.3`
//   sublínea  11,5px `#6B6B67`, íconos de 12,5px, separadores «·» en `#D7D5CF`
//   solapas   12px, `padding:7px 8px`, activa 600 con `inset 0 -2px 0 #FDC900`
//   cuerpo    `padding:14px 16px 16px`, con su propio scroll
//
// Cliente puro: abrir, cerrar, cambiar de actividad o de solapa es estado — el material vino EN
// BLOQUE con el árbol (`panelObraService`) y acá sólo se elige y se dibuja. Las ESCRITURAS sí van
// al servidor, por sus server actions de siempre, que revalidan y refrescan los props.
//
// ═══ ACÁ NO SE NAVEGA A NINGÚN LADO (defecto #1 del dueño, 24/08/2026) ═══
//
// El dueño, textual: *«necesito que la pantalla permita que si quiero editar edite ahí mismo, no me
// sirve que me cargue y me lleve a otro lado»*. Hasta hoy este panel tenía TRES enlaces que se iban
// de la pantalla: la primaria cuando no había acción atada, la cámara (`…/avance/<id>#evidencia`) y
// «Abrir en pantalla completa». Los tres apuntaban a la misma pantalla, y sobre una fila agrupadora
// esa pantalla contestaba con un cartel — un viaje entero para leer que no se podía.
//
// Ahora:
//   · la primaria abre la solapa Avance con el formulario adentro del panel;
//   · la cámara abre esa MISMA solapa (el campo de evidencia es del formulario, no de la actividad);
//   · el clip abre la solapa Documentos;
//   · sobre una AGRUPADORA no hay primaria: el mockup 03 ni siquiera selecciona una agrupadora, así
//     que no hay botón que dibujar. En su lugar, una línea que dice dónde se registra de verdad y
//     un salto a la primera hija ejecutable — la acción queda a un clic, no a un cartel.
//   · sin permiso de escritura tampoco hay primaria: un botón que la base va a rebotar es peor que
//     su ausencia.
//
// El ID DE LA ACTIVIDAD viaja como argumento (`.bind` del cliente sobre la acción ya atada a la
// obra): igual de manipulable que cuando viajaba en la URL, y por eso cada acción vuelve a acotar
// por `obra_id` del lado del servidor antes de escribir una fila.

import Link from 'next/link'
import { InlineEdit } from '@/shared/components/ds'
import { C, ESTILO_PRIMARIA, ESTILO_SECUNDARIA, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import {
  BotonIcono, Celda, Cuadro, FilaPlegable, FilaRecurso, Impedimento, Titulo,
} from './panel/PanelPiezas'
import {
  EjecucionReciente, SolapaAvance, SolapaDocumentos, SolapaHistorial,
} from './panel/PanelSolapas'
import { fecha, fechaCorta, porcentaje } from './formato'
import { METODO_LABEL, TIPO_RESTRICCION_LABEL, type Restriccion } from '../types'
import type { EstadoItem } from './items/filasDeItems'
import type { NodoObra } from '../services/wbs'
import type { PasoDeActividad, RegistroAvance, RelacionLegible } from '../services/tareasService'
import type { ContextoTarea } from '../services/panelTareaService'
import type { VinculacionTarea } from '../services/vinculacionTareaService'
import { factorDeEsfuerzo, motivoNoDividir } from '../services/panelTarea'
import { ultimoTramoDelCamino } from '../services/frente'
import { estadoDeFila } from '../services/vistaArbol'
import { SOLAPAS, type Solapa } from '../services/solapasTarea'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import { PanelTareaRecursos } from './PanelTareaRecursos'
import { FormAvanceEmbebido } from './FormAvance'
import { BloqueNotas } from './PanelGestion'
import { cuadrillaDeLaTarea, iniciales } from '../services/contextoTarea'
import type { EquipoEnActividad, NotaActividad } from '../services/recursosService'
import { PanelTareaRendimiento } from './PanelTareaRendimiento'
import { PanelTareaDependencias } from './PanelTareaDependencias'
import { DividirEnFrentes } from './DividirEnFrentes'
import { oracionDeActividad } from '../services/nombreDeActividad'

type ResultadoInline = { ok: true } | { ok: false; error: string }

/** El rótulo y el color del estado derivado (04: «Bloqueada» en rojo a la derecha). */
const ROTULO_DERIVADO = { bloqueada: 'Bloqueada', sin_parte: 'Sin parte', en_progreso: 'En progreso', completado: 'Completada' } as const
const COLOR_DERIVADO = { bloqueada: C.neg, sin_parte: C.tintaSuave, en_progreso: C.curso, completado: C.pos } as const

function Falta({ children }: { children: React.ReactNode }) {
  return <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{children}</span>
}

export interface AccionesDelPanel {
  /** Atadas a la OBRA; el id de la actividad lo ata este componente. */
  editarCampo: (actividadId: string, campo: string, valor: string) => Promise<ResultadoInline>
  dividir: (actividadId: string, form: FormData) => ReturnType<AccionFormulario>
  cambiarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
  quitarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
  vincularEstandar: (actividadId: string, form: FormData) => ReturnType<AccionFormulario>
  /** REGISTRAR AVANCE SIN IRSE DE LA PANTALLA. Ausente = no hay primaria, y se dice por qué. */
  registrarAvance?: (actividadId: string, form: FormData) => ReturnType<AccionFormulario>
  agregarNota?: (actividadId: string, form: FormData) => ReturnType<AccionFormulario>
  /** «Liberar el impedimento» (04): la MISMA acción que usa Operación. */
  liberarImpedimento?: (restriccionId: string) => Promise<{ ok: boolean; error?: string }>
}

export function PanelTarea({
  obraId, nodo, solapa, alCambiarSolapa, alCerrar, alAbrirActividad,
  pasos, historial, relaciones, documentos, cuadrillas,
  integrantesPorCuadrilla = {}, nombrePorPersona = {}, equipos = [], notas = [], autor = null,
  contexto, vinculacion, dotacion, alCambiarDotacion, puedeEditar, acciones,
  hijasEjecutables = [], impedimentos = [], estadoDerivado = 'sin_parte', pctDerivado = null,
  rubro = null, nombreObra = null,
}: {
  obraId: string
  nodo: NodoObra
  solapa: Solapa
  alCambiarSolapa: (s: Solapa) => void
  alCerrar: () => void
  alAbrirActividad: (id: string) => void
  pasos: PasoDeActividad[]
  historial: RegistroAvance[]
  relaciones: RelacionLegible[]
  documentos: { id: string; nombre: string; url: string }[]
  cuadrillas: { id: string; nombre: string }[]
  integrantesPorCuadrilla?: Record<string, string[]>
  nombrePorPersona?: Record<string, string>
  /** Los equipos que APARECIERON EN LOS PARTES de esta actividad. No hay una asignación de máquinas
   *  a tareas: si nadie los anotó, la sección lo dice — no los inventa. */
  equipos?: EquipoEnActividad[]
  notas?: NotaActividad[]
  /** Quién está firmando, para el formulario de avance embebido. */
  autor?: string | null
  contexto: ContextoTarea
  vinculacion: VinculacionTarea
  dotacion: number
  alCambiarDotacion: (n: number) => void
  puedeEditar: boolean
  acciones: AccionesDelPanel
  /** Las actividades medibles que cuelgan de esta agrupadora. Es lo que hace que la agrupadora
   *  ofrezca un salto en vez de un cartel. */
  hijasEjecutables?: { id: string; nombre: string }[]
  /** Los impedimentos ABIERTOS de esta actividad: «Lo que la traba». */
  impedimentos?: Restriccion[]
  /** El estado DERIVADO de los partes (`actividad_partes_resumen`). Nunca se elige. */
  estadoDerivado?: EstadoItem
  pctDerivado?: number | null
  /** «Estructura · Pisos ARCOR»: el rubro y la obra, para la sub-línea del 04. */
  rubro?: string | null
  nombreObra?: string | null
}) {
  const antes = relaciones.filter((r) => r.destino_id === nodo.id)
  const despues = relaciones.filter((r) => r.origen_id === nodo.id)
  const est = estadoDeFila(nodo, nodo.avance_pct)
  const frente = ultimoTramoDelCamino(nodo.camino, nodo.nombre)
  const editar = (campo: string) => (v: string) => acciones.editarCampo(nodo.id, campo, v)
  const ultima = historial[0]?.fecha ?? null
  const cuadrilla = cuadrillaDeLaTarea(nodo, cuadrillas, integrantesPorCuadrilla, nombrePorPersona)
  const factor = factorDeEsfuerzo({
    hhReal: nodo.hh_real, cantidadEjecutada: nodo.cantidad_ejecutada,
    hhPlan: nodo.hh_plan, cantidadObjetivo: nodo.cantidad_objetivo,
  })
  // UN CONTENEDOR NO SE MIDE: ofrecerle el formulario de avance sería ofrecer una escritura que la
  // base rechaza con un trigger.
  const puedeRegistrar = puedeEditar && !nodo.es_contenedor && acciones.registrarAvance != null
  const hoyISO = new Date().toISOString().slice(0, 10)
  const estadoPanel: keyof typeof ROTULO_DERIVADO = impedimentos.length > 0 || nodo.impedimentos_abiertos > 0 ? 'bloqueada' : estadoDerivado

  return (
    <aside data-testid="panel-tarea" style={{
      display: 'flex', flexDirection: 'column', gap: '20px', padding: '18px 24px 30px', minHeight: '100%',
    }}>
      {/* ═══ LA CABECERA DEL PANEL (04): «Rubro · Obra» en 11,5 faint, el estado DERIVADO a la
          derecha en 12/500, el nombre en 17/600. El estado sale de los partes, nunca de un selector. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ fontSize: '11.5px', color: C.tenue, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            data-testid="panel-sublinea">
            {[rubro, nombreObra].filter(Boolean).join(' · ') || frente || ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <span data-testid="panel-estado" data-clave={est.clave} data-estado={estadoDerivado}
              style={{ fontSize: '12px', fontWeight: 500, color: COLOR_DERIVADO[estadoPanel] }}>{ROTULO_DERIVADO[estadoPanel]}</span>
            <button type="button" onClick={alCerrar} data-testid="cerrar-panel" aria-label="Cerrar el panel"
              style={{ display: 'flex', color: C.tenue, cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>
              <Ico d={P.cerrar} s={15} />
            </button>
          </div>
        </div>
        <h2 style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta, lineHeight: 1.3, margin: 0 }}>
          {oracionDeActividad(nodo.nombre)}
        </h2>
        {nodo.es_contenedor && (
          <p data-testid="panel-agrupadora" style={{ margin: 0, fontSize: '11.5px', color: C.tintaSuave }}>
            El avance se registra en las actividades que agrupa y sube solo.
            {hijasEjecutables.length > 0 && (
              <>
                {' '}
                <button type="button" onClick={() => alAbrirActividad(hijasEjecutables[0].id)} data-testid="panel-ir-a-hija"
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: C.tinta, fontWeight: 500, textDecoration: 'underline', font: 'inherit' }}>
                  Ir a «{oracionDeActividad(hijasEjecutables[0].nombre)}»
                </button>
              </>
            )}
          </p>
        )}
        {!nodo.es_contenedor && !puedeEditar && (
          <p data-testid="panel-sin-permiso" style={{ margin: 0, fontSize: '11.5px', color: C.tintaSuave }}>
            No tenés permiso para registrar avance en esta obra.
          </p>
        )}
      </div>

      {/* LAS SOLAPAS (04): 12px, `padding:7px 9px 8px`, la activa 500 con `inset 0 -2px 0 #30302F`,
          la línea de abajo sale hasta los bordes del panel (`margin:0 -24px; padding:0 24px`). */}
      <nav data-testid="solapas-tarea" style={{
        display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${C.borde}`, margin: '0 -24px', padding: '0 24px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {SOLAPAS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => alCambiarSolapa(id)} data-testid={`sol-${id}`}
            aria-current={solapa === id ? 'true' : undefined}
            style={{
              fontSize: '12px', padding: '7px 9px 8px', whiteSpace: 'nowrap', cursor: 'pointer',
              border: 'none', background: 'none', font: 'inherit',
              color: solapa === id ? C.tinta : C.tintaSuave, fontWeight: solapa === id ? 500 : 400,
              boxShadow: solapa === id ? `inset 0 -2px 0 ${C.grafito}` : 'none',
            }}>{label}</button>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>
        {solapa === 'resumen' && (
          <section data-testid="panel-general">
            {/* ═══ EL RESUMEN DEL 04: diez renglones clave · valor en 13,5, gap 11. ═══ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', fontSize: '13.5px' }} data-testid="panel-resumen-kv">
              {[
                ['Medición', nodo.metodo_avance ? METODO_LABEL[nodo.metodo_avance] : <Falta>sin método</Falta>],
                ['Avance', pctDerivado != null
                  ? <>{porcentaje(pctDerivado)} <span style={{ fontSize: '12px', color: C.tenue }}>de {historial.length} {historial.length === 1 ? 'parte' : 'partes'}</span></>
                  : <Falta>sin parte</Falta>],
                ['Plan', nodo.inicio_plan && nodo.fin_plan ? `${fechaCorta(nodo.inicio_plan)} → ${fechaCorta(nodo.fin_plan)}` : <Falta>sin plan</Falta>],
                ['Proyectado', contexto.diasHastaFinPlan != null
                  ? <span style={{ color: contexto.diasHastaFinPlan < 0 ? C.warn : C.tinta }}>{contexto.diasHastaFinPlan < 0 ? `${-contexto.diasHastaFinPlan} d después del plan` : `${contexto.diasHastaFinPlan} d hábiles por delante`}</span>
                  : <Falta>sin proyección</Falta>],
                ['Responsable', nodo.responsable ?? <Falta>sin asignar</Falta>],
                ['Cuadrilla prevista', nodo.cuadrilla ?? <Falta>sin asignar</Falta>],
                ['HH real', nodo.hh_real != null
                  ? <>{Math.round(nodo.hh_real).toLocaleString('es-AR')} {nodo.hh_plan != null && <span style={{ fontSize: '12px', color: C.tenue }}>de {Math.round(nodo.hh_plan).toLocaleString('es-AR')} plan</span>}</>
                  : <Falta>sin imputar</Falta>],
                ['Partida', nodo.partida_codigo ?? <Falta>sin partida</Falta>],
                ['Análisis', nodo.analisis_id ? 'vinculado' : <Falta>sin vincular</Falta>],
                ['Productividad', nodo.cantidad_ejecutada != null && nodo.hh_real
                  ? `${(nodo.cantidad_ejecutada / nodo.hh_real).toLocaleString('es-AR', { maximumFractionDigits: 2 })}${nodo.unidad ? ` ${nodo.unidad}` : ''}/HH`
                  : <Falta>sin producción física</Falta>],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                  <span style={{ color: C.tintaSuave }}>{k}</span>
                  <span style={{ textAlign: 'right', color: C.tinta }}>{v}</span>
                </div>
              ))}
            </div>

            {/* ═══ LO QUE LA TRABA (04): los impedimentos abiertos de ESTA actividad, y la primaria
                «Liberar el impedimento». Con impedimento, ésa es la única primaria del panel. ═══ */}
            {impedimentos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', paddingTop: '20px' }} data-testid="panel-lo-que-la-traba">
                <div style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>Lo que la traba</div>
                {impedimentos.map((r) => (
                  <div key={r.id} style={{ borderLeft: `2px solid ${C.neg}`, paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '3px' }}
                    data-testid={`traba-${r.id}`}>
                    <div style={{ fontSize: '13.5px', color: C.tinta }}>{r.descripcion}</div>
                    <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>
                      {TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo} · {r.responsable ?? 'sin responsable'}
                      {r.fecha_compromiso ? ` · comprometido ${fechaCorta(r.fecha_compromiso)}${r.fecha_compromiso < hoyISO ? ', vencido' : ''}` : ' · sin fecha de compromiso'}
                    </div>
                  </div>
                ))}
                {puedeEditar && acciones.liberarImpedimento && (
                  <form action={async () => { await acciones.liberarImpedimento?.(impedimentos[0].id) }} style={{ marginTop: '11px' }}>
                    <button type="submit" data-testid="panel-liberar-impedimento" style={{
                      ...ESTILO_PRIMARIA, width: '100%', height: '36px', justifyContent: 'center', fontSize: '13px', color: C.grafito,
                    }}>Liberar el impedimento</button>
                  </form>
                )}
              </div>
            )}

            {puedeRegistrar && (
              <div style={{ marginTop: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" onClick={() => alCambiarSolapa('avance')} data-testid="panel-registrar-avance"
                  style={impedimentos.length > 0 ? { ...ESTILO_SECUNDARIA, height: '32px' } : { ...ESTILO_PRIMARIA, height: '36px', flex: 1, justifyContent: 'center', fontSize: '13px', color: C.grafito }}>
                  <Ico d={P.editar} s={14} />Registrar avance
                </button>
                <BotonIcono titulo="Documentos de la actividad" testid="panel-adjuntar-evidencia" d={P.adjuntar} onClick={() => alCambiarSolapa('documentos')} />
                <BotonIcono titulo="Foto o evidencia" testid="panel-foto-evidencia" d={P.foto} onClick={() => alCambiarSolapa('avance')} />
              </div>
            )}

            {/* LO QUE EL PANEL YA SABÍA HACER —corregir el plan en la celda, la cuadrilla, la
                dotación simulada, dividir en frentes— sigue acá, plegado: el 04 no lo dibuja arriba
                y retirarlo dejaría sin puerta a lo que hoy se edita desde este panel. */}
            <details style={{ marginTop: '20px' }} data-testid="panel-plan-recursos">
              <summary style={{ cursor: 'pointer', fontSize: '12.5px', color: C.tenue }}>Plan, recursos y edición</summary>
            <div style={{ marginTop: '12px' }}>
            {/* PLAN | REAL, enfrentados. El plan se corrige en la celda — donde se lee. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Cuadro rotulo="PLAN" tono="plan">
                <Celda k="Unidad" v={<InlineEdit valor={nodo.unidad} tipo="texto" ancho="w-16" falta="sin unidad"
                  etiqueta={`Unidad de ${nodo.nombre}`} testid="editar-unidad" guardar={editar('unidad')} />} />
                <Celda k="Cantidad" v={<InlineEdit valor={nodo.cantidad_objetivo} tipo="numero" alineado="right"
                  ancho="w-20" etiqueta={`Cantidad objetivo de ${nodo.nombre}`} testid="editar-cantidad"
                  guardar={editar('cantidad_objetivo')} />} />
                <Celda k="Inicio" v={<InlineEdit valor={nodo.inicio_plan ?? null} tipo="fecha" ancho="w-24"
                  falta="sin plan" etiqueta={`Inicio de plan de ${nodo.nombre}`} testid="editar-inicio"
                  guardar={editar('inicio_plan')} />} />
                <Celda k="Fin" v={<InlineEdit valor={nodo.fin_plan} tipo="fecha" ancho="w-24" falta="sin plan"
                  etiqueta={`Fin de plan de ${nodo.nombre}`} testid="editar-fin" guardar={editar('fin_plan')} />} />
                <Celda k="HH" v={<InlineEdit valor={nodo.hh_plan} tipo="numero" alineado="right" ancho="w-20"
                  etiqueta={`HH plan de ${nodo.nombre}`} testid="editar-hh" guardar={editar('hh_plan')} />} />
              </Cuadro>
              <Cuadro rotulo="REAL" tono="real">
                <Celda k="Ejecutado" falta="sin medir" v={nodo.cantidad_ejecutada != null
                  ? `${nodo.cantidad_ejecutada.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${nodo.unidad ? ` ${nodo.unidad}` : ''}`
                  : null} />
                <Celda k="Avance" v={porcentaje(nodo.avance_pct)} falta="—"
                  color={nodo.avance_pct != null ? C.pos : undefined} />
                <Celda k="HH reales" v={nodo.hh_real != null ? Math.round(nodo.hh_real).toLocaleString('es-AR') : null}
                  falta="sin imputar" />
                {/* «1,32×» del canónico: el esfuerzo real contra el planificado. Sin los cuatro
                    insumos NO se dibuja «1,00×» —eso diría «va como el plan» y nadie iría a
                    mirar—: dice «sin dato». */}
                <Celda k="Rendimiento" falta="sin dato"
                  v={factor != null ? `${factor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×` : null}
                  color={factor == null ? undefined : factor > 1.15 ? C.warn : C.pos} />
                <Celda k="Última carga" v={ultima ? fecha(ultima) : null} falta="sin parte" />
              </Cuadro>
            </div>
            {/* La barra sólo si el número ES una fracción. */}
            {nodo.avance_pct != null && (
              <div style={{ height: '5px', background: C.barraCanal, borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.min(100, Math.max(0, nodo.avance_pct))}%`,
                  background: nodo.avance_pct >= 100 ? C.pos : nodo.es_critica ? C.warn : C.curso,
                }} />
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              <FilaRecurso clave="Cuadrilla" icono={<Ico d={P.cuadrilla} s={14} />} valor={
                <InlineEdit valor={nodo.cuadrilla_id} tipo="seleccion" ancho="w-40" falta="sin asignar"
                  opciones={[{ valor: '', etiqueta: 'sin asignar' },
                    ...cuadrillas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
                  etiqueta={`Cuadrilla de ${nodo.nombre}`} testid="editar-cuadrilla" guardar={editar('cuadrilla_id')} />
              } />
              <FilaRecurso clave="Responsable" icono={<Ico d={P.persona} s={14} />}
                valor={nodo.responsable} falta="sin asignar" />
              {/* QUIÉNES SON, NO CUÁNTOS (canónico 04: «5 personas · Cuadrilla 2»). El conteo sale
                  de la LISTA de integrantes vigentes, nunca de la dotación simulada de abajo: esa
                  es una hipótesis del que planifica, y ésta es la gente que hay hoy. */}
              {cuadrilla && (
                <FilaRecurso clave="Gente" testid="panel-cuadrilla-gente" icono={<Ico d={P.cuadrilla} s={14} />}
                  alerta={cuadrilla.integrantes.length === 0} valor={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {cuadrilla.integrantes.slice(0, 4).map((n, i) => (
                        <span key={n} title={n} data-testid="avatar-integrante" style={{
                          width: '26px', height: '26px', borderRadius: '13px', background: C.bordeTarjeta,
                          color: C.tintaMedia, border: `2px solid ${C.superficie}`,
                          marginLeft: i === 0 ? 0 : '-7px', fontSize: '10px', fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>{iniciales(n)}</span>
                      ))}
                      {cuadrilla.integrantes.length > 4 && (
                        <span style={{
                          width: '26px', height: '26px', borderRadius: '13px', background: C.grafito,
                          color: C.superficie, border: `2px solid ${C.superficie}`, marginLeft: '-7px',
                          fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', flexShrink: 0,
                        }}>+{cuadrilla.integrantes.length - 4}</span>
                      )}
                      {/* CERO INTEGRANTES NO SE ESCRIBE COMO «0 personas»: la cuadrilla existe, lo
                          que falta es su gente cargada, y son dos arreglos distintos. */}
                      <span style={{ fontSize: '11.5px' }}>
                        {cuadrilla.integrantes.length > 0
                          ? `${cuadrilla.integrantes.length} personas · ${cuadrilla.nombre}`
                          : `${cuadrilla.nombre} · sin integrantes cargados`}
                      </span>
                    </span>
                  } />
              )}
              <FilaRecurso clave="Equipos" icono={<Ico d={P.equipo} s={14} />} falta="sin asignar"
                valor={equipos.length === 0 ? null : (
                  <span data-testid="panel-equipos">
                    {/* HORAS SIN ANOTAR NO SON CERO: se dice en cuántas jornadas apareció la
                        máquina, que es lo único que el parte llegó a registrar. */}
                    {equipos.slice(0, 3).map((e) => `${e.equipo} · ${
                      e.horas == null ? `${e.jornadas} jorn.` : `${e.horas.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`}`).join(' · ')}
                    {equipos.length > 3 && ` +${equipos.length - 3}`}
                  </span>
                )} />
              <FilaPlegable clave="Dotación" testid="fila-dotacion" icono={<Ico d={P.hh} s={14} />}
                alerta={nodo.tope_frente != null && dotacion >= nodo.tope_frente}
                resumen={nodo.tope_frente != null
                  ? `${dotacion} de ${nodo.tope_frente}${dotacion >= nodo.tope_frente ? ' · tope del frente' : ''}`
                  : `${dotacion} pers.`}>
                <PanelTareaRecursos nodo={nodo} contexto={contexto} dotacion={dotacion}
                  alCambiarDotacion={alCambiarDotacion} />
                <p style={{ marginTop: '8px', fontSize: '11px', color: C.tintaSuave }}>
                  Esto simula: el plan se escribe desde{' '}
                  <Link prefetch={false} href={`/obras/${obraId}/dotacion`} style={{ fontWeight: 500, color: C.tinta }}>
                    Dotación y proyección</Link>, sobre el frente completo.
                </p>
              </FilaPlegable>
              {nodo.es_subcontrato && (
                <FilaPlegable clave="Subcontrato" resumen={nodo.subcontratista ?? 'paquete'} testid="fila-subcontrato"
                  icono={<Ico d={P.cuadrilla} s={14} />}>
                  <p style={{ fontSize: '12px', color: C.tintaSuave, margin: 0 }}>
                    El avance de un paquete lo firma el jefe de obra.
                  </p>
                  <Link prefetch={false} href={`/obras/${obraId}/subcontratos`} data-testid="ver-paquete"
                    style={{ display: 'inline-block', marginTop: '6px', fontSize: '12.5px', fontWeight: 500, color: C.tinta }}>
                    Ver paquete →</Link>
                </FilaPlegable>
              )}
              <FilaRecurso clave="Método" icono={<Ico d={P.avance} s={14} />}
                valor={METODO_LABEL[nodo.metodo_avance]} />
            </div>

            {/* EL PROBLEMA NO SE ESCONDE: visible aunque su solapa esté cerrada. */}
            {nodo.impedimentos_abiertos > 0 && impedimentos.length === 0 && (
              <Impedimento testid="panel-impedimento"
                href={`/obras/${obraId}?vista=operacion&sub=impedimentos`}
                titulo={`${nodo.impedimentos_abiertos} impedimento(s) abiertos`}
                detalle="La actividad está frenada · ver en Operación" />
            )}

            {historial.length > 0 && (
              <EjecucionReciente historial={historial} hoyISO={hoyISO}
                alVerHistorial={() => alCambiarSolapa('historial')} />
            )}

            {/* LAS NOTAS SE VEN Y SE ESCRIBEN ACÁ MISMO, con la MISMA acción del panel del
                cronograma: una segunda caja de notas sería un segundo lugar donde buscar lo que
                alguien dijo de esta actividad. */}
            {(acciones.agregarNota || notas.length > 0) && (
              <section style={{ marginTop: '16px' }} data-testid="panel-notas">
                <Titulo>Notas</Titulo>
                <BloqueNotas notas={notas}
                  {...(puedeEditar && acciones.agregarNota
                    ? { agregar: acciones.agregarNota.bind(null, nodo.id) }
                    : {})} />
              </section>
            )}

            {puedeEditar && (
              <div style={{ marginTop: '16px', borderTop: `1px solid ${C.borde}`, paddingTop: '12px' }}>
                <DividirEnFrentes
                  nombre={nodo.nombre} cantidad={nodo.cantidad_objetivo} unidad={nodo.unidad}
                  dividir={acciones.dividir.bind(null, nodo.id)}
                  motivo={motivoNoDividir({
                    esContenedor: nodo.es_contenedor, tieneHijas: nodo.tiene_hijas, tipo: nodo.tipo,
                    cotizacionPartidaId: nodo.cotizacion_partida_id, nAvances: historial.length,
                    nPasos: pasos.length, tipoPadre: null,
                  })}
                />
              </div>
            )}
            </div>
            </details>
          </section>
        )}

        {solapa === 'avance' && (
          <SolapaAvance nodo={nodo} pasos={pasos} formulario={
            puedeRegistrar && acciones.registrarAvance ? (
              <FormAvanceEmbebido nodo={nodo} pasos={pasos} cuadrillas={cuadrillas}
                autor={autor ?? 'sin identificar'} hoy={hoyISO}
                registrar={acciones.registrarAvance.bind(null, nodo.id)} />
            ) : null
          } />
        )}

        {solapa === 'dependencias' && (
          <PanelTareaDependencias antes={antes} despues={despues}
            hrefVincular={`/obras/${obraId}?vista=tareas&sub=gantt&act=${nodo.id}`}
            puedeEditar={puedeEditar}
            cambiarRelacion={acciones.cambiarRelacion} quitarRelacion={acciones.quitarRelacion} />
        )}

        {solapa === 'rendimiento' && (
          <>
            {/* DE DÓNDE SALIÓ EL NÚMERO, DONDE SE DISCUTE EL NÚMERO (canónico 04). */}
            <div style={{ marginBottom: '12px', borderBottom: `1px solid ${C.borde}`, paddingBottom: '8px' }}
              data-testid="origen-del-analisis">
              <FilaRecurso clave="Esfuerzo" icono={<Ico d={P.base} s={14} />}
                falta={nodo.tarea_tipo_id ? 'sin análisis vigente' : 'sin tarea tipo'}
                valor={contexto.historico?.hsAnalisis != null
                  ? `${contexto.historico.hsAnalisis.toLocaleString('es-AR', { maximumFractionDigits: 2 })} hs${nodo.unidad ? `/${nodo.unidad}` : ''}`
                  : null} />
              {contexto.partida && (
                <FilaRecurso clave="Partida" icono={<Ico d={P.doc} s={14} />} valor={
                  <Link prefetch={false} href={`/presupuestos/${contexto.partida.cotizacionId}/partida/${contexto.partida.id}`}
                    data-testid="ver-partida" style={{ color: C.tinta }}>
                    {contexto.partida.codigo ?? 'ver partida'} →
                  </Link>
                } />
              )}
            </div>
            <PanelTareaRendimiento nodo={nodo} contexto={contexto} vinculacion={vinculacion}
              vincular={acciones.vincularEstandar.bind(null, nodo.id)} puedeEditar={puedeEditar} />
          </>
        )}

        {solapa === 'historial' && <SolapaHistorial historial={historial} />}

        {solapa === 'documentos' && (
          <SolapaDocumentos documentos={documentos} alSubir={
            <Link prefetch={false} href={`/obras/${obraId}?vista=documentos`} style={{ ...ESTILO_SECUNDARIA, width: 'fit-content', padding: '7px 10px' }}>
              <Ico d={P.subir} s={14} />Subir documento
            </Link>
          } />
        )}
      </div>
    </aside>
  )
}
