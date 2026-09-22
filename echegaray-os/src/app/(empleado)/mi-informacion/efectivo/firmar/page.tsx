import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C } from '@/shared/components/movil/tokens'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMisEntregas } from '@/features/efectivo/campo/datos'
import { destino, diaHora, pesos } from '@/features/efectivo/campo/logica'
import { Caja, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { FirmarConformidad } from '@/features/efectivo/campo/components/FirmarConformidad'

// M02 · FIRMAR LA CONFORMIDAD — porte de `efectivo-a-rendir.dc.html`, pantalla M02.
//
// El texto del pie cambia respecto del mockup por decisión del dueño (22/09): la firma con el dedo
// ALCANZA como conformidad interna y convive con el papel firmado. «El valor legal … está a definir»
// ya no es cierto. Tampoco se dice «desde dónde se firmó»: la función de la base guarda el trazo y la
// hora, no la ubicación, y la pantalla no promete lo que no queda guardado.

export const dynamic = 'force-dynamic'

// LA ENTREGA VIAJA EN LA QUERY, como en «rendir» (dueño, 22/09/2026: «no me parece q esté siguiendo el árbol
// de urls»). En este árbol `[param]` es el DETALLE de una sección —`documentos/[documento]`,
// `recibos/[recibo]`, `rendiciones/[ticket]`— y una acción sobre algo lleva su id en la query. `firmar/<id>`
// era la única ruta con forma de verbo + id.
type Props = {
  searchParams: Promise<{ desde?: string; obra?: string; entrega?: string }>
}

export default async function FirmarPage({ searchParams }: Props) {
  const sp = await searchParams
  const id = sp.entrega ?? ''
  const ctx = await contextoEfectivo(sp)

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Firmar" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
        <SinVinculo que="el efectivo que te entregaron" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }

  const lectura = await getMisEntregas(ctx.supabase, ctx.personaId)
  const e = lectura.estado === 'ok' ? lectura.dato.find((x) => x.id === id) ?? null : null

  return (
    <PantallaEmpleado titulo="Firmar" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 110px)' }}>
        {lectura.estado === 'sin-publicar' && <SinPublicar />}
        {lectura.estado === 'error' && <AvisoError>{lectura.error}</AvisoError>}
        {lectura.estado === 'ok' && !e && (
          <AvisoError testid="firmar-no-es-tuya">Esa entrega no está a tu nombre, o ya no existe.</AvisoError>
        )}
        {e && e.conformidad && (
          <Caja gap={7} relleno="16px 18px" testid="firmar-ya-firmada">
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{e.codigo} ya tiene tu conformidad</div>
            <div style={{ fontSize: 13, color: C.muted }}>
              {e.conformidad_en ? `La firmaste el ${diaHora(e.conformidad_en)}.` : 'Administración cargó el papel firmado.'}
            </div>
          </Caja>
        )}
        {e && !e.conformidad && e.estado === 'abierta' && (
          <>
            <Caja gap={7} relleno="16px 18px" testid="firmar-texto">
              <div style={{ fontSize: 13, color: C.muted }}>Recibo {pesos(e.entregado)} en efectivo para {destino(e)}</div>
              <div style={{ fontSize: 13, color: C.muted }}>y me comprometo a rendirlos con comprobante.</div>
            </Caja>
            <FirmarConformidad entrega={e.id} volverA={ctx.volverA} />
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Queda el trazo, la fecha y la hora. Vale como conformidad interna, igual que el papel firmado: los
              dos conviven.
            </div>
          </>
        )}
      </div>
    </PantallaEmpleado>
  )
}
