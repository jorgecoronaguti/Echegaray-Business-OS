// LA SECCIÓN «CARGAS SOCIALES» Y LA FILA DE CIFRAS DE LA PANTALLA DE IMPUESTOS. Server Components.
// Qué fila entra lo decide `services/impuestosCargas.ts` —la misma regla que escribe el bloque de la
// pestaña «Impuestos y Financieros»—; acá sólo se dibuja.
//
// «ESTIMADO» Y «SUPUESTO» SE DICEN BAJITO. El F931 del mes en curso es un cálculo y la fecha de los
// vencimientos de la seguridad social no está verificada: se marca en gris al lado del número, no con
// un color de alarma, porque no es un problema — es el grado de certeza del dato.
import type { ReactNode } from 'react'
import { Nulo, Num, Tabla, Td, THead, Tr, Vacio } from '@/shared/components/ds'
import { plata } from '@/shared/utils/format'
import { ddmm, rotuloPeriodo, type PosicionImpuesto } from '../../services/impuestos'
import type { cargasSociales, PlanDePago } from '../../services/impuestosCargas'
import { Bloque, EstadoTexto, estadoDe, nombreObligacion, Th } from './TablasImpuestos'

type Cargas = ReturnType<typeof cargasSociales>

const Marca = ({ children }: { children: ReactNode }) => <span className="ml-1 text-[11px] text-faint">{children}</span>

const Vence = ({ fecha, confianza }: { fecha: string | null; confianza: PosicionImpuesto['vencimiento_confianza'] }) => (
  <>
    <Num>{ddmm(fecha)}</Num>
    {confianza === 'supuesto' && <Marca>supuesto</Marca>}
  </>
)

const pesos = (n: number | null, falta = 'sin dato') => (n === null ? <Nulo>{falta}</Nulo> : plata(n))

export interface Cifra { etiqueta: string; valor: string; contexto?: string; tono?: 'neg' | 'warn' }

/**
 * LA FILA DE CIFRAS: lo que se decide arriba —cuánto hay que pagar en 30 días y cuánto de eso es
 * cargas sociales—, el resto abajo, chico y gris. Reemplaza a la `Franja` (una tarjeta con cuatro
 * celdas del mismo peso). Conserva el testid y un `data-metrica` por cifra.
 */
