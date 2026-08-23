'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AREA_HREF, AREA_LABEL, type Area } from '@/features/auth/types/areas'

// EL HEADER DEL ERP — UNA LÍNEA, DOS ÁREAS, Y NADA MÁS.
//
// ═══ EL QUE REEMPLAZA (18/08/2026) ═══
//
// El dueño, textual: *"El header/navegación global actual NO me gusta: está saturado, sin jerarquía y
// debe rehacerse"* · *"Debe desaparecer el header de las capturas actuales con `01 · OBRAS / OS /
// FINANZAS / REPORTES / CONEXIONES / ADMINISTRACIÓN`. Eso representa arquitectura interna, no
// navegación para usuarios"*.
//
// Tenía razón y el diagnóstico es preciso: esos seis grupos eran el mapa del REPOSITORIO —cómo está
// organizado el OS por dentro— publicado como si fuera el mapa del trabajo. Un jefe de obra no piensa
// "voy a Conexiones"; piensa "voy a mi obra". Eran 17 links en dos filas, con las categorías escritas
// arriba en versalitas, ocupando ~90px de alto en cada pantalla del sistema.
//
// NINGUNA RUTA SE BORRÓ. `/os`, `/chat`, `/flujo-caja`, `/ingenieria-financiera`, `/reportes`,
// `/integraciones`… siguen vivas y accesibles por URL; lo que se retiró es su lugar en la navegación
// principal. Retirar un link es reversible en una línea; borrar una ruta no.
//
// ═══ POR QUÉ DOS ÁREAS Y NO UN MENÚ ═══
//
// Son las dos formas de trabajar que existen en la empresa: administrar (clientes, obras, plata,
// contratos) y ejecutar (la obra). El nivel de usuario decide cuáles ve — y cuando ve una sola, no se
// dibuja una barra de un elemento: se dibuja el nombre del área, que es información y no un botón que
// no lleva a ningún lado.

