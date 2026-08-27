// EL CONTRATO DE UNA PRESENTACIÓN. Lo que el modelo puede pedir, y nada más.
//
// La narrativa la escribe el modelo; la forma la decide el motor. La frontera entre las dos cosas
// es este esquema: acá NO hay un solo campo de posición, tamaño, color, fuente ni margen. Si el
// modelo pudiera pedir «este título en 40 pt más a la izquierda», la plantilla dejaría de ser una
// plantilla en la segunda corrida.
//
// Zod y no una validación a mano porque la entrada la produce un modelo: va a mandar campos de
// más, tipos raros y listas vacías, y el error tiene que ser legible para que el propio modelo
// pueda corregirse en el siguiente turno.

import { z } from 'zod'

const texto = (max) => z.string().trim().min(1).max(max)
const opcional = (max) => z.string().trim().max(max).optional().nullable()

/** Los seis tipos de presentación que la empresa usa de verdad. Cada uno cambia el TONO y el
 *  esqueleto por defecto (ver `guiones.mjs`), nunca la grilla ni la tipografía. */
export const TIPOS_DECK = ['CLIENTE', 'AVANCE_OBRA', 'COMERCIAL', 'DIRECCION', 'TECNICO', 'PRESUPUESTO']

/** De dónde sale el dato de la lámina. Por defecto ECSAS: lo externo hay que declararlo, no al
 *  revés — un dato sin declarar tiene que ser el propio, no el ajeno. */
const Origen = z.enum(['ECSAS', 'EXTERNO']).default('ECSAS')

/** La fuente de un dato externo. Sin url no entra: un dato de afuera sin dónde verificarlo es
 *  exactamente lo que la regla de oro prohíbe poner en una lámina. */
export const Fuente = z.object({
  titulo: texto(160),
  url: z.string().url(),
  obtenido_en: opcional(40),
  frescura: opcional(80),
})

const Punto = z.string().trim().min(1).max(300)

const Comun = { kicker: opcional(60), titulo: texto(140), nota: opcional(240), origen: Origen, fuentes: z.array(Fuente).max(4).optional(),
  // ÉNFASIS: la lámina se dibuja sobre grafito. Un mazo entero en blanco se lee plano; una lámina
  // oscura cada tantas da ritmo y marca lo que hay que recordar. Es lo ÚNICO parecido a una decisión
  // visual que el contenido puede pedir, y ni siquiera elige el color: elige la jerarquía.
  enfasis: z.boolean().optional() }

export const Lamina = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('seccion'), titulo: texto(90), bajada: opcional(180) }),
  z.object({ ...Comun, tipo: z.literal('puntos'), bajada: opcional(260), puntos: z.array(Punto).min(1).max(12) }),
  z.object({
    ...Comun,
    tipo: z.literal('dos_columnas'),
    izquierda: z.object({ titulo: texto(60), puntos: z.array(Punto).min(1).max(8) }),
    derecha: z.object({ titulo: texto(60), puntos: z.array(Punto).min(1).max(8) }),
  }),
  z.object({
    ...Comun,
    tipo: z.literal('indicadores'),
    bajada: opcional(240),
    indicadores: z.array(z.object({
      rotulo: texto(48), valor: texto(24), nota: opcional(70),
      tono: z.enum(['neutro', 'positivo', 'negativo', 'alerta']).default('neutro'),
      origen: Origen,
    })).min(2).max(4),
  }),
  z.object({
    ...Comun,
    tipo: z.literal('tabla'),
    columnas: z.array(texto(40)).min(2).max(6),
    filas: z.array(z.array(z.string().max(80))).min(1).max(9),
    alinear_derecha: z.array(z.number().int().min(0).max(5)).optional(),
  }),
  z.object({
    ...Comun,
    tipo: z.literal('barras'),
    unidad: opcional(40),
    series: z.array(z.object({
      rotulo: texto(48), valor: z.number(), texto: opcional(24),
      tono: z.enum(['neutro', 'positivo', 'negativo', 'alerta']).default('neutro'),
    })).min(2).max(8),
  }),
  z.object({
    ...Comun,
    tipo: z.literal('hitos'),
    hitos: z.array(z.object({
      fecha: texto(24), titulo: texto(70), detalle: opcional(120),
      estado: z.enum(['hecho', 'en_curso', 'pendiente']).default('pendiente'),
    })).min(2).max(6),
  }),
  // FLUJO — un proceso encadenado. `gate` es lo que hay que cumplir para pasar al paso siguiente:
  // sin él, la cadena muestra el orden pero no lo que la gobierna.
  z.object({
    ...Comun,
    tipo: z.literal('flujo'),
    pasos: z.array(z.object({
      titulo: texto(40), gate: opcional(30), destacado: z.boolean().optional(),
    })).min(2).max(6),
  }),
  // IMAGEN — la URL tiene que ser pública: `createImage` la baja Google, sin credenciales nuestras.
  // Se exige https por la misma razón por la que el contenido externo pasa por su propia puerta.
  z.object({
    ...Comun,
    tipo: z.literal('imagen'),
    imagen_url: z.string().url().startsWith('https://'),
    epigrafe: opcional(120),
  }),
  z.object({ tipo: z.literal('cierre'), titulo: texto(90), mensaje: opcional(220), contacto: opcional(160) }),
])

export const Presentacion = z.object({
  tipo: z.enum(TIPOS_DECK),
  titulo: texto(120),
  subtitulo: opcional(200),
  cliente: opcional(80),
  obra: opcional(80),
  fecha: opcional(40),
  laminas: z.array(Lamina).min(1).max(30),
  carpeta_id: opcional(80),
})

/** Valida y devuelve `{ok, deck}` o `{ok:false, errores:[...]}` en castellano llano. PURA. */
export function validarPresentacion(entrada) {
  const r = Presentacion.safeParse(entrada)
  if (r.success) return { ok: true, deck: r.data }
  const errores = r.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
  return { ok: false, errores }
}
