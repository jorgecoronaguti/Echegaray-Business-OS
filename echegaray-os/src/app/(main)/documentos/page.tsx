// 27 · DOCUMENTOS — el archivo de la empresa entero, en una tabla.
//
// ═══ QUÉ CONTESTA ═══
//
// «¿Dónde está ese papel?» Hoy la respuesta vive en tres lugares distintos: la carpeta de Drive, el
// legajo de una persona y la ficha de un cliente. Esta pantalla es la única que los mira juntos.
//
// ═══ LA FUENTE, MEDIDA ANTES DE DISEÑAR ═══
//
// `documento_presentacion` 0 · `drive_documento_estado` 0 · `drive_index` 3.599 ·
// `documentacion_legajo` 847 · `cliente_documento` 214 · `obra_documento` **32** (24/08/2026).
// O sea: el catálogo es `drive_index` y las otras TRES son VÍNCULOS. Por eso el archivo es la fila
// y el vínculo es una columna.
//
// `obra_documento` estaba en 0 el 21/08 y por eso la pantalla la ignoraba. Volvió a medirse el
// 24/08: tiene 32 filas, y desde entonces se lee. Una medición vieja convertida en constante del
// código es la forma más silenciosa de perder un dato real.
//
// NO EXISTE ninguna tabla que vincule un archivo con un PROVEEDOR. El canónico dibuja el filtro
// «De proveedores»; acá no está, y se dice, en vez de ofrecer un chip que siempre devuelve cero.
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
  ENTIDADES, getCarpetasRaiz, getDocumento, getDocumentos,
  getResumenVencimientos, PAGINAS_MAX, TOPE,
} from '@/features/documentos/services/documentosService'
import { CATEGORIAS } from '@/features/documentos/services/categorias'
import { TablaDocumentos } from '@/features/documentos/components/TablaDocumentos'
import { PanelDocumento } from '@/features/documentos/components/PanelDocumento'
import { senalesDeDocumentos, silencioDeVencimientos } from '@/features/documentos/services/senalesDocumentos'
import { Aviso } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { IconoFecha } from '@/shared/components/iconos'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { TrabajoDeSeccion } from '@/shared/components/v2/TrabajoDeSeccion'
import { NotaBloque, V } from '@/shared/components/v2/patron'

export const dynamic = 'force-dynamic'

// `cat` es la categoría derivada (`categorias.ts`), `vence` el recorte de la banda de alertas y
// `pv` el visor embebido. LOS TRES VIVEN EN LA URL, no en estado de cliente: así la pantalla sigue
// siendo un server component entero, y un filtro puesto se puede compartir por enlace.
type Query = {
  q?: string; carpeta?: string; tipo?: string; cat?: string; vence?: string
  /** De qué cuelga el archivo: `obra`, `persona` o `cliente`. */
  ent?: string
  /** Cuántas páginas de `TOPE` filas se pidieron. Lo sube «Cargar más». */
  n?: string
  d?: string; pv?: string
}

/** Cómo se rotula cada clase de vínculo en el filtro. El canónico las llama así. */
const ROTULO_ENTIDAD = { obra: 'De obras', persona: 'De personas', cliente: 'De clientes' } as const

function armarHref(base: Query, cambios: Partial<Query> = {}): string {
  const v = { ...base, ...cambios }
  const p = new URLSearchParams()
  if (v.q) p.set('q', v.q)
  if (v.carpeta) p.set('carpeta', v.carpeta)
  if (v.tipo) p.set('tipo', v.tipo)
  if (v.cat) p.set('cat', v.cat)
  if (v.vence) p.set('vence', v.vence)
  if (v.ent) p.set('ent', v.ent)
  if (v.n) p.set('n', v.n)
  if (v.d) p.set('d', v.d)
  if (v.pv) p.set('pv', v.pv)
  const qs = p.toString()
  return `/documentos${qs ? `?${qs}` : ''}`
}

/** CAMBIAR UN FILTRO VUELVE A LA PRIMERA PÁGINA. Sin esto, quien pidió 1.000 filas y después filtra
 *  por «De obras» se lleva las 32 metidas en una consulta de 10 páginas: 10 veces el trabajo para el
 *  mismo resultado. Y cierra el panel: el documento abierto puede no estar en el resultado nuevo. */
const filtrar = (base: Query, cambios: Partial<Query>) =>
  armarHref(base, { ...cambios, n: undefined, d: undefined })

