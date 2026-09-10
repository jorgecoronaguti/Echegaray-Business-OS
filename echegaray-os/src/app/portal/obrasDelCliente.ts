import { contratoDeLaObra, type ContratoDeObra } from './esquema.ts'

// LAS OBRAS DEL CLIENTE, COMO LAS VE EL CLIENTE — núcleo puro, sin base.
//
// ═══ POR QUÉ EXISTE (10/09/2026) ═══
//
// El portal de Messina listaba TRECE obras, y dos de ellas —«BSA - Planta» y «Pisos 120m2»— ya no
// existen: el 10/09 se fusionaron en «ME - BSA» y «ME - PISOS 120 M² Y RAMPA» (`obra_canonica.
// fusionada_en`, migración `20260910T1900_obra_canonica_fusionada_en.sql`). El cliente veía la
// misma obra dos veces, una de ellas rotulada «terminada», y encima con dos nombres distintos.
//
// La lectura salía de `obra_canonica` directo. `obra_panel` ya filtra las fusionadas, pero el portal
// no puede usar esa vista: necesita saber CUÁLES se absorbieron para poder buscar sus papeles, que
// el espejo de Drive dejó archivados bajo el id viejo. Así que el filtro se hace acá, con test.
//
// Todo lo de este archivo es puro: entra lo que devolvió la consulta y sale lo que dibuja la
// pantalla. El alcance del acceso también se aplica acá, por la misma razón que en `esquema.ts` —
// un portero sin test es un portero que nadie volvió a mirar.

/** Una fila de `public.obra_canonica`, tal como la trae la consulta del portal. */
export type FilaObraCanonica = {
  id: string
  nombre: string
  estado: string | null
  fecha_inicio_real: string | null
  fecha_inicio_plan: string | null
  /** Cuándo terminó de verdad. `null` = no se cargó, y la pantalla lo dice en vez de inventarla. */
  fecha_fin_real?: string | null
  drive_carpeta_id?: string | null
  monto_contratado?: number | string | null
  contrato_moneda?: string | null
  contrato_monto?: number | string | null
  /** El id de la obra que ABSORBIÓ a ésta. `null` = la obra sigue siendo ella misma. */
  fusionada_en: string | null
}

export type ObraDelInicio = {
  id: string
  nombre: string
  /** `'activa'`, `'cerrada'`… tal como lo declara el registro. `null` = sin declarar. */
  estado: string | null
  /** `null` = SIN FECHA DE INICIO cargada. No se rellena con la de creación del registro. */
  desde: string | null
  /** Cuándo terminó. `null` = sin fecha de cierre cargada — se escribe así, no se estima. */
  hasta: string | null
  /** La carpeta de Drive de la obra. `null` = todavía no se conectó, y la pantalla lo dice. */
  carpeta: string | null
  /** Lo contratado, en la moneda en que se firmó. `monto: null` = sin contrato cargado. */
  contrato: ContratoDeObra
  /**
   * Los ids de las obras que se fusionaron EN ésta. Casi siempre vacío.
   *
   * No es trazabilidad decorativa: los papeles y las corridas del espejo de Drive quedaron
   * archivados bajo el id viejo (`documento_espejo_corrida.ambito = 'obra:bsa-planta'`), así que sin
   * esta lista la obra que sobrevive aparece como «todavía no sincronizamos los papeles» teniendo
   * once documentos publicados.
   */
  absorbidas: string[]
}

/** ¿Esta obra está terminada? El portal la muestra igual, pero abajo y en su propio grupo. */
export const esObraAnterior = (o: { estado: string | null }): boolean => o.estado === 'cerrada'

/**
 * LAS OBRAS QUE EL CLIENTE PUEDE VER, sin las fusionadas y con lo absorbido a cuestas.
 *
 * @param filas todas las obras del cliente, INCLUIDAS las fusionadas. Se necesitan las dos: la que
 *   desaparece aporta su id a `absorbidas` y su alcance a la que queda.
 * @param alcanza qué obras abre este acceso (`cliente_acceso.obras`). Un acceso otorgado sobre una
 *   obra que después se fusionó SIGUE VALIENDO sobre la que la absorbió: si no, el día de la fusión
 *   el contacto se queda sin ver nada y nadie relaciona una cosa con la otra.
 *
 * Las cerradas van al final —el cliente entra a ver lo que está en curso— y dentro de cada grupo,
 * por nombre, que es como las lista la consulta.
 */
