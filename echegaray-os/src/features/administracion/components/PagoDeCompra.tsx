'use client'

// MARCAR UNA COMPRA COMO PAGADA —entera o en parte— SIN IRSE DE DONDE SE ESTÁ.
//
// Pedido del dueño, 16/09/2026: *«replicar las funciones de pagado y montos o montos parciales que
// tiene la pestaña Compras […] para que las pueda usar directamente en la app»*.
//
// ═══ POR QUÉ NO ES UN MODAL NI UNA TARJETA ═══
//
// Las dos reglas que gobiernan esto son «edición sin abandonar el contexto» (Figma/Asana) y «no
// tarjetas por cada dato». El control en reposo son DOS VERBOS y una frase de estado; el formulario
// se abre EN EL MISMO LUGAR, empujando lo de abajo y nada más. Un modal taparía la factura que la
// persona está mirando para decidir cuánto pagar, que es justamente el dato que necesita.
//
// ═══ LO QUE ESTE CONTROL NO PROMETE ═══
//
// Que la celda del Sheet ya lo diga. Guardar deja el pago en el OS y lo ENCOLA; el worker relee la
// fila, prueba que sigue siendo la misma compra y escribe. La leyenda dice «pendiente de Sheet»
// hasta que eso pasa, y «✓ en Sheet» recién cuando la relectura lo confirmó. Afirmar el efecto antes
// es exactamente lo que el principio de cierre prohíbe.
//
// ═══ EL COMPROBANTE DEL PAGO ES OPCIONAL Y NO BLOQUEA ═══
//
// Si el archivo falla, el PAGO YA QUEDÓ REGISTRADO: decir «no se pudo» ahí sería mentir sobre lo que
// sí pasó. Se avisa del archivo, no del pago.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { plataCentavos } from '@/shared/utils/format'
import { deshacerPagoDeCompra, registrarPagoDeCompra } from '../services/comprasPagoActions'
import { subirComprobanteDePago } from '../services/comprobanteDePagoSubida'
import { ACCEPT_PAGO } from '../services/comprobanteDePago'
import {
  MEDIOS_DE_PAGO, type EstadoEnSheet, type PagoDeFila, frasePago, leyendaDeSheet, saldoDe,
  sePuedePagar, sinTramoLibre,
} from '../services/pagoDeCompra'

const TONO = { ok: V.pos, falta: V.warn, apagado: V.tenue, undefined: V.tinta } as const
const color = (t: 'ok' | 'falta' | 'apagado' | undefined) => TONO[String(t) as keyof typeof TONO] ?? V.tinta
const hoyISO = () => new Date().toISOString().slice(0, 10)

const CAMPO = {
  border: `1px solid ${V.linea}`, borderRadius: 6, padding: '4px 8px', fontSize: 12,
  color: V.tinta, background: '#FFFFFF', minWidth: 0, width: '100%',
} as const

