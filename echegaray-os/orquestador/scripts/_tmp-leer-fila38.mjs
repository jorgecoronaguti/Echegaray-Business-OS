import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'

const email = 'jorge@ecsas.com.ar'
const cuenta = await operadorPara(email)
const cfg = loadConfig()
const google = makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(cuenta), soloUsuario: true })
const SHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const rows = await google.readSheetValues(SHEET_ID, 'COBRANZAS!A37:AA43')
rows.forEach((r,i)=>console.log(37+i, JSON.stringify(r)))
