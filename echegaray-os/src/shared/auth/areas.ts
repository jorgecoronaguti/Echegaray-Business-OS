// LOS DOS NIVELES DE USUARIO DEL ERP — y nada más.
//
// El dueño (18/08), textual: *"DOS NIVELES DE USUARIO. Sólo: ADMINISTRACIÓN / OBRAS"* ·
// *"No crear más niveles de usuario"*.
//
// ═══ POR QUÉ NO SE CREAN ROLES NUEVOS ═══
//
// `perfiles.rol` ya tiene cuatro valores en producción (`direccion`, `administracion`, `jefe_obra`,
// `campo`) con usuarios reales colgando de ellos y policies de RLS escritas contra esos literales.
// Agregar dos valores más significaría migrar los cuatro, reescribir cada policy y quedarse con seis
// nombres para dos ideas. Lo que hacía falta no era un rol: era la AGRUPACIÓN, que es esto.
//
// La granularidad futura tampoco pide roles nuevos: pide filas en `usuario_obra`. El nivel dice QUÉ
// PUEDE HACER; la asignación dice SOBRE QUÉ OBRAS. Son dos ejes y se mantienen separados a propósito.

import type { Rol } from './identidad.ts'

/** Las dos áreas de producto. Son las dos únicas entradas de la navegación global. */
export type Area = 'administracion' | 'obras'

/**
 * ═══ DOS PREGUNTAS QUE HASTA HOY ERAN UNA (19/08/2026) ═══
 *
 * El dueño: *"quiero que los usuarios con permisos de «jefe de obra» pueda acceder a administracion,
 * solo no quiero que vean los montos de venta de las obras"* y, precisando: *"los costos de las obras
 * que se han estipulado en la cotización… y lo que se lleva gastado, sí tienen que ver"*.
 *
 * `esAdministracion()` respondía a la vez «¿administra los maestros?» y «¿ve cuánto se vendió?»,
 * porque hasta hoy eran la misma gente. Se parte en dos, y la línea es COSTO / PRECIO:
 *
 *   `esAdministracion()`  administra personas, legajos, cuadrillas, clientes y proveedores, y ve el
 *                         COSTO de su obra —el presupuestado y el gastado—. Incluye al jefe de obra.
 *   `veEconomia()`        ve el PRECIO: contratado, monto presupuestado, margen, certificado,
 *                         facturado, cobrado. Y administra usuarios, que es la puerta a todo eso.
 *
 * Los dos fallan cerrado: un rol desconocido, o un usuario sin perfil, no es ninguna de las dos
 * cosas. El modo de fallar de un default permisivo es publicar lo que se vendió cada obra.
 *
 * ESTO ES LA PUERTA, NO LA CERRADURA. La base decide qué filas y qué columnas devuelve —
 * `es_administracion()` y `ve_economia()` en Postgres— y eso vale también para una llamada directa a
 * PostgREST que no pasa por ninguna ruta de Next.
 */
export function areaDe(rol: Rol | null | undefined): Area {
  return rol === 'direccion' || rol === 'administracion' || rol === 'jefe_obra'
    ? 'administracion'
    : 'obras'
}

/** ¿Administra los maestros y ve el COSTO de su obra? Dirección, Administración y Jefe de Obra. */
export const esAdministracion = (rol: Rol | null | undefined) => areaDe(rol) === 'administracion'

/**
 * ¿Ve el PRECIO? Cuánto se contrató, cuánto se presupuestó, el margen y lo certificado.
 *
 * También gobierna el alta de usuarios y el cambio de rol: si un jefe de obra pudiera ascender a
 * alguien —o ascenderse—, todo lo de arriba sería decorativo.
 */
export const veEconomia = (rol: Rol | null | undefined) =>
  rol === 'direccion' || rol === 'administracion'

