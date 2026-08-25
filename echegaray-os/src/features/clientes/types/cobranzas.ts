// LA CUENTA CORRIENTE, EL ESQUEMA DE PAGO Y EL ACCESO AL PORTAL DE UN CLIENTE.
//
// Son los tipos de las pantallas 28 · 31 · 32, y también los que lee el portal del cliente (29/30)
// a través de `features/portal`. UNA sola definición por concepto, acá.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE Y NO DOS ═══
//
// Los tres frentes que construyeron estas pantallas llegaron con DOS archivos que definían los
// mismos conceptos con nombres distintos (`CuentaCorriente`/`CuentaCorrienteCliente`,
// `EstadoPago`/`EstadoPagoEsquema`, `MedioPago`/`MedioPagoEsquema`). Dejar los dos con un alias
// habría sido peor que el conflicto: el día que alguien corrige un campo, lo corrige en uno solo.
//
// LOS NOMBRES ELEGIDOS SON LOS CORTOS, y no por gusto:
//   · dentro de `features/clientes` el sufijo `Cliente` es ruido — todo acá es de un cliente;
//   · `EstadoPagoEsquema` y `MedioPagoEsquema` nombran la TABLA donde el valor está guardado, no el
//     concepto. Un medio de pago es transferencia/cheque/efectivo venga de donde venga; bautizarlo
//     por su tabla garantiza un segundo nombre en cuanto una segunda tabla lo guarde;
//   · y son los que el propio frente de datos ya usaba en `features/portal/types.ts`, así que eran
//     los únicos con dos consumidores antes de esta integración.
//
// ═══ LOS CAMPOS LOS MANDA LA BASE ═══
//
// Cada interface de fila es la forma que devuelven `public.certificado_cliente`, `esquema_pago`,
// `cliente_acceso`, `cliente_actividad_portal` y la vista `cliente_cuenta_corriente`. Lo que la
// base no publica NO está acá aunque la pantalla lo quisiera: un campo declarado sin fuente termina
// dibujado con un valor que nadie puede reproducir. Los únicos agregados son los NOMBRES resueltos
// por join (`obra_nombre`, `obras_nombres`, `persona`), que sí tienen fuente — la FK — y que el
// service resuelve una vez para que la pantalla no pida la ficha de cada obra para dibujar una fila.
//
// ═══ TODO NÚMERO QUE PUEDE FALTAR ES `number | null` ═══
//
// No hay ceros por defecto y no es estilo: un saldo `0` dice «este cliente no debe nada» y un `null`
// dice «no lo sabemos todavía». Sobre una pantalla de cobranzas la diferencia entre las dos frases
// es una llamada que se hace o no se hace. Los que acá son `number` a secas lo son porque la vista
// los envuelve en `coalesce(...,0)`: ahí el cero SÍ es una afirmación.

/**
 * Una fila de `public.cliente_cuenta_corriente`. Los nombres son los de la vista, uno a uno.
 *
 * NO TIENE `dso_objetivo`, `efectividad_delta_pts` NI `fondo_reparo_libera`. Los pedía el mockup y
 * ninguno tiene fuente: no hay objetivo de DSO declarado por nadie, no se guarda la efectividad del
 * período anterior contra la cual medir un delta, y `certificado_cliente` no tiene fecha de
 * liberación del reparo. La pantalla los declara ausentes en vez de inventarlos.
 */
export interface CuentaCorriente {
  cliente_id: string
  nombre_comercial: string
  saldo: number
  vencido: number
  por_vencer: number
  comprobantes_pendientes: number
  /** Las 5 bandas del aging, por la fecha de la columna Q. La primera es «todavía no venció».
   *  ES LA ÚNICA DEFINICIÓN DEL AGING del OS: la web, el chat y Claude Code leen estos números. */
  aging_por_vencer: number
  aging_1_30: number
  aging_31_60: number
  aging_61_90: number
  aging_mas_90: number
  facturado_90d: number
  cobrado_90d: number
  /** (saldo / facturado 90d) x 90. NULL cuando no se facturó nada en la ventana — no 0. */
  dso: number | null
  /**
   * cobrado 90d / (cobrado 90d + vencido). NO es tasa de pago EN TÉRMINO: esa no es computable,
   * porque la columna Q del Sheet pisa la fecha prometida con la real al cobrarse.
   */
  efectividad_pct: number | null
  /** Días entre emitir y cobrar, promedio de lo cobrado en 90 días. El comportamiento observado. */
  dias_cobro_promedio: number | null
  /** Reparo retenido y no liberado. Margen ya ganado y todavía no cobrado. */
  fondo_reparo: number
}

/**
 * Los siete estados del CHECK de `certificado_cliente.estado`. No hay un octavo.
 *
 * NO INCLUYE `retenido` NI `a_vencer`, que el frente de administración había agregado: la base no
 * los puede guardar, y los dos son derivados. «A vencer» es `vence` contra hoy —se calcula, no se
 * guarda— y «retenido» no es el estado de un certificado sino la columna `reparo` de uno: un
 * certificado con fondo de reparo sigue siendo un certificado emitido.
 */
export type EstadoCertificado =
  | 'emitido' | 'en_revision' | 'aprobado' | 'observado' | 'vencido' | 'cobrado' | 'en_disputa'

