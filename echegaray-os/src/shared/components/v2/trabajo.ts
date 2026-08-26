// LA FORMA DE UNA SEÑAL DE TRABAJO — criterio 2 del patrón de sección v2.
//
// «Cada fila que reclama algo dice qué bloquea y trae su verbo a la derecha. No un chip que cuenta:
// una frase que nombra el obstáculo y un botón que lo resuelve.»
//
// Vive en `shared` y no en un dominio porque las OCHO secciones de Administración abren con este
// mismo bloque —Clientes, Personal, Proveedores, Compras, Base maestra, Documentos y las dos colas—
// y cada una lo llenaba con su propia forma. Dos formas distintas del mismo renglón terminan
// dibujando dos renglones distintos: uno con «—» y otro con «0», que es justo lo que no puede pasar.
//
// QUIÉNES son las señales de cada sección lo decide el servicio de esa sección, que se prueba sin
// React y sin base. Acá sólo vive la forma y el resumen, que son los que tienen que coincidir.

/** Una fila del bloque de trabajo de una sección. */
export interface SenalDeTrabajo {
  clave: string
  /** `null` = no se pudo contar. Nunca 0 por ausencia de lectura. */
  numero: number | null
  texto: string
  /** Qué se pierde mientras esto siga así, en consecuencia de negocio y no en jerga de base. */
  bloquea: string
  /**
   * El verbo, sin flecha: la flecha la pone la fila. Vacío = esta señal NO se resuelve desde acá.
   *
   * Pasa de verdad: «sin fichar hoy» se resuelve desde el celular o lo carga el jefe de obra, y no
   * hay ningún recorte de esta pantalla que muestre a esos tres. Un verbo que no lleva a ninguna
   * parte enseña a no hacer clic en la fila de al lado, que sí lleva.
   */
  accion: string
  /** Dónde se resuelve. `undefined` = la fila informa y no es clicable (`19v2:104-107`). */
  href?: string
  /** Qué icono lleva la fila. Ausente = el que la sección declara por defecto. */
  icono?: string
  /**
   * `neg` = ya está costando plata o sacando a alguien de la obra; `warn` (el defecto) = falta un
   * dato. Si todo fuera rojo, el rojo no diría nada.
   */
  tono?: 'warn' | 'neg'
}

/**
 * El resumen de la cabecera: cuántas señales y cuántos registros hay detrás (`22v2:365`).
 *
 * Con alguna señal sin contar el total de registros sería un PISO, no un total: se dice que lo es
 * en vez de publicar un número con forma de completo.
 */
export function resumirTrabajo(senales: SenalDeTrabajo[]): string {
  if (senales.length === 0) return 'nada pendiente'
  const contadas = senales.filter((s) => s.numero !== null)
  const registros = contadas.reduce((a, s) => a + (s.numero ?? 0), 0)
  const senal = `${senales.length} ${senales.length === 1 ? 'señal' : 'señales'}`
  if (contadas.length !== senales.length) return `${senal} · al menos ${registros} registros`
  return `${senal} · ${registros} ${registros === 1 ? 'registro' : 'registros'}`
}
