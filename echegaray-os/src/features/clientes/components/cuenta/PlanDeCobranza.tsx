'use client'

// «PLAN DE COBRANZA · HOY» (`28:365`–`28:430`).
//
//   ítem     `paddingTop:12px; paddingBottom:14px`, filo `#EFEEEA` (el último sin filo)
//   línea 1  ícono del tono + título 12,5px/500 + monto mono a la derecha
//   motivo   11,5px `#6B6B67`, `lineHeight:1.5`, sangrado 23px (el ancho del ícono + su hueco)
//   acción   botón grafito 11,5px/500 + un cuadrado de 29px para posponer
//
// ═══ LAS TRES ACCIONES DEL MOCKUP TODAVÍA NO TIENEN SERVICIO ═══
//
// «Coordinar remedición», «Enviar recordatorio» y «Programar aviso» mandan un mail o agendan algo
// del lado del cliente: son NIVEL E y su cola (`mail_saliente`) la trae back-28-32. El botón se
// dibuja igual y contesta con todas las letras que todavía no está conectado, en la misma tarjeta.
// La alternativa —esconder el botón hasta que exista— dejaría la pantalla sin la mitad del plan y
// sin forma de descubrir que falta.

import { useState } from 'react'
import { C, ACCION_PLAN, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { Boton, BotonIcono, TituloBloque, Vacio } from '../canon/Piezas'
import { montoM } from '../../services/cobranzaFormato'
import { planDeCobranza, type AccionPlan, type ItemPlan } from '../../services/reglasCobranza'
import type { CertificadoCliente } from '../../types/cobranzas'

const ICONO: Record<AccionPlan, React.ReactNode> = {
  remedicion: <Ico d={P.calendario} s={13} w={2} />,
  recordatorio: <Ico d={P.telefono} s={13} w={2} />,
  aviso: <Ico d={P.mail} s={13} w={2} />,
}

const TONO: Record<ItemPlan['tono'], string> = { neg: C.neg, warn: C.warn, curso: C.curso }

export function PlanDeCobranza({ documentos, hoy, onElegir }: {
  documentos: CertificadoCliente[]
  hoy: string
  onElegir: (id: string) => void
}) {
  const items = planDeCobranza(documentos, hoy)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pospuestos, setPospuestos] = useState<string[]>([])
  const visibles = items.filter((i) => !pospuestos.includes(i.documento.id))

  return (
    <div data-testid="plan-cobranza">
      <TituloBloque icono={<Ico d={P.lista} s={15} />} titulo="Plan de cobranza · hoy" conFilo />

      {visibles.map((item, k) => (
        <div
          key={item.documento.id}
          style={{
            paddingTop: '12px',
            paddingBottom: k === visibles.length - 1 ? 0 : '14px',
            borderBottom: k === visibles.length - 1 ? undefined : `1px solid ${C.bordeFila}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'flex', color: TONO[item.tono] }}>
              <Ico d={item.tono === 'neg' ? P.alerta : item.tono === 'warn' ? P.chat : P.mail} s={15} w={2} />
            </span>
            <button
              type="button" onClick={() => onElegir(item.documento.id)}
              data-testid={`plan-ir-${item.documento.id}`}
              style={{
                fontSize: '12.5px', fontWeight: 500, color: C.tinta, background: 'none',
                border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', minWidth: 0,
              }}
            >
              {item.documento.numero}
              {item.documento.obra_nombre ? ` · ${item.documento.obra_nombre}` : ''}
            </button>
            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '12.5px', color: C.tinta }}>
              {montoM(item.documento.monto)}
            </span>
          </div>

          <div style={{
            fontSize: '11.5px', color: C.tintaSuave, marginTop: '5px', lineHeight: 1.5,
            paddingLeft: '23px',
          }}>{item.motivo}</div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px', marginTop: '10px', paddingLeft: '23px',
          }}>
            <Boton
              estilo={ACCION_PLAN} hoverFondo={C.grafitoHover}
              testid={`plan-accion-${item.documento.id}`}
              onClick={() => setAviso(
                `«${item.rotulo}» todavía no está conectado: manda un mail al cliente y esa cola la trae back-28-32.`,
              )}
            >
              {ICONO[item.accion]}
              {item.rotulo}
            </Boton>
            <BotonIcono
              titulo="Posponer" lado={29} testid={`plan-posponer-${item.documento.id}`}
              onClick={() => setPospuestos((p) => [...p, item.documento.id])}
            >
              <Ico d={P.reloj} s={14} />
            </BotonIcono>
          </div>
        </div>
      ))}

      {aviso && (
        <div
          data-testid="plan-aviso"
          style={{
            marginTop: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px',
            fontSize: '11.5px', color: C.warn, lineHeight: 1.45,
          }}
        >
          <Ico d={P.info} s={14} w={2} />
          {aviso}
        </div>
      )}

      {visibles.length === 0 && (
        <Vacio testid="plan-vacio">
          {items.length === 0
            ? 'Nada que reclamar hoy: ningún documento está vencido, observado ni por vencer en el mes.'
            : 'Todo el plan de hoy quedó pospuesto. Vuelve al recargar la pantalla.'}
        </Vacio>
      )}
    </div>
  )
}
