// api/daily-alert.js — Vercel Serverless Function
// Envía email diario con propiedades que cumplen los criterios
// Se puede llamar via cron o manualmente

import nodemailer from 'nodemailer';

const CONFIG = {
  zips: ['19446', '19454', '19440', '18101', '18102', '18015'],
  priceMin: 200000,
  priceMax: 450000,
  bedsMin: 3,
  minCashflow: 500,
  downPaymentPct: 0.20,
  interestRate: 0.07,
  fromEmail: 'juanlucerogally@gmail.com',
  toEmail: 'juanlucerog@gmail.com',
};

export default async function handler(req, res) {
  // Seguridad: solo POST con token correcto
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Token de seguridad opcional
  const token = req.headers['x-alert-token'] || req.query.token;
  if (process.env.ALERT_TOKEN && token !== process.env.ALERT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;

    if (!RAPIDAPI_KEY || !GMAIL_PASS) {
      return res.status(500).json({ error: 'Variables de entorno faltantes' });
    }

    // Buscar propiedades
    let allProperties = [];
    for (const zip of CONFIG.zips) {
      try {
        const url = new URL('https://zillow-scraper-api.p.rapidapi.com/zillow/search/by-zipcode');
        url.searchParams.set('zipcode', zip);
        url.searchParams.set('minPrice', CONFIG.priceMin);
        url.searchParams.set('maxPrice', CONFIG.priceMax);
        url.searchParams.set('bedsMin', CONFIG.bedsMin);
        url.searchParams.set('homeType', 'MultiFamily');
        url.searchParams.set('status', 'forSale');

        const response = await fetch(url.toString(), {
          headers: {
            'x-rapidapi-host': 'zillow-scraper-api.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY,
          }
        });

        if (response.ok) {
          const data = await response.json();
          const props = normalizeZillowData(data);
          allProperties = allProperties.concat(props);
        }
      } catch(e) {
        console.warn('ZIP error:', zip, e.message);
      }
    }

    // Deduplicar
    const seen = new Set();
    allProperties = allProperties.filter(p => {
      if (seen.has(p.zpid)) return false;
      seen.add(p.zpid);
      return true;
    });

    // Filtrar HOA y calcular cash flow
    const qualified = allProperties
      .filter(p => !p.hasHoa)
      .map(p => ({ ...p, cf: calcCashflow(p) }))
      .filter(p => p.cf.cashflow >= CONFIG.minCashflow)
      .sort((a, b) => b.cf.cashflow - a.cf.cashflow);

    // Generar email HTML
    const date = new Date().toLocaleDateString('es-ES', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const emailHtml = generateEmailHtml(qualified, date, allProperties.length);

    // Enviar email via Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: CONFIG.fromEmail,
        pass: GMAIL_PASS,
      }
    });

    await transporter.sendMail({
      from: `"PropFinder 🏘️" <${CONFIG.fromEmail}>`,
      to: CONFIG.toEmail,
      subject: `PropFinder · ${qualified.length} oportunidades · ${new Date().toLocaleDateString('es-ES')}`,
      html: emailHtml,
    });

    return res.status(200).json({
      success: true,
      sent: qualified.length,
      total: allProperties.length,
      date
    });

  } catch (error) {
    console.error('Alert error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function calcCashflow(p) {
  const price = p.price;
  const rent = p.rentZestimate || (p.beds >= 3 ? 1600 : 1200) * (price / 300000) * 0.9;
  const rate = CONFIG.interestRate / 12;
  const loan = price * (1 - CONFIG.downPaymentPct);
  const n = 360;
  const mortgage = loan * (rate * Math.pow(1+rate,n)) / (Math.pow(1+rate,n)-1);
  const taxes = (p.taxAnnual || price * 0.015) / 12;
  const insurance = 175;
  const maintenance = price * 0.01 / 12;
  const vacancy = rent * 0.08;
  const totalExpenses = mortgage + taxes + insurance + maintenance + vacancy;
  const cashflow = rent - totalExpenses;
  const noi = rent * 12 - taxes * 12 - insurance * 12 - maintenance * 12 - vacancy * 12;
  const capRate = (noi / price) * 100;

  return {
    cashflow: Math.round(cashflow),
    mortgage: Math.round(mortgage),
    rent: Math.round(rent),
    capRate: capRate.toFixed(1),
    downPayment: Math.round(price * CONFIG.downPaymentPct)
  };
}

function generateEmailHtml(properties, date, totalSearched) {
  const rows = properties.slice(0, 10).map(p => `
    <tr style="border-bottom:1px solid #1e2d42;">
      <td style="padding:16px 12px;">
        <div style="font-weight:600;color:#e8eaf0;margin-bottom:4px;">${p.address}</div>
        <div style="font-size:12px;color:#6b7a99;">${p.beds} hab · ${p.baths} baños${p.sqft ? ' · ' + p.sqft.toLocaleString() + ' ft²' : ''}</div>
      </td>
      <td style="padding:16px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#e8eaf0;">$${p.price.toLocaleString()}</div>
        <div style="font-size:11px;color:#6b7a99;">Down: $${p.cf.downPayment.toLocaleString()}</div>
      </td>
      <td style="padding:16px 12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#22c55e;">+$${p.cf.cashflow.toLocaleString()}</div>
        <div style="font-size:11px;color:#6b7a99;">/mes</div>
      </td>
      <td style="padding:16px 12px;text-align:center;">
        <div style="color:#c9a84c;font-weight:600;">${p.cf.capRate}%</div>
        <div style="font-size:11px;color:#6b7a99;">cap rate</div>
      </td>
      <td style="padding:16px 12px;text-align:center;">
        <div style="font-size:12px;color:#6b7a99;">${p.daysOnMarket || 0} días</div>
        ${p.priceReduction > 0 ? `<div style="font-size:11px;color:#f87171;">↓ Precio</div>` : ''}
      </td>
      <td style="padding:16px 12px;text-align:center;">
        <a href="${p.detailUrl || 'https://zillow.com'}" 
           style="background:#006AFF;color:white;padding:6px 14px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:500;">
          Ver →
        </a>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:800px;margin:0 auto;padding:32px 20px;">
    
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:32px;margin-bottom:8px;">🏘️</div>
      <div style="font-size:28px;font-weight:700;color:#e8eaf0;margin-bottom:4px;">PropFinder</div>
      <div style="font-size:14px;color:#6b7a99;text-transform:uppercase;letter-spacing:2px;">Reporte Diario · ${date}</div>
    </div>

    <!-- Stats -->
    <div style="display:flex;gap:16px;margin-bottom:32px;justify-content:center;">
      <div style="background:#111827;border:1px solid #1e2d42;border-radius:12px;padding:16px 24px;text-align:center;min-width:120px;">
        <div style="font-size:28px;font-weight:700;color:#c9a84c;">${totalSearched}</div>
        <div style="font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Buscadas</div>
      </div>
      <div style="background:#111827;border:1px solid #1e2d42;border-radius:12px;padding:16px 24px;text-align:center;min-width:120px;">
        <div style="font-size:28px;font-weight:700;color:#22c55e;">${properties.length}</div>
        <div style="font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">+$500/mes</div>
      </div>
      ${properties.length > 0 ? `
      <div style="background:#111827;border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:16px 24px;text-align:center;min-width:120px;">
        <div style="font-size:28px;font-weight:700;color:#22c55e;">+$${properties[0].cf.cashflow.toLocaleString()}</div>
        <div style="font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Mejor flujo</div>
      </div>` : ''}
    </div>

    ${properties.length === 0 ? `
    <div style="background:#111827;border:1px solid #1e2d42;border-radius:12px;padding:40px;text-align:center;color:#6b7a99;">
      <div style="font-size:32px;margin-bottom:12px;">🔍</div>
      <div style="font-size:16px;">Sin oportunidades hoy que superen $500/mes de cash flow</div>
      <div style="font-size:13px;margin-top:8px;">Se seguirá monitoreando diariamente</div>
    </div>
    ` : `
    <!-- Table -->
    <div style="background:#111827;border:1px solid #1e2d42;border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1a2333;">
            <th style="padding:12px;text-align:left;font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Propiedad</th>
            <th style="padding:12px;text-align:center;font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Precio</th>
            <th style="padding:12px;text-align:center;font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Cash Flow</th>
            <th style="padding:12px;text-align:center;font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Cap Rate</th>
            <th style="padding:12px;text-align:center;font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Días</th>
            <th style="padding:12px;text-align:center;font-size:11px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;">Link</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    `}

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;font-size:12px;color:#3d4f6e;">
      PropFinder · Warminster, PA · Sin HOA · Duplex/Triplex · $200k–$450k<br>
      Zonas: Lansdale · North Wales · Hatfield · Allentown · Bethlehem
    </div>
  </div>
</body>
</html>`;
}

function normalizeZillowData(data) {
  const listings = data?.searchResults?.listResults
    || data?.results
    || data?.props
    || data?.listResults
    || [];

  return listings.map(item => {
    const hoaFee = item.hdpData?.homeInfo?.hoaFee || item.hoaFee || 0;
    return {
      zpid: item.zpid || String(Math.random()),
      address: item.address || 'N/D',
      price: item.price || item.unformattedPrice || 0,
      beds: item.beds || item.bedrooms || 0,
      baths: item.baths || item.bathrooms || 0,
      sqft: item.area || item.livingArea || null,
      daysOnMarket: item.daysOnMarket || 0,
      detailUrl: item.detailUrl
        ? (item.detailUrl.startsWith('http') ? item.detailUrl : 'https://zillow.com' + item.detailUrl)
        : null,
      rentZestimate: item.hdpData?.homeInfo?.rentZestimate || item.rentZestimate || null,
      taxAnnual: item.hdpData?.homeInfo?.propertyTaxRate
        ? item.price * item.hdpData.homeInfo.propertyTaxRate / 100
        : item.taxAnnualAmount || null,
      hasHoa: hoaFee > 0,
      hoaFee,
      priceReduction: item.priceReduction || 0,
    };
  }).filter(p => p.price > 0);
}
