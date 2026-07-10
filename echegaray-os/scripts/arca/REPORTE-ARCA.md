# Integración ARCA — estado y decisiones (2026-07-10)

## Qué se construyó (mío, hecho)

- Clave privada RSA 2048 + CSR del certificado (`credentials/`, gitignoreado).
- `wsaa-client.mjs`: cliente WSAA oficial (firma CMS del TRA, LoginCMS, cachea el ticket 12 h). Listo, **no probado** porque el certificado todavía no está emitido/autorizado.
- `portal-login.mjs`: intento de automatizar el portal — **bloqueado por anti-bot de ARCA** (rechaza un CUIT de checksum válido tipeado tecla por tecla). No es una vía viable.

## Capacidades pedidas — realidad (verificado en catálogo oficial 2026-07-10)

| Capacidad | Web service oficial | Vía |
|---|---|---|
| **Generar facturas** | ✅ `wsfev1` FECAESolicitar | API oficial. Nivel E (efecto fiscal externo): se construye, pero cada emisión la confirma una persona |
| **IVA Ventas actualizado** | ✅ `wsfev1` FECompConsultar / FECompUltimoAutorizado | API oficial. Reconstruye el Libro IVA Ventas completo de lo emitido bajo este CUIT (por API o portal) |
| **F931** | ✅ `TRABAJO_F931` | API oficial. Remuneración total/imponible, aportes y contribuciones por período. Límite: últimos 12 meses |
| **Constatar comprobantes recibidos** | ✅ `WSCDCV1` | API oficial. VALIDA uno por uno (dado el CAE), NO lista |
| **IVA Compras: LISTAR recibidos** | ❌ No existe WS que liste | Única pieza no oficial: Libro IVA Compras del estudio, o export del portal Mis Comprobantes |

**Corrección**: en el reporte anterior dije que F931 no tenía API. Falso — existe `TRABAJO_F931`. Verificado en el catálogo oficial de web services.

**Lo único sin API oficial**: obtener la LISTA de comprobantes que los proveedores nos emitieron. WSCDC valida uno que ya tengas, no te da la lista. Esa lista sale del Libro IVA Compras del estudio. Una vez que la tengo, puedo validar cada comprobante con WSCDC oficial.

## Un solo paso humano cubre TODO

El mismo certificado se autoriza una vez y se le delegan los 4 servicios (`wsfe`, `wscdc`, `TRABAJO_F931`, padrón) en el Administrador de Relaciones. No es un paso por servicio.

## Paso humano único — autorizar el certificado (solo para IVA Ventas por API)

Es identidad fiscal: legalmente lo hace la empresa, como el clic de IMPORTRANGE. ~10 minutos.

1. Entrar a ARCA con clave fiscal (CUIT 30-71630464-3).
2. **Homologación** (pruebas): app WSASS → crear alias `echegaray-os`, subir `echegaray-os.csr`, descargar el `.crt` → guardarlo como `credentials/echegaray-os.crt`. Autorizar el servicio `wsfe`.
3. Probar: `node scripts/arca/wsaa-client.mjs wsfe` debe cachear el ticket sin error.
4. **Producción**: "Administrador de Certificados Digitales" (mismo CSR) + "Administrador de Relaciones" → delegar `wsfe` al certificado. Correr con `ARCA_ENV=prod`.

## Seguridad — pendiente

La clave fiscal se tipeó en el chat. Está guardada local y gitignoreada, pero **debe rotarse**. Como los web services se autentican por certificado, cambiar la clave NO rompe la integración. Cambiar en: ARCA → "Cambio de clave fiscal".
