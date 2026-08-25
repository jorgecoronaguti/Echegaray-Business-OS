'use client'

// «FRENTES EN CURSO» — PORTE LITERAL de la tarjeta inferior derecha del canónico 05.
//
// Columnas medidas del mockup: `minmax(0,1fr) 128px 128px 60px 22px`, filas de `padding:9px 16px`,
// barra de 5 px sobre canal `#EAE7E6` y el «+» del borde derecho. Los dos filtros de la cabecera
// son las pastillas de 11,5px/`padding:3px 9px` del zip —más chicas que el chip del 01 y del 03, y
// sin número: acá no cuentan nada—.
//
// TOCAR LA FILA CARGA ESE FRENTE EN EL FORMULARIO DE AL LADO. No navega: la fila es el atajo para
// no buscar el nombre en el desplegable, y el parte se sigue cargando en la misma pantalla.

import { useState } from 'react'
import type { Actividad } from '../../types'
import {
  acumuladoDeFrente, nombreDeFrente, textoDeAvance, tonoDeBarra,
} from '../../services/parteDiario.ts'
import { hh as fmtHH } from '../formato'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { Hover } from '../canon/Piezas'

/** Cuántos frentes entran sin desplegar. El canónico corta en 5 y ofrece «Ver N más». */
const VISIBLES = 5

const COLOR_BARRA: Record<ReturnType<typeof tonoDeBarra>, string> = {
  completo: C.pos, curso: C.curso, nulo: C.bordeFuerte,
}
const COLOR_VALOR: Record<ReturnType<typeof tonoDeBarra>, string> = {
  completo: C.pos, curso: C.tinta, nulo: C.tenue,
}

function Filtro({ activo, onClick, testid, children }: {
  activo: boolean; onClick: () => void; testid: string; children: string
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={activo} data-testid={testid}
      style={{
        fontSize: '11.5px', border: `1px solid ${activo ? C.grafito : C.borde}`,
        background: activo ? C.grafito : C.superficie, color: activo ? C.superficie : C.tintaMedia,
        borderRadius: '6px', padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit',
        lineHeight: 1.4,
      }}
    >{children}</button>
  )
}

export function FrentesEnCurso({ frentes, elegida, soloCurso, verCurso, elegir, sinParte }: {
  /** Ya filtrados y ordenados por `frentesDelParte`. */
  frentes: Actividad[]
  elegida: string
  soloCurso: boolean
  verCurso: (v: boolean) => void
  elegir: (actividadId: string) => void
  /** Frentes en curso que hoy no reportaron. Es el problema visible sin abrir nada. */
  sinParte: number
}) {
  const [todos, setTodos] = useState(false)
  const lista = todos ? frentes : frentes.slice(0, VISIBLES)

  return (
    <div data-testid="frentes" style={{
      background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px',
        borderBottom: `1px solid ${C.bordeTarjeta}`,
      }}>
        {/* EL TÍTULO NO PUEDE MENTIR: con el filtro en «Todos» la lista ya no son los frentes en
            curso, y dejar el rótulo fijo convertiría una obra terminada en una obra en marcha. */}
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>
          {soloCurso ? 'Frentes en curso' : 'Frentes'}
        </div>
        {sinParte > 0 && (
          <span data-testid="sin-parte" style={{ fontSize: '11.5px', color: C.warn }}>
            {sinParte} sin parte
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filtro activo={soloCurso} onClick={() => verCurso(true)} testid="frentes-curso">En curso</Filtro>
          <Filtro activo={!soloCurso} onClick={() => verCurso(false)} testid="frentes-todo">Todos</Filtro>
        </div>
      </div>

      {frentes.length === 0 ? (
        <p style={{ padding: '24px 16px', fontSize: '12.5px', color: C.tenue }}>
          {soloCurso
            ? 'Ningún frente declarado en curso. Están en «Todos».'
            : 'Esta obra todavía no tiene actividades cargadas. Se crean en Cronograma.'}
        </p>
      ) : lista.map((a) => {
        const acum = acumuladoDeFrente(a)
        const tono = tonoDeBarra(a.avance_pct, acum.registrado)
        return (
          <Hover key={a.id} hover={{ background: C.tenueFondo }} base={{
            borderBottom: `1px solid ${C.bordeLista}`,
            background: a.id === elegida ? C.marcaSuave : 'transparent',
          }}>
            <button
              type="button" onClick={() => elegir(a.id)} data-testid={`cargar-frente-${a.id}`}
              title="Cargar el parte de este frente" aria-label={`Cargar el parte de ${a.nombre}`}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 128px 128px 60px 22px',
                gap: '10px', alignItems: 'center', padding: '9px 16px', width: '100%',
                border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span style={{
                fontSize: '12.5px', color: C.tinta, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{nombreDeFrente(a)}</span>
              {/* NUNCA «0,00 / 96,00»: un frente que todavía no reportó nada no ejecutó cero — es
                  que no hay medición cargada. El canónico escribe «sin registrar», en gris. */}
              <span style={{
                fontFamily: MONO, fontSize: '11.5px', textAlign: 'right',
                color: acum.registrado ? C.tinta : C.tenue,
              }}>{acum.texto}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  flex: 1, height: '5px', background: C.barraCanal, borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <span style={{
                    display: 'block', height: '100%', background: COLOR_BARRA[tono],
                    width: acum.registrado ? `${Math.min(100, Math.max(0, a.avance_pct ?? 0))}%` : '0%',
                  }} />
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: '11.5px', width: '36px', textAlign: 'right',
                  color: COLOR_VALOR[tono],
                }}>{textoDeAvance(a, acum)}</span>
              </span>
              {/* LAS HH DEL FRENTE SON LAS IMPUTADAS (`obra_actividad_hh`), no una estimación: sin
                  imputaciones se escribe «—», que es lo que el zip pone en los frentes sin arrancar. */}
              <span title="HH imputadas al frente" style={{
                fontFamily: MONO, fontSize: '11.5px', color: C.tintaMedia, textAlign: 'right',
              }}>{fmtHH(a.hh_real) ?? '—'}</span>
              <span aria-hidden style={{ display: 'flex', color: C.fantasma, justifyContent: 'center' }}>
                <Ico d={P.mas} s={14} />
              </span>
            </button>
          </Hover>
        )
      })}

      {frentes.length > VISIBLES && (
        <Hover hover={{ background: C.tenueFondo, color: C.tinta }} base={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tintaMedia,
        }}>
          <button
            type="button" onClick={() => setTodos((v) => !v)} data-testid="frentes-ver-mas"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              padding: '10px', width: '100%', fontSize: '12px', color: 'inherit', border: 'none',
              background: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {todos ? 'Ver menos' : `Ver ${frentes.length - VISIBLES} más`}
            <Ico d={P.abajo} s={13} style={{ transform: todos ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>
        </Hover>
      )}
    </div>
  )
}
