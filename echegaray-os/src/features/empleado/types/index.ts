// PERFIL EMPLEADO — los tipos de lo que una persona ve DE SU PROPIO TRABAJO.
//
// PERSONA ≠ USUARIO, y acá se nota más que en ningún otro lado: todo lo de este archivo cuelga de la
// PERSONA (mi obra, mi cuadrilla, mis tareas, mi asistencia, mis recibos), no de la cuenta. El
// vínculo es `perfiles.persona_id` y lo resuelve la base con `mi_persona_id()`. Una cuenta sin
// persona vinculada no ve nada de esto — y eso no es un error, es el estado inicial de toda cuenta.
//
// NINGUNA de estas lecturas filtra por persona en TypeScript. El filtro vive en las vistas `mi_*`
// (`20260820T3000` y `20260820T6000`), que llevan el portero horneado. Si el filtro estuviera acá,
// una llamada directa a PostgREST devolvería el legajo del plantel entero.

import { z } from 'zod'

/** La obra donde estoy asignado hoy. Sin una sola columna de plata: la vista no las selecciona. */
export interface MiObra {
  id: string
  nombre: string
  ubicacion: string | null
  etapa: string | null
  estado: string | null
  jefe_obra: string | null
  rol: string | null
  cuadrilla: string | null
  desde: string | null
  hasta: string | null
  actividad_id: string | null
}

/** Un compañero de cuadrilla: nombre y rol, y ahí se termina. No hay id de persona a propósito. */
export interface CompaneroDeCuadrilla {
  cuadrilla_id: string
  cuadrilla: string
  nombre_completo: string
  rol: string | null
  es_responsable: boolean
  soy_yo: boolean
}

/** Una actividad que es MÍA: soy responsable, es de mi cuadrilla, o me asignaron a ella. */
export interface MiTarea {
  id: string
  obra_id: string
  obra: string | null
  codigo: string | null
  nombre: string
  seccion: string | null
  estado: string | null
  pct: number | null
  inicio_plan: string | null
  fin_plan: string | null
  unidad: string | null
  cantidad_objetivo: number | null
  metodo_avance: string | null
  comentario: string | null
  impedimentos: number
}

/** Un impedimento abierto de una actividad mía. */
export interface MiImpedimento {
  id: string
  obra_id: string
  actividad_id: string | null
  actividad: string | null
  tipo: string | null
  descripcion: string | null
  estado: string | null
  fecha_necesidad: string | null
  creado_en: string
}

export type EstadoAsistencia = 'sin_registrar' | 'en_curso' | 'completo' | 'falta_salida'

/** Un día de presencia, armado por la base desde sus marcas. `minutos` es null mientras falte una
 *  de las dos puntas: el día en curso NO publica un total. */
export interface DiaDeAsistencia {
  fecha: string
  entrada: string | null
  salida: string | null
  incidencias: number
  motivo: string | null
  estado: EstadoAsistencia
  minutos: number | null
  obra_id: string | null
}

/** Un recibo: el PDF es real y vive en Drive; los números son los que publique la liquidación. */
export interface MiRecibo {
  id: string
  periodo: string | null
  quincena: string | null
  periodo_cierto: boolean
  nombre: string | null
  fecha_documento: string | null
  drive_file_id: string | null
  neto: number | null
  estado_pago: string | null
  fecha_pago: string | null
  fecha_emision: string | null
  dias: number | null
  hh: number | null
  categoria: string | null
  /** `false` = todavía no liquidado. NUNCA se muestra como neto 0. */
  liquidado: boolean
}

/** El legajo propio, ahora con identidad. Sin retribución pactada: no sale por la API para nadie. */
export interface MiLegajoCompleto {
  id: string
  nombre_completo: string
  dni: string | null
  cuil: string | null
  fecha_nacimiento: string | null
  nacionalidad: string | null
  telefono: string | null
  email: string | null
  domicilio: string | null
  contacto_emergencia: string | null
  contacto_emergencia_telefono: string | null
  categoria: string | null
  especialidad: string | null
  puesto: string | null
  convenio_colectivo: string | null
  art: string | null
  obra_social: string | null
  fecha_ingreso: string | null
  fecha_egreso: string | null
  en_la_empresa: boolean
  legajo: string | null
}

