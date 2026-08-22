// PANTALLA 24 · COMPRAS — el libro de compras de ARCA, con su control.
//
// ═══ QUÉ DECISIÓN CAMBIA ═══
//
// Tres, y las tres cuestan plata: a qué obra se le carga cada gasto (sin eso el costo real de la
// obra está incompleto y su margen es una ficción), si un comprobante que se parece a otro es el
// mismo gasto pagado dos veces, y si un papel que el OS no pudo clasificar está entrando mal a los
// cuadros de IVA. Hoy nada de eso tenía pantalla: la asignación a obra vivía escondida en
// `/control-obras/costos` y los duplicados no se miraban en ningún lado.
//
// ═══ QUIÉN LA VE, Y POR QUÉ NO LLEVA PORTERO ECONÓMICO ═══
//
// `esAdministracion()` — Dirección, Administración y Jefe de Obra —, igual que el resto de
// `(main)/administracion`. NO lleva `veEconomia()`, y es una decisión, no un olvido: una compra es
// COSTO, no PRECIO. La línea del 19/08 es exactamente ésa, textual del dueño: *«los costos de las
// obras… y lo que se lleva gastado, sí tienen que ver»*. Lo que el jefe de obra no ve es cuánto se
// vendió la obra, y eso no aparece acá.
//
// Y coincide con la base: la policy de `comprobantes_arca` (20260716140000) es
// `for select to authenticated using (true)` con grant de tabla. Poner un portero económico en el
// front mientras PostgREST publica el mismo importe a cualquier sesión sería teatro — la pantalla
// quedaría más angosta que la base y el agujero seguiría abierto sin que nadie lo vea.
//
// ═══ «CARGAR COMPROBANTE» NO SUBE ARCHIVOS, Y ES A PROPÓSITO ═══
//
// El cargador real es el bot @os de Mattermost: se le manda la foto o el PDF y él lee, cruza contra
// ARCA y contra el banco, y carga. Duplicar esa entrada en la web daría dos caminos para el mismo
// hecho —el problema que la regla de realidad única prohíbe— y el de la web sería el peor: sin OCR,
// sin cruce y sin las tres verificaciones que el bot ya hace. El botón explica la vía oficial.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { getObrasCanonicas } from '@/features/control-obras/services/costosObraService'
import { PageShell } from '@/shared/components/ui'
import { Aviso, BuscadorURL, Num } from '@/shared/components/ds'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { EstadosDeControl } from '@/features/administracion/components/EstadosDeControl'
import { TablaCompras } from '@/features/administracion/components/TablaCompras'
import { PanelCompra } from '@/features/administracion/components/PanelCompra'
import { filtroDe, ROTULO_FILTRO, type FiltroCompras } from '@/features/administracion/services/comprasEstado'
import {
  getCompra, getCompras, getConteos, getParecidos, TOPE,
} from '@/features/administracion/services/comprasService'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/compras'

/** La URL de una vista de esta pantalla. Todo el estado vive acá: se comparte y vuelve con «atrás». */
function url({ f, q, c }: { f?: FiltroCompras; q?: string; c?: string }): string {
  const p = new URLSearchParams()
  if (f && f !== 'capturadas') p.set('f', f)
  if (q) p.set('q', q)
  if (c) p.set('c', c)
  const s = p.toString()
  return s ? `${RUTA}?${s}` : RUTA
}

