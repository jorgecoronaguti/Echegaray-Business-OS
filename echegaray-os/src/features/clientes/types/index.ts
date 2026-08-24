// CLIENTE — la entidad de arriba del módulo 01.
//
// EL CLIENTE ES LA RELACIÓN EMPRESARIAL, NO UN AGRUPADOR DE OBRAS. Tiene con quién se habla
// (contactos), dónde está y cómo se lo llama (dirección, teléfono, email), quién de la empresa lo
// atiende (responsable interno), qué papeles hay (documentos de Drive) y qué pasó (actividad).
//
// FRONTERA, la misma que la de Obras: el cliente NO administra Cobranzas, Certificación ni
// Contabilidad. Consolida lo que otras fuentes ya calculan —el costo y el contratado vienen sumados
// de `obra_panel`— y no guarda ni un número propio. Por eso `cliente_panel` no tiene un avance de
// cliente: promediar obras de tamaños distintos daría un número que no significa nada.
//
// Y NO ES UN EMBUDO COMERCIAL. No hay leads, ni oportunidades, ni etapas de venta, ni pipeline: son
// los clientes reales de la empresa. Está prohibido explícitamente y no es un olvido.

export interface ClientePanel {
  cliente_id: string
  /** El identificador legible y estable; es el que va en la URL. */
  slug: string | null
  /** Con qué nombre se habla del cliente: «Messina», «ARCOR». Es el que se muestra en todas las
   *  pantallas y el que armó el slug. Obligatorio — un cliente sin nombre no se puede nombrar. */
  nombre_comercial: string
  /** El nombre legal, el que va con el CUIT en un contrato o una factura. `null` = SIN CARGAR, y no
   *  se deriva del comercial: «Messina» no es la razón social de nadie. */
  razon_social: string | null
  cuit: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  /** Quién de la empresa atiende a este cliente. Apunta a `perfiles`, no es texto libre. */
  responsable_id: string | null
  responsable_nombre: string | null
  drive_carpeta_id: string | null
  activo: boolean
  notas: string | null
  n_obras: number
  n_obras_activas: number
  /** Suma de lo contratado de sus obras. Null mientras ninguna lo tenga cargado. */
  contratado: number | null
  costo_real: number | null
  restricciones_abiertas: number
  avance_sincronizado_en: string | null
  n_contactos: number
  n_documentos: number
}

/**
 * Una obra vista DESDE el cliente: lo mínimo que el panel lateral del canónico 00 dibuja.
 *
 * No es un `ObraPanel` recortado por comodidad: es lo único que se lee para toda la cartera de una
 * vez, y traer `select *` de todas las obras para dibujar un punto y un porcentaje sería pagar la
 * ficha entera de cada obra en la pantalla que sólo las lista.
 */
export interface ObraDePanel {
  obra_id: string
  nombre: string
  estado: string
  /** `null` = sin avance sincronizado. NO es 0 %. */
  avance_pct: number | null
}

/** Una persona del OS que puede quedar como responsable interno de un cliente. */
export interface Responsable {
  id: string
  nombre: string
  rol: string | null
}

export interface Contacto {
  id: string
  cliente_id: string
  nombre: string
  rol: string | null
  email: string | null
  telefono: string | null
  notas: string | null
  creado_en: string | null
}

/**
 * PARA QUÉ SIRVE EL PAPEL. Vocabulario CERRADO y corto: escrito a mano, el mismo contrato entra como
 * «contrato», «Contrato», «contrato firmado» y «cto», y la clasificación deja de servir para buscar.
 * `null` es «sin clasificar», que es un estado legítimo y distinto de inventarle un rol.
 *
 * Vive acá y no en `actionsDocumentos.ts` porque un archivo `'use server'` sólo puede exportar
 * funciones async: una constante exportada desde ahí rompe el build entero.
 */
export const ROLES_DOCUMENTO = [
  'contrato', 'presupuesto', 'plano', 'factura', 'certificado', 'acta', 'pliego', 'orden de compra',
] as const

export type RolDocumento = (typeof ROLES_DOCUMENTO)[number]

