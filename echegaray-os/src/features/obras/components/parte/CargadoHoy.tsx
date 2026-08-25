'use client'

// «CARGADO HOY» — PORTE LITERAL de la tarjeta superior derecha del canónico 05.
//
// Cabecera de `padding:11px 16px` con el título en 13px/600, la cuenta de partes en mono y, al
// borde derecho, HH y PERSONAS de la jornada. Cada fila: el ✓ verde, el nombre del frente, el
// ícono de la nota con su texto en el `title`, lo que movió, y el «···».
//
// ═══ LO QUE EL MOCKUP DIBUJA Y LOS DATOS NO SOSTIENEN ═══
//
// El canónico pone HH y PERSONAS **por fila**. Un parte de `obra_ejecucion` no sabe quién lo hizo:
// las horas viven en `registros_hh`, por persona y por día, sin puntero al parte. Repartirlas entre
// los partes de esa actividad sería una atribución fabricada —y con dos partes del mismo frente en
// el mismo día, cada fila mostraría las horas del otro—. Las dos columnas NO se dibujan vacías: se
// publican una vez, en la cabecera, que es la ventana donde el dato existe de verdad.
//
// Tampoco está el ícono de evidencia del mockup: la foto no cuelga del parte sino de la ACTIVIDAD
// —el OS guarda el vínculo de Drive, no una copia—, así que la fila no sabe si este parte trajo
// una. Un ícono prendido por la evidencia de otro día sería una afirmación falsa sobre éste.

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, ParteEjecucion } from '../../types'
import type { JornadaHH } from '../../services/ejecucionService'
import { nombreDeFrente, resumenDelParte } from '../../services/parteDiario.ts'
import { fecha as fmtFecha } from '../formato'
import { C, MONO } from '../canon/tokens'
import { Ico, IcoMas, P } from '../canon/Ico'
import { Hover } from '../canon/Piezas'

const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** Una cifra de la cabecera. `null` NO es cero: es que nadie lo pudo mirar. */
function Cifra({ rotulo, valor, testid }: { rotulo: string; valor: string | null; testid: string }) {
  return (
    <div data-testid={testid}>
      <span style={{ fontSize: '11px', color: C.tenue }}>{rotulo} </span>
      {valor == null
        ? <span style={{ fontSize: '11.5px', color: C.tenue, fontStyle: 'italic' }}>sin registrar</span>
        : <span style={{ fontFamily: MONO, fontSize: '12.5px', fontWeight: 600, color: C.tinta }}>{valor}</span>}
    </div>
  )
}

/**
 * EL «···» DE LA FILA — «más acciones» del zip, con la única que hay hoy: borrar.
 *
 * Borrar corrige un error de carga; no cierra una actividad. Vive detrás del menú y no suelto en la
 * fila porque esta lista se abre para LEER, y lo más llamativo de una lista de lectura no puede ser
 * la acción destructiva. El error del servidor se muestra: un borrado que no borró no puede
 * desaparecer de la fila igual que uno que sí.
 */
function MasAcciones({ parteId, borrar }: {
  parteId: string
  borrar: (parteId: string) => Promise<ResultadoAccion>
}) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, empezar] = useTransition()
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  return (
    <div ref={caja} className="relative" style={{ display: 'flex', justifyContent: 'center' }}>
      <button
        type="button" title="Más acciones" aria-label="Más acciones" aria-expanded={abierto}
        data-testid="parte-acciones" onClick={() => setAbierto((v) => !v)}
        style={{ display: 'flex', color: C.fantasma, cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
      ><IcoMas s={15} /></button>
      {abierto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-card border border-line bg-surface py-1 shadow-pop">
          <button
            type="button" disabled={enviando} data-testid="borrar-parte"
            onClick={() => empezar(async () => {
              const r = await borrar(parteId)
              if (r.ok) setAbierto(false)
              else setError(r.error)
            })}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
              fontSize: '13px', color: C.neg, border: 'none', background: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{enviando ? 'Borrando…' : 'Borrar el parte'}</button>
          {error && <p style={{ padding: '0 14px 6px', fontSize: '11px', color: C.neg }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

export function CargadoHoy({ dia, esHoy, delDia, porActividad, jornada, borrarParte }: {
  dia: string
  esHoy: boolean
  delDia: ParteEjecucion[]
  porActividad: Map<string, Actividad>
  /** `null` = la página no pasó `registros_hh`: no se sabe, y no es cero. */
  jornada: JornadaHH | null
  borrarParte: (parteId: string) => Promise<ResultadoAccion>
}) {
  return (
    <div data-testid="cargado-hoy" style={{
      background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px',
        borderBottom: `1px solid ${C.bordeTarjeta}`,
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>
          {esHoy ? 'Cargado hoy' : `Cargado el ${fmtFecha(dia)}`}
        </div>
        <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tintaSuave }}>
          {delDia.length} {delDia.length === 1 ? 'parte' : 'partes'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '18px' }}>
          <Cifra rotulo="HH" valor={jornada && num(jornada.hh)} testid="jornada-hh" />
          <Cifra rotulo="PERSONAS" valor={jornada && String(jornada.personas)} testid="jornada-personas" />
        </div>
      </div>

      {delDia.length === 0 ? (
        <p style={{ padding: '24px 16px', fontSize: '12.5px', color: C.tenue }}>
          {esHoy ? 'Todavía no se cargó nada de hoy.' : 'No se cargó nada en esa jornada.'}
        </p>
      ) : delDia.map((p) => {
        const a = porActividad.get(p.actividad_id)
        return (
          <Hover key={p.id} hover={{ background: C.tenueFondo }} base={{
            display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 116px 26px', gap: '10px',
            alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${C.bordeLista}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ display: 'flex', color: C.pos, flexShrink: 0 }}><Ico d={P.ok} s={14} w={2.4} /></span>
              <span style={{
                fontSize: '12.5px', color: C.tinta, minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{a ? nombreDeFrente(a) : 'actividad archivada'}</span>
              {p.comentario && (
                <span title={p.comentario} style={{ display: 'flex', color: C.apagado, flexShrink: 0 }}>
                  <Ico d={P.nota} s={13} />
                </span>
              )}
            </div>
            <span style={{
              fontFamily: MONO, fontSize: '12.5px', color: C.tinta, textAlign: 'right',
            }} data-testid="fila-parte-cantidad">{resumenDelParte(p, a)}</span>
            <MasAcciones parteId={p.id} borrar={borrarParte} />
          </Hover>
        )
      })}
    </div>
  )
}
