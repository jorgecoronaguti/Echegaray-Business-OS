'use client'

// QUIÉN TRABAJÓ Y CUÁNTAS HORAS — la lista que abre el chip «personas» del canónico 05.
//
// Medidas del mockup: caja de `maxHeight:236px` con `borderRadius:8px`, filas de `padding:7px 10px`
// separadas por `#F5F4F0`, casilla de 15 px que al marcarse se llena de amarillo sobre fondo
// `#FEFCF2`, y las horas al borde derecho en mono de 11 px.
//
// ═══ LAS HORAS SON LAS MISMAS DE PERSONAL ═══
//
// Cada persona marcada viaja como `horas_<uuid>`, el MISMO contrato que la carga masiva de la
// pestaña Personal, y las escribe la misma acción sobre `registros_hh` — de donde sale la
// liquidación. La misma hora se carga una sola vez.
//
// EL CAMPO «HH» DEL FORMULARIO ES LA JORNADA DE CADA UNO, no un total a repartir: repartir un total
// entre N personas inventa cuánto trabajó cada una. Se propone para todos los marcados y se corrige
// en el casillero del que hizo media jornada, que es la excepción real de una cuadrilla.
//
// Y NO HAY 8 POR DEFECTO. El mockup escribe «8,0» en cada fila marcada cuando el campo está vacío;
// acá eso serían ocho horas de trabajo inventadas para una persona, en la tabla de la que sale su
// sueldo. Vacío queda vacío, y `leerReparto` no imputa a quien no tiene horas.

import type { Persona } from '../../types'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'

export function ListaDeGente({
  personas, cuadrillas, integrantes, cuadrilla, elegirCuadrilla, marcadas, marcar, horasDe, ponerHoras,
}: {
  personas: Persona[]
  cuadrillas: { id: string; nombre: string }[]
  integrantes: Record<string, string[]>
  cuadrilla: string
  elegirCuadrilla: (id: string) => void
  marcadas: ReadonlySet<string>
  marcar: (personaId: string) => void
  horasDe: (personaId: string) => string
  ponerHoras: (personaId: string, valor: string) => void
}) {
  // SIN PLANTEL NO SE DIBUJA UNA GRILLA VACÍA: cero casilleros se lee como «no trabajó nadie», y
  // lo cierto es que esta obra no tiene personas asignadas.
  if (personas.length === 0) {
    return (
      <p data-testid="parte-sin-plantel" style={{
        marginTop: '11px', border: `1px solid ${C.borde}`, borderRadius: '8px',
        padding: '9px 10px', fontSize: '12px', color: C.tenue,
      }}>Sin personas asignadas a esta obra. Se asignan en Personal.</p>
    )
  }

  // Elegir una cuadrilla recorta la lista a los suyos. Sin cuadrilla, el plantel entero: no toda
  // obra las tiene armadas, y exigirlas para poder cargar horas sería fricción por nada.
  const delPlantel = cuadrilla
    ? personas.filter((p) => (integrantes[cuadrilla] ?? []).includes(p.id))
    : personas

  return (
    <>
      {cuadrillas.length > 0 && (
        <select
          value={cuadrilla} onChange={(e) => elegirCuadrilla(e.target.value)}
          aria-label="Cuadrilla" data-testid="parte-cuadrilla"
          style={{
            marginTop: '11px', border: `1px solid ${C.borde}`, borderRadius: '8px',
            padding: '6px 8px', width: '100%', fontSize: '12px', color: C.tinta,
            background: C.superficie, fontFamily: 'inherit',
          }}
        >
          <option value="">Todo el plantel · {personas.length} personas</option>
          {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
      <div style={{
        marginTop: '11px', border: `1px solid ${C.borde}`, borderRadius: '8px',
        maxHeight: '236px', overflowY: 'auto',
      }}>
        {delPlantel.map((p) => {
          const on = marcadas.has(p.id)
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 10px',
              borderBottom: `1px solid ${C.bordeLista}`, background: on ? '#FEFCF2' : 'transparent',
            }}>
              {/* LA CASILLA ES UN `checkbox` DE VERDAD, escondido debajo del cuadrito del zip: la
                  fila del mockup es un `div` con `onClick`, y así no se puede marcar con el
                  teclado ni un lector de pantalla sabe qué es. Se ve igual. */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1,
                cursor: 'pointer', position: 'relative',
              }}>
                <input
                  type="checkbox" checked={on} onChange={() => marcar(p.id)}
                  data-testid={`marcar-${p.id}`}
                  style={{ position: 'absolute', width: '15px', height: '15px', margin: 0, opacity: 0, cursor: 'pointer' }}
                />
                <span aria-hidden style={{
                  width: '15px', height: '15px', borderRadius: '4px',
                  border: `1px solid ${on ? C.marca : C.bordeFuerte}`,
                  background: on ? C.marca : 'transparent', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, color: C.tinta,
                }}>{on && <Ico d={P.ok} s={10} w={3} />}</span>
                <span style={{
                  fontSize: '12px', color: C.tinta, minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.nombre_completo}</span>
              </label>
              {on && (
                <input
                  name={`horas_${p.id}`} type="text" inputMode="decimal" value={horasDe(p.id)}
                  onChange={(e) => ponerHoras(p.id, e.target.value)} data-testid={`horas-${p.id}`}
                  aria-label={`Horas de ${p.nombre_completo}`}
                  style={{
                    marginLeft: 'auto', width: '48px', flexShrink: 0, textAlign: 'right',
                    border: 'none', background: 'transparent', fontFamily: MONO, fontSize: '11px',
                    color: C.tintaSuave, padding: 0, outline: 'none',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
