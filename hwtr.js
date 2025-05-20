/*
 * Hwtr - a utility for making and using HMAC Web Tokens (HWT)
 *
 * @license
 * Copyright 2025 Jim Montgomery
 * SPDX-License-Identifier: Apache-2.0
 *
 *
 * HMAC Web Tokens (HWT) are base64url signed tokens for Web contexts
 * 10-40% smaller than JWT's
 * custom formats for payloads including JSON and JSON extended (Date, BigInt, Map, Set, TypedArrays), 
 * additional examples of custom formats and codecs using CBOR and MessagePack
 * 
 * library provides:
 * key generation, registration and facilitates key rotation
 * using SHA-256, SHA-384, SHA-512
 * configurable signature and token lengths
 * optionally include hidden input for signing and verifying tokens
 * always includes an expiration time, with configurable default
 * configurable errors
 * self contained, no external dependencies required
 * intended for use in Cloudflare Workers, Deno, Nodejs
 *
 * hwt looks like:
	"hwt.HMAC-signature.key-id.expires-in-seconds-since-epoch.format-abbreviation.data-payoad"
	"hwt.signature.keyid.1234567890.j.payload1234",

		- hwt is the standard prefix
		- signature is base64url HMAC of both the included data payload together with any hidden input
		- keyid is the key used to create the HMAC
		- expires is the UNIX time in seconds that the token expires, also in the HMAC signature
		- data is the remainder of the payload input, without any of the hidden input 
 *
 * sample usage:

```javascript

	import Hwtr from './hwtr.js';
	import {formats} from './hwtr.formats.js';
	// for simple payloads use the default JSON
	Hwtr.registerFormat('j', formats.j);
	// for complex types BigInt, Date, Map, Set, TypedArray, ArrayBuffer
	Hwtr.registerFormat('jx', formats.jx);

	// load or generate keys, 
const keys = await Hwtr.generateKeys();
	// const keys = JSON.parse(env.secret_keys);
	// const secret = '-'.repeat(32);
	// const keys = {current:'k1',keys:[{id:'k1',secret:'...32.bytes.or.more...', created:Date.now()}]}
	
	// make the default expiration 5 minutes
	const options = {expiresInSeconds: 60 * 5};
	const hwtr = await (new Hwtr(keys, options)).ready();
	// const hwtr = await Hwtr.factory(keys, options);

	// create a token for API access
	const expiresInSeconds = 60 * 60 * 8; // good for 8 hours
	const hwt = hwtr.createWith(60 * 60 * 24, userInfo, [hidden1, hidden2]);
	const valid = hwtr.verify(hwt);
	// valid {ok:true, data: userInfo, expired: false, withinLeeway: false, validTime: true}
	// invalid {ok:false, data: userInfo, expired: true, withinLeeway: false, validTime: false}

	const expiresInSeconds = 60 * 3; // 3 minutes
	const stateParamForOAuth = hwtr.createWith(expiresInSeconds, [nonce, ...params], [hidden1, hidden2]);

	// create using defaults, items in payload
	const hwt = hwtr.create({user:'Sea Foam', claims:[], nonce}, {hidden:'details'});
	const valid = hwtr.verify(hwt, {hidden: 'details'});
	// valid {ok: true, data: {user:'Sea Foam', claims:[], nonce}, expired: false, withinLeeway: false, validTime: true}

```

 * */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function timingSafeEqual(expected, actual) {
	const a = typeof expected === 'string' ? 
		base64urlToUint8Array(expected) : expected;
	const b = typeof actual === 'string' ? 
		base64urlToUint8Array(actual) : actual;
	if (a.length !== b.length) return false;
	// always check ALL bytes regardless
	let result = 0;
	for (let i = 0, len = a.length; i < len; i++) {
		result |= a[i] ^ b[i];  // Bitwise XOR and OR
	}
	return result === 0;
}