/**
 * QUIÉN ENTRA A LIQUIDACIÓN DE HORAS. Dueño, 09/09/2026: *«sólo con nivel de usuario
 * administrador»*.
 *
 * Hoy devuelve el mismo conjunto que `veEconomia`, y aun así es una función aparte: `veEconomia`
 * gobierna la plata de las OBRAS, y el día que alguien la abra a un rol más —un cliente que mira su
 * certificado, un rol nuevo de compras— los sueldos del plantel se abrirían con ella sin que nadie
 * lo decida. Su gemela en Postgres es `public.liquida_sueldos()`, y por el mismo motivo tampoco es
 * `ve_economia()`.
 *
 * JEFE DE OBRA NO. `esAdministracion` lo incluye desde el 19/08/2026 y entra a esta misma pantalla
 * a cargar asistencia: usar esa función acá le abriría los sueldos de todos.
 */
export const liquidaSueldos = (rol: Rol | null | undefined) =>
  rol === 'direccion' || rol === 'administracion'

/**
 * LAS ÁREAS QUE VE UN ROL EN LA NAVEGACIÓN GLOBAL.
 *
 * Administración ve las dos —necesita entrar a una obra igual que un jefe—; el nivel Obras ve una
 * sola, y por eso su navegación no dibuja una barra de un solo elemento: dibuja el nombre del área.
 */
export function areasDe(rol: Rol | null | undefined): Area[] {
  return esAdministracion(rol) ? ['administracion', 'obras'] : ['obras']
}

export const AREA_LABEL: Record<Area, string> = {
  administracion: 'Administración',
  obras: 'Obras',
}

export const AREA_HREF: Record<Area, string> = {
  administracion: '/administracion',
  obras: '/obras',
}

// ═══ A DÓNDE VA `/administracion`, Y POR QUÉ LA DECISIÓN VIVE ACÁ Y NO EN SU `page.tsx` ═══
//
// `/administracion` no dibuja nada desde el 09/09/2026: la entrada del área ES la sección Clientes
// (ver el encabezado de `src/app/(main)/administracion/page.tsx`). Eso se resolvía con un
// `redirect('/clientes')` dentro del Server Component, y ahí estaba el defecto medido el 12/09/2026.
//
// LO MEDIDO. `(main)/layout.tsx` es SÍNCRONO y cuelga el header de un `<Suspense>` a propósito: el
// documento sale por streaming y el navegador pinta el marco antes de saber quién entró. Consecuencia
// mecánica: cuando el `page.tsx` llama a `redirect()`, los encabezados YA se mandaron, así que Next
// no puede contestar un 307 y se cae a su plan B — mete en el HTML
// `<meta http-equiv="refresh" content="1;url=/clientes">`. Comprobado leyendo el documento real de
// producción, y la traza de consultas lo muestra como un hueco de 1.046 ms entre el último viaje del
// documento de `/administracion` y el primero de `/clientes`:
//
//   perfiles            0 →   93 ms     ← el documento de /administracion, que no dibuja nada
//   (nada)             93 → 1139 ms     ← UN SEGUNDO de meta refresh
//   pantalla_clientes 1139 → 1781 ms    ← el documento de /clientes, el que sí sirve
//
// O sea: un documento entero de 20 kB con sus 13 chunks de JavaScript y su hidratación, más un
// segundo de pantalla quieta, para llegar a donde el usuario iba. El aterrizaje de ingreso de
// dirección, administración y jefe de obra es ESTA ruta: se paga todos los días, en cada entrada.
//
// EL ARREGLO ES DE MOMENTO, NO DE DESTINO: la misma redirección, decidida en el middleware —que corre
// ANTES de que exista un byte de respuesta— es un 307 de verdad. El `page.tsx` se queda como red: si
// el middleware alguna vez no corriera, la ruta sigue llegando a Clientes en vez de dar 404. Las dos
// capas leen ESTA constante, así que el destino está escrito una sola vez.
export const ENTRADA_DE_ADMINISTRACION = '/clientes'

