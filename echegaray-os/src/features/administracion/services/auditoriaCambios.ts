// LA BITÁCORA DE CAMBIOS, DICHA PARA UNA PERSONA.
//
// La tabla `entidad_cambio` guarda el hecho crudo: `categoria`, `medio_oficial`, `oficial`, un uuid
// y un `timestamptz`. Eso no es una fila de auditoría legible — es el registro que la produjo. Acá
// se traduce a las cuatro columnas del design: CUÁNDO · QUÉ · DE QUÉ A QUÉ · QUIÉN.
//
// ═══ TODO ESTO ES PURO, Y NO POR ELEGANCIA ═══
//
// La única forma de probar que un cambio de retribución NO publica el número, que un `null` se dice
// «vacío» y no se dibuja como un hueco, y que un cambio de 2022 no se confunde con uno de este año,
// es ejercitarlo sin base. Un renderizador que sólo se puede mirar con el sistema levantado no se
// mira nunca.
//
// ═══ EL VALOR TAPADO SE MUESTRA TAL CUAL LLEGA ═══
//
// La retribución pactada viaja como `•••` desde el trigger `auditar_cambio()` —la solapa la lee
// `es_administracion()`, que incluye al jefe de obra, y tres migraciones le cerraron esa columna—.
// Acá NO se destapa ni se intenta reconstruir: se muestra el `•••` que mandó la base y se dice al
// lado que el hecho es auditable y el número no se publica por esta ventana. Si mañana alguien
// necesita el número, la decisión es una policy partida en la base, no un `if` en esta pantalla.

// RUTAS RELATIVAS CON EXTENSIÓN en los imports de VALOR: `auditoriaCambios.test.ts` corre con
// `node --test`, que no conoce el alias `@/`.
import { etiquetaCategoria } from '../types/index.ts'
import { fecha } from '../../obras/components/formato.ts'
import { cuandoConAno } from './entradaService.ts'

/** Una fila de `entidad_cambio` tal como sale de la base. */
export interface CambioCrudo {
  id: string
  campo: string | null
  antes: string | null
  despues: string | null
  /** `auth.uid()` del que lo hizo. `null` = lo escribió el orquestador con la clave de servicio. */
  autor: string | null
  en: string
}

/** La misma fila, lista para dibujar. Nada que calcular en el componente. */
export interface CambioDicho {
  id: string
  cuando: string
  que: string
  antes: string
  despues: string
  autor: string
  /** El valor viene tapado desde la base: la pantalla lo dice, no lo disimula. */
  tapado: boolean
}

/** El valor con el que la base tapa los campos económicos. Es el del trigger, no una elección de acá. */
export const TAPADO = '•••'

/**
 * CÓMO SE LLAMA CADA COLUMNA EN CASTELLANO.
 *
 * Son las CATORCE que vigila el trigger `personas_auditar`, con los MISMOS rótulos que usa el aside
 * de la ficha —«Fecha de alta», no «fecha_ingreso»—: leer «categoria» en la auditoría y «Categoría»
 * tres centímetros más arriba obliga a traducir mentalmente entre dos pantallas de la misma persona.
 *
 * Una columna que no esté acá se muestra con su nombre crudo y no se esconde: el día que alguien
 * sume un campo al trigger, la fila aparece fea pero aparece. Perderla sería peor.
 */
export const ROTULO_CAMPO: Record<string, string> = {
  nombre_completo: 'Nombre y apellido',
  dni: 'DNI',
  cuil: 'CUIL',
  fecha_nacimiento: 'Nacimiento',
  legajo: 'Legajo',
  fecha_ingreso: 'Fecha de alta',
  fecha_egreso: 'Fecha de baja',
  en_la_empresa: 'Está en la empresa',
  categoria: 'Categoría',
  especialidad: 'Especialidad',
  puesto: 'Puesto u oficio',
  convenio_colectivo: 'Convenio',
  modalidad_liquidacion: 'Modalidad de liquidación',
  retribucion_pactada: 'Retribución pactada',
}

export function etiquetaCampo(campo: string | null): string {
  if (!campo) return 'la ficha'
  return ROTULO_CAMPO[campo] ?? campo
}

const CAMPOS_FECHA = new Set(['fecha_nacimiento', 'fecha_ingreso', 'fecha_egreso'])

/**
 * EL VALOR, DICHO COMO SE LEE EN LA FICHA.
 *
 * `to_jsonb(old) ->> campo` normaliza TODO a texto: una fecha llega `2022-03-14`, un booleano `true`
 * y una categoría `medio_oficial`. Mostrarlo crudo convierte la auditoría en un volcado de base.
 *
 * EL ORDEN DE LOS TRES CASOS IMPORTA. El tapado se resuelve PRIMERO: pasar `•••` por el formateador
 * de fechas daría «Invalid Date» y borraría el único rastro que la base dejó a propósito.
 */
export function valorDicho(campo: string | null, valor: string | null): string {
  if (valor === null) return 'vacío'
  if (valor === TAPADO) return TAPADO
  if (campo && CAMPOS_FECHA.has(campo)) return fecha(valor)
  if (campo === 'en_la_empresa') return valor === 'true' ? 'sí' : 'no'
  if (campo === 'categoria') return etiquetaCategoria(valor)
  return valor
}

/**
 * QUIÉN LO HIZO.
 *
 * TRES SITUACIONES DISTINTAS Y NINGUNA SE DISFRAZA DE OTRA:
 *
 *   `null`               lo escribió el orquestador con la clave de servicio. No hubo persona, y el
 *                        comentario de la columna en la base lo dice: no se inventa un usuario de
 *                        sistema para llenar el hueco.
 *   uuid con perfil      el nombre de esa cuenta.
 *   uuid sin perfil      la cuenta existió y hoy no tiene perfil legible. NO se escribe «cuenta
 *                        borrada» —no lo sabemos, puede ser un perfil que nunca se cargó— ni se
 *                        muestra el uuid, que no le dice nada a nadie. Se dice que no se pudo
 *                        resolver, que es exactamente lo que pasó.
 */
export function autorDicho(autor: string | null, nombres: ReadonlyMap<string, string>): string {
  if (autor === null) return 'el sistema'
  return nombres.get(autor) ?? 'sin identificar'
}

/** Las filas crudas convertidas en filas dibujables, en el orden en que llegan. */
export function decirCambios(
  filas: readonly CambioCrudo[],
  nombres: ReadonlyMap<string, string>,
  ahora: Date = new Date(),
): CambioDicho[] {
  return filas.map((f) => ({
    id: f.id,
    cuando: cuandoConAno(f.en, ahora),
    que: etiquetaCampo(f.campo),
    antes: valorDicho(f.campo, f.antes),
    despues: valorDicho(f.campo, f.despues),
    autor: autorDicho(f.autor, nombres),
    tapado: f.antes === TAPADO || f.despues === TAPADO,
  }))
}
