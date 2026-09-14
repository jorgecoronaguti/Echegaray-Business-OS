'use client'

// EL HISTORIAL DEL VALOR HORA, AL COSTADO DEL CUADRO.
//
// Dueño, 14/09/2026: *«no tengo referencias de valores hs históricos de cada uno»*.
//
// ═══ DRAWER Y NO `PanelDePersona` ═══
//
// `PanelDePersona` se despliega DEBAJO de la grilla y a lo ancho: abrirlo empuja el cuadro y la fila
// que se está mirando sale de la pantalla. El historial se consulta mientras se escribe el $/h de
// esa misma fila, así que va en el `Drawer` del sistema, que flota encima y no mueve un píxel. El
// legajo completo sigue a un clic, en su pantalla.
//
// Cada fila trae su origen y, para el $/h, el básico de la categoría A ESA FECHA. Sin escala cargada
// dice «sin escala»: nunca un básico supuesto (ver `exposicionConvenio.ts`).

import Link from 'next/link'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { pctDeAumento, type EntradaDeHistorial } from '../../../services/cuadroDeJornales'
import { rotuloCategoria } from './CeldaTarifa'

const MONO = "'IBM Plex Mono', monospace"
const COLUMNAS = '72px 96px 64px minmax(120px,1fr)'
const corta = (iso: string | null): string =>
  iso == null ? 'sin cargar' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

export interface PersonaDelHistorial {
  personaId: string
  nombre: string
  alta: string | null
  categoria: string | null
}

export function HistorialDeTarifa({ persona, entradas, completo, onCerrar }: {
  persona: PersonaDelHistorial
  entradas: readonly EntradaDeHistorial[]
  /** `false` = la lectura de tarifas o escalas falló: el historial puede estar incompleto y lo dice. */
  completo: boolean
  onCerrar: () => void
}) {
  return (
    <Drawer
      titulo={persona.nombre}
      subtitulo={`Alta ${corta(persona.alta)} · ${persona.categoria ? rotuloCategoria(persona.categoria) : 'sin categoría'}`}
      onCerrar={onCerrar}
      ancho={480}
      testid="historial-tarifa"
      pie={(
        <Link href={`/administracion/personas/${persona.personaId}`} prefetch={false}
          style={{ fontSize: '12.5px', color: V.tinta }}>Ver el legajo completo</Link>
      )}
    >
      <div style={{ padding: '16px 16px 24px' }}>
        {!completo && (
          <div style={{ fontSize: '12px', color: V.warn, paddingBottom: 12 }}>
            No pude leer todas las tarifas o escalas: el historial puede estar incompleto.
          </div>
        )}
        <div style={{
          display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, paddingBottom: 8,
          borderBottom: `1px solid ${V.linea}`, fontFamily: MONO, fontSize: '9.5px',
          letterSpacing: '.04em', color: V.tenue, textTransform: 'uppercase',
        }}>
          <div>Desde</div><div style={{ textAlign: 'right' }}>Valor</div>
          <div style={{ textAlign: 'right' }}>Aumento</div><div>Básico UOCRA · origen</div>
        </div>
        {entradas.length === 0 && (
          <div style={{ padding: '16px 0', fontSize: '12.5px', color: V.apagado }}>Sin tarifa cargada.</div>
        )}
        {entradas.map((e) => <Renglon key={`${e.desde}-${e.forma}`} e={e} />)}
      </div>
    </Drawer>
  )
}

function Renglon({ e }: { e: EntradaDeHistorial }) {
  const contraBasico = e.basico ? pctDeAumento(e.basico.valorHora, e.valor) : null
  return (
    <div data-testid={`historial-${e.desde}`} style={{
      display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, padding: '8px 0', alignItems: 'baseline',
      borderBottom: `1px solid ${V.linea}`, fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
      fontWeight: e.vigente ? 600 : 400,
    }}>
      <div style={{ fontFamily: MONO, fontSize: '11.5px' }}>
        {corta(e.desde)}
        {e.vigente && <div style={{ fontFamily: 'inherit', fontSize: '10px', fontWeight: 400, color: V.apagado }}>rige</div>}
      </div>
      <div style={{ textAlign: 'right' }}>{pesos(e.valor)}{e.forma === 'mensual' ? ' /mes' : '/h'}</div>
      <div style={{ textAlign: 'right', color: e.pctAumento != null && e.pctAumento < 0 ? V.neg : V.apagado }}>
        {e.pctAumento == null ? '—' : `${e.pctAumento > 0 ? '+' : ''}${e.pctAumento.toLocaleString('es-AR')}%`}
      </div>
      <div style={{ fontWeight: 400, minWidth: 0 }}>
        {e.forma === 'hora' && (e.basico ? (
          <div title={e.basico.fuente}>
            {`${pesos(e.basico.valorHora)}/h`}
            {contraBasico != null && (
              <span style={{ color: contraBasico < 0 ? V.neg : V.apagado }}>
                {` · ${contraBasico > 0 ? '+' : ''}${contraBasico.toLocaleString('es-AR')}%`}
              </span>
            )}
          </div>
        ) : <div style={{ color: V.tenue }}>sin escala cargada</div>)}
        <div style={{ fontSize: '11px', color: V.apagado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={e.origen}>{e.origen}</div>
      </div>
    </div>
  )
}
