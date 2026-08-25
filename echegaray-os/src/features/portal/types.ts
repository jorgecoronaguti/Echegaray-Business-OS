// PORTAL DEL CLIENTE — lo que el cliente ve de su propia obra.
//
// Los tipos salen del CONTRATO 28–32 y de lo que dibujan `29 · Portal del Cliente.dc.html` y
// `30 · Portal Cliente Mobile.dc.html`. Están acá —y no en `features/clientes`— porque el portal es
// la cara de AFUERA: el cliente no ve la cuenta corriente de la empresa, ve la suya, y mezclar los
// dos juegos de tipos es cómo se termina mandando a la pantalla del cliente un campo que era
// interno (el margen, la nota de gestión, el nombre del que le puso mora).
//
// ═══ LO QUE MANDA ES `AccesoPortal.permisos`, NO LA PANTALLA ═══
//
// Un acceso puede ver la obra, los montos y aprobar, cada cosa por separado (`cliente_acceso`, 31).
// La UI no dibuja un «—» donde no hay permiso: la sección NO APARECE. Un guión en la fila del monto
// dice «este certificado no tiene importe», que es falso y además es exactamente el error que este
// repo persigue en todas partes (el 0 no es vacío). Quien decide qué se dibuja es
// `seccionesVisibles()` en `reglas/permisos.ts`, con test.
//
// ═══ NULL NUNCA ES CERO ═══
//
// `avance_pct: null` es «no hay avance cargado» y `0` es «no arrancó»; `monto: null` no existe —un
// certificado sin monto no es un certificado— pero `reparo: null` sí (no toda obra retiene fondo de
// reparo, y `0` significaría que retiene cero, que es otra cosa).

/** Lo que el acceso puede ver y hacer. Espejo de las cuatro columnas de `public.cliente_acceso`. */
export interface PermisosPortal {
  puede_ver_obra: boolean
  puede_ver_montos: boolean
  puede_aprobar: boolean
  /** Ids de obra que este acceso abre. `null` = todas las del cliente. */
  obras: string[] | null
}

/** Quién está mirando el portal. */
export interface AccesoPortal {
  acceso_id: string
  cliente_id: string
  /** Con qué nombre se llama al cliente en la pantalla: «La Estrella». */
  cliente_nombre: string
  /** La persona que entra, para el avatar del header. `null` = sólo hay mail. */
  persona_contacto: string | null
  email: string
  permisos: PermisosPortal
}

/** Una obra en el selector del header — lo mínimo para nombrarla y llegar. */
export interface ObraDelSelector {
  obra_id: string
  nombre: string
}

/** Un hito de la obra tal como lo lista la solapa «Mi obra» del 29. */
export interface HitoPortal {
  id: string
  nombre: string
  /** «terminado en fecha», «3 días de atraso por lluvias», «en curso · 18 %», «sin iniciar». */
  detalle: string | null
  fecha: string | null
  estado: 'terminado' | 'atrasado' | 'en_curso' | 'sin_iniciar'
}

/** Una foto de avance publicada al cliente. */
export interface FotoPortal {
  id: string
  titulo: string
  detalle: string | null
  /** URL firmada. `null` = hay foto registrada pero no se pudo firmar: se dibuja el placeholder. */
  url: string | null
}

/**
 * El contrato de la obra tal como lo dibuja la barra «Su contrato» del 29.
 *
 * Los cuatro tramos NO se guardan: se calculan de lo cobrado, lo certificado sin cobrar y el fondo
 * de reparo retenido (ver `reglas/contrato.ts`). Acá viajan los insumos, no el resultado — si
 * viajara el resultado, la pantalla podría publicar una barra que no cierra contra el contrato.
 */
export interface ContratoPortal {
  /** Monto total contratado. `null` = sin contrato cargado ⇒ la barra no se dibuja. */
  monto: number | null
  /** Porcentaje de retención del fondo de reparo (5 = 5 %). `null` = no retiene. */
  retencion_pct: number | null
  cobrado: number
  certificado_sin_cobrar: number
  fondo_reparo: number
}

