import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { Fila, Nada } from '@/features/empleado/components/Filas'
import { getMisRecibos } from '@/features/empleado/services/empleadoService'
import { etiquetaDePeriodo, lecturaDeRecibo, ordenar } from '@/features/empleado/services/recibos'
import { Seccion } from '@/features/empleado/components/ShellEmpleado'
import { BASE_MI_RECIBO, misRecibosDePago } from '@/features/recibos/miRecibo'
import { ROTULO_ESTADO, miles, periodoCorto } from '@/features/recibos/logica'

// «RECIBOS» — Período | Estado | Neto | Acción.
//
// ═══ NUNCA $ 0 POR FALTA DE DATO ═══
//
// El PDF del recibo es real y está en el legajo. Los NÚMEROS de la liquidación —neto, días, estado
// de pago— no existen en el OS: `jornales_quincena` es el agregado de la quincena entera y
// `nomina_por_mes` el del mes, y ninguno baja a la persona. Mientras no existan, la columna del
// neto dice «sin importe publicado» y no un cero: un cero AFIRMA que no cobró nada, y la ausencia
// de la liquidación no afirma eso.
//
// El OS no calcula sueldo. Publica lo que la liquidación publique.
//
// ═══ DOS PAPELES DISTINTOS, DOS SECCIONES (22/09/2026) ═══
//
// «Recibos de pago» son los que emite el OS por lo que la empresa paga en la quincena —banco + efectivo—
// y la persona firma acá (M09–M11). «Recibos de sueldo» son los PDF del estudio (`mi_recibo`). No se
// mezclan en una lista: uno se firma y el otro se consulta.

export const dynamic = 'force-dynamic'

export default async function RecibosPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Recibos" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
        <SinVinculo que="tus recibos" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const [recibos, pagos] = await Promise.all([getMisRecibos(supabase), misRecibosDePago(perfil.data.persona_id)])
  const lista = ordenar(recibos.data ?? [])
  // Sólo los vigentes: una versión reemplazada no se firma y su sucesora dice lo mismo o lo corregido.
  const dePago = (pagos.data ?? []).filter((r) => r.vigente)

  return (
    <PantallaEmpleado titulo="Recibos" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
      {recibos.error && <Aviso tono="neg" titulo="No se pudieron leer tus recibos." testid="recibos-error">{recibos.error}</Aviso>}

      <Seccion titulo="Recibos de pago" extra={<span className="text-faint">{dePago.length}</span>}>
        {pagos.error && <Aviso tono="neg" titulo="No se pudieron leer tus recibos de pago." testid="recibos-pago-error">{pagos.error}</Aviso>}
        <div data-testid="lista-recibos-pago">
          {!pagos.error && dePago.length === 0 ? (
            <Nada testid="sin-recibos-pago">
              Todavía no hay recibos de pago a tu nombre. Aparecen acá cuando Administración cierra la
              quincena y los emite, para que los firmes.
            </Nada>
          ) : (
            dePago.map((r) => (
              <Fila
                key={r.id}
                testid="fila-recibo-pago"
                href={BASE_MI_RECIBO(r.id)}
                titulo={`Quincena ${periodoCorto(r.desde, r.hasta)}`}
                detalle={r.desactualizado ? 'Desactualizado: va a llegar uno nuevo' : r.estado === 'emitido' ? 'Para firmar' : ROTULO_ESTADO[r.estado]}
                senal={`$ ${miles(r.total)}`}
                senalTono={r.estado === 'emitido' && !r.desactualizado ? 'warn' : 'faint'}
              />
            ))
          )}
        </div>
      </Seccion>

      <Seccion titulo="Recibos de sueldo (del estudio)">
      <div data-testid="lista-recibos">
        {lista.length === 0 ? (
          <Nada testid="sin-recibos">
            Todavía no hay recibos cargados a tu nombre. Los carga Administración en tu legajo cuando
            se liquida cada quincena.
          </Nada>
        ) : (
          lista.map((r) => {
            const l = lecturaDeRecibo(r)
            return (
              <Fila
                key={r.id}
                testid="fila-recibo"
                href={`/mi-informacion/recibos/${r.id}`}
                titulo={etiquetaDePeriodo(r)}
                detalle={<Estado tono={l.tono} clave={l.estado}>{l.estado}</Estado>}
                senal={
                  l.neto ?? <span className="text-faint">{l.falta}</span>
                }
                accion={<span className="whitespace-nowrap text-[12px] text-muted">{l.hayPdf ? 'Ver' : ''}</span>}
              />
            )
          })
        )}
      </div>
      </Seccion>

      <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
        Sólo tus recibos. Si un período todavía no está liquidado, se dice: nunca aparece $ 0 por
        falta de dato.
      </p>
    </PantallaEmpleado>
  )
}
