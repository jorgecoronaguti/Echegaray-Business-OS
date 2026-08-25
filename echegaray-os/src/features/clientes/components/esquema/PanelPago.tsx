'use client'

// EL PANEL DEL PAGO (`32:398`–`32:500`) — la tarjeta de 356px de la derecha.
//
//   campo fecha  borde `#D7D5CF`, radio 7, `minHeight:42px`, mono 14px, con chevron a la derecha
//   monto        MISMO alto, fondo `#FAFAF8` y candado: viene del certificado y acá no se toca
//   medio        tres chips
//   qué ve       tres interruptores separados por `#F5F4F0`
//   nota         caja de `minHeight:56px` con «Solo interna · nunca la ve el cliente»
//   pie          «Guardar» amarillo + «Cancelar» + tacho a la derecha
//
// ═══ NO HAY «GUARDAR» QUE HAGA FALTA ═══
//
// Los interruptores y los chips escriben AL TOCARLOS —es lo que el dueño pidió: editar ahí mismo—,
// así que el botón «Guardar» del mockup queda para la nota interna y la fecha, que son los dos
// campos donde se escribe de a poco y guardar en cada tecla sería un cambio por letra.

import { useState } from 'react'
import { C, MONO, PRIMARIA, TARJETA } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { Boton, BotonIcono, Chip, Interruptor } from '../canon/Piezas'
import { diaMes, diaMesAnio, pesos } from '../../services/cobranzaFormato'
import { MEDIOS, type CambioPago } from '../../services/entradasCobranza'
import { montoBloqueado } from '../../services/reglasEsquema'
import type { MedioPago, PagoEsquema } from '../../types/cobranzas'

function Rotulo({ children }: { children: string }) {
  return <div style={{ fontSize: '11px', color: C.tenue, letterSpacing: '.05em' }}>{children}</div>
}

function FilaInterruptor({ encendido, titulo, detalle, onClick, ultima = false, testid }: {
  encendido: boolean
  titulo: string
  detalle?: string
  onClick: () => void
  ultima?: boolean
  testid?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '11px', paddingTop: '10px',
      paddingBottom: ultima ? '12px' : '10px',
      borderBottom: ultima ? undefined : `1px solid ${C.bordeLista}`,
    }}>
      <Interruptor encendido={encendido} etiqueta={titulo} onClick={onClick} testid={testid} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '12.5px', color: C.tinta }}>{titulo}</div>
        {detalle && <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{detalle}</div>}
      </div>
    </div>
  )
}

