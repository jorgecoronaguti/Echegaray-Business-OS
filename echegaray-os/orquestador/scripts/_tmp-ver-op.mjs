import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'

const email = 'jorge@ecsas.com.ar'
const cuenta = await operadorPara(email)
const cfg = loadConfig()
const google = makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(cuenta), soloUsuario: true })

const ids = ['1a0691a7263d6441','1a0691a09154f8f0','19fa9af654319803','19fa9aef9eaa3d45']
for (const id of ids) {
  console.log(`\n\n########## ${id} ##########`)
  const g = await google.gmailGet(id, { maxChars: 3000 })
  console.log('TEXT:\n', g.text)
  console.log('\nSNIPPET:', g.snippet)
  const atts = await google.gmailAttachments(id)
  console.log('ATTACHMENTS:', JSON.stringify(atts, null, 2))
}
