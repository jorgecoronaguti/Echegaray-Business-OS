import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { esRutaCampoPermitida, esRutaPublica, type Rol } from '@/features/auth/types'
import {
  destinoDeRebote, entradaDeArea, fichaDeGestionPara, puedeVerRuta, veEconomia,
} from '@/features/auth/types/areas'
import { COOKIE_OBRA, VIDA_OBRA_SEGUNDOS, obraDeCookieValida } from '@/shared/utils/obraRecordada'
import {
  CLAVE_LIMPIAR, cookieDeVista, queryARestaurar,
} from '@/features/obras/services/vistaRecordada'
import { destinoPorRol } from '@/features/portal/types'
import { trazar } from '@/lib/supabase/traza'
import { pareceTelefonoSegun } from '@/shared/utils/dispositivo'
import { rutaTelefonoDeHerramientas } from '@/features/herramientas/logica/rutaTelefono'
import { INICIO_JEFE_ESCRITORIO, caraDeEscritorioDelJefe } from '@/shared/auth/caraDelJefe'
import { TOPE_MS_MIDDLEWARE, esFallaDeBackend, fetchConTope } from '@/lib/supabase/fetch-con-tope'
import { COOKIE_ROL, VIDA_ROL_SEGUNDOS, leerRol, sellarRol, secretoDelRol } from '@/lib/auth/rol-cache'
import {
  COOKIE_VER_COMO, ROL_QUE_MIRA, RUTA_VER_COMO, esPeticionDeEscritura, leerVerComo,
} from '@/lib/auth/ver-como'
import { COOKIE_ENTRAR_COMO, RUTA_ENTRAR_COMO, leerEntrarComo } from '@/lib/auth/entrar-como'
import {
  COOKIE_MFA, RUTA_DOS_PASOS, leerExigeDosPasos, necesitaSegundoPaso, sellarExigeDosPasos,
} from '@/lib/auth/mfa'

// Refresca la sesión de Supabase en cada request -- sin esto, un usuario logueado
// puede quedar con un token vencido en Server Components y verse "deslogueado" sin
// haber cerrado sesión. Patrón estándar de @supabase/ssr para Next.js App Router.
/**
 * ═══ SI SUPABASE NO CONTESTA, LA APP LO DICE EN SEGUNDOS (11/09/2026) ═══
 *
 * El incidente «Unresponsive Projects» dejó Auth y REST mudos durante minutos. Este middleware corre
 * en TODA petición y esperaba sin tope: Vercel cortaba la función a los 25 s y el dueño veía
 * «504 MIDDLEWARE_INVOCATION_TIMEOUT» en cada pantalla, sin saber si era su conexión, Vercel o la
 * base. Ahora cada llamada a Supabase tiene tope (`fetchConTope`) y una falla del backend contesta
 * 503 con una página que dice QUÉ no responde y que no es culpa del que mira. Las rutas públicas
 * (login, estáticos) siguen pasando: no dependen de Supabase para dibujarse.
 */
export async function middleware(request: NextRequest) {
  // HERRAMIENTAS EN EL TELÉFONO ES LA VERSIÓN DE CAMPO (dueño, 23/09/2026: la de escritorio se
  // dibujaba encimada en el celular). Antes de tocar la base: la ruta de escritorio va a su equivalente
  // de `/campo/herramientas`. `?pc=1` deja ver la de escritorio a propósito.
  // Esto sólo alcanza al navegador que SE DECLARA teléfono. El que se presenta como computadora en una
  // pantalla angosta (iPad, «sitio de escritorio») lo resuelve el propio layout de Herramientas por
  // ANCHO (`HerramientasAlTelefono`, 24/09/2026): el servidor no puede saber el ancho.
  if (pareceTelefonoSegun(request.headers) && !request.nextUrl.searchParams.has('pc')) {
    const destino = rutaTelefonoDeHerramientas(request.nextUrl.pathname, request.nextUrl.search)
    if (destino) return NextResponse.redirect(new URL(destino, request.url))
  }
  try {
    return await middlewareConBackend(request)
  } catch (e) {
    if (!esFallaDeBackend(e)) throw e
    if (esRutaPublica(request.nextUrl.pathname)) return NextResponse.next({ request })
    return sinBackend(request)
  }
}

