'use client'

import React from 'react'
import { InlineEdit } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { RegistrarAdelanto } from './RegistrarAdelanto'
import {
  guardarCeldaLiquidacion, guardarEfectivoRedondeado, guardarValorHora,
} from '../../services/liquidacionActions'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import { calcularCadena } from '../../services/panelDePersona'
import type { LineaDeLaPersona, PersonaAbierta } from './PanelDePersona'

const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`

const horas = (n: number | null): string =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/**
 * LA CADENA DE R5 DE ESTA PERSONA, EDITABLE — las MISMAS celdas del cuadro de Pagos.
 *
 * Dueño, 09/09/2026: *«ahí tengo que poder editar lo de cada uno así como lo que tenemos disponible
 * de edición en la pantalla de todos juntos»*. Por eso esto no recalcula nada propio cuando existe
 * la línea: muestra `LineaConOverrides` —la fila que ya arma `liquidacionQuincenaService`— y guarda
 * con las mismas server actions. Una segunda cuenta acá sería la segunda definición de lo que cobra
 * una persona, y de las dos se cree la última que alguien miró.
 *
 * SIN LÍNEA EN EL CUADRO (nadie con horas ni tarifa) se dibuja la cadena calculada y NO se ofrece
 * edición: no hay dónde guardarla todavía.
 */
export function CadenaDePago({ persona, cerrada, linea, camposEditables, quincena }: {
  persona: PersonaAbierta
  cerrada: boolean
  linea?: LineaDeLaPersona
  camposEditables: CampoEditable[]
  quincena: { desde: string; hasta: string }
}) {
  const calculada = calcularCadena({
    horas: persona.cargadas,
    valorHora: persona.valorHora,
    adelanto: persona.adelanto,
    yaTransferido: null,
    porBanco: null,
    efectivoRedondeado: null,
  })
  const l = linea?.linea
  const grupo = linea?.grupo ?? 'obreros'
  const editable = (campo: CampoEditable): boolean =>
    !cerrada && l != null && camposEditables.includes(campo)

  const celda = (campo: CampoEditable, valor: number | null) => (
    editable(campo) ? (
      <InlineEdit
        valor={valor}
        tipo="numero"
        alineado="right"
        ancho="w-28"
        falta="—"
        etiqueta={`${campo} de ${persona.nombre}`}
        testid={`panel-celda-${campo}`}
        mostrar={(v) => pesos(Number(v))}
        guardar={async (v) => {
          const r = await guardarCeldaLiquidacion({
            ...quincena, grupo, persona_id: persona.id, campo, valor: v.trim(),
          })
          return r.ok ? { ok: true } : { ok: false, error: r.error }
        }}
      />
    ) : <span style={{ color: valor == null ? V.tenue : V.tinta }}>{pesos(valor)}</span>
  )

  const fila = (rotulo: React.ReactNode, valor: React.ReactNode, opciones?: { total?: boolean; manual?: boolean }) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 42,
      borderBottom: opciones?.total ? 'none' : `1px solid ${V.linea}`,
      borderTop: opciones?.total ? `1px solid ${V.grafito}` : undefined,
      fontWeight: opciones?.total ? 600 : 400,
    }}>
      <span style={{ color: opciones?.total ? V.tinta : V.apagado }}>
        {rotulo}
        {/* UNA CELDA ESCRITA A MANO SE DECLARA: sin la marca, un número pisado se lee como calculado. */}
        {opciones?.manual && <span style={{ marginLeft: 6, fontSize: '10px', color: V.warn }}>a mano</span>}
      </span>
      <span>{valor}</span>
    </div>
  )

  return (
    <div data-testid="cadena-de-pago" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>Lo que se le paga esta quincena</div>
        <div style={{ fontSize: '11.5px', color: V.tenue }}>
          {cerrada ? 'cerrada · sellada' : 'abierta · nada sellado'}
        </div>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', fontSize: '12.5px',
        fontVariantNumeric: 'tabular-nums', maxWidth: 460,
      }}>
        {fila(
          grupo !== 'obreros' ? (
            // OFICINA COBRA UN NETO MENSUAL: escribir «0 h × sin retribución» al lado de un importe
            // real diría que la cifra salió de una tarifa que no existe. El $/h ni se ofrece.
            <>Neto del período</>
          ) : (
          <>
            {horas(l?.horas ?? calculada.horas)} h ×{' '}
            {/* EL $/H VIVE EN `persona_tarifa`, NO EN LA LÍNEA: se escribe con su propia acción y
                sólo para obreros — oficina cobra un neto mensual (CHECK «una sola forma»). */}
            {!cerrada && l != null && grupo === 'obreros' ? (
              <InlineEdit
                valor={l.valorHora}
                tipo="numero"
                alineado="right"
                ancho="w-20"
                falta="sin tarifa"
                etiqueta={`valor hora de ${persona.nombre}`}
                testid="panel-celda-valorHora"
                mostrar={(v) => pesos(Number(v))}
                guardar={async (v) => {
                  const r = await guardarValorHora({
                    ...quincena, grupo, persona_id: persona.id, valor: v.trim(),
                  })
                  return r.ok ? { ok: true } : { ok: false, error: r.error }
                }}
              />
            ) : pesos(l?.valorHora ?? calculada.valorHora)}
          </>
          ),
          celda('cobra', l?.cobra ?? calculada.cobra),
          { manual: l?.manual.cobra },
        )}
        {fila('Adelanto', celda('adelanto', l?.adelanto ?? calculada.adelanto), { manual: l?.manual.adelanto })}
        {fila('Ya transferido', celda('yaTransferido', l?.yaTransferido ?? null), { manual: l?.manual.yaTransferido })}
        {fila('Por banco', celda('porBanco', l?.porBanco ?? null), { manual: l?.manual.porBanco })}
        {fila('En efectivo', celda('enEfectivo', l?.enEfectivo ?? calculada.enEfectivo), { total: true, manual: l?.manual.enEfectivo })}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 }}>
          <span style={{ color: V.apagado }}>Efectivo redondeado</span>
          {!cerrada && l != null ? (
            <InlineEdit
              valor={l.efectivoRedondeado}
              tipo="numero"
              alineado="right"
              ancho="w-28"
              falta="—"
              etiqueta={`efectivo redondeado de ${persona.nombre}`}
              testid="panel-celda-efectivoRedondeado"
              mostrar={(v) => pesos(Number(v))}
              guardar={async (v) => {
                const r = await guardarEfectivoRedondeado({
                  ...quincena, grupo, persona_id: persona.id, importe: v.trim(),
                })
                return r.ok ? { ok: true } : { ok: false, error: r.error }
              }}
            />
          ) : <span>{pesos(l?.efectivoRedondeado ?? null)}</span>}
        </div>
      </div>
      <p style={{ fontSize: '11px', color: V.tenue, lineHeight: 1.6, margin: 0 }}>
        {l == null
          ? 'Esta persona todavía no tiene línea en el cuadro de Pagos: sin horas ni tarifa no hay dónde guardar una celda.'
          : 'COBRA = horas × $/h · EN EFECTIVO = COBRA − adelanto − ya transferido − por banco. Lo que se escribe a mano pisa el cálculo y se marca.'}
      </p>
      {/* LA COLUMNA ADELANTO DEJA DE SER PAPEL. Hasta hoy salía de la columna Z de JORNALES y se
          RESTABA sin tener de dónde salir: a quien ya recibió plata en mano se le pagaba dos veces. */}
      <RegistrarAdelanto personaId={persona.id} quincena={quincena} cerrada={cerrada} />
    </div>
  )
}