export type EstadoPresentacion = 'en_revision' | 'aprobado' | 'requiere_correccion'

export type EstadoCorreccion = 'pendiente' | 'aprobada' | 'rechazada'

/** Un pedido de corregir una marca. Es el PEDIDO, no el hecho: el hecho vive en `asistencia_marca` y
 *  sólo lo escribe la aprobación. `hora_propuesta` llega como `HH:MM:SS` desde Postgres. */
export interface MiCorreccion {
  id: string
  fecha: string
  tipo: 'entrada' | 'salida'
  hora_propuesta: string
  motivo: string
  estado: EstadoCorreccion
  nota_resolucion: string | null
  resuelta_en: string | null
  creado_en: string
}

// ═══ LO QUE ENTRA POR FORMULARIO ═══

/** Registrar una marca. El tipo lo decide el servidor mirando el día, no el formulario: si viniera
 *  del cliente, un `salida` mandado a mano cerraría un día que nunca se abrió. */
/**
 * El punto donde se registró la marca. LAS TRES SON OPCIONALES y llegan como texto del formulario.
 *
 * ═══ UNA MARCA SIN PUNTO ES UNA MARCA VÁLIDA ═══
 *
 * El teléfono puede negar el permiso, no tener señal de GPS o estar adentro de un galpón de chapa.
 * Fichar es lo importante; el punto es información de más. Si la coordenada no viene —o viene rota—
 * se guarda la marca sin ella y la pantalla escribe «sin ubicación», que es la verdad. Lo que no se
 * hace NUNCA es rellenarla con la de la obra: un punto inventado se ve igual que uno real y decide
 * discusiones sobre si alguien estaba donde dijo.
 */
const coordenada = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).optional().catch(undefined)

export const marcaInputSchema = z.object({
  obra_id: z.string().trim().max(120).optional().transform((v) => v || null),
  lat: coordenada(-90, 90),
  lon: coordenada(-180, 180),
  // Un radio de precisión negativo o absurdo no es un dato: se descarta y el punto queda sin él.
  precision_m: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
})

/**
 * PEDIR LA CORRECCIÓN DE UN DÍA (M05).
 *
 * El `tipo` NO viene del formulario: la pantalla sólo ofrece corregir la SALIDA, que es el caso que
 * `mi_asistencia_dia` sabe detectar (`falta_salida`). Una entrada faltante deja el día en
 * `sin_registrar` y ahí no hay nada que corregir — hay que registrar el día entero, y eso lo carga
 * Administración. Aceptar un `tipo` del cliente sería aceptar un pedido que la pantalla no sabe
 * mostrar ni la bandeja juzgar.
 *
 * Las reglas de NEGOCIO —día pasado, salida después de la entrada— viven en `services/correccion.ts`
 * y se prueban aparte: acá sólo está la forma.
 */
export const correccionInputSchema = z.object({
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Falta el día a corregir'),
  hora: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Escribí la hora con formato 18:20'),
  motivo: z.string().trim().min(3, 'Contá en una línea qué pasó ese día').max(300, 'Máximo 300 caracteres'),
})

export const incidenciaInputSchema = z.object({
  motivo: z.string().trim().min(3, 'Contá qué pasó').max(300, 'Máximo 300 caracteres'),
  obra_id: z.string().trim().max(120).optional().transform((v) => v || null),
})

export const problemaInputSchema = z.object({
  obra_id: z.string().trim().min(1, 'Falta la obra'),
  actividad_id: z.string().uuid('Elegí la tarea').or(z.literal('')).transform((v) => v || null),
  descripcion: z.string().trim().min(5, 'Contá qué está pasando').max(1000, 'Máximo 1000 caracteres'),
  // «¿Frena el trabajo?» no es decoración: un impedimento que frena es lo que el jefe mira primero.
  frena: z.enum(['si', 'no']),
})
export type ProblemaInput = z.infer<typeof problemaInputSchema>

/** El tope y los formatos de lo que se sube al legajo. Se validan en el servidor además del
 *  `accept` del input: el `accept` es una comodidad del navegador, no una cerradura. Y el bucket
 *  los vuelve a validar, que es la única capa que no se puede saltear. */
export const DOC_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
export const DOC_MAX_BYTES = 10 * 1024 * 1024
