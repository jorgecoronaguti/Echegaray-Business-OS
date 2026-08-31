// QUÉ ES UNA PLANTILLA DEL OS, Y QUÉ NO.
//
// ═══ EL CONTRATO LO FIJÓ EL DUEÑO ═══
//
//   template_id · domain · file_type · version · source_file_id · fields · sections ·
//   layout_rules · required_data · output_naming · destination_policy
//
// Están los once campos, con esos nombres. No se agregan campos «de paso»: una plantilla es un
// objeto gobernado, y lo que la describe tiene que poder auditarse contra esta lista.
//
// ═══ `source_file_id`: LA IDENTIDAD ES EL ID, NUNCA EL NOMBRE ═══
//
// En este repositorio el nombre de un archivo ya mintió —uno llamado «HM» era la libreta del
// IERIC— y ya se leyó una copia congelada de Drive creyendo que era el original. Por eso una
// plantilla que sale de un archivo de Drive se identifica por su `source_file_id` y por nada más.
//
// Una plantilla NATIVA no tiene archivo de origen: la estructura vive en el código, versionada en
// git, y `source_file_id` es `null` a propósito. Es la diferencia entre las dos, y por eso hay un
// `origen` explícito: un `null` mudo sería «no sé de dónde salió», que es otra cosa.
//
// ═══ LO QUE NO ESTÁ ACÁ ═══
//
// Ni un dato de la empresa. Ni un CUIT, ni una dirección, ni un precio, ni un plazo. Una plantilla
// declara los HUECOS; los datos los trae quien la usa, de su fuente. Una plantilla con un número
// adentro es un número inventado esperando a que alguien lo firme.

import { z } from 'zod'

/** Los dominios reales de ECSAS. Cerrado: un dominio nuevo es una decisión, no un string libre. */
export const DOMINIOS = Object.freeze([
  'oferta', 'presupuesto', 'informe', 'certificado', 'reporte_financiero',
  'presentacion', 'documentacion_obra', 'planilla_control', 'documento_administrativo',
])

/** Qué archivo produce. `sheet` está declarado y NO implementado: ver `plantillas-motor.mjs`. */
export const TIPOS_ARCHIVO = Object.freeze(['doc', 'slides', 'sheet'])

export const ORIGENES = Object.freeze(['NATIVA', 'COPIA_DE_DRIVE'])

/** Dónde queda el archivo terminado. Ninguna política trae una carpeta escrita en el código: una
 *  carpeta de Drive inventada es una escritura en un lugar que nadie eligió. */
export const POLITICAS_DESTINO = Object.freeze([
  'CARPETA_EXPLICITA',   // la carpeta la pasa quien pide; sin ella no se crea
  'CARPETA_DE_LA_OBRA',  // la resuelve quien llama contra el índice de Drive de la obra
  'RAIZ_DEL_DUENO',      // sin carpeta: queda en el Drive de la cuenta que crea
])

const clave = z.string().trim().regex(/^[a-z0-9_]{1,40}$/)

export const Campo = z.object({
  clave,
  rotulo: z.string().trim().min(1).max(80),
  tipo: z.enum(['texto', 'numero', 'fecha', 'lista']),
  requerido: z.boolean().default(false),
  ayuda: z.string().trim().max(200).optional(),
})

const BloquePlantilla = z.union([
  z.object({ tipo: z.literal('parrafo'), texto: z.string().min(1).max(4000) }),
  z.object({ tipo: z.literal('lista'), items: z.array(z.string().min(1)).min(1).optional(), desde: clave.optional(), campo: clave.optional() }),
  z.object({ tipo: z.literal('datos'), pares: z.array(z.object({ clave: z.string().min(1), valor: z.string() })).min(1) }),
  z.object({
    tipo: z.literal('tabla'),
    columnas: z.array(z.string().min(1)).min(1).max(8),
    desde: clave.optional(),
    celdas: z.array(clave).optional(),
    filas: z.array(z.array(z.string())).optional(),
  }),
])

export const SeccionPlantilla = z.object({
  id: clave,
  titulo: z.string().trim().min(1).max(140),
  nivel: z.number().int().min(1).max(3).default(1),
  obligatoria: z.boolean().default(true),
  bloques: z.array(BloquePlantilla).max(40).default([]),
})

export const Plantilla = z.object({
  template_id: z.string().trim().regex(/^[a-z0-9_.]{3,60}$/),
  domain: z.enum(DOMINIOS),
  file_type: z.enum(TIPOS_ARCHIVO),
  version: z.number().int().min(1),
  origen: z.enum(ORIGENES),
  source_file_id: z.string().trim().min(10).nullable(),
  fields: z.array(Campo).min(1),
  sections: z.array(SeccionPlantilla).min(1),
  layout_rules: z.object({
    forma_decidida_por: z.enum(['MOTOR']),          // nunca por quien pide: es la regla de los dos motores
    parametros_de_forma_aceptados: z.literal(0),
    notas: z.string().max(300).optional(),
  }),
  required_data: z.array(clave),
  output_naming: z.string().trim().min(3).max(160),
  destination_policy: z.object({
    politica: z.enum(POLITICAS_DESTINO),
    carpeta_id: z.null(),                            // jamás una carpeta escrita en el código
    nota: z.string().max(200).optional(),
  }),
  // `slides` necesita saber qué tipo de deck es: el motor de presentaciones lo exige.
  tipo_deck: z.string().trim().max(20).optional(),
  estado: z.enum(['VIGENTE', 'DECLARADA_NO_IMPLEMENTADA']).default('VIGENTE'),
})

/** Coherencias que el esquema no puede ver por sí solo. PURA. */
function coherencias(p) {
  const malos = []
  if (p.origen === 'COPIA_DE_DRIVE' && !p.source_file_id) malos.push(`${p.template_id}: origen COPIA_DE_DRIVE sin source_file_id`)
  if (p.origen === 'NATIVA' && p.source_file_id) malos.push(`${p.template_id}: una plantilla NATIVA no puede tener source_file_id`)
  const claves = new Set(p.fields.map((f) => f.clave))
  for (const r of p.required_data) if (!claves.has(r)) malos.push(`${p.template_id}: required_data pide «${r}», que no está en fields`)
  for (const f of p.fields) if (f.requerido && !p.required_data.includes(f.clave)) malos.push(`${p.template_id}: el campo «${f.clave}» es requerido y no está en required_data`)
  if (p.file_type === 'slides' && !p.tipo_deck) malos.push(`${p.template_id}: una plantilla de slides necesita tipo_deck`)
  const ids = p.sections.map((s) => s.id)
  if (new Set(ids).size !== ids.length) malos.push(`${p.template_id}: hay secciones con el mismo id`)
  return malos
}

/** Valida UNA plantilla. PURA. `{ok, plantilla}` o `{ok:false, errores}`. */
export function validarPlantilla(entrada) {
  const r = Plantilla.safeParse(entrada)
  if (!r.success) return { ok: false, errores: r.error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) }
  const malos = coherencias(r.data)
  return malos.length ? { ok: false, errores: malos } : { ok: true, plantilla: r.data }
}

/** Los `{{huecos}}` que declara una plantilla, mirándola entera. PURA. */
export function huecosDeclarados(plantilla) {
  const texto = JSON.stringify(plantilla.sections) + plantilla.output_naming
  return [...new Set(texto.match(/\{\{\s*[a-z0-9_]+\s*\}\}/gi) || [])].map((s) => s.replace(/[{}\s]/g, ''))
}
