// LA CUENTA CORRIENTE, EL ESQUEMA DE PAGO Y EL ACCESO AL PORTAL DE UN CLIENTE.
//
// Son los tipos de las pantallas 28 · 31 · 32 y siguen el CONTRATO-28-32: el frente de datos los
// puebla desde `public.cobranza` (réplica de la pestaña Cobranzas del Sheet «Flujo de Caja - Cash
// Flow», que es la fuente de la fecha de cobro) y desde las tablas nuevas `certificado_cliente`,
// `esquema_pago`, `cliente_acceso` y `cliente_actividad_portal`.
//
// ═══ TODO NÚMERO QUE PUEDE FALTAR ES `number | null` ═══
//
// No hay ceros por defecto en este archivo y no es una preferencia de estilo: un saldo `0` dice
// «este cliente no debe nada» y un saldo `null` dice «no lo sabemos todavía». Sobre una pantalla de
// cobranzas la diferencia entre las dos frases es una llamada que se hace o no se hace.

/** Los estados con los que la pantalla 28 pinta un documento. Salen del contrato. */
export type EstadoCertificado =
  | 'emitido' | 'en_revision' | 'aprobado' | 'observado' | 'vencido' | 'cobrado' | 'en_disputa'
  /** Fondo de reparo retenido: no es un certificado impago, es plata que todavía no se puede pedir. */
  | 'retenido'
  /** A vencer: emitido, aprobado y con fecha por delante. */
  | 'a_vencer'

/** Un certificado o una factura emitida al cliente — la fila de «Certificados y facturas» (28). */
export interface CertificadoCliente {
  id: string
  cliente_id: string
  obra_id: string | null
  /** El nombre de la obra que va en la sublínea de la fila («Comedor La Estrella»). Lo resuelve la
   *  lectura con un join: la pantalla no puede pedir la ficha de cada obra para dibujar una tabla. */
  obra_nombre: string | null
  /** «Certificado 4», «Certificado final», «Fondo de reparo · Playón de carga». */
  numero: string
  /** «FC A 0004-131». `null` = certificado emitido y todavía sin facturar. */
  factura: string | null
  monto: number
  /** Fondo de reparo retenido en ESTE documento. `null` = el contrato no retiene. */
  reparo: number | null
  /** Día en que se emitió (ISO `YYYY-MM-DD`). */
  emitido_at: string | null
  /** Día en que vence el cobro (ISO). `null` = sin vencimiento pactado; NO se asume «hoy». */
  vence: string | null
  /** Día en que se cobró (ISO). `null` mientras no esté cobrado. */
  cobrado_at: string | null
  estado: EstadoCertificado
  /** Lo que el cliente observó, cuando lo observó. Es el «por qué» de una disputa. */
  observacion: string | null
  /** Fila de la pestaña Cobranzas que lo cobra. Es la trazabilidad al Sheet. */
  cobranza_fila: number | null
}

/** Las cinco cifras que coronan la 28 y la condición de pago que las explica. */
export interface CuentaCorriente {
  cliente_id: string
  saldo: number | null
  vencido: number | null
  /** Días de calle. La fórmula la declara la vista que lo calcula, no la pantalla. */
  dso_dias: number | null
  dso_objetivo: number | null
  /** Cobrado en fecha sobre vencido en los últimos 90 días, en puntos porcentuales (0–100). */
  efectividad_pct: number | null
  /** Contra el período anterior. `null` = no hay período anterior con qué comparar. */
  efectividad_delta_pts: number | null
  fondo_reparo: number | null
  /** Cuándo libera el fondo de reparo más próximo (ISO). */
  fondo_reparo_libera: string | null
  /** «30 días fecha factura». Texto del contrato, no un cálculo. */
  condicion_pago: string | null
  /** Quién paga del lado del cliente («Julián Sosa»). */
  contacto_cobranza: string | null
}