function sinBackend(request: NextRequest): NextResponse {
  const quiereHtml = (request.headers.get('accept') ?? '').includes('text/html') && !request.headers.has('rsc')
  const cuerpo = quiereHtml
    ? `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sin respuesta de la base</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="20">
<style>body{font-family:system-ui,sans-serif;background:#FAFAF8;color:#1c1c1a;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:520px;padding:32px;border:1px solid #E5E4DF;border-radius:12px;background:#fff}h1{font-size:18px;margin:0 0 12px}p{margin:8px 0;line-height:1.45;font-size:14px}small{color:#6b6b68}</style></head>
<body><main><h1>La base de datos no responde</h1>
<p>Supabase, donde viven los datos del OS, no contestó en ${Math.round(TOPE_MS_MIDDLEWARE / 1000)} segundos. No es tu conexión ni la aplicación: es el proveedor.</p>
<p>Esta página se vuelve a intentar sola cada 20 segundos. El estado del proveedor está en <a href="https://status.supabase.com">status.supabase.com</a>.</p>
<small>Echegaray Business OS · ${new Date().toISOString()}</small></main></body></html>`
    : 'Supabase no responde'
  return new NextResponse(cuerpo, {
    status: 503,
    headers: { 'content-type': quiereHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'retry-after': '20', 'cache-control': 'no-store' },
  })
}

