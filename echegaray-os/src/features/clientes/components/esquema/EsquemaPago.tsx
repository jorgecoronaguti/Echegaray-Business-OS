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
// ve en cada clic.

import { useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { Vacio } from '../canon/Piezas'
import { useAlPedir } from '../canon/pedidos'
import { CalendarioEsquema } from './CalendarioEsquema'
import { AvisosAlCliente, CambiosEsquema } from './CambiosEsquema'
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
  publicarEsquema: (entrada: { clienteId: string }) => Promise<ResultadoAccion>
}) {
  const [pagos, setPagos] = useState<PagoEsquema[]>(esquema?.pagos ?? [])
  const [vista, setVista] = useState<'listado' | 'calendario'>('listado')
  const [elegido, setElegido] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  // Lo que pasó con el último arrastre. Vive acá y no adentro del calendario porque el calendario
  // se desmonta al cambiar de vista y el aviso tiene que sobrevivir a eso.
  const [avisoCalendario, setAvisoCalendario] = useState<string | null>(null)

  async function cambiar(id: string, cambio: CambioPago) {
    if (Object.keys(cambio).length === 0) return
    const antes = pagos
    // `motivo_reprogramacion` NO es una columna de la fila: viaja con el cambio y termina en el
    // historial. Meterlo en el objeto optimista dejaría una propiedad fantasma en `PagoEsquema`.
    const deLaFila = { ...cambio }
    delete deLaFila.motivo_reprogramacion
    setPagos((ps) => ps.map((p) => (p.id === id ? { ...p, ...deLaFila, cambio_pendiente: true } : p)))
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
      const r = await publicarEsquema({ clienteId })
      if (r.ok) setAviso(r.mensaje ?? 'Publicado: el cliente ya ve el esquema en el portal.')
      else setError(r.error)
    } else if (p === 'agregar-pago') {
      // La cola `cobranza_cambio` sabe MOVER una celda de una fila existente, verificando su
      // huella antes de escribir. INSERTAR una fila nueva en la pestaña es otra operación: corre
      // la columna A (`=ROW()-4`) de todas las de abajo y con ella el `cobranza_fila` de cada
      // certificado. No se agrega hasta que el worker sepa reasignar esos punteros.
      setAviso('«Agregar pago» inserta una fila en Cobranzas y eso corre los punteros de todas las de abajo: todavía no está.')
    } else if (p === 'descartar-cambios') {
      // `cambio_pendiente` dice QUE algo cambió, no QUÉ valor tenía antes de cambiar: el valor
      // anterior sólo queda guardado para lo que ya pasó por `cobranza_cambio`. Sin eso, descartar
      // no tiene a qué volver.
      setAviso('«Descartar cambios» necesita el valor anterior de cada campo y el esquema sólo guarda que cambió.')
    } else if (p === 'ver-como-cliente') {
      setAviso('Para ver el portal como lo ve el cliente hay que entrar con su acceso: la sesión de administración no puede leer /portal.')
    }
  })

  const pago = pagos.find((x) => x.id === elegido) ?? null
  const total = totalEsquema(pagos)
  const sinFecha = pagos.filter((p) => !p.fecha)

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
                  aviso={avisoCalendario} onAviso={setAvisoCalendario}
                />
              )}

          {sinFecha.length > 0 && (
            // ═══ UN PAGO SIN FECHA NO SE DIBUJA EN EL CALENDARIO, NI EN CERO ═══
            //
            // El fondo de reparo no tiene fecha porque todavía no la tiene: se libera a los 180
            // días de la recepción provisoria, y esa fecha depende de un hecho que no pasó.
            // Ubicarlo en el 1º o en «hoy» sería inventar un cobro que nadie pactó para ese día, y
            // ese día entra después a la proyección de caja. Va en su propia lista, y con su monto:
            // es plata comprometida que hay que poder ver.
            <div data-testid="pagos-sin-fecha" style={{ paddingTop: '14px' }}>
              <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.05em', marginBottom: '7px' }}>
                SIN FECHA CARGADA
              </div>
              {sinFecha.map((p) => (
                <div
                  key={p.id}
                  data-testid={`sin-fecha-${p.id}`}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: '10px', padding: '7px 0',
                    borderBottom: `1px solid ${C.bordeFila}`,
                  }}
                >
                  <span style={{ fontSize: '12.5px', color: C.tinta, minWidth: 0, flex: 1 }}>{p.concepto}</span>
                  <span style={{ fontFamily: MONO, fontSize: '12.5px', color: C.tinta, flexShrink: 0 }}>
                    {montoM(p.monto)}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: '11.5px', color: C.warn, marginTop: '7px', lineHeight: 1.45 }}>
                No aparecen en el calendario: no tienen fecha pactada, y ubicarlos en un día
                cualquiera metería en la proyección de caja un cobro que nadie acordó.
              </div>
            </div>
          )}

          {/* ═══ LA FRONTERA, DICHA EN PANTALLA ═══

              Media fila es del Sheet y media es de la app, y quien la mira no tiene forma de saber
              cuál es cuál. Sin esta línea, mover una fecha se siente como guardar un dato —y es
              encolar un pedido que un worker aplica más tarde, o rechaza. */}
          <p style={{ fontSize: '11px', color: C.tenue, marginTop: '14px', lineHeight: 1.55, maxWidth: 760 }}>
            La fecha, el monto, el medio y el estado son espejo de las columnas Q · J · N · O de la
            pestaña Cobranzas: editarlas encola el cambio y lo escribe el worker, no esta pantalla.
            Lo que sí es de la app —qué ve el cliente, cuándo se le avisa y el historial de fechas—
            no lo toca el sync.
          </p>
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
                // Mismo motivo que «Agregar pago»: borrar una fila corre la columna A del resto.
                onQuitar={() => setAviso('«Quitar del esquema» borra una fila de Cobranzas y eso corre los punteros de todas las de abajo: todavía no está.')}
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
          <AvisosAlCliente pagos={pagos} />
        </div>
      </div>
    </div>
  )
}