export default async function DocumentosPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const supabase = await createClient()

  // El día se calcula UNA vez y se pasa hacia abajo: si cada fila llamara a `new Date()`, dos filas
  // renderizadas a ambos lados de la medianoche darían vigencias distintas en la misma pantalla.
  // Y es el MISMO día con el que se cuenta la banda y con el que se recorta la tabla: contarlos con
  // dos relojes distintos haría que el aviso dijera 3 y la lista mostrara 2.
  const hoy = new Date().toISOString().slice(0, 10)

  // `n` llega por la URL: se satura acá y el servicio lo vuelve a saturar. Un `?n=99999` escrito a
  // mano es una consulta de 3.599 filas con todos sus vínculos que cualquiera puede pedir.
  const paginas = Math.min(Math.max(1, Number.parseInt(sp.n ?? '1', 10) || 1), PAGINAS_MAX)

  const [catalogo, carpetas, vencimientos] = await Promise.all([
    getDocumentos(supabase, {
      q: sp.q, carpeta: sp.carpeta, tipo: sp.tipo, categoria: sp.cat, vence: sp.vence,
      entidad: sp.ent, hoy, paginas,
    }),
    getCarpetasRaiz(supabase),
    getResumenVencimientos(supabase, hoy),
  ])
  if (catalogo.error) return <EstadoError mensaje={catalogo.error} que="el archivo de documentos" />

  const documentos = catalogo.data?.documentos ?? []
  const total = catalogo.data?.total ?? 0
  const hayMas = documentos.length < total && paginas < PAGINAS_MAX
  // NO SE PUDO ABRIR ≠ NO EXISTE, otra vez: el panel dice su propio error y la tabla sigue viva.
  const abierto = sp.d ? await getDocumento(supabase, sp.d) : null
  const filtrando = Boolean(sp.q || sp.carpeta || sp.tipo || sp.cat || sp.vence || sp.ent)

  const senales = senalesDeDocumentos(vencimientos.data, {
    vencidos: filtrar(sp, { vence: 'vencido' }),
    esteMes: filtrar(sp, { vence: 'mes' }),
  })

  return (
    // SIN `PageShell` ni `FranjaCartera` (porte 27 v2): el shell dibuja un `h1` de 22px y padding
    // 16/24px; el v2 dibuja el título de 19px con su subtítulo al lado, el buscador de filo, y la
    // lista a 20px del borde sin caja. `SelloDatoBueno` venía del shell y se conserva: sin él,
    // `error.tsx` pierde la hora del último dato bueno.
    <div style={{ minHeight: '100vh', background: V.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />

      {/* EL INTERLINEADO DEL MOCKUP, DECLARADO UNA VEZ. Ver `patron.tsx · CAJA_CONTENIDO`. */}
      <div style={{ lineHeight: 'normal' }}>
      {/* ═══ CRITERIO 1: LA PRIMERA LÍNEA ES TRABAJO ═══

          Reemplaza a `BandaVencimientos`, que decía lo mismo con tres formas distintas según el
          estado. Lo que se conservó entero es su argumento: con CERO fechas cargadas no se escribe
          «0 vencidos» —eso se lee «está todo en orden» y sería falso—, se dice que el control no
          está cargado y dónde se carga. Y un error de lectura dibuja las señales SIN cifra. */}
      <TrabajoDeSeccion
        senales={senales}
        icono={IconoFecha}
        vacio={silencioDeVencimientos(vencimientos.data)}
        testid="banda-vencimientos"
      />

      <CabeceraSeccion
        testid="vistas-documentos"
        espacioPanel={Boolean(sp.d)}
        vistas={[{
          clave: 'documentos',
          titulo: 'Documentos',
          // «de obras, personas y clientes» y NO «y proveedores»: no existe ninguna tabla que
          // vincule un archivo con un proveedor, y nombrarlos prometería un filtro que no está.
          subtitulo: 'de obras, personas y clientes',
          cuenta: null,
          activa: true,
          href: '/documentos',
        }]}
        buscador={{
          accion: '/documentos',
          q: sp.q,
          placeholder: 'Buscar en todo',
          oculto: { carpeta: sp.carpeta, tipo: sp.tipo, cat: sp.cat, vence: sp.vence, ent: sp.ent },
          testid: 'buscar-documento',
        }}
      />

      {carpetas.error && (
        <div style={{ padding: '12px 20px 0' }}>
          <Aviso tono="warn" titulo="No pude leer las carpetas del índice">{carpetas.error}</Aviso>
        </div>
      )}

      <div style={{ padding: '10px 20px 24px' }}>
        <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          {/* ═══ DOS GRUPOS DE FILTRO EN UNA LÍNEA, CADA UNO CON SU RÓTULO (`27v2:78-98`) ═══

              DE QUIÉN ordena la pregunta real —quien busca un papel sabe de quién es antes que en
              qué carpeta está— y se resuelve en Postgres contra la tabla de vínculo (`idsDeEntidad`),
              no descartando filas ya traídas. QUÉ ES es la taxonomía derivada de la ruta y del
              nombre (`categorias.ts`), y cada fila muestra la que le tocó para poder auditarla.

              NO HAY «DE PROVEEDORES», y no es un olvido: en la base NO EXISTE ninguna tabla que
              vincule un archivo con un proveedor —hay `obra_documento` (32), `cliente_documento`
              (214) y `documentacion_legajo` (847), y nada más—. Un chip que devolviera siempre cero
              enseñaría que el proveedor no tiene papeles, que es falso: los tiene, sin vincular.

              SE FUERON LOS CHIPS DE CARPETA Y DE FORMATO. El v2 no los dibuja: la carpeta es una
              COLUMNA de la tabla —se lee, no se filtra— y el formato ya lo dice el icono de cada
              fila. Los dos parámetros siguen funcionando por URL, así que ningún enlace guardado se
              rompe; lo que se retiró son dos filas de pastillas que empujaban la primera fila del
              archivo fuera de la pantalla. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ marginBottom: 8 }}>
            <RotuloGrupo>De quién</RotuloGrupo>
            <FiltrosSuaves
              testid="filtro-entidad"
              conteo={{ n: documentos.length, total }}
              opciones={[
                { clave: 'todo', etiqueta: 'Todo', href: filtrar(sp, { ent: undefined }), activo: !sp.ent },
                ...ENTIDADES.map((e) => ({
                  clave: e,
                  etiqueta: ROTULO_ENTIDAD[e],
                  href: filtrar(sp, { ent: e }),
                  activo: sp.ent === e,
                })),
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ marginBottom: 8 }}>
            <RotuloGrupo>Qué es</RotuloGrupo>
            <FiltrosSuaves
              testid="filtro-categoria"
              conteo={{ n: documentos.length, total }}
              opciones={[
                { clave: 'todas', etiqueta: 'Todas', href: filtrar(sp, { cat: undefined }), activo: !sp.cat },
                ...CATEGORIAS.map((c) => ({
                  clave: c.clave, etiqueta: c.etiqueta,
                  href: filtrar(sp, { cat: c.clave }), activo: sp.cat === c.clave,
                })),
                { clave: 'otros', etiqueta: 'Otros', href: filtrar(sp, { cat: 'otros' }), activo: sp.cat === 'otros' },
              ]}
            />
          </div>

          <TablaDocumentos
            documentos={documentos}
            seleccionado={sp.d}
            // `pv` se apaga al cambiar de documento: dejarlo prendido abriría el visor de un archivo
            // que nadie pidió ver, y para un PDF de 40 MB eso es una descarga que nadie pidió.
            // LOS ENLACES VIAJAN COMO DATOS, uno por documento: una función como prop no sobrevive a la
            // frontera servidor/cliente si la tabla algún día cruza, y calcularlos acá no cuesta nada.
            hrefs={Object.fromEntries(documentos.map((d) => [d.drive_file_id, armarHref(sp, { d: d.drive_file_id, pv: undefined })]))}
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
          {/* EL PIE SE QUEDA CON EL DATO —«lo que falta no está vacío» evita leer 100 documentos
              como si fueran todos— y AHORA TIENE PUERTA. Antes decía «está fuera del tope» y ahí
              terminaba: el documento de la fila 201 no se alcanzaba desde ninguna parte de la
              pantalla, ni filtrando —el filtro también recorta a 100—. «Cargar más» pide otra
              página A LA CONSULTA (`?n=`), no dibuja más de lo que ya se trajo. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[11px] leading-relaxed text-faint" data-testid="pie-documentos">
              {documentos.length < total
                ? `Se listan ${documentos.length} de ${total.toLocaleString('es-AR')} documentos, los modificados más recientemente.`
                : `${total.toLocaleString('es-AR')} ${total === 1 ? 'documento' : 'documentos'}.`}
            </p>
            {hayMas && (
              <Link
                href={armarHref(sp, { n: String(paginas + 1) })}
                prefetch={false}
                className="text-[11.5px] font-medium text-ink underline underline-offset-2"
                data-testid="cargar-mas-documentos"
              >
                Cargar {Math.min(TOPE, total - documentos.length)} más
              </Link>
            )}
            {/* El techo duro se dice cuando se toca, no antes: hasta ahí es una restricción interna
                que a nadie le importa. Buscar es más rápido que bajar 3.000 filas. */}
            {documentos.length < total && paginas >= PAGINAS_MAX && (
              <span className="text-[11px] text-faint" data-testid="tope-documentos">
                Es el máximo que esta pantalla dibuja. Acotá con la búsqueda o un filtro.
              </span>
            )}
          </div>
          <NotaBloque testid="nota-documentos">
            Los archivos no se suben desde acá: se cargan en Drive —o entran por el bot de
            comprobantes— y el indexador los trae en la corrida siguiente. No hay filtro «de
            proveedores» porque no existe ninguna tabla que vincule un archivo con un proveedor:
            tienen papeles, sin vincular.
          </NotaBloque>
        </div>

        {sp.d && (
          abierto?.error ? (
            <div className="w-full lg:ml-6 lg:w-[360px]">
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
            <div className="w-full lg:ml-6 lg:w-[360px]">
              <Aviso tono="warn" titulo="Ese documento no está en el índice">
                Puede haberse borrado de Drive, o todavía no lo alcanzó la indexación.
              </Aviso>
            </div>
          )
        )}
        </div>
      </div>
      </div>
    </div>
  )
}

/** El rótulo de un grupo de filtros: 10px, versalitas, más apagado que el de una columna. `27v2:81`. */
function RotuloGrupo({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: V.lupa }}>
      {children}
    </span>
  )
}
