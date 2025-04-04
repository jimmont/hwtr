
# Hwtr: HMAC Web Tokens (HWT)

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Hwtr is a library for managing space-efficient HMAC Web Tokens (HWT). It addresses limitations of JWT while maintaining security and compatibility with modern JavaScript environments.

Hwtr generates compact, secure HMAC Web Tokens (HWTs) that are 13-40% smaller than equivalent JWTs, with native support for modern JavaScript features, hidden claims and key rotation for enhanced security.

## Key Features

- **⏱️ Performant** Create and verify tokens with minimal overhead 
- **🏷️ Compact** 13-40% smaller tokens than equivalent JWTs
- **📦 Complete Package** no external dependencies
- **🔐 Secure** HMAC signatures support SHA-256/384/512 and key rotation 
- **📄 Hidden Claims** Secure verification data that's not included in the token
- **🔧 Flexible** Multiple encoding formats for different use cases
- **🛠️ Configurable** and extensible, for smaller tokens, error handling, etc
- **🌐 Modern JS** Native support for Sets, Maps, Dates, BigInt and TypedArrays
- **🛡️ Licensed under Apache-2.0** allowing safe commercial use with explicit patent protection
- **🌍 Cross-Platform** Works in Cloudflare Workers, Deno, Node.js, modern browsers (with ESM + crypto support)
- **🔍 HWT tokens** look like `hwt.signature.key-id.expires.format.payload`


## Installation

```bash
curl -O TODO
```

## Quick Start

```javascript
import Hwtr from './hwtr.js';

// load and register formats to use
import {formats} from './hwtr.formats.js';
Hwtr.registerFormat('j', formats.j);
Hwtr.registerFormat('jx', formats.jx);

// generate, load or create keys
const keys = await Hwtr.generateKeys();
// const keys = JSON.parse(env.secret_keys);
// const keys = {current:'k1',keys:[{id:'k1',secret:'...32 or more bytes.....'}]}

// create a token factory--an instance of Hwtr--with default 2 minute lifespan
const hwtr = await Hwtr.factory(keys, {expiresInSeconds:120});

// create a HWT that expires in the default time
const hwt = await hwtr.create( { userId: '123', role: 'admin' } );

// create a HWT that expires in 1 hour
const hwt_1h = await hwtr.createWith( 3600, { userId: '123', role: 'admin' } );

// check the token
const result = await hwtr.verify( hwt );

if (result.ok) {

  // result.data has the original payload
  console.log(result.data);

} else {

  console.error(result.error);

}
```

## Why HWT?

### Smaller Tokens

Hwtr tokens are consistently smaller than equivalent JWTs:

| Payload Size | JWT bytes | HWT bytes | Savings |
|--------------|-------------|--------------|---------|
| Very Small   | 176         | 104          | 41%     |
| Small        | 243         | 170          | 30%     |
| Medium       | 547         | 474          | 13%     |

### Modern JavaScript Support

The extended JSON format (`jx`) handles modern JavaScript types without custom serialization code:

```javascript
// create Hwtr with extended JSON support
const hwtr = await Hwtr.factory(keys, { format: 'jx' });

// create a token with complex types
const complexPayload = {
  permissions: new Set(['read', 'write']),
  settings: new Map([['theme', 'dark']]),
  lastLogin: new Date(),
  profileImage: new Uint8Array([1, 2, 3, 4, 5])
};

const token = await hwtr.create(complexPayload);
```

### Hidden Payloads

Unique to Hwtr and HWT, hidden payloads can be used for token verification but not included in the token itself:

```javascript
// Create a token with hidden payload
const data = { userId: '123', role: 'admin' };
const hidden = { deviceFingerprint: 'abc123', ipAddress: '192.168.1.1' };

// token doesn't include the hidden data
const token = await hwtr.create(data, hidden);
const token1hr = await hwtr.createWith(3600, data, hidden);

// requires hidden data to verify
const result = await hwtr.verify(token, hidden);
const result1hr = await hwtr.verify(token1hr, hidden);

```

## API Reference

### Creating Tokens


```javascript
// basic token creation with default expiration time
const token = await hwtr.create(payload);

// token with custom expiration time, seconds into the future
const token = await hwtr.createWith(3600, payload); // 1 hour expiration

// tokens with hidden claims
const token = await hwtr.create(visible, hidden);
const token = await hwtr.createWith(3600, visible, hidden);
```

### Verifying Tokens

```javascript
// verify with the same input as during creation
const result = await hwtr.verify(token);

// for all tokens with hidden payload
const result = await hwtr.verify(token, hidden);

// Result structure
{
  ok: true,           // Token is valid
  expired: false,     // Token hasn't expired
  expires: 1741622400, // UNIX seconds since the epoch
  validTime: true,    // Time validation result
  data: {...}         // Original visible payload data
}
```

### Initializing Hwtr

```javascript
// With generated keys
const keys = await Hwtr.generateKeys();
const hwtr = await Hwtr.factory(keys);
const hwtr = await Hwtr.factory(keys, {options});

// With custom options
const hwtr = await Hwtr.factory(keys, {
  hash: 'SHA-256',           // Hash algorithm, default SHA-256 (SHA-256, SHA-384, SHA-512)
  format: 'j',                  // format, default 'j' (eg j, jx) note these must be loaded and registered
  signatureSize: 32,         // Custom signature length (0 = full signature, default)
  expiresInSeconds: 3600,    // default expiration in seconds, default 60
  errorOnInvalid: false,     // return an object or string instead of throwing
  errorOnExpired: false,     // return an object or string instead of throwing
  leewaySeconds: 1           // time leeway for expiration checks, in seconds
});
```

