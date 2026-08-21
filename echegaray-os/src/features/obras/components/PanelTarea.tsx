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

export const SOLAPAS = [
  ['general', 'General'], ['avance', 'Avance'], ['recursos', 'Recursos y HH'],
  ['dependencias', 'Dependencias'], ['subcontrato', 'Subcontrato'],
  ['rendimiento', 'Rendimiento'], ['historial', 'Historial'],
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
}) {
  const base = `${hrefLista}&act=${nodo.id}`
  const avancePasos = avancePorPasos(pasos.map((p) => ({ peso: Number(p.peso), hecho: p.hecho_en !== null })))
  const antes = relaciones.filter((r) => r.destino_id === nodo.id)
  const despues = relaciones.filter((r) => r.origen_id === nodo.id)

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
          <Dato clave="Cuadrilla" valor={
            <InlineEdit
              valor={null} tipo="seleccion" ancho="w-40" falta="sin asignar"
              opciones={[{ valor: '', etiqueta: 'sin asignar' },
                ...cuadrillas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
              etiqueta={`Cuadrilla de ${nodo.nombre}`} testid="editar-cuadrilla"
              guardar={editarCampo.bind(null, 'cuadrilla_id')}
            />
          } />
          <Dato clave="Responsable declarado" valor={nodo.responsable} falta="sin asignar" />
          <Dato clave="Rendimiento del análisis" valor={null} falta="sin análisis" />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12.5px]">
            <Link href={`/obras/${obraId}/avance/${nodo.id}`} data-testid="general-registrar"
              className="font-medium text-ink hover:underline">Registrar avance</Link>
            <Link href={`/obras/${obraId}?vista=operacion&sub=impedimentos`} className="text-neg hover:underline">
              Marcar impedimento
            </Link>
          </div>
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
          <Link href={`/obras/${obraId}/avance/${nodo.id}`} data-testid="panel-registrar-avance"
            className="mt-3 inline-block rounded-control bg-marca px-3 py-1.5 text-[12px] font-semibold text-ink hover:opacity-90">
            Registrar avance
          </Link>
        </section>
      )}

      {solapa === 'recursos' && (
        <section data-testid="panel-recursos">
          <Dato clave="Dotación prevista" valor={nodo.dotacion_prevista} falta="sin declarar" />
          <Dato clave="Tope del frente" valor={nodo.tope_frente ? `${nodo.tope_frente} personas` : null}
            falta="sin declarar" />
          <Dato clave="Cuadrilla" valor={nodo.responsable} falta="sin asignar" />
          {nodo.tope_frente !== null && nodo.dotacion_prevista !== null
            && nodo.dotacion_prevista >= nodo.tope_frente && (
            <p className="mt-2 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn">
              Tope del frente: {nodo.tope_frente} personas. Más gente no acorta el plazo.
            </p>
          )}
          <BloqueHH plan={nodo.hh_plan} real={nodo.hh_real} avance={nodo.avance_pct} />
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            La duración se calcula con el análisis de la base maestra, la jornada y el calendario de
            la obra. Esta actividad todavía no tiene análisis vinculado, así que no hay duración que
            mostrar — no es cero días.
          </p>
        </section>
      )}

      {solapa === 'dependencias' && (
        <section data-testid="panel-dependencias">
          <Titulo>Antes de esto</Titulo>
          {antes.length === 0
            ? <p className="text-[12.5px] text-muted">Nadie declaró qué tiene que pasar antes.</p>
            : <ul>{antes.map((r) => (
                <li key={r.id} className="border-b border-[#EFEEEA] py-1.5 last:border-0">
                  <span className="text-[12.5px] text-ink-soft">{r.origen}</span>
                  <span className="block text-[11px] text-muted">{r.relacion}</span>
                </li>))}</ul>}
          <div className="mt-3">
            <Titulo>Después de esto</Titulo>
            {despues.length === 0
              ? <p className="text-[12.5px] text-muted">Nada depende de esta actividad todavía.</p>
              : <ul>{despues.map((r) => (
                  <li key={r.id} className="border-b border-[#EFEEEA] py-1.5 last:border-0">
                    <span className="text-[12.5px] text-ink-soft">{r.destino}</span>
                    <span className="block text-[11px] text-muted">{r.relacion}</span>
                  </li>))}</ul>}
          </div>
          {/* SIN PRECEDENCIAS NO HAY CAMINO CRÍTICO. Deducirlo de las fechas sería inventar una
              secuencia: dos actividades consecutivas pueden serlo sólo porque comparten cuadrilla. */}
          {antes.length === 0 && despues.length === 0 && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              Sin una sola precedencia declarada en la obra no hay camino crítico que calcular, y por
              eso ninguna actividad se muestra como crítica.
            </p>
          )}
          <Link href={`/obras/${obraId}?vista=cronograma&sub=gantt&act=${nodo.id}`}
            className="mt-3 inline-block text-[12.5px] font-medium text-ink hover:underline">Vincular</Link>
        </section>
      )}

      {solapa === 'subcontrato' && (
        <section data-testid="panel-subcontrato">
          {nodo.es_subcontrato ? (
            <>
              <Dato clave="Ejecuta" valor={nodo.responsable} />
              <p className="mt-2 text-[12.5px] text-muted">El avance de un paquete lo firma el jefe de obra.</p>
            </>
          ) : (
            <p className="text-[12.5px] text-muted">Se ejecuta con personal propio.</p>
          )}
        </section>
      )}

      {solapa === 'rendimiento' && (
        <section data-testid="panel-rendimiento">
          <Dato clave="Teórico (tabla)" valor={null} falta="sin análisis" />
          <Dato clave="Presupuestado" valor={null} falta="sin análisis" />
          <Dato clave="Real observado"
            valor={nodo.hh_real !== null && nodo.cantidad_ejecutada
              ? (Number(nodo.hh_real) / Number(nodo.cantidad_ejecutada)).toLocaleString('es-AR', { maximumFractionDigits: 2 })
              : null}
            falta="sin base" />
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            El rendimiento real necesita producción física Y horas imputadas. Con una sola de las dos
            no hay rendimiento: hay una de las dos puntas.
          </p>
        </section>
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
