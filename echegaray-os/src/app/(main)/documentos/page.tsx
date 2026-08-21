// 27 · DOCUMENTOS — el archivo de la empresa entero, en una tabla.
//
// ═══ QUÉ CONTESTA ═══
//
// «¿Dónde está ese papel?» Hoy la respuesta vive en tres lugares distintos: la carpeta de Drive, el
// legajo de una persona y la ficha de un cliente. Esta pantalla es la única que los mira juntos.
//
// ═══ LA FUENTE, MEDIDA ANTES DE DISEÑAR ═══
//
// `obra_documento` 0 filas · `documento_presentacion` 0 · `drive_documento_estado` 0 ·
// `drive_index` 3.593 (3.123 archivos) · `documentacion_legajo` 847 · `cliente_documento` 214
// (21/08/2026). O sea: el catálogo es `drive_index` y las otras dos son VÍNCULOS. Por eso el
// archivo es la fila y el vínculo es una columna.
//
// ═══ POR QUÉ ESTA RUTA ES SÓLO DE DIRECCIÓN Y ADMINISTRACIÓN ═══
//
// Las tres carpetas raíz del índice son `administracion`, `archivo-fiscal` y `libro-sueldos`: el
// listado incluye presupuestos de clientes, declaraciones y libros de sueldos. `/documentos` entra
// en `RUTAS_SOLO_ECONOMIA` por eso.
//
// Y ESO NO CIERRA EL AGUJERO, sólo la puerta: la policy de `drive_index` es `using (true)` para
// todo `authenticated`, así que cualquier usuario con sesión puede pedirle a PostgREST la lista
// completa de nombres y rutas sin pasar por ninguna pantalla. Queda declarado acá porque una
// limitación que no está escrita al lado del código es una limitación que nadie va a encontrar.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCarpetasRaiz, getDocumento, getDocumentos, TOPE } from '@/features/documentos/services/documentosService'
import { TablaDocumentos } from '@/features/documentos/components/TablaDocumentos'
import { PanelDocumento } from '@/features/documentos/components/PanelDocumento'
import { FiltrosURL } from '@/features/administracion/components/Controles'
import { Aviso, BuscadorURL } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

/** Los tipos que el indexador escribe en `drive_index.tipo`. Son los suyos, no una taxonomía nueva. */
const TIPOS = [
  { valor: 'pdf', etiqueta: 'PDF' },
  { valor: 'planilla', etiqueta: 'Planillas' },
  { valor: 'documento', etiqueta: 'Documentos' },
  { valor: 'imagen', etiqueta: 'Imágenes' },
] as const

type Query = { q?: string; carpeta?: string; tipo?: string; d?: string }

function armarHref(base: Query, cambios: Partial<Query> = {}): string {
  const v = { ...base, ...cambios }
  const p = new URLSearchParams()
  if (v.q) p.set('q', v.q)
  if (v.carpeta) p.set('carpeta', v.carpeta)
  if (v.tipo) p.set('tipo', v.tipo)
  if (v.d) p.set('d', v.d)
  const qs = p.toString()
  return `/documentos${qs ? `?${qs}` : ''}`
}

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const supabase = await createClient()

  const [catalogo, carpetas] = await Promise.all([
    getDocumentos(supabase, { q: sp.q, carpeta: sp.carpeta, tipo: sp.tipo }),
    getCarpetasRaiz(supabase),
  ])
  if (catalogo.error) return <EstadoError mensaje={catalogo.error} que="el archivo de documentos" />

  const documentos = catalogo.data?.documentos ?? []
  const total = catalogo.data?.total ?? 0
  // NO SE PUDO ABRIR ≠ NO EXISTE, otra vez: el panel dice su propio error y la tabla sigue viva.
  const abierto = sp.d ? await getDocumento(supabase, sp.d) : null
  // El día se calcula UNA vez y se pasa hacia abajo: si cada fila llamara a `new Date()`, dos filas
  // renderizadas a ambos lados de la medianoche darían vigencias distintas en la misma pantalla.
  const hoy = new Date().toISOString().slice(0, 10)
  const filtrando = Boolean(sp.q || sp.carpeta || sp.tipo)

  return (
    <PageShell
      title="Documentos"
      subtitle="Todo el archivo indexado de Drive. Los archivos no se copian: se abren donde viven."
    >
      {carpetas.error && (
        <div className="mb-4">
          <Aviso tono="warn" titulo="No pude leer las carpetas del índice">{carpetas.error}</Aviso>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <BuscadorURL
          accion="/documentos"
          q={sp.q}
          placeholder="Buscar por nombre o carpeta"
          oculto={{ carpeta: sp.carpeta, tipo: sp.tipo }}
          testid="buscar-documento"
        />
        <FiltrosURL
          testid="filtro-carpeta"
          opciones={[
            { label: 'Todo', href: armarHref(sp, { carpeta: undefined, d: undefined }), activo: !sp.carpeta, testid: 'filtro-carpeta-todo' },
            ...(carpetas.data ?? []).map((c) => ({
              label: c.name,
              href: armarHref(sp, { carpeta: c.path, d: undefined }),
              activo: sp.carpeta === c.path,
              testid: `filtro-carpeta-${c.path}`,
            })),
          ]}
        />
        <FiltrosURL
          testid="filtro-tipo"
          opciones={[
            { label: 'Todos', href: armarHref(sp, { tipo: undefined, d: undefined }), activo: !sp.tipo, testid: 'filtro-tipo-todos' },
            ...TIPOS.map((t) => ({
              label: t.etiqueta,
              href: armarHref(sp, { tipo: t.valor, d: undefined }),
              activo: sp.tipo === t.valor,
              testid: `filtro-tipo-${t.valor}`,
            })),
          ]}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <TablaDocumentos
            documentos={documentos}
            seleccionado={sp.d}
            hrefDe={(id) => armarHref(sp, { d: id })}
            hoy={hoy}
            vacio={
              filtrando ? (
                <>
                  Nada coincide con lo buscado.{' '}
                  <Link href="/documentos" className="text-ink underline" data-testid="ver-todo">Ver todo</Link>
                </>
              ) : (
                'El índice de Drive está vacío. Lo llena scripts/indexar-drive.mjs cada 6 horas.'
              )
            }
          />
          <p className="mt-3 text-[11px] leading-relaxed text-faint" data-testid="pie-documentos">
            {documentos.length < total
              ? `Se listan ${documentos.length} de ${total.toLocaleString('es-AR')} documentos, los modificados más recientemente. Lo que falta no está vacío: está fuera del tope de ${TOPE} filas de esta pantalla.`
              : `${total.toLocaleString('es-AR')} ${total === 1 ? 'documento' : 'documentos'}.`}{' '}
            Ninguno tiene vencimiento cargado todavía, así que esta pantalla no puede avisar de un
            papel vencido: la columna aparece cuando exista el primero.
          </p>
        </div>

        {sp.d && (
          abierto?.error ? (
            <div className="w-full lg:w-[360px]">
              <Aviso tono="neg" titulo="No pude abrir ese documento">{abierto.error}</Aviso>
            </div>
          ) : abierto?.data ? (
            <PanelDocumento documento={abierto.data} cerrarHref={armarHref(sp, { d: undefined })} />
          ) : (
            <div className="w-full lg:w-[360px]">
              <Aviso tono="warn" titulo="Ese documento no está en el índice">
                Puede haberse borrado de Drive, o todavía no lo alcanzó la indexación.
              </Aviso>
            </div>
          )
        )}
      </div>
    </PageShell>
  )
}
