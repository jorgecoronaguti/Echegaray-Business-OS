'use client'

// 04 · SOLAPA ESFUERZO — el mismo número en cinco momentos, uno debajo del otro.
//
// LENGUAJE ERP OBRAS (24/09/2026): el 04 nombra la solapa pero no la dibuja. Se arma con el eyebrow
// mono del 04, filas `FilaDato` (clave con su fuente debajo, valor mono a la derecha) y la ausencia
// dicha con su palabra en itálica faint. «Real observado» se destaca por peso, no en ámbar: el ámbar
// es sólo para un problema, y un esfuerzo real no lo es por existir.
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
import { MAGNITUD } from '@/features/base-maestra/services/vocabulario'
import type { NodoObra } from '../services/wbs'
import type { ContextoTarea } from '../services/panelTareaService'
import type { VinculacionTarea } from '../services/vinculacionTareaService'
import type { AccionFormulario } from '@/shared/components/ui/FormAccion'
import { VincularEstandar } from './VincularEstandar'
import { Ico, P } from './canon/Ico'
import { ESTILO_ENLACE, Eyebrow, FilaDato, Nota } from './panel/PanelPiezas'

const n2 = (v: number | null) =>
  (v == null ? null : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export function PanelTareaRendimiento({ nodo, contexto, vinculacion, vincular, puedeEditar }: {
  nodo: NodoObra
  contexto: ContextoTarea
  /** El estado de vinculación con el motor de estándares y con qué resolverlo. */
  vinculacion: VinculacionTarea
  vincular: AccionFormulario
  puedeEditar: boolean
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
    <section data-testid="panel-rendimiento" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ESFUERZO, NO RENDIMIENTO: los cinco eslabones son hs/unidad y MEJORAN CUANDO BAJAN. Ver
          `features/base-maestra/services/vocabulario.ts`, que es donde viven las cuatro magnitudes
          y el porqué. La clave de la solapa sigue siendo `rendimiento`: viaja en la URL. */}
      <div>
        <Eyebrow>{MAGNITUD.esfuerzo.rotulo} en {MAGNITUD.esfuerzo.unidad(nodo.unidad)}</Eyebrow>
        <div data-testid="cadena-rendimiento">
          {cadena.map((e) => (
            <FilaDato key={e.clave} clave={e.clave} fuente={e.fuente} valor={n2(e.valor)} falta={e.falta}
              destacado={e.destacado} />
          ))}
        </div>
      </div>

      {/* SIN LAS DOS PUNTAS NO HAY ESFUERZO REAL, y decirlo importa: es la fila que decide si la
          obra está aprendiendo algo o sólo consumiendo horas. */}
      <Nota>El esfuerzo real necesita producción física y horas imputadas: con una sola hay una punta, no una medición.</Nota>

      {nodo.tarea_tipo_id
        ? (
          <Link href={`/administracion/base-maestra/tareas?t=${nodo.tarea_tipo_id}`} prefetch={false}
            data-testid="ver-en-base-maestra" style={ESTILO_ENLACE}>
            Ver en Base Maestra <Ico d={P.flecha} s={12} />
          </Link>
        )
        : (
          <Nota>
            Sin tarea tipo vinculada, lo que pase acá no le enseña nada a la base maestra: el histórico se arma
            por tarea tipo, no por nombre.
          </Nota>
        )}

      {/* HASTA EL 22/08/2026 ESTA FRASE NO TENÍA CÓMO RESOLVERSE. Decía el problema —las 350
          actividades importadas del tracker están sin vincular— y no ofrecía el gesto. */}
      <VincularEstandar vinculacion={vinculacion} vincular={vincular} puedeEditar={puedeEditar} />
    </section>
  )
}
