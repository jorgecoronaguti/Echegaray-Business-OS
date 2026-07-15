// Feature Integraciones — visibilidad de CÓMO y DÓNDE conecta el OS con sistemas externos.
// El ESTADO y la SALUD vienen de public.integraciones (única fuente de verdad, la escribe el
// orquestador). La GUÍA DE CONEXIÓN (pasos para conectar/desbloquear cada API) vive acá en
// código: es conocimiento operativo estable, versionado y auditable.

export type EstadoIntegracion = 'vivo' | 'en_curso' | 'planeado' | 'bloqueado'
export type SaludIntegracion = 'ok' | 'degradada' | 'sin_datos' | 'desconocida'

export interface Integracion {
  slug: string
  nombre: string
  dato: string | null
  direccion: string | null
  fuente_verdad: string | null
  metodo: string | null
  frecuencia: string | null
  estado: EstadoIntegracion
  politica: string | null
  ultimo_sync: string | null
  salud: SaludIntegracion
  notas: string | null
  updated_at: string
}

export const ESTADO_LABEL: Record<EstadoIntegracion, string> = {
  vivo: 'Conectada',
  en_curso: 'En curso',
  planeado: 'Planeada',
  bloqueado: 'Bloqueada',
}

export const ESTADO_BADGE: Record<EstadoIntegracion, string> = {
  vivo: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  en_curso: 'bg-amber-100 text-amber-800 border border-amber-200',
  planeado: 'bg-gray-100 text-gray-700 border border-gray-200',
  bloqueado: 'bg-red-100 text-red-800 border border-red-200',
}

export const SALUD_BADGE: Record<SaludIntegracion, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  degradada: 'bg-amber-50 text-amber-700',
  sin_datos: 'bg-gray-50 text-gray-600',
  desconocida: 'bg-gray-50 text-gray-500',
}

export const ORDEN_ESTADO: Record<EstadoIntegracion, number> = {
  vivo: 0,
  en_curso: 1,
  bloqueado: 2,
  planeado: 3,
}

// Guía de conexión por integración: qué falta hacer y quién debe hacerlo. `accion` es el
// paso concreto pendiente; `pasos` el detalle. Se muestra sobre todo cuando NO está viva.
export interface GuiaConexion {
  como: string
  accion: string
  pasos: string[]
  quien: 'dueño' | 'os' | 'automatico'
}

export const GUIA_CONEXION: Record<string, GuiaConexion> = {
  arca: {
    como: 'AfipSDK (clave fiscal) para listar comprobantes + WSAA por certificado para facturar/IVA/padrón.',
    accion: 'Autorizar el certificado en ARCA (~10 min) para habilitar los web services oficiales.',
    pasos: [
      'Los comprobantes de junio ya se extrajeron y están cargados (Libro IVA operativo en el chat).',
      'Para automatizar la descarga mensual y facturar desde el OS: autorizar el certificado en el portal de ARCA (Administrador de Relaciones).',
      'Rotar la clave fiscal (se tipeó en el chat); no rompe la integración, que va por certificado.',
    ],
    quien: 'dueño',
  },
  appsheet_pedidos: {
    como: 'La app AppSheet se respalda en un Google Sheet. El OS ya tiene acceso a Sheets; falta que ese Sheet sea visible para la cuenta del OS.',
    accion: 'Compartir el Google Sheet de respaldo con jorge@ecsas.com.ar (o decir qué cuenta lo posee).',
    pasos: [
      'Abrir la app en AppSheet → menú Data → ver el spreadsheet fuente.',
      'Compartir ese Sheet con jorge@ecsas.com.ar con permiso de edición.',
      'Con eso, el OS conecta pedido → compra → costo por obra sin recargar nada a mano.',
    ],
    quien: 'dueño',
  },
  google_workspace: {
    como: 'OAuth por usuario: el OS actúa COMO la persona en Drive/Sheets/Gmail/Calendar.',
    accion: 'Reconectar Google en la extensión para los scopes nuevos de Gmail/Calendar.',
    pasos: [
      'Lectura de Drive/Sheets ya está viva.',
      'Para enviar mails / crear eventos: reconectar la cuenta desde ⚙ en la extensión (scopes gmail.send / calendar).',
      'Publicar la app OAuth a producción evita re-autorizar cada 7 días.',
    ],
    quien: 'dueño',
  },
  banco_santander: {
    como: 'Sin API abierta en Argentina para PyME: se conecta por importación del extracto (CSV/PDF).',
    accion: 'Definir el circuito de importación del extracto mensual.',
    pasos: [
      'Descargar el extracto del homebanking.',
      'El OS lo lee y concilia movimientos contra caja/costos.',
    ],
    quien: 'dueño',
  },
  dgr_san_juan: {
    como: 'Ingresos brutos y vencimientos de la DGR San Juan.',
    accion: 'Evaluar acceso (portal / clave) para automatizar vencimientos.',
    pasos: ['Relevar si la DGR expone consulta por clave para automatizar el calendario de vencimientos.'],
    quien: 'os',
  },
  supabase: {
    como: 'Base de datos propia del OS (Postgres + RLS).',
    accion: 'Nada pendiente: es la base del OS.',
    pasos: [],
    quien: 'automatico',
  },
}

export function ordenar(items: Integracion[]): Integracion[] {
  return [...items].sort(
    (a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || a.nombre.localeCompare(b.nombre),
  )
}

export function contar(items: Integracion[]) {
  return {
    vivas: items.filter((i) => i.estado === 'vivo').length,
    enCurso: items.filter((i) => i.estado === 'en_curso').length,
    bloqueadas: items.filter((i) => i.estado === 'bloqueado').length,
    planeadas: items.filter((i) => i.estado === 'planeado').length,
  }
}
