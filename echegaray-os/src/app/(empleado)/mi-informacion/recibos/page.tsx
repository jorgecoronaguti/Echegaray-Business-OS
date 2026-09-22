import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Fila, Nada } from '@/features/empleado/components/Filas'
import { getMisRecibos } from '@/features/empleado/services/empleadoService'
import { etiquetaDePeriodo, lecturaDeRecibo, ordenar, pesos } from '@/features/empleado/services/recibos'
import {
  getMisRecibosDeQuincena, periodoDicho,
} from '@/features/empleado/services/miReciboDeQuincena'
import { lecturaDelCiclo } from '@/shared/recibo/ciclo'

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

  const recibos = await getMisRecibos(supabase)
  const lista = ordenar(recibos.data ?? [])
  // LOS DOS PAPELES CONVIVEN Y NO SON LO MISMO: arriba, el recibo de la quincena que emite la empresa (banco
  // + efectivo), que es el que se firma. Abajo, los PDF de sueldo que liquida el estudio. Mezclarlos en una
  // sola lista haría creer que un recibo de quincena firmado reemplaza al recibo de sueldo, y no.
  const quincenas = await getMisRecibosDeQuincena(supabase)

  return (
    <PantallaEmpleado titulo="Recibos" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
      {recibos.error && <Aviso tono="neg" titulo="No se pudieron leer tus recibos." testid="recibos-error">{recibos.error}</Aviso>}
      {quincenas.error && (
        <Aviso tono="neg" titulo="No se pudieron leer tus recibos de quincena." testid="recibos-quincena-error">
          {quincenas.error}
        </Aviso>
      )}

      {(quincenas.data?.length ?? 0) > 0 && (
        <Seccion titulo="De la quincena" extra={<span className="text-faint">lo que paga la empresa</span>}>
          <div data-testid="lista-recibos-quincena">
            {(quincenas.data ?? []).map((r) => {
              const l = lecturaDelCiclo(r)
              return (
                <Fila
                  key={r.id}
                  testid="fila-recibo-quincena"
                  href={`/mi-informacion/recibos/quincena/${r.id}`}
                  titulo={periodoDicho(r)}
                  detalle={<Estado tono={l.tono} clave={l.rotulo}>{l.rotulo}</Estado>}
                  // NUNCA $ 0: un recibo sin total dice que no lo traía.
                  senal={r.total == null
                    ? <span className="text-faint">sin importe en el papel</span>
                    : pesos(r.total)}
                />
              )
            })}
          </div>
        </Seccion>
      )}

      <Seccion titulo="De sueldo" extra={<span className="text-faint">los que liquida el estudio</span>}>
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
