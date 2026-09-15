// REGLAS DEL RECIBO DE SUELDO, CONGELADAS. NO SE EDITA A MANO: se regenera.
//
// Generadas el 2026-09-14 desde los recibos 2026 (PDF del legajo, leídos en seco) con:
//   node orquestador/scripts/recibos-detalle-importar.mjs --volcar /tmp/recibos.json
//   node orquestador/scripts/recibo-reglas-generar.mjs --volcado /tmp/recibos.json --antes-de Q1-09/2026 --escribir
//
// Ventana: Q1-07/2026, Q2-07/2026, Q1-08/2026, Q2-08/2026 (75 recibos). Cada regla lleva su evidencia: recibos,
// cuántos reproduce al centavo, mediana y rango. Por qué congeladas y qué queda afuera: el script.

import type { ReglasDelRecibo } from './reglasDelRecibo.ts'

export const REGLAS_GENERADAS_EL = '2026-09-14'

export const REGLAS_GENERADAS: ReglasDelRecibo = {
  "antesDe": "Q1-09/2026",
  "periodos": [
    "Q1-07/2026",
    "Q2-07/2026",
    "Q1-08/2026",
    "Q2-08/2026"
  ],
  "recibos": 75,
  "jornada": 88,
  "horas": {
    "parcial": 50,
    "evidencia": {
      "recibos": 63,
      "aciertos": 62,
      "mediana": 50,
      "min": 17,
      "max": 50
    },
    "dudosa": false,
    "feriadoPorDia": {
      "parcial": 5,
      "completa": 8
    }
  },
  "asistencia": {
    "tasa": 0.2,
    "evidencia": {
      "recibos": 72,
      "aciertos": 72,
      "mediana": 0.2,
      "min": 0.2,
      "max": 0.2
    },
    "dudosa": false,
    "ajuste": {
      "parcial": {
        "recibos": 64,
        "conAjuste": 64,
        "anula": true
      },
      "completa": {
        "recibos": 8,
        "conAjuste": 0,
        "anula": false
      }
    }
  },
  "conceptos": [
    {
      "codigo": "4010",
      "descripcion": "JUBILACION",
      "seccion": "descuento",
      "modelo": {
        "tipo": "porcentaje",
        "tasa": 0.11,
        "base": "remunerativo"
      },
      "evidencia": {
        "recibos": 75,
        "aciertos": 75,
        "mediana": 0.11,
        "min": 0.10999999999999999,
        "max": 0.11000000000000001
      },
      "dudosa": false,
      "motivo": null,
      "aplica": true,
      "soloQuincena": null
    },
    {
      "codigo": "4020",
      "descripcion": "LEY 19032",
      "seccion": "descuento",
      "modelo": {
        "tipo": "porcentaje",
        "tasa": 0.03,
        "base": "remunerativo"
      },
      "evidencia": {
        "recibos": 75,
        "aciertos": 75,
        "mediana": 0.03,
        "min": 0.03,
        "max": 0.030000000000000002
      },
      "dudosa": false,
      "motivo": null,
      "aplica": true,
      "soloQuincena": null
    },
    {
      "codigo": "4050",
      "descripcion": "OBRA SOCIAL",
      "seccion": "descuento",
      "modelo": {
        "tipo": "porcentaje",
        "tasa": 0.0255,
        "base": "remunerativo_y_no_remunerativo"
      },
      "evidencia": {
        "recibos": 75,
        "aciertos": 75,
        "mediana": 0.025500000000000002,
        "min": 0.025499995116996757,
        "max": 0.025500018532933023
      },
      "dudosa": false,
      "motivo": null,
      "aplica": true,
      "soloQuincena": null
    },
    {
      "codigo": "4150",
      "descripcion": "ANSSAL",
      "seccion": "descuento",
      "modelo": {
        "tipo": "porcentaje",
        "tasa": 0.0045,
        "base": "remunerativo_y_no_remunerativo"
      },
      "evidencia": {
        "recibos": 75,
        "aciertos": 75,
        "mediana": 0.0045,
        "min": 0.004499981467066978,
        "max": 0.004500018521948509
      },
      "dudosa": false,
      "motivo": null,
      "aplica": true,
      "soloQuincena": null
    },
    {
      "codigo": "4170",
      "descripcion": "APORTE ADICIONAL OS (Art.92 ter. LCT)",
      "seccion": "descuento",
      "modelo": {
        "tipo": "horas_faltantes",
        "tasa": 0.0255,
        "jornada": 88,
        "masNoRemunerativo": false
      },
      "evidencia": {
        "recibos": 66,
        "aciertos": 66,
        "mediana": 87.99998764471133,
        "min": 87.99997977530363,
        "max": 87.99999273649078
      },
      "dudosa": false,
      "motivo": null,
      "aplica": true,
      "soloQuincena": null
    },
    {
      "codigo": "4175",
      "descripcion": "APORTE ADIC ANSSAL (ART. 92 Ter. LCT)",
      "seccion": "descuento",
      "modelo": {
        "tipo": "horas_faltantes",
        "tasa": 0.0045,
        "jornada": 88,
        "masNoRemunerativo": false
      },
      "evidencia": {
        "recibos": 66,
        "aciertos": 66,
        "mediana": 88.00007001330253,
        "min": 87.99962956102982,
        "max": 88.00011460661281
      },
      "dudosa": false,
      "motivo": null,
      "aplica": true,
      "soloQuincena": null
    },
    {
      "codigo": "4285",
      "descripcion": "APORTE SOLIDARIO EXT.UOCRA",
      "seccion": "descuento",
      "modelo": {
        "tipo": "porcentaje",
        "tasa": 0.02,
        "base": "remunerativo"
      },
      "evidencia": {
        "recibos": 75,
        "aciertos": 75,
        "mediana": 0.02,
        "min": 0.02,
        "max": 0.02
      },
      "dudosa": false,
      "motivo": null,
      "aplica": true,
      "soloQuincena": null
    },
    {
      "codigo": "4287",
      "descripcion": "SEGURO DE VIDA UOCRA",
      "seccion": "descuento",
      "modelo": {
        "tipo": "monto_fijo",
        "monto": 19617.16,
        "periodo": "Q2-08/2026"
      },
      "evidencia": {
        "recibos": 19,
        "aciertos": 19,
        "mediana": 19617.16,
        "min": 19617.16,
        "max": 19617.16
      },
      "dudosa": false,
      "motivo": "el importe cambió en la ventana (2 importes distintos): se usa el de Q2-08/2026",
      "aplica": false,
      "soloQuincena": 2
    }
  ]
}
