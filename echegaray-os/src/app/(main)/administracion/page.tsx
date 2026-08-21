// ADMINISTRACIÓN — LA ENTRADA DEL ÁREA. NO ES UN MENÚ DE TARJETAS.
//
// `design/screens/administracion.md` §2a, textual: *"No es un menú de tarjetas ni repite la barra:
// dos columnas."* Las dos columnas contestan dos preguntas distintas —a dónde voy y qué falta— y
// mezclarlas en cinco tarjetas iguales obliga a leer las cinco para descubrir que sólo una pide
// trabajo.
//
// El buscador de arriba a la derecha es global a propósito: quien lo usa tiene un nombre en la mano
// y quiere la ficha, no la sección. Ver `services/entradaService.ts`.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { puedeVerRuta } from '@/features/auth/types/areas'
import { PageShell } from '@/shared/components/ui'
import { BuscadorURL, Eyebrow, Num, Nulo, Vacio } from '@/shared/components/ds'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import {
  atencionesDe, buscarGlobal, cuandoCorto, getConteos, getUltimoMovimiento, maestrosDe,
  type Atencion, type Hallazgo, type Maestro,
} from '@/features/administracion/services/entradaService'

export const dynamic = 'force-dynamic'

/** Una fila de maestro: nombre + contador tenue · detalle · señal a la derecha. Hairline abajo. */
function FilaMaestro({ m }: { m: Maestro }) {
  return (
    <Link
      href={m.href}
      data-testid={`ir-${m.clave}`}
      className="group flex items-baseline gap-3 border-b border-[#EFEEEA] py-[15px] last:border-0 hover:bg-surface-quiet"
    >
      {/* A 390px la fila entera son 358px útiles: con el nombre clavado en 250 y la señal de
          estado sin poder encoger, la PÁGINA se corría 2px de costado. El nombre cede
          primero porque es el único de los tres que se puede leer truncado. */}
      <span className="flex w-[150px] shrink-0 items-baseline gap-2.5 sm:w-[250px]">
        <span className="text-[14px] font-medium text-ink group-hover:underline">{m.titulo}</span>
        {/* SIN LECTURA NO HAY CONTADOR — NUNCA UN CERO. Un «0» acá afirmaría que no hay ninguno, y
            lo que pasó fue que la consulta falló. */}
        {m.cuenta !== null && <Num className="text-faint">{m.cuenta}</Num>}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{m.detalle}</span>
      {m.senal && (
        <span
          data-testid={`senal-${m.clave}`}
          className={`shrink-0 whitespace-nowrap text-[11.5px] ${m.resolver ? 'text-warn' : 'text-faint'}`}
        >
          {m.senal}
        </span>
      )}
      <span aria-hidden className="pl-3 text-[13px] text-[#D7D5CF]">›</span>
    </Link>
  )
}

/** Una línea accionable. Rojo SÓLO si es crítico; lo demás es un dato que falta, y eso es ámbar. */
function FilaAtencion({ a }: { a: Atencion }) {
  return (
    <Link
      href={a.href}
      data-testid={`atencion-${a.clave}`}
      className="flex items-baseline gap-2.5 border-b border-[#EFEEEA] py-[13px] last:border-0 hover:bg-surface-quiet"
    >
      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${a.critico ? 'bg-neg' : 'bg-warn'}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{a.texto}</span>
        <span className="mt-0.5 block text-[11.5px] text-faint">{a.donde}</span>
      </span>
      <span className={`shrink-0 font-mono text-[15px] font-semibold tabular-nums ${a.critico ? 'text-neg' : 'text-ink'}`}>
        {a.numero}
      </span>
    </Link>
  )
}

function Resultados({ q, hallazgos }: { q: string; hallazgos: Hallazgo[] }) {
  return (
    <section className="mb-8" data-testid="resultados-busqueda">
      <Eyebrow className="mb-1">Resultados de «{q}»</Eyebrow>
      {hallazgos.length === 0 ? (
        <Vacio>Ningún cliente, persona ni proveedor coincide con «{q}».</Vacio>
      ) : (
        <ul>
          {hallazgos.map((h) => (
            <li key={h.clave} className="border-b border-[#EFEEEA] last:border-0">
              <Link href={h.href} data-testid="hallazgo" className="flex items-baseline gap-3 py-2.5 hover:bg-surface-quiet">
                <span className="w-[92px] shrink-0 text-[10px] uppercase tracking-[0.06em] text-faint">{h.maestro}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{h.nombre}</span>
                {h.detalle && <span className="shrink-0 text-[11.5px] text-faint">{h.detalle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function AdministracionPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const [conteos, movimiento, hallazgos, perfil] = await Promise.all([
    getConteos(supabase),
    getUltimoMovimiento(supabase),
    buscarGlobal(supabase, sp.q),
    getPerfilActual(supabase),
  ])

  // La pantalla no ofrece lo que la puerta va a negar: la tarjeta «Usuarios» le aparecía al jefe
  // de obra y el clic moría en un redirect mudo a /obras (QA del 21/08). Mismo criterio que la
  // barra (4a8e79f1) y que /presupuestos: un botón que lleva a «no hay nada» no se dibuja.
  const maestros = maestrosDe(conteos).filter((m) => puedeVerRuta(perfil.data?.rol ?? null, m.href))
  const atenciones = atencionesDe(conteos)

  return (
    <PageShell
      title="Administración"
      subtitle="Los maestros del sistema y lo que quedó sin resolver."
      right={
        <BuscadorURL
          accion="/administracion"
          q={sp.q}
          placeholder="Buscar cliente, persona o proveedor"
          ancho="w-full sm:w-[300px]"
          testid="buscador-global"
        />
      }
    >
      <NavAdministracion />

      {sp.q && <Resultados q={sp.q} hallazgos={hallazgos} />}

      <div className="flex flex-col gap-x-14 gap-y-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-1">Maestros</Eyebrow>
          <nav data-testid="admin-maestros">
            {maestros.map((m) => <FilaMaestro key={m.clave} m={m} />)}
          </nav>
          <p className="mt-5 max-w-[760px] text-[11.5px] leading-relaxed text-faint">
            Los contadores son de navegación: dicen cuánto hay del otro lado. Sin lectura no hay
            contador — nunca un cero.
          </p>
        </div>

        <div className="w-full shrink-0 lg:w-[340px]">
          <Eyebrow className="mb-1">Requiere atención</Eyebrow>
          <div data-testid="admin-atencion">
            {atenciones.length === 0
              ? <Vacio>No queda nada sin resolver en los maestros del área.</Vacio>
              : atenciones.map((a) => <FilaAtencion key={a.clave} a={a} />)}
          </div>

          <Eyebrow className="mb-1 mt-[18px]">Último movimiento</Eyebrow>
          <p className="py-3 text-[12.5px] leading-relaxed text-muted" data-testid="ultimo-movimiento">
            {movimiento
              ? <>{movimiento.texto} · <Num className="text-muted">{cuandoCorto(movimiento.cuando)}</Num></>
              : <Nulo>sin movimientos registrados</Nulo>}
          </p>
        </div>
      </div>
    </PageShell>
  )
}
