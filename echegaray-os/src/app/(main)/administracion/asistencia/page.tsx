// M05 · CORRECCIONES DE ASISTENCIA — la bandeja de lo que el plantel pidió corregir.
//
// ═══ POR QUÉ ES UNA PANTALLA Y NO UN BLOQUE DENTRO DE PERSONAS ═══
//
// `/administracion/personas` es el MAESTRO: quién trabaja acá, con qué legajo y qué categoría. Un
// pedido de corrección no es un atributo de una persona, es una COLA DE TRABAJO con dos salidas
// —aprobar o rechazar— y con antigüedad, que es lo que ordena atenderla. Meterla adentro de la
// ficha de cada persona la volvería invisible: nadie abre sesenta legajos a ver si alguno pidió algo.
//
// El vecino natural es `/administracion/pendientes`, que también es una cola. Se dejan separadas
// porque resuelven cosas distintas con criterios distintos: allá se decide a qué obra pertenece un
// texto; acá, si una hora que alguien declara es cierta.
//
// ═══ APROBAR ESCRIBE EN LA ASISTENCIA REAL ═══
//
// El botón no cambia el estado del pedido: llama a `aprobar_correccion_asistencia()`, que inserta la
// salida en `asistencia_marca` y recién entonces marca la solicitud, en la misma transacción. La
// prueba de que ocurrió es `marca_id` — se muestra en las resueltas justamente para que el efecto se
// pueda mirar, en vez de creerle al estado.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { PageShell } from '@/shared/components/ui'
import { Aviso, Estado, Eyebrow, Num, Vacio } from '@/shared/components/ds'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { ResolverCorreccion } from '@/features/administracion/components/ResolverCorreccion'
import {
  getCorrecciones, type CorreccionEnBandeja,
} from '@/features/administracion/services/correccionAsistenciaService'
import { horaCorta } from '@/features/empleado/services/correccion'
import { hora } from '@/features/empleado/services/asistencia'
import { dm } from '@/features/empleado/services/fecha'

export const dynamic = 'force-dynamic'

/** Un pedido pendiente: quién, qué día, qué hora propone y contra qué entrada. */
function FilaPendiente({ c }: { c: CorreccionEnBandeja }) {
  return (
    <div
      data-testid="correccion-pendiente"
      data-fecha={c.fecha}
      className="flex flex-col gap-3 border-b border-[#EFEEEA] py-4 last:border-0 lg:flex-row lg:items-start lg:gap-8"
    >
      <div className="min-w-0 flex-1">
        {/* Sin legajo al lado del nombre: `personas.legajo` no tiene grant para `authenticated` y
            nombrarla en la vista la haría fallar entera. El nombre completo alcanza para saber de
            quién es el pedido. */}
        <p className="text-[14px] font-medium text-ink">{c.nombre_completo}</p>
        <p className="mt-1 text-[12.5px] text-muted">
          <Num className="text-ink">{dm(c.fecha)}</Num> · entrada{' '}
          <Num className="text-ink">{hora(c.entrada) ?? 'sin registrar'}</Num> · salida que pide{' '}
          <Num className="text-warn">{horaCorta(c.hora_propuesta) ?? '—'}</Num>
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink">«{c.motivo}»</p>
        {/* Que la salida ya exista NO es normal acá —el pedido nace de un día sin salida— y si pasó,
            aprobar la va a PISAR. Se avisa antes, no después. */}
        {c.salida && (
          <p className="mt-1.5 text-[12px] text-warn" data-testid="ya-tiene-salida">
            Ojo: ese día ya tiene salida registrada a las {hora(c.salida)}. Aprobar la reemplaza.
          </p>
        )}
      </div>
      <div className="w-full shrink-0 lg:w-[380px]">
        <ResolverCorreccion id={c.id} />
      </div>
    </div>
  )
}

