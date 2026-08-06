/*
 * OpenAI-backed LlmClient for the local demo tester (dev only).
 *
 * Implements the provider-agnostic LlmClient contract from the RMS extractor
 * engine, so Karun's vendored D30 prompt runs unchanged; only the model behind
 * it is swapped. Plain https, no new dependencies. Hard 30s timeout and typed
 * errors per the external-call rules. The API key comes from the environment
 * (loaded from the gitignored .env by the demo server); it is never logged.
 */
import * as https from 'https';
import type { LlmClient } from '../../services/rms/src/extract/extractorEngine';

export class OpenAiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.OPENAI_MODEL || 'gpt-4o-mini',
  ) {}

  complete(system: string, user: string): Promise<string> {
    const body = JSON.stringify({
      model: this.model,
      temperature: 0,
      max_tokens: 700,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const j = JSON.parse(data) as { choices?: Array<{ message?: { content?: string } }> };
                const txt = j.choices?.[0]?.message?.content;
                if (typeof txt === 'string' && txt.length) return resolve(txt);
                return reject(new Error('OpenAI: response had no message content'));
              } catch {
                return reject(new Error('OpenAI: unparseable response body'));
              }
            }
            let msg = `OpenAI HTTP ${res.statusCode}`;
            try {
              const errBody = JSON.parse(data) as { error?: { message?: string } };
              if (errBody.error?.message) msg += `: ${errBody.error.message}`;
            } catch { /* keep the bare status */ }
            reject(new Error(msg));
          });
        },
      );
      req.on('error', (e) => reject(new Error(`OpenAI request failed: ${e.message}`)));
      req.on('timeout', () => req.destroy(new Error('OpenAI request timeout (30s)')));
      req.end(body);
    });
  }
}