export function PagoDeCompra({ fila, compra, enSheet, motivo, proveedorId }: {
  fila: number
  compra: PagoDeFila
  /** En qué punto del viaje está el último pago pedido desde la app. */
  enSheet: EstadoEnSheet
  motivo?: string | null
  /** La ficha del proveedor que además hay que refrescar. La acción sólo acepta un uuid. */
  proveedorId?: string | null
}) {
  const [abierto, setAbierto] = useState<'total' | 'parcial' | null>(null)
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [fechaResto, setFechaResto] = useState('')
  const [medio, setMedio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  // El archivo se guarda en estado y no en una `ref`: el input vive en un componente hijo, y pasarle
  // la ref hacia abajo es leer un ref durante el render (lo caza `react-hooks/refs`).
  const [comprobante, setComprobante] = useState<File | null>(null)

  const saldo = saldoDe(compra)
  const frase = frasePago(compra)
  const leyenda = leyendaDeSheet(enSheet, motivo)
  const puede = sePuedePagar(compra)
  const sinTramo = sinTramoLibre(compra)

  function guardar(tipo: 'total' | 'parcial') {
    setError(null); setAviso(null)
    empezar(async () => {
      const r = await registrarPagoDeCompra({
        fila, tipo, fecha,
        monto: tipo === 'parcial' ? Number(String(monto).replace(',', '.')) : null,
        fechaResto: tipo === 'parcial' ? (fechaResto || null) : null,
        medio: (medio || null) as never,
        proveedorId: proveedorId ?? null,
      })
      if (!r.ok) { setError(r.error); return }
      setAbierto(null)
      // EL PAGO YA ESTÁ. Lo del archivo se cuenta aparte para no desmentir lo que sí ocurrió.
      if (!comprobante) { setAviso('Pago registrado.'); return }
      const s = await subirComprobanteDePago(comprobante, { fila, cambioId: r.cambioId })
      setComprobante(null)
      setAviso(s.ok ? 'Pago registrado y comprobante guardado.' : `Pago registrado. El comprobante NO: ${s.error}`)
    })
  }

  function deshacer() {
    setError(null); setAviso(null)
    empezar(async () => {
      const r = await deshacerPagoDeCompra({ fila, proveedorId: proveedorId ?? null })
      if (!r.ok) { setError(r.error); return }
      setAviso(r.aviso ? `Pago deshecho. ${r.aviso}` : 'Pago deshecho.')
    })
  }

  return (
    <div data-testid={`pago-compra-${fila}`} style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: V.tenue, flex: '0 0 auto' }}>Pago</span>
        <span style={{ fontSize: 12, color: color(frase.tono), fontWeight: 600 }} data-testid="pago-frase">{frase.texto}</span>
        {saldo > 0 && (
          <span className="font-mono tabular-nums" style={{ fontSize: 12, color: V.tintaSuave }}>
            {`falta ${plataCentavos(saldo)}`}
          </span>
        )}
        {leyenda && (
          <span aria-live="polite" style={{ fontSize: 11, color: color(leyenda.tono) }} data-testid="pago-en-sheet">
            {leyenda.texto}
          </span>
        )}
      </div>

      {puede && !sinTramo && (
        <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
          <Verbo activo={abierto === 'total'} onClick={() => setAbierto(abierto === 'total' ? null : 'total')} testid="pago-verbo-total">
            Pagado
          </Verbo>
          <Verbo activo={abierto === 'parcial'} onClick={() => setAbierto(abierto === 'parcial' ? null : 'parcial')} testid="pago-verbo-parcial">
            Parcial
          </Verbo>
          {enSheet !== 'sin_pedido' && enSheet !== 'rechazado' && (
            <Verbo onClick={deshacer} testid="pago-deshacer">Deshacer</Verbo>
          )}
        </div>
      )}
      {/* LOS DOS TRAMOS DEL SHEET YA ESTÁN USADOS: no hay dónde registrar un tercero, y eso se dice
          en vez de ofrecer un botón que la base va a rechazar. */}
      {puede && sinTramo && (
        <p style={{ fontSize: 11.5, color: V.apagado, paddingTop: 6, textWrap: 'pretty' }} data-testid="pago-sin-tramo">
          Los dos tramos de pago de la pestaña ya están usados. Lo que falte se completa en el Sheet.
        </p>
      )}

      {abierto && (
        <Formulario
          tipo={abierto} saldo={saldo} pendiente={pendiente}
          monto={monto} setMonto={setMonto} fecha={fecha} setFecha={setFecha}
          fechaResto={fechaResto} setFechaResto={setFechaResto} medio={medio} setMedio={setMedio}
          comprobante={comprobante} setComprobante={setComprobante}
          onGuardar={() => guardar(abierto)} onCancelar={() => setAbierto(null)}
        />
      )}

      {error && <p style={{ fontSize: 11.5, color: V.neg, paddingTop: 6 }} data-testid="pago-error">{error}</p>}
      {aviso && <p style={{ fontSize: 11.5, color: V.apagado, paddingTop: 6 }} data-testid="pago-aviso">{aviso}</p>}
    </div>
  )
}

