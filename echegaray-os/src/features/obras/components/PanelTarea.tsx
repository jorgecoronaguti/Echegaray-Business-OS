'use client'

// 04 · TAREA — PANEL LATERAL. Cliente puro: abrir, cerrar, cambiar de actividad o de solapa es
// estado — el material vino EN BLOQUE con el árbol (`panelObraService`) y acá sólo se elige y se
// dibuja. Ninguna de esas cuatro cosas vuelve al servidor; las ESCRITURAS sí, por sus server
// actions de siempre, que revalidan y refrescan los props.
//
// ═══ EL CONTRATO DEL DESIGN (23/08/2026) ═══
//
//   · Acción primaria ARRIBA: «Registrar avance» a la vista sin scroll; adjuntar queda como icono.
//   · PLAN | REAL enfrentados: el plan editable en la celda, el real con su última carga.
//   · El PROBLEMA no se esconde: el impedimento se ve en Resumen aunque su solapa esté cerrada.
//   · Seis solapas: Resumen · Avance · Dependencias · Rendimiento · Historial · Documentos.
//     Recursos y Subcontrato viven como filas del Resumen con su detalle plegado.
//   · HH no es avance: van al lado, con su propio rótulo.
//
// EL ID DE LA ACTIVIDAD viaja como argumento (`.bind` del cliente sobre la acción ya atada a la
// obra): igual de manipulable que cuando viajaba en la URL, y por eso cada acción vuelve a acotar
// por `obra_id` del lado del servidor antes de escribir una fila.

import Link from 'next/link'
import { Estado, InlineEdit, SubTabs } from '@/shared/components/ds'
import {
  IconoAdjuntar, IconoCerrar, IconoCuadrilla, IconoEditar, IconoFoto, IconoHH, IconoObra,
  IconoPersona, IconoProblema,
} from '@/shared/components/iconos'
import { fecha, hh as fmtHH, porcentaje } from './formato'
import { METODO_LABEL } from '../types'
import type { NodoObra } from '../services/wbs'
import { avancePorPasos, hhProyectadas, proyeccionExcedida } from '../services/avance'
import type { PasoDeActividad, RegistroAvance, RelacionLegible } from '../services/tareasService'
import type { ContextoTarea } from '../services/panelTareaService'
import type { VinculacionTarea } from '../services/vinculacionTareaService'
import { motivoNoDividir } from '../services/panelTarea'
import { ultimoTramoDelCamino } from '../services/frente'
import { estadoDeFila } from '../services/vistaArbol'
import { SOLAPAS, type Solapa } from '../services/solapasTarea'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import { PanelTareaRecursos } from './PanelTareaRecursos'
import { PanelTareaRendimiento } from './PanelTareaRendimiento'
import { PanelTareaDependencias } from './PanelTareaDependencias'
import { DividirEnFrentes } from './DividirEnFrentes'

type ResultadoInline = { ok: true } | { ok: false; error: string }

export interface AccionesDelPanel {
  /** Atadas a la OBRA; el id de la actividad lo ata este componente. */
  editarCampo: (actividadId: string, campo: string, valor: string) => Promise<ResultadoInline>
  dividir: (actividadId: string, form: FormData) => ReturnType<AccionFormulario>
  cambiarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
  quitarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
  vincularEstandar: (actividadId: string, form: FormData) => ReturnType<AccionFormulario>
}

/** Clave a la izquierda, valor a la derecha. La ausencia se dice con su nombre, nunca con un guión
 *  suelto — un «—» al lado de «Responsable» se lee como «nadie», y es «nadie lo cargó». */
