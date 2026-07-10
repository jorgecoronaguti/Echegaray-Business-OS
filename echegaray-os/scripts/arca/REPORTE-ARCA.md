# Integración ARCA — estado y decisiones (2026-07-10)

## Qué se construyó (mío, hecho)

- Clave privada RSA 2048 + CSR del certificado (`credentials/`, gitignoreado).
- `wsaa-client.mjs`: cliente WSAA oficial (firma CMS del TRA, LoginCMS, cachea el ticket 12 h). Listo, **no probado** porque el certificado todavía no está emitido/autorizado.
- `portal-login.mjs`: intento de automatizar el portal — **bloqueado por anti-bot de ARCA** (rechaza un CUIT de checksum válido tipeado tecla por tecla). No es una vía viable.

## Las 3 capacidades pedidas — realidad

| Dato | ¿Web service oficial? | Vía recomendada |
|---|---|---|
| **IVA Ventas** | ✅ `wsfev1` (FECompConsultar) | API oficial. Mi código listo; falta 1 paso humano (autorizar cert) |
| **IVA Compras** | ❌ No existe API | PDFs del estudio contable ya en Drive (carpeta IVA 2026) — parseo automático |
| **F931** | ❌ No existe API | Acuse/PDF del estudio en Drive — parseo automático |

**Conclusión**: para Compras y F931 NO conviene ARCA (no hay API y el portal está blindado). La fuente confiable ya existe: los PDFs que produce el estudio contable, que caen a Drive. Eso lo ingiero yo, sin pelear con anti-bot.

## Paso humano único — autorizar el certificado (solo para IVA Ventas por API)

Es identidad fiscal: legalmente lo hace la empresa, como el clic de IMPORTRANGE. ~10 minutos.

1. Entrar a ARCA con clave fiscal (CUIT 30-71630464-3).
2. **Homologación** (pruebas): app WSASS → crear alias `echegaray-os`, subir `echegaray-os.csr`, descargar el `.crt` → guardarlo como `credentials/echegaray-os.crt`. Autorizar el servicio `wsfe`.
3. Probar: `node scripts/arca/wsaa-client.mjs wsfe` debe cachear el ticket sin error.
4. **Producción**: "Administrador de Certificados Digitales" (mismo CSR) + "Administrador de Relaciones" → delegar `wsfe` al certificado. Correr con `ARCA_ENV=prod`.

## Seguridad — pendiente

La clave fiscal se tipeó en el chat. Está guardada local y gitignoreada, pero **debe rotarse**. Como los web services se autentican por certificado, cambiar la clave NO rompe la integración. Cambiar en: ARCA → "Cambio de clave fiscal".
