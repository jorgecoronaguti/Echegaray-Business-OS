import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import fs from 'node:fs'

const email = 'jorge@ecsas.com.ar'
const cuenta = await operadorPara(email)
const cfg = loadConfig()
const google = makeGoogleClient({ config: cfg, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(cuenta), soloUsuario: true })

const targets = [
  { msgId: '1a0691a7263d6441', attId: 'ANGjdJ9ZiQCuSKPaHfAlJjVsCT5n4ieI6JMuKAkwaRteZX6MTUozhdjeD-d_pJhBW1GCo_IAOANe2JkiqLWQjnKfWstYPXIh7aVOp5al6gZ0D5_annwdW3Xpgy49PRoKo8svcucee6VtUyyTBbGFu76s_84sUHRXtWF-H-QYNIsRjP3oTPmN7-Gu2aK3GBVYF9vDo_ku52-Feaq8SLBBDJxivpbhS-CNNRT7Xg8fs5aCMjUfrQurkfiCRlCfrz-9BOiW3EcpCotoXyQzFaeXBziNZsIy_-LRuuS3UNruFsuE6b38b23K8US242xEA44Dcdco8exw04X9jhq53b2GzyIsnuRcj7jqlLrbg5u4Pk-R78EnMDy4FUvl0FraOP_ylJJu4WvvPvoJKMaY6Epz', nombre: '0000000005146.pdf' },
  { msgId: '19fa9af654319803', attId: 'ANGjdJ_Fccn_AYtv2MqgYNne_SgQ5JrfbPp-qTcXIUDjnGhhhahl9dBLB6hE4Aagu8Y6n3QMbcmm_7spLAYil3lebFznC93qyean2_y7NWo31IYBN7iZpVucpwoCVYJ53z10AqQivKZZdf94g-QcejjZi9UCBiHW_9uxnVLBOP8bCuRN3WrFc7UyMyt_sJQwsVOGgC6v7uMKueX5w3j-ovfrI9_wwOqRgLV1DCJloOfauK4ZybVT4TVAJ460Vaw8gKeP8J9gjVafObtm9gJgfkxbmC8ejJnL42OgRtNV5nB_jeQCxDZ8GoxGbwffwREAZytIZFHVPbbg3nipCMStf2BeHQ2Pb3OofaVD6j48PCLnKnl3YIp1zNOZBSubzuoCMDFndh5NTUk36j4gYamQ', nombre: 'O_P_0000000004865_G00002208.pdf' },
  { msgId: '19fa9aef9eaa3d45', attId: 'ANGjdJ-iz0Ewbg5-EKJZCTAVLp2stJSF5XXOSBw545JUdSJy0JMI6P0Ye_zkoNOpaarGunDhK-gqFQDLo9r2i-fCLeKb_kcNlIvaLK5ZE9JKhHOmz1vTBkr6PRyWZS6ZAKCsTShEIOfO4cV86kO7WN9Hjru_G610IewDKQS7YKJkmiTzdCL-taZnOTswqoRPIhsoXhmqHG75Trajcg7qYRNnubLzz155aF_0jiXg7ebQoDvjb7R5zGteQjmf3rI3Is_Q8whmD2ZEsXJsOaDO55QrnXlqECCHX2UqtifmJZenjccq3Pv7J4_KZCiuIKYLy3heWrkme8h-lSRQkuL7zXurqcczNNURaFonG_NCRPoXtGSas4gFcMft5qhZBMoFZHwaXGVsP_jxSWO2DPr0', nombre: '0000000004865.pdf' },
]
for (const t of targets) {
  const buf = await google.gmailAttachmentBytes(t.msgId, t.attId)
  const out = `/tmp/claude-1001/-home-jorge-echegaray-os-app-echegaray-os/ad20f4ac-6867-4b9a-9652-d5be36eafb74/scratchpad/${t.nombre}`
  fs.writeFileSync(out, buf)
  console.log('guardado', out, buf.length, 'bytes')
}
