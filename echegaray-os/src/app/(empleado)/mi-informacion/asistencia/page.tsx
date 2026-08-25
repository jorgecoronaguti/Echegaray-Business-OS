import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { BloqueAsistencia } from '@/features/empleado/components/BloqueAsistencia'
import { PedirCorreccion } from '@/features/empleado/components/PedirCorreccion'
import { AvisarAusencia } from '@/features/empleado/components/AvisarAusencia'
import { C } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, BotonTopBar, RotuloSeccion, TarjetaLista, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import {
  getMiAsistencia, getMiDiaDeHoy, getMiObra, getMisCorrecciones,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { diaCorto, dm, mesAnterior, mesDe, mesLargo, semanaDe } from '@/features/empleado/services/fecha'
import {
  completarSemana, duracion, hora, totalDelPeriodo,
} from '@/features/empleado/services/asistencia'
import type { DiaSinMarca } from '@/features/empleado/services/asistencia'
import { getDiasHabiles } from '@/features/obras/services/obrasService'
import { diaAPedirCorreccion, horaCorta, pendienteDe } from '@/features/empleado/services/correccion'

// M05 · ASISTENCIA — porte literal de `M05 · Asistencia.dc.html`.
//
// ═══ LA SEMANA ES UNA LISTA, NO UNA PLANILLA ═══
//
// La nota del mockup: «La semana se lee como lista, no como planilla». Cada fila lleva su icono de
// estado, el día en 76px, las dos marcas juntas en monoespaciada —«07:05 → 17:10», que es como se
// leen— y el total a la derecha. El día de hoy va sobre `#FEF9E6`.
//
// ═══ «SIN FICHAR» NO ES CERO ═══
//
// La nota del mockup, textual: «El jueves dice "sin fichar", no 0,0 h». Un 0,0 h afirma que la
// persona estuvo cero horas —o sea, que faltó—. «Sin fichar» dice lo que efectivamente pasó.
//
// ═══ LO QUE NO SE DIBUJA: «DENTRO DEL PREDIO DE LA OBRA» ═══
//
// El mockup pone una tarjeta «verificado por ubicación · 07:12». No está implementada y no se
// simula: el fichaje guarda el punto, pero NADIE lo compara todavía contra un perímetro de obra
// —esa geocerca no existe en la base—. Escribir «verificado» sin verificación sería exactamente el
// cartel que después alguien usa para discutir una jornada.
//
// ═══ NI EL OBJETIVO DE «38,0 / 44,0 h» ═══
//
// Las 44 h semanales no salen de ninguna fuente del OS —no hay jornada pactada por persona en la
// base— y ponerlas a mano convertiría una constante inventada en la vara contra la que alguien mide
// su mes. Se publica lo trabajado y se dice cuántos días quedaron sin cerrar.

export const dynamic = 'force-dynamic'

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
  // LOS DÍAS QUE ESTA OBRA TRABAJA, para no acusar de «sin fichar» a un sábado. Sin obra asignada
  // no hay calendario que aplicar y la lista queda vacía: no se supone lunes a viernes.
  const obraId = obras.data?.[0]?.id ?? null
  const diasHabiles = obraId ? await getDiasHabiles(supabase, obraId) : []

  // ═══ EL PEDIDO DE CORRECCIÓN ═══
  //
  // Sin la lectura de correcciones no se ofrece nada. Si `getMisCorrecciones` falló, NO se sabe si
  // ya hay un pedido para ese día, y ofrecer el botón igual invitaría a pedir por segunda vez algo
  // que ya está en la bandeja. Falla cerrado.
  const aCorregir = correcciones.data ? diaAPedirCorreccion(dias.data ?? [], correcciones.data) : null

  // LA SEMANA SE DIBUJA ENTERA, INCLUIDOS LOS DÍAS QUE NO EXISTEN EN LA BASE. Un día sin marcas no
  // devuelve fila, y una lista de cuatro renglones para una semana de siete esconde justo el día
  // que falta fichar — que es lo que la persona vino a ver.
  const filas = ventana === 'semana'
    ? completarSemana(v.desde, dias.data ?? [], hoy, diasHabiles)
    : (dias.data ?? []).map((d) => ({ ...d, sinMarca: null }))

  return (
    <PantallaEmpleado
      titulo="Asistencia"
      volver={{ href: '/mi-informacion', label: 'Mi información' }}
      sub={obras.data?.[0]?.nombre ?? 'sin obra asignada'}
      acciones={
        <BotonTopBar
          titulo={ventana === 'semana' ? 'Ver el mes' : 'Ver la semana'}
          testid="cambiar-ventana"
          href={ventana === 'semana' ? '/mi-informacion/asistencia?ver=mes' : '/mi-informacion/asistencia'}
        >
          <Icono nombre="historial" tamano={20} />
        </BotonTopBar>
      }
    >
      {dias.error && <AvisoError testid="asistencia-error-lectura">{dias.error}</AvisoError>}
      {correcciones.error && <AvisoError testid="correcciones-error-lectura">{correcciones.error}</AvisoError>}

      <BloqueAsistencia dia={dia.data} obraId={obras.data?.[0]?.id ?? null} />

      {aCorregir && (
        <div style={{ marginTop: 20 }}>
          <PedirCorreccion fecha={aCorregir.fecha} entrada={hora(aCorregir.entrada)} />
        </div>
      )}

      {/* ═══ EL ENCABEZADO DEL PERÍODO ES EL CONTRATO ═══
          Dice QUÉ ventana se está mirando y CUÁNTO suma. El total es sólo de los días cerrados, y
          los que quedaron afuera se nombran: un total que calla los días abiertos parece completo. */}
      <RotuloSeccion
        icono="fecha"
        margenArriba={24}
        extra={duracion(total.minutos) ?? 'sin registrar'}
        colorExtra={total.minutos > 0 ? C.ink : C.faint}
      >
        {ventana === 'semana' ? 'Esta semana' : ventana === 'mes' ? mesLargo(hoy) : mesLargo(v.desde)}
      </RotuloSeccion>
      <p style={{ marginTop: 2, fontSize: 11.5, color: C.faint }}>
        {dm(v.desde)} – {dm(v.hasta)}
        {total.sinCerrar > 0 && (
          <span style={{ color: C.warn }}>
            {' '}· {total.sinCerrar} día{total.sinCerrar === 1 ? '' : 's'} sin cerrar, que no suman
          </span>
        )}
      </p>

      <div style={{ marginTop: 10 }}>
        <TarjetaLista testid="historial-asistencia">
          {filas.length === 0 ? (
            <Vacio testid="sin-asistencia">
              No registraste asistencia en este período. Se registra acá arriba, con el botón de
              entrada y salida.
            </Vacio>
          ) : filas.map((d) => {
            // EL DÍA QUE YA SE PIDIÓ NO SE VE IGUAL QUE EL QUE FALTA PEDIR. Sin esto, quien ya mandó
            // el pedido ve la misma fila «falta salida» y vuelve a pedir.
            const pedido = pendienteDe(correcciones.data ?? [], d.fecha)
            const esHoy = d.fecha === hoy
            const a = aspecto(d.estado, esHoy, d.sinMarca)
            return (
              <div
                key={d.fecha}
                data-testid="dia-asistencia"
                data-estado={d.sinMarca ?? d.estado}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                  borderBottom: `1px solid ${C.divisor}`, minHeight: 48,
                  background: esHoy ? C.marcaSuave : 'transparent',
                }}
              >
                <span title={a.titulo} style={{ display: 'flex', color: a.color, flexShrink: 0 }}>
                  <Icono nombre={a.icono} tamano={17} />
                </span>
                <span style={{
                  fontSize: 13.5, fontWeight: esHoy ? 600 : 400, width: 76, flexShrink: 0,
                  color: d.sinMarca === 'sin_fichar' || d.sinMarca == null ? C.ink : C.faint,
                }}>
                  {diaCorto(d.fecha)}
                </span>
                {/* LAS DOS MARCAS JUNTAS, COMO SE LEEN. Sin ninguna, «sin fichar» — y nunca
                    `00:00 → 00:00`, que serían dos horas que nadie marcó. */}
                <span style={{ ...mono, fontSize: 12.5, color: C.muted, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.entrada || d.salida
                    ? `${hora(d.entrada) ?? '—'} → ${hora(d.salida) ?? (d.estado === 'en_curso' ? 'en obra' : pedido ? `${horaCorta(pedido.hora_propuesta)}?` : '—')}`
                    : a.texto ?? 'sin fichar'}
                </span>
                <span style={{
                  ...mono, marginLeft: 'auto', fontSize: 14, fontWeight: 600, flexShrink: 0,
                  // El «—» de un día que no se juzga NO va en `warn`: no falta nada.
                  color: d.minutos != null ? C.ink : d.sinMarca && d.sinMarca !== 'sin_fichar' ? C.tenue : C.warn,
                }}>
                  {d.minutos != null
                    ? duracion(d.minutos)
                    : pedido ? 'pedido' : '—'}
                </span>
              </div>
            )
          })}
        </TarjetaLista>
      </div>

      {/* LA FILA DEL MOCKUP QUE SÍ ESCRIBE: una incidencia del día, con su motivo. No declara la
          falta —eso es una novedad de liquidación y la escribe Administración— y lo dice. */}
      <AvisarAusencia obraId={obras.data?.[0]?.id ?? null} />

      <p style={{ marginTop: 18, fontSize: 11.5, lineHeight: 1.6, color: C.faint }}>
        Presencia laboral, no horas imputadas a obra. Desde acá no se edita una marca ya registrada:
        si falta tu salida, lo que se manda es un pedido y la corrección la escribe Administración
        cuando lo aprueba. Mientras esté pendiente, el día sigue sin salida y no suma al total.
      </p>
    </PantallaEmpleado>
  )
}