## Advanced Features

### Format Options

Hwtr offers two built-in encoding formats:

- **`j`** (default): Standard JSON encoding - fastest, widely compatible
- **`jx`**: Extended JSON encoding - supports complex types (Set, Map, Date, TypedArray, etc.)

```javascript
// Use extended JSON format
import {formats} from './hwtr.formats.js';
Hwtr.registerFormat('jx', formats.jx);
const hwtr = await Hwtr.factory(keys, { format: 'jx' });
```

**Note**: Additional formats like MessagePack (`mp`) and CBOR (`cb`) can be added as optional third-party encodings. These are not included by default but can reduce token size by up to 50% if added. See the "Extending Hwtr" section for details.

### Performance Tuning

Fine-tune Hwtr for your specific needs:

```javascript
// For maximum security
const hwtr = await Hwtr.factory(keys, { 
  hash: 'SHA-512',
  errorOnInvalid: true 
});

// For minimum token size
const hwtr = await Hwtr.factory(keys, { 
  hash: 'SHA-256',
  signatureSize: 22  // Minimum secure size for SHA-256
});

// For maximum compatibility
const hwtr = await Hwtr.factory(keys, { 
  hash: 'SHA-256',
  format: 'j'
});
```


### Performance Metrics

Hwtr delivers consistent, reliable performance:

| Operation              | Mean (ms) | StdDev  | Samples |
|------------------------|-----------|---------|---------|
| create (SHA-256)       | 0.034     | 0.106   | 7894    |
| verify (SHA-256)       | 0.020     | 0.004   | 7894    |
| create (with hidden)   | 0.020     | 0.004   | 7894    |
| verify (with hidden)   | 0.023     | 0.004   | 7894    |

## Express Middleware

```javascript
import Hwtr from 'hwtr';

function hwtrMiddleware(options = {}) {
  const { keys, secret, ignoreExpired = false } = options;
  
  // Initialize Hwtr
  const hwtrPromise = await Hwtr.factory(secret ? { keys: [{ id: 'default', secret }] }: keys);
  
  return async function(req, res, next) {
    try {
      const hwtr = await hwtrPromise;
      
      // Get token from header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      const token = authHeader.substring(7);
      const result = await hwtr.verify(token);
      
      if (!result.ok) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      if (result.expired && !ignoreExpired) {
        return res.status(401).json({ error: 'Token expired' });
      }
      
      // Attach user data to request
      req.user = result.data;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Authentication error' });
    }
  };
}

export default hwtrMiddleware;
```

## Hono Middleware

```javascript
import Hwtr from 'hwtr';

export const hwtrAuth = async (options = {}) => {
  const { keys, secret, ignoreExpired = false } = options;
  
  // Initialize Hwtr
  const hwtr = await Hwtr.factory(secret ? { keys: [{ id: 'default', secret }] } : keys);
  
  return async (c, next) => {
    try {
      // Get token from header
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'No token provided' }, 401);
      }
      
      const token = authHeader.substring(7);
      const result = await hwtr.verify(token);
      
      if (!result.ok) {
        return c.json({ error: 'Invalid token' }, 401);
      }
      
      if (result.expired && !ignoreExpired) {
        return c.json({ error: 'Token expired' }, 401);
      }
      
      // Attach user data to context
      c.set('user', result.data);
      await next();
    } catch (error) {
      return c.json({ error: 'Authentication error' }, 500);
    }
  };
};
```

## Extending Hwtr

Hwtr supports a pluggable codec system for custom encoding formats. The library includes built-in formats (`j` and `jx`), but you can add others:

```javascript
import Hwtr from './hwtr.js';

// Example of a custom codec
const myCodec = {
  encode(data) {
    // Convert data to Uint8Array
    return new TextEncoder().encode(JSON.stringify(data));
  },
  decode(buffer) {
    // Convert Uint8Array to data
    return JSON.parse(new TextDecoder().decode(buffer));
  }
};

// Register the codec
Hwtr.registerFormat('my', myCodec);

// Use the codec
const hwtr = await Hwtr.factory({ format: 'my' }, keys);
```

**Note**: Optional third-party encodings like MessagePack (`mp`) and CBOR (`cb`) can be used for additional size reduction (up to 50% smaller tokens), but require external dependencies (see [`hwtr.codecs.js`](hwtr.codecs.js)). These are not included in the core library for security and dependency management reasons. 

## Testing

To run the test suite:

```bash
deno test --allow-import ./hwtr.test.deno.js

node --import ./node-esm.js ./hwtr.test.node.js
```

## Security Considerations

- Hwtr uses HMAC with SHA-256/384/512 for secure signatures
- Hidden payloads enhance security by keeping sensitive data off tokens
- The library maintains consistent timing to help prevent timing attacks
- Multiple key support enables key rotation with zero downtime

## License

Copyright 2025 Jim Montgomery

Hwtr and HWT are licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

SPDX-License-Identifier: Apache-2.0

