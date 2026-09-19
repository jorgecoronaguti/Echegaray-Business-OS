// LAS CARAS DE LA FICHA DE UNA PERSONA — el nivel 3 dentro del legajo.
//
// Son las preguntas que se le hacen a una persona: quién es, dónde estuvo, cuánto trabajó, cuánto
// cobra, qué papeles tiene y con qué cuenta entra.
//
// ═══ POR QUÉ ESTO ES UN `.ts` Y NO UN COMPONENTE ═══
//
// Era `NavFicha.tsx`, que dibujaba la barra con `Tabs` del canon anterior. En el v2 las solapas las
// dibuja `SolapasDeFicha` —el mismo componente que usan las otras tres fichas—, así que lo único
// propio de esta pantalla es CUÁLES son y CÓMO se llaman. Eso es una lista, no un dibujo.
//
// ═══ QUÉ DICE EL MOCKUP Y EN QUÉ SE APARTA ESTO ═══
//
// El `20 v2` dibuja cuatro: Asistencia · Papeles · Obras · Recibos. Acá hay seis, y las diferencias
// son deliberadas:
//
//   ASIGNACIONES y HORAS son la versión completa de lo que el mockup llama «Obras» y «Asistencia».
//   HORAS trae además el selector de período de la liquidación (día · semana · quincena · mes), que
//   es lo que hace que las HH de esta pantalla coincidan con una quincena real.
//
//   USUARIO Y PERMISOS no describe a la PERSONA: describe su CUENTA, y tiene su propio control de
//   acceso. El mockup no la tiene porque su legajo de ejemplo es de un oficial albañil sin cuenta.
//
//   RECIBOS no existe como cara propia: los recibos son una CATEGORÍA de `documento_legajo`, así que
//   viven en Papeles. Separarlos exigiría una columna que hoy no distingue nada.
//
// NINGUNA VISTA SE RENOMBRÓ: los valores de `?v=` que ya circulan siguen valiendo, así que no hace
// falta ningún redirect y ningún enlace guardado se rompe.
//
// ═══ AUDITORÍA SE RETIRÓ (dueño, 17/09/2026) ═══
//
// *«Eso de auditoría no sirve en el legajo de ninguno, quitar.»* Salió de la lista y con ella el
// bloque, su lectura y su rótulo. Un `?v=auditoria` guardado en un favorito NO da 404: la página
// no encuentra la clave y cae en «resumen», que es la misma red que atrapa cualquier `?v=` mal
// escrito. El rastro de cambios de la base no se tocó — lo escriben los disparadores, no esta cara.

//   RETRIBUCIÓN (dueño, 16/09/2026) es la cara de la plata: $/h vigentes, lo liquidado y lo pagado
//   quincena por quincena en el año, y el historial de $/h negro y blanco. Tiene su propio control de
//   acceso —`liquidaSueldos`, el mismo que cierra la Liquidación— porque el jefe de obra abre el legajo
//   y no ve sueldos.

export const VISTAS_FICHA = [
  'resumen', 'asignaciones', 'horas', 'retribucion', 'documentos', 'usuario',
] as const
export type VistaFicha = (typeof VISTAS_FICHA)[number]

export const LABEL_FICHA: Record<VistaFicha, string> = {
  resumen: 'Resumen',
  asignaciones: 'Asignaciones',
  horas: 'Horas',
  retribucion: 'Retribución',
  documentos: 'Documentos',
  usuario: 'Usuario y permisos',
}
