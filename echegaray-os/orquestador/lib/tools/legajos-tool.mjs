// Tool: foto de completitud de LEGAJOS (área Personas). Greenfield de lectura — "no llevamos los
// legajos, hay que hacerlo". Lee la carpeta real del data room (ALTAS - BAJAS - HM - EPP - DNI) ya
// indexada. Interno/reversible, 0 API. El primer paso de "llevar los legajos" es VER el estado actual.
import { estadoLegajos } from '../legajos.mjs'

export function legajosTools() {
  return {
    'legajos.estado': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'legajos_estado',
        description:
          'Foto de completitud de los LEGAJOS del personal, leída de la carpeta real del data room (ALTAS - BAJAS - HM - EPP - DNI). Dice cuántas personas hay, cuántas activas vs dadas de baja, y qué legajo ACTIVO le falta un documento requerido: ALTA (IERIC) + DNI + HM (examen médico) + EPP (constancia de entrega). Dos señales de riesgo: (1) exposición ART/IERIC — activos sin examen médico, sin DNI o sin alta; (2) CONFLICTO LABORAL — personas con un telegrama, carta documento o intimación en su legajo (despido/intimación en curso). USALO para "¿cómo están los legajos?", "¿a quién le falta el examen médico?", "¿qué legajos están incompletos?", "¿quién tiene telegrama / conflicto laboral?", "¿tenemos algún despido en curso?". Números REALES de los archivos indexados, 0 inventado. Aclaración: los archivos sueltos se atribuyen por nombre (inferencia) y hay que verificarlos contra el archivo. Sin parámetros.',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          return await estadoLegajos()
        } catch (e) {
          return { error: `no pude leer los legajos: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