/** La obra que el cliente está mirando. */
export interface ObraPortal {
  obra_id: string
  nombre: string
  ubicacion: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  /** 0–100. `null` = sin avance publicado. */
  avance_pct: number | null
  /** El avance que el plan pedía a hoy. `null` = sin plan cargado. */
  avance_plan_pct: number | null
  /** Días de desvío contra el plan (+ atrasado, − adelantado). `null` = sin plan. */
  desvio_dias: number | null
  gente_hoy: number | null
  gente_prevista: number | null
  /** Adicionales aprobados que cambian el contrato. `null` = no se lleva el registro todavía. */
  adicionales: number | null
  contrato: ContratoPortal
  hitos: HitoPortal[]
  fotos: FotoPortal[]
  /** Fecha de la última tanda de fotos, para el rótulo de la derecha del bloque. */
  fotos_al: string | null
}

/** Lo que devuelve `getMiObra()`: quién sos, qué obras abrís y cuál estás mirando. */
export interface MiObra {
  acceso: AccesoPortal
  obras: ObraDelSelector[]
  /** `null` = el acceso no tiene ninguna obra publicada todavía. */
  obra: ObraPortal | null
}

export type EstadoCertificado =
  | 'emitido'
  | 'en_revision'
  | 'aprobado'
  | 'observado'
  | 'vencido'
  | 'cobrado'
  | 'en_disputa'

/** Una fila de la tabla de rubros del certificado que espera aprobación (29). */
export interface RubroCertificado {
  rubro: string
  contratado: number | null
  /** 0–100 acumulado del rubro. `null` = sin iniciar (el mockup escribe «sin iniciar»). */
  avance_acum_pct: number | null
  /** Lo que este certificado agrega por ese rubro. `null` = nada en este período («—»). */
  este_certificado: number | null
  /** Lo que falta certificar del rubro. `null` = nada («—»). */
  falta: number | null
}

/** Un certificado o factura emitido al cliente. Espejo de `public.certificado_cliente`. */
export interface CertificadoPortal {
  id: string
  obra_id: string
  obra_nombre: string
  /** «Certificado 5», «Certificado final». */
  numero: string
  /** «FC A 0004-131». `null` = certificado todavía sin facturar. */
  factura: string | null
  periodo_desde: string | null
  periodo_hasta: string | null
  /** Avance del período que certifica, 0–100. */
  avance_periodo_pct: number | null
  monto: number
  /** Fondo de reparo retenido en este certificado. `null` = no retiene. */
  reparo: number | null
  emitido_at: string | null
  /** Fecha de vencimiento del pago. `null` = sin fecha ⇒ NUNCA cuenta como vencido. */
  vence: string | null
  /** Cuándo se cobró. `null` = sin cobrar. */
  cobrado_at: string | null
  estado: EstadoCertificado
  observacion: string | null
  /** Detalle por rubro. Vacío = el certificado no trae apertura; la tabla no se dibuja. */
  rubros: RubroCertificado[]
  /** URL de descarga del PDF. `null` = todavía no hay archivo ⇒ el botón no se dibuja. */
  pdf_url: string | null
}

export type EstadoConsulta = 'abierta' | 'respondida' | 'cerrada'

/** Una consulta del cliente. Espejo de `public.consulta_portal`. */
export interface ConsultaPortal {
  id: string
  titulo: string
  /** La respuesta de la empresa. `null` = todavía sin responder. */
  respuesta: string | null
  estado: EstadoConsulta
  at: string
}

/** Un documento de la obra publicado al cliente (solapa Documentos del 29). */
export interface DocumentoPortal {
  id: string
  nombre: string
  /** «22/07/26 · 2,4 MB», «vence 28/12/26», «rev 3 · 8 hojas» — ya armado por el service. */
  detalle: string | null
  tipo: 'contrato' | 'plano' | 'plan' | 'poliza' | 'acta' | 'otro'
  /** Firmado por el cliente. `null` = este documento no requiere firma. */
  firmado: boolean | null
  requiere_firma: boolean
  url: string | null
}

/** Los datos de cobro que el panel «A pagar ahora» muestra al pie. */
export interface DatosDeCobro {
  /** `null` = todavía no se cargó el CBU de la empresa ⇒ la línea no se dibuja. */
  cbu: string | null
}

/** El contacto de la empresa para esa obra (bloque «Su contacto» del 29). */
export interface ContactoPortal {
  nombre: string
  rol: string
  telefono: string | null
}
