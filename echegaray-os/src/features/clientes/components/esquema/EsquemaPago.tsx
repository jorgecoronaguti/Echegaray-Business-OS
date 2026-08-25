'use client'

// 32 · CLIENTE › ESQUEMA DE PAGO — PORTE LITERAL DE «32 · Cliente Esquema de Pago.dc.html».
//
//   barra    `padding:16px 24px 0`, total mono 22px/600, leyenda de cuatro colores a la derecha
//   conmutador borde `#E7E6E2`, radio 7, activo 600 sobre `#FEF9E6`
//   cuerpo   `gap:20px; padding:14px 24px 32px`; izquierda `flex:1; minWidth:660px`; derecha 356px
//
// ═══ LA EDICIÓN ES OPTIMISTA Y SE VUELVE ATRÁS SOLA ═══
//
// Tocar una fecha o un interruptor cambia la fila ANTES de que conteste el servidor: si no, cada
// clic tendría medio segundo de nada y la pantalla se sentiría rota. Pero si la escritura falla, la
// fila VUELVE a como estaba y el error se muestra: dejar el cambio dibujado sobre una escritura que
// no ocurrió es la peor de las dos mentiras posibles acá — el admin publicaría un plan que el Sheet
// nunca recibió.
//
// Hoy `editarPago` es un stub que siempre contesta «no está conectado», así que la vuelta atrás se
// ve en cada clic. Es exactamente lo que tiene que pasar hasta que aterrice back-28-32.

import { useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { Vacio } from '../canon/Piezas'
import { useAlPedir } from '../canon/pedidos'
import { CalendarioEsquema } from './CalendarioEsquema'
import { CambiosEsquema } from './CambiosEsquema'
import { ListadoEsquema } from './ListadoEsquema'
import { PanelPago } from './PanelPago'
import { montoM } from '../../services/cobranzaFormato'
import { totalEsquema } from '../../services/reglasEsquema'
import type { CambioPago } from '../../services/entradasCobranza'
import type { EsquemaCliente, PagoEsquema } from '../../types/cobranzas'

const LEYENDA: { color: string; texto: string }[] = [
  { color: C.pos, texto: 'cobrado' },
  { color: C.curso, texto: 'a vencer' },
  { color: C.neg, texto: 'vencido' },
  { color: C.tenue, texto: 'previsto' },
]

function Conmutador({ vista, onVista }: { vista: 'listado' | 'calendario'; onVista: (v: 'listado' | 'calendario') => void }) {
  const opcion = (v: 'listado' | 'calendario', d: React.ReactNode, texto: string, primera: boolean) => (
    <button
      type="button" onClick={() => onVista(v)} data-testid={`ver-${v}`} aria-pressed={vista === v}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
        fontWeight: vista === v ? 600 : 400,
        color: vista === v ? C.tinta : C.tintaSuave,
        background: vista === v ? C.marcaSuave : C.superficie,
        padding: '7px 11px', cursor: 'pointer', fontFamily: 'inherit',
        border: 'none', borderLeft: primera ? undefined : `1px solid ${C.borde}`,
      }}
    >
      {d}
      {texto}
    </button>
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', border: `1px solid ${C.borde}`, borderRadius: '7px',
      overflow: 'hidden', background: C.superficie,
    }}>
      {opcion('calendario', <Ico d={P.calendario} s={15} />, 'Calendario', true)}
      {opcion('listado', <Ico d={P.lista} s={15} />, 'Listado', false)}
    </div>
  )
}

