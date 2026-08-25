import { C } from '@/shared/components/canon'

// LA PALETA DEL PORTAL — medida de `29` y `30`, no elegida.
//
// Los tonos compartidos NO se redefinen: salen de `C` (el canon de Administración), que se midió del
// mismo zip. Acá sólo se agregan los que el portal usa y las pantallas internas no tienen, que son
// todos los FONDOS SUAVES de estado: el portal es la única cara que pinta bloques enteros de color
// —la tarjeta ámbar del certificado a aprobar, la tarjeta roja de lo vencido, los tramos de la barra
// del contrato— porque es la única que le habla a alguien que no mira esta pantalla todos los días.
//
// Un tono que ya está en `C` y se vuelve a escribir acá es un tono que mañana se desincroniza.

export const P = {
  ...C,

  /** El guión de una celda sin dato en la tabla de rubros (`29:177`). */
  guion: '#C9C7C1',
  /** Icono e ilustración apagados: hito sin iniciar, recuadro de foto vacío (`29:456`, `29:487`). */
  apagadoIcono: '#C4C2BC',

  /** Tramo COBRADO de la barra del contrato y su borde (`29:100`, `29:113`). */
  verdeSuave: '#D6EBDF',
  /** El verde oscuro del importe escrito DENTRO del tramo cobrado (`29:101`). */
  verdeTinta: '#05603A',
  /** Tramo SIN COBRAR (`29:103`). */
  rojoSuave: '#FDE2DE',
  /** Tramo FONDO DE REPARO — el único gris con borde propio (`29:106`, `29:121`). */
  grisReparo: '#EFEEEA',

  /** Fondo de la tarjeta del certificado que espera aprobación y su borde (`29:131`). */
  ambarFondo: '#FEF7EE',
  ambarBorde: '#F0DCC0',

  /** Fondo del panel «A pagar ahora» y su borde (`29:595`, `29:596`). */
  rojoFondo: '#FEF3F2',
  rojoBorde: '#FBD9D4',
  /** El rojo oscuro del rótulo A PAGAR AHORA (`29:597`). */
  rojoTinta: '#912018',

  /** El borde del contador amarillo de la solapa y de los chips del teléfono (`29:78`, `30:256`). */
  marcaBorde: '#F5E4A8',
} as const

/** El subrayado de la solapa activa: AMARILLO en el portal (`29:713`), grafito en el OS interno. */
export const SUBRAYADO_SOLAPA = `inset 0 -2px 0 ${C.marca}`

/** El de la barra de abajo del teléfono va ARRIBA de la solapa (`30:226`). */
export const SUBRAYADO_SOLAPA_MOVIL = `inset 0 2px 0 ${C.marca}`

/** El ancho de la columna derecha del `29` (`29:593`). No es negociable: el mockup lo fija en px. */
export const ANCHO_PANEL = 336

/** La columna izquierda no baja de 580px; debajo de eso el panel se va abajo (`29:89`). */
export const MIN_COLUMNA = 580

/** Las cinco columnas de la tabla de rubros del certificado (`29:163`). */
export const COLS_RUBROS = 'minmax(0,1.5fr) 104px 142px 96px 96px'

/** Las cinco de la tabla de certificados y facturas (`29:247`). */
export const COLS_CERTIFICADOS = 'minmax(0,1.7fr) 106px 104px 116px 108px'
