'use client'

// LA CELDA FIJA DE PERSONA, IGUAL EN LOS DOS CUADROS: el nombre en un renglón entero (abre el panel), debajo CUÁNTO
// COBRA, después lo que explica cómo cobra, y a la derecha la marca de pago. Lo que cambia entre jornalero y mensual
// es sólo el detalle y de qué pago sale el cobro.
//
// ═══ EL ORDEN DE LECTURA ES LA JERARQUÍA (dueño, 17/09/2026: «no está claro cuánto cobra cada uno») ═══
//
// Quién · cuánto cobra · por qué cobra eso. El «por qué» —categoría del recibo y de plataforma— se mira cuando algo
// no cuadra, así que va tenue y abajo; antes competía en tinta con el nombre y el cuadro no decía en ninguna parte
// visible cuánto termina cobrando la persona.

import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { COLUMNA_FIJA, fondoDeColumnaFija } from '../solapas/tabla'
import { MarcaDePago } from './MarcaDePago'
import { PERSONA_ESTIRADA } from './TablaDeBloques'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { CampoEditable } from '../../../services/liquidacionOverrides'

const corta = (iso: string | null): string =>
  iso == null ? 'alta sin cargar' : `alta ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

export function CeldaPersona({ fila, fondo, quincena, camposEditables, abrir, cobro, detalle }: {
  fila: FilaDelEspejo
  /** El color de la fila (pagada), para que la celda fija lo repita OPACO. */
  fondo: string | undefined
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  abrir: () => void
  /** Cuánto cobra: `LoQueCobra`, con el pago que corresponde a su tipo. */
  cobro: ReactNode
  /** Los dos renglones chicos de abajo del nombre. */
  detalle: ReactNode
}) {
  return (
    <div style={{ ...COLUMNA_FIJA, ...PERSONA_ESTIRADA, background: fondoDeColumnaFija(fondo) }}>
      <button type="button" onClick={abrir} data-testid={`espejo-nombre-${fila.personaId}`} title={`${fila.nombre} · ${corta(fila.alta)} · abrir el detalle`}
        style={{
          display: 'block', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
          color: V.tinta, font: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{fila.nombre}</button>
      {cobro}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* EL DETALLE ES SEGUNDO PLANO: tenue. Quien necesita mirarlo lo busca; quien mira la fila busca la plata. */}
        <div style={{ flex: 1, minWidth: 0, fontSize: '11px', lineHeight: '13px', color: V.tenue }}>
          {detalle}
          {/* QUIEN YA NO ESTÁ NUNCA DESAPARECE DE SU QUINCENA (dueño, 14/09/2026): marca chica y apagada. */}
          {fila.baja && (
            <span data-testid={`baja-${fila.personaId}`} title={fila.baja.titulo} style={{ color: V.tenue }}>{fila.baja.texto}</span>
          )}
        </div>
        {/* UN CLIC Y ESTÁ PAGADA (dueño, 16/09/2026). Sólo donde la base ya tiene la marca. */}
        {camposEditables.includes('pagadoBanco') && (
          <MarcaDePago personaId={fila.personaId} grupo={fila.grupo} quincena={quincena} pagadaEn={fila.linea.pagadaEn} cerrada={fila.cerrada} />
        )}
      </div>
    </div>
  )
}

/** Un renglón del detalle, recortado con puntos suspensivos. */
export const RenglonDelDetalle = ({ children, tono, testid, titulo }: { children: ReactNode; tono?: string; testid?: string; titulo?: string }) => (
  <div data-testid={testid} title={titulo} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tono }}>{children}</div>
)