export function bufferToBase64Url(buffer) {
	const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	
	// Process in chunks to avoid stack overflow
	const CHUNK_SIZE = 4096;
	let binary = '';
	for (let i = 0, len = uint8Array.length; i < len; i += CHUNK_SIZE) {
		const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, len));
		binary += String.fromCharCode.apply(null, chunk);
	}
	
	return btoa(binary).replace(/[+/=]/g, c => c === '+' ? '-' : c === '/' ? '_' : '');
}

// Create a static dummy buffer for error cases and dummy work in timing-safe comparison
const emptyArray = new Uint8Array(0);
export function base64urlToUint8Array(base64url) {
	if (base64url instanceof Uint8Array) {
		return base64url;
	}

	let bytes = null;
	try {
		let base64 = base64url.replace(/[-_]/g, c => c === '-' ? '+' : '/');
		//let base64 = base64url.replaceAll('-', '+').replaceAll('_', '/');

		const paddingNeeded = (4 - (base64.length % 4)) % 4;
		if (paddingNeeded) {
			base64 += '='.repeat(paddingNeeded);
		}

		const binaryStr = atob(base64);
		const len = binaryStr.length;
		bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryStr.charCodeAt(i);
		}

		return bytes;
	} catch(error) {
		// Clear the allocated buffer if an error occurs
		if (bytes) {
			clearBuffer(bytes);
		}
		// For security and support constant-time validation 
		// always return a predictable failure result
		return emptyArray;
	}
}

// securely clear a buffer by overwriting with zeros
export function clearBuffer(buffer) {
	if (buffer instanceof Uint8Array) {
		crypto.getRandomValues(buffer); // First overwrite with random data
		buffer.fill(0); // Then zero out
	}
}

export function toUint8Array(typedArray) {
	return new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
}


export default class Hwtr {
	#errorOnInvalid = false;
	#errorOnExpired = false;
	#errorOnEncoding = true;
	#errorOnGenerate = true;
	#expiresInSeconds = 60;
	#leewaySeconds = 1;
	#algorithm = null;
	#keys = {};
	#ready = null;
	#maxTokenSizeBytes = 2048;
	#prefix = 'hwt';

	static version = 0.20250301;
	static textEncoder = textEncoder;
	static textDecoder = textDecoder;
	static #codecs = {j:null};

	// commonly used for seconds-in-future to expire (31557600 = 1yr)
	numeric(value, preset=60, min=1, max=31557600){
		let n = Number(value);
		if(isNaN(n)){
			return preset;
		}else if(n < min){
			return min;
		}else if(n > max){
			return max;
		}
		return n;
	}

	/* base64url is chars.length: SHA-256 = 43, SHA-384 = 64; SHA-512 = 86; */
	/* minimum lengths for each, to avoid collisions; full length */
	#supports = [['SHA-256',22,43], ['SHA-384',32,64], ['SHA-512', 43, 86]];
	/* 1 day/24h = 86400 s; 1h = 3600 s, 60s */
	constructor(
		keys,
		{
			signatureSize = 0, // 0 = ignored
			expiresInSeconds = 60, 
			errors = false, // true sets both errorOnInvalid and errorOnExpired true
			errorOnInvalid = false, 
			errorOnExpired = false, 
			errorOnGenerate = true, 
			errorOnEncoding = true, 
			leewaySeconds = 1, 
			maxTokenSizeBytes = 2048, 
			format = 'j', 
			hash // default SHA-256
		} = {}
	){

		this.format = (typeof Hwtr.#codecs[format]?.encode === 'function') ? format: 'j';

		// max 1 year in seconds
		this.#expiresInSeconds = this.numeric(expiresInSeconds, 60, 0);
		// 0 - 10 s leeway
		this.#leewaySeconds = this.numeric(leewaySeconds, 1, 0, 30);
		if(errors){
			this.#errorOnInvalid = true;
			this.#errorOnExpired = true;
			this.#errorOnEncoding = true;
		}else{
			if(errorOnInvalid) this.#errorOnInvalid = true;
			if(errorOnExpired) this.#errorOnExpired = true;
			if(errorOnEncoding !== undefined) this.#errorOnEncoding = !!errorOnEncoding;
		}
		if(errorOnGenerate === false){
			this.#errorOnGenerate = false;
		}
		// NOTE hard max of 5120 bytes; default max 2048 bytes; 512 minimum for max
		this.#maxTokenSizeBytes = this.numeric(maxTokenSizeBytes, 2048, 512, 5120);

		const supports = this.#supports;
		let [_hash, _min, _max] = this.#supports.find(([key])=>{
				return key === hash;
			}) || supports[0];
		hash = _hash;
		this.signatureSize = signatureSize ? this.numeric(signatureSize, 0, _min, _max) : 0;
		if(this.signatureSize === _max){
		// optimization to ignore
			this.signatureSize = 0;
		}

