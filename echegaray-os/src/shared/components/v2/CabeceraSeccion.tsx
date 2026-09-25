// EL NIVEL 3, EL BUSCADOR Y LA ACCIÓN PRIMARIA DE UNA SECCIÓN — `22v2:81-103`, `25v2:57-76`.
//
// NIVEL 3 ES TEXTO CON SUBRAYADO, NO UNA TERCERA BARRA DE SOLAPAS. Arriba ya están la barra del
// producto y la del área; una tercera barra deja de decir dónde está parado el que mira. El activo
// se marca con `inset 0 -2px 0 #30302F` y su conteo se pone tenue —no gris claro— porque el número
// del que está abierto sí se lee.
//
// ═══ EL HUECO DE 392px NO ES UN ERROR DE MEDICIÓN ═══
//
// El mockup reserva la columna del panel en la cabecera (`22v2:100-102`) para que el buscador y el
// botón de alta queden alineados con la LISTA QUE GOBIERNAN, no con el borde de la página. Sin ese
// hueco, abrir el panel corre la tabla hacia la izquierda y los controles se quedan flotando sobre
// el panel, gobernando algo que ya no está debajo. 392 = 344 del panel (`PanelFilo`, `v4A:255`) +
// 24 de margen + 24 de sangría.
//
// EL HUECO SIGUE AL PANEL, Y NO DE PALABRA. Hasta el 22/09 el hueco era el literal `lg:w-[392px]`
// y la única garantía de que coincidiera con el panel era este comentario: «Efectivo a rendir»
// estrenó un panel de 520 y el botón oscuro «+ Entregar efectivo» quedó 128px ADENTRO del panel,
// montado encima. Por eso `espacioPanel` acepta el ancho: una pantalla con un panel que no es el
// `PanelFilo` pasa SU constante —la misma que dibuja el panel— y las dos medidas no pueden
// separarse. `true` sigue queriendo decir «el panel del patrón», que mide 392.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { IconoCrear } from '@/shared/components/iconos'
import { BarraCorrible } from './BarraCorrible'
import { BuscadorFilo } from './BuscadorFilo'
import { V } from './patron'

/** El hueco del `PanelFilo`: 344 de panel + 24 de margen + 24 de sangría. */
export const HUECO_PANEL_FILO = 392

export interface SubVista {
  clave: string
  titulo: string
  /** Lo que la sección abarca, al lado del título y en 12px (`27v2:59`). No es una descripción. */
  subtitulo?: string
  /** `null` = no se pudo contar. El conteo se omite, nunca se escribe 0. */
  cuenta: number | null
  activa: boolean
  href: string
}

// ═══ EN EL TELÉFONO LA CABECERA SE APILA (dueño, 24/09/2026: «es un desastre todo lo relacionado a mobile») ═══
//
// A 390px las cinco secciones de Compras caían en TRES renglones, el buscador de 216px quedaba
// flotando y el amarillo era un botón de 30px de alto. Bajo `md` la cabecera se reordena sin cambiar
// una sola pieza de lugar en el DOM:
//
//   1. las solapas, en UNA línea que se corre por dentro (`BarraCorrible`) y se abre mostrando la
//      activa — la misma banda que ya usan las fichas;
//   2. el buscador, a todo el ancho y con 44px de alto;
//   3. la navegación discreta (`filtros`), en un renglón que envuelve;
//   4. la acción primaria, amarilla, a todo el ancho y con 48px.
//
// TODO VA POR CLASES `max-md:`, y las que pisan un estilo en línea llevan `!`. Desde `md` la banda es
// `display: contents` y los envoltorios también: el escritorio sigue dibujando exactamente la fila de
// siempre, píxel por píxel.