/** Un archivo de Drive vinculado al cliente. El archivo NO se copia: vive en Drive. */
export interface DocumentoCliente {
  drive_file_id: string
  /** Para qué sirve el papel: contrato, plano, presupuesto, factura… Se clasifica desde la lista. */
  rol: string | null
  /** `path_inferido` = lo colgó el sincronizador por la carpeta. `manual` = lo puso una persona. */
  origen: 'manual' | 'path_inferido'
  name: string | null
  path: string | null
  mime_type: string | null
  modified_time: string | null
  creado_en: string | null
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ACTIVIDAD — la línea de tiempo, DERIVADA de las fechas que ya existen
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type TipoEvento =
  | 'cliente_alta'
  | 'nota'
  | 'cliente_actualizado'
  | 'contacto_alta'
  | 'obra_alta'
  | 'obra_inicio'
  | 'obra_fin'
  | 'documento_alta'
  | 'certificacion'
  | 'facturacion'
  | 'cobranza'

/** De dónde salió el evento, en el idioma de la empresa. En pantalla NUNCA se escribe el nombre de
 *  una tabla: quien lee la ficha no tiene por qué saber que existe `cliente_documento`. */
export type FuenteEvento = 'Ficha' | 'Contactos' | 'Obras' | 'Documentos' | 'Certificación' | 'Nota'

export interface EventoCliente {
  /** Única y estable: ordena el desempate y es la key de React. */
  clave: string
  /** La fecha tal como está guardada (día o instante). El formato lo pone la pantalla. */
  fecha: string
  /** La fecha en milisegundos, para ordenar. No se muestra. */
  orden: number
  tipo: TipoEvento
  titulo: string
  detalle: string | null
  /** Sólo los eventos contractuales llevan importe. */
  monto?: number | null
  href: string | null
  fuente: FuenteEvento
}

export interface LineaDeTiempo {
  eventos: EventoCliente[]
  /** El aviso cuando las notas manuales NO se pudieron leer —la migración todavía no está aplicada
   *  en esta base—. `null` es «se leyeron bien», y NO es lo mismo que «no hay ninguna»: si esto
   *  tuviera valor y la pantalla lo ignorara, una ficha sin notas se vería idéntica a una ficha
   *  cuyas notas no se pudieron traer. */
  notasNoDisponibles?: string | null
  /** Registros REALES que existen pero no tienen fecha, así que no se pueden ubicar. Se cuentan
   *  para poder decirlo: una línea de tiempo que omite en silencio miente por omisión. */
  sinFecha: number
}

/** Una nota escrita a mano. Es lo ÚNICO de la actividad que no se deriva de otra fila: «llamé al
 *  arquitecto y la certificación de agosto entra en septiembre» no está guardado en ningún lado. */
export interface NotaCliente {
  id: string
  texto: string
  /** Quién la escribió. Sale de `auth.uid()` por default, nunca del formulario. `null` cuando la
   *  persona se dio de baja: la nota queda sin firma, que es la verdad, en vez de desaparecer. */
  autor_id: string | null
  autor_nombre: string | null
  creado_en: string | null
}

/** Lo que la línea de tiempo necesita leer. Todo sale de una fila real con su fecha real. */
export interface FuentesActividad {
  cliente: { nombre: string; creado_en: string | null; actualizado_en: string | null }
  contactos: { id: string; nombre: string; rol: string | null; creado_en: string | null }[]
  obras: {
    obra_id: string
    nombre: string
    creada_en: string | null
    fecha_inicio_real: string | null
    fecha_fin_real: string | null
  }[]
  documentos: {
    drive_file_id: string
    name: string | null
    rol: string | null
    /** `path_inferido` lo colgó el sincronizador; `manual`, una persona. Cambia si se agrupa o no. */
    origen: 'manual' | 'path_inferido'
    creado_en: string | null
  }[]
  /** Opcional a propósito: una base sin la migración de notas aplicada no tiene ninguna, y eso no
   *  puede impedir que se arme el resto de la línea de tiempo. */
  notas?: NotaCliente[]
  /** El aviso a arrastrar hasta la pantalla cuando las notas no se pudieron leer. */
  notasNoDisponibles?: string | null
  certificados: {
    id: string
    numero: string | null
    obra_id: string | null
    obra_nombre: string
    fecha_certificacion: string | null
    monto_certificado: number | null
    fecha_facturacion: string | null
    monto_facturado: number | null
    fecha_cobranza: string | null
    monto_cobrado: number | null
  }[]
}
