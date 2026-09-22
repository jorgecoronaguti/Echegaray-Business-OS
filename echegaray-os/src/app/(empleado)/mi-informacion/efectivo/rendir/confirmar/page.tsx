import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C, R } from '@/shared/components/movil/tokens'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMiEfectivo, urlDeLaFoto } from '@/features/efectivo/campo/datos'
import {
  aConfirmar, aNumero, conVuelta, destino, fechaLarga, pesos, renglonesDelTicket,
} from '@/features/efectivo/campo/logica'
import { Caja, Renglon, Rotulo, SinPublicar } from '@/features/efectivo/campo/components/Piezas'
import { ConfirmarLectura } from '@/features/efectivo/campo/components/ConfirmarLectura'

// M05 · LO QUE LEYÓ, A CONFIRMAR — porte de `efectivo-a-rendir.dc.html`, pantalla M05.
//
// ═══ POR QUÉ LLEGA DESPUÉS DE LA FOTO Y NO EN EL MISMO GESTO ═══
//
// El mockup dibuja la confirmación pegada a la cámara, como si el teléfono leyera el ticket. No lo lee:
// lo lee el circuito de comprobantes en la VM, el mismo que carga Compras. Entre la foto y la lectura
// pasan segundos o minutos, y el teléfono no puede fabricar una lectura para no hacer esperar. Así que
// la pantalla es la misma del diseño, pero se entra a ella cuando la lectura está: desde «Mi efectivo»,
// desde la fila de M06, o sola al volver si quedó alguna pendiente.
//
// Lo que NO cambió del diseño: hasta que la persona toque «Está bien · enviar», en Compras no hay nada.
// Ese total es el que le baja el saldo.
//
// ═══ LA ENTREGA Y EL TICKET VIAJAN EN LA QUERY ═══
//
// `[param]` en este árbol es el DETALLE de una sección (`rendiciones/[ticket]`); una acción sobre algo
// lleva su id en la query, como `firmar?entrega=`. Esto es una acción: `rendir/confirmar?ticket=`.
//
// SIN TICKET se toma el más viejo por confirmar, que es lo que hace falta para encadenar «1 de 2» sin
// que la persona vuelva a una lista en el medio.

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string; ticket?: string }>

export default async function ConfirmarPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams
  const ctx = await contextoEfectivo(sp)
  const volver = { href: conVuelta('/mi-informacion/efectivo', ctx.sufijo), label: 'Mi efectivo' }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Confirmar el gasto" volver={{ ...volver }}>
        <SinVinculo que="tus rendiciones" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }

  const lectura = await getMiEfectivo(ctx.supabase, ctx.personaId)
  if (lectura.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Confirmar el gasto" volver={{ ...volver }}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{lectura.error}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const cola = aConfirmar(lectura.dato.tickets)
  const t = sp.ticket ? cola.find((x) => x.id === sp.ticket) ?? null : cola[0] ?? null

  if (!t) {
    return (
      <PantallaEmpleado titulo="Confirmar el gasto" volver={{ ...volver }}>
        <Caja gap={8} relleno="16px 18px" testid="confirmar-nada-pendiente">
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>No hay nada que confirmar</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {sp.ticket
              ? 'Ese ticket ya lo confirmaste, o todavía se está leyendo. Cuando esté leído aparece acá.'
              : 'Cuando el OS termine de leer un ticket tuyo, te va a pedir que mires si está bien.'}
          </div>
        </Caja>
      </PantallaEmpleado>
    )
  }

  // Un ticket puede traer más de un renglón (dos facturas en una foto): se muestran todos, no el primero.
  const renglones = renglonesDelTicket(t)
  const total = renglones.map((r) => aNumero(r.total)).filter((n): n is number => n != null)
    .reduce<number | null>((s, n) => (s ?? 0) + n, null)
  const fecha = fechaLarga(renglones.map((r) => r.fecha).find((f) => !!f) ?? null)
  const comercio = renglones.map((r) => r.proveedor?.trim()).find((x) => !!x) ?? null
  const entrega = lectura.dato.entregas.find((e) => e.id === t.entrega_id) ?? null
  const foto = await urlDeLaFoto(ctx.supabase, t.storage_path)
  const indice = cola.findIndex((x) => x.id === t.id) + 1

  const siguiente = cola.find((x) => x.id !== t.id)
  const alTerminar = conVuelta(
    siguiente ? `/mi-informacion/efectivo/rendir/confirmar?ticket=${siguiente.id}` : '/mi-informacion/efectivo/rendiciones',
    ctx.sufijo,
  )
  const aLaCamara = conVuelta(
    entrega ? `/mi-informacion/efectivo/rendir?entrega=${entrega.id}` : '/mi-informacion/efectivo/rendir',
    ctx.sufijo,
  )

  return (
    <PantallaEmpleado
      titulo="Confirmar el gasto"
      sub={cola.length > 1 ? `${indice} de ${cola.length}` : undefined}
      volver={{ ...volver }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 110px)' }}>
        {foto ? (
          <a
            href={foto}
            target="_blank"
            rel="noreferrer"
            data-testid="confirmar-ver-la-foto"
            style={{
              minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              color: C.inkSuave, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.control,
            }}
          >
            Ver la foto
          </a>
        ) : (
          // La policy deja leer sólo la carpeta propia. Si no se pudo firmar la URL se dice, no se
          // dibuja un botón que no abre nada.
          <div data-testid="confirmar-sin-foto" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            No pude abrir la foto de este ticket. Los datos de abajo son los que se leyeron de ella.
          </div>
        )}

        <Caja gap={11} testid="confirmar-lo-leido">
          <Rotulo>Lo que se leyó</Rotulo>
          <Renglon rotulo="Comercio" valor={comercio ?? 'no se pudo leer'} color={comercio ? C.ink : C.warn} testid="leido-comercio" />
          <Renglon rotulo="Total" valor={total == null ? 'no se pudo leer' : pesos(total)} numero={total != null} color={total == null ? C.warn : C.ink} testid="leido-total" />
          <Renglon rotulo="Fecha" valor={fecha ?? 'no se pudo leer'} numero={!!fecha} color={fecha ? C.ink : C.warn} testid="leido-fecha" />
          <Renglon
            rotulo="Obra"
            valor={entrega ? `${destino(entrega)} · de tu entrega` : t.entrega}
            testid="leido-obra"
          />
        </Caja>

        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
          {/* El mockup dice «se toca el dato y se corrige». No hay corrección desde acá y se dice por qué:
              la única escritura del teléfono sobre un ticket es la respuesta a lo que Administración pide
              (M07). Prometer un campo que no existe es peor que no tenerlo. */}
          Si algo está mal, sacá la foto de nuevo. El rubro lo pone Administración al imputar: no es tu trabajo.
        </div>

        <ConfirmarLectura ticket={t.id} alTerminar={alTerminar} aLaCamara={aLaCamara} />
      </div>
    </PantallaEmpleado>
  )
}
