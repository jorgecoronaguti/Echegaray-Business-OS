'use client'

// PANTALLA 17 · LA LISTA DE TAREAS TIPO Y SU SELECCIÓN.
//
// Es de cliente por una sola razón: el buscador filtra MIENTRAS SE ESCRIBE. Las 223 filas ya
// vinieron del servidor en la carga —caben de sobra en una respuesta— así que teclear no vuelve a
// consultar la base ni parpadea.
//
// LA SELECCIÓN VIVE EN LA URL (`?t=<id>`), no en un `useState`. Un enlace a una tarea tipo abierta
// se pega en un mensaje y abre en esa tarea; con estado local, todas las tareas compartirían la
// misma dirección.
//
// ═══ LAS DIRECCIONES SE ARMAN ACÁ, Y NO LLEGAN COMO FUNCIONES ═══
//
// Costó media hora encontrarlo. Este componente recibía `hrefDe` y `hrefDivision`, dos funciones que
// la página le pasaba. **Una función no cruza la frontera servidor→cliente**: la serialización del
// árbol falla, y como el documento ya salió con 200, lo que ve el usuario es la pantalla clavada en
// el esqueleto de carga PARA SIEMPRE — sin error en la consola y sin error en el servidor.
//
// El modo de falla es el peor: los registros dicen `200 in 3.5s` y la pantalla no aparece nunca.
// Por eso lo que cruza son DATOS —la ruta y los parámetros— y el armado de la dirección vive de este
// lado, que además es donde se puede leer qué preserva cada enlace.

import { useState } from 'react'
import Link from 'next/link'
import { Tabla, THead, Th, Tr, Td, Vacio, Filtros } from '@/shared/components/ds'
import { IconoProblema } from '@/shared/components/iconos'
import type { TareaTipoFila } from '../types'
import { filtrar, motivoDelEstado } from '../services/reglas'
import { BuscadorVivo } from './BuscadorVivo'
import { EsfuerzoObservado, EstadoAnalisisCelda, N } from './celdas'

// LOS TRES CORTES QUE SE MIRAN DE VERDAD, Y NINGUNO ES UN UMBRAL DE PANTALLA.
//
// «Con recomendación» pregunta por `hs_recomendado`, que lo decide el motor de aprendizaje en
// Postgres: es la única lista que se puede trabajar, porque cada fila tiene una decisión concreta
// esperando. Un filtro «con desvío» calculado acá con un umbral propio traería tareas sobre las que
// no hay nada que hacer —muestra de una obra— y las mezclaría con las que sí.
const CORTES = {
  todo: { rotulo: 'Todo', cumple: () => true },
  recomendacion: { rotulo: 'Con recomendación', cumple: (t: TareaTipoFila) => t.hs_recomendado != null },
  sinMedir: { rotulo: 'Sin medir', cumple: (t: TareaTipoFila) => t.muestra === 0 },
  sinAnalisis: { rotulo: 'Sin análisis', cumple: (t: TareaTipoFila) => t.estado === 'sin_analisis' },
} as const
type Corte = keyof typeof CORTES

