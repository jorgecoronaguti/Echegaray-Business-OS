'use client'

import { useMemo, useState, useTransition } from 'react'
import { Aviso, Boton, ErrorCampo, Nulo } from '@/shared/components/ds'
import {
  ausenciasSinJornada, avisoDeFaltantes, casillasIniciales, estadoDeCasilla, hs, loQueViaja,
  ponerLaJornada, resumenJornada,
} from '@/features/administracion/services/jornadaPorObra'
import type { CasillaJornada, FilaJornada } from '@/features/administracion/services/jornadaPorObra'
import { guardarJornada } from '@/features/administracion/services/jornadaPorObraActions'
import { motivosDeDiaNoTrabajado } from '@/features/administracion/services/motivoDeAusencia'

// CARGAR ASISTENCIA — una obra, un día, las horas de cada uno.
//
// ═══ VIVE ACÁ Y NO EN `/campo` PORQUE LO USAN DOS PRODUCTOS (08/09/2026) ═══
//
// Nació dentro de `src/app/campo/asistencia/`, que es la pantalla del jefe en la obra. El dueño
// probó la carga desde el teléfono con su usuario de Administración y encontró la grilla de
// quincena de escritorio: la experiencia de teléfono existía y ningún rol de adentro llegaba a
// ella. La alternativa era copiar el formulario a Administración; se descartó porque la casilla que
// nace vacía, el catálogo de motivos y `loQueViaja` son UNA regla, y dos copias de una regla se
// desincronizan el día que alguien arregla sólo una — que es exactamente el defecto que costó el
// revert de las 77,4 HH. Sus servicios ya vivían en `features/administracion/services/`; ahora el
// componente vive al lado, y `/campo/asistencia` lo importa desde acá.
//
// ═══ LA CASILLA NACE VACÍA. ESTO NO ES UN DETALLE: ES EL DEFECTO QUE COSTÓ UN REVERT ═══
//
// La primera versión la hacía nacer con la jornada puesta como VALOR, para cumplir «se abre y se
// guarda sin tocar nada si el día fue normal». El resultado fue que `sin_marcar` se volvió
// inalcanzable, toda fila nacía «presente», y UN toque en Guardar escribió 77,4 HH de nueve
// personas en una obra viva. La intención del diseño era buena y la implementación fabricaba datos.
//
// Ahora la jornada se ofrece de dos formas que NO son una afirmación: como `placeholder` en gris
// dentro de la casilla, y como un botón —«poner la jornada»— que la carga en las vacías. El día
// normal cuesta UN toque en vez de cero, y a cambio ninguna hora entra sin que alguien la ponga.
//
// Toda la decisión vive en `jornadaPorObra.ts` con sus pruebas: `casillasIniciales`,
// `estadoDeCasilla`, `loQueViaja`, `ponerLaJornada`. Un comentario no es un control; esas sí.
//
// ═══ ACÁ NO HAY NADA MÁS ═══
//
// Ni foto, ni tarea, ni actividad, ni plata: el jefe de obra no ve el valor hora.

/** Lo que ya tiene esa persona cargado ESE día en otra obra. Sin esto, dos jefes cargan la jornada
 *  de la misma persona el mismo día y quedan 17,6 hs repartidas entre dos obras. */
export type FilaConOtraObra = FilaJornada & { enOtraObra?: { obra: string; horas: number } | null }

