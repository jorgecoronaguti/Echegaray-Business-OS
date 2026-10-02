'use client'

// EMITIR UN RECIBO DE PAGO EN EFECTIVO — el papel que firma quien cobró (dueño, 02/10/2026: «emitir un recibo
// para que me firmen»). Los campos son los del pedido y ninguno más: a quién (padrón o nombre libre), DNI/CUIT,
// importe, fecha, concepto, obra, y «tomar de una compra» para no tipear lo que Compras ya sabe.
//
// No mueve plata: el pago ya está (o se carga) en Compras. Por eso el panel lo dice antes de emitir.
// El id del recibo nace al abrir el panel: si «Emitir» llega dos veces, la base devuelve el mismo número.
// Emitido, el PDF se abre con un clic del usuario (un `window.open` después de esperar a la base lo bloquea el
// navegador como ventana emergente).

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ObraOpcion } from '../types'
import { pesos } from '../logica/entregas'
import {
  borradorDesdeCompra, fechaImpresa, fraseDelReciboPago, validarReciboPago, type BorradorReciboPago,
} from '../logica/reciboPago'
import { emitirReciboPagoAction } from '../services/reciboPagoAcciones'
import type { OpcionesReciboPago } from '../services/reciboPagoDatos'
import { Campo, Cerrar, ErrorPanel, PANEL_CLASE } from './Piezas'
import { V, areaTexto, botonClaroGrande, botonOscuroGrande, cajaConfirmar, campo, campoMonto, panel } from './estilo'

const nuevoId = () => crypto.randomUUID()
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

