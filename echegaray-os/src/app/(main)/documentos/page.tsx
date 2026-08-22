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
// Y LA BASE YA DICE LO MISMO (migración 5100, 21/08/2026). Hasta ese día esto declaraba el agujero:
// `drive_index` era `using (true)` y cualquier sesión pedía la lista completa por PostgREST sin
// pasar por esta pantalla. Ahora la policy es `ve_economia()` para el catálogo entero, y el que no
// ve economía sólo alcanza los archivos con vínculo propio. Esta pantalla dejó de ser la única
// cerradura: si algún día se abriera la ruta, la base seguiría filtrando.
//
// ═══ LO QUE ESTA PANTALLA ESCRIBE, Y LO QUE NO ═══
//
// **ESCRIBE UNA COSA**: la fecha de vencimiento de un documento del legajo (`services/actions.ts`).
// Era el insumo que faltaba: el mecanismo de vigencia estaba entero —`estadoVigencia`, la columna
// VENCE, los estados— y nadie podía cargar la fecha que lo enciende. Con eso, ART, seguros y
// libretas empiezan a vencer de verdad y la banda de arriba deja de contar cero.
//
// **NO SUBE ARCHIVOS, Y ES UNA DECISIÓN, NO UN OLVIDO.** El canónico dibuja «Subir documento» y
// «Nueva versión». Los dos escriben en Drive, y escribir en Drive exige credenciales de Google en
// el servidor que sirve esta pantalla: en Vercel no están —viven en el orquestador de la VM, detrás
// de un túnel saliente—. `/api/os/[...path]` no es esa vía: es un proxy genérico a la URL que el
// túnel publica en `os_runtime`, con CORS abierto y sin autenticación propia; montar la subida ahí
// sería inventar la integración, no usar una que existe. La vía de carga real sigue siendo Drive
// directo (o el bot de comprobantes), y `scripts/indexar-drive.mjs` lo trae al índice en la corrida
// siguiente. Un botón que promete subir y no sube es peor que no tenerlo.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  getCarpetasRaiz, getDocumento, getDocumentos, getResumenVencimientos, TOPE,
} from '@/features/documentos/services/documentosService'
import { CATEGORIAS } from '@/features/documentos/services/categorias'
import { TablaDocumentos } from '@/features/documentos/components/TablaDocumentos'
import { PanelDocumento } from '@/features/documentos/components/PanelDocumento'
import { BandaVencimientos } from '@/features/documentos/components/BandaVencimientos'
import { FiltrosURL } from '@/features/administracion/components/Controles'
import { Aviso, Ayuda, BuscadorURL } from '@/shared/components/ds'
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

// `cat` es la categoría derivada (`categorias.ts`), `vence` el recorte de la banda de alertas y
// `pv` el visor embebido. LOS TRES VIVEN EN LA URL, no en estado de cliente: así la pantalla sigue
// siendo un server component entero, y un filtro puesto se puede compartir por enlace.
type Query = { q?: string; carpeta?: string; tipo?: string; cat?: string; vence?: string; d?: string; pv?: string }

