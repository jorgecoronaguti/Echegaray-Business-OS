import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getHorasPropias, getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { hh, resumen } from '@/features/mi-cuenta/services/horas'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { BloqueDato, Fila, Nada } from '@/features/empleado/components/Filas'
import { SelectorMes } from '@/features/empleado/components/SelectorMes'
import { getMiAsistencia } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { mesAnterior, mesDe, dm } from '@/features/empleado/services/fecha'
import { duracion, pendienteDeImputar, totalDelPeriodo } from '@/features/empleado/services/asistencia'

// «MIS HORAS» — las HH que la obra imputó a mi nombre, enfrentadas con mi presencia.
//
// ═══ LAS DOS PUNTAS, O NINGUNA ═══
//
// El handoff: «En Mis horas se enfrentan las dos puntas: Presencia registrada / HH imputadas a obra
// / Pendiente de imputar — y SÓLO SI EXISTEN AMBAS. Nunca se fabrica el faltante».
//
// Sin asistencia registrada, «pendiente de imputar: 148 h» acusaría a la obra de no imputar cuando
// lo que falta es la otra mitad del dato. Y al revés: sin HH imputadas, la presencia sola no dice
// que falte imputar nada — puede ser un día de lluvia. El bloque aparece cuando hay las dos.

export const dynamic = 'force-dynamic'

export default async function MisHorasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mis horas" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
        <SinVinculo que="tus horas" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const { ver } = await searchParams
  const cual: 'mes' | 'mes-pasado' = ver === 'mes-pasado' ? 'mes-pasado' : 'mes'
  const hoy = await hoyISO()
  const v = cual === 'mes-pasado' ? mesAnterior(hoy) : mesDe(hoy)

  const [horas, asistencia] = await Promise.all([
    getHorasPropias(supabase, v.desde, v.hasta),
    getMiAsistencia(supabase, v.desde, v.hasta),
  ])

  const r = resumen(horas.data ?? [], v.desde, v.hasta)
  const presencia = totalDelPeriodo(asistencia.data ?? [])
  const contraste = pendienteDeImputar(presencia.minutos, r.trabajadas)

  return (
    <PantallaEmpleado titulo="Mis horas" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
      {horas.error && <Aviso tono="neg" titulo="No se pudieron leer tus horas." testid="horas-error">{horas.error}</Aviso>}

      <SelectorMes base="/mi-informacion/horas" actual={cual} />

      <div className="mt-5" data-testid="resumen-horas">
        <p className="text-[11px] text-faint">Período</p>
        <p className="font-mono text-[12.5px] tabular-nums text-muted">{dm(v.desde)} – {dm(v.hasta)}/{v.hasta.slice(0, 4)}</p>
        {/* EL NÚMERO DE LA PANTALLA, como bloque de dato grande del Employee shell. Si la lectura
            falló va `null` y no «0,00»: un cero acá es una quincena sin trabajar que nadie vivió. */}
        <div className="mt-3">
          <BloqueDato
            etiqueta="HH imputadas"
            valor={horas.data ? hh(r.trabajadas) : null}
            falta="no se pudo leer"
            testid="hh-total"
          />
        </div>
        <p className="mt-1.5 text-[12px] text-faint">en {r.dias} {r.dias === 1 ? 'día' : 'días'}</p>

        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          {(Object.entries(r.porTipo) as [string, number][])
            .filter(([, n]) => n > 0)
            .map(([tipo, n]) => (
              <span key={tipo}>
                <span className="block text-[11px] text-faint">{tipo.replace(/_/g, ' ')}</span>
                <span className="font-mono text-[15px] tabular-nums text-ink">{hh(n)}</span>
              </span>
            ))}
          <span>
            <span className="block text-[11px] text-faint">Obras</span>
            <span className="font-mono text-[15px] tabular-nums text-ink">{r.obras.length}</span>
          </span>
        </div>
      </div>

      <Seccion titulo="PRESENCIA vs HH IMPUTADAS">
        {contraste ? (
          <div className="flex flex-wrap gap-x-8 gap-y-3" data-testid="presencia-vs-hh">
            <span>
              <span className="block text-[11px] text-faint">Presencia registrada</span>
              <span className="font-mono text-[15px] tabular-nums text-ink">{duracion(contraste.presencia)}</span>
            </span>
            <span>
              <span className="block text-[11px] text-faint">HH imputadas a obra</span>
              <span className="font-mono text-[15px] tabular-nums text-ink">{hh(contraste.imputadas)}</span>
            </span>
            <span>
              <span className="block text-[11px] text-faint">Pendiente de imputar</span>
              <span className={`font-mono text-[15px] tabular-nums ${contraste.pendiente > 0 ? 'text-warn' : 'text-ink'}`}>
                {contraste.pendiente >= 0 ? duracion(contraste.pendiente) : `−${duracion(-contraste.pendiente)}`}
              </span>
            </span>
          </div>
        ) : (
          <Nada testid="sin-contraste">
            {presencia.minutos === 0 && r.trabajadas === 0
              ? 'En este período no hay ni presencia registrada ni horas imputadas.'
              : presencia.minutos === 0
                ? 'Hay horas imputadas pero no registraste asistencia en este período: con una sola punta, el pendiente no se puede calcular sin inventarlo.'
                : 'Registraste asistencia pero la obra todavía no imputó horas a tu nombre en este período.'}
          </Nada>
        )}
      </Seccion>

      <Seccion titulo="DETALLE">
        {r.filas.length > 0 ? (
          <div data-testid="detalle-horas">
            {r.filas.map((f) => (
              <Fila
                key={f.id}
                testid="fila-hora"
                titulo={f.actividad ?? 'sin actividad'}
                detalle={`${dm(f.fecha) ?? 'sin fecha'} · ${f.obra ?? 'sin obra'}${f.tipo_hora ? ` · ${f.tipo_hora.replace(/_/g, ' ')}` : ''}`}
                senal={<span className="font-mono tabular-nums text-ink">{hh(f.horas)}</span>}
              />
            ))}
          </div>
        ) : (
          <Nada testid="sin-horas">
            La obra todavía no imputó horas a tu nombre en este período. Se cargan en el parte del
            día; si falta un día, se corrige en la obra.
          </Nada>
        )}
      </Seccion>

      <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
        Son las horas que la obra imputó a tu nombre. No se editan acá: si falta un día se corrige en
        la obra. La presencia es otra cosa y está en Asistencia.
      </p>
    </PantallaEmpleado>
  )
}
