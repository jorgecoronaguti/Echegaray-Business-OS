import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { Nada } from '@/features/empleado/components/Filas'
import { BloqueAsistencia } from '@/features/empleado/components/BloqueAsistencia'
import { PedirCorreccion } from '@/features/empleado/components/PedirCorreccion'
import {
  getMiAsistencia, getMiDiaDeHoy, getMiObra, getMisCorrecciones,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { diaCorto, dm, mesAnterior, mesDe, mesLargo, semanaDe } from '@/features/empleado/services/fecha'
import { duracion, hora, totalDelPeriodo } from '@/features/empleado/services/asistencia'
import { diaAPedirCorreccion, horaCorta, pendienteDe } from '@/features/empleado/services/correccion'
import type { DiaDeAsistencia } from '@/features/empleado/types'

// «ASISTENCIA» (M05) — un estado grande, un botón grande, y la semana como LISTA.
//
// ═══ POR QUÉ LA SEMANA Y NO EL MES ═══
//
// La ventana por defecto era el mes y el mockup la cambia a la semana. La razón está en el uso: lo
// que alguien viene a mirar acá es si le falta una salida esta semana —eso todavía se puede
// corregir— y cuánto lleva. Treinta filas para contestar eso obligan a buscar el renglón de ayer
// entre las de hace tres semanas. El mes no se perdió: vive en «Ver el mes» del encabezado.
//
// ═══ LA SEMANA ES UNA LISTA, NO UNA PLANILLA ═══
//
// La nota del mockup: «La semana se lee como lista, no como planilla». La cabecera de columnas
// FECHA·ENTRADA·SALIDA·TOTAL en 390px comprime cuatro celdas en el ancho de un pulgar. La lista
// pone el día a la izquierda, las dos marcas juntas en el medio —que es como se leen: «entré a las
// siete y salí a las cinco»— y el total a la derecha.
//
// ═══ «SIN FICHAR» NO ES CERO ═══
//
// La nota del mockup, textual: «El jueves dice "sin fichar", no 0,0 h». Un 0,0 h afirma que la
// persona estuvo cero horas —o sea, que faltó—. «Sin fichar» dice lo que efectivamente pasó: nadie
// tocó el botón, y eso puede ser una falta, un olvido o un día que se trabajó en otro lado.
//
// ═══ LO QUE NO SE DIBUJA: EL «DENTRO DEL PREDIO DE LA OBRA» ═══
//
// El mockup pone una tarjeta «Dentro del predio de la obra · verificado por ubicación». No está
// implementada y no se simula: el fichaje guarda el punto, pero NADIE lo compara todavía contra un
// perímetro de obra —esa geocerca no existe en la base—. Escribir «verificado» sin verificación
// sería exactamente el cartel que después alguien usa para discutir una jornada.

export const dynamic = 'force-dynamic'

const ESTADO: Record<string, { texto: string; tono: 'pos' | 'warn' | 'curso' | 'nulo' }> = {
  completo: { texto: '', tono: 'pos' },
  en_curso: { texto: 'en obra', tono: 'curso' },
  falta_salida: { texto: 'falta salida', tono: 'warn' },
  sin_registrar: { texto: 'sin fichar', tono: 'nulo' },
}

type Ventana = 'semana' | 'mes' | 'mes-pasado'

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
  const ventana: Ventana = ver === 'mes' ? 'mes' : ver === 'mes-pasado' ? 'mes-pasado' : 'semana'
  const hoy = await hoyISO()
  const v = ventana === 'mes' ? mesDe(hoy) : ventana === 'mes-pasado' ? mesAnterior(hoy) : semanaDe(hoy)

  const [dia, dias, obras, correcciones] = await Promise.all([
    getMiDiaDeHoy(supabase, hoy), getMiAsistencia(supabase, v.desde, v.hasta), getMiObra(supabase),
    getMisCorrecciones(supabase, v.desde, v.hasta),
  ])
  const total = totalDelPeriodo(dias.data ?? [])

  // ═══ EL PEDIDO DE CORRECCIÓN ═══
  //
  // Sin la lectura de correcciones no se ofrece nada. Si `getMisCorrecciones` falló, NO se sabe si
  // ya hay un pedido para ese día, y ofrecer el botón igual invitaría a pedir por segunda vez algo
  // que ya está en la bandeja. Falla cerrado.
  const aCorregir = correcciones.data ? diaAPedirCorreccion(dias.data ?? [], correcciones.data) : null

  // LA SEMANA SE DIBUJA ENTERA, INCLUIDOS LOS DÍAS QUE NO EXISTEN EN LA BASE. Un día sin marcas no
  // devuelve fila, y una lista de cuatro renglones para una semana de siete esconde justo el día
  // que falta fichar — que es lo que la persona vino a ver.
  const filas = ventana === 'semana' ? completarSemana(v.desde, dias.data ?? []) : (dias.data ?? [])

  return (
    <PantallaEmpleado
      titulo="Asistencia"
      volver={{ href: '/mi-informacion', label: 'Mi información' }}
      sub={obras.data?.[0]?.nombre ?? 'sin obra asignada'}
      acciones={
        <Link
          href={ventana === 'semana' ? '/mi-informacion/asistencia?ver=mes' : '/mi-informacion/asistencia'}
          data-testid="cambiar-ventana"
          className="flex h-[44px] items-center px-2 text-[12.5px] text-muted hover:text-ink"
        >
          {ventana === 'semana' ? 'Ver el mes' : 'Ver la semana'}
        </Link>
      }
    >
      {dias.error && <Aviso tono="neg" titulo="No se pudo leer tu asistencia." testid="asistencia-error-lectura">{dias.error}</Aviso>}
      {correcciones.error && (
        <Aviso tono="neg" titulo="No se pudieron leer tus pedidos de corrección." testid="correcciones-error-lectura">
          {correcciones.error}
        </Aviso>
      )}

      <BloqueAsistencia dia={dia.data} obraId={obras.data?.[0]?.id ?? null} grande />

      {aCorregir && (
        <div className="mt-5">
          <PedirCorreccion fecha={aCorregir.fecha} entrada={hora(aCorregir.entrada)} />
        </div>
      )}

      {/* ═══ EL ENCABEZADO DEL PERÍODO ES EL CONTRATO ═══
          Dice QUÉ ventana se está mirando y CUÁNTO suma. El total es sólo de los días cerrados, y
          los que quedaron afuera se nombran: un total que calla los días abiertos parece completo.

          NO SE DIBUJA UN OBJETIVO. El mockup escribe «38,0 / 44,0 h», pero las 44 h semanales no
          salen de ninguna fuente del OS —no hay jornada pactada por persona en la base— y ponerlas
          a mano convertiría una constante inventada en la vara contra la que alguien mide su mes. */}
      <div className="mt-7 flex items-baseline gap-3">
        <h2 className="text-[13px] font-semibold text-ink">
          {ventana === 'semana' ? 'Esta semana' : ventana === 'mes' ? mesLargo(hoy) : mesLargo(v.desde)}
        </h2>
        <span className="ml-auto font-mono text-[13px] font-semibold tabular-nums text-ink" data-testid="total-presencia">
          {duracion(total.minutos) ?? <span className="text-[12px] font-normal text-faint">sin registrar</span>}
        </span>
      </div>
      <p className="mt-0.5 text-[11.5px] text-faint">
        {dm(v.desde)} – {dm(v.hasta)}
        {total.sinCerrar > 0 && (
          <span className="text-warn"> · {total.sinCerrar} día{total.sinCerrar === 1 ? '' : 's'} sin cerrar, que no suman</span>
        )}
      </p>

      <div className="mt-2 overflow-hidden rounded-[14px] border border-line bg-surface" data-testid="historial-asistencia">
        {filas.length === 0 ? (
          <Nada testid="sin-asistencia">
            No registraste asistencia en este período. Se registra acá arriba, con el botón de
            entrada y salida.
          </Nada>
        ) : (
          filas.map((d) => {
            const e = ESTADO[d.estado] ?? ESTADO.sin_registrar
            // EL DÍA QUE YA SE PIDIÓ NO SE VE IGUAL QUE EL QUE FALTA PEDIR. Sin este chip, quien ya
            // mandó el pedido ve la misma fila «falta salida» y vuelve a pedir.
            const pedido = pendienteDe(correcciones.data ?? [], d.fecha)
            const esHoy = d.fecha === hoy
            return (
              <div
                key={d.fecha}
                data-testid="dia-asistencia"
                data-estado={d.estado}
                className={`flex min-h-[50px] items-center gap-3 border-b border-[#EFEEEA] px-4 py-2 text-[13px] last:border-b-0 ${esHoy ? 'bg-marca-soft' : ''}`}
              >
                <span className={`w-[64px] shrink-0 ${esHoy ? 'font-semibold text-ink' : 'text-ink'}`}>
                  {diaCorto(d.fecha)}
                </span>
                {/* LAS DOS MARCAS JUNTAS, COMO SE LEEN. Sin ninguna, «sin fichar» en `faint` — y
                    nunca `00:00 → 00:00`, que serían dos horas que nadie marcó. */}
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted">
                  {d.entrada || d.salida ? (
                    <>
                      {hora(d.entrada) ?? '—'} → {hora(d.salida) ?? (d.estado === 'en_curso' ? 'en obra' : pedido ? `${horaCorta(pedido.hora_propuesta)}?` : '—')}
                    </>
                  ) : (
                    <span className="text-faint">sin fichar</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  {d.minutos != null ? (
                    <span className="font-mono tabular-nums text-ink">{duracion(d.minutos)}</span>
                  ) : pedido ? (
                    <Estado tono="pendiente" clave="correccion_pendiente" testid="chip-correccion">corrección pendiente</Estado>
                  ) : d.estado === 'sin_registrar' ? (
                    /* EL GUIÓN LARGO Y NO UN 0,0. Un cero afirma que estuvo cero horas —o sea, que
                       faltó—; el guión dice que no hay dato, que es lo único cierto. */
                    <span className="font-mono text-neg" aria-label="sin fichar">—</span>
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

/** Los siete días de la semana, con los que la base no devolvió marcados como `sin_registrar`. La
 *  fila sintética lleva `minutos: null` a propósito: no es un día de cero horas, es un día del que
 *  no se sabe nada, y `totalDelPeriodo` ya distingue esos dos casos. */
function completarSemana(lunes: string, dias: DiaDeAsistencia[]): DiaDeAsistencia[] {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]))
  const base = new Date(`${lunes}T00:00:00Z`).getTime()
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(base + i * 86400000).toISOString().slice(0, 10)
    return porFecha.get(fecha) ?? {
      fecha, entrada: null, salida: null, incidencias: 0, motivo: null,
      estado: 'sin_registrar' as const, minutos: null, obra_id: null,
    }
  })
}
