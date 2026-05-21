# Setup WhatsApp Business con Evolution API

## Arquitectura

```
Paciente (WhatsApp) ↔ Evolution API (Docker local) ↔ ngrok (túnel) ↔ n8n Cloud ↔ Google Calendar
```

---

## PASO 1 — Instalar ngrok

1. Ir a https://ngrok.com → crear cuenta gratuita
2. Descargar ngrok para Windows
3. Autenticarse con tu token:
   ```
   ngrok config add-authtoken TU_TOKEN_AQUI
   ```
4. Abrir túnel en puerto 8080:
   ```
   ngrok http 8080
   ```
5. Copiar la URL que aparece, tipo:
   ```
   https://abc123.ngrok-free.app
   ```

---

## PASO 2 — Configurar docker-compose.yml

1. Abrir `docker-compose.yml`
2. Reemplazar esta línea con tu URL de ngrok:
   ```
   - SERVER_URL=https://TU-SUBDOMINIO.ngrok-free.app
   ```
3. Guardar el archivo

---

## PASO 3 — Levantar Evolution API

Abrir terminal en la carpeta `whatsapp/` y ejecutar:

```bash
docker compose up -d
```

Verificar que está corriendo:
```bash
docker compose logs -f
```

Debe aparecer: `Server is listening on port 8080`

---

## PASO 4 — Crear instancia y obtener QR

### Opción A — Por terminal (Linux/Mac/Git Bash):
```bash
bash crear-instancia.sh
```

### Opción B — Manual con curl (Windows PowerShell):
```powershell
$headers = @{ "apikey" = "implantarte2026secretkey"; "Content-Type" = "application/json" }
$body = '{
  "instanceName": "implantarte",
  "integration": "WHATSAPP-BAILEYS",
  "qrcode": true,
  "webhook": {
    "url": "http://localhost:5678/webhook/implantarte-citas",
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPSERT"]
  }
}'
Invoke-RestMethod -Uri "http://localhost:8080/instance/create" -Method POST -Headers $headers -Body $body
```

### Obtener QR para escanear:
```
GET http://localhost:8080/instance/connect/implantarte
Header: apikey: implantarte2026secretkey
```

O abrir en navegador el Manager UI:
```
http://localhost:8080/manager
```

---

## PASO 5 — Conectar WhatsApp Business

1. Abrir la app **WhatsApp Business** en el teléfono
2. Ir a **Más opciones (⋮)** → **Dispositivos vinculados**
3. Tocar **Vincular un dispositivo**
4. Escanear el QR que muestra Evolution API
5. Esperar confirmación: `Estado: open`

---

## PASO 6 — Verificar la conexión

```bash
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: implantarte2026secretkey"
```

Debe mostrar `"connectionStatus": "open"`

---

## PASO 7 — Actualizar el workflow en n8n

El workflow actual recibe `{ phone, message }` desde el simulador.
Evolution API envía un formato diferente — necesitas actualizar el nodo
**Session Manager** para leer el formato de Evolution API.

Ver sección "Cambios en n8n" al final de este documento.

---

## Cambios en n8n — Adaptación del webhook

### Formato que envía Evolution API:
```json
{
  "event": "MESSAGES_UPSERT",
  "instance": "implantarte",
  "data": {
    "key": {
      "remoteJid": "573001234567@s.whatsapp.net",
      "fromMe": false
    },
    "message": {
      "conversation": "hola"
    },
    "pushName": "Juan Pérez"
  }
}
```

### En el nodo Session Manager, cambiar la lectura de datos:

**Antes (simulador):**
```javascript
const phone = $input.first().json.phone;
const message = $input.first().json.message;
```

**Después (Evolution API):**
```javascript
const body = $input.first().json;

// Ignorar mensajes enviados por el bot mismo
if (body.data?.key?.fromMe === true) return [];

const phone = body.data.key.remoteJid.replace('@s.whatsapp.net', '');
const message = body.data.message?.conversation
             || body.data.message?.extendedTextMessage?.text
             || '';
```

### Agregar nodo HTTP Request para enviar respuesta:

Al final del workflow, en lugar de solo devolver JSON, agregar:

- **Nodo:** HTTP Request
- **Method:** POST
- **URL:** `http://TU-TUNNEL.ngrok-free.app/message/sendText/implantarte`
- **Headers:** `apikey: implantarte2026secretkey`
- **Body (JSON):**
```json
{
  "number": "{{ $json.phone }}",
  "text": "{{ $json.message }}"
}
```

---

## Notas importantes

- **ngrok gratuito** genera una URL nueva cada vez que reinicias. Debes actualizar `SERVER_URL` en docker-compose.yml y recrear el contenedor.
- **ngrok de pago** ($10/mes) permite URL fija — recomendado para producción.
- El teléfono con WhatsApp Business debe estar **con batería y conexión a internet** mientras el bot esté activo.
- Si reinicias Docker, Evolution API reconecta automáticamente sin escanear QR de nuevo (la sesión se guarda en el volumen `evolution_instances`).
