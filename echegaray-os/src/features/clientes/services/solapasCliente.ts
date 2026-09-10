// QUÉ CARAS TIENE LA FICHA DEL CLIENTE Y QUIÉN LAS VE.
//
// ═══ POR QUÉ ES UNA FUNCIÓN Y NO UN ARRAY DENTRO DEL JSX ═══
//
// Tres de las siete caras son ECONÓMICAS y una de ellas —«Acceso al portal»— decide qué ve el
// cliente de la empresa desde afuera. Ofrecerle esa solapa a quien no corresponde no rompe nada
// visible: la RLS le devolvería cero filas y la pantalla se vería vacía, o sea que el defecto se
// descubre el día que alguien habilite un mail que no debía. Una lista adentro del JSX no se puede
// probar; ésta sí, y la prueba está atada al predicado de permiso, no a la costumbre.
//
// El parseo del parámetro también vive acá: `?solapa=` fue el nombre viejo y hay enlaces
// compartidos con él. Que un favorito abra Resumen sin decir por qué es un defecto silencioso.

// ═══ «RESUMEN» SE FUE, Y LA FICHA ABRE POR OBRAS (26 v2) ═══
//
// El mockup v2 no tiene cara «Resumen»: sus solapas son Obras · Certificados · Presupuestos ·
// Documentos · Actividad, y la primera es la que abre. «Resumen» era una cara que repetía la tabla
// de Obras más los presupuestos debajo — o sea, dos caras apiladas con otro nombre.
//
// «Actividad» sube a cara propia: en el v2 el costado guarda lo que IDENTIFICA al cliente
// —identidad, contactos, portal— y la historia de la relación es contenido, no identidad.
// «COBRANZAS» ES LA ENTRADA PRINCIPAL DE LA PLATA (dueño, 10/09/2026 18:20): «necesito una sección
// exclusiva por cliente con todo lo que involucre cobranzas». Va PRIMERA de las económicas y antes
// que «Cuenta corriente», que es su resumen agregado, y que «Esquema de pago», que es lo que el
// cliente ve en el portal. Las tres se quedan: la cuenta registra cobros de certificados y el
// esquema publica el cronograma, dos capacidades que esta cara no reemplaza.
export const SOLAPAS = [
  'obras', 'cobranzas', 'presupuestos', 'documentos', 'actividad', 'cuenta', 'esquema', 'accesos',
] as const
export type Solapa = (typeof SOLAPAS)[number]

/** Las caras que se dibujan A SANGRE: sus mockups (28, 31, 32) usan la columna derecha para su
 *  propio panel, así que no conviven con el aside de identidad de la ficha 26. */
// COBRANZAS VA A SANGRE: son nueve columnas de plata y el costado de identidad le comería 300px,
// que es justo lo que hace que una tabla densa deje de leerse.
export const A_SANGRE: readonly Solapa[] = ['cobranzas', 'cuenta', 'esquema', 'accesos']

/** Las que sólo ve quien tiene permiso económico. */
export const ECONOMICAS: readonly Solapa[] = ['cobranzas', 'presupuestos', 'cuenta', 'esquema', 'accesos']

/** Una solapa que no existe abre Obras: un enlace viejo o tipeado a mano no puede dejar la ficha en
 *  blanco. `vista` es el nombre de hoy y `solapa` el de ayer — se acepta el que llegue. Y
 *  `?vista=resumen`, que ya está compartido, cae en Obras, que es lo que ese enlace mostraba
 *  arriba de todo: mandarlo a una cara vacía sería peor que ignorarlo. */
export function solapaDe(vista: string | undefined, legacy?: string | undefined): Solapa {
  const pedida = vista ?? legacy
  return (SOLAPAS as readonly string[]).includes(pedida ?? '') ? (pedida as Solapa) : 'obras'
}

export interface SolapaVisible {
  clave: Solapa
  label: string
  /** `null` cuando contar no aporta: un «0» al lado de «Cuenta corriente» se lee como saldo. */
  cuenta: number | null
}

/** Los rótulos SON los del mockup, palabra por palabra: «Cuenta corriente», no «Cuenta». */
const LABEL: Record<Solapa, string> = {
  cobranzas: 'Cobranzas',
  // «TRABAJOS» Y NO «OBRAS» (dueño, 10/09/2026 17:15): «Administración es un CRM y Obra un ERP».
  // Lo que el CRM lista son los TRABAJOS que el cliente encargó —con su OC, su facturación y su
  // cobro—; la obra como unidad de ejecución, con su plan y su costo, vive en el ERP. La CLAVE de
  // la solapa sigue siendo `obras` a propósito: cambiarla rompería los enlaces ya compartidos.
  obras: 'Trabajos',
  presupuestos: 'Presupuestos',
  documentos: 'Documentos',
  actividad: 'Actividad',
  cuenta: 'Cuenta corriente',
  esquema: 'Esquema de pago',
  accesos: 'Acceso al portal',
}

export function solapasDeCliente({ veEconomia, obras, presupuestos, documentos, cobranzas = null }: {
  veEconomia: boolean
  obras: number
  presupuestos: number
  documentos: number
  /** Cuántas filas de la pestaña Cobranzas tiene el cliente. `null` = no se pudieron leer, y
   *  entonces NO se escribe un cero: diría que no tiene ninguna. */
  cobranzas?: number | null
}): SolapaVisible[] {
  const cuentas: Record<Solapa, number | null> = {
    obras, cobranzas, presupuestos, documentos, actividad: null, cuenta: null, esquema: null,
    accesos: null,
  }
  return SOLAPAS
    .filter((s) => veEconomia || !ECONOMICAS.includes(s))
    .map((clave) => ({ clave, label: LABEL[clave], cuenta: cuentas[clave] }))
}
