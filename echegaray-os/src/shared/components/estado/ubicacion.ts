// DE QUÉ PANTALLA ESTAMOS HABLANDO — para que el cartel de error diga la verdad.
//
// «No se pudo cargar la información» no ayuda a nadie: no se sabe si falló la cartera de obras, el
// legajo o el flujo de caja, y quien avisa por teléfono no puede decir qué se rompió. El nombre
// sale del `pathname`, que es el único dato que un `error.tsx` tiene garantizado —el error puede
// venir del layout, de la página o de un componente y no trae contexto de negocio.
//
// LA VUELTA TIENE QUE EXISTIR Y TIENE QUE SER LA CARTERA, no el inicio: si se cayó la ficha de una
// obra, el lugar al que quiere ir la persona es la lista de obras. Un botón «Volver al inicio» en
// esa situación es un botón que castiga.
//
// El mapa es explícito a propósito: derivar el nombre del segmento («administracion» →
// «Administracion») produce títulos sin acento y sin artículo, y una pantalla de error mal escrita
// se lee como que el sistema tampoco sabe dónde está.

export type Ubicacion = {
  /** Cómo se nombra la pantalla dentro de la frase «No se pudo cargar …». */
  que: string
  /** A dónde vuelve quien no puede seguir acá. `null` sólo en la raíz de un área. */
  volver: { href: string; texto: string } | null
}

type Entrada = { prefijo: string; que: string; cartera?: { href: string; texto: string } }

const OBRAS = { href: '/obras', texto: 'Cartera de obras' }
const CLIENTES = { href: '/clientes', texto: 'Cartera de clientes' }
const PRESUPUESTOS = { href: '/presupuestos', texto: 'Presupuestos' }
const ADMIN = { href: '/administracion', texto: 'Administración' }
const PERSONAS = { href: '/administracion/personas', texto: 'Personas' }
const INICIO = { href: '/', texto: 'Inicio' }

