import * as cbor from 'cbor'
import { Base64 } from 'js-base64'

/**
 * CBOR/COSE Message Encoder
 *
 * This module provides functions to encode messages in CBOR and COSE Sign1 formats
 */

export interface CoseSign1Payload {
  protected_headers?: Record<string, any>
  unprotected_headers?: Record<string, any>
  payload: any
  signature?: string // Base64 or hex encoded signature
}

export interface EncodingResult {
  success: boolean
  data?: string // Base64 encoded result
  error?: string
}

/**
 * Encode a JSON object or string as CBOR
 */
export function encodeCbor(input: string): EncodingResult {
  try {
    // Try to parse as JSON first
    let data: any
    try {
      data = JSON.parse(input)
    } catch {
      // If not JSON, treat as string
      data = input
    }

    // Encode to CBOR
    const cborBuffer = cbor.encode(data)
    const base64String = Base64.fromUint8Array(cborBuffer)

    return {
      success: true,
      data: base64String,
    }
  } catch (error) {
    return {
      success: false,
      error: `CBOR encoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Encode a message as COSE Sign1 format
 *
 * Expected input format (JSON):
 * {
 *   "protected_headers": { "alg": -7 },     // Optional protected headers
 *   "unprotected_headers": { "kid": "11" }, // Optional unprotected headers
 *   "payload": { "some": "data" },          // Payload data
 *   "signature": "base64signature"          // Optional signature (dummy if not provided)
 * }
 */
export function encodeCoseSign1(input: string): EncodingResult {
  try {
    let coseData: CoseSign1Payload
    try {
      coseData = JSON.parse(input)
    } catch {
      return {
        success: false,
        error:
          'COSE input must be valid JSON with structure: {"protected_headers": {...}, "unprotected_headers": {...}, "payload": {...}, "signature": "..."}',
      }
    }

    // Validate structure
    if (!coseData || typeof coseData !== 'object') {
      return {
        success: false,
        error: 'COSE input must be a JSON object',
      }
    }

    if (!('payload' in coseData)) {
      return {
        success: false,
        error: 'COSE input must contain a "payload" field',
      }
    }

    // Build COSE Sign1 structure: [protected, unprotected, payload, signature]
    const protectedHeaders = coseData.protected_headers || {}
    const unprotectedHeaders = coseData.unprotected_headers || {}

    // Encode protected headers as CBOR
    const protectedBytes = cbor.encode(protectedHeaders)

    // Encode payload as CBOR
    const payloadBytes = cbor.encode(coseData.payload)

    // Handle signature
    let signatureBytes: Uint8Array
    if (coseData.signature) {
      try {
        // Try to decode as base64 first
        signatureBytes = Buffer.from(Base64.toUint8Array(coseData.signature))
      } catch {
        try {
          // Try to decode as hex
          const hexString = coseData.signature.replace(/^0x/, '').replace(/\s/g, '')
          if (!/^[0-9A-Fa-f]*$/.test(hexString)) {
            throw new Error('Invalid hex format')
          }
          signatureBytes = Buffer.from(
            new Uint8Array(hexString.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [])
          )
        } catch {
          return {
            success: false,
            error: 'Signature must be valid base64 or hex string',
          }
        }
      }
    } else {
      // Generate empty signature
      signatureBytes = Buffer.from([])
    }

    // Create COSE Sign1 array
    const coseArray = [protectedBytes, unprotectedHeaders, payloadBytes, signatureBytes]

    // Encode as tagged CBOR (tag 18 for COSE_Sign1)
    const taggedCose = new cbor.Tagged(18, coseArray)
    const cborBuffer = cbor.encode(taggedCose)
    const base64String = Base64.fromUint8Array(cborBuffer)

    return {
      success: true,
      data: base64String,
    }
  } catch (error) {
    return {
      success: false,
      error: `COSE Sign1 encoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Format a JSON string for COSE Sign1 structure
 */
export function formatCoseTemplate(existingPayload?: string): string {
  let payload: any = { example: 'data', value: 42 }

  // Try to use existing payload if it's valid JSON
  if (existingPayload) {
    try {
      payload = JSON.parse(existingPayload)
    } catch {
      // Keep default payload if existing is not valid JSON
    }
  }

  const coseTemplate = {
    protected_headers: {
      alg: -7, // ES256 algorithm
    },
    unprotected_headers: {
      kid: 'key-1',
    },
    payload: payload,
    signature: 'AABBCCDDEEFF', // Dummy signature in hex
  }

  return JSON.stringify(coseTemplate, null, 2)
}
