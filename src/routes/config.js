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
  }
};

function requestedLanguage(req) {
  const requested = req.query.lang || req.get('Accept-Language') || 'en';
  const code = String(requested).split(',')[0].split(';')[0].trim().toLowerCase().split('-')[0];
  return code === 'am' ? 'am' : 'en';
}

router.get('/', (req, res) => {
  const language = requestedLanguage(req);
  res.vary('Accept-Language');
  res.set('Content-Language', language);
  return res.json({
    language,
    supportedLanguages: [
      { code: 'en', name: 'English' },
      { code: 'am', name: 'አማርኛ' }
    ],
    plannedLanguages: [{ code: 'om', name: 'Afaan Oromo' }],
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
