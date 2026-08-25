import { z } from 'zod'
import type { EstadoCertificado, EstadoPago, MedioPago } from '@/features/clientes/types'

// PORTAL DEL CLIENTE — lo que el cliente ve de su propia obra, y las reglas que lo confinan ahí.
//
// Los tipos salen del CONTRATO 28–32 y de lo que dibujan `29 · Portal del Cliente.dc.html` y
// `30 · Portal Cliente Mobile.dc.html`. Están acá —y no en `features/clientes`— porque el portal es
// la cara de AFUERA: el cliente no ve la cuenta corriente de la empresa, ve la suya, y mezclar los
// dos juegos de tipos es cómo se termina mandando a la pantalla del cliente un campo que era
// interno (el margen, la nota de gestión, el nombre del que le puso mora).
//
// ═══ LO QUE SÍ SE COMPARTE CON `features/clientes`: LOS TRES ENUM ═══
//
// `EstadoCertificado`, `EstadoPago` y `MedioPago` se IMPORTAN de allá y no se vuelven a declarar.
// Al integrar los frentes había TRES copias del mismo enum, con los mismos siete valores. Un enum
// no es un campo: no filtra ni deja de filtrar nada, es la lista de valores que el CHECK de
// `certificado_cliente.estado` permite guardar. Copiarlo garantiza que el día que la base admita un
// octavo estado, dos de las tres copias sigan sin conocerlo.
//
// La frontera que el bloque de arriba defiende sigue en pie y es la que importa: las INTERFACES de
// fila del portal son propias y más angostas que las de administración a propósito.
//
// ═══ EL CONFINAMIENTO ES EN LAS DOS DIRECCIONES ═══
//
// El `cliente` es el primer rol EXTERNO del sistema: no es un empleado con menos permisos, es
// alguien de otra empresa. El cliente no sale de /portal, y nadie de adentro entra a /portal.
//
// La segunda mitad suele olvidarse y no es cosmética: /portal dibuja lo que ve el cliente, y un
// empleado mirando esa pantalla estaría viendo datos filtrados por `cliente_de_sesion()`, que para
// él devuelve NULL. Vería una pantalla vacía y creería que el cliente no tiene nada.
//
// ═══ LO QUE MANDA ES `PermisosPortal`, NO LA PANTALLA ═══
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

export type { EstadoCertificado, EstadoPago, MedioPago }

// ─────────────────────────────────────────────────────────────────────────────
// EL CORRAL DEL ROL `cliente`
//
// Las rutas y `destinoPorRol` NO se declaran acá: viven en `rutas.ts`, que no importa nada. Las
// necesita el middleware en cada request y este archivo arrastra Zod. Se re-exportan para que
// `@/features/portal/types` siga siendo la puerta de quien ya las importaba de acá.

export {
  RUTA_PORTAL, RUTA_PORTAL_INGRESAR, destinoPorRol, esRutaPortal, rutaObraPortal,
} from './rutas.ts'

// ─────────────────────────────────────────────────────────────────────────────
// ENTRADAS DE USUARIO. Todo lo que escribe una persona se valida con Zod.

/** El mail con el que el cliente pide su link de acceso. */
export const pedirLinkSchema = z.object({
  // `toLowerCase` acá y no en la base: el CHECK de `cliente_acceso.email` exige el mail ya
  // normalizado, así que normalizar en el borde evita que el rechazo llegue como error de Postgres.
  email: z.string().trim().toLowerCase().email('Escribí un correo válido'),
})
export type PedirLinkInput = z.infer<typeof pedirLinkSchema>

export const observarCertificadoSchema = z.object({
  certificadoId: z.string().uuid(),
  texto: z.string().trim().min(10, 'Contanos qué observás, con un poco de detalle').max(2000),
})