export function FormAsistencia({ obraId, obraNombre, fecha, jornada, filas }: {
  obraId: string
  obraNombre: string
  fecha: string
  jornada: number
  filas: FilaConOtraObra[]
}) {
  const [casillas, setCasillas] = useState<Record<string, CasillaJornada>>(() => casillasIniciales(filas))
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendiente, arrancar] = useTransition()
  // El catálogo es el mismo que usa el bot de Mattermost desde julio. No es una lista de esta
  // pantalla: si fuera, discreparía con la del bot el día que alguien agregue un motivo.
  const motivos = useMemo(() => motivosDeDiaNoTrabajado(), [])

  const vista = useMemo(
    () => filas.map((f) => estadoDeCasilla(f.persona.persona_id, casillas[f.persona.persona_id])),
    [filas, casillas],
  )
  const porPersona = new Map(vista.map((v) => [v.persona_id, v]))

  const resumen = resumenJornada(filas.map((f) => {
    const v = porPersona.get(f.persona.persona_id)
    return {
      ...f,
      estado: v?.estado ?? 'sin_marcar',
      horas: v?.estado === 'presente' ? v.horas : v?.estado === 'ausente' ? 0 : null,
    }
  }))
  const falta = avisoDeFaltantes(resumen.faltan)
  const conError = vista.find((v) => v.error)
  const sinJornada = ausenciasSinJornada(vista, jornada)

  const cambiar = (id: string, cambio: Partial<CasillaJornada>) => {
    setResultado(null)
    setCasillas((prev) => ({ ...prev, [id]: { ...prev[id], ...cambio } }))
  }

  const guardar = () => {
    const marcas = loQueViaja(vista, jornada)
    if (marcas.length === 0) {
      setResultado({
        ok: false,
        texto: sinJornada.length > 0
          ? 'Esta obra no tiene jornada pactada, así que una ausencia no se puede medir en horas. Cargala en la obra antes de marcar que alguien no vino.'
          : 'No marcaste a nadie todavía. Poné las horas o tocá «poner la jornada».',
      })
      return
    }
    arrancar(async () => {
      const r = await guardarJornada({ obra_id: obraId, fecha, marcas })
      setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error })
    })
  }

  if (filas.length === 0) {
    return (
      <Aviso tono="warn" titulo={`Nadie está asignado a ${obraNombre}.`}>
        La asistencia se carga sobre el personal asignado a la obra. Las asignaciones las hace
        Administración, desde Personal de la obra.
      </Aviso>
    )
  }

  return (
    <div data-testid="form-asistencia">
      <div className="mb-2 flex items-end justify-between gap-3">
        {/* EL DÍA NORMAL, EN UN TOQUE. Es lo que reemplaza al default que fabricaba horas: sigue
            siendo un gesto solo, pero es un gesto — no el estado inicial de la pantalla. */}
        <button
          type="button"
          onClick={() => { setResultado(null); setCasillas((c) => ponerLaJornada(c, jornada)) }}
          disabled={jornada <= 0}
          data-testid="poner-jornada"
          className="min-h-[36px] rounded-[6px] border border-line px-3 text-[12.5px] text-ink disabled:text-faint"
        >
          {jornada > 0 ? `Poner ${hs(jornada)} a los que faltan` : 'Sin jornada pactada'}
        </button>
        <span className="flex gap-3 text-[11px] uppercase tracking-[0.06em] text-faint">
          <span className="w-[64px] text-center">Horas</span>
          <span className="w-[44px] text-center">No vino</span>
        </span>
      </div>

      <ul className="border-t border-line">
        {filas.map((fila) => {
          const id = fila.persona.persona_id
          const v = porPersona.get(id)
          const ausente = v?.estado === 'ausente'
          const marcada = v?.estado === 'presente'
          return (
            <li key={id} className="border-b border-line py-2" data-testid="fila-asistencia" data-estado={v?.estado}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-ink">{fila.persona.nombre}</p>
                  {(fila.persona.nota ?? fila.observacion) && (
                    <p className="truncate text-[12px] text-muted">
                      {[fila.persona.nota, fila.observacion].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {/* YA TIENE EL DÍA EN OTRA OBRA. Dos personas del plantel están asignadas a dos
                      obras a la vez: sin este renglón, cada jefe cargaba su jornada completa y la
                      persona terminaba con 17,6 hs el mismo día, repartidas, sin un solo aviso. */}
                  {fila.enOtraObra && (
                    <p className="truncate text-[12px] text-[#B54708]" data-testid="ya-en-otra-obra">
                      ya tiene {hs(fila.enOtraObra.horas)} hs ese día en {fila.enOtraObra.obra}
                    </p>
                  )}
                </div>

                <input
                  aria-label={`Horas de ${fila.persona.nombre}`}
                  data-testid="horas"
                  inputMode="decimal"
                  disabled={ausente}
                  // EL PLACEHOLDER NO ES UN VALOR: se ve en gris, se puede guardar sin tocarlo y no
                  // viaja. Es la sugerencia que el diseño pedía, sin la afirmación que fabricaba.
                  placeholder={jornada > 0 ? hs(jornada) : ''}
                  value={ausente ? '' : (casillas[id]?.texto ?? '')}
                  onChange={(e) => cambiar(id, { texto: e.target.value, ausente: false })}
                  className="h-[44px] w-[64px] rounded-[6px] border text-center text-[16px] font-medium text-ink placeholder:font-normal placeholder:text-[#C4C2BB]"
                  style={{
                    background: ausente ? '#F1F0EC' : marcada ? '#FDC900' : '#FFFFFF',
                    borderColor: ausente ? '#E7E6E2' : marcada ? '#FDC900' : '#F0D98A',
                  }}
                />

                <button
                  type="button"
                  aria-label={`${fila.persona.nombre} no vino`}
                  aria-pressed={ausente}
                  data-testid="ausente"
                  onClick={() => cambiar(id, { ausente: !ausente, texto: '' })}
                  className="h-[44px] w-[44px] rounded-[6px] border text-[15px] font-semibold"
                  style={{
                    background: ausente ? '#1F1F1E' : 'transparent',
                    color: ausente ? '#FFFFFF' : '#91918B',
                    borderColor: ausente ? '#1F1F1E' : '#E7E6E2',
                  }}
                >
                  A
                </button>
              </div>
              {v?.error && <ErrorCampo>{v.error}</ErrorCampo>}
              {/* EL SEGUNDO TOQUE: por qué no vino. Aparece SÓLO cuando ya se marcó la ausencia y
                  no es obligatorio — marcar que alguien faltó sin saber todavía por qué es
                  honesto; exigir la causa para poder guardar hace que se elija cualquiera. */}
              {ausente && (
                <select
                  aria-label={`Por qué no vino ${fila.persona.nombre}`}
                  data-testid="motivo"
                  value={casillas[id]?.motivo ?? ''}
                  onChange={(e) => cambiar(id, { motivo: e.target.value || null })}
                  className="mt-2 h-[44px] w-full rounded-[6px] border border-line px-2 text-[13px] text-ink"
                >
                  <option value="">¿Por qué no vino? (se puede cargar después)</option>
                  {motivos.map((m) => (
                    <option key={m.clave} value={m.clave}>
                      {m.etiqueta}{m.tipo === 'licencia' ? ' · licencia' : ''}
                    </option>
                  ))}
                </select>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 space-y-2">
        <p className="text-[13px] text-ink" data-testid="pie-jornada">
          {resumen.presentes} {resumen.presentes === 1 ? 'presente' : 'presentes'}
          {' · '}{resumen.ausentes} no {resumen.ausentes === 1 ? 'vino' : 'vinieron'}
          {' · '}{hs(resumen.horas)} hs
        </p>
        {falta && (
          <p className="text-[12.5px] font-medium text-[#B4231F]" data-testid="falta-marcar">{falta}</p>
        )}
        {sinJornada.length > 0 && (
          <p className="text-[12.5px] text-[#B54708]" data-testid="ausencia-sin-jornada">
            Esta obra no tiene jornada pactada: una ausencia no se puede medir en horas y no se va a
            registrar. Se carga en la obra.
          </p>
        )}
        {resultado && (
          <Aviso tono={resultado.ok ? 'info' : 'neg'} testid="acuse-jornada">{resultado.texto}</Aviso>
        )}
        <Boton
          type="button"
          variante="primaria"
          tamano="bloque"
          disabled={pendiente || Boolean(conError)}
          onClick={guardar}
          data-testid="guardar-dia"
        >
          {pendiente ? 'Guardando…' : 'Guardar el día'}
        </Boton>
        <p className="text-center text-[11px] text-faint">
          <Nulo>Se guarda sólo lo marcado. Lo que quede en blanco no se toca.</Nulo>
        </p>
      </div>
    </div>
  )
}
