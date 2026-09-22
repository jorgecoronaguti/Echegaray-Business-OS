import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C } from '@/shared/components/movil/tokens'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMiEfectivo } from '@/features/efectivo/campo/datos'
import { abiertas, cifra, conVuelta, destino, pesos, resumenMiEfectivo } from '@/features/efectivo/campo/logica'
import { Caja, CifraGrande, Contorno, Pie, Renglon, Rotulo, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { SinEfectivo } from '@/features/efectivo/campo/components/TarjetasHoy'

// M08 · DEVOLVER EL VUELTO — cuánto tenés en la mano y quién registra la devolución.
//
// ═══ SIN «DEVOLVER Y FIRMAR», Y ES A PROPÓSITO (dueño, 22/09) ═══
//
// El mockup deja a la persona cargar el monto y elegir a quién. La función de la base
// (`registrar_devolucion_efectivo`) exige Administración: la devolución la registra QUIEN RECIBE la
// plata, que es el que la cuenta. Un formulario acá sería un botón que la base rechaza siempre. La
// pantalla dice cuánto tiene, qué parte todavía no está en Compras, y a quién llevársela.

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string }>

export default async function DevolverPage({ searchParams }: { searchParams: Params }) {
  const ctx = await contextoEfectivo(await searchParams)
  const volver = { href: ctx.volverA, label: 'Mi efectivo' }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Devolver efectivo" volver={{ ...volver }}>
        <SinVinculo que="el efectivo que te entregaron" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }
  const lectura = await getMiEfectivo(ctx.supabase, ctx.personaId)
  if (lectura.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Devolver efectivo" volver={{ ...volver }}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{lectura.error}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const r = resumenMiEfectivo(lectura.dato.entregas, lectura.dato.tickets)
  const enLaMano = Math.max(0, r.tengoQueRendir)
  const quienes = [...new Set(r.entregas.map((e) => e.entregada_por_nombre).filter((n): n is string => !!n))]

  return (
    <PantallaEmpleado titulo="Devolver efectivo" volver={{ ...volver }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 110px)' }}>
        {r.entregas.length === 0 ? <SinEfectivo esperandoFirma={abiertas(lectura.dato.entregas).some((e) => !e.conformidad)} /> : (
          <Caja testid="devolver-en-la-mano">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Rotulo>Tenés en la mano</Rotulo>
              <CifraGrande>{pesos(enLaMano)}</CifraGrande>
            </div>
            {r.pendienteMonto > 0 && (
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, paddingTop: 12, borderTop: `1px solid ${C.divisorSuave}` }}>
                Los {cifra(r.pendienteMonto)} que mandaste todavía no están en Compras: si devolvés todo, van a quedar
                sin respaldo.
              </div>
            )}
          </Caja>
        )}

        {r.entregas.length > 0 && (
          <Caja gap={12} relleno="14px 16px" testid="devolver-quien-registra">
            <Rotulo>Quién la registra</Rotulo>
            <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
              Llevale el efectivo a {quienes.length ? quienes.join(' o ') : 'Administración'}. La devolución la registra
              quien recibe la plata, cuando la cuenta; en ese momento tu saldo baja acá solo.
            </div>
            {r.entregas.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 10, borderTop: `1px solid ${C.divisor}` }}>
                {r.entregas.map((e) => (
                  <Renglon key={e.id} rotulo={`${e.codigo} · ${destino(e)}`} valor={pesos(e.en_su_poder)} numero />
                ))}
              </div>
            )}
          </Caja>
        )}

        <Pie>
          {r.entregas.length > 0 && (
            <Contorno href={conVuelta('/mi-informacion/efectivo/rendir', ctx.sufijo)} testid="devolver-primero-rendir">
              Primero rendí lo que gastaste
            </Contorno>
          )}
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, textAlign: 'center' }}>
            Lo que no gastaste vuelve a la caja. Lo que gastaste, se rinde con el ticket.
          </div>
        </Pie>
      </div>
    </PantallaEmpleado>
  )
}
