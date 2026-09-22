import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { AvisoError, BarraAvance } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMiEfectivo, quienObservo, urlDeLaFoto } from '@/features/efectivo/campo/datos'
import { conVuelta, diaHora, estadoVisible, fechaDelTicket, pesos, totalDelTicket } from '@/features/efectivo/campo/logica'
import type { TicketRendicion } from '@/features/efectivo/campo/tipos'
import { Caja, Renglon, Rotulo, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { ResponderDato } from '@/features/efectivo/campo/components/ResponderDato'

// M07 · UN GASTO OBSERVADO — y, para los otros estados, las tarjetas de M12 (carga, error).
//
// El detalle de UN ticket. Si piden un dato, es M07 con su campo. Si no, dice en qué está con las
// tarjetas del catálogo de estados de M12: «Leyendo el ticket», «Este ticket ya lo habías mandado».
// «Ver el que entró» de M12 no está: la vista no dice cuál fue el ticket original, y un enlace a
// ninguna parte enseña que la pantalla miente.

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ ticket: string }>
  searchParams: Promise<{ desde?: string; obra?: string }>
}

export default async function TicketPage({ params, searchParams }: Props) {
  const { ticket: id } = await params
  const ctx = await contextoEfectivo(await searchParams)
  const volver = { href: conVuelta('/mi-informacion/efectivo/rendiciones', ctx.sufijo), label: 'Mis rendiciones' }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Mi ticket" volver={{ ...volver }}>
        <SinVinculo que="tus rendiciones" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }
  const lectura = await getMiEfectivo(ctx.supabase, ctx.personaId)
  const t = lectura.estado === 'ok' ? lectura.dato.tickets.find((x) => x.id === id) ?? null : null
  if (!t) {
    return (
      <PantallaEmpleado titulo="Mi ticket" volver={{ ...volver }}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar />
          : <AvisoError>{lectura.estado === 'error' ? lectura.error : 'Ese ticket no es de una entrega tuya, o ya no existe.'}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const v = estadoVisible(t)
  const foto = await urlDeLaFoto(ctx.supabase, t.storage_path)
  const total = totalDelTicket(t)

  if (v.pideDato) {
    const quien = t.observacion && t.observado_en ? await quienObservo(ctx.supabase, t.id) : null
    return (
      <PantallaEmpleado titulo="Te piden un dato" volver={{ ...volver }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 110px)' }}>
          <Caja fondo={C.warnFondo} borde={C.warnBorde} gap={8} relleno="16px 18px" testid="ticket-observado">
            <div style={{ fontSize: 14, fontWeight: 600, color: C.warn }}>{v.titulo}</div>
            <div style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5 }}>
              Sin eso no se puede cargar como gasto de la obra.{' '}
              {t.observacion && t.observado_en
                ? `Lo pidió ${quien ?? 'Administración'} el ${diaHora(t.observado_en)}.`
                : 'Lo marcó la lectura del ticket.'}
            </div>
          </Caja>
          <Foto url={foto} texto={`Tu foto del ${fechaDelTicket(t)}`} alto={150} />
          <ResponderDato ticket={t.id} volverA={volver.href}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 10, borderTop: `1px solid ${C.divisor}` }}>
              <Renglon rotulo="Total" valor={total == null ? 'sin leer' : pesos(total)} numero />
              <Renglon rotulo="Fecha" valor={fechaDelTicket(t)} numero />
            </div>
          </ResponderDato>
        </div>
      </PantallaEmpleado>
    )
  }

  return (
    <PantallaEmpleado titulo={v.titulo} sub={`${fechaDelTicket(t)} · ${v.etiqueta}`} volver={{ ...volver }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Estado t={t} />
        <Foto url={foto} texto={`Tu foto del ${fechaDelTicket(t)}`} alto={150} />
        <Caja gap={9} relleno="14px 16px">
          <Renglon rotulo="Total" valor={total == null ? 'sin leer' : pesos(total)} numero />
          <Renglon rotulo="Mandado" valor={diaHora(t.enviado_en)} numero />
          <Renglon rotulo="Entrega" valor={t.entrega} numero />
        </Caja>
      </div>
    </PantallaEmpleado>
  )
}

/** Las tarjetas de estado de M12 (carga, error) y la de «ya es gasto». */
function Estado({ t }: { t: TicketRendicion }) {
  switch (t.estado) {
    case 'leyendo':
      return (
        <Caja gap={9} relleno="16px 18px" testid="ticket-leyendo">
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Leyendo el ticket</div>
          <BarraAvance pct={38} color={C.grafito} alto={10} />
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Cuando termine, entra solo a Compras. No hace falta mandarlo de nuevo.</div>
        </Caja>
      )
    case 'en_compras':
      return (
        <Caja fondo={C.posFondo} borde={C.posBorde} gap={6} relleno="16px 18px" testid="ticket-en-compras">
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.pos }}>Ya es gasto de la obra</div>
          <div style={{ fontSize: 13, color: C.inkSuave }}>Está en Compras y baja lo que tenés que rendir.</div>
        </Caja>
      )
    case 'duplicado':
      return (
        <Caja fondo={C.negFondo} borde={C.negBorde} gap={9} relleno="16px 18px" testid="ticket-duplicado">
          <Rotulo color={C.neg}>Error</Rotulo>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.neg }}>Este ticket ya lo habías mandado</div>
          <div style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5 }}>No se carga dos veces.</div>
        </Caja>
      )
    case 'error':
      return (
        <Caja fondo={C.negFondo} borde={C.negBorde} gap={9} relleno="16px 18px" testid="ticket-error">
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.neg }}>No se pudo cargar</div>
          <div style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5 }}>
            {t.motivo ? `${t.motivo}. ` : ''}Se reintenta solo; si sigue así, avisale a Administración.
          </div>
        </Caja>
      )
    case 'descartado':
      return (
        <Caja gap={6} relleno="16px 18px" testid="ticket-descartado">
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Administración lo descartó</div>
          <div style={{ fontSize: 13, color: C.muted }}>{t.descartado_motivo ?? 'Sin motivo escrito.'}</div>
        </Caja>
      )
    default:
      return (
        <Caja gap={6} relleno="16px 18px" testid="ticket-contestado">
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Contestaste el dato</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {t.respuesta ? `«${t.respuesta}». ` : ''}Falta que se cargue en Compras.
          </div>
        </Caja>
      )
  }
}

/** El recuadro oscuro de la foto. Con permiso de lectura, se abre; sin él, queda el recuadro. */
function Foto({ url, texto, alto }: { url: string | null; texto: string; alto: number }) {
  const estilo = {
    height: alto, background: C.ink, borderRadius: R.tarjeta, display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: 9, color: C.faint, fontSize: 12.5, flexShrink: 0,
  } as const
  const cuerpo = <><Icono nombre="foto" tamano={20} />{texto}</>
  return url
    ? <a href={url} target="_blank" rel="noreferrer" data-testid="ticket-foto" style={estilo}>{cuerpo}</a>
    : <div data-testid="ticket-foto" style={estilo}>{cuerpo}</div>
}
