import { z } from 'zod'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { C } from '@/shared/components/movil/tokens'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { conVuelta, diaHora } from '@/features/efectivo/campo/logica'
import { Caja, NoRinde } from '@/features/efectivo/campo/components/Piezas'
import { FirmarRecibo } from '@/features/efectivo/components/FirmarRecibo'
import { leerManualConEntrega, leerReciboFirmado, leerReciboParaFirmar } from '@/features/efectivo/services/reciboDatos'

// FIRMAR EL RECIBO DE UN GASTO MANUAL, EN EL TELÉFONO (dueño, 01/10/2026).
//
// El proveedor del servicio no es usuario de la app: firma con el dedo en el teléfono de quien rindió el
// gasto (el jefe de obra o Administración), que se lo alcanza. Es el hermano de `firmar/` (la conformidad de
// quien recibe efectivo) y usa el mismo recuadro. La rendición viaja en la query, como en el resto del árbol
// (`[param]` es detalle de una sección; una acción sobre algo lleva su id en la query).

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ desde?: string; obra?: string; por?: string; rendicion?: string }> }

export default async function FirmarReciboPage({ searchParams }: Props) {
  const sp = await searchParams
  const ctx = await contextoEfectivo(sp)
  const volver = { href: conVuelta('/mi-informacion/efectivo/rendiciones', ctx.sufijo), label: 'Rendiciones' }
  const titulo = 'Firmar recibo'

  if (!ctx.puedeRendir) return <PantallaEmpleado titulo={titulo} volver={volver}><NoRinde /></PantallaEmpleado>
  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo={titulo} volver={volver}>
        <SinVinculo que="el efectivo que te entregaron" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }

  const id = z.string().uuid().safeParse(sp.rendicion).success ? String(sp.rendicion) : null
  const leida = id ? await leerManualConEntrega(ctx.supabase, id) : null
  const firmado = leida ? await leerReciboFirmado(ctx.supabase, leida.rendicion.id) : null
  const porFirmar = leida && !firmado ? await leerReciboParaFirmar(leida.rendicion, leida.entrega) : null

  return (
    <PantallaEmpleado titulo={titulo} sub={leida ? `Gasto rendido contra ${leida.entrega.codigo}. Firma quien prestó el servicio.` : undefined} volver={volver}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 110px)' }}>
        {!leida && <AvisoError testid="recibo-no-existe">Ese gasto no existe, o no es de una entrega que puedas ver.</AvisoError>}
        {leida && firmado && (
          <Caja gap={7} relleno="16px 18px" testid="recibo-ya-firmado">
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>El recibo de este gasto ya está firmado</div>
            <div style={{ fontSize: 13, color: C.muted }}>Lo firmó {firmado.aclaracion} el {diaHora(firmado.firmado_en)}.</div>
          </Caja>
        )}
        {leida && !firmado && !porFirmar && <AvisoError testid="recibo-sin-importe">Este gasto no tiene un importe válido para un recibo.</AvisoError>}
        {porFirmar && <FirmarRecibo rendicion={porFirmar.rendicion} frase={porFirmar.frase} volverA={volver.href} />}
      </div>
    </PantallaEmpleado>
  )
}
