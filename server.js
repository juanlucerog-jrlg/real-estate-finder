// server.js — Express server para Render
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =====================
// RUTA: Búsqueda por ZIP
// =====================
app.get('/api/search', async (req, res) => {
  const { zip, priceMin, priceMax, beds } = req.query;

  if (!zip) return res.status(400).json({ error: 'ZIP requerido' });

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'API key no configurada' });

  try {
    const url = new URL('https://zillow-scraper-api.p.rapidapi.com/zillow/search/by-zipcode');
    url.searchParams.set('zipcode', zip);
    if (priceMin) url.searchParams.set('minPrice', priceMin);
    if (priceMax) url.searchParams.set('maxPrice', priceMax);
    if (beds) url.searchParams.set('bedsMin', beds);
    url.searchParams.set('homeType', 'MultiFamily');
    url.searchParams.set('status', 'forSale');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'zillow-scraper-api.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY,
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'Error en Zillow API', details: errText });
    }

    const data = await response.json();
    const properties = normalizeZillowData(data);
    const filtered = properties.filter(p => !p.hasHoa);

    return res.status(200).json({ properties: filtered, total: filtered.length, zip });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// =====================
// RUTA: Health check
// =====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// =====================
// NORMALIZAR DATOS
// =====================
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
      address: item.address || item.streetAddress || 'N/D',
      price: item.price || item.unformattedPrice || 0,
      beds: item.beds || item.bedrooms || 0,
      baths: item.baths || item.bathrooms || 0,
      sqft: item.area || item.livingArea || null,
      propertyType: normalizeType(item.propertyType || item.homeType),
      daysOnMarket: item.daysOnMarket || 0,
      imgSrc: item.imgSrc || item.carouselPhotos?.[0]?.url || null,
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
      zestimate: item.hdpData?.homeInfo?.zestimate || item.zestimate || null,
    };
  }).filter(p => p.price > 0);
}

function normalizeType(type) {
  if (!type) return 'Multi';
  const t = type.toLowerCase();
  if (t.includes('duplex')) return 'Duplex';
  if (t.includes('triplex')) return 'Triplex';
  if (t.includes('multi') || t.includes('apartment')) return 'Multi';
  return type;
}

app.listen(PORT, () => {
  console.log(`PropFinder API corriendo en puerto ${PORT}`);
});
