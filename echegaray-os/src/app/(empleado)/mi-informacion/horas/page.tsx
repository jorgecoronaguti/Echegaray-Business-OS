import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { getHorasPropias, getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { hh, resumen } from '@/features/mi-cuenta/services/horas'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SelectorMes } from '@/features/empleado/components/SelectorMes'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { AvisoError, Azulejo, TarjetaLista, Vacio, mono } from '@/shared/components/movil/Piezas'
import { getMiAsistencia } from '@/features/empleado/services/empleadoService'
import { porDia, totalExtra } from '@/features/empleado/services/horasPorDia'
import { hoyISO } from '@/features/empleado/services/acciones'
import { mesAnterior, mesDe, mesLargo, dm } from '@/features/empleado/services/fecha'
import { duracion, pendienteDeImputar, totalDelPeriodo } from '@/features/empleado/services/asistencia'

// M06 · MIS HORAS — porte literal de `M06 · Mis horas.dc.html`.
//
// ═══ LAS DOS PUNTAS, O NINGUNA ═══
//
// Presencia registrada / HH imputadas a obra / Pendiente de imputar, y SÓLO SI EXISTEN AMBAS. Sin
// asistencia registrada, «pendiente de imputar: 148 h» acusaría a la obra de no imputar cuando lo
// que falta es la otra mitad del dato. Y al revés: sin HH imputadas, la presencia sola no dice que
// falte imputar nada — puede ser un día de lluvia.
//
// ═══ LO QUE NO SE DIBUJA DEL MOCKUP, Y POR QUÉ ═══
//
//   · LA BARRA «38,0 / 44,0 h». Las 44 h semanales no salen de ninguna fuente del OS: no hay jornada
//     pactada por persona en la base. Ponerlas a mano convertiría una constante inventada en la vara
//     contra la que alguien mide su quincena — y esa vara después se discute en un sueldo.
//   · «¿HAY ALGO MAL EN TUS HORAS?» va apagado. El reclamo de una imputación no tiene canal en el
//     OS: `PedirCorreccion` corrige la ASISTENCIA, que es otra cosa. Se deja a la vista con el
//     motivo en su `title`, porque un hueco declarado se resuelve y uno borrado se olvida.
//
// La ventana es el MES y no la semana del mockup: las HH se liquidan por quincena y el mes es la
// ventana que ya usan el resumen y la bandeja de Administración. Cambiarla a semana partiría la
// quincena al medio en la única pantalla donde la persona la verifica.

export const dynamic = 'force-dynamic'