/** Un certificado o una factura emitida al cliente — la fila de «Certificados y facturas» (28). */
export interface CertificadoCliente {
  id: string
  cliente_id: string
  obra_id: string | null
  /** Resuelto por join contra `obra_canonica`. `null` = el certificado no tiene obra asignada, que
   *  hoy es TODO lo que materializa el sync: no escribe `obra_id`. Ver el informe de integración. */
  obra_nombre: string | null
  /** «Certificado 4», «Certificado final», «Fondo de reparo · Playón de carga». */
  numero: string
  /** «FC A 0004-131». `null` = certificado emitido y todavía sin facturar. */
  factura: string | null
  periodo_desde: string | null
  periodo_hasta: string | null
  /** % de avance del período que certifica. 0–100. */
  avance_periodo: number | null
  monto: number
  /** Fondo de reparo retenido en ESTE documento. `null` = el contrato no retiene. */
  reparo: number | null
  emitido_at: string | null
  /**
   * La fecha de la columna Q de Cobranzas (ISO). `null` = sin vencimiento pactado; NO se asume hoy.
   *
   * NO HAY UN `cobrado_at` AL LADO, y no es un olvido. La columna Q es UNA celda que guarda la
   * fecha esperada mientras el cobro está pendiente y se PISA con la fecha real al cobrarse. Para
   * un certificado `cobrado`, `vence` YA ES el día en que se cobró. Un segundo campo sería la misma
   * fecha con otro nombre, y compararlos daría cero atraso siempre: una métrica que se cumple sola.
   */
  vence: string | null
  estado: EstadoCertificado
  /** Lo que el cliente observó. Es el «por qué» de una disputa. */
  observacion: string | null
  /** Fila de la pestaña Cobranzas que lo cobra. Es la trazabilidad al Sheet. */
  cobranza_fila: number | null
  /** El detalle de rubros que dibuja la 29. `unknown` a propósito: su forma la define el
   *  certificado real de cada obra, y la tabla lo guarda como jsonb sin esquema fijo. */
  detalle_rubros: unknown
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

/** Una fila de `public.esquema_pago` (pantalla 32). */
export interface PagoEsquema {
  id: string
  cliente_id: string
  obra_id: string | null
  /** Resuelto por join, igual que en el certificado. */
  obra_nombre: string | null
  /** Fila de Cobranzas que representa. `null` = previsto, todavía sin fila en el Sheet.
   *  También es lo que decide si el monto se puede editar — ver `montoBloqueado`. */
  cobranza_fila: number | null
  /** «Certificado 4 · FC A 0004-131», «Fondo de reparo del contrato». */
  concepto: string
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
  /** `jsonb not null default '[]'`. Se tipa con su forma real y no con `unknown` porque quien lo
   *  escribe es `esquemaActions`, en este mismo repo: la forma no es un misterio del dato. */
  reprogramaciones: Reprogramacion[]
  publicado_at: string | null
  /** Hay ediciones que el cliente todavía no vio. */
  cambio_pendiente: boolean
  orden: number
}

/** Lo que devuelve `getEsquemaCliente`: los pagos y el contrato contra el que se controlan. */
export interface EsquemaCliente {
  cliente_id: string
  /** Lo contratado, sumado de las obras del cliente (`cliente_panel.contratado`). `null` = sin
   *  contrato cargado, y entonces «falta asignar» no se puede afirmar. */
  contrato_total: number | null
  pagos: PagoEsquema[]
}

/** El estado de la cola, que vuelve a la pantalla 28/32 para que se vea qué pasó con el pedido. */
export type EstadoCambioCobranza = 'pendiente' | 'procesando' | 'aplicado' | 'rechazado' | 'error'

export interface CambioCobranza {
  id: string
  esquema_pago_id: string | null
  cobranza_fila: number
  campo: 'fecha' | 'monto' | 'medio' | 'estado_cobrado'
  valor_nuevo: string | null
  valor_anterior: string | null
  estado: EstadoCambioCobranza
  motivo: string | null
  pedido_at: string
  aplicado_at: string | null
  /** Lo que se releyó de la celda del Sheet. Vacío = todavía no se escribió. */
  leido_de_vuelta: string | null
}

/** Un mail habilitado a entrar al portal del cliente (31) — fila de `public.cliente_acceso`. */
export interface AccesoPortal {
  id: string
  cliente_id: string
  email: string
  /** Nombre de la persona. `null` = se cargó el mail sin nombre. */
  persona_contacto: string | null
  puede_ver_obra: boolean
  puede_ver_montos: boolean
  puede_aprobar: boolean
  /** NULL = todas las obras del cliente (incluidas las futuras). Array vacío = ninguna. No son lo
   *  mismo, y por eso el tipo distingue `null` de `[]`. */
  obras: string[] | null
  /** Los nombres de esas obras, resueltos por join. `null` cuando `obras` es `null`. */
  obras_nombres: string[] | null
  habilitado_at: string | null
  invitacion_enviada_at: string | null
  primer_ingreso_at: string | null
  ultimo_ingreso_at: string | null
  /** «iPhone · Córdoba». Texto ya armado por la lectura. */
  ultimo_dispositivo: string | null
  revocado_at: string | null
  /** Se completa en el primer ingreso. `null` = todavía no entró nunca. */
  auth_user_id: string | null
}

export type TipoActividadPortal =
  | 'aprobo_certificado' | 'observo_certificado' | 'descargo_factura'
  | 'habilitado' | 'ingreso' | 'consulta' | 'informo_transferencia'

/** Una línea de «Qué hicieron en el portal» (31) — fila de `public.cliente_actividad_portal`. */
export interface ActividadPortal {
  id: string
  cliente_id: string
  acceso_id: string | null
  tipo: TipoActividadPortal
  /** Quién lo hizo, resuelto por join contra `cliente_acceso`. `null` = lo hizo la administración,
   *  no una persona del cliente (por ejemplo `habilitado`). */
  persona: string | null
  /** Sobre qué: «certificado 4», «FC A 0004-118», «l.paz@laestrella.com». */
  referencia: string | null
  /** El renglón chico: «sin observaciones», «solo Vestuarios · sin ver montos». */
  detalle: string | null
  monto: number | null
  at: string
}
