/*
 * codecs used as formats for HWT (Hash-based Web Tokens)
 *
 * @license
 * Copyright 2025 Jim Montgomery
 * SPDX-License-Identifier: Apache-2.0
 *
 *
 * JSON, format abbreviated 'j'
 * convert between JavaScript objects and JSON format text
 *
 * JSON extended, format abbreviated 'jx'
 * converting between JavaScript objects and JSON format text
 * preserving additional types:
	 * Date
	 * Map
	 * Set
	 * BigInt
	 * TypedArray (all of: Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float16Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array)
	 * ArrayBuffer

```js
	import Hwtr from './hwtr.js';
	import { formats, codecJSON, codecJSONextended } from './hwtr.formats.js';
	Hwtr.registerFormat('jx', formats.jx);

	
```
 * 
 * codecs register their format name and provide an
 * encoder and decoder which handle Uint8Array buffers and objects,
 * converting between them ({data} <-> buffer).
 *
 * format names start with a letter followed by a mix of alphanumerics (A-Za-z0-9, max 10)
 * the library provides formats 'j' and 'jx'
 * because every token has the format abbreviation embedded in it, 
 * short names have a positive impact on performance, 
 *
 * and codecs have high impact on token performance, 
 * for example CBOR produces significantly smaller tokens
 * jx (JSON-extended format) is larger than the default 'j' (JSON format) output
 *
 * name recommendations: 
 * proprietary names start with A-Z; 
 * use trailing numbers when versioning is needed;
 *
 * note that codecs are frozen so can't be extended or replaced
 *
```js
	// the general codec pattern result:
	const example = {test:'test'};
	const buffer = codec.encode(example);
	const data = codec.decode(buffer);
	if(data.test !== example.test){
		throw new Error(`invalid codec`);
	}
	console.log(`codec works`, {example, data});

```
 * for more examples see hwtr.codecs.js
 *
 * */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/* the defautl codec for JSON format registered as 'j' */
export const codecJSON = {
	textEncoder,
	textDecoder,
	format: 'j',
	// returns Uint8Array buffer
	encode(data){
		try {
			return this.textEncoder.encode( JSON.stringify(data) );
		} catch (error) {
			if (error.message.includes('circular')) {
				throw new Error("JSON encoding circular reference error");
			}
			throw new Error(`JSON encoding error: ${error.message}`);
		}
	},
	// returns original data 
	decode(buffer){
		const json = this.textDecoder.decode( buffer );
		try {
			return JSON.parse(json);
		} catch (error) {
			throw new Error(`JSON decoding error: ${error.message}`);
		}
	}
};

/* TypedArray https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/TypedArray
 * all of: Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float16Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array */
const TYPED_ARRAY_CODES = {};
const TypedArrayConstructors = [
	'Int8Array', // 0
	'Uint8Array', // 1
	'Uint8ClampedArray', // 2

	'Int16Array', // 3
	'Uint16Array',
	'Float16Array',

	'Int32Array', // 6
	'Uint32Array',
	'Float32Array',

	'Float64Array', // 9
	'BigInt64Array',
	'BigUint64Array' // 11
].map((type, i)=>{
	TYPED_ARRAY_CODES[type] = i;
	return globalThis[type];
});

const TypedArrayProto = Object.getPrototypeOf(Object.getPrototypeOf(new Uint8Array())).constructor.prototype;

export const codecJSONextended = {
	textEncoder,
	textDecoder,
	format: 'jx',
	// toJSON methods for each type
	jsonDate(){
		return [-7, 1, this.getTime()]; // time in milliseconds (since the epoch/UNIX)
	},
	
	jsonBigInt(){
		return [-7, 2, this.toString()]; // '1n'
	},
	
	jsonSet(){
		return [-7, 3, [...this]];
	},
	
	jsonMap(){
		return [-7, 4, [...this]];
	},
	
	jsonTypedArray() {
		let typeCode = TYPED_ARRAY_CODES[ this.constructor.name ];
		if(typeCode === undefined){
			typeCode = 1; // if none found use Uint8Array
			for(let i=0,len=TypedArrayConstructors.length;i<len;i++){
				if (this instanceof TypedArrayConstructors[i]) {
					typeCode = i;
					break;
				}
			}
		}
		return [-7, 7, typeCode, [...this]];
	},
	
	jsonArrayBuffer(){
		return [-7, 8, [...new Uint8Array(this)]];
	},
	
	TypedArrayProto,
	// Object.getPrototypeOf(Int8Array.prototype),
	// Encode using prototype modification (for best performance)
	encode(data) {
		const jsonDate = Date.prototype.toJSON;
		const jsonSet = Set.prototype.toJSON;
		const jsonMap = Map.prototype.toJSON;
		const jsonBigInt = BigInt.prototype.toJSON;
		const jsonArrayBuffer = ArrayBuffer.prototype.toJSON;
		const jsonTypedArray = TypedArrayProto.toJSON;

		try {
			Date.prototype.toJSON = this.jsonDate;
			Set.prototype.toJSON = this.jsonSet;
			Map.prototype.toJSON = this.jsonMap;
			BigInt.prototype.toJSON = this.jsonBigInt;
			ArrayBuffer.prototype.toJSON = this.jsonArrayBuffer;
			TypedArrayProto.toJSON = this.jsonTypedArray;

			const json = JSON.stringify(data);
			return this.textEncoder.encode(json);
		} catch (error) {
			if (error.message.includes('circular')) {
				throw new Error("JSON encoding circular reference error");
			}
			throw new Error(`JSON encoding error: ${error.message}`);
		} finally {
			// Restore original prototypes
			Date.prototype.toJSON = jsonDate;
			Set.prototype.toJSON = jsonSet;
			Map.prototype.toJSON = jsonMap;
			BigInt.prototype.toJSON = jsonBigInt;
			ArrayBuffer.prototype.toJSON = jsonArrayBuffer;
			TypedArrayProto.toJSON = jsonTypedArray;
		}
	},
	decode(buffer) {
		const json = this.textDecoder.decode(buffer);
		try {
			return JSON.parse(json, this._fromJSON);
		} catch (error) {
			throw new Error(`JSON decoding error: ${error.message}`);
		}
	},
	_fromJSON(key, value){
		if(Array.isArray(value) && value[0] === -7){
			const [f, type, n, m] = value;
			if(type===1){
				return new Date(n);
			}else if(type===2){
				return BigInt(n);
			}else if(type ===3){
				return new Set(n);
			}else if(type===4){
				return new Map(n);
			}else if(type===7){
				// try common pre-registered, then custom globals, fall back to Uint8Array
				const typedArray = new (TypedArrayConstructors[n] ?? globalThis[n] ?? TypedArrayConstructors[1])(m);
				return typedArray;
			}else if(type === 8){
				const buffer = new ArrayBuffer(n.length);
				const view = new Uint8Array(buffer);
				view.set(n);
				return buffer;
			};
		}
		return value;
	},
};

export const formats = {
	j: codecJSON, 
	jx: codecJSONextended,
};