export function PanelEmitirRecibo({ opciones, obras, cerrarHref }: {
  opciones: OpcionesReciboPago
  obras: ObraOpcion[]
  cerrarHref: string
}) {
  const router = useRouter()
  const vacio: BorradorReciboPago = { aNombreDe: '', documento: '', importe: '', fecha: opciones.hoy, concepto: '', obra: '' }
  const [b, setB] = useState<BorradorReciboPago>(vacio)
  const [id, setId] = useState(nuevoId)
  const [fila, setFila] = useState<number | null>(null)
  const [emitido, setEmitido] = useState<{ id: string; codigo: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const set = (x: Partial<BorradorReciboPago>) => { setB((v) => ({ ...v, ...x })); setError(null) }

  // EL PADRÓN SE RECONOCE POR EL NOMBRE ESCRITO (o por el CUIT, si vino de una compra): de ahí sale el id que
  // queda como referencia en el recibo. No cambia lo impreso: el papel dice lo que está escrito en el panel.
  const delPadron = opciones.padron.find((p) => norm(p.nombre) === norm(b.aNombreDe))
    ?? (b.documento ? opciones.padron.find((p) => p.documento && p.documento === b.documento.replace(/\D/g, '')) : undefined)
  // LA OBRA SE ELIGE DEL CATÁLOGO (dueño, 02/10/2026: «si tenés una bd de obras»), no se tipea. Lo que trae una compra
  // («OB-0011 · SF - PISOS INDUSTRIALES») se reconoce por el nombre con que termina.
  const obra = obras.find((o) => norm(o.nombre) === norm(b.obra))
    ?? (b.obra ? obras.find((o) => norm(b.obra).endsWith(norm(o.nombre))) : undefined) ?? null
  const v = validarReciboPago(b, opciones.hoy)

  const elegirNombre = (nombre: string) => {
    const p = opciones.padron.find((x) => norm(x.nombre) === norm(nombre))
    // Elegido del padrón, su documento manda: el que quedó escrito podía ser el de otro elegido antes.
    set(p && p.documento ? { aNombreDe: nombre, documento: p.documento } : { aNombreDe: nombre })
  }
  const tomarDeCompra = (valor: string) => {
    const c = opciones.compras.find((x) => String(x.fila) === valor)
    setFila(c ? c.fila : null)
    if (!c) return
    // LA OBRA DE LA COMPRA ES LA DEL CATÁLOGO (`obra_id` del espejo), no el texto de la columna de cliente.
    const deCatalogo = c.obraId ? obras.find((o) => o.id === c.obraId) : undefined
    set({ ...borradorDesdeCompra(c, opciones.hoy), ...(deCatalogo ? { obra: deCatalogo.nombre } : {}) })
  }
  const emitir = () => {
    if (!v.ok) { setError(v.error); return }
    empezar(async () => {
      const r = await emitirReciboPagoAction({
        id, ...b, obraId: obra?.id ?? null, compraFila: fila,
        proveedorId: delPadron?.tipo === 'proveedor' ? delPadron.id : null,
        personaId: delPadron?.tipo === 'persona' ? delPadron.id : null,
      })
      if (!r.ok) { setError(r.error); return }
      setEmitido({ id, codigo: r.dato })
      router.refresh()
    })
  }
  const otro = () => { setB(vacio); setFila(null); setId(nuevoId()); setEmitido(null); setError(null) }

  if (emitido) {
    return (
      <aside style={panel} className={PANEL_CLASE} aria-label="Recibo emitido" data-testid="panel-recibo-emitido">
        <Cerrar titulo={`Recibo ${emitido.codigo} emitido`} bajada="Imprimilo y que lo firme quien cobró. Queda en «Recibos emitidos»." href={cerrarHref} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={`/administracion/compras/recibo-pago/${emitido.id}`} target="_blank" rel="noopener" style={botonOscuroGrande} data-testid="recibo-imprimir">
            Imprimir {emitido.codigo}
          </a>
          <button type="button" onClick={otro} style={botonClaroGrande}>Emitir otro</button>
        </div>
      </aside>
    )
  }

  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Emitir recibo" data-testid="panel-emitir-recibo">
      <Cerrar titulo="Emitir recibo" bajada="Recibo de pago en efectivo, para que lo firme quien cobra." href={cerrarHref} />

      {opciones.compras.length > 0 && (
        <Campo rotulo="Tomar de una compra (opcional)">
          <select value={fila ?? ''} onChange={(e) => tomarDeCompra(e.target.value)} style={campo} data-testid="recibo-compra" aria-label="Tomar de una compra">
            <option value="">Compras en efectivo de los últimos 15 días</option>
            {opciones.compras.map((c) => (
              <option key={c.fila} value={c.fila}>
                {[c.fecha ? fechaImpresa(c.fecha).slice(0, 5) : null, c.proveedor, c.concepto, c.total != null ? pesos(c.total) : null, c.obra].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo rotulo="A quién">
        <input
          value={b.aNombreDe} onChange={(e) => elegirNombre(e.target.value)} list="recibo-padron" autoComplete="off"
          placeholder="Proveedor, persona o un nombre" style={campo} data-testid="recibo-a-nombre" aria-label="A quién"
        />
        <datalist id="recibo-padron">
          {opciones.padron.map((p) => <option key={`${p.tipo}:${p.id}`} value={p.nombre}>{p.tipo === 'proveedor' ? 'Proveedor' : 'Persona'}</option>)}
        </datalist>
      </Campo>

      <Campo rotulo="DNI / CUIT (opcional)">
        <input value={b.documento} onChange={(e) => set({ documento: e.target.value })} inputMode="numeric" style={campo} data-testid="recibo-documento" aria-label="DNI o CUIT" />
      </Campo>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <Campo rotulo="Importe">
            <input value={b.importe} onChange={(e) => set({ importe: e.target.value })} inputMode="decimal" placeholder="$ 0" style={campoMonto} data-testid="recibo-importe" aria-label="Importe" />
          </Campo>
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <Campo rotulo="Fecha">
            <input type="date" value={b.fecha} max={opciones.hoy} onChange={(e) => set({ fecha: e.target.value })} style={campo} data-testid="recibo-fecha" aria-label="Fecha" />
          </Campo>
        </div>
      </div>

      <Campo rotulo="En concepto de">
        <textarea value={b.concepto} onChange={(e) => set({ concepto: e.target.value })} rows={2} maxLength={400} style={areaTexto} data-testid="recibo-concepto" aria-label="En concepto de" />
      </Campo>

      <Campo rotulo="Obra (opcional)">
        <select value={obra ? obra.nombre : b.obra} onChange={(e) => set({ obra: e.target.value })} style={campo} data-testid="recibo-obra" aria-label="Obra">
          <option value="">Sin obra</option>
          {/* Lo que vino de una compra y no está en el catálogo se muestra tal cual: es lo que va a salir impreso. */}
          {b.obra && !obra && <option value={b.obra}>{b.obra}</option>}
          {obras.filter((o) => o.activa || o.id === obra?.id).map((o) => (
            <option key={o.id} value={o.nombre}>{o.nombre}{o.cliente ? ` · ${o.cliente}` : ''}</option>
          ))}
        </select>
      </Campo>

      <div style={cajaConfirmar} data-testid="recibo-al-emitir">
        <div style={{ fontSize: '12.5px', fontWeight: 600 }}>El papel dice</div>
        <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
          {v.ok ? fraseDelReciboPago(v.dato) : 'Completá a quién, el importe y el concepto.'}
        </div>
        <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.45 }}>
          Toma el próximo número RP y no se borra: si sale mal, se anula. No mueve la caja ni Compras: el pago se registra allá.
        </div>
      </div>

      <ErrorPanel texto={error} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
        <button type="button" onClick={emitir} disabled={pendiente} style={{ ...botonOscuroGrande, opacity: pendiente ? 0.6 : 1 }} data-testid="recibo-emitir">
          {pendiente ? 'Emitiendo…' : v.ok ? `Emitir recibo por ${pesos(v.dato.importe)}` : 'Emitir recibo'}
        </button>
        <button type="button" onClick={() => router.push(cerrarHref)} style={botonClaroGrande}>Cancelar</button>
      </div>
    </aside>
  )
}
