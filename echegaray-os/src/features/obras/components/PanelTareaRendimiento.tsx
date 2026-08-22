// 04 · SOLAPA RENDIMIENTO — el mismo número en cinco momentos, uno debajo del otro.
//
// ═══ ACÁ NO SE ACEPTA NI SE VERSIONA NADA ═══
//
// El contrato visual dibuja «Aceptar y versionar» al lado de la recomendación. Ese botón NO va acá:
// aceptar una recomendación crea una VERSIÓN NUEVA del análisis de la base maestra, con autor, fecha
// y muestra, y esa decisión es de la tarea tipo —que cotiza TODAS las obras— y no de la actividad
// que se está mirando. Vive en la ficha 17, que es la única pantalla que puede mostrar contra qué se
// está cambiando. Desde acá se va hasta ahí, y nada más.
//
// Un sistema que se recalibra solo con la última obra medida termina cotizando con el rendimiento de
// la obra más rara que hizo.

import Link from 'next/link'
import { cadenaDeRendimiento } from '../services/panelTarea'
import type { NodoObra } from '../services/wbs'
import type { ContextoTarea } from '../services/panelTareaService'

const n2 = (v: number | null) =>
  (v == null ? null : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export function PanelTareaRendimiento({ nodo, contexto }: {
  nodo: NodoObra
  contexto: ContextoTarea
}) {
  const cadena = cadenaDeRendimiento({
    hsAnalisis: contexto.historico?.hsAnalisis ?? null,
    tieneTareaTipo: nodo.tarea_tipo_id !== null,
    hsPresupuestada: contexto.partida?.hsUnitarias ?? null,
    vieneDeUnaPartida: nodo.cotizacion_partida_id !== null,
    puedeVerPartida: contexto.puedeVerPartida,
    hhPlan: nodo.hh_plan,
    cantidadObjetivo: nodo.cantidad_objetivo,
    hhReal: nodo.hh_real,
    cantidadEjecutada: nodo.cantidad_ejecutada,
    historico: contexto.historico
      ? {
          mediana: contexto.historico.mediana,
          muestra: contexto.historico.muestra,
          obras: contexto.historico.obras,
          lectura: contexto.historico.lectura,
        }
      : null,
  })

  return (
    <section data-testid="panel-rendimiento">
      <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink">
        Rendimiento en hs{nodo.unidad ? `/${nodo.unidad}` : ' por unidad'}
      </h3>
      <ul data-testid="cadena-rendimiento">
        {cadena.map((e) => (
          <li key={e.clave} className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
            <span className={`min-w-0 text-[12px] ${e.destacado ? 'text-ink' : 'text-ink-soft'}`}>
              {e.clave}
              <span className="block text-[10.5px] text-faint">{e.fuente}</span>
            </span>
            <span className={`shrink-0 text-right font-mono text-[12.5px] tabular-nums ${
              e.valor == null ? 'text-faint' : (e.destacado ? 'font-semibold text-warn' : 'text-ink-soft')
            }`}>
              {n2(e.valor) ?? <span className="font-sans text-[11.5px]">{e.falta}</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* SIN LAS DOS PUNTAS NO HAY RENDIMIENTO REAL, y decirlo importa: es la fila que decide si la
          obra está aprendiendo algo o sólo consumiendo horas. */}
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        El rendimiento real necesita producción física Y horas imputadas. Con una sola de las dos no
        hay rendimiento: hay una de las dos puntas.
      </p>

      {nodo.tarea_tipo_id
        ? (
          <Link href={`/administracion/base-maestra/tareas?t=${nodo.tarea_tipo_id}`}
            data-testid="ver-en-base-maestra"
            className="mt-2 inline-block text-[12.5px] font-medium text-ink hover:underline">
            Ver en Base Maestra
          </Link>
        )
        : (
          <p className="mt-2 text-[11.5px] text-muted">
            Esta actividad no está vinculada a una tarea tipo, así que lo que pase acá no le enseña
            nada a la base maestra: el histórico se arma por tarea tipo, no por nombre.
          </p>
        )}
    </section>
  )
}