async function middlewareConBackend(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // TODA llamada a Supabase desde acá tiene tope: sin él, el middleware es el primero en colgarse.
      global: { fetch: fetchConTope(TOPE_MS_MIDDLEWARE, trazar() ?? fetch) },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // ═══ LA FIRMA SE VERIFICA ACÁ, NO EN SÃO PAULO (25/08/2026) ═══
  //
  // Acá había `auth.getUser()`, que manda un GET a `/auth/v1/user` y espera la respuesta ANTES de
  // dejar pasar el request. Medido contra el Supabase real desde esta VM, mediana de 5 corridas:
  // 76 ms. Y no se paga una vez por pantalla: el matcher cubre el documento, cada payload RSC y
  // cada Server Action. Una sola visita a `/documentos` disparaba 77 pasadas por este archivo
  // (medido el 25/08 con el middleware instrumentado) — 77 × 76 ms de espera pura.
  //
  // El proyecto firma sus JWT con clave ASIMÉTRICA (`alg: ES256`, `kid` presente, JWKS público en
  // `/auth/v1/.well-known/jwks.json` — comprobado el 25/08 decodificando un token real). Con eso,
  // `getClaims()` verifica la firma con WebCrypto contra la clave pública, en el proceso, y sólo sale
  // a la red la primera vez de cada instancia para traer el JWKS: `GLOBAL_JWKS` de auth-js vive en
  // el módulo y lo comparten todos los clientes del mismo proceso.
  //
  // NO ES UNA PUERTA MÁS FLOJA. `getClaims()` rechaza un token con firma inválida
  // (`AuthInvalidJwtError`) y uno vencido (`validateExp`), y si el proyecto volviera a firmar con
  // HS256 la propia librería se cae a `getUser()` sola. Lo que cambia es CUÁNDO se entera de una
  // sesión cerrada a mano: hasta que venza el access token (~1 h) en vez de al instante. Eso ya era
  // así para los datos —PostgREST también valida la firma localmente y nunca le pregunta al servidor
  // de Auth—, así que la ventana no la abre este cambio: la tenía la cerradura, no la puerta. El
  // refresh token sí queda invalidado al instante por `signOut({ scope: 'global' })`.
  const { data: sesion } = await supabase.auth.getClaims()
  const user = sesion?.claims ? { id: sesion.claims.sub } : null
  const pathname = request.nextUrl.pathname

  // ── SIN SESIÓN NO SE VE NADA. Es lo primero que se decide, antes que cualquier rol.
  // Hasta el 17/08/2026 esto no existía y `/flujo-caja` respondía 200 a un anónimo con los
  // importes y los nombres de los clientes: esa ruta no pasa por Supabase, lee el Sheet con una
  // service account desde el servidor, así que el RLS —que tapaba al resto— no la cubría.
  // Se guarda a dónde iba para devolverlo ahí después de entrar.
  // ── EL CLIENTE NO SALE DEL PORTAL (dueño, 24/09/2026: «no quiero que haciendo para atrás el cliente
  // acceda a toda la plataforma de gestión»). Quien trae la cookie del portal y NO tiene sesión del OS
  // es un cliente: cualquier ruta de gestión —el login del OS incluido— lo devuelve a su portal. Un
  // empleado que comparte el aparato sale primero del portal (`/portal/salir` borra la cookie).
  // Los archivos estáticos (`/marca/isotipo.png`) y la API siguen su camino.
  if (!user && request.cookies.has('portal_sesion') && !pathname.startsWith('/portal')
    && !pathname.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/portal'
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (!user && !esRutaPublica(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // EL VOLVER LLEVA LA QUERY ENTERA (24/09/2026). Antes guardaba sólo el path y los parámetros de la
    // ruta quedaban sueltos en /login: el enlace de firma del efectivo
    // (`/mi-informacion/efectivo/firmar?entrega=<id>`) volvía después de entrar SIN la entrega, y la
    // pantalla no sabía qué firmar — «no guarda las firmas, no reconoce», dueño.
    url.search = ''
    url.searchParams.set('volver', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // RBAC de campo: un empleado (rol 'campo') solo puede ver las rutas de su perfil y las
  // operativas. Si intenta entrar a cualquier otra (caja, reportes, dirección…), lo mandamos a
  // «Hoy», que desde el 20/08/2026 es su pantalla de inicio: es la que contesta las tres preguntas
  // con las que abre el OS —dónde trabajo, qué tengo que hacer, tengo algo pendiente—.
  // `/signup` salió de la condición el 27/08/2026 junto con la ruta: el alta libre se fue y la
  // gobernada vive en `/administracion/usuarios`, que SÍ pasa por el portero de abajo.
  const esApiOAuth = pathname.startsWith('/api') || pathname.startsWith('/login')
  if (user && !esApiOAuth) {
    // ═══ EL ROL SE LEE UNA VEZ Y VIAJA FIRMADO (07/09/2026) ═══
    //
    // Acá había un `from('perfiles')` por request: documento, cada payload RSC y cada prefetch pagaban
    // un viaje serial a Postgres (~120 ms desde Vercel) antes de que la página arrancara. Ahora el rol
    // viene de una cookie httpOnly firmada y atada al `sub`; sólo se va a la base cuando la cookie no
    // está, venció o no cierra — y en ese caso se vuelve a sellar. El porqué entero y la regla de
    // seguridad («la puerta, no la cerradura») están en lib/auth/rol-cache.ts.
    const secreto = secretoDelRol()

    // ═══ «ENTRAR COMO» PASA SIEMPRE, Y ANTES QUE TODO (23/09/2026) ═══
    //
    // Es la ruta que abre la sesión real de otro usuario y la que la devuelve. Tiene que poder
    // tocarse desde cualquier rol (el que vuelve es el rol PRESTADO, que puede ser `campo`), con la
    // lente puesta (entrar la apaga) y con una sesión `aal1` (volver a Dirección se hace por enlace
    // mágico y Dirección pone su código después). La ruta misma comprueba contra `perfiles` quién
    // puede entrar; acá sólo se la deja pasar. Ver `lib/auth/entrar-como.ts`.
    if (pathname === RUTA_ENTRAR_COMO) return response
    // La sesión prestada, si ésta lo es: la franja la dibuja el layout; acá sólo exime del segundo
    // paso (la sesión se abrió por enlace mágico, no hay código que pedirle a Dirección por el otro).
    const prestada = secreto
      ? await leerEntrarComo(request.cookies.get(COOKIE_ENTRAR_COMO)?.value, { uidSesion: user.id }, secreto)
      : null

    // ═══ LOS DOS PASOS SE EXIGEN EN LA PUERTA (23/09/2026) ═══
    //
    // Una sesión `aal1` de una cuenta que tiene TOTP verificado no ve ninguna pantalla hasta poner el
    // código: se la manda a `/login/dos-pasos`. Si esto no estuviera acá, activar los dos pasos sería
    // decorativo — quien tiene la contraseña entraría igual con sólo no pasar por esa pantalla. Si la
    // cuenta exige o no el segundo paso viaja en una cookie firmada (5 minutos) y se pregunta al
    // servidor de Auth cuando no está: un viaje cada cinco minutos por sesión sin segundo factor.
    // `/ver-como` sigue pasando (apagar la lente siempre se puede); las rutas públicas y `/login/*`
    // no llegan a este bloque.
    const aal = sesion?.claims?.aal
    if (secreto && aal !== 'aal2' && !prestada && pathname !== RUTA_VER_COMO) {
      let exige = await leerExigeDosPasos(request.cookies.get(COOKIE_MFA)?.value, user.id, secreto)
      if (exige === null) {
        const { data: factores, error } = await supabase.auth.mfa.listFactors()
        if (!error) {
          exige = factores.totp.some((f) => f.status === 'verified') ? 'si' : 'no'
          response.cookies.set(COOKIE_MFA, await sellarExigeDosPasos(user.id, exige, secreto), {
            httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VIDA_ROL_SEGUNDOS,
          })
        }
      }
      if (necesitaSegundoPaso(aal, exige)) {
        const url = request.nextUrl.clone()
        url.pathname = RUTA_DOS_PASOS
        url.search = ''
        url.searchParams.set('volver', pathname + request.nextUrl.search)
        return NextResponse.redirect(url)
      }
    }

    let rol = secreto ? await leerRol(request.cookies.get(COOKIE_ROL)?.value, { uid: user.id }, secreto) : null
    if (rol === null) {
      const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
      rol = perfil?.rol ?? null
      if (rol && secreto) {
        response.cookies.set(COOKIE_ROL, await sellarRol({ uid: user.id, rol }, secreto), {
          httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VIDA_ROL_SEGUNDOS,
        })
      }
    }
    // ═══ «VER COMO»: LA LENTE DE DIRECCIÓN (22/09/2026) ═══
    //
    // El dueño pidió mirar la app con los ojos de cada rol sin dar de alta usuarios de prueba. Acá
    // se decide lo único que se puede decidir en la puerta, y son tres cosas, en este orden:
    //
    //   1. LA LENTE ES SÓLO DE DIRECCIÓN. Se compara contra el rol REAL —el que salió de `perfiles`
    //      o de la cookie que `perfiles` selló—, nunca contra la lente misma. Si quien la tiene
    //      puesta dejó de ser Dirección, la cookie se borra en este mismo request.
    //   2. CON LA LENTE PUESTA NO SE ESCRIBE. Ni como el rol imitado (sería suplantación) ni como
    //      uno mismo (nadie tiene que averiguar después con qué firma quedó lo que cargó). Se corta
    //      por MÉTODO y no por ruta: un Server Action de Next viaja como POST al path de la
    //      pantalla, así que la URL no lo delata y el método sí.
    //   3. `/ver-como` PASA SIEMPRE. Es la ruta que prende y apaga la lente, y apagarla tiene que
    //      funcionar aunque el rol mirado sea `campo` —que abajo se va derecho a `/hoy`—.
    //
    // A partir de acá el rol que gobierna las redirecciones es el MIRADO: es lo que hace que la
    // lente mueva la navegación de verdad y no sólo los colores.
    //
    // ESTO NO PRUEBA PERMISOS. La base sigue viendo al usuario real (`es_administracion()`,
    // `ve_economia()`, `ve_obra()`, `mi_persona_id()`): la lente cambia la puerta, no la cerradura.
    let mirando = secreto && rol
      ? await leerVerComo(request.cookies.get(COOKIE_VER_COMO)?.value, { uid: user.id }, secreto)
      : null
    if (mirando && rol !== ROL_QUE_MIRA) {
      response.cookies.delete(COOKIE_VER_COMO)
      mirando = null
    }
    // `/ver-como` PASA ANTES del corte de escrituras: apagar la lente es un POST (23/09/2026) y con
    // el corte primero el «Salir del modo» recibía 403 y la franja quedaba pegada para siempre.
    if (pathname === RUTA_VER_COMO || pathname.startsWith(RUTA_VER_COMO + '/')) return response
    if (mirando && esPeticionDeEscritura(request.method)) {
      return new NextResponse(
        'Estás mirando la aplicación como otro rol («ver como»). Con la lente puesta no se escribe: ni con la identidad imitada ni con la propia. Salí del modo y repetí la acción.',
        { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } },
      )
    }

    // El rol viene de la base o de la cookie que la base selló: la forma la garantiza `perfiles`.
    const perfil = mirando ? { rol: mirando as Rol } : rol ? { rol: rol as Rol } : null

    // ═══ EL PORTAL DEL CLIENTE SE DECIDE PRIMERO (25/08/2026) ═══
    //
    // Antes que el RBAC de campo y antes que las áreas, porque `cliente` no es un empleado con menos
    // permisos: es alguien de OTRA empresa. Las reglas de abajo están escritas para gente de adentro
    // y ninguna de ellas contempla que el usuario no lo sea — un cliente que cayera en la rama de
    // `puedeVerRuta` pasaría a `/obras` en vez de a su portal.
    //
    // El confinamiento es en las DOS direcciones y la segunda suele olvidarse: nadie de adentro
    // entra a `/portal`. Ahí las consultas filtran por `cliente_de_sesion()`, que para un empleado
    // devuelve NULL: vería la pantalla vacía y concluiría que el cliente no tiene nada cargado.
    //
    // ESTO ES LA PUERTA, NO LA CERRADURA. Una llamada directa a PostgREST no pasa por acá: eso lo
    // decide el RLS (`es_cliente()` + `cliente_de_sesion()` en Postgres).
    // La cookie de la vista previa: si está, quien mira ya pasó por la puerta que comprueba la
    // sesión del OS y el permiso económico. Acá sólo se mira que exista.
    const destino = destinoPorRol(perfil?.rol, pathname, request.cookies.has('portal_sesion'))
    if (destino) {
      const url = request.nextUrl.clone()
      url.pathname = destino
      url.search = ''
      return NextResponse.redirect(url)
    }

    // ── EL OPERARIO NO SALE A LAS COPIAS DE ESCRITORIO DE LO SUYO (dueño, 24/09/2026).
    //
    // `/mi-cuenta/horas`, `/legajo` y `/documentos` son la versión de escritorio de pantallas que el
    // operario ya tiene en su app (`/mi-informacion/*`, con su barra). Abiertas desde el teléfono lo
    // dejaban en un header de escritorio y sin barra. `/mi-cuenta` a secas (foto, contacto) y
    // `/seguridad` (contraseña) NO tienen copia en su app: se quedan, con su barra abajo.
    if (perfil?.rol === 'campo') {
      const suya = /^\/mi-cuenta\/(horas|legajo|documentos)(\/.*)?$/.exec(pathname)
      if (suya) return NextResponse.redirect(new URL(`/mi-informacion/${suya[1]}${suya[2] ?? ''}`, request.url))
    }

    if (perfil?.rol === 'campo' && !esRutaCampoPermitida(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/hoy'
      return NextResponse.redirect(url)
    }

    // ── `/administracion` ES CLIENTES, Y SE RESUELVE ACÁ PARA QUE SEA UN 307 DE VERDAD.
    //
    // Va DESPUÉS de `destinoPorRol` y del corte de `campo`: el cliente tiene que terminar en el
    // portal y el nivel campo en `/hoy`, no en Clientes. Y va ANTES de `puedeVerRuta`, que para esta
    // ruta devuelve true para todos los roles de adentro — preguntarle primero no cambia a nadie.
    //
    // El porqué completo, con la medición del meta refresh de 1 s que esto reemplaza, en
    // `features/auth/types/areas.ts · ENTRADA_DE_ADMINISTRACION`.
    const entrada = entradaDeArea(pathname, perfil?.rol)
    if (entrada) {
      const url = request.nextUrl.clone()
      url.pathname = entrada
      // La query se descarta igual que la descartaba el `redirect()` del `page.tsx`: los criterios de
      // `/administracion` no son los de `/clientes`, y arrastrarlos sería filtrar la pantalla de
      // destino con parámetros que no entiende.
      url.search = ''
      return NextResponse.redirect(url)
    }
    // ── DIRECCIÓN Y ADMINISTRACIÓN NO USAN EL PRODUCTO DEL JEFE (dueño, 24/09/2026).
    //
    // `/obra/*` (J01–J06) es la pantalla del jefe: quien administra llegaba por un enlace y quedaba con
    // la barra del jefe y una obra elegida por orden alfabético. Va a la ficha de esa obra. Con la lente
    // «ver como» puesta sí entra: para eso existe la lente. Se mira el rol REAL, no el mirado.
    if (!mirando && veEconomia(rol as Rol | null)) {
      const ficha = fichaDeGestionPara(pathname, request.nextUrl.searchParams.get('obra'))
      if (ficha) return NextResponse.redirect(new URL(ficha, request.url))
    }

    // ── EL JEFE EN LA COMPUTADORA VE LA CARA DE COMPUTADORA (dueño, 25/09/2026).
    //
    // «El jefe en la PC entra a su pantalla de teléfono. Tiene que tener un diseño de computadora».
    // Su inicio sigue siendo `/obra/hoy` en cualquier aparato (regla del 24/09); lo que el aparato
    // elige es la CARA: si el navegador no se declara teléfono, cada pantalla de `/obra/*` (y lo que se
    // mira y firma de su efectivo) va a su par de escritorio. Sólo GET: un Server Action no se desvía.
    // Con la lente «ver como» puesta vale lo mismo: Dirección ve lo que ve el jefe en ese aparato.
    const jefeEnPc = perfil?.rol === 'jefe_obra' && !pareceTelefonoSegun(request.headers)
    if (jefeEnPc && request.method === 'GET') {
      const cara = caraDeEscritorioDelJefe(
        pathname, request.nextUrl.searchParams, obraDeCookieValida(request.cookies.get(COOKIE_OBRA)?.value),
      )
      if (cara) return NextResponse.redirect(new URL(cara, request.url))
    }

    // ── EL NIVEL «OBRAS» NO ENTRA A LO DE ADMINISTRACIÓN (18/08/2026).
    //
    // Dos niveles y sólo dos: Administración (dirección + administración) ve todo; Obras (jefe de
    // obra + campo) trabaja sus obras y no ve clientes, economía global ni finanzas. Ver
    // `features/auth/types/areas.ts`.
    //
    // ESTO ES LA PUERTA, NO LA CERRADURA. Una llamada directa a PostgREST no pasa por acá: eso lo
    // decide el RLS, que filtra por `ve_obra()` en la base. Las dos capas hacen falta — el
    // middleware evita que una pantalla se dibuje vacía y desconcertante; el RLS evita que los datos
    // salgan del servidor. Redirigir sin RLS sería seguridad cosmética.
    if (!puedeVerRuta(perfil?.rol, pathname)) {
      // /presupuestos YA NO PASA (dueño, 24/09/2026): el jefe no entra a Presupuestos, igual que al resto
      // de lo cerrado.
      // EL REBOTE VA AL INICIO DEL NIVEL, NO A `/obras` (24/09/2026). Para el jefe `/obras` era el
      // «listado gigante» de la queja del dueño: la cartera entera, con las archivadas si alguna vez las
      // había pedido. Ahora vuelve a su obra (`destinoDeRebote`).
      const url = request.nextUrl.clone()
      // En la PC el jefe rebota directo a su portada de escritorio: sin el salto intermedio por J01.
      url.pathname = jefeEnPc ? INICIO_JEFE_ESCRITORIO : destinoDeRebote(perfil?.rol)
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // ═══ LA VISTA DE OBRAS SE ABRE COMO LA DEJÉ (19/08/2026) ═══
  //
  // El dueño: *"que guarden cuál fue el último filtrado que hice según la columna para que me la
  // muestre de esa manera y no tener que estar poniendo nuevamente cómo quiero verlo"*.
  //
  // ACÁ SÓLO SE RESTAURA. Guardar lo hace el navegador (`components/RecordarVista.tsx`) porque el
  // servidor no puede distinguir una precarga de Next de una navegación real —lo intentamos por
  // cabeceras y se filtraba igual—, y el navegador sí: una precarga trae bytes y no monta nada.
  //
  // Restaurar sigue acá porque la redirección ocurre ANTES de que se dibuje nada: no hay una
  // pintura con el orden equivocado que después se corrige sola.
  const cookieVista = user && request.method === 'GET' ? cookieDeVista(pathname) : null
  if (cookieVista) {
    const params = request.nextUrl.searchParams
    if (params.has(CLAVE_LIMPIAR)) {
      // Volver al estado de fábrica: se olvida y se abre limpia. La cookie se borra ACÁ y no en la
      // pantalla, porque si sobreviviera un instante la redirección la volvería a aplicar.
      const url = request.nextUrl.clone()
      url.search = ''
      const limpia = NextResponse.redirect(url)
      // EL `path` NO SOBRA: la cookie vive en `/obras`, y borrarla sin decirlo borra otra —la de
      // `path: '/'`, que no existe—, así que la preferencia sobrevivía al "quitar filtros".
      limpia.cookies.delete({ name: cookieVista, path: '/obras' })
      return limpia
    }
    const guardada = request.cookies.get(cookieVista)?.value ?? null
    const restaurar = queryARestaurar(params, guardada)
    if (restaurar) {
      const url = request.nextUrl.clone()
      url.search = restaurar
      return NextResponse.redirect(url)
    }
  }

  // ═══ LA OBRA QUE EL JEFE ESTÁ MIRANDO SE RECUERDA (dueño, 24/09/2026) ═══
  //
  // La obra viaja en `?obra=` y se perdía en cuanto el jefe tocaba algo que no la llevaba —la barra
  // en Personal, el logo, la flecha de Trabajo, «Mi obra» del menú—: volvía a «Hoy» con la primera
  // obra del orden alfabético, vacía, y eso se leía como «se rompió». Cada vez que una pantalla de su
  // producto se abre CON obra, se guarda; `contextoDeObra` la usa cuando la URL no trae ninguna.
  // Se guarda en la respuesta de la misma petición: sirve para el documento y para la navegación RSC.
  // Sólo en `/obra/*`: es donde el jefe ELIGE; Dirección y Administración no llegan ahí sin la lente.
  // NO es httpOnly a propósito: es un id de obra, no una credencial, y las barras del navegador la leen
  // para que sus enlaces a `/obra/*` la lleven (ver `conObraRecordada`).
  if (user && request.method === 'GET' && pathname.startsWith('/obra/')) {
    const obra = obraDeCookieValida(request.nextUrl.searchParams.get('obra'))
    if (obra && request.cookies.get(COOKIE_OBRA)?.value !== obra) {
      response.cookies.set(COOKIE_OBRA, obra, {
        httpOnly: false, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VIDA_OBRA_SEGUNDOS,
      })
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