/** La vía oficial de carga, escrita al lado del botón. Sin JavaScript: es un `details` nativo. */
function CargarComprobante() {
  return (
    <details data-testid="cargar-comprobante" className="min-w-0">
      <summary className="cursor-pointer list-none rounded-control border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-quiet">
        Cargar comprobante
      </summary>
      <p className="mt-2 max-w-[420px] text-[11.5px] leading-relaxed text-muted">
        La carga la hace el bot <span className="font-medium text-ink">@os</span> por Mattermost:
        mandale la foto o el PDF del comprobante y él lo lee, lo cruza contra el libro de ARCA y
        contra el extracto del banco, y avisa si ya estaba cargado. Esta pantalla no sube archivos a
        propósito — una segunda puerta sin esos tres cruces cargaría comprobantes que nadie verificó.
      </p>
    </details>
  )
}

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; c?: string }>
}) {
  const sp = await searchParams
  const filtro = filtroDe(sp.f)
  const q = sp.q?.trim() || undefined

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  // LA PUERTA NO ES LA CERRADURA: la RLS de `comprobantes_arca` decide qué filas salen. Este `if`
  // evita mostrarle la pantalla a quien no administra nada.
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <PageShell title="Compras">
        <NavAdministracion />
        <Aviso tono="info">Esta pantalla es de Administración.</Aviso>
      </PageShell>
    )
  }

  const [listado, conteos, obras] = await Promise.all([
    getCompras(supabase, { q, filtro }),
    getConteos(supabase),
    getObrasCanonicas(supabase),
  ])

  if (listado.error || !listado.data || conteos.error || !conteos.data) {
    return (
      <PageShell title="Compras">
        <NavAdministracion />
        <div data-testid="compras-error">
          <Aviso tono="neg" titulo="No pude leer el libro de compras">
            {listado.error ?? conteos.error}
          </Aviso>
        </div>
      </PageShell>
    )
  }

  const { filas, total, truncado } = listado.data
  const abierta = sp.c ? await getCompra(supabase, sp.c) : null
  const parecidos = abierta ? await getParecidos(supabase, abierta.id) : []

  return (
    <PageShell
      title="Compras"
      subtitle="El libro de compras que ARCA le reconoce a la empresa, comprobante por comprobante: a qué obra se imputó, si alguien lo controló y si se parece a otro ya capturado."
    >
      <NavAdministracion />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <BuscadorURL
          accion={RUTA}
          q={sp.q}
          placeholder="Proveedor, CUIT, número u obra"
          oculto={{ f: filtro === 'capturadas' ? undefined : filtro, c: sp.c }}
          testid="buscar-compra"
        />
        <CargarComprobante />
      </div>

      <EstadosDeControl
        conteos={conteos.data}
        activo={filtro}
        hrefDe={(f) => url({ f, q, c: sp.c })}
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className={`min-w-0 flex-1 ${abierta ? '' : 'lg:max-w-[1080px]'}`}>
          <TablaCompras
            filas={filas}
            seleccionado={abierta?.id}
            hrefDe={(id) => url({ f: filtro, q, c: id })}
          />
          <p className="mt-3 max-w-[820px] text-[11px] leading-relaxed text-faint">
            <Num className="text-faint">{filas.length}</Num> comprobante(s) a la vista de{' '}
            <Num className="text-faint">{total}</Num> con este filtro
            {q && <> y la búsqueda «{q}»</>}.{' '}
            {/* UN CONTROL QUE NO PUDO MIRAR TODO NO PUEDE DECIR «NO HAY MÁS». Cuando el tope
                recorta, se dice — seis faltantes falsos ya costaron una investigación entera. */}
            {truncado
              ? `Se muestran los ${TOPE} más recientes: lo que falta no está vacío, está fuera del tope de esta pantalla.`
              : 'No hay ninguno fuera de la lista.'}
            {(q || filtro !== 'capturadas') && (
              <> <Link href={RUTA} data-testid="quitar-filtros" className="underline underline-offset-2">Ver todo</Link>.</>
            )}
            {filtro !== 'capturadas' && ` Filtro activo: ${ROTULO_FILTRO[filtro]}.`}
          </p>
        </div>

        {abierta && (
          <PanelCompra
            compra={abierta}
            parecidos={parecidos}
            obras={obras}
            cerrarHref={url({ f: filtro, q })}
            hrefDe={(id) => url({ f: filtro, q, c: id })}
          />
        )}
      </div>
    </PageShell>
  )
}
