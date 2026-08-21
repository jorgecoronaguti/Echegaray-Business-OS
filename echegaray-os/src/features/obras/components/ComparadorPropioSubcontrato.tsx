// PROPIO VS SUBCONTRATO — la comparación que se mira ANTES de firmar.
//
// El número del lado del subcontrato es el COSTO REAL (contratado + lo que Echegaray le pone), no
// el precio de la orden. Es la advertencia que la migración 2500 dejó escrita: comparar contra el
// precio contratado sale a favor del subcontrato por construcción, porque los materiales, el
// andamio, la ayuda de gremio y la comida los paga la obra igual, por otra ventanilla.
//
// LO QUE NO SE PUEDE COMPARAR SE DICE, NO SE COMPLETA. El costo de hacerlo con gente propia
// necesita el análisis de costo de la actividad, que hoy no existe en el modelo: la celda queda
// vacía con su motivo. Un costo propio estimado convertiría esta tabla en una recomendación con
// números inventados — y la recomendación se leería igual de convincente.

import { Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
import { hh as fmtHH, plata } from './formato'
import type { Celda, FilaComparacion, FormatoCelda } from '../services/subcontratosReglas'

const numero = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

function texto(c: Celda, formato: FormatoCelda, unidad: string | null): string | null {
  if (c.texto) return c.texto
  if (c.valor == null) return null
  switch (formato) {
    case 'plata': return plata(c.valor)
    case 'hh': return fmtHH(c.valor)
    case 'dias': return `${numero(c.valor)} d`
    case 'personas': return `${numero(c.valor)}`
    default: return unidad ? `${numero(c.valor)} ${unidad}` : numero(c.valor)
  }
}

/** La diferencia lleva signo explícito: un «7» sin signo no dice si el subcontrato tarda más o menos. */
function diferencia(f: FilaComparacion): { texto: string | null; mejor: boolean } {
  const v = f.diferencia.valor
  if (f.diferencia.texto) return { texto: f.diferencia.texto, mejor: false }
  if (v == null) return { texto: null, mejor: false }
  const signo = v > 0 ? '+' : v < 0 ? '−' : ''
  const cuerpo = texto({ valor: Math.abs(v), texto: null }, f.formato, f.unidad ?? null)
  // Menos HH propias y menos días son a favor del subcontrato; más plata, en contra.
  const mejor = f.formato === 'plata' ? v < 0 : v < 0
  return { texto: `${signo}${cuerpo}`, mejor }
}

export function ComparadorPropioSubcontrato({
  filas, titulo, subtitulo,
}: {
  filas: FilaComparacion[]
  titulo: string
  subtitulo: string
}) {
  const faltantes = [...new Set(filas.map((f) => f.falta).filter((x): x is string => !!x))]
  return (
    <section className="rounded-card border border-line bg-surface p-4" data-testid="comparador-propio-subcontrato">
      <h2 className="text-[13px] font-semibold text-ink">{titulo}</h2>
      <p className="mb-3 text-[11.5px] text-muted">{subtitulo}</p>
      <Tabla minWidth={420}>
        <THead>
          <tr>
            <Th />
            <Th num>Propio</Th>
            <Th num>Subcontrato</Th>
            <Th num>Diferencia</Th>
          </tr>
        </THead>
        <tbody>
          {filas.map((f) => {
            const dif = diferencia(f)
            return (
              <Tr key={f.clave} compacta data-testid={`comparacion-${f.clave}`}>
                <Td fuerte={f.fuerte}>{f.clave}</Td>
                <Td num>{texto(f.propio, f.formato, f.unidad) ?? <span className="text-faint">—</span>}</Td>
                <Td num>{texto(f.subcontrato, f.formato, f.unidad) ?? <span className="text-faint">—</span>}</Td>
                <Td num className={dif.texto ? (dif.mejor ? 'text-pos' : 'text-warn') : ''}>
                  {dif.texto ?? <span className="text-faint">—</span>}
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Tabla>
      {faltantes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {faltantes.map((f) => (
            <li key={f} className="text-[11.5px] leading-relaxed text-muted">· {f}</li>
          ))}
        </ul>
      )}
      {/* NO ES UN `Aviso`: no hay ningún problema. Un bloque de color permanente que explica algo
          entrena a la gente a no leer los bloques de color, y entonces el día que uno diga algo
          grave tampoco se lee (`Aviso.tsx`). */}
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted" data-testid="nota-costo-real">
        El lado del subcontrato es el <strong className="font-medium text-ink-soft">costo real</strong>:
        contratado más los aportes de Echegaray. Comparar contra el precio del contrato solo daría
        siempre a favor del subcontrato — lo que le ponemos lo paga la obra igual, por otra ventanilla.
      </p>
    </section>
  )
}
