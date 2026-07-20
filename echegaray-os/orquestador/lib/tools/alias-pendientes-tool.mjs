import { aliasPendientes, formatPendientes } from '../alias-pendientes.mjs'

const CASH_FLOW = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

export function aliasPendientesTools(google) {
  return {
    'alias.pendientes': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'alias_pendientes',
        description:
          'Revisa las columnas de CLIENTE vivas del Flujo de Caja (jornales y compras) contra el eje ' +
          'canónico de obras y devuelve las grafías que el OS NO reconoce, con la plata en juego. ' +
          'USALO SIEMPRE antes de armar o creer un cuadro que filtre/agrupe por cliente u obra: si ' +
          'una grafía no está en el eje, el filtro le da $0 y ese cero NO se ve como un error, se ve ' +
          'como un cliente que no trabajó. También usalo cuando un total por cliente no cierre contra ' +
          'el total general. No inventa el alias: informa el hueco para que lo confirme una persona.',
        input_schema: {
          type: 'object',
          properties: { file_id: { type: 'string', description: 'id del Flujo de Caja (por defecto, el de la empresa)' } },
        },
      },
      async run(input) {
        const r = await aliasPendientes(google, { file_id: input?.file_id || CASH_FLOW })
        if (r.error) return r
        return { ...r, resumen: formatPendientes(r) }
      },
    },
  }
}