/** Una acción secundaria es TEXTO, no un botón: la regla 17 y el patrón de Asana. */
function Verbo({ children, onClick, activo, testid }: {
  children: React.ReactNode; onClick: () => void; activo?: boolean; testid: string
}) {
  return (
    <button
      type="button" onClick={onClick} data-testid={testid}
      style={{
        border: 0, background: 'none', padding: 0, cursor: 'pointer', fontSize: 12,
        fontWeight: activo ? 600 : 500, color: activo ? V.tinta : V.apagado,
        textDecoration: activo ? 'underline' : 'none', textUnderlineOffset: 3,
      }}
    >
      {children}
    </button>
  )
}

/** El mini-formulario. UNA columna: en 390px dos columnas obligan a un desplazamiento lateral. */
function Formulario(p: {
  tipo: 'total' | 'parcial'; saldo: number; pendiente: boolean
  monto: string; setMonto: (v: string) => void
  fecha: string; setFecha: (v: string) => void
  fechaResto: string; setFechaResto: (v: string) => void
  medio: string; setMedio: (v: string) => void
  comprobante: File | null; setComprobante: (f: File | null) => void
  onGuardar: () => void; onCancelar: () => void
}) {
  return (
    <div
      data-testid="pago-formulario"
      style={{ display: 'grid', gap: 8, paddingTop: 8, borderTop: `1px solid ${V.lineaPanel}`, marginTop: 8 }}
    >
      {p.tipo === 'parcial' && (
        <Campo rotulo={`Cuánto se pagó (falta ${plataCentavos(p.saldo)})`}>
          <input
            type="text" inputMode="decimal" value={p.monto} onChange={(e) => p.setMonto(e.target.value)}
            placeholder="0,00" data-testid="pago-monto" style={CAMPO}
          />
        </Campo>
      )}
      <Campo rotulo="Cuándo se pagó">
        <input type="date" value={p.fecha} onChange={(e) => p.setFecha(e.target.value)} data-testid="pago-fecha" style={CAMPO} />
      </Campo>
      {p.tipo === 'parcial' && (
        <Campo rotulo="Cuándo se paga el resto">
          <input type="date" value={p.fechaResto} onChange={(e) => p.setFechaResto(e.target.value)} data-testid="pago-fecha-resto" style={CAMPO} />
        </Campo>
      )}
      <Campo rotulo="Con qué">
        <select value={p.medio} onChange={(e) => p.setMedio(e.target.value)} data-testid="pago-medio" style={CAMPO}>
          <option value="">sin cambiar</option>
          {MEDIOS_DE_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Campo>
      <Campo rotulo={p.comprobante ? `Comprobante: ${p.comprobante.name}` : 'Comprobante del pago (opcional)'}>
        <input
          type="file" accept={ACCEPT_PAGO} data-testid="pago-comprobante"
          onChange={(e) => p.setComprobante(e.target.files?.[0] ?? null)}
          style={{ ...CAMPO, padding: '3px 4px' }}
        />
      </Campo>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 2 }}>
        <button
          type="button" onClick={p.onGuardar} disabled={p.pendiente} data-testid="pago-guardar"
          style={{
            border: `1px solid ${V.grafito}`, borderRadius: 6, padding: '4px 12px', background: V.grafito,
            color: '#FFFFFF', fontSize: 12, fontWeight: 600, cursor: p.pendiente ? 'wait' : 'pointer',
          }}
        >
          {p.pendiente ? 'Guardando…' : 'Registrar'}
        </button>
        <Verbo onClick={p.onCancelar} testid="pago-cancelar">Cancelar</Verbo>
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 11, color: V.tenue }}>{rotulo}</span>
      {children}
    </label>
  )
}
