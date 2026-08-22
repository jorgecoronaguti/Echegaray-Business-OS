// ═══ 04 · TAREA · PANEL LATERAL — las siete solapas de una actividad ═══
//
// Es un SERVER COMPONENT: sus siete solapas son siete lecturas distintas y traerlas al cliente por
// cada clic sería traerlas por cada clic. La solapa viaja en la URL (`?sol=`), así que un panel
// abierto en «Dependencias» se puede pegar en un chat y abre ahí.
//
// ═══ DOS COSAS QUE ESTE PANEL NO INVENTA ═══
//
// 1. **LA RELACIÓN ENTRE DOS ACTIVIDADES SE LEE EN PALABRAS DESDE LA BASE** (`obra_dependencia_
//    legible`). La sigla FS/SS/FF/SF no se muestra nunca, y la frase no se arma acá: si el texto
//    viviera en el front, cada pantalla inventaría el suyo y un día dejarían de coincidir.
// 2. **HH NO ES AVANCE.** El bloque se llama «HH consumidas — no es avance» con todas las letras.
//    Consumir el 80 % de las horas no es haber hecho el 80 % del trabajo: casi siempre es lo
//    contrario, y confundirlos es cómo una obra se entera tarde de que se le fue el rendimiento.

import Link from 'next/link'
import { Estado, InlineEdit, SubTabs } from '@/shared/components/ds'
import { fecha, hh as fmtHH, porcentaje } from './formato'
import { METODO_CORTO, METODO_LABEL } from '../types'
import type { NodoObra } from '../services/wbs'
import { avancePorPasos, hhProyectadas, proyeccionExcedida } from '../services/avance'
import type { PasoDeActividad, RegistroAvance, RelacionLegible } from '../services/tareasService'
import type { ContextoTarea } from '../services/panelTareaService'
import type { VinculacionTarea } from '../services/vinculacionTareaService'
import { motivoNoDividir } from '../services/panelTarea'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import { PanelTareaRecursos } from './PanelTareaRecursos'
import { PanelTareaRendimiento } from './PanelTareaRendimiento'
import { PanelTareaDependencias } from './PanelTareaDependencias'
import { DividirEnFrentes } from './DividirEnFrentes'

export const SOLAPAS = [
  ['general', 'General'], ['avance', 'Avance'], ['recursos', 'Recursos y HH'],
  ['dependencias', 'Dependencias'], ['subcontrato', 'Subcontrato'],
  // La CLAVE sigue siendo `rendimiento` —viaja en la URL (`?sol=`)—; el RÓTULO dice lo que el
  // número es: hs/unidad, o sea esfuerzo. Ver `base-maestra/services/vocabulario.ts`.
  ['rendimiento', 'Esfuerzo'], ['historial', 'Historial'],
] as const
export type Solapa = (typeof SOLAPAS)[number][0]

export function esSolapa(v: unknown): v is Solapa {
  return typeof v === 'string' && SOLAPAS.some(([id]) => id === v)
}

/** Clave a la izquierda, valor a la derecha. La ausencia se dice con su nombre, nunca con un guión
 *  suelto — un «—» al lado de «Responsable» se lee como «nadie», y es «nadie lo cargó». */
