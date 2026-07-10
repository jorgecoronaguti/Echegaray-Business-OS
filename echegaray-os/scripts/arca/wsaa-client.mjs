#!/usr/bin/env node
// Cliente WSAA de ARCA (autenticación por certificado, la vía OFICIAL y estable,
// no el portal). Genera el Ticket de Requerimiento de Acceso (TRA), lo firma en
// CMS con la clave privada + certificado, invoca LoginCMS y cachea el Token+Sign
// (validez 12 h) en credentials/ta-<servicio>.xml.
//
// REQUIERE que el certificado echegaray-os.crt ya esté emitido y AUTORIZADO en
// el portal para el servicio (paso humano único, ver REPORTE-ARCA.md). Sin eso,
// LoginCMS responde error -- es lo esperado hasta que se autorice.
//
// Uso: node scripts/arca/wsaa-client.mjs wsfe   (o el servicio que sea)

import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const DIR = dirname(fileURLToPath(import.meta.url))
const CRED = join(DIR, 'credentials')
const servicio = process.argv[2] || 'wsfe'
// Homologación por defecto; producción cuando el cert esté autorizado en prod.
const WSAA_URL =
  process.env.ARCA_ENV === 'prod'
    ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
    : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'

const CRT = join(CRED, 'echegaray-os.crt')
const KEY = join(CRED, 'arca-private.key')
if (!existsSync(CRT)) {
  console.error(`Falta el certificado ${CRT}. Autorizarlo primero en el portal (ver REPORTE-ARCA.md).`)
  process.exit(2)
}

const now = Date.now()
const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now / 1000)}</uniqueId>
    <generationTime>${new Date(now - 600000).toISOString()}</generationTime>
    <expirationTime>${new Date(now + 600000).toISOString()}</expirationTime>
  </header>
  <service>${servicio}</service>
</loginTicketRequest>`

const traPath = join(CRED, `tra-${servicio}.xml`)
const cmsPath = join(CRED, `tra-${servicio}.cms`)
writeFileSync(traPath, tra)

// Firma CMS (PKCS#7) del TRA con openssl.
execFileSync('openssl', [
  'cms', '-sign', '-in', traPath, '-signer', CRT, '-inkey', KEY,
  '-nodetach', '-outform', 'DER', '-out', cmsPath,
])
const cmsB64 = readFileSync(cmsPath).toString('base64')

const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body><wsaa:loginCms><wsaa:in0>${cmsB64}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`

const res = await fetch(WSAA_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
  body: soap,
})
const xml = await res.text()
if (!res.ok || xml.includes('<faultcode>')) {
  console.error(`WSAA respondió ${res.status}. Extracto:\n${xml.replace(/&lt;/g, '<').slice(0, 500)}`)
  console.error('\nSi dice "certificado no autorizado" o similar: falta autorizar el cert en el portal para el servicio.')
  process.exit(1)
}
const inner = xml.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const token = inner.match(/<token>([\s\S]*?)<\/token>/)?.[1]
const sign = inner.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]
writeFileSync(join(CRED, `ta-${servicio}.xml`), JSON.stringify({ token, sign, obtenido: new Date().toISOString() }, null, 1))
console.log(`Ticket de acceso ${servicio} obtenido y cacheado (válido 12 h).`)
