/**
 * Response utilities for worker API endpoints
 */

interface ErrorResponse {
  error: string
  code?: string
  details?: string[]
  timestamp: string
}

/**
 * Create a JSON response with CORS headers
 * @param data - The data to include in the response
 * @returns JSON response with CORS headers
 */
export function jsonResponse(data: any): Response {
  return Response.json(data, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

/**
 * Create an error response
 * @param message - Error message
 * @param status - HTTP status code
 * @param codeOrHeaders - Error code or additional headers
 * @param details - Additional error details
 * @param extraHeaders - Additional headers (when codeOrHeaders is a string)
 * @returns Error response
 */
export function errorResponse(
  message: string,
  status: number,
  codeOrHeaders?: string | Record<string, string>,
  details?: string[],
  extraHeaders?: Record<string, string>
): Response {
  const errorObj: ErrorResponse = {
    error: message,
    timestamp: new Date().toISOString()
  }

  // Handle backward compatibility: if third arg is object, treat as headers
  let code: string | undefined
  let headers: Record<string, string> = {}

  if (typeof codeOrHeaders === 'string') {
    code = codeOrHeaders
    headers = extraHeaders || {}
  } else if (codeOrHeaders) {
    headers = codeOrHeaders
  }

  if (code) {
    errorObj.code = code
  }

  if (details && details.length > 0) {
    errorObj.details = details
  }

  return Response.json(errorObj, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers
    }
  })
}