export function obrasDelCliente(
  filas: FilaObraCanonica[],
  alcanza: (obraId: string) => boolean,
): ObraDelInicio[] {
  const absorbidas = new Map<string, string[]>()
  for (const f of filas) {
    if (!f.fusionada_en) continue
    absorbidas.set(f.fusionada_en, [...(absorbidas.get(f.fusionada_en) ?? []), String(f.id)])
  }
  return filas
    .filter((f) => !f.fusionada_en)
    .map((f) => ({
      id: String(f.id),
      nombre: String(f.nombre),
      estado: f.estado ?? null,
      // La REAL manda sobre la planificada: es cuándo arrancó de verdad. Sin ninguna de las dos,
      // `null` — y la pantalla no escribe una fecha inventada.
      desde: f.fecha_inicio_real ?? f.fecha_inicio_plan ?? null,
      // Sólo la REAL: la planificada es cuándo se pensaba terminar, y en una obra cerrada eso no es
      // el cierre. Sin la real, la pantalla escribe «sin fecha de cierre».
      hasta: f.fecha_fin_real ?? null,
      carpeta: f.drive_carpeta_id ?? null,
      // La MISMA regla que usa el pie de Pagos. Terminadas la resolvía por su cuenta contra
      // `public.obras.monto_contratado` y publicaba «sin cargar» sobre obras que tienen precio.
      contrato: contratoDeLaObra(f),
      absorbidas: absorbidas.get(String(f.id)) ?? [],
    }))
    .filter((o) => alcanza(o.id) || o.absorbidas.some(alcanza))
    .sort((a, b) => Number(esObraAnterior(a)) - Number(esObraAnterior(b)))
}

export type ObrasPartidas = {
  /** Lo que se está construyendo hoy. */
  enCurso: ObraDelInicio[]
  /** Lo terminado, en su propio grupo: sigue siendo trabajo real del cliente y no se oculta. */
  anteriores: ObraDelInicio[]
}

/**
 * EN CURSO Y ANTERIORES, SEPARADAS.
 *
 * Messina tiene cinco obras vivas y seis cerradas —entre ellas una llamada «Messina», con el nombre
 * del cliente, que es un registro viejo y real—. En una sola lista, las once se leen como once
 * frentes abiertos. El nombre no se toca y ninguna se esconde: cambian de grupo, que es lo único
 * que el dato sostiene.
 */
export function partirEnCursoYAnteriores(obras: ObraDelInicio[]): ObrasPartidas {
  return {
    enCurso: obras.filter((o) => !esObraAnterior(o)),
    anteriores: obras.filter(esObraAnterior),
  }
}

/**
 * LOS ÁMBITOS DEL ESPEJO DE DRIVE QUE HABLAN DE ESTA OBRA.
 *
 * `documento_espejo_corrida.ambito` es `obra:<id>` y la corrida quedó grabada con el id que la obra
 * tenía cuando el espejo pasó. Después de una fusión hay que mirar los dos: el 10/09/2026 los once
 * papeles de «ME - BSA» estaban publicados y la pantalla decía «Todavía no sincronizamos los papeles
 * de esta obra», porque el ámbito que existe es `obra:bsa-planta`.
 */
export function ambitosDelEspejo(o: Pick<ObraDelInicio, 'id' | 'absorbidas'>): string[] {
  return [`obra:${o.id}`, ...o.absorbidas.map((id) => `obra:${id}`)]
}

/**
 * LA CORRIDA MÁS RECIENTE ENTRE VARIOS ÁMBITOS. `null` = ninguno corrió nunca, que es distinto de
 * «corrió y no encontró nada» y la pantalla lo escribe distinto.
 *
 * Un ámbito con error NO tapa a uno que anduvo: se elige por fecha, y si el más nuevo falló, la
 * pantalla lo dice. Al revés —preferir el que anduvo— escondería que la última pasada se rompió.
 */
export function corridaMasFresca<T extends { al: Date | null }>(
  corridas: Map<string, T>, ambitos: string[],
): T | null {
  const halladas = ambitos.map((a) => corridas.get(a)).filter((c): c is T => c != null)
  if (!halladas.length) return null
  return halladas.reduce((mejor, c) => ((c.al?.getTime() ?? 0) > (mejor.al?.getTime() ?? 0) ? c : mejor))
}

/**
 * EL ID BAJO EL QUE SE ARCHIVA LO DE ESTA OBRA HOY.
 *
 * Una obra fusionada dejó de ser un destino válido: sus papeles, sus pagos y su avance viven en la
 * que la absorbió. Lo usa `orquestador/scripts/documentos-espejo.mjs`, que recorre `obra_canonica`
 * entera y —sin esto— volvería a publicar los once papeles de «BSA - Planta» bajo el id viejo, donde
 * el portal ya no los mira. No serían un error visible: serían once documentos invisibles.
 */
export const obraVigente = (o: { id: string; fusionada_en?: string | null }): string =>
  o.fusionada_en ?? o.id
