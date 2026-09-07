'use client'

import { useMemo, useState, useTransition } from 'react'
import { Aviso, Boton, ErrorCampo, Nulo } from '@/shared/components/ds'
import {
  avisoDeFaltantes, leerHoras, resumenJornada,
} from '@/features/administracion/services/jornadaPorObra'
import type { FilaJornada } from '@/features/administracion/services/jornadaPorObra'
import { guardarJornada } from '@/features/administracion/services/jornadaPorObraActions'
import type { MarcaDeJornada } from '@/features/administracion/services/planDeJornada'

// CARGAR ASISTENCIA — una obra, un día, las horas de cada uno.
//
// ═══ LA JORNADA YA VIENE PUESTA ═══
//
// Se abre y se guarda sin tocar nada si el día fue normal. La casilla trae la jornada de la obra
// (`obra_canonica.jornada_horas`), y lo ya cargado le gana: reabrir el día muestra las 5 horas que
// se corrigieron, no la jornada completa.
//
// ═══ UN NÚMERO, NO UNA CASILLA DE VERIFICACIÓN ═══
//
// González hizo 5 horas: se tipea 5. La unidad es la hora, y por eso el campo es numérico con
// teclado decimal, no un tilde de «vino / no vino» que después habría que traducir a horas.
//
// ═══ SIN MARCAR NO ES AUSENTE ═══
//
// Quien no se toca queda en ámbar y NO viaja en el envío. Un ausente es una decisión de alguien y se
// toma con la «A», que es un botón aparte. Convertir el silencio en un cero fabricaría una novedad
// de liquidación que nadie cargó.
//
// ═══ ACÁ NO HAY NADA MÁS ═══
//
// Ni foto, ni tarea, ni actividad, ni plata: el jefe de obra no ve el valor hora. Lo que no está es
// tan deliberado como lo que está.

type Estado = 'presente' | 'ausente' | 'sin_marcar'
type Marca = { estado: Estado; texto: string }

const AMARILLO = '#FDC900'

function inicial(filas: FilaJornada[]): Record<string, Marca> {
  const m: Record<string, Marca> = {}
  for (const f of filas) {
    m[f.persona.persona_id] = f.estado === 'ausente'
      ? { estado: 'ausente', texto: '' }
      // La casilla nace con la propuesta EN PANTALLA aunque nadie la haya tocado: eso es lo que
      // permite abrir y guardar sin tocar nada si el día fue normal.
      : { estado: f.estado, texto: String(f.propuesta || '') }
  }
  return m
}

export function FormAsistencia({ obraId, obraNombre, fecha, jornada, filas }: {
  obraId: string
  obraNombre: string
  fecha: string
  jornada: number
  filas: FilaJornada[]
}) {
  const [marcas, setMarcas] = useState<Record<string, Marca>>(() => inicial(filas))
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendiente, arrancar] = useTransition()

  const vista = useMemo(() => filas.map((f) => {
    const m = marcas[f.persona.persona_id]
    const { horas, error } = leerHoras(m?.texto ?? '')
    const estado: Estado = m?.estado === 'ausente'
      ? 'ausente'
      : horas === null ? 'sin_marcar' : 'presente'
    return { fila: f, estado, horas, error }
  }), [filas, marcas])

  const resumen = resumenJornada(vista.map(({ fila, estado, horas }) => ({
    ...fila, estado, horas: estado === 'presente' ? horas : estado === 'ausente' ? 0 : null,
  })))
  const falta = avisoDeFaltantes(resumen.faltan)
  const conError = vista.find((v) => v.error)

  const cambiar = (id: string, cambio: Partial<Marca>) => {
    setResultado(null)
    setMarcas((prev) => ({ ...prev, [id]: { ...prev[id], ...cambio } }))
  }

  const guardar = () => {
    const paraEnviar = vista.flatMap<MarcaDeJornada>(({ fila, estado, horas }) => {
      const id = fila.persona.persona_id
      if (estado === 'ausente') {
        // La ausencia se guarda con las horas de la jornada, NO con cero: `registros_hh` exige
        // horas > 0, y `tipo_hora='ausencia'` es lo que hace que no cuenten como trabajo.
        return jornada > 0 ? [{ persona_id: id, estado: 'ausente' as const, horas: jornada }] : []
      }
      return estado === 'presente' && horas !== null
        ? [{ persona_id: id, estado: 'presente' as const, horas }]
        : []
    })
    if (paraEnviar.length === 0) {
      setResultado({ ok: false, texto: 'No marcaste a nadie todavía.' })
      return
    }
    arrancar(async () => {
      const r = await guardarJornada({ obra_id: obraId, fecha, marcas: paraEnviar })
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
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-faint">
        <span>Persona</span>
        <span className="flex gap-3">
          <span className="w-[64px] text-center">Horas</span>
          <span className="w-[44px] text-center">No vino</span>
        </span>
      </div>

      <ul className="border-t border-line">
        {vista.map(({ fila, estado, error }) => {
          const id = fila.persona.persona_id
          const ausente = estado === 'ausente'
          return (
            <li key={id} className="border-b border-line py-2" data-testid="fila-asistencia" data-estado={estado}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-ink">{fila.persona.nombre}</p>
                  {/* La nota gris del diseño: el rol o la categoría, y la observación si la hay. Sale
                      del dato — no se inventa un «capataz» que la asignación no dice. */}
                  {(fila.persona.nota ?? fila.observacion) && (
                    <p className="truncate text-[12px] text-muted">
                      {[fila.persona.nota, fila.observacion].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                <input
                  aria-label={`Horas de ${fila.persona.nombre}`}
                  data-testid="horas"
                  inputMode="decimal"
                  disabled={ausente}
                  value={ausente ? '' : (marcas[id]?.texto ?? '')}
                  onChange={(e) => cambiar(id, { texto: e.target.value, estado: 'presente' })}
                  className="h-[44px] w-[64px] rounded-[6px] border text-center text-[16px] font-medium text-ink"
                  style={{
                    // Amarillo = la casilla está puesta. Ámbar tenue = sin marcar, que es lo que el
                    // pie reclama. Gris = ausente, y ahí no hay número que tipear.
                    background: ausente ? '#F1F0EC' : estado === 'presente' ? AMARILLO : '#FFF6D6',
                    borderColor: ausente ? '#E7E6E2' : estado === 'presente' ? AMARILLO : '#F0D98A',
                  }}
                />

                <button
                  type="button"
                  aria-label={`${fila.persona.nombre} no vino`}
                  aria-pressed={ausente}
                  data-testid="ausente"
                  onClick={() => cambiar(id, ausente
                    ? { estado: 'presente', texto: String(jornada || '') }
                    : { estado: 'ausente', texto: '' })}
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
              {error && <ErrorCampo>{error}</ErrorCampo>}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 space-y-2">
        <p className="text-[13px] text-ink" data-testid="pie-jornada">
          {resumen.presentes} {resumen.presentes === 1 ? 'presente' : 'presentes'}
          {' · '}{resumen.ausentes} no {resumen.ausentes === 1 ? 'vino' : 'vinieron'}
          {' · '}{resumen.horas} hs
        </p>
        {falta && (
          <p className="text-[12.5px] font-medium text-[#B4231F]" data-testid="falta-marcar">{falta}</p>
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
          <Nulo>Sin conexión no hay cola: si falla, te lo dice.</Nulo>
        </p>
      </div>
    </div>
  )
}
