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
import Link from 'next/link'
import { CadenaDePago } from './CadenaDePago'
import { InlineEdit } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { corregirHorasDelDia } from '../../services/liquidacionDiaActions'
import type { CampoEditable, LineaConOverrides } from '../../services/liquidacionOverrides'
import type { FilaDeGrilla } from '../../services/grillaHorasQuincena'
import { ALTO_LIQ } from './solapas/tabla'
import {
  diasDelPanel,
  type CorreccionDeDia, type DiaDelPanel, type MesDeHH, type RegistroDelPanel,
} from '../../services/panelDePersona'

/** La línea de esta persona en el cuadro de Pagos, con su grupo: es la MISMA fila, no una copia. */
export interface LineaDeLaPersona {
  grupo: string
  linea: LineaConOverrides
}

export interface PersonaAbierta {
  id: string
  nombre: string
  numeroLegajo: string | null
  encabezado: string
  valorHora: number | null
  legajo: { rotulo: string; valor: string | null; mono?: boolean }[]
  laboral: { rotulo: string; valor: string | null; mono?: boolean }[]
  asignacion: { rotulo: string; valor: string | null; mono?: boolean }[]
  /** LOS CINCO MESES YA SUMADOS. Acá llegaban las FILAS de cinco meses de las diecisiete personas
   *  —2.069 filas por carga— para agruparlas en el navegador y dibujar cinco barras. La suma la hace
   *  `hhPorMes` en el servidor, la misma función que se llamaba acá: no hay una segunda definición. */
  mesesHH: MesDeHH[]
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

/**
 * Un bloque del legajo: rótulo a la izquierda, valor a la derecha, «sin cargar» donde no hay dato.
 *
 * ═══ «EDITAR» NO ABRE UN FORMULARIO ACÁ ═══
 *
 * El mockup (liqhs v2:262, :279) pone «Editar» arriba de LEGAJO y de LABORAL. Estos campos ya se
 * editan en el legajo, con sus validaciones, su historial y su permiso: repetir el formulario acá
 * crearía una SEGUNDA definición de la misma escritura, y el día que una de las dos cambie el dato
 * va a depender de por qué pantalla entró quien lo tocó. El enlace lleva a donde ya se edita.
 */
function Bloque({ titulo, campos, editar }: {
  titulo: string
  campos: { rotulo: string; valor: string | null; mono?: boolean }[]
  editar?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid={`bloque-${titulo.toLowerCase()}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Eyebrow>{titulo}</Eyebrow>
        {editar && (
          <Link
            href={editar} prefetch={false} data-testid={`editar-${titulo.toLowerCase()}`}
            style={{ fontSize: '11px', color: V.apagado, textDecoration: 'none' }}
          >Editar</Link>
        )}
      </div>
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



/**
 * LA BANDA DE CUATRO MÉTRICAS — lo primero que se lee al abrir a alguien (mockup, líneas 226-247).
 *
 * Contesta las cuatro preguntas en el orden en que se hacen: cuánto trabajó, cuántos días vino,
 * cuánto faltó, y cuánto le cuesta a la obra. Sin ella el panel arranca con la cadena de pago, que
 * es la respuesta a la cuarta pregunta sin haber contestado las tres anteriores.
 *
 * «SIN BASE» NO ES CERO (R1): sin alícuotas cargadas el costo NO se publica como número. Un costo
 * de obra inventado se copia a un presupuesto y ahí ya no se distingue de un dato.
 */
function Metricas({ fila, habilesTexto, bolsillo, multiplicador }: {
  fila?: FilaDeGrilla
  habilesTexto?: string
  bolsillo: number | null
  multiplicador?: number | null
}) {
  if (!fila) return null
  const trabajados = fila.celdas.filter((c) => c.marca === 'horas').length
  const ausencias = fila.celdas.filter((c) => c.marca === 'ausencia').length
  const costo = bolsillo != null && multiplicador != null ? bolsillo * multiplicador : null
  return (
    <div data-testid="metricas-persona" style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, padding: '14px 0',
      borderTop: `1px solid ${V.linea}`, borderBottom: `1px solid ${V.linea}`,
    }}>
      <Metrica rotulo="HH cargadas" valor={horas(fila.cargadas)}
        nota={`de ${horas(fila.esperadas)} esperadas`} />
      <Metrica rotulo="Días trabajados" valor={String(trabajados)} nota={habilesTexto} />
      <Metrica rotulo="Ausencias" valor={String(ausencias)}
        alerta={fila.diasSinMotivo > 0}
        nota={fila.diasSinMotivo > 0 ? `${fila.diasSinMotivo} sin motivo` : (ausencias > 0 ? 'todas con motivo' : undefined)} />
      <Metrica rotulo="Costo cargado" valor={costo == null ? 'sin base' : pesos(costo)}
        nota={costo == null
          ? 'faltan las alícuotas del costo real'
          : `${pesos(bolsillo)} de bolsillo + cargas`} />
    </div>
  )
}

function Metrica({ rotulo, valor, nota, alerta }: {
  rotulo: string; valor: string; nota?: string; alerta?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Eyebrow>{rotulo}</Eyebrow>
      <div style={{
        fontSize: '19px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        color: alerta ? V.warn : V.tinta,
      }}>{valor}</div>
      {nota && <div style={{ fontSize: '11px', color: alerta ? V.warn : V.apagado }}>{nota}</div>}
    </div>
  )
}

/** PANTALLA 3 · el día editable ahí mismo, con su rastro. */
function DiasDeLaPersona({ dias, titulo, subtitulo, habiles }: {
  dias: DiaDelPanel[]
  titulo: string
  subtitulo: string
  /** «5 hábiles por delante»: lo que todavía se puede cargar sin que sea una falta (R3). */
  habiles: number
}) {
  const COLUMNAS = '82px minmax(200px,1fr) 118px 108px 210px 62px 92px'
  const [verOriginal, setVerOriginal] = useState<string | null>(null)
  const conHoras = dias.filter((d) => d.horas != null && d.horas > 0).length
  const sinVenir = dias.filter((d) => d.horas == null || d.horas === 0).length
  // NULL NO SUMA: el día sin horas no aporta 0, queda fuera de la cuenta y se declara aparte.
  const totalHH = dias.reduce((s2, d) => s2 + (d.horas ?? 0), 0)
  return (
    // ═══ EL SELECTOR HOY / SEMANA / QUINCENA / MES NO SE DIBUJA ═══
    //
    // El mockup lo pone en la pantalla 3 (liqhs v2:332). El panel recibe `registrosDeLaQuincena`:
    // `getLiquidacionDeLaQuincena` lee `registros_hh` acotado a `q.desde`–`q.hasta` y no trae un día
    // fuera de esa ventana. Dibujar cuatro períodos sobre una sola ventana daría tres pestañas que
    // filtran hacia ADENTRO de la quincena y una cuarta —Mes— que mostraría los mismos días de la
    // quincena bajo un rótulo que promete el mes entero. Ese es el peor de los dos errores: no es
    // una pantalla incompleta, es una pantalla que miente sobre su alcance. Se dibuja cuando la
    // lectura pueda pedir la ventana; el subtítulo ya dice cuál está mirando.
    <div data-testid="dias-de-la-persona">
    {/* EL ENCABEZADO DEL BLOQUE (mockup pantalla 3, línea 329): quién y qué ventana. Sin él, la
        tabla de días se lee como la continuación de la cadena de pago. */}
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 14, paddingBottom: 14,
      borderBottom: `1px solid ${V.linea}`,
    }}>
      <div style={{ fontSize: '14.5px', fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: '11.5px', color: V.apagado }} data-testid="dias-subtitulo">{subtitulo}</div>
    </div>
    <div className="overflow-x-auto">
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 700 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: COLUMNAS, gap: 12, height: ALTO_LIQ.renglonBajo, alignItems: 'end',
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
          display: 'grid', gridTemplateColumns: COLUMNAS, gap: 12, minHeight: ALTO_LIQ.fila,
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
      <div style={{
        display: 'grid', gridTemplateColumns: COLUMNAS, gap: 12, height: ALTO_LIQ.totalAncho, alignItems: 'center',
        borderTop: `1px solid ${V.grafito}`, fontSize: '12.5px', fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }} data-testid="total-dias">
        <div>{conHoras} día{conHoras === 1 ? '' : 's'}</div>
        <div style={{ fontWeight: 400, fontSize: '11.5px', color: V.apagado }}>
          {sinVenir > 0 && `${sinVenir} sin venir · `}{habiles} hábil{habiles === 1 ? '' : 'es'} por delante
        </div>
        <div /><div /><div />
        <div style={{ textAlign: 'right' }}>{horas(totalHH)}</div>
        <div />
      </div>
    </div>
    </div>
    </div>
  )
}

export function PanelDePersona({
  persona, cerrada, correcciones, cerrar, quincena, linea, camposEditables,
  fila, habilesTexto, multiplicador,
}: {
  persona: PersonaAbierta
  cerrada: boolean
  /** La fila de la grilla de esta persona: de ahí salen días trabajados y ausencias, ya contados. */
  fila?: FilaDeGrilla
  habilesTexto?: string
  multiplicador?: number | null
  correcciones: Record<string, CorreccionDeDia[]>
  cerrar: () => void
  quincena: { desde: string; hasta: string }
  linea?: LineaDeLaPersona
  camposEditables: CampoEditable[]
}) {
  const dias = diasDelPanel(
    persona.registrosDeLaQuincena,
    new Map(Object.entries(correcciones)),
    // QUINCENA CERRADA → SÓLO LECTURA (R6). La acción vuelve a comprobarlo en el servidor.
    { editable: !cerrada },
  )
  const meses = persona.mesesHH
  return (
    // EN EL TELÉFONO EL LEGAJO VA DEBAJO. Con la columna de 300 px fija, a 390 px la cadena de pago
    // quedaba en cuarenta píxeles de ancho y el texto salía en vertical, letra por letra.
    <div data-testid="panel-persona" className="flex flex-col items-stretch lg:flex-row" style={{
      borderTop: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF',
    }}>
      <div className="min-w-0 flex-1" style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>{persona.nombre}</div>
          {persona.numeroLegajo && (
            <div style={{ fontFamily: MONO, fontSize: '11.5px', color: V.tenue }}>
              legajo {persona.numeroLegajo}
            </div>
          )}
          {/* EL LEGAJO COMPLETO ES OTRA PANTALLA, y esto es la puerta: el dueño la pidió textual
              («desde liq de hs quiero entrar al legajo de cada uno»). Abre en la misma pestaña: la
              solapa Horas se recupera con el botón atrás y sin perder la quincena. */}
          <Link
            href={`/administracion/personas/${persona.id}`}
            prefetch={false}
            data-testid="ver-legajo-completo"
            style={{
              marginLeft: 'auto', height: 26, padding: '0 10px', display: 'inline-flex',
              alignItems: 'center', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6,
              background: '#FFFFFF', fontSize: '11.5px', color: V.tinta, textDecoration: 'none',
            }}
          >Ver el legajo completo</Link>
          <button
            type="button" onClick={cerrar} data-testid="cerrar-panel-persona"
            style={{
              height: 26, padding: '0 10px', border: `1px solid ${V.lineaFuerte}`,
              borderRadius: 6, background: '#FFFFFF', fontSize: '11.5px', cursor: 'pointer',
            }}
          >Cerrar</button>
        </div>
        {persona.encabezado && (
          <div style={{ fontSize: '12.5px', color: V.apagado }}>{persona.encabezado}</div>
        )}
        <Metricas
          fila={fila}
          habilesTexto={habilesTexto}
          bolsillo={linea?.linea.cobra ?? (persona.valorHora == null ? null : persona.cargadas * persona.valorHora)}
          multiplicador={multiplicador}
        />
        <CadenaDePago
          persona={persona} cerrada={cerrada} linea={linea}
          camposEditables={camposEditables} quincena={quincena}
        />
        <DiasDeLaPersona
          dias={dias}
          titulo={`${persona.nombre} · ${quincena.desde.slice(8, 10)} al ${quincena.hasta.slice(8, 10)}`}
          subtitulo={`${horas(persona.cargadas)} de ${horas(fila?.esperadas ?? null)}`}
          habiles={fila ? fila.celdas.filter((c) => c.marca === 'sin-cargar').length : 0}
        />
      </div>

      <aside
        className="order-first w-full border-b lg:order-none lg:w-[300px] lg:flex-none lg:border-b-0 lg:border-l"
        style={{
          borderColor: V.lineaFuerte, background: '#FAFAF8',
          padding: '20px 20px 26px', display: 'flex', flexDirection: 'column', gap: 24,
        }}>
        <Bloque titulo="Legajo" campos={persona.legajo} editar={`/administracion/personas/${persona.id}`} />
        <Bloque titulo="Laboral" campos={persona.laboral} editar={`/administracion/personas/${persona.id}`} />
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
