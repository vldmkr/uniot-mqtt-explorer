import { Base64Message } from '../../../backend/src/Model/Base64Message'
import { Decoder } from '../../../backend/src/Model/Decoder'
import { DecoderEnvelope } from './DecoderEnvelope'
import { MessageDecoder } from './MessageDecoder'
import * as cbor from 'cbor'

type CborFormats = 'CBOR'

/**
 * CBOR Decoder with COSE Sign1 Support
 *
 * This decoder handles:
 * 1. Regular CBOR messages - decoded to JSON format
 * 2. COSE Sign1 messages - parsed and internal CBOR structures decoded
 *
 * COSE Sign1 structure: tag(18)[protected, unprotected, payload, signature]
 * - tag: CBOR tag 18 (standard) or 98 (alternative) - optional
 * - protected: CBOR-encoded headers (decoded)
 * - unprotected: headers object (as-is)
 * - payload: often CBOR-encoded (decoded if possible)
 * - signature: binary signature (preview shown)
 */

export const CborDecoder: MessageDecoder<CborFormats> = {
  formats: ['CBOR'],
  canDecodeData(data: Base64Message): boolean {
    try {
      // Try to decode the data to see if it's valid CBOR
      const buffer = data.toBuffer()
      if (buffer.length === 0) return false

      // Quick check: CBOR data starts with specific byte patterns
      const firstByte = buffer[0]
      const majorType = (firstByte >> 5) & 0x07

      // Major types 0-7 are valid in CBOR
      if (majorType < 0 || majorType > 7) {
        return false
      }

      // Try to actually decode a small portion to verify it's valid CBOR
      cbor.decode(buffer)
      return true
    } catch {
      return false
    }
  },
  decode(input: Base64Message, format?: CborFormats | string): DecoderEnvelope {
    try {
      const buffer = input.toBuffer()
      const decoded = cbor.decode(buffer)

      // Check if this is a COSE Sign1 message
      if (isCoseSign1(decoded)) {
        const coseStructure = parseCoseSign1(decoded)
        const jsonString = JSON.stringify(coseStructure, null, 2)

        return {
          message: Base64Message.fromString(jsonString),
          decoder: Decoder.CBOR,
        }
      }

      // Regular CBOR decoding
      const jsonString = JSON.stringify(decoded, null, 2)

      return {
        message: Base64Message.fromString(jsonString),
        decoder: Decoder.CBOR,
      }
    } catch (error) {
      return {
        error: `Failed to decode CBOR: ${error instanceof Error ? error.message : 'Unknown error'}`,
        decoder: Decoder.NONE,
      }
    }
  },
}

// Helper function to detect COSE Sign1 structure
function isCoseSign1(decoded: any): boolean {
  // COSE Sign1 can be:
  // 1. Tagged CBOR: CBOR tag 18 or 98 wrapping the array
  // 2. Untagged CBOR: Direct array structure

  let coseArray = decoded

  // Check if it's a tagged value (CBOR tag 18 for COSE_Sign1 or tag 98)
  if (decoded && typeof decoded === 'object' && 'tag' in decoded && 'value' in decoded) {
    // CBOR tag 18 is the standard tag for COSE_Sign1
    if (decoded.tag === 18 || decoded.tag === 98) {
      coseArray = decoded.value
    }
  }

  // Now check if the array (tagged or untagged) follows COSE Sign1 structure
  return (
    Array.isArray(coseArray) &&
    coseArray.length === 4 &&
    // First element should be a byte string (protected headers)
    (coseArray[0] instanceof Uint8Array || coseArray[0] instanceof Buffer) &&
    // Second element should be an object (unprotected headers)
    typeof coseArray[1] === 'object' &&
    coseArray[1] !== null &&
    !Array.isArray(coseArray[1]) &&
    !(coseArray[1] instanceof Uint8Array) &&
    !(coseArray[1] instanceof Buffer) &&
    // Third element is payload (can be byte string or null)
    (coseArray[2] instanceof Uint8Array || coseArray[2] instanceof Buffer || coseArray[2] === null) &&
    // Fourth element should be a byte string (signature)
    (coseArray[3] instanceof Uint8Array || coseArray[3] instanceof Buffer)
  )
}

// Helper function to parse COSE Sign1 structure and decode nested CBOR
function parseCoseSign1(decoded: any): any {
  try {
    let coseArray = decoded
    let tag = null

    // Extract the tag and array if it's a tagged value
    if (decoded && typeof decoded === 'object' && 'tag' in decoded && 'value' in decoded) {
      tag = decoded.tag
      coseArray = decoded.value
    }

    const [protectedBytes, unprotectedHeaders, payloadBytes, signatureBytes] = coseArray

    const result: any = {
      _cose_structure: 'COSE_Sign1',
      _cbor_tag: tag, // Include the tag information if present
      protected_headers: {},
      unprotected_headers: unprotectedHeaders,
      payload: null,
      signature_info: {
        length: signatureBytes.length,
        preview: Array.from(signatureBytes.slice(0, 16)), // Show first 16 bytes
      },
    }

    // Decode protected headers (CBOR-encoded)
    try {
      if (protectedBytes.length > 0) {
        const protectedDecoded = cbor.decode(Buffer.from(protectedBytes))
        result.protected_headers = protectedDecoded
      } else {
        result.protected_headers = {}
      }
    } catch (error) {
      result.protected_headers = {
        _decode_error: 'Failed to decode protected headers',
        _raw_bytes: Array.from(protectedBytes.slice(0, 32)), // Show first 32 bytes
      }
    }

    // Decode payload if present (often CBOR-encoded)
    if (payloadBytes !== null && payloadBytes.length > 0) {
      try {
        // Try to decode as CBOR first
        const payloadDecoded = cbor.decode(Buffer.from(payloadBytes))
        result.payload = {
          _type: 'cbor',
          _decoded: payloadDecoded,
        }
      } catch {
        // If not CBOR, try as UTF-8 string
        try {
          const payloadString = Buffer.from(payloadBytes).toString('utf8')
          // Check if it's printable ASCII/UTF-8
          if (payloadString.length > 0 && !/[\x00-\x08\x0E-\x1F\x7F-\x9F]/.test(payloadString)) {
            result.payload = {
              _type: 'string',
              _decoded: payloadString,
            }
          } else {
            throw new Error('Not printable text')
          }
        } catch {
          // Fallback to raw bytes array (show preview)
          result.payload = {
            _type: 'binary',
            _length: payloadBytes.length,
            _preview: Array.from(payloadBytes.slice(0, 32)), // Show first 32 bytes
          }
        }
      }
    } else {
      result.payload = null
    }

    return result
  } catch (error) {
    return {
      _cose_structure: 'COSE_Sign1',
      _parse_error: 'Failed to parse COSE Sign1 structure',
      _error_details: error instanceof Error ? error.message : 'Unknown error',
      _raw_structure: decoded,
    }
  }
}
