import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { agruparPorCliente, estaCerrada, ubicarObra } from '@/features/administracion/services/selectorObras'
import { Editor, type FilaEditor } from './Editor'
import { SelectorObra } from './SelectorObra'

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
//
// ═══ POR QUÉ LA OBRA SE ELIGE AGRUPADA POR CLIENTE (26/08/2026) ═══
//
// El dueño: *"es un desastre lo hecho en el manejo del cronograma mezcla todas las obras"*. La
// primera versión traía todas las obras de todos los clientes en una fila de pastillas ordenada por
// `estado` y después por `nombre`: dos obras de un mismo cliente quedaban separadas por la de otro y
// de quién era cada una se leía en gris de 11px al costado. Acá lo que se guarda lo VE el cliente,
// así que elegir la obra equivocada no desordena una pantalla: le publica a un cliente los cobros de
// otro. El agrupamiento y el encabezado son la barrera contra ese error, no una mejora estética.

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
    // El orden lo decide `agruparPorCliente`: ordenar por `estado` en SQL es exactamente lo que
    // intercalaba las obras de clientes distintos.
    .select('id, nombre, estado, monto_contratado, clientes(nombre_comercial)')
    .order('nombre')

  const grupos = agruparPorCliente((obras ?? []).map((o) => ({
    id: String(o.id),
    nombre: String(o.nombre),
    estado: o.estado ? String(o.estado) : null,
    cliente: (o.clientes as { nombre_comercial?: string } | null)?.nombre_comercial ?? null,
  })))

  // Sin `?obra=` NO se elige ninguna sola: con doce obras de cinco clientes, abrir el editor sobre la
  // primera invita a guardar sobre la obra equivocada creyendo que era la que se venía editando.
  const elegida = (await searchParams).obra ?? null
  const { data: pagos } = elegida
    ? await sb.from('pago_programado').select('*').eq('obra_id', elegida).order('orden')
    : { data: [] }

  const obra = ubicarObra(grupos, elegida)
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SelectorObra grupos={grupos} elegida={obra ? obra.id : null} />
        <span className="text-[12px] text-faint">
          {grupos.length} cliente(s) · {grupos.reduce((n, g) => n + g.obras.length, 0)} obra(s)
        </span>
      </div>

      {/* DE QUIÉN Y DE QUÉ. El editor de abajo sólo dice el nombre de la obra, y «Nave 2» no alcanza
          para saber a qué cliente se le va a publicar lo que se guarde. */}
      {obra && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-card border border-line bg-surface-quiet px-4 py-3">
          <span className="text-[11px] font-semibold tracking-[.09em] text-faint">EDITANDO</span>
          <span className="text-[15px] font-semibold">{obra.cliente}</span>
          <span className="text-faint">·</span>
          <span className="text-[15px]">{obra.nombre}</span>
          {estaCerrada(obra.estado) && (
            <span className="rounded-control border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">
              obra cerrada
            </span>
          )}
        </div>
      )}

      {obra ? (
        <Editor obraId={obra.id} obra={obra.nombre} inicial={filas} />
      ) : (
        <p className="mt-6 text-sm text-muted">
          {grupos.length === 0 ? 'No hay obras cargadas.' : 'Elegí una obra arriba para ver y editar sus cobros.'}
        </p>
      )}
    </div>
  )
}