export function AppHeader({
  areas,
  email,
  rolLabel,
  salir,
}: {
  areas: Area[]
  email: string | null
  rolLabel: string | null
  salir: React.ReactNode
}) {
  const pathname = usePathname()
  // El área ACTIVA sale de la ruta, no de un estado: la misma URL abierta en otra pestaña se pinta
  // igual. `/clientes` y `/administracion` son la misma área; `/obras` y `/control-obras`, la otra.
  const activa: Area | null = areas.length === 1
    ? areas[0]
    : /^\/(administracion|clientes)/.test(pathname)
      ? 'administracion'
      : /^\/(obras|control-obras|integraciones|campo)/.test(pathname)
        ? 'obras'
        : null

  return (
    // UNA SOLA LÍNEA, 48px CONTANDO EL HAIRLINE. El alto vive en el `<header>` y no en el div de
    // adentro: con `h-12` adentro y el borde afuera, el header medía 49px — 48 de contenido más 1 de
    // línea. Un píxel no se ve, pero el header es la referencia de la que cuelga todo lo demás, y el
    // handoff dice 48. Es la medida que la regla ejecutable comprueba en las 22 pantallas.
    <header className="sticky top-0 z-30 h-12 border-b border-line bg-surface" data-testid="app-header">
      <div className="flex h-full w-full items-center gap-1 px-4 sm:px-6 lg:px-10">
        {/* LA MARCA REAL, NO SU NOMBRE ESCRITO (18/08/2026). El isotipo es el archivo oficial del
            dueño —Drive · "logo y colores de la empresa" · `LOGO REDONDO.png`, con transparencia—,
            no un redibujo mío: una marca redibujada a ojo es una marca distinta.
            El logotipo va al lado en grafito, que es exactamente como está compuesto el logo. */}
        <Link
          prefetch={false}
          href={areas.includes('administracion') ? '/administracion' : '/obras'}
          className="mr-3 flex shrink-0 items-center gap-2"
          data-testid="marca"
          aria-label="Echegaray Construcciones — inicio"
        >
          <Image src="/marca/isotipo.png" alt="" width={26} height={26} priority className="h-[26px] w-[26px]" />
          {/* EL NOMBRE ENTERO, Y LAS DOS PALABRAS CON EL MISMO FORMATO (19/08/2026).
              La primera versión ponía «CONSTRUCCIONES» en peso normal y gris, como si fuera una
              bajada. El dueño lo corrigió: no son una marca y su descripción — son UN nombre. Mismo
              peso, mismo color, mismo interletrado; lo único que cambia es que la segunda palabra se
              retira por debajo de `lg`, donde compite con el nombre de la obra. En el teléfono queda
              sólo el isotipo: 26px dicen lo mismo que 120px. */}
          <span className="hidden text-[13px] font-semibold tracking-[0.14em] text-ink sm:block">
            ECHEGARAY<span className="hidden lg:inline"> CONSTRUCCIONES</span>
          </span>
          {/* EL DESCRIPTOR DEL PRODUCTO, Y NUNCA CON PESO NI COLOR DE MARCA (`design/system/BRAND.md`).
              «Business OS» describe qué es esto; la marca es ECHEGARAY CONSTRUCCIONES. En cuanto el
              descriptor toma peso o color, la pantalla pasa a tener dos marcas compitiendo — y la
              que gana es la que no lo es. Por eso va en 11,5px, `faint`, detrás de un separador. */}
          <span className="hidden text-[11.5px] text-faint lg:inline" aria-hidden>
            Business OS
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-0.5" data-testid="nav-areas">
          {areas.length === 1 ? (
            <span className="px-2 text-[13px] font-medium text-muted">{AREA_LABEL[areas[0]]}</span>
          ) : (
            areas.map((a) => (
              <Link
                key={a}
                prefetch={false}
                href={AREA_HREF[a]}
                data-testid={`nav-${a}`}
                aria-current={activa === a ? 'page' : undefined}
                // EL ÁREA ACTIVA SE MARCA CON EL AMARILLO DE LA MARCA, y con una regla de 2px
                // debajo — no con un fondo amarillo. #FDC900 da 1,6:1 sobre blanco: como fondo de
                // un control con texto encima es ilegible. Como REGLA no lleva texto, así que el
                // contraste no aplica y la identidad aparece donde de verdad significa algo:
                // dónde estoy parado. Ver globals.css.
                className={`rounded-t-md border-b-2 px-2.5 pb-[7px] pt-1.5 text-[13px] transition-colors ${
                  activa === a
                    ? 'border-marca font-medium text-ink'
                    : 'border-transparent text-muted hover:bg-surface-quiet hover:text-ink'
                }`}
              >
                {AREA_LABEL[a]}
              </Link>
            ))
          )}
        </nav>

        {/* El usuario, a la derecha, sin empujar. `min-w-0` + `truncate`: un email largo cortaba la
            página de costado en el teléfono (568px de ancho real contra 390 de pantalla, medido). */}
        <div className="ml-auto flex min-w-0 items-center gap-2" data-testid="usuario-actual">
          {email ? (
            <>
              {/* `[email · rol]` — el rol estaba sólo en el `title`, invisible salvo que alguien
                  dejara el puntero quieto encima. Es el dato que contesta «¿por qué no veo tal
                  pantalla?» sin abrir Usuarios, así que se escribe. */}
              <Link
                prefetch={false}
                href="/mi-cuenta"
                data-testid="mi-cuenta"
                className="hidden min-w-0 items-center gap-1.5 rounded-control px-2 py-1 transition-colors hover:bg-surface-quiet sm:flex"
                title={`${email}${rolLabel ? ` · ${rolLabel}` : ''} — mi cuenta`}
              >
                <span className="min-w-0 truncate text-[12px] text-muted">{email}</span>
                {rolLabel && <span className="hidden shrink-0 text-[12px] text-faint lg:inline">· {rolLabel}</span>}
              </Link>
              {salir}
            </>
          ) : (
            <Link href="/login" className="rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-surface-quiet">
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