export type EstadoPago = 'cobrado' | 'a_vencer' | 'vencido' | 'previsto' | 'retenido'
export type MedioPago = 'transferencia' | 'cheque' | 'efectivo'

/** Un cambio de fecha ya ocurrido sobre un pago. Es lo que hace que «3ª fecha» sea un hecho. */
export interface Reprogramacion {
  /** Fecha que tenía (ISO). `null` en el alta. */
  de: string | null
  /** Fecha a la que pasó (ISO). */
  a: string
  at: string
  /** Iniciales o nombre de quien lo movió. */
  por: string | null
  motivo: string | null
  /** Si el cliente ya lo vio publicado. */
  publicado: boolean
}

/** Una fila del esquema de pago (32). */
export interface PagoEsquema {
  id: string
  cliente_id: string
  obra_id: string | null
  obra_nombre: string | null
  /** Fila de Cobranzas que representa. `null` = previsto, todavía sin fila en el Sheet. */
  cobranza_fila: number | null
  /** «Certificado 4 · FC A 0004-131», «Fondo de reparo del contrato». */
  concepto: string
  /** El renglón chico de abajo: «cobrado 06/07 · transferencia», «estimado por avance · sin emitir». */
  detalle: string | null
  /** ISO. Es la palanca: mover esto es mover la columna Q de Cobranzas. */
  fecha: string | null
  monto: number
  reparo: number | null
  estado: EstadoPago
  medio: MedioPago | null
  visible_portal: boolean
  /** Días de aviso previo. `null` = sin aviso programado. */
  aviso_dias: number | null
  mostrar_reprogramaciones: boolean
  nota_interna: string | null
  reprogramaciones: Reprogramacion[]
  publicado_at: string | null
  /** Hay un cambio hecho por el admin que el cliente todavía no vio. */
  cambio_pendiente: boolean
  orden: number
  /** El monto lo impone el certificado y no se edita desde el esquema. */
  monto_bloqueado: boolean
}

/** Lo que devuelve `getEsquema`: los pagos y el contrato contra el que se controlan. */
export interface EsquemaCliente {
  cliente_id: string
  /** Monto contratado con el que se compara la suma del esquema. `null` = sin contrato cargado, y
   *  entonces «falta asignar» no se puede afirmar. */
  contrato_total: number | null
  obra_nombre: string | null
  condicion_pago: string | null
  pagos: PagoEsquema[]
}

/** Un mail habilitado a entrar al portal del cliente (31). */
export interface AccesoPortal {
  id: string
  cliente_id: string
  email: string
  /** Nombre de la persona. `null` = se cargó el mail sin nombre. */
  persona_contacto: string | null
  puede_ver_obra: boolean
  puede_ver_montos: boolean
  puede_aprobar: boolean
  /** Ids de obra a las que entra. `null` = TODAS (incluidas las futuras). */
  obras: string[] | null
  /** Los nombres de esas obras, para no pedir la ficha de cada una. */
  obras_nombres: string[] | null
  habilitado_at: string | null
  invitacion_enviada_at: string | null
  primer_ingreso_at: string | null
  ultimo_ingreso_at: string | null
  /** «iPhone · Córdoba». Texto ya armado por la lectura. */
  ultimo_dispositivo: string | null
  revocado_at: string | null
}

export type TipoActividadPortal =
  | 'aprobo_certificado' | 'observo_certificado' | 'descargo_factura'
  | 'habilitado' | 'ingreso' | 'consulta' | 'informo_transferencia'

/** Una línea de «Qué hicieron en el portal» (31). */
export interface ActividadPortal {
  id: string
  tipo: TipoActividadPortal
  /** Quién lo hizo, ya resuelto a nombre («Marta Ruiz», «R. Echegaray»). */
  persona: string | null
  /** Sobre qué: «certificado 4», «FC A 0004-118», «l.paz@laestrella.com». */
  referencia: string | null
  /** El renglón chico: «sin observaciones», «solo Vestuarios · sin ver montos». */
  detalle: string | null
  monto: number | null
  at: string
}
