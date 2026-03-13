import { Language, Intent } from '../models/Conversation';

// ─────────────────────────────────────────────
// Language detection
//
// Simple keyword-based detector for the four
// languages GGCL operates in.
// Falls back to 'en' if no match is found.
// ─────────────────────────────────────────────

const PIDGIN_MARKERS  = ['wetin', 'dey', 'na', 'abeg', 'oga', 'wahala', 'no be', 'how far', 'e dey'];
const YORUBA_MARKERS  = ['ẹ jọ', 'jọwọ', 'ṣe', 'bẹẹni', 'rara', 'pẹlú', 'fún mi', 'kí ni', 'bawo'];
const HAUSA_MARKERS   = ['yaya', 'ina', 'lafiya', 'sannu', 'marhaba', 'don allah', 'me yasa', 'yaushe'];

export function detectLanguage(text: string): Language {
  const lower = text.toLowerCase();

  const score = (markers: string[]) =>
    markers.filter(m => lower.includes(m)).length;

  const scores: Record<Language, number> = {
    pidgin: score(PIDGIN_MARKERS),
    yoruba: score(YORUBA_MARKERS),
    hausa:  score(HAUSA_MARKERS),
    en:     0,
  };

  const best = (Object.entries(scores) as [Language, number][])
    .sort((a, b) => b[1] - a[1])[0];

  // Only override English if we have at least 1 clear match
  return best[1] > 0 ? best[0] : 'en';
}

// ─────────────────────────────────────────────
// Intent classification
//
// Maps the user's message to one of the four
// GGCL curriculum pillars, or flags safeguarding
// concerns, off-topic messages and greetings.
//
// Order matters — safeguarding is checked first.
// ─────────────────────────────────────────────

// Safeguarding — checked before everything else
const SAFEGUARDING_KEYWORDS = [
  'abuse', 'assault', 'rape', 'molest', 'hurt me', 'beat me',
  'forced me', 'touching me', 'touches me', 'unsafe', 'in danger',
  'scared of', 'harass', 'threat', 'suicid', 'self harm', 'kill myself',
];

// Pillar 1 — Period & Menstrual Hygiene
const MENSTRUAL_KEYWORDS = [
  'period', 'menstrual', 'menstruation', 'cycle', 'cramp', 'pad',
  'tampon', 'flow', 'discharge', 'ovulation', 'uterus', 'vagina',
  'puberty', 'hygiene', 'irregular', 'spotting', 'bloat', 'pms',
  'first period', 'menarche', 'sanitary', 'cloth pad',
];

// Pillar 2 — Environment
const ENVIRONMENT_KEYWORDS = [
  'climate', 'environment', 'recycle', 'recycling', 'waste', 'pollution',
  'plastic', 'carbon', 'global warming', 'eco', 'sustainable', 'green',
  'compost', 'biodiversity', 'forest', 'energy', 'solar', 'emissions',
  'ozone', 'litter', 'rubbish', 'trash',
];

// Pillar 3 — Digital & AI Skills
const DIGITAL_KEYWORDS = [
  'internet', 'online', 'social media', 'computer', 'digital', 'ai',
  'artificial intelligence', 'cyberbully', 'password', 'hack', 'phishing',
  'safe online', 'website', 'google', 'email', 'download', 'app',
  'smartphone', 'coding', 'programming', 'technology', 'tech', 'data',
  'privacy', 'screen time',
];

// Pillar 4 — Life Skills & Financial Literacy
const LIFE_SKILLS_KEYWORDS = [
  'money', 'save', 'saving', 'budget', 'spend', 'finance', 'naira',
  'business', 'entrepreneur', 'invest', 'bank', 'income', 'expense',
  'confidence', 'self esteem', 'self-esteem', 'leadership', 'goal',
  'career', 'future', 'communication', 'assertive', 'speak up',
  'relationship', 'boundary', 'stress', 'anxiety', 'emotion',
];

// Greetings
const GREETING_KEYWORDS = [
  'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
  'how are you', 'what can you do', 'who are you', 'what is amara',
];

// ─────────────────────────────────────────────
// Score helper — counts keyword hits
// ─────────────────────────────────────────────

function scoreKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

// ─────────────────────────────────────────────
// Main classifier
// ─────────────────────────────────────────────

export function classifyIntent(text: string): Intent {
  const lower = text.toLowerCase();

  // 1. Safeguarding always wins
  if (SAFEGUARDING_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'safeguarding';
  }

  // 2. Greetings — short messages only
  if (text.trim().split(' ').length <= 8) {
    if (GREETING_KEYWORDS.some(kw => lower.includes(kw))) {
      return 'greeting';
    }
  }

  // 3. Score all four pillars
  const scores: Record<string, number> = {
    menstrual_hygiene: scoreKeywords(text, MENSTRUAL_KEYWORDS),
    environment:       scoreKeywords(text, ENVIRONMENT_KEYWORDS),
    digital_skills:    scoreKeywords(text, DIGITAL_KEYWORDS),
    life_skills:       scoreKeywords(text, LIFE_SKILLS_KEYWORDS),
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  // 4. If no pillar keyword matched at all → off_topic
  if (best[1] === 0) return 'off_topic';

  return best[0] as Intent;
}

// ─────────────────────────────────────────────
// Safeguarding check (standalone export)
// Used by chatController to flag conversations
// separately from intent classification
// ─────────────────────────────────────────────

export function isSafeguardingConcern(text: string): boolean {
  const lower = text.toLowerCase();
  return SAFEGUARDING_KEYWORDS.some(kw => lower.includes(kw));
}

export function extractFlagReason(text: string): string | null {
  const lower = text.toLowerCase();
  const matched = SAFEGUARDING_KEYWORDS.find(kw => lower.includes(kw));
  return matched ? `Keyword detected: "${matched}"` : null;
}