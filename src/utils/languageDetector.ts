import { Language, Intent } from '../models/Conversation';

// ─────────────────────────────────────────────
// Language detection
//
// Diacritic-tolerant: strips Unicode combining
// marks before matching so "jowo" matches "jọwọ"
// and "don allah" matches users who omit accents.
// ─────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                       // decompose diacritics
    .replace(/[̀-ͯ]/g, '');       // strip combining marks
}

const PIDGIN_MARKERS = [
  'wetin', 'dey', 'abeg', 'oga', 'wahala', 'no be', 'how far', 'e dey',
  'na im', 'sabi', 'chop', 'waka', 'naso', 'comot', 'vex', 'dem', 'una',
];

const YORUBA_MARKERS = [
  // diacritic forms + normalized equivalents already handled by normalize()
  'e jo', 'jowo', 'se', 'beeni', 'rara', 'pelu', 'fun mi', 'ki ni', 'bawo',
  'ekaaro', 'ekaasan', 'ekale', 'e kaabo', 'alafia', 'modupe', 'odabo',
  'mo fe', 'nibo', 'tani', 'igba wo', 'kilode',
];

const HAUSA_MARKERS = [
  'yaya', 'ina kwana', 'lafiya', 'sannu', 'marhaba', 'don allah',
  'me yasa', 'yaushe', 'ina', 'ka yi', 'ki yi', 'mun gode',
  'wane ne', 'wace ce', 'ina son', 'ban san ba', 'ko',
];

export function detectLanguage(text: string): Language {
  const norm = normalize(text);
  // Build a set of individual words for whole-word matching
  const wordSet = new Set(norm.split(/\W+/).filter(w => w.length > 0));

  const score = (markers: string[]) =>
    markers.filter(m => {
      const normM = normalize(m);
      // Multi-word phrases: substring match is safe (long enough to be unambiguous)
      if (normM.includes(' ')) return norm.includes(normM);
      // Single words: whole-word match only — prevents 'to' matching inside 'stomach'
      return wordSet.has(normM);
    }).length;

  const scores: Record<Language, number> = {
    pidgin: score(PIDGIN_MARKERS),
    yoruba: score(YORUBA_MARKERS),
    hausa:  score(HAUSA_MARKERS),
    en:     0,
  };

  const best = (Object.entries(scores) as [Language, number][])
    .sort((a, b) => b[1] - a[1])[0];

  return best[1] > 0 ? best[0] : 'en';
}

// ─────────────────────────────────────────────
// Intent classification
// ─────────────────────────────────────────────

// Safeguarding — highest priority
const SAFEGUARDING_KEYWORDS = [
  'abuse', 'assault', 'rape', 'molest', 'hurt me', 'beat me',
  'forced me', 'touching me', 'touches me', 'unsafe', 'in danger',
  'scared of', 'harass', 'threat', 'suicid', 'self harm', 'kill myself',
  // Pidgin equivalents
  'dem dey beat', 'e touch me', 'e force me', 'dem dey harass',
  // Yoruba-ish
  'o na mi', 'o fi mi lara',
];

const MENSTRUAL_KEYWORDS = [
  'period', 'menstrual', 'menstruation', 'cycle', 'cramp', 'pad',
  'tampon', 'flow', 'discharge', 'ovulation', 'uterus', 'vagina',
  'puberty', 'hygiene', 'irregular', 'spotting', 'bloat', 'pms',
  'first period', 'menarche', 'sanitary', 'cloth pad',
  'pain', 'ache', 'stomach', 'abdomen', 'lower abdomen', 'belly',
  'nkan osu', 'nkan mi de',  // Yoruba
  'al haila', 'haila',        // Hausa
];

const ENVIRONMENT_KEYWORDS = [
  'climate', 'environment', 'recycle', 'recycling', 'waste', 'pollution',
  'plastic', 'carbon', 'global warming', 'eco', 'sustainable', 'green',
  'compost', 'biodiversity', 'forest', 'energy', 'solar', 'emissions',
  'ozone', 'litter', 'rubbish', 'trash', 'clean up', 'tree',
];

const DIGITAL_KEYWORDS = [
  'internet', 'online', 'social media', 'computer', 'digital', 'ai',
  'artificial intelligence', 'cyberbully', 'password', 'hack', 'phishing',
  'safe online', 'website', 'google', 'email', 'download', 'app',
  'smartphone', 'coding', 'programming', 'technology', 'tech', 'data',
  'privacy', 'screen time', 'wifi', 'whatsapp', 'tiktok', 'instagram',
];

const LIFE_SKILLS_KEYWORDS = [
  'money', 'save', 'saving', 'budget', 'spend', 'finance', 'naira',
  'business', 'entrepreneur', 'invest', 'bank', 'income', 'expense',
  'confidence', 'self esteem', 'self-esteem', 'leadership', 'goal',
  'career', 'future', 'communication', 'assertive', 'speak up',
  'relationship', 'boundary', 'stress', 'anxiety', 'emotion',
  'owo', 'iṣowo', 'àjowọ',  // Yoruba finance
  'kudi', 'kasuwanci',        // Hausa finance
];

const GREETING_KEYWORDS = [
  'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
  'how are you', 'what can you do', 'who are you', 'what is amara',
  'how far', 'ekaaro', 'sannu', 'bawo ni',
];

function scoreKeywords(text: string, keywords: string[]): number {
  const norm = normalize(text);
  const wordSet = new Set(norm.split(/\W+/).filter(w => w.length > 0));
  return keywords.filter(kw => {
    const normKw = normalize(kw);
    // Multi-word phrases: substring match
    if (normKw.includes(' ')) return norm.includes(normKw);
    // Single keywords >= 5 chars: substring match is safe (e.g. 'menstrual', 'period')
    if (normKw.length >= 5) return norm.includes(normKw);
    // Short single keywords (e.g. 'ai', 'app'): whole-word match only
    return wordSet.has(normKw);
  }).length;
}

export function classifyIntent(text: string): Intent {
  const lower = text.toLowerCase();

  if (SAFEGUARDING_KEYWORDS.some(kw => normalize(lower).includes(normalize(kw)))) {
    return 'safeguarding';
  }

  if (text.trim().split(/\s+/).length <= 8) {
    if (GREETING_KEYWORDS.some(kw => normalize(lower).includes(normalize(kw)))) {
      return 'greeting';
    }
  }

  const scores: Record<string, number> = {
    menstrual_hygiene: scoreKeywords(text, MENSTRUAL_KEYWORDS),
    environment:       scoreKeywords(text, ENVIRONMENT_KEYWORDS),
    digital_skills:    scoreKeywords(text, DIGITAL_KEYWORDS),
    life_skills:       scoreKeywords(text, LIFE_SKILLS_KEYWORDS),
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  if (best[1] === 0) return 'off_topic';

  return best[0] as Intent;
}

export function isSafeguardingConcern(text: string): boolean {
  const norm = normalize(text);
  return SAFEGUARDING_KEYWORDS.some(kw => norm.includes(normalize(kw)));
}

export function extractFlagReason(text: string): string | null {
  const norm    = normalize(text);
  const matched = SAFEGUARDING_KEYWORDS.find(kw => norm.includes(normalize(kw)));
  return matched ? `Keyword detected: "${matched}"` : null;
}
