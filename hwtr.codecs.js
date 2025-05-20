/*
 * TODO examples with
	1. **Bincode** - A minimal binary encoding that's optimized for space efficiency (implementation included above)
		| Bincode | Extremely compact | Very small tokens |
	2. **Plain** - A simple pass-through encoder for raw string data without JSON parsing (included above)
		| Plain | No processing overhead | Raw string passing |
	3. **Binary** - For raw binary data when you don't need structured serialization (included above)
		| Binary | Direct binary support | Images, files, cryptographic material |
	4. **Protobuf (Protocol Buffers)** - Google's binary format with schema validation. Extremely efficient but requires schema definitions.
		| Protobuf | Schema validation, most compact | Strict data validation requirements |
	5. **BSON (Binary JSON)** - Used by MongoDB, good for documents with binary data.
	6. **Ion** - Amazon's superset of JSON with rich type support.

 * */

// example MessagePack Encoder
// https://github.com/msgpack/msgpack-javascript
import * as MessagePack from "https://esm.sh/@msgpack/msgpack";

export const msgpack = {
	encode(data) {
		try {
			return MessagePack.encode(data);
		} catch (error) {
			throw new Error(`MessagePack encoding error: ${error.message}`);
		}
	},
	decode(buffer) {
		try {
			return MessagePack.decode(buffer);
		} catch (error) {
			throw new Error(`MessagePack decoding error: ${error.message}`);
		}
	}
};

/*
const mpSample = "Hello, world!"
const mpSampleEncode = msgpack.encode(mpSample);
const mpSampleDecode = msgpack.decode(mpSampleEncode);
const mpGood = mpSample === mpSampleDecode;
console.log(`MessagePack looks ${ mpGood ? 'good':'bad' }`, {mpSample, mpSampleEncode, mpSampleDecode});
*/

// https://github.com/hildjj/cbor2
// in Deno
import * as CBOR from "https://esm.sh/cbor2";
// in cloudflare workers, nodejs
// npm install cbor2
// import * as CBOR from 'cbor2';

export const cbor = {
	encode(data) {
		try {
			return CBOR.encode(data);
		} catch (error) {
			throw new Error(`CBOR encoding error: ${error.message}`);
		}
	},
	decode(buffer) {
		try {
			return CBOR.decode(buffer);
		} catch (error) {
			throw new Error(`CBOR decoding error: ${error.message}`);
		}
	}
};

/*
const cbSample = "Hello, world!"
const cbSampleEncode = cbor.encode(cbSample);
const cbSampleDecode = cbor.decode(cbSampleEncode);
const cbGood = cbSample === cbSampleDecode;

console.log(`CBOR looks ${ cbGood ? 'good':'bad' }`, {cbSample, cbSampleEncode, cbSampleDecode});
 */