export function TareasTipo({
  tareas,
  q,
  division,
  divisiones,
  seleccionada,
  ruta,
  otros,
}: {
  tareas: TareaTipoFila[]
  q: string
  division: string | null
  divisiones: string[]
  seleccionada: string | null
  /** La ruta y lo que hay que preservar al buscar. Llegan del servidor: ver `BuscadorVivo`. */
  ruta: string
  otros: Record<string, string | undefined>
}) {
  const [consulta, setConsulta] = useState(q)
  const [corte, setCorte] = useState<Corte>('todo')

  // El filtro de división lo aplica el SERVIDOR (viaja en la URL y recorta la lectura); la consulta
  // de texto y el corte los aplica el navegador, que es lo que los hace instantáneos.
  const visibles = filtrar(tareas, consulta, (t) => [t.codigo, t.nombre, t.division, t.unidad])
    .filter(CORTES[corte].cumple)

  /** Una dirección de esta pantalla con algunos parámetros cambiados. `undefined` los quita. */
  const href = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...otros, q: consulta || undefined, ...cambios })) {
      if (v) p.set(k, v)
    }
    const qs = p.toString()
    return qs ? `${ruta}?${qs}` : ruta
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <BuscadorVivo
          valor={consulta}
          onCambio={setConsulta}
          placeholder="Buscar tarea, código o rubro"
          resultados={visibles.length}
          total={tareas.length}
          testid="buscador-tareas"
        />
        <Filtros
          testid="filtros-division"
          opciones={[
            { label: 'Todos', href: href({ d: undefined }), activo: !division, testid: 'division-todos' },
            ...divisiones.map((d) => ({
              label: d, href: href({ d }), activo: d === division, testid: `division-${d}`,
            })),
          ]}
        />
        {/* El corte NO va a la URL: se calcula sobre las filas que ya están en el navegador y su
            resultado depende de lo que la base diga en este momento, así que un enlace compartido
            prometería una lista que mañana es otra. La división sí va, porque recorta la lectura. */}
        <Filtros
          testid="filtros-corte"
          opciones={(Object.keys(CORTES) as Corte[]).map((k) => ({
            label: (
              <span className="inline-flex items-center gap-1.5">
                {CORTES[k].rotulo}
                <span className="font-mono text-[11px] tabular-nums text-faint">
                  {tareas.filter(CORTES[k].cumple).length}
                </span>
              </span>
            ),
            onClick: () => setCorte(k),
            activo: corte === k,
            testid: `corte-${k}`,
          }))}
        />
      </div>

      {visibles.length === 0 ? (
        <Vacio
          accion={
            consulta || corte !== 'todo' ? (
              <button
                type="button"
                onClick={() => { setConsulta(''); setCorte('todo') }}
                className="text-[13px] font-medium text-ink underline"
              >
                Ver todo
              </button>
            ) : undefined
          }
        >
          {vacioDe(consulta, corte, division, tareas.length)}
        </Vacio>
      ) : (
        <Tabla testid="tabla-tareas-tipo" minWidth={720}>
          <THead>
            <Th className="w-[86px]">Código</Th>
            <Th>Tarea tipo</Th>
            <Th className="w-[56px]">Un.</Th>
            {/* ESFUERZO Y NO «RENDIMIENTO»: son hs por unidad, y bajan cuando la tarea mejora.
                La unidad queda en el rótulo porque una columna de números sin magnitud declarada
                se lee al revés. */}
            <Th num className="w-[82px]">Esfuerzo hs/un.</Th>
            {/* LA COLUMNA QUE FALTABA. `hs_observado` ya se leía en el servicio y no se pintaba en
                ninguna parte: la lista mostraba con qué se cotiza y escondía qué pasó de verdad,
                que es la mitad que convierte a esta pantalla en base de aprendizaje. */}
            <Th num className="w-[124px]">Real de obra</Th>
            <Th className="w-[118px]">Análisis</Th>
          </THead>
          <tbody>
            {visibles.map((t) => (
              <Tr key={t.id} seleccionada={t.id === seleccionada} data-testid={`tarea-${t.codigo}`}>
                <Td className="font-mono text-[11.5px] text-muted">{t.codigo}</Td>
                <Td fuerte>
                  <span className="flex min-w-0 items-center gap-2">
                    {/* Abrir otra tarea limpia la solapa: la de la anterior puede no existir acá. */}
                    <Link href={href({ t: t.id, s: undefined })} scroll={false} className="min-w-0 truncate hover:underline">
                      {t.nombre}
                    </Link>
                    {/* EL AVISO LO DISPARA EL MOTOR, NO LA PANTALLA: hay una recomendación esperando
                        decisión. Sin `hs_recomendado` no hay nada que hacer con esta fila, y un
                        triángulo sobre una tarea sobre la que no se puede actuar es ruido. */}
                    {t.hs_recomendado != null && (
                      <span
                        title="El real de obra propone otro esfuerzo: hay una recomendación sin decidir"
                        className="shrink-0 text-warn"
                        data-testid="aviso-recomendacion"
                      >
                        <IconoProblema className="h-[13px] w-[13px]" />
                      </span>
                    )}
                  </span>
                </Td>
                <Td className="text-[12px]">{t.unidad}</Td>
                <Td num>
                  {/* «sin dato» y no 0: una tarea sin esfuerzo cargado aporta 0 HH al plan, que es
                      la afirmación de que no lleva mano de obra. */}
                  <N v={t.hs_unitarias} decimales={2} falta="sin dato" />
                </Td>
                <Td num>
                  <EsfuerzoObservado base={t.hs_unitarias} observado={t.hs_observado} />
                </Td>
                <Td>
                  <EstadoAnalisisCelda estado={t.estado} titulo={motivoDelEstado(t.estado, t.falta)} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <Pie tareas={tareas} visibles={visibles.length} />
    </div>
  )
}

function vacioDe(consulta: string, corte: Corte, division: string | null, total: number): string {
  if (consulta) return `Nada coincide con «${consulta}».`
  if (corte !== 'todo') return `Ninguna tarea tipo queda en «${CORTES[corte].rotulo}».`
  if (division) return `No hay tareas tipo en «${division}».`
  if (total === 0) {
    return 'La base maestra todavía no tiene tareas tipo cargadas. Se cargan al importar la Planilla para Cotizar.'
  }
  return 'No hay tareas tipo que mostrar.'
}

/**
 * EL PIE ES UN MARCADOR, NO UNA FRASE. Cuatro cifras que dicen de qué tamaño es la deuda de la base
 * maestra: cuántas tareas hay, cuántas se midieron alguna vez, cuántas tienen una decisión esperando
 * y cuántas no aportan HH a ningún presupuesto. Las tres últimas se cuentan sobre el TOTAL y no
 * sobre lo visible: son el estado de la base, no el de la búsqueda de este momento.
 */
function Pie({ tareas, visibles }: { tareas: TareaTipoFila[]; visibles: number }) {
  const cifras: [string, number, string][] = [
    ['Tareas tipo', tareas.length, 'text-ink'],
    ['Medidas en obra', tareas.filter((t) => t.muestra > 0).length, 'text-ink'],
    ['Con recomendación', tareas.filter((t) => t.hs_recomendado != null).length, 'text-warn'],
    ['Sin análisis', tareas.filter((t) => t.estado === 'sin_analisis').length, 'text-warn'],
  ]
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1" data-testid="pie-tareas">
      {visibles !== tareas.length && (
        <span className="mr-auto text-[11px] text-faint">
          <span className="font-mono tabular-nums">{visibles}</span> de{' '}
          <span className="font-mono tabular-nums">{tareas.length}</span> en pantalla
        </span>
      )}
      {cifras.map(([rotulo, n, color]) => (
        <span key={rotulo} className="text-[11px] text-faint">
          {rotulo}{' '}
          <span className={`font-mono text-[12px] tabular-nums ${n === 0 ? 'text-faint' : color}`}>{n}</span>
        </span>
      ))}
    </div>
  )
}