function Dato({ clave, valor, icono, falta = 'sin cargar' }: {
  clave: string; valor: React.ReactNode | null; icono?: React.ReactNode; falta?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
      <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-faint">
        {icono}{clave}
      </span>
      <span className="text-right text-[12.5px] text-ink-soft">
        {valor ?? <span className="text-faint">{falta}</span>}
      </span>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink">{children}</h3>
}

/** El bloque de HH. Su TÍTULO es parte del contrato: separa el hecho de la interpretación. */
function BloqueHH({ plan, real, avance }: { plan: number | null; real: number | null; avance: number | null }) {
  const proy = hhProyectadas(real, avance)
  return (
    <section className="mt-4 border-t border-line pt-3" data-testid="hh-consumidas">
      <Titulo>HH consumidas — no es avance</Titulo>
      <div className="grid grid-cols-3 gap-2">
        <Cifra rotulo="Plan" valor={fmtHH(plan)} falta="sin cargar" />
        <Cifra rotulo="Real" valor={fmtHH(real)} falta="sin registro" />
        <Cifra rotulo="Proyectadas" valor={fmtHH(proy)} falta="sin base"
          alerta={proyeccionExcedida(proy, plan)} />
      </div>
    </section>
  )
}

function Cifra({ rotulo, valor, falta, alerta = false }: {
  rotulo: string; valor: string | null; falta: string; alerta?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{rotulo}</div>
      <div className={`font-mono text-[15px] font-semibold tabular-nums ${alerta ? 'text-warn' : 'text-ink'}`}>
        {valor ?? <span className="font-sans text-[12px] font-normal text-faint">{falta}</span>}
      </div>
    </div>
  )
}

/** Una celda del bloque PLAN | REAL: rótulo a la izquierda, valor mono a la derecha. */
function Celda({ k, v, falta = 'sin cargar' }: { k: string; v: React.ReactNode | null; falta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px]">
      <span className="text-[11px] text-faint">{k}</span>
      <span className="text-right font-mono text-[12px] tabular-nums text-ink">
        {v ?? <span className="font-sans text-[11.5px] text-faint">{falta}</span>}
      </span>
    </div>
  )
}

/** Fila plegable del Resumen (Dotación, Subcontrato): resumen a la vista, detalle bajo demanda. */
function FilaPlegable({ clave, resumen, icono, alerta = false, children, testid }: {
  clave: string; resumen: React.ReactNode; icono?: React.ReactNode
  alerta?: boolean; children: React.ReactNode; testid?: string
}) {
  return (
    <details className="border-b border-[#EFEEEA] last:border-0" data-testid={testid}>
      <summary className="flex cursor-pointer items-baseline justify-between gap-3 py-1.5 [&::-webkit-details-marker]:hidden">
        <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-faint">{icono}{clave}</span>
        <span className={`text-right text-[12.5px] ${alerta ? 'text-warn' : 'text-ink-soft'}`}>{resumen} ›</span>
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  )
}