export const informarTransferenciaSchema = z.object({
  /**
   * EL CERTIFICADO QUE EL CLIENTE DICE ESTAR PAGANDO, que es lo que el panel del `29` le ofrece
   * elegir. La tabla `pago_informado` NO apunta al certificado: apunta a la fila del esquema
   * (`esquema_pago_id`), y son dos filas distintas del mismo cobro unidas por `cobranza_fila`.
   * La traducción la hace la action, del lado del servidor. Antes viajaba `certificado_id` a un
   * campo llamado `esquemaPagoId`: el `unknown` de la firma lo dejaba pasar y el aviso se guardaba
   * sin vínculo — o rebotaba contra la FK.
   */
  certificadoId: z.string().uuid().nullable().optional(),
  esquemaPagoId: z.string().uuid().nullable().optional(),
  // Positivo y con techo: un cero no informa nada y un número absurdo suele ser un error de tipeo
  // que después hay que ir a limpiar a mano.
  monto: z.number().positive('El importe tiene que ser mayor a cero').max(1_000_000_000),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  referencia: z.string().trim().max(200).optional(),
  comprobanteStoragePath: z.string().trim().max(500).nullable().optional(),
})

export const crearConsultaSchema = z.object({
  obraId: z.string().trim().max(120).nullable().optional(),
  titulo: z.string().trim().min(3, 'Ponele un título').max(160),
  cuerpo: z.string().trim().min(10, 'Contanos un poco más').max(4000),
})

// LAS FORMAS QUE RECIBEN LAS ACTIONS, INFERIDAS DEL ESQUEMA QUE LAS VALIDA.
//
// No son decorativas. Las acciones recibían `entrada: unknown` y con eso la pantalla mandaba
// `{ obra_id }` a un esquema que espera `obraId`: compilaba, el `safeParse` lo daba por válido
// —el campo es opcional— y la consulta se guardaba sin obra. Nadie se enteraba. Con el tipo, es un
// error de compilación. El `safeParse` de adentro se queda igual: el tipo protege del error de
// programación, el parse protege del `curl`.
export type InformeDeTransferencia = z.input<typeof informarTransferenciaSchema>
export type ConsultaNueva = z.input<typeof crearConsultaSchema>

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE EL PORTAL DEVUELVE

/**
 * Lo que el acceso puede ver y hacer. Espejo de las cuatro columnas de `public.cliente_acceso`.
 *
 * EN SNAKE_CASE, como las columnas. El frente de datos lo había traído en camelCase; se elige la
 * grafía de la base porque es la que hace evidente, al leer el service, que no se está derivando
 * un permiso de otra cosa — `puede_ver_montos` es la columna, no una conclusión.
 */
export interface PermisosPortal {
  puede_ver_obra: boolean
  puede_ver_montos: boolean
  puede_aprobar: boolean
  /** Ids de obra que este acceso abre. `null` = todas las del cliente. */
  obras: string[] | null
}

/**
 * QUIÉN ESTÁ MIRANDO EL PORTAL.
 *
 * Se llamaba `AccesoPortal` y se renombró al integrar: `AccesoPortal` ya existe en
 * `features/clientes/types` y es OTRA cosa —la fila entera de `cliente_acceso`, con la fecha de
 * revocación y quién la habilitó, que es lo que administra la pantalla 31—. Dos tipos distintos con
 * el mismo nombre en el mismo repo es exactamente la confusión que hay que evitar: acá viaja la
 * IDENTIDAD de la sesión, ya recortada a lo que el portal puede mostrar.
 */
export interface QuienMira {
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

/**
 * Lo que devuelve `getMiObra()`: quién sos, qué obras abrís y cuál estás mirando.
 *
 * `cobro` y `contactos` viajan acá y no en dos funciones aparte porque son UNA lectura de la misma
 * relación —el CBU con el que se le cobra a este cliente y quién lo atiende— y el portal las dibuja
 * siempre juntas, en la misma columna de la derecha del `29`.
 */
export interface MiObra {
  acceso: QuienMira
  obras: ObraDelSelector[]
  /** `null` = el acceso no tiene ninguna obra publicada todavía. */
  obra: ObraPortal | null
  cobro: DatosDeCobro
  contactos: ContactoPortal[]
}

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