export function Cifras({ principales, desglose, testid }: { principales: Cifra[]; desglose: Cifra[]; testid: string }) {
  const tono = { neg: 'text-neg', warn: 'text-warn' } as const
  return (
    <div data-testid={testid} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
        {principales.map((c) => (
          <div key={c.etiqueta} data-metrica={c.etiqueta} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[12px] text-muted">{c.etiqueta}</span>
            <span className={`font-mono text-[20px] font-semibold tabular-nums ${c.tono ? tono[c.tono] : 'text-ink'}`}>{c.valor}</span>
            {c.contexto && <span className="text-[12px] text-faint">{c.contexto}</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] text-faint">
        {desglose.map((c) => (
          <span key={c.etiqueta} data-metrica={c.etiqueta}>
            {c.etiqueta} <span className="font-mono tabular-nums text-muted">{c.valor}</span>{c.contexto ? ` · ${c.contexto}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function TablaF931({ filas }: { filas: PosicionImpuesto[] }) {
  if (!filas.length) return <Vacio>El sincronizador todavía no escribió ningún F931.</Vacio>
  return (
    <Tabla testid="cargas-f931" minWidth={640}>
      <THead>
        <Th>Período</Th><Th num>Determinado</Th><Th num>Pagado</Th><Th num>Pendiente</Th><Th>Vence</Th><Th>Estado</Th>
      </THead>
      <tbody>
        {filas.map((f) => {
          const e = estadoDe(f)
          return (
            <Tr key={`${f.periodo}-${f.concepto}`} compacta data-periodo={f.periodo}>
              <Td><Num>{rotuloPeriodo(f.periodo)}</Num>{f.concepto !== 'ddjj' && <Marca>{f.concepto}</Marca>}</Td>
              <Td num>{pesos(f.determinado)}</Td>
              <Td num>{f.pagado ? plata(f.pagado) : <Nulo>—</Nulo>}</Td>
              <Td num>{f.pendiente === 0 ? <Nulo>—</Nulo> : pesos(f.pendiente, 'sin importe')}</Td>
              <Td><Vence fecha={f.vencimiento} confianza={f.vencimiento_confianza} /></Td>
              <Td><EstadoTexto tono={e.tono} clave={f.estado}>{e.texto}</EstadoTexto></Td>
            </Tr>
          )
        })}
      </tbody>
    </Tabla>
  )
}

function TablaPlanes({ planes }: { planes: PlanDePago[] }) {
  if (!planes.length) return <Vacio>No hay planes de pago de F931 registrados.</Vacio>
  return (
    <Tabla testid="cargas-planes" minWidth={560}>
      <THead>
        <Th>Plan · cuota</Th><Th num>Importe</Th><Th>Vence</Th><Th>Estado</Th>
      </THead>
      <tbody>
        {planes.map((p) => [
          <Tr key={p.nombre} compacta data-plan={p.nombre}>
            <Td fuerte>{p.nombre}</Td>
            <Td num>{p.saldo > 0 ? plata(p.saldo) : <Nulo>—</Nulo>}</Td>
            <Td><span className="text-[12px] text-faint">{p.pagadas}/{p.cuotas.length} pagadas</span></Td>
            <Td>{p.saldo > 0 || p.sinImporte > 0 ? <span className="text-[12px] text-muted">saldo</span> : <span className="text-[12px] text-faint">cancelado</span>}</Td>
          </Tr>,
          ...p.cuotas.map((q) => (
            <Tr key={`${p.nombre}-${q.n}`} compacta data-cuota={`${q.n}/${q.de}`}>
              <Td><span className="pl-3 text-muted">cuota {q.n}/{q.de}</span></Td>
              <Td num>{pesos(q.importe)}</Td>
              <Td><Vence fecha={q.vencimiento} confianza={q.confianza} /></Td>
              <Td>
                <EstadoTexto tono={q.pagada ? 'pos' : 'warn'} clave={q.pagada ? 'pagada' : 'pendiente'}>{q.pagada ? 'pagada' : 'pendiente'}</EstadoTexto>
                {!q.pagada && q.estado === 'estimado' && <Marca>estimado</Marca>}
              </Td>
            </Tr>
          )),
        ])}
      </tbody>
    </Tabla>
  )
}

/** La sección entera: a pagar en 30 días, el F931 por período y los planes con sus cuotas. */
export function SeccionCargasSociales({ c }: { c: Cargas }) {
  return (
    <Bloque testid="bloque-cargas-sociales" titulo="Cargas sociales" cuenta={`a pagar en 30 días ${plata(c.proximos.total)} · pendiente total ${plata(c.pendienteTotal)}`}>
      {c.proximos.lista.length ? (
        <ul data-testid="cargas-proximos" className="mb-4 flex flex-col gap-1 text-[13px]">
          {c.proximos.lista.map((f) => (
            <li key={`${f.periodo}-${f.concepto}`} className="flex flex-wrap items-baseline gap-x-3">
              <span className="w-14 text-muted"><Num>{ddmm(f.vencimiento)}</Num></span>
              <span className="min-w-[220px] text-ink">{nombreObligacion(f)}</span>
              <span className="font-mono tabular-nums text-ink">{pesos(f.pendiente, 'sin importe')}</span>
              {f.estado === 'estimado' && <Marca>estimado</Marca>}
              {f.vencimiento_confianza === 'supuesto' && <Marca>vence supuesto</Marca>}
              {f.dias < 0 && <span className="text-[12px] text-neg">vencido</span>}
            </li>
          ))}
        </ul>
      ) : <Vacio>Nada de cargas sociales con vencimiento en los próximos 30 días.</Vacio>}
      <h3 className="mb-1 mt-4 text-[12px] font-medium text-muted">F931 por período</h3>
      <TablaF931 filas={c.periodos} />
      <h3 className="mb-1 mt-4 text-[12px] font-medium text-muted">Planes de pago</h3>
      <TablaPlanes planes={c.planes} />
    </Bloque>
  )
}