// Del más específico al más general: gana el primer prefijo que coincide.
const MAPA: readonly Entrada[] = [
  { prefijo: '/obras/gantt', que: 'el Gantt de obras', cartera: OBRAS },
  { prefijo: '/obras/nueva', que: 'el alta de obra', cartera: OBRAS },
  { prefijo: '/obras/', que: 'la ficha de la obra', cartera: OBRAS },
  { prefijo: '/obras', que: 'la cartera de obras' },
  { prefijo: '/clientes/', que: 'la ficha del cliente', cartera: CLIENTES },
  // Presupuestos: tres niveles y los tres vuelven a la cartera de presupuestos, no al inicio. Si se
  // cayó el análisis de una partida, el lugar al que quiere ir la persona es su presupuesto.
  { prefijo: '/presupuestos/', que: 'el presupuesto', cartera: PRESUPUESTOS },
  { prefijo: '/presupuestos', que: 'la cartera de presupuestos' },
  { prefijo: '/clientes', que: 'la cartera de clientes' },
  { prefijo: '/administracion/personas/cuadrillas', que: 'las cuadrillas', cartera: PERSONAS },
  { prefijo: '/administracion/personas/en-obra', que: 'quién está hoy en obra', cartera: PERSONAS },
  { prefijo: '/administracion/personas/', que: 'el legajo de la persona', cartera: PERSONAS },
  { prefijo: '/administracion/personas', que: 'el legajo de personas', cartera: ADMIN },
  { prefijo: '/administracion/proveedores', que: 'los proveedores', cartera: ADMIN },
  { prefijo: '/administracion/usuarios', que: 'los usuarios', cartera: ADMIN },
  { prefijo: '/administracion/pendientes', que: 'los pendientes de Administración', cartera: ADMIN },
  { prefijo: '/administracion', que: 'Administración' },
  { prefijo: '/calendario-financiero', que: 'el calendario financiero' },
  { prefijo: '/aprobaciones', que: 'las aprobaciones' },
  { prefijo: '/integraciones/pedidos-materiales', que: 'los pedidos de materiales', cartera: { href: '/integraciones', texto: 'Integraciones' } },
  { prefijo: '/integraciones/movimientos', que: 'los movimientos', cartera: { href: '/integraciones', texto: 'Integraciones' } },
  { prefijo: '/integraciones/herramientas', que: 'las herramientas', cartera: { href: '/integraciones', texto: 'Integraciones' } },
  { prefijo: '/integraciones', que: 'las integraciones' },
  { prefijo: '/mi-cuenta/', que: 'esta parte de tu cuenta', cartera: { href: '/mi-cuenta', texto: 'Mi cuenta' } },
  { prefijo: '/mi-cuenta', que: 'tu cuenta' },
  { prefijo: '/mi-informacion/documentos', que: 'tus documentos', cartera: { href: '/mi-informacion', texto: 'Mi información' } },
  { prefijo: '/mi-informacion/recibos', que: 'tus recibos', cartera: { href: '/mi-informacion', texto: 'Mi información' } },
  { prefijo: '/mi-informacion/asistencia', que: 'tu asistencia', cartera: { href: '/mi-informacion', texto: 'Mi información' } },
  { prefijo: '/mi-informacion/horas', que: 'tus horas', cartera: { href: '/mi-informacion', texto: 'Mi información' } },
  { prefijo: '/mi-informacion/legajo', que: 'tu legajo', cartera: { href: '/mi-informacion', texto: 'Mi información' } },
  { prefijo: '/mi-informacion', que: 'tu información' },
  { prefijo: '/mi-trabajo/tareas', que: 'tus tareas', cartera: { href: '/mi-trabajo', texto: 'Mi trabajo' } },
  { prefijo: '/mi-trabajo/reportar', que: 'el parte de trabajo', cartera: { href: '/mi-trabajo', texto: 'Mi trabajo' } },
  { prefijo: '/mi-trabajo', que: 'tu trabajo' },
  { prefijo: '/hoy', que: 'tu día' },
  { prefijo: '/campo/parte', que: 'el parte de obra', cartera: { href: '/campo', texto: 'Campo' } },
  { prefijo: '/campo/impedimento', que: 'la carga del impedimento', cartera: { href: '/campo', texto: 'Campo' } },
  { prefijo: '/campo', que: 'la pantalla de campo' },
  { prefijo: '/descargas', que: 'las descargas' },
  { prefijo: '/reportes', que: 'los reportes' },
  { prefijo: '/os', que: 'el tablero del OS' },
]

/**
 * Un prefijo terminado en `/` exige que haya algo después: `/obras/` es una ficha, `/obras` es la
 * cartera. Sin esa distinción, la cartera de obras heredaría el título de una ficha.
 */
function coincide(pathname: string, prefijo: string): boolean {
  if (prefijo.endsWith('/')) return pathname.startsWith(prefijo) && pathname.length > prefijo.length
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`)
}

/**
 * LAS PANTALLAS QUE ESTE MAPA DICE CONOCER — para poder comprobarlas contra el árbol de rutas.
 *
 * Un prefijo que sobrevive a su pantalla no rompe nada: nunca coincide con ningún `pathname`, así
 * que el cartel de error cae en el default y sigue leyéndose bien. Lo que lo vuelve caro es la
 * vuelta: el día que esa URL exista otra vez —con otro dueño y otro significado— el cartel afirma
 * el nombre viejo sin que nadie lo haya escrito de nuevo. `rutas-existen.test.ts` lo mira.
 */
export const PREFIJOS_DE_PANTALLA: readonly string[] = MAPA.map((e) => e.prefijo)

export function ubicarPantalla(pathname: string | null | undefined): Ubicacion {
  const ruta = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/'
  const entrada = MAPA.find((e) => coincide(ruta, e.prefijo))
  if (!entrada) return { que: 'esta pantalla', volver: ruta === '/' ? null : INICIO }
  return { que: entrada.que, volver: entrada.cartera ?? (ruta === entrada.prefijo ? null : INICIO) }
}
