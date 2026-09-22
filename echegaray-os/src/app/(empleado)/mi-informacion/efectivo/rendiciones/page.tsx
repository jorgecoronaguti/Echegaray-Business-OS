import Link from 'next/link'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C, R } from '@/shared/components/movil/tokens'
import { AvisoError, TarjetaLista, Vacio, mono } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMiEfectivo } from '@/features/efectivo/campo/datos'
import { abiertas, conVuelta, estadoVisible } from '@/features/efectivo/campo/logica'
import { Caja, FilaTicket, Pie, Primario, SinPublicar } from '@/features/efectivo/campo/components/Piezas'

// M06 · MIS RENDICIONES — porte de `efectivo-a-rendir.dc.html`, pantalla M06.
//
// Es la pantalla que reemplaza a M05: cada foto mandada aparece acá con su estado VIVO, que deriva la
// base (`efectivo_comprobante_estado`) y cambia solo cuando el worker termina. «Aceptado» del mockup
// es «en Compras»: nadie acepta el ticket, entra (dueño, 22/09).

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string; filtro?: string; enviado?: string }>

export default async function RendicionesPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams
  const ctx = await contextoEfectivo(sp)
  const volver = { href: ctx.volverA, label: 'Mi efectivo' }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Mis rendiciones" volver={{ ...volver }}>
        <SinVinculo que="tus rendiciones" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }
  const lectura = await getMiEfectivo(ctx.supabase, ctx.personaId)
  if (lectura.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Mis rendiciones" volver={{ ...volver }}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{lectura.error}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const { entregas, tickets } = lectura.dato
  const piden = tickets.filter((t) => estadoVisible(t).pideDato)
  const soloPiden = sp.filtro === 'piden'
  const lista = soloPiden ? piden : tickets
  const ruta = (h: string) => conVuelta(`/mi-informacion/efectivo${h}`, ctx.sufijo)

  return (
    <PantallaEmpleado titulo="Mis rendiciones" volver={{ ...volver }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 'calc(100vh - 110px)' }}>
        <div style={{ display: 'flex', gap: 8, marginTop: -6 }} data-testid="filtros-rendiciones">
          <Filtro href={ruta('/rendiciones')} texto="Todas" cuenta={tickets.length} activo={!soloPiden} />
          <Filtro href={ruta('/rendiciones?filtro=piden')} texto="Te piden" cuenta={piden.length} activo={soloPiden} aviso />
        </div>

        {sp.enviado && (
          <Caja fondo={C.posFondo} borde={C.posBorde} gap={4} relleno="12px 16px" testid="rendicion-enviada">
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.pos }}>Mandado</div>
            <div style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5 }}>
              El OS lee el ticket y lo carga solo en Compras. El estado cambia acá abajo, sin recargar.
            </div>
          </Caja>
        )}

        {lista.length === 0 ? (
          <Vacio testid="rendiciones-vacio">
            {soloPiden ? 'No te piden ningún dato.' : 'Todavía no mandaste ningún ticket. Sacale una foto con «Rendir un gasto».'}
          </Vacio>
        ) : (
          <TarjetaLista testid="lista-rendiciones">
            {lista.map((t, i) => (
              <FilaTicket
                key={t.id}
                t={t}
                // M05: el que espera confirmación va DERECHO a confirmarse. El detalle de un ticket
                // cuenta en qué está; éste no necesita que le cuenten, necesita que lo miren.
                href={ruta(t.estado === 'a_confirmar' ? `/rendir/confirmar?ticket=${t.id}` : `/rendiciones/${t.id}`)}
                ultima={i === lista.length - 1}
              />
            ))}
          </TarjetaLista>
        )}
        {lista.length > 0 && (
          <div style={{ fontSize: 12.5, color: C.muted }}>
            {lista.length} {lista.length === 1 ? 'ticket' : 'tickets'} · «en Compras» quiere decir que ya es gasto de la obra.
          </div>
        )}

        {abiertas(entregas).length > 0 && (
          <Pie><Primario href={ruta('/rendir')} icono="foto" testid="rendir-otro">Rendir un gasto</Primario></Pie>
        )}
      </div>
    </PantallaEmpleado>
  )
}

/** La pastilla de M06: grafito la elegida, contorno la otra. El objetivo llega a 48 con su relleno. */
function Filtro({ href, texto, cuenta, activo, aviso }: { href: string; texto: string; cuenta: number; activo: boolean; aviso?: boolean }) {
  return (
    <Link href={href} prefetch={false} aria-current={activo ? 'true' : undefined} style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}>
      <span style={{
        height: 34, padding: '0 13px', borderRadius: R.pastilla, display: 'flex', alignItems: 'center', fontSize: 13,
        background: activo ? C.grafito : C.surface, color: activo ? C.surface : C.inkSuave,
        border: activo ? 'none' : `1px solid ${C.lineaFuerte}`, fontWeight: activo ? 500 : 400,
      }}>
        {texto}
        <span style={{ ...mono, fontSize: 11, marginLeft: 6, color: activo ? C.grafitoTenue : aviso && cuenta ? C.warn : C.faint }}>{cuenta}</span>
      </span>
    </Link>
  )
}