export function EsquemaPago({ esquema, hoy, clienteId, editarPago, publicarEsquema }: {
  esquema: EsquemaCliente | null
  hoy: string
  clienteId: string
  editarPago: (pagoId: string, cambio: CambioPago) => Promise<ResultadoAccion>
  publicarEsquema: (clienteId: string) => Promise<ResultadoAccion>
}) {
  const [pagos, setPagos] = useState<PagoEsquema[]>(esquema?.pagos ?? [])
  const [vista, setVista] = useState<'listado' | 'calendario'>('listado')
  const [elegido, setElegido] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  async function cambiar(id: string, cambio: CambioPago) {
    if (Object.keys(cambio).length === 0) return
    const antes = pagos
    setPagos((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambio, cambio_pendiente: true } : p)))
    setGuardando(id)
    setError(null)
    const r = await editarPago(id, cambio)
    setGuardando(null)
    if (!r.ok) {
      // LA FILA VUELVE. Sin esto, la pantalla mostraría la fecha nueva sobre un Sheet que quedó con
      // la vieja, y el próximo que mire va a cobrar el día equivocado.
      setPagos(antes)
      setError(r.error)
    }
  }

  useAlPedir(async (p) => {
    if (p === 'publicar') {
      setAviso(null)
      setError(null)
      const r = await publicarEsquema(clienteId)
      if (r.ok) setAviso(r.mensaje ?? 'Publicado: el cliente ya ve el esquema en el portal.')
      else setError(r.error)
    } else if (p === 'agregar-pago') {
      setAviso('«Agregar pago» crea una fila en Cobranzas y esa escritura la trae back-28-32.')
    } else if (p === 'descartar-cambios') {
      setAviso('«Descartar cambios» necesita la cola de cambios sin publicar (back-28-32).')
    } else if (p === 'ver-como-cliente') {
      setAviso('El portal del cliente lo trae el frente portal-29-30.')
    }
  })

  const pago = pagos.find((x) => x.id === elegido) ?? null
  const total = totalEsquema(pagos)
  const conFecha = pagos.filter((p) => p.fecha).length

  return (
    <div data-testid="vista-esquema-pago" className="-mx-4 lg:-mx-10" style={{ background: C.lienzo }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 24px 0', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px' }}>
          <span style={{
            fontFamily: MONO, fontSize: '22px', fontWeight: 600, color: C.tinta,
            letterSpacing: '-.02em',
          }} data-testid="contrato-total">
            {montoM(esquema?.contrato_total)}
          </span>
          <span style={{ fontSize: '12px', color: C.tintaSuave }}>
            {esquema?.contrato_total == null ? 'sin contrato cargado' : 'contrato'}
            {' · '}{pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'}
            {total.reparo > 0 && ` · ${montoM(total.reparo)} de fondo de reparo`}
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: C.tintaSuave }}>
            {LEYENDA.map((l, i) => (
              <span key={l.texto} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: i === 0 ? 0 : '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.color }} />
                {l.texto}
              </span>
            ))}
          </div>
          <Conmutador vista={vista} onVista={setVista} />
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '20px', padding: '14px 24px 32px',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 'min(660px, 100%)' }}>
          {(error || aviso) && (
            <div
              data-testid="esquema-aviso"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px', paddingBottom: '11px',
                fontSize: '11.5px', lineHeight: 1.45, color: error ? C.neg : C.warn,
              }}
            >
              <Ico d={error ? P.alerta : P.info} s={14} w={2} />
              {error ?? aviso}
            </div>
          )}

          {vista === 'listado'
            ? (
              <ListadoEsquema
                pagos={pagos} contratoTotal={esquema?.contrato_total ?? null} hoy={hoy}
                elegido={elegido} onElegir={setElegido} onCambiar={cambiar}
              />
            )
            : pagos.length === 0
              ? <Vacio testid="calendario-vacio">Todavía no hay pagos que ubicar en el calendario.</Vacio>
              : (
                <CalendarioEsquema
                  pagos={pagos} hoy={hoy} elegido={elegido} onElegir={setElegido} onCambiar={cambiar}
                />
              )}

          {pagos.length > 0 && conFecha < pagos.length && (
            // UN PAGO SIN FECHA NO SE DIBUJA EN EL CALENDARIO, y callarlo lo haría desaparecer del
            // plan entero al cambiar de vista.
            <div
              data-testid="pagos-sin-fecha"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '11px', fontSize: '11.5px', color: C.warn }}
            >
              <Ico d={P.alerta} s={14} w={2} />
              {pagos.length - conFecha} {pagos.length - conFecha === 1 ? 'pago sin fecha' : 'pagos sin fecha'}: no aparecen en el calendario.
            </div>
          )}
        </div>

        <div style={{
          width: '356px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '24px',
          maxWidth: '100%',
        }}>
          {pago
            ? (
              <PanelPago
                pago={pago}
                onCambiar={(c) => cambiar(pago.id, c)}
                onCerrar={() => setElegido(null)}
                onQuitar={() => setAviso('«Quitar del esquema» borra la fila de Cobranzas: esa escritura la trae back-28-32.')}
                error={error}
                guardando={guardando === pago.id}
              />
            )
            : (
              <Vacio testid="panel-sin-pago">
                {pagos.length === 0
                  ? 'Cuando haya pagos, acá se abre el que se esté editando.'
                  : 'Tocá el lápiz de un pago para cambiarle el medio, el aviso o la nota interna.'}
              </Vacio>
            )}
          <CambiosEsquema pagos={pagos} hoy={hoy} />
        </div>
      </div>
    </div>
  )
}
