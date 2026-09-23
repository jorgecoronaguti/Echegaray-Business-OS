// EL CATÁLOGO DE AVISOS, DEL LADO DE LA PANTALLA.
//
// Espejo en TypeScript de `orquestador/lib/notificaciones.mjs`, que es el que consultan los emisores.
// Un test de cada lado exige que las claves coincidan: la pantalla no ofrece interruptores para
// avisos que nadie manda ni deja sin interruptor un aviso que sí se manda.

export type TipoAviso = 'efectivo_firma' | 'efectivo_anulacion' | 'efectivo_firmada' | 'sistema'
export type CanalAviso = 'mattermost_dm' | 'correo'

export interface DefTipo {
  clave: TipoAviso
  titulo: string
  detalle: string
  /** A quién le llega hoy: a cualquier persona con usuario, o sólo al dueño (Dirección). */
  para: 'persona' | 'dueno'
}

export const TIPOS: readonly DefTipo[] = [
  { clave: 'efectivo_firma', titulo: 'Efectivo para firmar', detalle: 'Te entregaron efectivo a rendir: el enlace para confirmar y firmar.', para: 'persona' },
  { clave: 'efectivo_anulacion', titulo: 'Entrega anulada', detalle: 'Se anuló una entrega de efectivo a tu nombre, con el motivo.', para: 'persona' },
  { clave: 'efectivo_firmada', titulo: 'Efectivo firmado', detalle: 'Alguien firmó la plata que recibió: quién, cuánto y cuándo.', para: 'dueno' },
  { clave: 'sistema', titulo: 'Avisos del sistema', detalle: 'Despliegues, controles y lo que el OS necesita decirle al dueño.', para: 'dueno' },
]

export const CANALES: readonly { clave: CanalAviso; titulo: string; disponible: boolean }[] = [
  { clave: 'mattermost_dm', titulo: 'Mensaje directo del bot', disponible: true },
  { clave: 'correo', titulo: 'Correo', disponible: false },
]

export const esTipo = (v: unknown): v is TipoAviso => TIPOS.some((t) => t.clave === v)
export const esCanal = (v: unknown): v is CanalAviso => CANALES.some((c) => c.clave === v)

export interface Preferencia { tipo: TipoAviso; canal: CanalAviso; activo: boolean }

/** Sin fila = se avisa. Es la misma regla que `debeAvisar` del orquestador. */
export function estaActivo(prefs: readonly Preferencia[], tipo: TipoAviso, canal: CanalAviso): boolean {
  const fila = prefs.find((p) => p.tipo === tipo && p.canal === canal)
  return fila ? fila.activo : true
}

/** Los tipos que le aplican a este rol: los del dueño sólo a Dirección. */
export function tiposPara(rol: string | null | undefined): readonly DefTipo[] {
  return TIPOS.filter((t) => t.para === 'persona' || rol === 'direccion')
}