/**
 * J01: la raíz del jefe de obra. Vive acá —y no en `features/jefe` ni en `features/auth`— porque la
 * usan las dos y una feature no importa de otra.
 *
 * El nombre dice «teléfono» por historia: del 23/09 al 24/09/2026 fue el inicio del jefe SÓLO cuando
 * el aparato se detectaba como teléfono. Desde el 24/09/2026 es su inicio en cualquier aparato (el
 * dueño: «el inicio no depende de la detección del aparato»; un iPad o el «sitio de escritorio» del
 * iPhone mandaban al jefe a Personal y al dueño a Clientes). Se conserva el nombre para no mover los
 * trece lugares que ya lo importan.
 */
export const INICIO_JEFE_TELEFONO = '/obra/hoy'

/**
 * ═══ LO QUE EL JEFE DE OBRA YA NO ABRE (dueño, 24/09/2026) ═══
 *
 * Textual, aprobando el mapa del teléfono: el jefe «deja de tener acciones de Administración en la
 * app» —Nueva obra, Reactivar, Gantt, Más, Fuentes— y «se retira /campo para el jefe: todo queda en
 * su Hoy (J01)». Conserva Personal (Plantel, Horas, Cargar asistencia; sin Liquidación) y su efectivo.
 *
 * NO son rutas del dinero —Dirección y Administración las siguen abriendo, y el jefe no ve precio en
 * ninguna—: son las que duplicaban su «Hoy» o le daban una cartera que no es suya. Por eso es una lista
 * aparte de `RUTAS_SOLO_ECONOMIA` y no se mezcla con ella.
 *
 *   EXACTAS  `/obras` (la cartera; la FICHA `/obras/<obra>` sigue abierta: ahí se arma la
 *            planificación de su obra, que J01 no edita) y `/campo` (el hub «Trabajo»; sus pantallas
 *            `/campo/material`, `/campo/impedimento`, `/campo/herramientas` son las que cuelgan de J01).
 *   PREFIJO  el Gantt de la cartera, el alta de obra, «Más», «Fuentes» y el día del operario
 *            (`/hoy`, `/mi-trabajo`), que el jefe abría y le cambiaba la barra por la del empleado.
 */
export const RUTAS_CERRADAS_AL_JEFE_EXACTAS = ['/obras', '/campo'] as const
export const RUTAS_CERRADAS_AL_JEFE = [
  '/obras/gantt', '/obras/nueva', '/mas', '/integraciones', '/hoy', '/mi-trabajo',
] as const