export function CabeceraSeccion({ vistas, buscador, alta, accion, filtros, espacioPanel, testid = 'vistas-seccion' }: {
  /** Una sola = el título de la sección, sin subrayado de solapa. Dos o más = el nivel 3. */
  vistas: SubVista[]
  /**
   * `undefined` = ESTA VISTA NO SE BUSCA. No es un olvido: la carga del día en el teléfono muestra
   * una obra y su gente —seis o siete nombres—, y un campo de búsqueda ahí no filtra nada mientras
   * le come una línea a la única pantalla que se usa parado en la obra.
   */
  buscador?: {
    accion: string; q?: string; placeholder: string
    oculto?: Record<string, string | undefined>
    testid?: string
  }
  /**
   * LA ÚNICA ACCIÓN PRIMARIA DE LA PANTALLA. `undefined` = esta sección no da de alta nada —
   * Documentos y Base maestra no crean su fila desde acá— y entonces no se dibuja ningún amarillo.
   */
  alta?: { href: string; etiqueta: string; testid?: string }
  /**
   * LA ACCIÓN PRIMARIA CUANDO NO ES UN ENLACE DE ALTA. Compras no navega a un formulario: abre un
   * popover que sube el archivo y lo encola por el mismo circuito del bot (`CargarComprobante`), así
   * que no puede viajar como `{href, etiqueta}`. Va en el mismo lugar que `alta` y con el mismo
   * amarillo, porque para el que mira es el mismo botón; lo que cambia es qué hace al tocarlo.
   * Las dos juntas no tienen sentido —una sola acción primaria por pantalla— y por eso `alta` gana.
   */
  accion?: ReactNode
  /** Los recortes, cuando el mockup los pone en la MISMA línea que el buscador (`25v2:66-73`). */
  filtros?: ReactNode
  /**
   * ¿Hay un panel abierto al costado, y cuánto mide? `true` = el `PanelFilo` del patrón (392).
   * Un número = el ancho TOTAL de un panel propio, tomado de la constante que lo dibuja.
   */
  espacioPanel: boolean | number
  testid?: string
}) {
  return (
    <div className="max-md:!px-4 max-md:!pt-4" style={{ display: 'flex', alignItems: 'stretch', padding: '26px 20px 0' }}>
      <div
        className="max-md:!flex-col max-md:!flex-nowrap max-md:!items-stretch max-md:!gap-3"
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
          gap: 18, flexWrap: 'wrap', rowGap: 12,
        }}
        data-testid={testid}
      >
        <BarraCorrible
          className="md:!contents max-md:-mx-4 max-md:px-4"
          style={{ gap: 20 }}
          testid={`${testid}-banda`}
        >
        {vistas.map((v) => (
          <Link prefetch={false}
            key={v.clave}
            href={v.href}
            data-testid={`vista-${v.clave}`}
            aria-current={v.activa ? 'page' : undefined}
            className="max-md:shrink-0 max-md:!pb-2.5 max-md:!pt-2.5"
            style={{
              display: 'flex', alignItems: 'baseline', gap: 7, paddingBottom: 6,
              // El subrayado dice CUÁL de las sub-vistas está abierta. Con una sola no hay cuál:
              // subrayar el título sería marcar una elección que nadie hizo.
              boxShadow: v.activa && vistas.length > 1 ? `inset 0 -2px 0 ${V.grafito}` : 'none',
            }}
          >
            <span
              style={{
                // Una sección con UNA sola vista escribe su nombre como título de 19px
                // (`25v2:59`); con dos o más, las solapas de nivel 3 miden 16 (`22v2:118`).
                fontSize: vistas.length === 1 ? '19px' : '16px',
                fontWeight: v.activa ? 600 : 500,
                color: v.activa ? V.tinta : V.tenue, letterSpacing: '-.01em',
              }}
              className="max-md:whitespace-nowrap"
            >
              {v.titulo}
            </span>
            {/* EN EL TELÉFONO EL SUBTÍTULO CON CIFRAS NO SE DIBUJA (dueño, 23/09/2026): envolvía al lado del
                título en dos renglones de números. Desde `md` vuelve. */}
            {v.subtitulo && (
              <span className="max-md:hidden" style={{ fontSize: '12px', color: V.tenue }}>{v.subtitulo}</span>
            )}
            {v.cuenta !== null && (
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: '11.5px', color: v.activa ? V.tenue : V.cuentaApagada }}
              >
                {v.cuenta}
              </span>
            )}
          </Link>
        ))}
        </BarraCorrible>

        <div
          className="max-md:!ml-0 max-md:!flex-col max-md:!items-stretch max-md:!gap-3 max-md:empty:!hidden"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
        >
          {buscador && (
            <BuscadorFilo
              accion={buscador.accion}
              q={buscador.q}
              placeholder={buscador.placeholder}
              oculto={buscador.oculto}
              testid={buscador.testid ?? 'buscar'}
            />
          )}
          {/* La navegación discreta: en el teléfono, un renglón propio que envuelve. */}
          {filtros && (
            <div className="md:contents max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-4 max-md:gap-y-1">
              {filtros}
            </div>
          )}
          {!alta && accion}
          {alta && (
            <Link
              href={alta.href}
              data-testid={alta.testid ?? 'nuevo'}
              className="hover:bg-[#EEBE00] max-md:!min-h-[48px] max-md:!justify-center max-md:!rounded-[12px] max-md:!text-[15px]"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: V.marca, color: V.tinta,
                fontSize: '12.5px', fontWeight: 600, borderRadius: 6, padding: '6px 11px',
              }}
            >
              <IconoCrear className="h-[14px] w-[14px]" />
              {alta.etiqueta}
            </Link>
          )}
        </div>
      </div>

      {espacioPanel && (
        <span
          className="hidden shrink-0 lg:block"
          style={{ width: typeof espacioPanel === 'number' ? espacioPanel : HUECO_PANEL_FILO }}
          data-testid="hueco-panel"
          aria-hidden
        />
      )}
    </div>
  )
}