		this.#algorithm = { name: 'HMAC', hash };
		
		this.importKeys(keys);
	}

	// Update the importKey method to clear the secret buffer after use
	async importKey(config={}, i) {
		let {id='', secret='', created, keyImport = null, key = null} = config;
		const aDot = id.indexOf('.') > -1;
		if(!id || aDot) {
			throw new Error(`Hwtr key id invalid: "${id}" at index ${i}` + (aDot ? ` has a '.'` : ''));
		}

		if(key) {
			// already resolved
			return config;
		} else if(keyImport) {
			// resolving
			return keyImport;
		}

		let bfr;
		try {
			if (typeof secret === 'string') {
				bfr = this.stringToBuffer(secret);
			} else if(secret?.byteLength) {
				bfr = new Uint8Array(secret.buffer || secret);
			}

			if(!bfr || bfr.byteLength < 32) {
				throw new Error(`Hwtr requires a secret that is at least 32 characters or bytes`);
			}

			const $ = {
				id,
				created: new Date(created),
				keyImport: null,
				key: null
			};

			$.key = await crypto.subtle.importKey('raw', bfr, this.#algorithm,
				/* not extractable */
				false,
				['sign', 'verify']);
			
			return $;
		} finally {
			// Clear the buffer containing the secret after use
			if (bfr) {
				clearBuffer(bfr);
			}
		}
	}

	static generateKey({id='keyid', secret=0}={}, asString=true){
		let len, min = 32;
		if(typeof secret === 'number'){
			len = secret || 0;
			if(len < min){
				len = min;
			}
			secret = crypto.getRandomValues(new Uint8Array(len));
		}else if(typeof secret === 'string'){
			len = secret.length;
			if(len < min){
				const random = crypto.getRandomValues(new Uint8Array(len));
				secret += bufferToBase64Url(random);
			}
		}else if(typeof secret?.byteLength === 'number'){
			const sourceView = toUint8Array(secret);
			const resultLength = Math.max(sourceView.length, min);
			if(sourceView.length < min){
				const result = new Uint8Array(resultLength);
				// copy into
				result.set(sourceView);
				const extra = crypto.getRandomValues( new Uint8Array(min - sourceView.length) );
				result.set(extra, sourceView.length);
				secret = result;
			}else{
				secret = sourceView;
			}
		}
		if(secret.byteLength && asString){
			secret = bufferToBase64Url(secret);
		}

		// human readable time
		const created = (new Date).toISOString();
		return {id, secret, created};
	}
	static generateKeys(items=2, current=''){
		let list;
		if(typeof items==='number'){
			list = new Array(items).fill(0);
		}else if(Array.isArray(items)){
			list = items;
		}else{
			list = new Array(2);
		}
		const hash = {};
		let alternate;
		const keys = list.map((n, i)=>{
			let id = String(n?.id ?? 'key'+(i+1)).replaceAll('.','_');
			let secret = n?.secret;
			const key = Hwtr.generateKey({id, secret});
			hash[key.id] = key;
			if(!alternate){
				alternate = key;
			}
			return key;
		});
		current = current.replaceAll('.','_');
		if(!hash[current] && alternate){
			current = alternate.id;
		}
		return {current, keys};
	}

	async importKeys(expectedKeys) {
		let {current='', keys = []} = expectedKeys ?? {};
		let curr;
		// If no keys are provided, generate a default one
		if (!keys || keys.length === 0) {
			console.warn("No keys provided, generating a fallback key");
			const fallbackKey = await Hwtr.generateKey({id: 'fallback'}, false);
			keys = [fallbackKey];
			current = 'fallback';
		}
	
		this.#ready = Promise.allSettled(keys.map((key, i) => {
			if (key.id.indexOf('.') > -1) {
				//console.warn(`Skipping key with invalid id: "${key.id}"`);
				return Promise.reject(new Error(`Hwtr key has '.' in id ${key.id}`));
			}
	
			return this.importKey(key, i)
				.then(key => {
					// current becomes either the first or matching id
					if (key.id === current || !curr) {
						curr = key;
					}
					this.#keys[key.id] = key;
					return key;
				});
		}));
	
		const result = await this.#ready;
		
		// Check if any keys were successfully imported
		const successfulImports = result.filter(r => r.status === 'fulfilled');
		
		if (successfulImports.length === 0) {
			console.warn("All key imports failed, generating a fallback key");
			try {
				const fallbackKey = await Hwtr.generateKey({id: 'fallback'}, false);
				const importedKey = await this.importKey(fallbackKey, 0);
				this.#keys[importedKey.id] = importedKey;
				curr = importedKey;
			} catch (error) {
				throw new Error(`Unable to create fallback key: ${error.message}`);
			}
		}
	
		if (!curr) {
			throw new Error(`No valid keys available`);
		}
	
		this.#keys.current = curr;
	}

	/* static factory for making HWT tokens, 
	 * creates the "Hwtr" that stamps out HWT's (HMAC Web Tokens) */
	static async factory(keys, options){
		return new Hwtr(keys, options).ready();
	}

	async ready(){
		// initialize from key import
		if(this.#keys.current && !this.#ready) return this;
		await this.#ready;
		this.#ready = null;
		return this;
	}

	stringToBuffer(str) {
		return textEncoder.encode(str);
	}

	static textToBase64Url(text){
		return bufferToBase64Url( textEncoder.encode(text) );
	}

	static base64urlToText(base64url) {
		return textDecoder.decode( base64urlToUint8Array( base64url ) );
	}

	static base64urlToUint8Array = base64urlToUint8Array;

	// convert ArrayBuffer to base64url
	static bufferToBase64Url = bufferToBase64Url;

	separator = '.';

	isExpired(val, data={}, leeway=this.#leewaySeconds){
		const now = this.nowSeconds;
		const expiry = Number(val) || 0;
		const expired = expiry <= now;
		data.expires = expiry;
		data.now = now;
		data.expired = expired;
		if(!expired){
			data.validTime = true;
			return data;
		}
		const withinLeeway = expired && (now - expiry <= leeway);
		data.withinLeeway = withinLeeway;
		data.validTime = !expired || withinLeeway;
		return data;
	}

	/* 22 is min shortened length, 86 is max; see above 'supports' */
	static isHwt(str){
		return /(?:^|\.)[A-Za-z0-9_-]{22,86}(?:\.|$)/.test(str);
	}

	isHwt(str){
		return Hwtr.isHwt(str);
	}

	get nowSeconds(){
		return Math.round(Date.now() / 1000);
	}

	create(dataShown, dataHidden){
		const exp = this.nowSeconds + this.#expiresInSeconds;
		return this._createWith(exp, dataShown, dataHidden);
	}

	expiresAt(secondsForward=this.#expiresInSeconds){
		let s = this.numeric(secondsForward, 1);
		return this.nowSeconds + s;
	}

	createWith(expiresInSeconds, dataShown, dataHidden){
		const exp = this.expiresAt(expiresInSeconds);
		return this._createWith(exp, dataShown, dataHidden);
	}

	// generate a signature with omitted values
	async _createWith(exp, dataShown, dataHidden){
		const { format, separator } = this;
		const codec = Hwtr.#codecs[format];
		const item = bufferToBase64Url( codec.encode(dataShown) );
		// sig.keyid.exp.format.payload
		const payload = [exp, format, item];
		let hidden;
		if(dataHidden !== undefined){
		// NOTE NO HIDDEN IN PAYLOAD
			const itemHidden = bufferToBase64Url( codec.encode(dataHidden) );
			// exp.format.payload.hidden
			hidden = [...payload, itemHidden];
		}
		const [sig, kid] = await this.generate( (hidden ?? payload).join(separator) );
		// sig HAS: sig.keyid; payload HAS: exp.format.payload
		// return hwt.sig.keyid.exp.format.payload
		const token = [this.#prefix, sig, kid, ...payload].join(separator);
		const max = this.#maxTokenSizeBytes;
		if(token.length > max){
			if(this.#errorOnInvalid){
				throw new Error(`hwt size exceeded ${ max } bytes`);
			}
			// corrup the token
			return token.slice(0, max);
		}
		return token;
	}

	async decode(payload=''){
		const result = {data:null};
		const { separator } = this;
		const parts = payload.split(separator);

		const [prefix, sig, kid, exp, format, dataShown] = parts;

		result.expires = Number(exp) || 0;

		const codec = Hwtr.#codecs[format || this.format];
		if (!codec) {
			result.error = `hwt unknown encoding "${ format }"`;
		}

		try {
			result.data = codec.decode( base64urlToUint8Array( dataShown ) );
		} catch (decodeError) {
			result.error = `hwt data decoding failed`;
		}

		return result;
	}

	async verify(payload, dataHidden) {
		// Initialize result structure
		const result = { ok: false, data: null };
		if (typeof payload !== 'string' 
			|| payload.indexOf(this.#prefix) !== 0 
			|| payload?.length > this.#maxTokenSizeBytes
		) {
			result.error = `hwt invalid`;
			if (this.#errorOnInvalid) {
				throw new Error(result.error);
			}
			return result;
		}
		const { separator } = this;
		// return hwt.sig.keyid.exp.format.payload
		const parts = payload.split(separator);
		if (parts.length < 6) {
			result.error = `hwt invalid format`;
			if (this.#errorOnInvalid) {
				throw new Error(result.error);
			}
			return result;
		}
		
		// Extract token components
		const [prefix, sig, kid, exp, format, dataShown] = parts;

		const time = this.isExpired(exp);
		result.validTime = time.validTime;
		result.expired = time.expired;
		result.expires = time.expires;
		if(time.expired){
			result.withinLeeway = time.withinLeeway;
			if (!result.validTime){
				result.error = `hwt expired`;
				if (this.#errorOnExpired) {
					throw new Error(result.error);
				}
				return result;
			}
		}

		// NOTE ONLY the empty encoder '' defaults to default encoder j
		const codec = Hwtr.#codecs[format || this.format];
		if (!codec) {
			result.error = `hwt unknown encoding "${ format }"`;
			if (this.#errorOnEncoding) {
				throw new Error(result.error);
			}
			return result;
		}

		let hidden = [exp, format, dataShown];
		try{
			// exp.format.payload
			if (dataHidden !== undefined) {
			// exp.format.payload.hidden
				const itemHidden = bufferToBase64Url( codec.encode(dataHidden) );
				hidden.push( itemHidden );
			}
		} catch (error) {
			result.error = `hwt data encoding failed`;
			if (this.#errorOnEncoding) {
				throw new Error(result.error);
			}
			return result;
		}

		// Get the key and verify
		const key = this.#keys[kid];
		if (!key) {
			result.error = `hwt unknown key`;
			if (this.#errorOnInvalid) {
				throw new Error(result.error);
			}
			return result;
		}
		// generate signature for comparison
		const [resign] = await this.generate(hidden.join(separator), { key });
		result.ok = timingSafeEqual(sig, resign);

		if (!result.ok) {
			result.error = `hwt invalid signature`;
			if (this.#errorOnInvalid) {
				throw new Error(result.error);
			}
			return result;
		}

		// Decode the payload
		try {
			// ALWAYS send Uint8Array buffer to decode from base64url string
			// each can convert to text with textDecoder.decode( buffer )
			result.data = codec.decode( base64urlToUint8Array( dataShown ) );
		} catch (decodeError) {
			result.data = null;
			result.ok = false;
			result.error = `hwt data decoding failed`;
		}

		return result;
	}
	
	// constant-time comparison
	static timingSafeEqual = timingSafeEqual;

	async generate(text, options={}) {
		const { separator } = this;
		const {key=this.#keys.current, signatureSize=this.signatureSize} = options;
		let dataBuffer = null;
		
		try {
			const dataString = typeof text === 'string' ? text : String(text);
			
			dataBuffer = this.stringToBuffer(dataString);
			const hmac = await crypto.subtle.sign(
				'HMAC',
				key.key,
				dataBuffer
			);

			let sig = bufferToBase64Url(hmac);
			if(signatureSize) {
				sig = sig.slice(0, signatureSize);
			}
			// NOTE returns `signature.kid`
			return [sig, key.id, hmac];
		} catch (error) {
			const err = new Error(`hwt failed to generate HMAC signature`);
			if(this.#errorOnGenerate) {
				throw err;
			}
			return err;
		} finally {
			// Clear data buffer after use
			if (dataBuffer) {
				clearBuffer(dataBuffer);
			}
		}
	}

/*
 *

custom data formats

tokens have a specific format for the payload portion which is customizable
this payload is returned from the verify method on the data property ({data:payload})
the default token-data payload format is JSON as base64url abbreviated 'j'
it's possible to add additional formats and there's an example
that works and is available to use for MessagePack and CBOR in hwtr.codecs.js
it's not included by default because it has external dependencies

the token format is in the tokens:
hwt.signature.keyid.unix-time-seconds.format.payload
hwt.23DcBx1kD8_PLvo4IDoNxo.key1.1234567890.j.MjAyNQ

note the default "j", the payload uses this format (j for JSON)

the following example shows how to use CBOR and MessagePack with recommended names
note that the name used appears in all tokens and the library expects that codec
the only exception for a name mismatch is an empty value, which uses the default j/JSON


```js

	// because these rely on external libraries they're not included by default
	import { cbor, msgpack } from './hwtr.codecs.js';
	// this happens in hwtr.codecs.js and throws when already registered
	// Hwtr.registerFormat('cb', cbor);
	// Hwtr.registerFormat('mp', msgpack);

	// load or generate keys, 
	const keys = await Hwtr.generateKeys();
	// const keys = JSON.parse(env.secret_keys);
	// const keys = {current:'k1',keys:[{id:'k1',secret:'...32.bytes.or.more...', created:Date.now()}]}

	const hwtr_cbor_tokens = await Hwtr.factory(keys, { format: 'cb' });
	const hwt_cb = await hwtr_cbor_tokens.create(123);

	const hwtr_msgpack_tokens = await Hwtr.factory(keys, { format: 'mp' });
	const hwt_mp = await hwtr_cbor_tokens.create(true);

	// for format and codec encoder/decoder examples see the default JSON below
	// hwtr.codecs.js has cbor and msgpack examples


```

 */
	
	static registerFormat(name='', codec) {
		const errors = [];
		if(Hwtr.#codecs[name]){
			return new Error(`codec "${ name }" exists`);
		}
		if(typeof codec?.encode !== 'function' || typeof codec?.decode !== 'function'){
			errors.push(`missing method, encode() decode() required`);
		}
		if(!/^[a-zA-Z][a-zA-Z0-9]{1,9}$/.test(name)){
			// exception for the default json codec 'j'
			if(!(Hwtr.#codecs[name] === null && name === 'j')){
				errors.push(`name must have pattern [a-zA-Z][a-zA-Z0-9]{1,9}`);
			}
		}
		if(errors.length){
			throw new Error(errors.join(`codec for format "${name}" failed: ${ errors.join('; ') }`));
		}

		const frozenCodec = Object.freeze({...codec});
		Hwtr.#codecs[name] = frozenCodec;

		return this;
	}

	static get formats(){
		return Object.keys(Hwtr.#codecs);
	}

};