function Dato({ clave, valor, falta = 'sin cargar' }: {
  clave: string; valor: React.ReactNode | null; falta?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
      <span className="shrink-0 text-[11.5px] text-faint">{clave}</span>
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
  // LAS PROYECTADAS SALEN DEL RITMO OBSERVADO: horas reales sobre el avance conseguido. Sin una de
  // las dos puntas es «sin base», que no es lo mismo que cero horas por delante.
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

export function PanelTarea({
  obraId, nodo, solapa, pasos, relaciones, historial, hrefLista, cuadrillas, editarCampo,
  contexto, dotacion, puedeEditar, acciones, vinculacion,
}: {
  obraId: string
  nodo: NodoObra
  solapa: Solapa
  pasos: PasoDeActividad[]
  relaciones: RelacionLegible[]
  historial: RegistroAvance[]
  /** Adonde vuelve la ✕: la misma lista, con el mismo filtro y sin el panel. */
  hrefLista: string
  cuadrillas: { id: string; nombre: string }[]
  /** Ya atada a la obra y a la actividad: el id nunca viaja en un campo del navegador. */
  editarCampo: (campo: string, valor: string) => Promise<{ ok: true } | { ok: false; error: string }>
  /** Lo que el árbol no trae: jornada, calendario, capacidad, partida de origen e histórico. */
  contexto: ContextoTarea
  /** La dotación simulada, de la URL. Es simulación: no toca `dotacion_prevista`. */
  dotacion: number
  /** Administración o jefatura de obra. Decide qué GESTOS se ofrecen, no qué se puede: eso lo
   *  decide cada acción del servidor. */
  puedeEditar: boolean
  /** El estado de vinculación con el motor de estándares. Se calcula sobre el nodo que el árbol ya
   *  trajo; sus dos lecturas sólo corren si hay algo que resolver. */
  vinculacion: VinculacionTarea
  acciones: {
    dividir: AccionFormulario
    /** Ya atadas a la obra; el id de la dependencia se ata con `.bind` donde se dibuja. */
    cambiarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
    quitarRelacion: (dependenciaId: string, form: FormData) => ReturnType<AccionFormulario>
    vincularEstandar: AccionFormulario
  }
}) {
  const base = `${hrefLista}&act=${nodo.id}`
  const avancePasos = avancePorPasos(pasos.map((p) => ({ peso: Number(p.peso), hecho: p.hecho_en !== null })))
  const antes = relaciones.filter((r) => r.destino_id === nodo.id)
  const despues = relaciones.filter((r) => r.origen_id === nodo.id)
  const evidencias = historial.flatMap((h) => h.evidencia)

  return (
    <aside data-testid="panel-tarea" className="border-l border-line pl-4 xl:h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* La ruta sólo si dice algo más que el título: en una actividad colgada de la raíz,
              `camino` ES el nombre y repetirlo arriba no ubica a nadie. */}
          {nodo.camino !== nodo.nombre && (
            <p className="truncate font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint">{nodo.camino}</p>
          )}
          <h2 className="text-[16px] font-semibold text-ink">{nodo.nombre}</h2>
        </div>
        <Link href={hrefLista} data-testid="cerrar-panel" aria-label="Cerrar el panel"
          className="text-[13px] text-faint hover:text-ink">✕</Link>
      </div>

      <div className="mt-2.5 flex divide-x divide-[#EFEEEA] border-y border-[#EFEEEA] py-2">
        <div className="pr-4">
          <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Avance</div>
          <div className="font-mono text-[18px] font-semibold tabular-nums text-ink" data-testid="panel-avance">
            {porcentaje(nodo.avance_pct) ?? <span className="font-sans text-[12.5px] font-normal text-faint">sin avance</span>}
          </div>
        </div>
        <div className="px-4">
          <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Medición</div>
          <div className="text-[12.5px] text-ink-soft">{METODO_CORTO[nodo.metodo_avance]}</div>
        </div>
        <div className="pl-4">
          <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Fin plan</div>
          <div className="text-[12.5px] text-ink-soft">
            {nodo.fin_plan ? fecha(nodo.fin_plan) : <span className="text-faint">sin plan</span>}
          </div>
        </div>
      </div>

      <div className="py-2.5">
        <SubTabs
          testid="solapas-tarea"
          items={SOLAPAS.map(([id, label]) => ({
            href: `${base}&sol=${id}`, label, activo: solapa === id, testid: `sol-${id}`,
          }))}
        />
      </div>

      {solapa === 'general' && (
        <section data-testid="panel-general">
          <Dato clave="Partida de origen" valor={nodo.partida_codigo} />
          {/* ═══ LOS DOS DATOS QUE FALTAN EN LAS 275 ACTIVIDADES ═══
              Sin cantidad objetivo y sin unidad, el método «cantidad» no se puede usar nunca y el
              porcentaje queda condenado a declararse a mano. Se corrigen en la celda, que es donde
              se leen: mandarlos a otra pantalla es mandarlos a nunca. */}
          <Dato clave="Cantidad objetivo" valor={
            <InlineEdit
              valor={nodo.cantidad_objetivo} tipo="numero" alineado="right" ancho="w-24"
              etiqueta={`Cantidad objetivo de ${nodo.nombre}`} testid="editar-cantidad"
              sufijo={nodo.unidad ?? undefined}
              guardar={editarCampo.bind(null, 'cantidad_objetivo')}
            />
          } />
          <Dato clave="Unidad" valor={
            <InlineEdit
              valor={nodo.unidad} tipo="texto" ancho="w-20" falta="sin unidad"
              etiqueta={`Unidad de ${nodo.nombre}`} testid="editar-unidad"
              guardar={editarCampo.bind(null, 'unidad')}
            />
          } />
          <Dato clave="HH plan" valor={
            <InlineEdit
              valor={nodo.hh_plan} tipo="numero" alineado="right" ancho="w-24"
              etiqueta={`HH plan de ${nodo.nombre}`} testid="editar-hh"
              guardar={editarCampo.bind(null, 'hh_plan')}
            />
          } />
          <Dato clave="Método de medición" valor={METODO_LABEL[nodo.metodo_avance]} />
          <Dato clave="Frente" valor={nodo.camino.includes('›') ? nodo.camino.split('›').slice(-2, -1)[0]?.trim() : null}
            falta="sin declarar" />
          <Dato clave="Fin plan" valor={
            <InlineEdit
              valor={nodo.fin_plan} tipo="fecha" ancho="w-32" falta="sin plan"
              etiqueta={`Fin de plan de ${nodo.nombre}`} testid="editar-fin"
              guardar={editarCampo.bind(null, 'fin_plan')}
            />
          } />
          {/* DOS HECHOS, DOS FILAS. El selector arrancaba siempre en `valor={null}` —«sin asignar»
              aunque la actividad tuviera cuadrilla— y la fila de abajo, rotulada RESPONSABLE,
              mostraba justamente esa cuadrilla. Quien miraba el panel leía la composición
              productiva como si fuera la persona que rinde cuentas, y el selector le decía que no
              había ninguna. La cuadrilla ahora arranca en la que está cargada — con el ID y no con
              el nombre, porque el `<select>` compara contra el `value` de cada opción, que es
              `cuadrilla.id`; con el nombre ninguna coincidiría y volvería a arrancar vacío. */}
          <Dato clave="Cuadrilla" valor={
            <InlineEdit
              valor={nodo.cuadrilla_id} tipo="seleccion" ancho="w-40" falta="sin asignar"
              opciones={[{ valor: '', etiqueta: 'sin asignar' },
                ...cuadrillas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
              etiqueta={`Cuadrilla de ${nodo.nombre}`} testid="editar-cuadrilla"
              guardar={editarCampo.bind(null, 'cuadrilla_id')}
            />
          } />
          <Dato clave="Responsable" valor={nodo.responsable} falta="sin asignar" />
          {/* El esfuerzo del ANÁLISIS VIGENTE, de la tarea tipo. No es el planificado ni el
              observado: los cinco, uno debajo del otro, están en la solapa Esfuerzo. */}
          <Dato clave="Esfuerzo del análisis"
            valor={contexto.historico?.hsAnalisis != null
              ? `${contexto.historico.hsAnalisis.toLocaleString('es-AR', { maximumFractionDigits: 2 })} hs${nodo.unidad ? `/${nodo.unidad}` : ''}`
              : null}
            falta={nodo.tarea_tipo_id ? 'sin análisis vigente' : 'sin tarea tipo'} />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px]">
            <Link href={`/obras/${obraId}/avance/${nodo.id}`} data-testid="general-registrar"
              className="font-medium text-ink hover:underline">Registrar avance</Link>
            {/* ═══ «VER PARTIDA» SÓLO CUANDO HAY ADÓNDE IR, Y CUANDO SE PUEDE ENTRAR ═══
                El análisis de una partida es costo de punta a punta y la pantalla 16 lo cierra a
                quien ve economía. Ofrecer el link a un jefe de obra lo mandaría a un cartel de «sin
                permiso»: un botón que no lleva a ningún lado es peor que no tenerlo. La lectura de
                la partida ni se pide cuando el rol no la ve, así que `contexto.partida` en null
                cubre los dos casos —no existe y no la puedo leer— y los dos se dibujan igual. */}
            {contexto.partida && (
              <Link href={`/presupuestos/${contexto.partida.cotizacionId}/partida/${contexto.partida.id}`}
                data-testid="ver-partida" className="text-ink-soft hover:underline">
                Ver partida{contexto.partida.codigo ? ` ${contexto.partida.codigo}` : ''}
              </Link>
            )}
            <Link href={`/obras/${obraId}?vista=operacion&sub=impedimentos`} className="text-neg hover:underline">
              Marcar impedimento
            </Link>
          </div>
          {puedeEditar && (
            <div className="mt-3 border-t border-line pt-3">
              {/* El motivo se calcula con lo que el panel YA leyó: el historial dice si tiene
                  avances y `pasos` si se mide por pasos. El padre no se conoce acá —el árbol trae
                  `padre_id`, no su tipo—, así que ese caso lo contesta la acción. */}
              <DividirEnFrentes
                nombre={nodo.nombre} cantidad={nodo.cantidad_objetivo} unidad={nodo.unidad}
                dividir={acciones.dividir}
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
              Esta actividad no tiene pasos cargados. Su avance se mide por{' '}
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

          {/* ═══ «ADJUNTAR FOTO»: LA DECISIÓN, ESCRITA ═══
              El contrato visual pide subir una foto desde acá. NO se monta, y no es por falta de
              infraestructura: Supabase Storage está configurado y en uso (buckets `impedimentos`,
              `documentos-legajo`, `herramientas`). Es porque la pantalla 05 —la que registra el
              avance— ya decidió por escrito lo contrario: «no hay subida de archivos en el OS: el
              archivo vive en Drive y acá se guarda el enlace», y `obra_ejecucion.evidencia` es
              justamente un `text[]` de enlaces. Montar un cargador acá crearía una SEGUNDA copia del
              mismo papel con otro dueño, y la que se desactualiza es siempre la copia.
              Además la foto es evidencia DE UN REGISTRO, no de la actividad: adjuntarla sin decir a
              cuál de los avances pertenece la dejaría colgada del último por casualidad.
              Lo que sí se hace acá es MOSTRAR lo que hay, que antes no se veía en ninguna parte. */}
          <section className="mt-4 border-t border-line pt-3" data-testid="evidencia-actividad">
            <Titulo>Evidencia cargada</Titulo>
            {evidencias.length === 0
              ? (
                <p className="text-[11.5px] leading-relaxed text-muted">
                  Ningún registro de avance trae evidencia. Se adjunta al registrar el avance, como
                  enlace de Drive: el OS no guarda una segunda copia del papel.
                </p>
              )
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

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={`/obras/${obraId}/avance/${nodo.id}`} data-testid="panel-registrar-avance"
              className="inline-block rounded-control bg-marca px-3 py-1.5 text-[12px] font-semibold text-ink hover:opacity-90">
              Registrar avance
            </Link>
            <Link href={`/obras/${obraId}/avance/${nodo.id}#evidencia`} data-testid="panel-adjuntar-evidencia"
              className="text-[11.5px] text-muted hover:text-ink hover:underline">
              Adjuntar evidencia
            </Link>
          </div>
        </section>
      )}

      {solapa === 'recursos' && (
        <>
          <PanelTareaRecursos nodo={nodo} contexto={contexto} base={base} dotacion={dotacion} />
          <Dato clave="Dotación prevista del plan" valor={nodo.dotacion_prevista} falta="sin declarar" />
          <Dato clave="Cuadrilla" valor={nodo.cuadrilla} falta="sin asignar" />
          <BloqueHH plan={nodo.hh_plan} real={nodo.hh_real} avance={nodo.avance_pct} />
          {/* LA SIMULACIÓN NO ES EL PLAN. Guardarla es la 08, que la escribe sobre el FRENTE entero
              —`dotacion_prevista` es de todas las actividades del frente— y por eso no se puede
              aplicar desde acá sin decidir por las demás. */}
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            Esto simula. La dotación se guarda en el plan desde Dotación y proyección, que la aplica
            al frente completo —no a una actividad suelta—.{' '}
            <Link href={`/obras/${obraId}/dotacion`} className="font-medium text-ink hover:underline">
              Ir a Dotación y proyección
            </Link>
          </p>
        </>
      )}

      {solapa === 'dependencias' && (
        <PanelTareaDependencias
          antes={antes} despues={despues}
          hrefVincular={`/obras/${obraId}?vista=cronograma&sub=gantt&act=${nodo.id}`}
          puedeEditar={puedeEditar}
          cambiarRelacion={acciones.cambiarRelacion} quitarRelacion={acciones.quitarRelacion}
        />
      )}

      {solapa === 'subcontrato' && (
        <section data-testid="panel-subcontrato">
          {nodo.es_subcontrato ? (
            <>
              <Dato clave="Ejecuta" valor={nodo.subcontratista} />
              <p className="mt-2 text-[12.5px] text-muted">El avance de un paquete lo firma el jefe de obra.</p>
              {/* EL PAQUETE VIVE EN LA PANTALLA 10, no acá. Esta solapa dice que la actividad es de
                  un tercero; el contrato, los aportes de Echegaray, los papeles y su gente son otra
                  pantalla — duplicar acá cualquiera de los cuatro sería una segunda versión del
                  mismo dato con otra fuente. */}
              <Link href={`/obras/${obraId}/subcontratos`}
                className="mt-3 inline-block text-[12.5px] font-medium text-ink hover:underline"
                data-testid="ver-paquete">Ver paquete</Link>
            </>
          ) : (
            <p className="text-[12.5px] text-muted">Se ejecuta con personal propio.</p>
          )}
        </section>
      )}

      {solapa === 'rendimiento' && (
        <PanelTareaRendimiento nodo={nodo} contexto={contexto} vinculacion={vinculacion}
          vincular={acciones.vincularEstandar} puedeEditar={puedeEditar} />
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

      {nodo.impedimentos_abiertos > 0 && (
        <p className="mt-3">
          <Estado tono="neg" clave="impedimento">
            {nodo.impedimentos_abiertos} impedimento(s) abiertos: la actividad está frenada.
          </Estado>
        </p>
      )}
    </aside>
  )
}