/** Una resuelta: el efecto, no el trámite. `marca_id` es la prueba de que llegó a la asistencia. */
function FilaResuelta({ c }: { c: CorreccionEnBandeja }) {
  const aprobada = c.estado === 'aprobada'
  return (
    <div
      data-testid="correccion-resuelta-fila"
      data-estado={c.estado}
      className="flex items-baseline gap-3 border-b border-[#EFEEEA] py-2.5 last:border-0 text-[12.5px]"
    >
      <span className="w-[64px] shrink-0 font-mono tabular-nums text-ink">{dm(c.fecha)}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{c.nombre_completo}</span>
      <span className="w-[64px] shrink-0 text-right font-mono tabular-nums text-muted">
        {horaCorta(c.hora_propuesta) ?? '—'}
      </span>
      <span className="w-[150px] shrink-0 text-right">
        <Estado tono={aprobada ? 'pos' : 'nulo'} clave={c.estado}>
          {aprobada ? (c.marca_id ? 'escrita en la asistencia' : 'aprobada SIN marca') : 'rechazada'}
        </Estado>
      </span>
    </div>
  )
}

export default async function CorreccionesAsistenciaPage() {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)

  // LA PUERTA NO ES LA CERRADURA: la policy de `solicitud_correccion_asistencia` y el portero de
  // `aprobar_correccion_asistencia()` deciden de verdad. Este `if` evita mostrarle a alguien del
  // nivel campo una pantalla que le va a salir vacía.
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <PageShell title="Correcciones de asistencia">
        <NavAdministracion />
        <Aviso tono="info">Esta pantalla es de Administración.</Aviso>
      </PageShell>
    )
  }

  const [pendientes, aprobadas, rechazadas] = await Promise.all([
    getCorrecciones(supabase, 'pendiente'),
    getCorrecciones(supabase, 'aprobada'),
    getCorrecciones(supabase, 'rechazada'),
  ])

  const resueltas = [...(aprobadas.data ?? []), ...(rechazadas.data ?? [])]
    .sort((a, b) => (a.resuelta_en ?? '') < (b.resuelta_en ?? '') ? 1 : -1)
    .slice(0, 30)

  return (
    <PageShell
      title="Correcciones de asistencia"
      subtitle="Días sin salida que el plantel pidió corregir. Aprobar escribe la salida en la asistencia real; rechazar deja el día como está."
    >
      <NavAdministracion />

      {pendientes.error && (
        <div data-testid="correcciones-error">
          <Aviso tono="neg" titulo="No pude leer los pedidos">{pendientes.error}</Aviso>
        </div>
      )}

      <Eyebrow className="mb-1">
        Pendientes{pendientes.data ? ` · ${pendientes.data.length}` : ''}
      </Eyebrow>
      <div data-testid="bandeja-pendientes" className="mb-8">
        {/* SIN LECTURA NO HAY VACÍO. Un «no hay nada pendiente» cuando la consulta falló afirma algo
            que no se sabe: el error de arriba ya lo dice y acá no se agrega una segunda versión. */}
        {pendientes.data && pendientes.data.length === 0 && (
          <Vacio>Nadie pidió corregir un día. Los pedidos salen de «Mi información · Asistencia».</Vacio>
        )}
        {(pendientes.data ?? []).map((c) => <FilaPendiente key={c.id} c={c} />)}
      </div>

      {resueltas.length > 0 && (
        <>
          <Eyebrow className="mb-1">Últimas resueltas</Eyebrow>
          <div data-testid="bandeja-resueltas">
            {resueltas.map((c) => <FilaResuelta key={c.id} c={c} />)}
          </div>
          <p className="mt-3 max-w-[760px] text-[11.5px] leading-relaxed text-faint">
            «Escrita en la asistencia» significa que la aprobación dejó la marca real en el día de esa
            persona. Una aprobada SIN marca es una inconsistencia y hay que mirarla: quiere decir que
            el estado del pedido cambió y la asistencia no.
          </p>
        </>
      )}
    </PageShell>
  )
}
