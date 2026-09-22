import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C } from '@/shared/components/movil/tokens'
import { AvisoError, mono } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMisEntregas } from '@/features/efectivo/campo/datos'
import { abiertas, conVuelta, destino, entregaParaRendir, pesos } from '@/features/efectivo/campo/logica'
import { FilaAcceso, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { SinEfectivo } from '@/features/efectivo/campo/components/TarjetasHoy'
import { CamaraTicket } from '@/features/efectivo/campo/components/CamaraTicket'

// M04 · LA FOTO DEL TICKET — con la entrega ya elegida, la pantalla ES la cámara.
//
// Si hay dos entregas abiertas (Galpón 8 y Estructura, por ejemplo) primero se pregunta a cuál va el
// gasto: se imputa a la obra de la entrega, y adivinar es cargar un corralón a la obra equivocada.
// M05 («Lo que leyó, a confirmar») no se construye: la lectura la hace el worker después de subir
// (ver `CamaraTicket`).

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string; entrega?: string }>

export default async function RendirPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams
  const ctx = await contextoEfectivo(sp)

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Rendir un gasto" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
        <SinVinculo que="el efectivo que te entregaron" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }

  const lectura = await getMisEntregas(ctx.supabase, ctx.personaId)
  if (lectura.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Rendir un gasto" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{lectura.error}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const elegida = entregaParaRendir(lectura.dato, sp.entrega)
  if (elegida) {
    return (
      <CamaraTicket
        entrega={elegida.id}
        destino={destino(elegida)}
        volverA={ctx.volverA}
        alTerminar={conVuelta('/mi-informacion/efectivo/rendiciones?enviado=1', ctx.sufijo)}
      />
    )
  }

  const vivas = abiertas(lectura.dato)
  return (
    <PantallaEmpleado titulo="Rendir un gasto" sub="¿De qué entrega salió la plata?" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
      {vivas.length === 0 ? <SinEfectivo esperandoFirma={false} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="rendir-elegir-entrega">
          {vivas.map((e) => (
            <FilaAcceso key={e.id} href={conVuelta(`/mi-informacion/efectivo/rendir?entrega=${e.id}`, ctx.sufijo)}>
              <span style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
                <span>{destino(e)}</span>
                <span style={{ fontSize: 12.5, color: C.muted }}>
                  {e.codigo} · te queda <span style={mono}>{pesos(e.en_su_poder)}</span>
                </span>
              </span>
            </FilaAcceso>
          ))}
        </div>
      )}
    </PantallaEmpleado>
  )
}