function armarHref(base: Query, cambios: Partial<Query> = {}): string {
  const v = { ...base, ...cambios }
  const p = new URLSearchParams()
  if (v.q) p.set('q', v.q)
  if (v.carpeta) p.set('carpeta', v.carpeta)
  if (v.tipo) p.set('tipo', v.tipo)
  if (v.cat) p.set('cat', v.cat)
  if (v.vence) p.set('vence', v.vence)
  if (v.d) p.set('d', v.d)
  if (v.pv) p.set('pv', v.pv)
  const qs = p.toString()
  return `/documentos${qs ? `?${qs}` : ''}`
}

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const supabase = await createClient()

  // El día se calcula UNA vez y se pasa hacia abajo: si cada fila llamara a `new Date()`, dos filas
  // renderizadas a ambos lados de la medianoche darían vigencias distintas en la misma pantalla.
  // Y es el MISMO día con el que se cuenta la banda y con el que se recorta la tabla: contarlos con
  // dos relojes distintos haría que el aviso dijera 3 y la lista mostrara 2.
  const hoy = new Date().toISOString().slice(0, 10)

  const [catalogo, carpetas, vencimientos] = await Promise.all([
    getDocumentos(supabase, { q: sp.q, carpeta: sp.carpeta, tipo: sp.tipo, categoria: sp.cat, vence: sp.vence, hoy }),
    getCarpetasRaiz(supabase),
    getResumenVencimientos(supabase, hoy),
  ])
  if (catalogo.error) return <EstadoError mensaje={catalogo.error} que="el archivo de documentos" />

  const documentos = catalogo.data?.documentos ?? []
  const total = catalogo.data?.total ?? 0
  // NO SE PUDO ABRIR ≠ NO EXISTE, otra vez: el panel dice su propio error y la tabla sigue viva.
  const abierto = sp.d ? await getDocumento(supabase, sp.d) : null
  const filtrando = Boolean(sp.q || sp.carpeta || sp.tipo || sp.cat || sp.vence)

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

      <BandaVencimientos
        resumen={vencimientos.data}
        error={vencimientos.error}
        hrefVencidos={armarHref(sp, { vence: 'vencido', d: undefined })}
        hrefEsteMes={armarHref(sp, { vence: 'mes', d: undefined })}
        hrefTodo={armarHref(sp, { vence: undefined, d: undefined })}
        recorte={sp.vence}
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <BuscadorURL
          accion="/documentos"
          q={sp.q}
          placeholder="Buscar por nombre o carpeta"
          oculto={{ carpeta: sp.carpeta, tipo: sp.tipo, cat: sp.cat, vence: sp.vence }}
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

      {/* LAS CATEGORÍAS VAN EN SU PROPIA LÍNEA porque no son un filtro más: el de carpeta y el de
          tipo dicen dónde vive el archivo y qué formato tiene; éste dice QUÉ ES. La taxonomía se
          deriva de la ruta y del nombre —`categorias.ts` explica con qué reglas y qué NO puede— y
          cada fila muestra la categoría que le tocó, para que el filtro se pueda auditar mirando
          lo que devolvió. */}
      <div className="mb-5">
        <FiltrosURL
          testid="filtro-categoria"
          opciones={[
            { label: 'Todas', href: armarHref(sp, { cat: undefined, d: undefined }), activo: !sp.cat, testid: 'filtro-categoria-todas' },
            ...CATEGORIAS.map((c) => ({
              label: c.etiqueta,
              href: armarHref(sp, { cat: c.clave, d: undefined }),
              activo: sp.cat === c.clave,
              testid: `filtro-categoria-${c.clave}`,
            })),
            { label: 'Otros', href: armarHref(sp, { cat: 'otros', d: undefined }), activo: sp.cat === 'otros', testid: 'filtro-categoria-otros' },
          ]}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <TablaDocumentos
            documentos={documentos}
            seleccionado={sp.d}
            // `pv` se apaga al cambiar de documento: dejarlo prendido abriría el visor de un archivo
            // que nadie pidió ver, y para un PDF de 40 MB eso es una descarga que nadie pidió.
            hrefDe={(id) => armarHref(sp, { d: id, pv: undefined })}
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
          {/* EL PIE SE QUEDA CON EL DATO. La cuenta y el tope son un hecho de esta pantalla —«lo
              que falta no está vacío» evita leer 500 documentos como si fueran todos—, así que se
              lee siempre. Cómo llegan los archivos al índice es cómo funciona la pantalla: se lee
              una vez y estorba las otras trescientas, así que baja a la ayuda. */}
          <p className="mt-3 text-[11px] leading-relaxed text-faint" data-testid="pie-documentos">
            {documentos.length < total
              ? `Se listan ${documentos.length} de ${total.toLocaleString('es-AR')} documentos, los modificados más recientemente. Lo que falta no está vacío: está fuera del tope de ${TOPE} filas de esta pantalla.`
              : `${total.toLocaleString('es-AR')} ${total === 1 ? 'documento' : 'documentos'}.`}
          </p>
          <Ayuda titulo="De dónde salen estos documentos" testid="ayuda-documentos">
            Los archivos no se copian ni se suben desde acá: se cargan en Drive y el indexador los
            trae al índice en la corrida siguiente.
          </Ayuda>
        </div>

        {sp.d && (
          abierto?.error ? (
            <div className="w-full lg:w-[360px]">
              <Aviso tono="neg" titulo="No pude abrir ese documento">{abierto.error}</Aviso>
            </div>
          ) : abierto?.data ? (
            <PanelDocumento
              documento={abierto.data}
              cerrarHref={armarHref(sp, { d: undefined })}
              previewHref={armarHref(sp, { pv: sp.pv === '1' ? undefined : '1' })}
              previewAbierto={sp.pv === '1'}
            />
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