export function PanelTarea({
  obraId, nodo, solapa, alCambiarSolapa, alCerrar, alAbrirActividad,
  pasos, historial, relaciones, documentos, cuadrillas,
  contexto, vinculacion, dotacion, alCambiarDotacion, puedeEditar, acciones,
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
  contexto: ContextoTarea
  vinculacion: VinculacionTarea
  dotacion: number
  alCambiarDotacion: (n: number) => void
  puedeEditar: boolean
  acciones: AccionesDelPanel
}) {
  const avancePasos = avancePorPasos(pasos.map((p) => ({ peso: Number(p.peso), hecho: p.hecho_en !== null })))
  const antes = relaciones.filter((r) => r.destino_id === nodo.id)
  const despues = relaciones.filter((r) => r.origen_id === nodo.id)
  const evidencias = historial.flatMap((h) => h.evidencia)
  const est = estadoDeFila(nodo, nodo.avance_pct)
  const TONO = {
    impedimento: 'neg', hecha: 'pos', en_curso_critica: 'warn', en_curso: 'curso',
    sin_analisis: 'warn', sin_cuadrilla: 'warn', sin_plan: 'pendiente', pendiente: 'pendiente',
  } as const
  const frente = ultimoTramoDelCamino(nodo.camino, nodo.nombre)
  const editar = (campo: string) => (v: string) => acciones.editarCampo(nodo.id, campo, v)
  const ultima = historial[0]?.fecha ?? null

  return (
    <aside data-testid="panel-tarea" className="border-l border-line pl-4">
      {/* ═══ ACCIÓN PRIMARIA ARRIBA — a la vista sin scroll ═══ */}
      <div className="flex items-center gap-2 pt-0.5">
        <Link href={`/obras/${obraId}/avance/${nodo.id}`} data-testid="panel-registrar-avance"
          className="inline-flex items-center gap-1.5 rounded-control bg-marca px-3 py-[7px] text-[12.5px] font-semibold text-ink hover:opacity-90">
          <IconoEditar className="h-[14px] w-[14px]" />
          Registrar avance
        </Link>
        {/* DOS ICONOS, DOS DESTINOS DISTINTOS. El Design dibuja adjuntar y cámara uno al lado del
            otro; si los dos llevaran al mismo lado sería un botón falso. El clip cuelga PAPEL de la
            obra (donde el panel ya dice que se cuelga), la cámara sube EVIDENCIA del avance. */}
        <Link href={`/obras/${obraId}?vista=documentos`} aria-label="Adjuntar documento"
          title="Adjuntar documento" data-testid="panel-adjuntar-evidencia"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-line text-muted hover:border-line-strong hover:text-ink">
          <IconoAdjuntar className="h-[15px] w-[15px]" />
        </Link>
        <Link href={`/obras/${obraId}/avance/${nodo.id}#evidencia`} aria-label="Foto o evidencia"
          title="Foto o evidencia" data-testid="panel-foto-evidencia"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-control border border-line text-muted hover:border-line-strong hover:text-ink">
          <IconoFoto className="h-[15px] w-[15px]" />
        </Link>
        <button type="button" onClick={alCerrar} data-testid="cerrar-panel" aria-label="Cerrar el panel"
          className="ml-auto p-1 text-faint hover:text-ink">
          <IconoCerrar className="h-[14px] w-[14px]" />
        </button>
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-[16px] font-semibold leading-snug text-ink">{nodo.nombre}</h2>
        <span className="shrink-0 pt-0.5">
          <Estado tono={TONO[est.clave]} clave={est.clave} testid="panel-estado">{est.label}</Estado>
        </span>
      </div>
      {/* LA SUB-LÍNEA DEL DESIGN: frente · cuadrilla · código, cada uno con su icono y separados
          por un punto tenue. Lo que no está cargado NO deja su icono huérfano: se omite entero. */}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted"
        data-testid="panel-sublinea">
        {frente && (
          <span className="flex items-center gap-1">
            <IconoObra className="h-[12.5px] w-[12.5px] shrink-0" />{frente}
          </span>
        )}
        {frente && nodo.cuadrilla && <span aria-hidden className="text-line-strong">·</span>}
        {nodo.cuadrilla && (
          <span className="flex items-center gap-1">
            <IconoCuadrilla className="h-[12.5px] w-[12.5px] shrink-0" />{nodo.cuadrilla}
          </span>
        )}
        {(frente || nodo.cuadrilla) && nodo.partida_codigo && (
          <span aria-hidden className="text-line-strong">·</span>
        )}
        {nodo.partida_codigo && <span className="font-mono text-[11px] text-faint">{nodo.partida_codigo}</span>}
      </p>

      {/* Las dependencias se ven sin abrir su solapa: ← la que espera esta actividad · → la que
          espera a ésta, con salto directo a la otra punta. */}
      {(antes.length > 0 || despues.length > 0) && (
        <div className="mt-2 flex flex-col gap-1 border-y border-[#EFEEEA] py-2 text-[12px]" data-testid="deps-compactas">
          {antes.map((r) => (
            <span key={r.id} className="flex min-w-0 items-baseline gap-1.5">
              <span aria-hidden className="shrink-0 text-faint">←</span>
              <button type="button" onClick={() => alAbrirActividad(r.origen_id)}
                className="truncate text-left text-ink-soft hover:text-ink hover:underline">{r.origen}</button>
              <span className="shrink-0 text-[11px] text-faint">{r.relacion}</span>
            </span>
          ))}
          {despues.map((r) => (
            <span key={r.id} className="flex min-w-0 items-baseline gap-1.5">
              <span aria-hidden className="shrink-0 text-faint">→</span>
              <button type="button" onClick={() => alAbrirActividad(r.destino_id)}
                className="truncate text-left text-ink-soft hover:text-ink hover:underline">{r.destino}</button>
            </span>
          ))}
        </div>
      )}

      {/* EL PROBLEMA NO SE ESCONDE: visible en cualquier solapa. */}
      {nodo.impedimentos_abiertos > 0 && (
        <Link href={`/obras/${obraId}?vista=operacion&sub=impedimentos`}
          className="mt-2 flex items-start gap-2 rounded-[8px] border border-neg/25 bg-neg-soft px-3 py-2.5 hover:opacity-90"
          data-testid="panel-impedimento">
          <IconoProblema className="mt-[2px] h-[14px] w-[14px] shrink-0 text-neg" />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-neg">
              {nodo.impedimentos_abiertos} impedimento(s) abiertos
            </span>
            <span className="block text-[11px] text-muted">La actividad está frenada · ver en Operación</span>
          </span>
          <span aria-hidden className="ml-auto shrink-0 self-center text-[12px] text-faint">›</span>
        </Link>
      )}

      <div className="py-2.5">
        <SubTabs
          testid="solapas-tarea"
          items={SOLAPAS.map(([id, label]) => ({
            onClick: () => alCambiarSolapa(id), label, activo: solapa === id, testid: `sol-${id}`,
          }))}
        />
      </div>

      {solapa === 'resumen' && (
        <section data-testid="panel-general">
          {/* ═══ PLAN | REAL, enfrentados. El plan se corrige en la celda — donde se lee. ═══ */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[8px] border border-line bg-[#FAFAF8] px-2.5 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-[0.05em] text-faint">Plan</div>
              <Celda k="Unidad" v={
                <InlineEdit valor={nodo.unidad} tipo="texto" ancho="w-16" falta="sin unidad"
                  etiqueta={`Unidad de ${nodo.nombre}`} testid="editar-unidad" guardar={editar('unidad')} />
              } />
              <Celda k="Cantidad" v={
                <InlineEdit valor={nodo.cantidad_objetivo} tipo="numero" alineado="right" ancho="w-20"
                  etiqueta={`Cantidad objetivo de ${nodo.nombre}`} testid="editar-cantidad"
                  guardar={editar('cantidad_objetivo')} />
              } />
              <Celda k="Inicio" v={
                <InlineEdit valor={nodo.inicio_plan ?? null} tipo="fecha" ancho="w-28" falta="sin plan"
                  etiqueta={`Inicio de plan de ${nodo.nombre}`} testid="editar-inicio"
                  guardar={editar('inicio_plan')} />
              } />
              <Celda k="Fin" v={
                <InlineEdit valor={nodo.fin_plan} tipo="fecha" ancho="w-28" falta="sin plan"
                  etiqueta={`Fin de plan de ${nodo.nombre}`} testid="editar-fin"
                  guardar={editar('fin_plan')} />
              } />
              <Celda k="HH" v={
                <InlineEdit valor={nodo.hh_plan} tipo="numero" alineado="right" ancho="w-20"
                  etiqueta={`HH plan de ${nodo.nombre}`} testid="editar-hh" guardar={editar('hh_plan')} />
              } />
            </div>
            <div className="rounded-[8px] border border-[#DCE9E0] bg-[#F5FAF7] px-2.5 py-2" data-testid="panel-real">
              <div className="mb-1 text-[10px] uppercase tracking-[0.05em] text-pos">Real</div>
              <Celda k="Ejecutado" v={nodo.cantidad_ejecutada != null
                ? `${nodo.cantidad_ejecutada.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${nodo.unidad ? ` ${nodo.unidad}` : ''}`
                : null} falta="sin registro" />
              <Celda k="Avance" v={porcentaje(nodo.avance_pct)} falta="sin avance" />
              <Celda k="HH reales" v={fmtHH(nodo.hh_real)} falta="sin registro" />
              <Celda k="Última carga" v={ultima ? fecha(ultima) : null} falta="sin cargas" />
              <Celda k="Método" v={METODO_LABEL[nodo.metodo_avance]} />
            </div>
          </div>
          {/* La barra sólo si el número ES una fracción. */}
          {nodo.avance_pct != null && (
            <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
              <span className="block h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, nodo.avance_pct))}%` }} />
            </span>
          )}

          <div className="mt-3">
            <Dato clave="Cuadrilla" icono={<IconoCuadrilla className="h-[13px] w-[13px]" />} valor={
              <InlineEdit
                valor={nodo.cuadrilla_id} tipo="seleccion" ancho="w-40" falta="sin asignar"
                opciones={[{ valor: '', etiqueta: 'sin asignar' },
                  ...cuadrillas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
                etiqueta={`Cuadrilla de ${nodo.nombre}`} testid="editar-cuadrilla"
                guardar={editar('cuadrilla_id')}
              />
            } />
            <Dato clave="Responsable" icono={<IconoPersona className="h-[13px] w-[13px]" />}
              valor={nodo.responsable} falta="sin asignar" />
            <FilaPlegable clave="Dotación" testid="fila-dotacion"
              icono={<IconoHH className="h-[13px] w-[13px]" />}
              alerta={nodo.tope_frente != null && dotacion >= nodo.tope_frente}
              resumen={nodo.tope_frente != null
                ? `${dotacion} de ${nodo.tope_frente}${dotacion >= nodo.tope_frente ? ' · tope del frente' : ''}`
                : `${dotacion} pers.`}>
              <PanelTareaRecursos nodo={nodo} contexto={contexto} dotacion={dotacion}
                alCambiarDotacion={alCambiarDotacion} />
              <p className="mt-2 text-[11px] text-muted">
                Esto simula: el plan se escribe desde{' '}
                <Link href={`/obras/${obraId}/dotacion`} className="font-medium text-ink hover:underline">
                  Dotación y proyección</Link>, sobre el frente completo.
              </p>
            </FilaPlegable>
            {nodo.es_subcontrato && (
              <FilaPlegable clave="Subcontrato" resumen={nodo.subcontratista ?? 'paquete'} testid="fila-subcontrato">
                <p className="text-[12px] text-muted">El avance de un paquete lo firma el jefe de obra.</p>
                <Link href={`/obras/${obraId}/subcontratos`} data-testid="ver-paquete"
                  className="mt-1.5 inline-block text-[12.5px] font-medium text-ink hover:underline">Ver paquete →</Link>
              </FilaPlegable>
            )}
            <Dato clave="Esfuerzo del análisis"
              valor={contexto.historico?.hsAnalisis != null
                ? `${contexto.historico.hsAnalisis.toLocaleString('es-AR', { maximumFractionDigits: 2 })} hs${nodo.unidad ? `/${nodo.unidad}` : ''}`
                : null}
              falta={nodo.tarea_tipo_id ? 'sin análisis vigente' : 'sin tarea tipo'} />
            {contexto.partida && (
              <Dato clave="Partida de origen" valor={
                <Link href={`/presupuestos/${contexto.partida.cotizacionId}/partida/${contexto.partida.id}`}
                  data-testid="ver-partida" className="text-ink-soft hover:underline">
                  {contexto.partida.codigo ?? 'ver partida'} →
                </Link>
              } />
            )}
          </div>

          {/* EJECUCIÓN RECIENTE (design 03): las últimas tres cargas se ven sin cambiar de solapa —
              lo primero que se pregunta al abrir una actividad es cuándo se tocó por última vez. */}
          {historial.length > 0 && (
            <section className="mt-3 border-t border-line pt-3" data-testid="ejecucion-reciente">
              <Titulo>Ejecución reciente</Titulo>
              {/* MINI-TABLA, no una lista suelta: sin encabezado el número del medio se lee como
                  porcentaje siempre, y en las actividades medidas por cantidad no lo es. NO HAY
                  COLUMNA DE HH: `obra_ejecucion` no las publica por registro y ponerla vacía sería
                  prometer un dato que la base no tiene. */}
              <div className="flex items-baseline gap-2 pb-1 text-[10px] uppercase tracking-[0.05em] text-faint">
                <span className="w-[52px] shrink-0">Fecha</span>
                <span className="flex-1">Cant. / avance</span>
                <span className="shrink-0">Quién</span>
              </div>
              <ul>
                {historial.slice(0, 3).map((h) => (
                  <li key={h.id} className="flex items-baseline gap-2 border-b border-[#EFEEEA] py-1 last:border-0">
                    <span className="w-[52px] shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{fecha(h.fecha)}</span>
                    <span className="flex-1 font-mono text-[11.5px] tabular-nums text-ink-soft">
                      {h.avance_pct !== null ? porcentaje(h.avance_pct) : h.cantidad !== null ? String(h.cantidad) : '—'}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">{h.autor ?? 'sin firma'}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => alCambiarSolapa('historial')} data-testid="ver-historial"
                className="mt-1.5 text-[12px] text-muted hover:text-ink">Ver historial →</button>
            </section>
          )}

          {puedeEditar && (
            <div className="mt-3 border-t border-line pt-3">
              <DividirEnFrentes
                nombre={nodo.nombre} cantidad={nodo.cantidad_objetivo} unidad={nodo.unidad}
                dividir={acciones.dividir.bind(null, nodo.id)}
                motivo={motivoNoDividir({
                  esContenedor: nodo.es_contenedor,
                  tieneHijas: nodo.tiene_hijas,
                  tipo: nodo.tipo,
                  cotizacionPartidaId: nodo.cotizacion_partida_id,
                  nAvances: historial.length,
                  nPasos: pasos.length,
                  tipoPadre: null,
                })}
              />
            </div>
          )}
        </section>
      )}

      {solapa === 'avance' && (
        <section data-testid="panel-avance-solapa">
          <Titulo>Pasos ponderados</Titulo>
          {pasos.length === 0 ? (
            <p className="text-[12.5px] text-muted">
              Sin pasos cargados: su avance se mide por{' '}
              <strong className="text-ink">{METODO_LABEL[nodo.metodo_avance].toLowerCase()}</strong>.
            </p>
          ) : (
            <>
              <ul>
                {pasos.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 border-b border-[#EFEEEA] py-1.5 last:border-0">
                    <span aria-hidden className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border ${p.hecho_en ? 'border-marca bg-marca' : 'border-line-strong'}`} />
                    <span className="flex-1 text-[12.5px] text-ink-soft">{p.nombre}</span>
                    {p.tiempo_tecnico && <span className="text-[10.5px] text-warn">tiempo técnico</span>}
                    <span className="w-[34px] text-right font-mono text-[11.5px] tabular-nums text-muted">{p.peso}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-baseline justify-between">
                <span className="text-[11.5px] text-faint">Suma de pesos hechos</span>
                <span className="font-mono text-[13.5px] font-semibold tabular-nums text-ink">
                  {porcentaje(avancePasos) ?? 'sin base'}
                </span>
              </p>
            </>
          )}
          <BloqueHH plan={nodo.hh_plan} real={nodo.hh_real} avance={nodo.avance_pct} />

          {/* La evidencia es del REGISTRO y vive en Drive como enlace: el OS no guarda una segunda
              copia del papel (decisión escrita de la pantalla 05). Acá se MUESTRA lo cargado. */}
          <section className="mt-4 border-t border-line pt-3" data-testid="evidencia-actividad">
            <Titulo>Evidencia cargada</Titulo>
            {evidencias.length === 0
              ? <p className="text-[11.5px] text-muted">Ningún registro trae evidencia. Se adjunta al registrar el avance.</p>
              : (
                <ul className="flex flex-col gap-0.5">
                  {evidencias.map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer"
                        className="block truncate text-[11.5px] text-ink-soft hover:underline">{url}</a>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </section>
      )}

      {solapa === 'dependencias' && (
        <PanelTareaDependencias
          antes={antes} despues={despues}
          hrefVincular={`/obras/${obraId}?vista=cronograma&sub=gantt&act=${nodo.id}`}
          puedeEditar={puedeEditar}
          cambiarRelacion={acciones.cambiarRelacion} quitarRelacion={acciones.quitarRelacion}
        />
      )}

      {solapa === 'rendimiento' && (
        <PanelTareaRendimiento nodo={nodo} contexto={contexto} vinculacion={vinculacion}
          vincular={acciones.vincularEstandar.bind(null, nodo.id)} puedeEditar={puedeEditar} />
      )}

      {solapa === 'historial' && (
        <section data-testid="panel-historial">
          {historial.length === 0
            ? <p className="text-[12.5px] text-muted">Todavía no se registró un solo avance en esta actividad.</p>
            : <ul>{historial.slice(0, 30).map((h) => (
                <li key={h.id} className="flex items-baseline gap-2 border-b border-[#EFEEEA] py-1.5 last:border-0">
                  <span className="w-[62px] shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{fecha(h.fecha)}</span>
                  <span className="flex-1">
                    <span className="block text-[12px] text-ink-soft">
                      {h.criterio || h.comentario || (h.metodo ? METODO_LABEL[h.metodo as keyof typeof METODO_LABEL] ?? h.metodo : 'Avance registrado')}
                    </span>
                    <span className="block text-[10.5px] text-muted">
                      {h.autor ?? 'sin firma'} · {h.fuente ?? 'sin origen'} · {h.metodo ?? 'método no declarado'}
                      {h.masivo && ' · en lote'}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-soft">
                    {h.avance_pct !== null ? porcentaje(h.avance_pct) : h.cantidad !== null ? String(h.cantidad) : '—'}
                  </span>
                </li>))}</ul>}
        </section>
      )}

      {solapa === 'documentos' && (
        <section data-testid="panel-documentos">
          {documentos.length === 0
            ? (
              <p className="text-[12.5px] text-muted">
                Ningún papel colgado de esta actividad. Se cuelgan desde{' '}
                <Link href={`/obras/${obraId}?vista=documentos`} className="font-medium text-ink hover:underline">
                  Documentos</Link>.
              </p>
            )
            : (
              <ul>
                {documentos.map((d) => (
                  <li key={d.id} className="border-b border-[#EFEEEA] py-1.5 last:border-0">
                    <a href={d.url} target="_blank" rel="noreferrer"
                      className="block truncate text-[12.5px] text-ink-soft hover:underline">{d.nombre}</a>
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}
    </aside>
  )
}
