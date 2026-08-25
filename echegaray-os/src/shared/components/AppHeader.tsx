'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { solapaActiva, type SolapaNav } from '@/features/auth/types/navegacion'
import { BuscadorGlobal } from './BuscadorGlobal'
import { Novedades } from './Novedades'
import { iniciales } from './iniciales'

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
  solapas,
  nombre,
  email,
  rolLabel,
  verUsuarios,
  salir,
}: {
  /** Las solapas de nivel 1 que este rol ve. Tres para Administración, una para Obras. */
  solapas: SolapaNav[]
  /** El nombre del perfil. Alimenta las iniciales del avatar; sin él se caen al correo. */
  nombre?: string | null
  email: string | null
  rolLabel: string | null
  /** ¿Se le ofrece «Usuarios» en el menú de la cuenta? Es la puerta a cambiar roles. */
  verUsuarios: boolean
  salir: React.ReactNode
}) {
  const pathname = usePathname()
  // Cuál está encendida lo decide `navegacion.ts`, que es puro y está probado: acá vivía una
  // expresión regular en un componente de cliente, o sea una regla de navegación que `node --test`
  // no podía mirar. Fue exactamente la que se rompió el 24/08.
  const activa = solapaActiva(pathname, solapas)

  return (
    // UNA SOLA LÍNEA, 44px CONTANDO EL HAIRLINE (medido del mockup 00: padding 9px + isotipo 24 + hairline). El alto vive en el `<header>` y no en el div de
    // adentro: con `h-12` adentro y el borde afuera, el header medía 49px — 48 de contenido más 1 de
    // línea. Un píxel no se ve, pero el header es la referencia de la que cuelga todo lo demás, y el
    // handoff dice 48. Es la medida que la regla ejecutable comprueba en las 22 pantallas.
    <header className="sticky top-0 z-30 h-11 border-b border-line bg-surface" data-testid="app-header">
      <div className="flex h-full w-full items-center gap-1 px-4 sm:px-6 lg:px-10">
        {/* LA MARCA REAL, NO SU NOMBRE ESCRITO (18/08/2026). El isotipo es el archivo oficial del
            dueño —Drive · "logo y colores de la empresa" · `LOGO REDONDO.png`, con transparencia—,
            no un redibujo mío: una marca redibujada a ojo es una marca distinta.
            El logotipo va al lado en grafito, que es exactamente como está compuesto el logo. */}
        <Link
          prefetch={false}
          href={solapas[0]?.href ?? '/obras'}
          className="mr-3 flex shrink-0 items-center gap-2"
          data-testid="marca"
          aria-label="Echegaray Construcciones — inicio"
        >
          {/* EL ISOTIPO NO PASA POR EL OPTIMIZADOR DE IMÁGENES (25/08/2026).
              Medido contra producción con sesión real, la petición
              `/_next/image?url=%2Fmarca%2Fisotipo.png&w=32&q=75` tardó 243 ms en `/administracion` y
              1.257 ms en `/administracion/pendientes` — en CADA carga de CADA pantalla, porque este
              header vive en todas. El archivo pesa 7,7 kB con transparencia: optimizarlo ahorra unos
              5 kB y cuesta hasta 1,2 s.
              `unoptimized` sirve el archivo derecho desde `public/` con caché inmutable y sin pasar
              por ninguna función; son los mismos píxeles. Se prefiere sobre un `<img>` plano —que es
              lo que ya hacen `movil/Piezas`, `MarcoAuth` y `/campo` con este mismo archivo— para no
              tener que silenciar la regla de lint que existe justamente para atrapar este caso. */}
          <Image src="/marca/isotipo.png" alt="" width={24} height={24} priority unoptimized className="h-[24px] w-[24px]" />
          {/* EL NOMBRE ENTERO, Y LAS DOS PALABRAS CON EL MISMO FORMATO (19/08/2026).
              La primera versión ponía «CONSTRUCCIONES» en peso normal y gris, como si fuera una
              bajada. El dueño lo corrigió: no son una marca y su descripción — son UN nombre. Mismo
              peso, mismo color, mismo interletrado; lo único que cambia es que la segunda palabra se
              retira por debajo de `lg`, donde compite con el nombre de la obra. En el teléfono queda
              sólo el isotipo: 26px dicen lo mismo que 120px. */}
          <span className="hidden text-[11.5px] font-semibold tracking-[0.04em] text-ink sm:block">
            ECHEGARAY<span className="hidden lg:inline"> CONSTRUCCIONES</span>
          </span>
          {/* EL DESCRIPTOR DEL PRODUCTO, Y NUNCA CON PESO NI COLOR DE MARCA (`design/system/BRAND.md`).
              «Business OS» describe qué es esto; la marca es ECHEGARAY CONSTRUCCIONES. En cuanto el
              descriptor toma peso o color, la pantalla pasa a tener dos marcas compitiendo — y la
              que gana es la que no lo es. Por eso va en 11,5px, `faint`, detrás de un separador. */}
          <span className="hidden text-[11px] text-faint lg:inline" aria-hidden>
            Business OS
          </span>
        </Link>

        <nav className="flex h-full min-w-0 items-stretch" data-testid="nav-areas">
          {solapas.length === 1 ? (
            <span className="flex h-full items-center px-3 text-[13px] font-medium text-muted">{solapas[0].label}</span>
          ) : (
            solapas.map((a) => (
              <Link
                key={a.clave}
                prefetch={false}
                href={a.href}
                data-testid={`nav-${a.clave}`}
                aria-current={activa === a.clave ? 'page' : undefined}
                // «Comercial, no administración: vive al lado de Obras» — el `title` del mockup para
                // Presupuestos, que es lo único que explica por qué subió de nivel.
                title={a.clave === 'presupuestos' ? 'Comercial, no administración: vive al lado de Obras' : undefined}
                // EL ÁREA ACTIVA SE MARCA CON EL AMARILLO DE LA MARCA, y con una regla de 2px
                // debajo — no con un fondo amarillo. #FDC900 da 1,6:1 sobre blanco: como fondo de
                // un control con texto encima es ilegible. Como REGLA no lleva texto, así que el
                // contraste no aplica y la identidad aparece donde de verdad significa algo:
                // dónde estoy parado. Ver globals.css.
                // ALTO COMPLETO, NO UNA PASTILLA FLOTANDO (mockup 00/02/03). El mockup marca el
                // área activa con `inset 0 -2px 0 #FDC900` sobre un item que ocupa los 43px de su
                // header: la regla amarilla apoya en el borde inferior y el tab parece continuar la
                // superficie de abajo. Con `rounded-t-md pb-[7px] pt-1.5` la regla quedaba a mitad
                // de altura, flotando. `h-full` + `border-b-2` da la MISMA geometría que el
                // `inset` del mockup y conserva el token `border-marca` en vez de clavar #FDC900.
                className={`flex h-full items-center border-b-2 px-3 text-[13px] transition-colors ${
                  activa === a.clave
                    ? 'border-marca font-semibold text-ink'
                    : 'border-transparent text-muted hover:bg-surface-quiet hover:text-ink'
                }`}
              >
                {a.label}
              </Link>
            ))
          )}
        </nav>

        {/* EL USUARIO ES UN AVATAR, NO UNA LÍNEA DE TEXTO (mockup 00/01/02/03 · orden del dueño 24/08).
            Acá vivía `[email · rol]` + el botón «Cerrar sesión» escritos en el header. En el correo
            de trabajo real —`jorge.o.corona+direccion-test-…@gmail.com`, 54 caracteres— eso comía
            media barra y le ganaba en peso visual a la navegación, que es para lo que existe el
            header. El mockup pone un círculo de 27px con las iniciales y guarda lo demás detrás de
            un clic: el email y el rol NO se borraron, se muestran adentro del menú, que es donde se
            los va a buscar cuando hacen falta («¿por qué no veo tal pantalla?»). */}
        <div className="ml-auto flex min-w-0 items-center gap-1.5" data-testid="usuario-actual">
          {/* LUPA Y CAMPANITA, EN EL ORDEN DEL MOCKUP y sólo con sesión: sin usuario no hay RLS que
              consultar y las dos devolverían vacío. `gap-1.5` es el `gap:6px` del canónico. */}
          {email && (
            <>
              <BuscadorGlobal />
              <Novedades />
            </>
          )}
          {email ? (
            <MenuUsuario nombre={nombre} email={email} rolLabel={rolLabel} verUsuarios={verUsuarios} salir={salir} />
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

// ═══ LA LUPA Y LA CAMPANITA VOLVIERON, Y CON FUENTE (24/08/2026) ═══
//
// Acá vivía la explicación de por qué NO se dibujaban las dos cosas que el mockup 00 pone a la
// izquierda del avatar. El argumento era correcto y ninguna de las dos volvió por decreto:
//
//   LUPA — decía «no existe búsqueda global en este repositorio». Existía a medias:
//   `entradaService.buscarGlobal` —cliente + persona + proveedor en una tanda, con prueba— estaba
//   escrita desde el 19/08 y sin ninguna puerta en la interfaz; la propia `/administracion` lo
//   declaró el 24/08 al sacarse su buscador de página. Lo que faltaba era el borde, y es
//   `buscadorGlobalActions`. La lupa BUSCA: ver `BuscadorGlobal.tsx`.
//
//   CAMPANITA — decía que el punto rojo no tenía fuente. La tiene, con otro nombre:
//   `chipsDeAtencion` es lo que la home de Administración publica —sin CUIT, sin imputar, sin
//   resolver, duplicados, correcciones—, cada uno con el filtro donde se arregla y recortado por lo
//   que el rol puede abrir. El punto se prende SÓLO con un pendiente medido, nunca mientras espera
//   ni ante un error (`services/novedades.ts` y su prueba). Y no cuelga del primer pintado: se pide
//   después de hidratar, así que los 95 s de pantalla congelada del 19/08 no vuelven por esta vía.
//
// LO QUE SIGUE SIN ESTAR: el mockup dibuja el header en ~44px (marca `padding:9px 0` sobre un
// isotipo de 24px; solapas `padding:13px 12px` sobre 13px). Este header mide 48, que es lo que el
// handoff fijó y lo que `tests/design-v2-conformidad.spec.ts` comprueba en 22 pantallas. No se
// cambia desde acá: es la referencia de la que cuelgan todas, y moverla 4px es una decisión del
// conjunto, no de este archivo.

function MenuUsuario({
  nombre,
  email,
  rolLabel,
  verUsuarios,
  salir,
}: {
  nombre?: string | null
  email: string
  rolLabel: string | null
  verUsuarios: boolean
  salir: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  // Mismo cierre que `ds/MenuContextual`: clic afuera y Escape. Se repite y no se importa porque
  // aquel componente dibuja un `···` de fila y recibe `items` planos — acá el contenido es el
  // `<form>` de logout que renderiza el servidor, que no entra en un `{ label, onClick }`.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        data-testid="avatar-usuario"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`${email}${rolLabel ? ` · ${rolLabel}` : ''} — mi cuenta`}
        title={`${email}${rolLabel ? ` · ${rolLabel}` : ''}`}
        onClick={() => setAbierto((v) => !v)}
        // 27px / radio 14 / #30302F / 10,5px / 600 — medido de los estilos inline del zip
        // (`03 · Obra Tareas.dc.html`). El grafito va en hexadecimal por la misma razón que en
        // `ds/Estado.tsx`: es un valor MEDIDO del mockup, no una decisión que se re-tome acá.
        className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#30302F] text-[10.5px] font-semibold text-white transition-opacity hover:opacity-85"
      >
        {iniciales(nombre, email)}
      </button>
      {abierto && (
        <div
          role="menu"
          data-testid="menu-usuario"
          className="absolute right-0 top-full z-40 mt-1.5 min-w-[220px] rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          {/* La identidad completa, que es lo que el header dejó de escribir. No es un ítem del
              menú: no se clickea, se lee. */}
          <div className="border-b border-line px-3 pb-2 pt-1.5">
            <div className="truncate text-[12px] text-ink">{email}</div>
            {rolLabel && <div className="text-[11.5px] text-faint">{rolLabel}</div>}
          </div>
          <Link
            prefetch={false}
            href="/mi-cuenta"
            role="menuitem"
            data-testid="mi-cuenta"
            onClick={() => setAbierto(false)}
            className="block px-3 py-1.5 text-[13px] text-ink-soft hover:bg-surface-quiet hover:text-ink"
          >
            Mi cuenta
          </Link>
          {/* USUARIOS BAJÓ ACÁ (v2). Estaba en la barra del área, al lado de Clientes, que se toca
              todos los días: administrar cuentas se toca una vez por mes y es configuración, no
              trabajo. La RUTA no cambió y sigue cerrada por `RUTAS_SOLO_ECONOMIA` y por la RLS —
              esto es la puerta, no la cerradura. */}
          {verUsuarios && (
            <Link
              prefetch={false}
              href="/administracion/usuarios"
              role="menuitem"
              data-testid="ir-usuarios"
              onClick={() => setAbierto(false)}
              className="block px-3 py-1.5 text-[13px] text-ink-soft hover:bg-surface-quiet hover:text-ink"
            >
              Usuarios
            </Link>
          )}
          <div className="[&_button]:w-full [&_button]:rounded-none [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-left [&_button]:text-[13px] [&_button]:text-ink-soft [&_button:hover]:bg-surface-quiet">
            {salir}
          </div>
        </div>
      )}
    </div>
  )
}