function cerradaAlJefe(pathname: string): boolean {
  if ((RUTAS_CERRADAS_AL_JEFE_EXACTAS as readonly string[]).includes(pathname)) return true
  return RUTAS_CERRADAS_AL_JEFE.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

/**
 * A DÓNDE REBOTA QUIEN ABRE UNA RUTA QUE NO ES DE SU NIVEL.
 *
 * Hasta el 24/09/2026 era `/obras` para todos, y para el jefe eso era el «listado gigante»: la cartera
 * entera de escritorio —con las archivadas, si alguna vez las había pedido— cada vez que tocaba
 * Clientes, Compras o un enlace viejo. Ahora rebota a SU inicio, que es su obra.
 */
export function destinoDeRebote(rol: Rol | null | undefined): string {
  return rol === 'jefe_obra' ? INICIO_JEFE_TELEFONO : AREA_HREF.obras
}

/**
 * DIRECCIÓN Y ADMINISTRACIÓN EN `/obra/*` SIN «VER COMO» (dueño, 24/09/2026).
 *
 * `/obra/*` es el producto del jefe (J01–J06). Quien administra llegaba ahí por un enlace y quedaba con
 * la barra del jefe y la obra que el orden alfabético elegía. Va a la ficha de esa obra, que es su
 * pantalla; el parte masivo, al parte de la ficha. Sin obra en la URL, a la cartera.
 *
 * `null` si la ruta no es del jefe.
 */
export function fichaDeGestionPara(pathname: string, obra: string | null | undefined): string | null {
  if (pathname !== '/obra' && !pathname.startsWith('/obra/')) return null
  const id = (obra ?? '').trim()
  if (!id || !/^[a-z0-9][a-z0-9-]{0,99}$/i.test(id)) return AREA_HREF.obras
  const base = `${AREA_HREF.obras}/${encodeURIComponent(id)}`
  if (pathname.startsWith('/obra/avance-masivo')) return `${base}?vista=tareas&sub=parte`
  return base
}

/** La ruta a la que `/administracion` manda, o `null` si esta ruta no es la entrada del área. Se
 *  compara el path EXACTO: `/administracion/compras` es una pantalla de verdad y no se toca. */
export function entradaDeArea(pathname: string, rol?: Rol | null): string | null {
  if (pathname !== AREA_HREF.administracion) return null
  // Clientes es sólo de Dirección y Administración (dueño, 24/09/2026): el jefe de obra entra por Personal.
  return veEconomia(rol) ? ENTRADA_DE_ADMINISTRACION : ENTRADA_DE_ADMINISTRACION_SIN_CLIENTES
}

/** Donde entra a Administración quien no ve Clientes (jefe de obra). */
export const ENTRADA_DE_ADMINISTRACION_SIN_CLIENTES = '/administracion/personas'

/**
 * ═══ LAS RUTAS QUE EL NIVEL «OBRAS» NO PUEDE ABRIR ═══
 *
 * Es una lista NEGRA a propósito, y es la excepción a la regla del guard de sesión (que es blanca).
 * Motivo: acá el default correcto es PERMITIR —el jefe de obra tiene que poder trabajar— y lo que se
 * cierra es lo sensible, que es una lista corta y conocida. En el guard de sesión el default correcto
 * es NEGAR, porque lo que se protege es todo.
 *
 * NO reemplaza al RLS: la base decide qué filas devuelve, y eso vale también para una llamada directa
 * a PostgREST que no pasa por ninguna ruta de Next. Esto es la puerta; el RLS es la cerradura.
 */
/**
 * LAS RUTAS DEL DINERO. Las únicas que el jefe de obra no abre.
 *
 * `/administracion` y `/clientes` SALIERON de esta lista: el jefe de obra entra a administrar
 * personas, legajos, cuadrillas, clientes y proveedores. Lo que no ve son los montos de venta, y eso
 * lo cierran los grants de columna y `ve_economia()` en la base, no una lista de rutas.
 *
 * `/administracion/usuarios` SÍ queda cerrada, y no por económica: es la puerta a cambiar roles.
 */
export const RUTAS_SOLO_ECONOMIA = [
  '/administracion/usuarios', '/calendario-financiero',
  '/reportes', '/aprobaciones',
  // CUATRO SALIERON DE ACÁ PORQUE SALIERON DEL REPOSITORIO (27/08/2026):
  // `/ingenieria-financiera` (superconjunto de `/calendario-financiero`), `/calendario-caja`,
  // `/scorecard-finanzas` y `/operarios` (reemplazada por `/administracion/usuarios`). Ninguna
  // estaba enlazada desde ningún lado. Una entrada acá para una ruta que no existe hace creer que
  // hay una puerta cerrada donde no hay ninguna puerta, y el próximo que busque dónde se decide ese
  // acceso va a mirar acá.
  // `/presupuestos` entra el 21/08/2026 con el módulo. Un presupuesto ES precio: costo unitario,
  // margen, cascada y precio de venta. La base ya lo cierra —`cotizaciones_select` exige
  // `ve_economia()`— y esta lista es lo que hace que el jefe de obra ni siquiera vea la solapa.
  // Sin ella la pantalla sería más ancha que la base: un botón que lleva a «no hay nada».
  '/presupuestos',
  // `/administracion/impuestos` entra el 16/09/2026 con la pantalla: IVA, IIBB, F931, saldos a favor.
  // Las tablas ya lo cierran con `ve_economia()` (20260916T2000); esto evita la solapa que lleva a nada.
  '/administracion/impuestos',
  // `/analiticas` entra el 17/09/2026 con el módulo: gasto contra contrato, caja, nómina y cobranza de
  // toda la cartera. La puerta de datos (`analiticas_costos`) ya devuelve null sin `ve_economia()`.
  '/analiticas',
  // `/documentos` entra el 21/08/2026 con la vista transversal del archivo. Las tres carpetas raíz
  // del índice de Drive son `administracion`, `archivo-fiscal` y `libro-sueldos`: la lista incluye
  // presupuestos de clientes, declaraciones juradas y libros de sueldos.
  //
  // LA CERRADURA YA ESTÁ PUESTA (21/08/2026, migración 5100). Hasta ese día esta línea decía que la
  // puerta no tenía cerradura detrás: `drive_index` era `using (true)` y cualquiera con sesión le
  // pedía a PostgREST el catálogo completo sin pasar por esta ruta. Ahora la policy dice lo MISMO
  // que esta lista —el catálogo entero es de `ve_economia()`— y el que no ve economía sólo alcanza
  // los archivos con vínculo propio (su legajo, sus obras, los del cliente si administra). La ruta
  // y la base ya no se contradicen.
  '/documentos',
  // CLIENTES ES SÓLO DE ADMINISTRACIÓN (dueño, 24/09/2026: «los niveles de usuario que no sean
  // administración no pueden ver la sección clientes del módulo CRM admin»). Revierte la apertura del
  // 19/08: ni la cartera ni la ficha. La base sigue devolviendo el nombre del cliente de una obra
  // (lo necesita la cabecera de la obra); lo que se cierra es la sección.
  '/clientes',
  // COMPRAS (con Proveedores y Efectivo a rendir, que son secciones suyas) TAMPOCO (dueño, 24/09/2026:
  // «jefe de obra de crm admin no tiene acceso a clientes, compras, impuestos y presupuestos, tampoco a
  // liquidación»). Al jefe le queda Personal sin Liquidación; el costo de su obra lo ve en la obra misma
  // (Operación › Compras), que lee otra ruta.
  '/administracion/compras',
  '/administracion/proveedores',
  // `/administracion/cronograma` y `/administracion/portal` estuvieron acá menos de un día
  // (26/08/2026): eran dos pantallas del portal que duplicaban lo que la ficha del cliente ya
  // administraba en sus solapas 31 y 32. Se retiraron con sus rutas. Quién entra al portal y qué ve
  // se decide en la ficha del cliente, que es donde el dueño lo pidió: «es un crm ahi tiene q estar
  // todo». `/clientes` ya está más abajo, del lado de `veEconomia`.
] as const

/**
 * ═══ LA EXCEPCIÓN DEL 19/08/2026 SE RETIRÓ EL 24/09/2026 ═══ (el dueño cerró Clientes entero a quien
 * no es Administración; lo de abajo queda como historia de por qué existió).
 *
 * ═══ LA EXCEPCIÓN, Y POR QUÉ ERA UNA SOLA (19/08/2026) ═══
 *
 * El dueño corrigió la política: *"Un usuario Obras debe poder consultar clientes, contactos… VER
 * INFORMACIÓN OPERATIVA ≠ ADMINISTRAR EL MAESTRO."*
 *
 * La distinción cae exactamente entre la CARTERA y la FICHA. `/clientes` es la pantalla donde se
 * administra el maestro —se da de alta, se archiva, se ve la cartera entera— y sigue siendo de
 * Administración. `/clientes/<cliente>` es la ficha de UN cliente: de quién es la obra, quién es el
 * contacto, qué documentos hay. Eso es información de ejecución y se abre, en modo lectura (los
 * formularios no se dibujan, y la RLS rechaza la escritura de todos modos).
 */
export function puedeVerRuta(rol: Rol | null | undefined, ruta: string): boolean {
  if (veEconomia(rol)) return true
  // SE COMPARA EL PATH, SIN QUERY NI ANCLA (24/09/2026): la navegación pregunta con el href entero
  // («/administracion/proveedores?vista=deuda») y así una sección cerrada se le dibujaba al jefe.
  const pathname = ruta.split(/[?#]/)[0]
  if (rol === 'jefe_obra' && cerradaAlJefe(pathname)) return false
  return !RUTAS_SOLO_ECONOMIA.some((r) => pathname === r || pathname.startsWith(r + '/'))
}
