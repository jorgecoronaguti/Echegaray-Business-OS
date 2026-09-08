'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso } from '@/shared/components/ds'
import { cambiarObraActual } from '@/features/administracion/services/obraActualActions'
import { filtrarCandidatos, type CandidatoParaTraer } from '@/features/administracion/services/traerALaObra'

// «TRAER A ALGUIEN A ESTA OBRA» — el gesto que faltaba en la carga del día, 08/09/2026 (tarde).
//
// El dueño, textual: *«al comenzar el día tengo que marcar la asistencia de las personas, pero ¿qué
// pasa si no modifiqué el lugar de trabajo? Tenés que habilitar a los jefes de obra a poder
// modificar las obras asignadas del personal»*.
//
// El jefe abre la pantalla a las 7, y en la cuadrilla falta el que anoche cambió de obra. Antes de
// esto había dos salidas: cargarle las horas en la obra equivocada, o no cargarlo. Las dos mienten.
//
// ═══ LISTA A PANTALLA COMPLETA, NO UN `<select>` NI UNA HOJA INFERIOR ═══
//
// El plantel son decenas de personas. Un `<select>` nativo con esa lista es una rueda de opciones de
// una línea, sin buscador y sin lugar para decir en qué obra está cada uno — que es el dato que
// decide si traerlo o no, porque traerlo se lo saca a otra obra. La hoja inferior se descartó por
// una razón medida en teléfonos, no estética: el buscador abre el teclado, y en 390×844 el teclado
// se come más de la mitad de la pantalla; una hoja a media altura queda con dos renglones visibles.
// A pantalla completa el teclado recorta la lista pero no la aplasta.
//
// Es UNA definición: si mañana la grilla de escritorio quiere el mismo gesto, importa este
// componente. Dos copias del mismo selector se desincronizan el día que una se arregla.
//
// ═══ TRAER NO MARCA ═══
//
// Esto llama a `cambiarObraActual` y a nada más. La persona aparece en la cuadrilla con la casilla
// VACÍA: es el mismo control que costó el revert de las 77,4 HH. Mover a alguien de obra es una
// afirmación sobre dónde trabaja; cuántas horas hizo la sigue poniendo una persona.
//
// ═══ EL ACUSE LO ESCRIBE LA ACCIÓN, NO LA PANTALLA ═══
//
// El «antes …» sale de `r.mensaje`, que nombra lo que la acción CERRÓ de verdad. Armarlo acá con la
// obra que la lista tenía cargada afirmaría un «antes» leído hace cinco minutos: si en el medio
// alguien lo movió, el acuse contaría una mudanza que no pasó.

