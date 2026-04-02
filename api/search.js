// api/search.js — Vercel Serverless Function
// Proxy para Zillow Scraper API en RapidAPI

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { zip, priceMin, priceMax, beds } = req.query;

  if (!zip) {
    return res.status(400).json({ error: 'ZIP requerido' });
  }

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'API key no configurada' });
  }

  try {
    // Buscar por ZIP code en Zillow Scraper API
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
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Zillow API error:', response.status, errText);
      return res.status(response.status).json({ error: 'Error en Zillow API', details: errText });
    }

    const data = await response.json();

    // Normalizar los datos de Zillow al formato de la app
    const properties = normalizeZillowData(data);

    // Filtrar propiedades con HOA
    const filtered = properties.filter(p => !p.hasHoa);

    return res.status(200).json({
      properties: filtered,
      total: filtered.length,
      zip
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function normalizeZillowData(data) {
  // La estructura puede variar según la versión de la API
  const listings = data?.searchResults?.listResults
    || data?.results
    || data?.props
    || data?.listResults
    || [];

  return listings.map(item => {
    const hoaFee = item.hdpData?.homeInfo?.hoaFee
      || item.hoaFee
      || 0;

    return {
      zpid: item.zpid || item.id || String(Math.random()),
      address: item.address || item.streetAddress || 'Dirección no disponible',
      price: item.price || item.unformattedPrice || 0,
      beds: item.beds || item.bedrooms || 0,
      baths: item.baths || item.bathrooms || 0,
      sqft: item.area || item.livingArea || item.sqft || null,
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
      hoaFee: hoaFee,
      priceReduction: item.priceReduction || 0,
      lat: item.latLong?.latitude || item.lat || null,
      lng: item.latLong?.longitude || item.lng || null,
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
  if (t.includes('single')) return 'Single';
  return type;
}
