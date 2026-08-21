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
import type { TareaTipoFila } from '../types'
import { filtrar, motivoDelEstado } from '../services/reglas'
import { BuscadorVivo } from './BuscadorVivo'
import { EstadoAnalisisCelda, N } from './celdas'

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

  // El filtro de división lo aplica el SERVIDOR (viaja en la URL y recorta la lectura); la consulta
  // de texto la aplica el navegador, que es lo que la hace instantánea.
  const visibles = filtrar(tareas, consulta, (t) => [t.codigo, t.nombre, t.division, t.unidad])

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
      </div>

      {visibles.length === 0 ? (
        <Vacio
          accion={
            consulta ? (
              <button type="button" onClick={() => setConsulta('')} className="text-[13px] font-medium text-ink underline">
                Ver todo
              </button>
            ) : undefined
          }
        >
          {vacioDe(consulta, division, tareas.length)}
        </Vacio>
      ) : (
        <Tabla testid="tabla-tareas-tipo" minWidth={620}>
          <THead>
            <Th className="w-[86px]">Código</Th>
            <Th>Tarea tipo</Th>
            <Th className="w-[56px]">Un.</Th>
            <Th num className="w-[82px]">Hs/un.</Th>
            <Th className="w-[118px]">Análisis</Th>
          </THead>
          <tbody>
            {visibles.map((t) => (
              <Tr key={t.id} seleccionada={t.id === seleccionada} data-testid={`tarea-${t.codigo}`}>
                <Td className="font-mono text-[11.5px] text-muted">{t.codigo}</Td>
                <Td fuerte>
                  {/* Abrir otra tarea limpia la solapa: la de la anterior puede no existir acá. */}
                  <Link href={href({ t: t.id, s: undefined })} scroll={false} className="block hover:underline">
                    {t.nombre}
                  </Link>
                </Td>
                <Td className="text-[12px]">{t.unidad}</Td>
                <Td num>
                  {/* «sin dato» y no 0: una tarea sin rendimiento aporta 0 HH al plan, que es mentira. */}
                  <N v={t.hs_unitarias} decimales={2} falta="sin dato" />
                </Td>
                <Td>
                  <EstadoAnalisisCelda estado={t.estado} titulo={motivoDelEstado(t.estado, t.falta)} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <p className="mt-3 text-[11px] text-faint" data-testid="pie-tareas">
        {resumen(tareas, visibles.length)}
      </p>
    </div>
  )
}

function vacioDe(consulta: string, division: string | null, total: number): string {
  if (consulta) return `Nada coincide con «${consulta}».`
  if (division) return `No hay tareas tipo en «${division}».`
  if (total === 0) {
    return 'La base maestra todavía no tiene tareas tipo cargadas. Se cargan al importar la Planilla para Cotizar.'
  }
  return 'No hay tareas tipo que mostrar.'
}

function resumen(tareas: TareaTipoFila[], visibles: number): string {
  const sinAnalisis = tareas.filter((t) => t.estado === 'sin_analisis').length
  const sinRevisar = tareas.filter((t) => t.estado === 'sin_revisar').length
  const partes = [`${visibles} de ${tareas.length} tareas tipo`]
  if (sinAnalisis) partes.push(`${sinAnalisis} sin análisis`)
  if (sinRevisar) partes.push(`${sinRevisar} sin revisar`)
  return partes.join(' · ')
}
