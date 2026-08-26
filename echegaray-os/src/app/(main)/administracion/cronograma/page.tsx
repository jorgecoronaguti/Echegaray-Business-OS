import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { Editor, type FilaEditor } from './Editor'

// COBROS POR OBRA — el cronograma que ve el cliente en su portal, editable acá.
//
// ═══ QUÉ EXISTE HOY Y POR QUÉ NO ALCANZA ═══
//
// El cronograma vive en la pestaña Cobranzas del Sheet y se copia a Postgres con
// `portal-sembrar.mjs`. Eso alcanza para poblarlo, no para CORREGIRLO: el Sheet agrupa por cliente y
// muchas filas no dicen a qué obra van, así que hay cobros que ninguna corrida puede imputar sola. Y
// una corrección hecha en el Sheet tarda hasta la próxima siembra en llegarle al cliente.
//
// Esta pantalla escribe directo sobre lo que el portal lee. Es la única forma de que administración
// arregle en un minuto algo que el cliente está viendo mal ahora.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cobros por obra · Echegaray Business OS' }

export default async function Cronograma({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])
  // Editar lo que un cliente ve de su plata es economía: queda en Dirección y Administración.
  if (!usuario || !veEconomia(perfil.data?.rol)) redirect('/administracion')

  const sb = createAdminClient()
  const { data: obras } = await sb
    .from('obras')
    .select('id, nombre, estado, monto_contratado, clientes(nombre_comercial)')
    .order('estado').order('nombre')

  const elegida = (await searchParams).obra ?? obras?.[0]?.id
  const { data: pagos } = elegida
    ? await sb.from('pago_programado').select('*').eq('obra_id', elegida).order('orden')
    : { data: [] }

  const obra = obras?.find((o) => String(o.id) === String(elegida))
  const filas: FilaEditor[] = (pagos ?? []).map((p) => ({
    id: String(p.id),
    orden: Number(p.orden),
    tipo: String(p.tipo),
    rotulo: String(p.rotulo),
    // El monto se edita en es-AR, como lo tipea una persona: el punto es miles.
    monto: p.monto == null ? '' : Number(p.monto).toLocaleString('es-AR', { maximumFractionDigits: 2 }),
    moneda: String(p.moneda ?? 'ARS'),
    fechaPrevista: p.fecha_prevista ? String(p.fecha_prevista).slice(0, 10) : '',
    fechaPago: p.fecha_pago ? String(p.fecha_pago).slice(0, 10) : '',
    facturaNumero: p.factura_numero ?? '',
    reciboNumero: p.recibo_numero ?? '',
    estado: p.estado ?? '',
    nota: p.nota ?? '',
  }))

  return (
    <div className="px-4 py-6 md:px-8">
      <h1 className="text-xl font-semibold tracking-[-.01em]">Cobros por obra</h1>
      <p className="mt-1 text-[13px] text-muted">
        Esto es exactamente lo que el cliente ve en su portal. Se guarda y lo ve en la pantalla siguiente.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Obras">
        {(obras ?? []).map((o) => {
          const activa = String(o.id) === String(elegida)
          const cliente = (o.clientes as { nombre_comercial?: string } | null)?.nombre_comercial ?? ''
          return (
            <Link
              key={String(o.id)}
              href={`/administracion/cronograma?obra=${o.id}`}
              className={
                'flex min-h-10 items-center rounded-control px-3 text-[13px] ' +
                (activa ? 'bg-marca font-semibold text-ink' : 'border border-line bg-surface text-muted hover:text-ink')
              }
            >
              {String(o.nombre)}
              <span className="ml-2 text-[11px] text-faint">{cliente.replace(/^\((.*)\)$/, '$1')}</span>
            </Link>
          )
        })}
      </nav>

      {obra ? (
        <Editor obraId={String(obra.id)} obra={String(obra.nombre)} inicial={filas} />
      ) : (
        <p className="mt-6 text-sm text-muted">No hay obras cargadas.</p>
      )}
    </div>
  )
}
