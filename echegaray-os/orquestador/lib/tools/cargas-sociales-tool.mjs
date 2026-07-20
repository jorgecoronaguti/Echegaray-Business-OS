// Tool: CARGAS SOCIALES DECLARADAS — lee las DDJJ F931 reales del data room y las discrimina.
import { cargasSocialesDeclaradas, formatCargas } from '../cargas-sociales.mjs'

export function cargasSocialesTools(google) {
  return {
    'os.cargas_sociales_declaradas': {
      capability: 'os.read',
      schema: {
        name: 'cargas_sociales_declaradas',
        description:
          'Lee las declaraciones juradas F931 archivadas en Drive y devuelve las CARGAS SOCIALES ' +
          'discriminadas por concepto y por mes: aportes y contribuciones de Seguridad Social y de ' +
          'Obra Social, L.R.T. (ART), seguro de vida obligatorio, RENATRE. Usala cuando el dueño ' +
          'pregunte qué se declaró de cargas sociales, cuánto es el ART, o para comparar lo DECLARADO ' +
          'contra lo PAGADO en el Flujo de Caja. IMPORTANTE: el ART se paga DENTRO del F931 (código ' +
          '312) — no existe como pago separado, y reportar "ART en cero" mirando sólo Compras es una ' +
          'alarma falsa. Esto es DEVENGADO: el pago del F931 cae el mes siguiente al declarado.',
        input_schema: {
          type: 'object',
          properties: {
            folder_id: { type: 'string', description: 'Carpeta que contiene las subcarpetas por año (2022…2026).' },
            anio: { type: 'string', description: 'Año a leer. Por defecto, el actual.' },
          },
          required: ['folder_id'],
        },
      },
      async run(args = {}) {
        try {
          const r = await cargasSocialesDeclaradas(google, args)
          return r.error ? r : { ...r, resumen_texto: formatCargas(r) }
        } catch (e) {
          return { error: `no pude leer las DDJJ: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
