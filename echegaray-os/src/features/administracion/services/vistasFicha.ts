// LAS CARAS DE LA FICHA DE UNA PERSONA — el nivel 3 dentro del legajo.
//
// Son las preguntas que se le hacen a una persona: quién es, dónde estuvo y cuánto trabajó, qué
// papeles tiene, con qué cuenta entra y quién le tocó qué.
//
// ═══ POR QUÉ ESTO ES UN `.ts` Y NO UN COMPONENTE ═══
//
// Era `NavFicha.tsx`, que dibujaba la barra con `Tabs` del canon anterior. En el v2 las solapas las
// dibuja `SolapasDeFicha` —el mismo componente que usan las otras tres fichas—, así que lo único
// propio de esta pantalla es CUÁLES son y CÓMO se llaman. Eso es una lista, no un dibujo.
//
// ═══ SEIS Y NO SIETE: «ASIGNACIONES» SE FUNDIÓ CON «HORAS» (dueño, 18/09/2026) ═══
//
// *«En el legajo de cada persona hay secciones que se pueden unificar y hacer mejor la UX.»*
//
// Las dos contestaban la MISMA pregunta partida en dos: dónde estuvo y cuánto trabajó. El Resumen lo
// delataba — tenía dos enlaces, «Ver la cronología completa →» y «Ver el historial de asignaciones
// →», que llevaban a dos caras de la misma cosa, y para saber si las horas de una quincena cayeron
// en la obra donde esta persona está asignada había que ir y volver. Ahora es UNA cara, «Horas y
// obras», con las dos secciones a la vista y en el orden de la pregunta: primero las horas, después
// la relación contractual que las respalda.
//
// NO SE PERDIÓ NADA: la tabla de asignaciones es la misma, con su botón de cerrar y su cuenta —que
// ahora va en el rótulo de su sección, donde además dice de qué es el número—.
//
// ═══ NINGÚN ENLACE GUARDADO SE ROMPE ═══
//
// `?v=asignaciones` circula por specs, por el chat y por lo que alguien haya dejado en un favorito.
// Sigue valiendo: `vistaDe` lo traduce a la cara que lo absorbió. Un `?v=` que ya existía no se
// apaga; se redirige.
//
// ═══ LAS DOS QUE NO DESCRIBEN A LA PERSONA ═══
//
//   USUARIO Y PERMISOS y AUDITORÍA describen su CUENTA y lo que se le hizo a su ficha, y CADA UNA
//   TIENE SU PROPIO CONTROL DE ACCESO: `ve_economia()` la primera, `es_administracion()` la segunda.
//   Son predicados DISTINTOS —el jefe de obra entra a una y no a la otra—, así que fundirlas, que a
//   la vista sería lo natural, le sacaría o le daría acceso a alguien. No se tocan: una unificación
//   de UX no puede mover un permiso.
//
//   RECIBOS no existe como cara propia: los recibos son una CATEGORÍA de `documento_legajo`, así que
//   viven en Papeles. Separarlos exigiría una columna que hoy no distingue nada.
//
//   RETRIBUCIÓN (dueño, 16/09/2026) es la cara de la plata: $/h vigentes, lo liquidado y lo pagado
//   quincena por quincena en el año, y el historial de $/h negro y blanco. Tiene su propio control de
//   acceso —`liquidaSueldos`, el mismo que cierra la Liquidación— porque el jefe de obra abre el legajo
//   y no ve sueldos. Por eso tampoco se funde con «Horas y obras», que la mira todo el mundo.

export const VISTAS_FICHA = [
  'resumen', 'horas', 'retribucion', 'documentos', 'usuario', 'auditoria',
] as const
export type VistaFicha = (typeof VISTAS_FICHA)[number]

export const LABEL_FICHA: Record<VistaFicha, string> = {
  resumen: 'Resumen',
  horas: 'Horas y obras',
  retribucion: 'Retribución',
  documentos: 'Documentos',
  usuario: 'Usuario y permisos',
  auditoria: 'Auditoría',
}

/**
 * Los `?v=` que YA CIRCULAN y dejaron de ser una solapa. Siguen valiendo y abren la cara que los
 * absorbió: un enlace guardado no puede caer en el Resumen sin decir nada.
 */
export const ALIAS_VISTA: Record<string, VistaFicha> = {
  asignaciones: 'horas',
}

/**
 * La cara que corresponde a un `?v=`: la propia, la que lo absorbió, o el Resumen.
 *
 * `Object.hasOwn` Y NO `ALIAS_VISTA[v]` A SECAS: el `?v=` lo escribe el navegador, y
 * `ALIAS_VISTA['__proto__']` devuelve el prototipo de Object —un objeto, verdadero— que se colaría
 * como si fuera una cara. La página compararía `vista === 'horas'` contra un objeto y dibujaría el
 * Resumen sin sus datos, que es el modo de falla que no rompe nada y miente.
 */
export function vistaDe(v: string | undefined): VistaFicha {
  const propia = VISTAS_FICHA.find((x) => x === v)
  if (propia) return propia
  if (v && Object.hasOwn(ALIAS_VISTA, v)) return ALIAS_VISTA[v]
  return 'resumen'
}
