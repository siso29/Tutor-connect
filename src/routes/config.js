const express = require('express');

const router = express.Router();

const translations = {
  en: {
    searchTutors: 'Find a tutor',
    search: 'Search',
    online: 'Online',
    faceToFace: 'Face-to-face',
    grade: 'Grade',
    location: 'Location',
    hourlyRate: 'Hourly rate',
    noTutorsFound: 'No tutors found',
    loading: 'Loading'
  },
  am: {
    searchTutors: 'አስተማሪ ይፈልጉ',
    search: 'ፈልግ',
    online: 'በመስመር ላይ',
    faceToFace: 'ፊት ለፊት',
    grade: 'ክፍል',
    location: 'አካባቢ',
    hourlyRate: 'የአንድ ሰዓት ክፍያ',
    noTutorsFound: 'አስተማሪዎች አልተገኙም',
    loading: 'በመጫን ላይ'
  },
  om: {
    searchTutors: 'Barsiisaa barbaadi',
    search: 'Barbaadi',
    online: 'Toora interneetii irratti',
    faceToFace: 'Fuulaa fuulatti',
    grade: 'Kutaa',
    location: 'Bakka',
    hourlyRate: "Gatii sa'aatii",
    noTutorsFound: 'Barsiisonni hin argamne',
    loading: 'Maaloo eegi'
  },
  so: {
    searchTutors: 'Raadi macallin',
    search: 'Raadi',
    online: 'Onlayn',
    faceToFace: 'Fool ka fool',
    grade: 'Fasalka',
    location: 'Goobta',
    hourlyRate: 'Qiimaha saacaddii',
    noTutorsFound: 'Macallimiin lama helin',
    loading: 'Fadlan sug'
  }
};

function requestedLanguage(req) {
  const requested = req.query.lang || req.get('Accept-Language') || 'en';
  const code = String(requested).split(',')[0].split(';')[0].trim().toLowerCase().split('-')[0];
  return Object.hasOwn(translations, code) ? code : 'en';
}

router.get('/', (req, res) => {
  const language = requestedLanguage(req);
  res.vary('Accept-Language');
  res.set('Content-Language', language);
  return res.json({
    language,
    supportedLanguages: [
      { code: 'en', name: 'English' },
      { code: 'am', name: 'አማርኛ' },
      { code: 'om', name: 'Afaan Oromoo' },
      { code: 'so', name: 'Af-Soomaali' }
    ],
    plannedLanguages: [],
    translations: translations[language],
    gradeLevels: Array.from({ length: 13 }, (_, grade) => grade),
    currency: { code: 'ETB', symbol: 'ETB', localSymbol: 'ብር' },
    featuredLocations: ['Dire Dawa'],
    tutorModes: ['online', 'face-to-face'],
    discovery: {
      locationParameter: 'location',
      modeParameter: 'mode',
      lowBandwidthParameter: 'lowBandwidth'
    }
  });
});

module.exports = router;
