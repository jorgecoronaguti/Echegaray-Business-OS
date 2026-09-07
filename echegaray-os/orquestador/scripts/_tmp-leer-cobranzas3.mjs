import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'

const email = 'jorge@ecsas.com.ar'
const cuenta = await operadorPara(email)
const cfg = loadConfig()
const google = makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(cuenta), soloUsuario: true })

const SHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const rows = await google.readSheetValues(SHEET_ID, 'COBRANZAS!A5:AA400')
console.log('total filas leídas:', rows.length)
const idx = { ID:0, Cat:1, FechaVenta:2, TipoFac:3, NComp:4, Unidad:5, Obra:6, OC:7, Concepto:8, Neto:9, IVA:10, Ret:11, Total:12, Forma:13, Estado:14, FechaFac:15, FechaCobro:16, Mes:17, Prob:18, MontoPond:19, Dias:20, EstadoCobro:21, Notas:22 }
rows.forEach((r, i) => {
  const obra = (r[idx.Obra]||'').toUpperCase()
  if (obra.includes('MESSINA')) {
    const fila = i + 5 // porque A5 es la fila 5 real (1-indexed en sheet)
    console.log(`FILA ${fila} | ID=${r[idx.ID]} | ${r[idx.TipoFac]} ${r[idx.NComp]} | Obra=${r[idx.Obra]} | Concepto=${r[idx.Concepto]} | Total=${r[idx.Total]} | Estado=${r[idx.Estado]} | FechaCobro=${r[idx.FechaCobro]} | Forma=${r[idx.Forma]} | Notas=${r[idx.Notas]}`)
  }
})
