import { redirect } from 'next/navigation'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C } from '@/shared/components/movil/tokens'
import { AvisoError, mono } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getEntregasAbiertasDeTodos, getMisEntregas } from '@/features/efectivo/campo/datos'
import { abiertas, conVuelta, destino, entregaParaRendir, personaDePor, pesos } from '@/features/efectivo/campo/logica'
import { Caja, FilaAcceso, NoRinde, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { SinEfectivo } from '@/features/efectivo/campo/components/TarjetasHoy'
import { entregaPedida, hrefDeRendir } from '@/features/efectivo/campo/rendir-por'
import { CamaraTicket } from '@/features/efectivo/campo/components/CamaraTicket'

// M04 · LA FOTO DEL TICKET — con la entrega ya elegida, la pantalla ES la cámara.
//
// Si hay dos entregas abiertas (Galpón 8 y Estructura, por ejemplo) primero se pregunta a cuál va el
// gasto: se imputa a la obra de la entrega, y adivinar es cargar un corralón a la obra equivocada.
// M05 («Lo que leyó, a confirmar») no se construye: la lectura la hace el worker después de subir
// (ver `CamaraTicket`).

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string; por?: string; entrega?: string }>

export default async function RendirPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams
  const ctx = await contextoEfectivo(sp)

  if (!ctx.puedeRendir) {
    return (
      <PantallaEmpleado titulo="Rendir un gasto" volver={{ href: ctx.volverA, label: ctx.porOtro ? 'Efectivo' : 'Mi efectivo' }}>
        <NoRinde />
      </PantallaEmpleado>
    )
  }

  // ADMINISTRACIÓN/DIRECCIÓN sin `por=` (01/10/2026): elige la entrega de CUALQUIERA, incluida la propia. Con
  // `?entrega=ER-0147` (el enlace de la ficha) viene preelegida: si es de otra persona se sigue por `por=<persona>`,
  // que es lo que ya entienden las pantallas de después; si es la propia sigue el camino de «Mi efectivo».
  if (ctx.veEconomia && !personaDePor(sp.por)) {
    const todas = await getEntregasAbiertasDeTodos(ctx.supabase)
    if (todas.estado !== 'ok') {
      return (
        <PantallaEmpleado titulo="Rendir un gasto" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
          {todas.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{todas.error}</AvisoError>}
        </PantallaEmpleado>
      )
    }
    const pedida = entregaPedida(todas.dato, sp.entrega)
    if (pedida && pedida.persona_id !== ctx.personaId) redirect(hrefDeRendir(pedida, ctx.personaId))
    if (!pedida) {
      return (
        <PantallaEmpleado titulo="Rendir un gasto" sub="¿A qué entrega va el gasto?" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
          {todas.dato.length === 0 ? <Caja testid="efectivo-vacio" gap={9} relleno="16px 18px"><span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>No hay entregas abiertas</span></Caja> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="rendir-elegir-entrega-admin">
              {todas.dato.map((e) => (
                <FilaAcceso key={e.id} href={hrefDeRendir(e, ctx.personaId)}>
                  <span style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
                    <span>{e.persona ?? 'Sin nombre'} · {destino(e)}</span>
                    <span style={{ fontSize: 12.5, color: C.muted }}>
                      {e.codigo} · queda <span style={mono}>{pesos(e.en_su_poder)}</span>
                    </span>
                  </span>
                </FilaAcceso>
              ))}
            </div>
          )}
        </PantallaEmpleado>
      )
    }
  }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Rendir un gasto" volver={{ href: ctx.volverA, label: ctx.porOtro ? 'Efectivo' : 'Mi efectivo' }}>
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
        sinFotoHref={conVuelta(`/mi-informacion/efectivo/rendir/sin-foto?entrega=${elegida.id}`, ctx.sufijo)}
      />
    )
  }

  const vivas = abiertas(lectura.dato)
  // A nombre de otra persona el texto dice de QUIÉN es la plata: «te queda» sería falso y el que carga el ticket
  // tiene que saber a qué saldo le está bajando.
  const de = ctx.porOtro ? vivas[0]?.persona ?? 'la persona' : null
  return (
    <PantallaEmpleado titulo={de ? `Rendir por ${de}` : 'Rendir un gasto'} sub="¿De qué entrega salió la plata?" volver={{ href: ctx.volverA, label: 'Mi efectivo' }}>
      {vivas.length === 0 ? <SinEfectivo esperandoFirma={false} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="rendir-elegir-entrega">
          {vivas.map((e) => (
            <FilaAcceso key={e.id} href={conVuelta(`/mi-informacion/efectivo/rendir?entrega=${e.id}`, ctx.sufijo)}>
              <span style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
                <span>{destino(e)}</span>
                <span style={{ fontSize: 12.5, color: C.muted }}>
                  {e.codigo} · {de ? 'le queda' : 'te queda'} <span style={mono}>{pesos(e.en_su_poder)}</span>
                </span>
              </span>
            </FilaAcceso>
          ))}
        </div>
      )}
    </PantallaEmpleado>
  )
}
