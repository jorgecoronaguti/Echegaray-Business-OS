'use client'

// PANTALLAS 2 Y 3 DEL HANDOFF v2 — la persona abierta y el día editable, sin salir del cuadro.
//
// ═══ ABRIR UNA PERSONA NO NAVEGA ═══
//
// El panel se despliega al costado con los datos que YA VIAJARON con la grilla: la solapa lee la
// quincena entera de una vez, así que abrir una fila no pide nada a la base. Una navegación por
// persona serían diecisiete cargas de pantalla para revisar un plantel.
//
// ═══ «SIN CARGAR» NO ES VACÍO Y NO ES CERO (R1) ═══
//
// Todo campo sin dato se escribe con la palabra, en gris. Un guion o una celda en blanco se leen
// como «no tiene» y esto es «nadie lo cargó»: uno es una afirmación sobre la persona y el otro
// sobre el trabajo administrativo pendiente.

import React, { useState } from 'react'
import { InlineEdit } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { corregirHorasDelDia } from '../../services/liquidacionDiaActions'
import {
  calcularCadena, diasDelPanel, hhPorMes,
  type CorreccionDeDia, type DiaDelPanel, type RegistroDelPanel,
} from '../../services/panelDePersona'

export interface PersonaAbierta {
  nombre: string
  numeroLegajo: string | null
  encabezado: string
  valorHora: number | null
  legajo: { rotulo: string; valor: string | null; mono?: boolean }[]
  laboral: { rotulo: string; valor: string | null; mono?: boolean }[]
  asignacion: { rotulo: string; valor: string | null; mono?: boolean }[]
  filasHH: { fecha: string; horas: number | null }[]
  registrosDeLaQuincena: RegistroDelPanel[]
  adelanto: number | null
  cargadas: number
}

const MONO = 'var(--font-mono, "IBM Plex Mono", monospace)'

const pesos = (n: number | null): string =>
  n == null ? 'sin retribución' : n.toLocaleString('es-AR', { maximumFractionDigits: 0 })

const horas = (n: number | null): string =>
  n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.06em', color: V.tenue,
      textTransform: 'uppercase',
    }}>{children}</div>
  )
}

