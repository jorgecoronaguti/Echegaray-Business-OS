// QUÉ ALCANZA ESTE ACCESO — las reglas de `public.cliente_acceso`, puras y probables sin base.
//
// ═══ POR QUÉ ESTO EXISTE (26/08/2026) ═══
//
// El portal nació leyendo `cliente_mail`, una tabla propia. La ficha del cliente YA administraba lo
// mismo en `cliente_acceso` (pantalla 31): administración daba de baja un acceso ahí y el portal
// seguía dejando entrar. Dos definiciones del mismo concepto — LA FICHA GANA, y el portal lee de ahí.
//
// ═══ LAS TRES REGLAS QUE `cliente_mail` NO TENÍA Y HAY QUE RESPETAR ═══
//
//   1. REVOCADO NO ENTRA. `cliente_acceso` no borra: pone `revocado_at`. Una fila revocada sigue
//      existiendo para que la pantalla 31 pueda decir «María ya no entra desde el 12/08». Leerla sin
//      mirar `revocado_at` deja entrar a todo el que alguna vez tuvo acceso.
//   2. `obras = NULL` ES «TODAS», `obras = []` ES «NINGUNA». Son estados distintos y el vacío es el
//      estado natural de un formulario a medio llenar: aplanar los dos a «todas» abre el acceso por
//      accidente, y aplanarlos a «ninguna» deja afuera al 100 % de los accesos reales (hoy el único
//      acceso vivo tiene NULL).
//   3. LOS PERMISOS SON INDEPENDIENTES. `puede_ver_montos = false` no ve un peso —ni el cronograma,
//      ni las facturas, ni el próximo pago—; `puede_ver_obra` gobierna documentos y avance.

/** La fila de `cliente_acceso` tal como la necesita la puerta. Sólo lo que decide algo. */
export interface FilaAcceso {
  id: string
  cliente_id: string
  puede_ver_obra: boolean
  puede_ver_montos: boolean
  puede_aprobar: boolean
  /** Ids de `obra_canonica`. `null` = todas las del cliente; `[]` = ninguna. */
  obras: string[] | null
  revocado_at: string | null
}

/** El acceso ya resuelto, con el nombre del cliente puesto. Es lo que viaja a las pantallas. */
export interface AccesoDelPortal {
  accesoId: string
  clienteId: string
  clienteNombre: string
  puedeVerObra: boolean
  puedeVerMontos: boolean
  puedeAprobar: boolean
  /** `null` = TODAS las obras del cliente. `[]` = ninguna. Ids de `obra_canonica`. */
  obras: string[] | null
}

/**
 * ¿ESTE ACCESO ESTÁ VIVO? Un acceso revocado no entra, aunque la fila siga en la tabla.
 *
 * Se pregunta acá y no en el `where` de la consulta —también se pregunta ahí— porque la respuesta
 * tiene que poder probarse: el día que alguien agregue un vencimiento, este es el único lugar donde
 * se cambia y el único que tiene test.
 */
export const accesoVigente = (f: Pick<FilaAcceso, 'revocado_at'>): boolean => f.revocado_at === null

/**
 * ¿ESTE ACCESO ABRE ESA OBRA?
 *
 * `obraId === null` es una fila del esquema SIN obra asignada (`esquema_pago.obra_id` es opcional):
 * sólo la ve quien alcanza TODAS las obras. Un acceso acotado a dos obras no puede ver un pago que
 * no dice de qué obra es — no hay forma de afirmar que le corresponda, y falla cerrado.
 */
export function alcanzaLaObra(obras: string[] | null, obraId: string | null): boolean {
  if (obras === null) return true
  if (obraId === null) return false
  return obras.includes(obraId)
}

/** Los paréntesis de «(IMOTOR / Javier Sánchez)» son una anotación interna de administración. */
export function limpiarNombre(crudo: string): string {
  return crudo.trim().replace(/^\((.*)\)$/, '$1').trim()
}

/**
 * QUÉ PUEDE VER ESTE ACCESO, EN UNA FRASE. La pantalla la escribe cuando retira la plata.
 *
 * `puede_ver_montos = false` no dibuja «$ 0» ni un guión: retira los importes y DICE qué queda. Un
 * cero afirma que no debe nada y un «—» se lee «no tiene importe»; las dos cosas son falsas y del
 * otro lado hay alguien que no trabaja en la empresa.
 */
export function loQueSiPuedeVer(a: Pick<AccesoDelPortal, 'puedeVerObra' | 'puedeVerMontos'>): string {
  if (a.puedeVerMontos) return 'Ve el detalle económico de sus obras.'
  return a.puedeVerObra
    ? 'Su acceso no incluye los importes. Sí ve las fechas, los comprobantes y los documentos de la obra.'
    : 'Su acceso no incluye los importes. Sí ve las fechas y los comprobantes de su cronograma.'
}