/**
 * EL ICONO Y EL COLOR DE UNA FILA DE LA SEMANA, con los valores medidos en M05 y M06.
 *
 * `sinMarca` sólo viene en las filas que la base NO devolvió, y decide antes que el estado: un día
 * que todavía no pasó y un domingo no son «sin fichar». Los tres tratamientos salen del dibujo:
 * M05 pinta la falta con la ✕ en `#B54708`, y M06 pinta el descanso con el icono de obra en
 * `#C9C4C2` («Domingo 24 · descanso»). El día futuro no está en ningún mockup —las dos pantallas
 * cortan la semana en hoy— y se resuelve con el mismo tono apagado y un «—»: la fila existe para
 * que la semana se lea completa, no para acusar a nadie.
 */
function aspecto(
  estado: string, esHoy: boolean, sinMarca: DiaSinMarca | null,
): { icono: NombreIcono; color: string; titulo: string; texto: string | null } {
  if (sinMarca === 'futuro') return { icono: 'pendiente', color: C.tenue, titulo: 'Todavía no pasó', texto: '—' }
  if (sinMarca === 'no_laborable') return { icono: 'obra', color: C.tenue, titulo: 'Descanso', texto: 'descanso' }
  if (estado === 'sin_registrar') return { icono: 'falta', color: C.warn, titulo: 'Sin fichar', texto: null }
  if (estado === 'falta_salida') return { icono: 'alerta', color: C.warn, titulo: 'Falta la salida', texto: null }
  if (estado === 'en_curso' || esHoy) return { icono: 'reloj', color: C.info, titulo: 'En curso', texto: null }
  return { icono: 'ok', color: C.pos, titulo: 'Jornada completa', texto: null }
}
