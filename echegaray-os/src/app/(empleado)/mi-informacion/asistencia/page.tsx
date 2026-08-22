import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Nada } from '@/features/empleado/components/Filas'
import { SelectorMes } from '@/features/empleado/components/SelectorMes'
import { BloqueAsistencia } from '@/features/empleado/components/BloqueAsistencia'
import { PedirCorreccion } from '@/features/empleado/components/PedirCorreccion'
import {
  getMiAsistencia, getMiDiaDeHoy, getMiObra, getMisCorrecciones,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { mesAnterior, mesDe, dm } from '@/features/empleado/services/fecha'
import { duracion, hora, totalDelPeriodo } from '@/features/empleado/services/asistencia'
import { diaAPedirCorreccion, horaCorta, pendienteDe } from '@/features/empleado/services/correccion'

// «ASISTENCIA» — la presencia, con su historial. NO son las HH imputadas a la obra.
//
// ═══ EL DÍA SIN SALIDA SE MARCA, NO SE COMPLETA ═══
//
// El handoff: «Sin salida ⇒ "falta salida" en warn; el día en curso muestra "en curso", no un total
// inventado». Son dos situaciones que en la base se ven igual —hay entrada y no hay salida— y una
// es de hoy y la otra es de un día que ya pasó. Ponerle una salida provisoria a cualquiera de las
// dos fabrica horas que nadie trabajó, y esas horas terminan en una discusión de sueldo.
//
// EL TOTAL DEL PERÍODO SUMA SÓLO LOS DÍAS CERRADOS y dice cuántos quedaron afuera: un total que
// calla los días abiertos parece completo y no lo está.

export const dynamic = 'force-dynamic'

const ESTADO: Record<string, { texto: string; tono: 'pos' | 'warn' | 'curso' | 'nulo' }> = {
  completo: { texto: '', tono: 'pos' },
  en_curso: { texto: 'en curso', tono: 'curso' },
  falta_salida: { texto: 'falta salida', tono: 'warn' },
  sin_registrar: { texto: 'sin registrar', tono: 'nulo' },
}

export default async function AsistenciaPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Asistencia" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
        <SinVinculo que="tu asistencia" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const { ver } = await searchParams
  const cual: 'mes' | 'mes-pasado' = ver === 'mes-pasado' ? 'mes-pasado' : 'mes'
  const hoy = await hoyISO()
  const v = cual === 'mes-pasado' ? mesAnterior(hoy) : mesDe(hoy)

  const [dia, dias, obras, correcciones] = await Promise.all([
    getMiDiaDeHoy(supabase, hoy), getMiAsistencia(supabase, v.desde, v.hasta), getMiObra(supabase),
    getMisCorrecciones(supabase, v.desde, v.hasta),
  ])
  const total = totalDelPeriodo(dias.data ?? [])

  // ═══ EL PEDIDO DE CORRECCIÓN (M05) ═══
  //
  // Sin la lectura de correcciones no se ofrece nada. Si `getMisCorrecciones` falló —la migración no
  // está aplicada, la base no contesta— NO se sabe si ya hay un pedido para ese día, y ofrecer el
  // botón igual invitaría a pedir por segunda vez algo que ya está en la bandeja. Falla cerrado: el
  // aviso no aparece y el error se muestra arriba, como el de la asistencia.
  const aCorregir = correcciones.data ? diaAPedirCorreccion(dias.data ?? [], correcciones.data) : null

  return (
    <PantallaEmpleado titulo="Asistencia" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
      {dias.error && <Aviso tono="neg" titulo="No se pudo leer tu asistencia." testid="asistencia-error-lectura">{dias.error}</Aviso>}

      {correcciones.error && (
        <Aviso tono="neg" titulo="No se pudieron leer tus pedidos de corrección." testid="correcciones-error-lectura">
          {correcciones.error}
        </Aviso>
      )}

      <Seccion titulo="HOY">
        <BloqueAsistencia dia={dia.data} obraId={obras.data?.[0]?.id ?? null} compacto />
      </Seccion>

      {aCorregir && (
        <div className="mt-5">
          <PedirCorreccion fecha={aCorregir.fecha} entrada={hora(aCorregir.entrada)} />
        </div>
      )}

      <div className="mt-7">
        <SelectorMes base="/mi-informacion/asistencia" actual={cual} />
      </div>

      <p className="mt-4 font-mono text-[26px] leading-none tabular-nums text-ink" data-testid="total-presencia">
        {duracion(total.minutos) ?? '0 min'}
      </p>
      <p className="mt-1 text-[12px] text-faint">
        de presencia en {dm(v.desde)} – {dm(v.hasta)}
        {total.sinCerrar > 0 && (
          <span className="text-warn"> · {total.sinCerrar} día{total.sinCerrar === 1 ? '' : 's'} sin cerrar, que no suman</span>
        )}
      </p>

      <div className="mt-5" data-testid="historial-asistencia">
        <div className="flex items-center gap-3 border-b border-line py-2 text-[10.5px] font-semibold tracking-[0.1em] text-faint">
          <span className="w-[70px] shrink-0">FECHA</span>
          <span className="w-[64px] shrink-0 text-right">ENTRADA</span>
          <span className="w-[64px] shrink-0 text-right">SALIDA</span>
          <span className="flex-1 text-right">TOTAL</span>
        </div>
        {(dias.data ?? []).length === 0 ? (
          <Nada testid="sin-asistencia">
            No registraste asistencia en este período. Se registra desde Hoy, con el botón de entrada
            y salida.
          </Nada>
        ) : (
          (dias.data ?? []).map((d) => {
            const e = ESTADO[d.estado] ?? ESTADO.sin_registrar
            // EL DÍA QUE YA SE PIDIÓ NO SE VE IGUAL QUE EL QUE FALTA PEDIR. Sin este chip, alguien
            // que ya mandó el pedido ve exactamente la misma fila «falta salida» que antes y vuelve
            // a pedir —o le avisa a Administración por teléfono, que es lo que M05 vino a evitar.
            const pedido = pendienteDe(correcciones.data ?? [], d.fecha)
            return (
              <div key={d.fecha} data-testid="dia-asistencia" data-estado={d.estado} className="flex items-center gap-3 border-b border-[#EFEEEA] py-2.5 text-[13px]">
                <span className="w-[70px] shrink-0 font-mono tabular-nums text-ink">{dm(d.fecha)}</span>
                <span className="w-[64px] shrink-0 text-right font-mono tabular-nums text-ink">{hora(d.entrada) ?? '—'}</span>
                <span className="w-[64px] shrink-0 text-right font-mono tabular-nums text-ink">
                  {hora(d.salida) ?? (pedido ? `${horaCorta(pedido.hora_propuesta)}?` : '—')}
                </span>
                <span className="flex-1 text-right">
                  {d.minutos != null ? (
                    <span className="font-mono tabular-nums text-ink">{duracion(d.minutos)}</span>
                  ) : pedido ? (
                    <Estado tono="pendiente" clave="correccion_pendiente" testid="chip-correccion">
                      corrección pendiente
                    </Estado>
                  ) : (
                    <Estado tono={e.tono} clave={d.estado}>{e.texto}</Estado>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
        Presencia laboral, no horas imputadas a obra. Desde acá no se edita una marca ya registrada:
        si falta tu salida, lo que se manda es un pedido y la corrección la escribe Administración
        cuando lo aprueba. Mientras esté pendiente, el día sigue sin salida y no suma al total.
      </p>
    </PantallaEmpleado>
  )
}