export function TraerALaObra({ obraId, obraNombre, candidatos, error }: {
  obraId: string
  obraNombre: string
  candidatos: CandidatoParaTraer[]
  /** La lectura falló. NO se dibuja como «no hay a quién traer»: eso sería afirmar algo del plantel. */
  error: string | null
}) {
  const router = useRouter()
  const [abierta, setAbierta] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [acuse, setAcuse] = useState<{ ok: boolean; texto: string } | null>(null)
  const [trayendo, setTrayendo] = useState<string | null>(null)
  const [pendiente, arrancar] = useTransition()

  const lista = useMemo(() => filtrarCandidatos(candidatos, busqueda), [candidatos, busqueda])

  const traer = (c: CandidatoParaTraer) => {
    setAcuse(null)
    setTrayendo(c.id)
    arrancar(async () => {
      const r = await cambiarObraActual({ persona_id: c.id, obra_id: obraId })
      setTrayendo(null)
      if (!r.ok) {
        // EL ERROR SE QUEDA EN LA LISTA. Cerrarla dejaría el mensaje sin el contexto de a quién se
        // quiso traer, y el rechazo por rol es exactamente el que hay que poder leer entero.
        setAcuse({ ok: false, texto: r.error })
        return
      }
      setAcuse({ ok: true, texto: `${c.nombre} · ${r.mensaje}` })
      setAbierta(false)
      setBusqueda('')
      // SIN SALIR DE LA PANTALLA. El servidor vuelve a leer la cuadrilla y la persona aparece con su
      // casilla vacía; `FormAsistencia` le hace lugar con `sumarPersonasNuevas` sin pisar lo tipeado.
      router.refresh()
    })
  }

  return (
    <div className="mt-5" data-testid="traer-a-la-obra">
      <button
        type="button"
        onClick={() => { setAbierta(true); setAcuse(null) }}
        data-testid="abrir-traer"
        className="min-h-[48px] w-full rounded-[6px] border border-line px-3 text-[13px] text-ink"
      >
        Traer a alguien a esta obra
      </button>
      {/* EL ACUSE VIVE ACÁ, DEBAJO DEL BOTÓN Y ENCIMA DE LA CUADRILLA REFRESCADA: es donde mira el
          ojo después de cerrar la lista. Una línea, con quién y de dónde. */}
      {acuse && !abierta && (
        <div className="mt-2">
          <Aviso tono={acuse.ok ? 'info' : 'neg'} testid="acuse-traer">{acuse.texto}</Aviso>
        </div>
      )}

      {abierta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas" data-testid="lista-traer">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
              Traer a {obraNombre}
            </p>
            <button
              type="button"
              onClick={() => { setAbierta(false); setBusqueda('') }}
              data-testid="cerrar-traer"
              className="-mr-2 h-[44px] w-[44px] shrink-0 text-[13px] text-muted"
            >
              Cerrar
            </button>
          </div>

          <div className="px-4 pt-3">
            {/* SIN `autoFocus`. En el teléfono eso abre el teclado antes de que se vea un solo
                nombre, y en obra la lista corta se recorre con el pulgar más rápido que tipeando.
                El buscador está para cuando el plantel no entra en dos pantallazos. */}
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar una persona por nombre"
              data-testid="buscar-para-traer"
              className="h-[44px] w-full rounded-[6px] border border-line px-3 text-[16px] text-ink"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
            {error ? (
              <Aviso tono="neg" titulo="No pude leer el plantel">{error}</Aviso>
            ) : lista.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted" data-testid="traer-vacio">
                {candidatos.length === 0
                  ? 'Todo el plantel ya está en esta obra.'
                  : 'Nadie del plantel coincide con eso.'}
              </p>
            ) : (
              <ul className="border-t border-line">
                {lista.map((c) => (
                  <li key={c.id} className="border-b border-line">
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => traer(c)}
                      data-testid="candidato-traer"
                      data-persona={c.id}
                      className="flex min-h-[56px] w-full flex-col justify-center gap-0.5 py-2 text-left disabled:opacity-50"
                    >
                      <span className="truncate text-[15px] text-ink">{c.nombre}</span>
                      {/* DE DÓNDE VIENE, EN SU PROPIO RENGLÓN. Traerlo le CIERRA la asignación de
                          hoy: sin este rótulo, sacarle un oficial a otra obra activa se ve igual que
                          tomar a alguien que no está en ninguna. `null` dice «sin obra».

                          MEDIDO EN LA CAPTURA DE 390px DEL 08/09: al costado del nombre no entra.
                          Quien tiene DOS obras vigentes trae un rótulo de 60 caracteres —«(Quattropani
                          - SALÓN COMERCIAL y SF - ENTREPISO Y ESCALERA)»— y con los dos en la misma
                          línea el rótulo se quedaba con todo el ancho: DOS filas de la lista se
                          dibujaron sin nombre, sólo el paréntesis. Una fila sin nombre no se puede
                          elegir. */}
                      <span className="truncate text-[12px] text-faint" data-testid="obra-del-candidato">
                        {trayendo === c.id ? 'trayendo…' : `(${c.obraActual ?? 'sin obra'})`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {acuse && !acuse.ok && (
              <div className="mt-3">
                <Aviso tono="neg" testid="error-traer">{acuse.texto}</Aviso>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
