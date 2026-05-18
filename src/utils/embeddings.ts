// ─────────────────────────────────────────────
// Embeddings utility
//
// Primary  : HuggingFace Inference API
//            model: sentence-transformers/all-MiniLM-L6-v2
//            output: 384-dim float[]
//
// Fallback : if HF_API_KEY is missing or the API is down,
//            we return an empty array and the RAG pipeline
//            automatically switches to keyword (regex) search
// ─────────────────────────────────────────────

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
const HF_MODEL   = process.env.HF_EMBEDDING_MODEL
  ?? 'sentence-transformers/all-MiniLM-L6-v2';

// HuggingFace Serverless Inference API v1 — feature-extraction endpoint
const HF_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}/v1/feature-extraction`;

// ─────────────────────────────────────────────
// Embed a single string
// ─────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  if (!HF_API_KEY) {
    console.warn('[embeddings] HF_API_KEY not set — falling back to keyword search');
    return [];
  }

  try {
    const res = await fetch(HF_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        inputs:  text,
        options: { wait_for_model: true },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[embeddings] HuggingFace error:', err);
      return [];
    }

    // New /models/ endpoint returns number[][] (nested) for single string input.
    // Old /pipeline/feature-extraction/ returned number[] (flat). Handle both.
    const data = await res.json() as number[] | number[][];
    if (Array.isArray(data[0])) return (data as number[][])[0];
    return data as number[];

  } catch (err) {
    console.error('[embeddings] fetch failed:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// Embed a batch of strings
// Useful during ingest — avoids hammering the API
// with one request per chunk
// ─────────────────────────────────────────────

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!HF_API_KEY) {
    console.warn('[embeddings] HF_API_KEY not set — returning empty embeddings');
    return texts.map(() => []);
  }

  try {
    const res = await fetch(HF_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        inputs:  texts,
        options: { wait_for_model: true },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[embeddings] HuggingFace batch error:', err);
      return texts.map(() => []);
    }

    // HF returns number[][] for array input
    const data = await res.json() as number[][];
    return data;

  } catch (err) {
    console.error('[embeddings] batch fetch failed:', err);
    return texts.map(() => []);
  }
}

// ─────────────────────────────────────────────
// Cosine similarity between two vectors
// Used when doing in-memory re-ranking after
// Atlas vector search
// ─────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────────────────────
// Check if embeddings are available
// Called at startup to log status
// ─────────────────────────────────────────────

export function embeddingsAvailable(): boolean {
  return Boolean(HF_API_KEY);
}