export default async function MisHorasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mis horas">
        <SinVinculo que="tus horas" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const basico = await getPerfilActual(supabase, user.id)
  const { ver } = await searchParams
  const cual: 'mes' | 'mes-pasado' = ver === 'mes-pasado' ? 'mes-pasado' : 'mes'
  const hoy = await hoyISO()
  const v = cual === 'mes-pasado' ? mesAnterior(hoy) : mesDe(hoy)

  const [horas, asistencia] = await Promise.all([
    getHorasPropias(supabase, v.desde, v.hasta),
    getMiAsistencia(supabase, v.desde, v.hasta),
  ])

  const r = resumen(horas.data ?? [], v.desde, v.hasta)
  const dias = porDia(horas.data ?? [])
  const extra = totalExtra(dias)
  const presencia = totalDelPeriodo(asistencia.data ?? [])
  const contraste = pendienteDeImputar(presencia.minutos, r.trabajadas)
  const sinFichar = (asistencia.data ?? []).filter((d) => d.estado === 'sin_registrar').length

  return (
    <PantallaEmpleado
      titulo="Mis horas"
      sub={basico.data?.nombre ?? user.email ?? 'mi legajo'}
      franja={
        <div style={{ margin: '8px -12px -10px' }}>
          <SelectorMes
            base="/mi-informacion/horas"
            actual={cual}
            titulo={cual === 'mes' ? 'Este mes' : mesLargo(v.desde)}
            rango={`${dm(v.desde)} – ${dm(v.hasta)}`}
          />
        </div>
      }
    >
      {horas.error && <AvisoError testid="horas-error">{horas.error}</AvisoError>}

      {/* ═══ LO TRABAJADO, EN GRANDE ═══
          Si la lectura falló va «—» y no «0,00»: un cero acá es una quincena sin trabajar que nadie
          vivió. La barra del mockup no se dibuja porque no hay objetivo del que sacarla. */}
      <div
        data-testid="resumen-horas"
        style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: C.muted }}>Trabajadas</span>
          <span style={{ ...mono, fontSize: 28, fontWeight: 600, color: horas.data ? C.ink : C.faint }} data-testid="hh-total">
            {horas.data ? `${hh(r.trabajadas)} h` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {horas.data ? `en ${r.dias} ${r.dias === 1 ? 'día' : 'días'}` : 'no se pudo leer'}
          </span>
          <span style={{ ...mono, fontSize: 12, color: extra > 0 ? C.warn : C.muted }}>
            {extra > 0 ? `+${hh(extra)} h extra` : 'sin extras'}
          </span>
        </div>
        {/* SIN OBJETIVO NO HAY BARRA, Y SE DICE. Un renglón que explica por qué falta un dibujo del
            contrato vale más que el dibujo con un número inventado adentro. */}
        <p style={{ marginTop: 8, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
          No hay jornada prevista cargada por persona: por eso no se compara contra un objetivo.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }} data-testid="azulejos-horas">
        <Azulejo
          icono="ok" rotulo="JORNADAS" tamanoValor={18} colorIcono={C.pos}
          valor={horas.data ? String(r.dias) : '—'}
          testid="azulejo-jornadas"
        />
        <Azulejo
          icono="falta" rotulo="SIN FICHAR" tamanoValor={18} colorIcono={C.warn}
          valor={asistencia.error ? '—' : String(sinFichar)}
          colorValor={sinFichar > 0 ? C.warn : C.ink}
        />
        <Azulejo
          icono="tope" rotulo="EXTRA" tamanoValor={18} colorIcono={C.warn}
          valor={horas.data ? hh(extra) : '—'}
        />
      </div>

      {/* ═══ PRESENCIA vs HH IMPUTADAS ═══ */}
      <div style={{ marginTop: 18 }}>
        <TarjetaLista testid={contraste ? 'presencia-vs-hh' : 'sin-contraste'}>
          {contraste ? (
            <>
              <FilaDato rotulo="Presencia registrada" valor={duracion(contraste.presencia) ?? '—'} />
              <FilaDato rotulo="HH imputadas a obra" valor={`${hh(contraste.imputadas)} h`} />
              <FilaDato
                rotulo="Pendiente de imputar"
                valor={contraste.pendiente >= 0
                  ? duracion(contraste.pendiente) ?? '—'
                  : `−${duracion(-contraste.pendiente) ?? ''}`}
                color={contraste.pendiente > 0 ? C.warn : C.ink}
              />
            </>
          ) : (
            <Vacio>
              {presencia.minutos === 0 && r.trabajadas === 0
                ? 'En este período no hay ni presencia registrada ni horas imputadas.'
                : presencia.minutos === 0
                  ? 'Hay horas imputadas pero no registraste asistencia en este período: con una sola punta, el pendiente no se puede calcular sin inventarlo.'
                  : 'Registraste asistencia pero la obra todavía no imputó horas a tu nombre en este período.'}
            </Vacio>
          )}
        </TarjetaLista>
      </div>

      {/* ═══ EL DÍA A DÍA ═══ */}
      <div style={{ marginTop: 22 }}>
        <TarjetaLista testid="detalle-horas">
          {dias.length === 0 ? (
            <Vacio testid="sin-horas">
              La obra todavía no imputó horas a tu nombre en este período. Se cargan en el parte del
              día; si falta un día, se corrige en la obra.
            </Vacio>
          ) : dias.map((d) => (
            <div
              key={d.fecha}
              data-testid="fila-hora"
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
                borderBottom: `1px solid ${C.divisor}`, minHeight: 56,
                background: d.fecha === hoy ? C.marcaSuave : 'transparent',
              }}
            >
              <span style={{ display: 'flex', color: C.pos, flexShrink: 0 }}><Icono nombre="ok" tamano={18} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: d.fecha === hoy ? 600 : 400, color: C.ink }}>
                  {dm(d.fecha)}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.obras.length > 0 ? d.obras.join(' · ') : 'sin obra'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ ...mono, fontSize: 15, fontWeight: 600, color: C.ink }}>{hh(d.horas)}</div>
                {d.extra > 0 && (
                  <div style={{ ...mono, fontSize: 11, color: C.warn }}>+{hh(d.extra)} extra</div>
                )}
              </div>
            </div>
          ))}
        </TarjetaLista>
      </div>

      {/* LA FILA DE RECLAMO DEL MOCKUP, APAGADA CON SU MOTIVO. Un canal que no existe no se simula. */}
      <div
        data-testid="reclamo-horas"
        aria-disabled
        title="Todavía no hay un canal de reclamo de HH en el OS: la imputación se corrige en la obra"
        style={{
          marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, background: C.surface,
          border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: '13px 14px',
          minHeight: 56, cursor: 'not-allowed',
        }}
      >
        <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}><Icono nombre="nota" tamano={20} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: C.faint }}>¿Hay algo mal en tus horas?</div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>
            se corrige en la obra: todavía no hay un canal desde acá
          </div>
        </div>
      </div>

      <p style={{ marginTop: 18, fontSize: 11.5, lineHeight: 1.6, color: C.faint }}>
        Son las horas que la obra imputó a tu nombre. No se editan acá: si falta un día se corrige en
        la obra. La presencia es otra cosa y está en Asistencia.
      </p>
    </PantallaEmpleado>
  )
}

function FilaDato({ rotulo, valor, color = C.ink }: { rotulo: string; valor: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
      borderBottom: `1px solid ${C.divisor}`, minHeight: 52,
    }}>
      <span style={{ fontSize: 12.5, color: C.muted, minWidth: 0, flex: 1 }}>{rotulo}</span>
      <span style={{ ...mono, fontSize: 15, fontWeight: 600, color, flexShrink: 0 }}>{valor}</span>
    </div>
  )
}