/** Un bloque del legajo: rótulo a la izquierda, valor a la derecha, «sin cargar» donde no hay dato. */
function Bloque({ titulo, campos }: {
  titulo: string
  campos: { rotulo: string; valor: string | null; mono?: boolean }[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid={`bloque-${titulo.toLowerCase()}`}>
      <Eyebrow>{titulo}</Eyebrow>
      <div style={{
        display: 'grid', gridTemplateColumns: '86px 1fr', rowGap: 7, columnGap: 10,
        fontSize: '11.5px', alignItems: 'baseline',
      }}>
        {campos.map((c) => (
          <React.Fragment key={c.rotulo}>
            <div style={{ color: V.apagado }}>{c.rotulo}</div>
            <div style={{
              fontFamily: c.mono ? MONO : undefined,
              color: c.valor == null ? V.tenue : V.tinta,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{c.valor ?? 'sin cargar'}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}


/** La cadena de R5 de esta persona: cuatro celdas escritas, tres calculadas. */
function CadenaDePago({ persona, cerrada }: { persona: PersonaAbierta; cerrada: boolean }) {
  const c = calcularCadena({
    horas: persona.cargadas,
    valorHora: persona.valorHora,
    adelanto: persona.adelanto,
    yaTransferido: null,
    porBanco: null,
    efectivoRedondeado: null,
  })
  const fila = (rotulo: string, valor: string, opciones?: { total?: boolean; tenue?: boolean }) => (
    <div key={rotulo} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 42,
      borderBottom: opciones?.total ? 'none' : `1px solid ${V.linea}`,
      borderTop: opciones?.total ? `1px solid ${V.grafito}` : undefined,
      fontWeight: opciones?.total ? 600 : 400,
    }}>
      <span style={{ color: opciones?.total ? V.tinta : V.apagado }}>{rotulo}</span>
      <span style={{ color: opciones?.tenue ? V.tenue : V.tinta }}>{valor}</span>
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
          c.valorHora == null
            ? `${horas(c.horas)} h × sin retribución cargada`
            : `${horas(c.horas)} h × ${pesos(c.valorHora)}`,
          pesos(c.cobra),
          { tenue: c.cobra == null },
        )}
        {fila('Adelanto', c.adelanto == null ? '—' : `− ${pesos(c.adelanto)}`, { tenue: c.adelanto == null })}
        {fila('Ya transferido', '—', { tenue: true })}
        {fila('Por banco', '—', { tenue: true })}
        {fila('En efectivo', pesos(c.enEfectivo), { total: true, tenue: c.enEfectivo == null })}
      </div>
      <p style={{ fontSize: '11px', color: V.tenue, lineHeight: 1.6, margin: 0 }}>
        ADELANTO <code>nomina_adelanto</code> · YA TRANSFERIDO y POR BANCO se escriben en la solapa
        Pagos · EFECTIVO = COBRA − los tres.
      </p>
    </div>
  )
}

/** PANTALLA 3 · el día editable ahí mismo, con su rastro. */
function DiasDeLaPersona({ dias }: { dias: DiaDelPanel[] }) {
  const COLUMNAS = '82px minmax(200px,1fr) 118px 108px 210px 62px 92px'
  const [verOriginal, setVerOriginal] = useState<string | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="dias-de-la-persona">
      <div style={{
        display: 'grid', gridTemplateColumns: COLUMNAS, gap: 12, height: 34, alignItems: 'end',
        borderBottom: `1px solid ${V.linea}`, paddingBottom: 9, fontFamily: MONO,
        fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue, textTransform: 'uppercase',
      }}>
        <div>Día</div><div>Obra</div><div>Actividad</div><div>Clase</div><div>Cargó</div>
        <div style={{ textAlign: 'right' }}>HH</div><div />
      </div>
      {dias.length === 0 && (
        <div style={{ padding: '16px 0', fontSize: '12.5px', color: V.apagado }}>
          Nadie cargó horas de esta persona en la quincena.
        </div>
      )}
      {dias.map((d) => (
        <div key={d.registroId} style={{
          display: 'grid', gridTemplateColumns: COLUMNAS, gap: 12, minHeight: 52,
          alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '12.5px',
          fontVariantNumeric: 'tabular-nums',
          background: d.rastro.texto ? '#FAFAF8' : undefined,
        }} data-testid={`dia-${d.registroId}`}>
          <div style={{ fontFamily: MONO }}>{d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}/{d.fecha.slice(2, 4)}</div>
          <div>{d.obra ?? <span style={{ color: V.tenue }}>sin obra</span>}</div>
          <div style={{ color: V.apagado }}>{d.actividad ?? 'toda la obra'}</div>
          <div style={{ color: V.apagado }}>{d.clase}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ fontSize: '11.5px', color: V.apagado }}>{d.cargo}</div>
            {d.rastro.texto && (
              <div style={{ fontSize: '10.5px', color: V.warn }} data-testid={`rastro-${d.registroId}`}>
                {d.rastro.texto}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {d.editable ? (
              <InlineEdit
                valor={d.horas}
                tipo="numero"
                falta="—"
                ancho="w-[56px]"
                alineado="right"
                etiqueta={`Horas del ${d.fecha}`}
                testid={`hh-${d.registroId}`}
                guardar={corregirHorasDelDia.bind(null, d.registroId)}
              />
            ) : (
              <span style={{ color: d.horas == null ? V.tenue : V.tinta }}>{horas(d.horas)}</span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: V.apagado }}>
            {d.rastro.texto && (
              <button
                type="button"
                onClick={() => setVerOriginal(verOriginal === d.registroId ? null : d.registroId)}
                style={{ color: V.apagado, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit' }}
                data-testid={`ver-original-${d.registroId}`}
              >
                {verOriginal === d.registroId
                  ? `original: ${horas(d.rastro.original)} h`
                  : 'Ver el original'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PanelDePersona({ persona, cerrada, correcciones, cerrar, hasta }: {
  persona: PersonaAbierta
  cerrada: boolean
  correcciones: Record<string, CorreccionDeDia[]>
  cerrar: () => void
  /** Último día de la quincena: es el mes que «HH por mes» marca como actual. */
  hasta: string
}) {
  const dias = diasDelPanel(
    persona.registrosDeLaQuincena,
    new Map(Object.entries(correcciones)),
    // QUINCENA CERRADA → SÓLO LECTURA (R6). La acción vuelve a comprobarlo en el servidor.
    { editable: !cerrada },
  )
  const meses = hhPorMes(persona.filasHH, hasta)
  return (
    <div data-testid="panel-persona" style={{
      borderTop: `1px solid ${V.lineaFuerte}`, display: 'flex', alignItems: 'stretch',
      background: '#FFFFFF',
    }}>
      <div style={{ flex: 1, minWidth: 0, padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>{persona.nombre}</div>
          {persona.numeroLegajo && (
            <div style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>
              legajo {persona.numeroLegajo}
            </div>
          )}
          <button
            type="button" onClick={cerrar} data-testid="cerrar-panel-persona"
            style={{
              marginLeft: 'auto', height: 26, padding: '0 10px', border: `1px solid ${V.lineaFuerte}`,
              borderRadius: 6, background: '#FFFFFF', fontSize: '11.5px', cursor: 'pointer',
            }}
          >Cerrar</button>
        </div>
        {persona.encabezado && (
          <div style={{ fontSize: '12.5px', color: V.apagado }}>{persona.encabezado}</div>
        )}
        <CadenaDePago persona={persona} cerrada={cerrada} />
        <DiasDeLaPersona dias={dias} />
      </div>

      <aside style={{
        width: 300, flex: 'none', borderLeft: `1px solid ${V.lineaFuerte}`, background: '#FAFAF8',
        padding: '20px 20px 26px', display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        <Bloque titulo="Legajo" campos={persona.legajo} />
        <Bloque titulo="Laboral" campos={persona.laboral} />
        <Bloque titulo="Asignación" campos={persona.asignacion} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Eyebrow>HH por mes</Eyebrow>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 7, columnGap: 10,
            fontSize: '11.5px', fontVariantNumeric: 'tabular-nums',
          }}>
            {meses.map((m) => (
              <React.Fragment key={m.clave}>
                <div style={{ color: V.apagado }}>{m.rotulo}</div>
                {/* NULL NUNCA ES CERO: el mes sin filas dice «sin cargar», no 0. */}
                <div style={{ fontWeight: m.actual ? 600 : 400, color: m.horas == null ? V.tenue : V.tinta }}>
                  {m.horas == null ? 'sin cargar' : horas(m.horas)}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
