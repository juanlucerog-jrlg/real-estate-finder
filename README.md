# PropFinder 🏘️

Buscador de inversiones inmobiliarias — Duplex/Triplex en PA/NJ

## Stack
- **Frontend**: HTML/CSS/JS vanilla — dark design
- **Backend**: Vercel Serverless Functions
- **API**: Zillow Scraper API via RapidAPI
- **Email**: Nodemailer via Gmail (alerta diaria automática)
- **Hosting**: Vercel (free tier)

## Variables de Entorno (configurar en Vercel)

```
RAPIDAPI_KEY=tu_key_de_rapidapi
GMAIL_APP_PASSWORD=tu_app_password_de_gmail
ALERT_TOKEN=cualquier_string_secreto (opcional)
```

### Cómo obtener GMAIL_APP_PASSWORD:
1. Ir a myaccount.google.com con juanlucerogally@gmail.com
2. Seguridad → Verificación en 2 pasos (activar si no está)
3. Seguridad → Contraseñas de aplicaciones
4. Crear nueva → nombre: "PropFinder"
5. Copiar la contraseña de 16 caracteres

## Deploy en Vercel

1. Push este repo a GitHub
2. Importar en vercel.com
3. Configurar variables de entorno
4. Deploy automático

## Email Diario
- **Remitente**: juanlucerogally@gmail.com
- **Destinatario**: juanlucerog@gmail.com
- **Horario**: 9:00 AM ET todos los días
- **Criterio**: Cash flow neto ≥ $500/mes, sin HOA

## Zonas Monitoreadas
- Lansdale (19446)
- North Wales (19454)
- Hatfield (19440)
- Allentown (18101, 18102)
- Bethlehem (18015)

## Filtros Fijos
- Tipo: Duplex / Triplex / Multifamiliar
- Precio: $200,000 – $450,000
- HOA: Excluido automáticamente
- Down payment: 20%
- Tasa: 7% (ajustable en la app)
