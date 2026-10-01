import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMisEntregas } from '@/features/efectivo/campo/datos'
import { abiertas, conVuelta, destino } from '@/features/efectivo/campo/logica'
import { NoRinde, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { SinEfectivo } from '@/features/efectivo/campo/components/TarjetasHoy'
import { MARCA_RENDICION } from '@/features/efectivo/logica/url'
import { FormularioGastoManual } from '@/features/efectivo/components/FormularioGastoManual'

// RENDIR SIN FOTO (30/09/2026). El gasto que no tiene ticket —un flete, una changa, el kiosco— se tipea:
// fecha, importe, concepto y, si lo hay, el proveedor. Entra a Compras como «A rendir» sin comprobante y
// baja el saldo de la entrega en el acto, igual que un ticket. Es el MISMO formulario que Administración
// usa en el panel de la ficha (`FormularioGastoManual`): una sola lógica, dos lugares.
//
// `por=` se honra como en `/rendir`: Dirección/Administración rinden a nombre de quien recibió la plata.

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string; por?: string; entrega?: string }>

export default async function RendirSinFotoPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams
  const ctx = await contextoEfectivo(sp)
  const volver = { href: ctx.volverA, label: ctx.porOtro ? 'Efectivo' : 'Mi efectivo' }

  if (!ctx.puedeRendir) {
    return (
      <PantallaEmpleado titulo="Rendir sin foto" volver={volver}>
        <NoRinde />
      </PantallaEmpleado>
    )
  }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Rendir sin foto" volver={volver}>
        <SinVinculo que="el efectivo que te entregaron" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }

  const lectura = await getMisEntregas(ctx.supabase, ctx.personaId)
  if (lectura.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Rendir sin foto" volver={volver}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{lectura.error}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const vivas = abiertas(lectura.dato)
  const de = ctx.porOtro ? vivas[0]?.persona ?? 'la persona' : null
  return (
    <PantallaEmpleado
      titulo={de ? `Rendir por ${de} sin foto` : 'Rendir sin foto'}
      sub="Un gasto sin ticket. Va a Compras como «A rendir» y baja el saldo ahora."
      volver={volver}
    >
      {vivas.length === 0 ? <SinEfectivo esperandoFirma={false} /> : (
        <FormularioGastoManual
          entregas={vivas.map((e) => ({ id: e.id, codigo: e.codigo, rotulo: `${destino(e)} · ${e.codigo}`, enSuPoder: e.en_su_poder }))}
          entregaInicial={sp.entrega}
          volverA={ctx.volverA}
          alGuardar={conVuelta('/mi-informacion/efectivo/rendiciones', ctx.sufijo)}
          firmarRecibo={{ tipo: 'telefono', url: conVuelta(`/mi-informacion/efectivo/firmar-recibo?rendicion=${MARCA_RENDICION}`, ctx.sufijo) }}
        />
      )}
    </PantallaEmpleado>
  )
}