export function PanelPago({ pago, onCambiar, onCerrar, onQuitar, error, guardando }: {
  pago: PagoEsquema
  onCambiar: (cambio: CambioPago) => void
  onCerrar: () => void
  onQuitar: () => void
  error: string | null
  guardando: boolean
}) {
  const [nota, setNota] = useState(pago.nota_interna ?? '')
  const [fecha, setFecha] = useState(pago.fecha?.slice(0, 10) ?? '')
  const cambiado = nota !== (pago.nota_interna ?? '') || fecha !== (pago.fecha?.slice(0, 10) ?? '')
  const avisoEl = pago.aviso_dias != null && pago.fecha
    ? diaMes(new Date(Date.parse(`${pago.fecha.slice(0, 10)}T00:00:00Z`) - pago.aviso_dias * 86_400_000).toISOString().slice(0, 10))
    : null

  return (
    <div style={TARJETA} data-testid="panel-pago">
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '13px 15px',
        borderBottom: `1px solid ${C.bordeFila}`,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>{pago.concepto}</div>
          <div style={{ fontSize: '11.5px', color: C.tintaSuave, marginTop: '2px' }}>
            {pago.obra_nombre ?? 'sin obra asociada'}
          </div>
        </div>
        <BotonIcono titulo="Cerrar" lado={30} onClick={onCerrar} testid="panel-pago-cerrar">
          <Ico d={P.cerrar} s={16} />
        </BotonIcono>
      </div>

      <div style={{ padding: '14px 15px 6px' }}>
        <Rotulo>FECHA DE COBRO</Rotulo>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '9px', marginTop: '7px',
          border: `1px solid ${C.bordeCampo}`, borderRadius: '7px', padding: '0 12px', minHeight: '42px',
        }}>
          <Ico d={P.calendario} s={16} style={{ color: C.tenue }} />
          <input
            type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            data-testid="panel-pago-fecha" aria-label="Fecha de cobro"
            disabled={pago.estado === 'cobrado'}
            style={{
              fontFamily: MONO, fontSize: '14px', color: C.tinta, flex: 1, border: 'none',
              outline: 'none', background: 'transparent', padding: 0,
            }}
          />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '7px', marginTop: '7px', fontSize: '11.5px',
          color: C.tintaSuave,
        }}>
          <Ico d={P.info} s={13} style={{ color: C.tenue }} />
          {pago.fecha ? `Hoy está pactado para el ${diaMesAnio(pago.fecha)}` : 'Todavía sin fecha pactada'}
        </div>
      </div>

      <div style={{ padding: '12px 15px 6px' }}>
        <Rotulo>MONTO</Rotulo>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '9px', marginTop: '7px',
          border: `1px solid ${C.borde}`, background: C.tenueFondo, borderRadius: '7px',
          padding: '0 12px', minHeight: '42px',
        }}>
          <span style={{ fontFamily: MONO, fontSize: '14px', color: C.tintaSuave, flex: 1 }}>
            {pesos(pago.monto)}
          </span>
          {montoBloqueado(pago) && (
            <span title="Viene del certificado" style={{ display: 'flex', color: C.tenue }}>
              <Ico d={P.candado} s={15} />
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 15px 6px' }}>
        <Rotulo>MEDIO DE PAGO ACORDADO</Rotulo>
        <div style={{ display: 'flex', gap: '7px', marginTop: '9px', flexWrap: 'wrap' }}>
          {MEDIOS.map((m) => (
            <Chip
              key={m} activo={pago.medio === m} testid={`medio-${m}`}
              // Volver a tocar el medio elegido lo saca: un medio acordado por error no se corrige
              // eligiendo otro cualquiera.
              onClick={() => onCambiar({ medio: pago.medio === m ? null : (m as MedioPago) })}
            >{m[0].toUpperCase() + m.slice(1)}</Chip>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 15px 6px' }}>
        <Rotulo>QUÉ VE EL CLIENTE</Rotulo>
        <FilaInterruptor
          encendido={pago.visible_portal} titulo="Mostrar este pago en el portal"
          onClick={() => onCambiar({ visible_portal: !pago.visible_portal })}
          testid="panel-visible"
        />
        <FilaInterruptor
          encendido={pago.aviso_dias != null} titulo="Aviso 3 días antes"
          detalle={pago.aviso_dias != null
            ? `${avisoEl ?? 'sin fecha'} · portal y mail`
            : 'sin aviso programado'}
          onClick={() => onCambiar({ aviso_dias: pago.aviso_dias == null ? 3 : null })}
          testid="panel-aviso"
        />
        <FilaInterruptor
          encendido={pago.mostrar_reprogramaciones} titulo="Mostrar reprogramaciones"
          detalle={pago.reprogramaciones.length
            ? `el cliente vería las ${pago.reprogramaciones.length + 1} fechas`
            : 'todavía no se movió de fecha'}
          onClick={() => onCambiar({ mostrar_reprogramaciones: !pago.mostrar_reprogramaciones })}
          ultima testid="panel-reprogramaciones"
        />
      </div>

      <div style={{ padding: '0 15px 6px' }}>
        <Rotulo>NOTA INTERNA</Rotulo>
        <textarea
          value={nota} onChange={(e) => setNota(e.target.value)} data-testid="panel-nota"
          placeholder="Lo que hay que recordar de este pago"
          style={{
            marginTop: '7px', width: '100%', border: `1px solid ${C.borde}`, borderRadius: '7px',
            padding: '10px 12px', minHeight: '56px', fontSize: '12.5px', color: C.tinta,
            lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical',
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11px',
          color: C.tenue,
        }}>
          <Ico d={P.candado} s={13} />
          Solo interna · nunca la ve el cliente
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px', padding: '13px 15px',
        borderTop: `1px solid ${C.bordeFila}`, marginTop: '8px',
      }}>
        <Boton
          estilo={{ ...PRIMARIA, padding: '8px 13px' }} hoverFondo={C.marcaHover}
          deshabilitado={!cambiado || guardando} testid="panel-guardar"
          onClick={() => {
            const cambio: CambioPago = {}
            if (nota !== (pago.nota_interna ?? '')) cambio.nota_interna = nota
            if (fecha && fecha !== (pago.fecha?.slice(0, 10) ?? '')) cambio.fecha = fecha
            onCambiar(cambio)
          }}
        >
          <Ico d={P.ok} s={14} w={2.2} />
          {guardando ? 'Guardando…' : 'Guardar'}
        </Boton>
        <button type="button" onClick={onCerrar} data-testid="panel-cancelar" style={{
          fontSize: '12.5px', color: C.tintaSuave, borderRadius: '6px', padding: '8px 12px',
          border: `1px solid ${C.borde}`, background: C.superficie, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>Cancelar</button>
        <span style={{ marginLeft: 'auto' }}>
          <BotonIcono titulo="Quitar del esquema" onClick={onQuitar} testid="panel-quitar">
            <Ico d={P.tacho} s={15} />
          </BotonIcono>
        </span>
      </div>

      {error && (
        <div data-testid="panel-pago-error" style={{
          padding: '0 15px 13px', fontSize: '11.5px', color: C.neg, lineHeight: 1.45,
        }}>{error}</div>
      )}
    </div>
  )
}
