/**
 * Azure OpenAI embeddings for worker API endpoints
 */

import type { Env } from '../../worker.js'

/**
 * Generate embeddings using Azure OpenAI API
 * @param texts - Array of texts to embed
 * @param env - The environment variables
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(texts: string[], env: Env): Promise<number[][]> {
  if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT) {
    throw new Error('Azure OpenAI API credentials not configured')
  }

  const response = await fetch(`${env.AZURE_ENDPOINT}/openai/deployments/${env.AZURE_MODEL || 'text-embedding-ada-002'}/embeddings?api-version=2024-02-15-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.AZURE_API_KEY
    },
    body: JSON.stringify({
      input: texts
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`)
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  return data.data.map(item => item.embedding)
}

/**
 * Generate embedding for a single text using Azure OpenAI
 * @param text - Text to embed
 * @param env - The environment variables
 * @returns Embedding vector
 */
export async function embedTextWithAzure(text: string, env: Env): Promise<number[]> {
  if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT) {
    throw new Error('Azure OpenAI credentials not configured')
  }

  const url = `${env.AZURE_ENDPOINT}/openai/deployments/${env.AZURE_MODEL}/embeddings?api-version=2024-02-15-preview`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.AZURE_API_KEY
    },
    body: JSON.stringify({
      input: text
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`)
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}
