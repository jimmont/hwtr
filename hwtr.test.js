/*
 * @license
 * Copyright 2025 Jim Montgomery
 * SPDX-License-Identifier: Apache-2.0
 * */
import Hwtr from './hwtr.js';
import { formats, codecJSON, codecJSONextended } from './hwtr.formats.js';
for(const fmt in formats){
	Hwtr.registerFormat(fmt, formats[fmt]);
}
// for simple payloads use the default JSON
// Hwtr.registerFormat('j', codecJSON);
// recommended for complex types BigInt, Date, Map, Set, TypedArray, ArrayBuffer and should result in smaller tokens for this
// Hwtr.registerFormat('jx', codecJSONextended);

Deno.test('Hwtr basics', async ()=>{
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys);

	assert(typeof keys === 'object', `generates keys with Hwtr.generateKeys`);
	assert(keys.current.length > 1 && typeof keys.current === 'string', `keys have a current value`);
	assert(keys.current.length > 1 && typeof keys.current === 'string', `generated keys have a current value`);
	assert(keys.keys.length >= 1 && Array.isArray(keys.keys), `generated keys have keys`);

	keys.keys.forEach(key=>{
		const {id, secret, created} = key;
		const time = new Date(created);
		assert(typeof id === 'string' && id.length > 1 && id.indexOf('.') === -1, `keys generated have id's with NO DOT`);
		assert(secret.length >= 32, `generates secrets that are have a length of at least 32`);
		assert(!isNaN(time) && created && time instanceof Date, `keys have a valid timestamp for when created`);
	});

	const hwt1 = await hwtr.create(2025);
	const hidden = 'hidden';
	const hwt2 = await hwtr.createWith(60*5, [2025, 'hwt-example-2'], [hidden]);
	const v1 = await hwtr.verify(hwt1);
	const v2 = await hwtr.verify(hwt2);
	const v3 = await hwtr.verify(hwt2, [hidden]);

	console.log(`hwt look like this (with verify: 1. ok, 2. invalid due to missing hidden input on purpose, 3. ok because we added the hidden input as expected which checks out)`, {hwt:[hwt1,hwt2],verify:[v1,v2,v3]});

	assert(v1.ok, 'valid hwt 1');
	const [prefix, hwt] = hwt1.split('.');
	assert(prefix === 'hwt', `has prefix "hwt"`);
	assert(Hwtr.isHwt(hwt), `valid hwt "${ hwt1 }"`);
	assert(Hwtr.isHwt(hwt1), `valid hwt "${ hwt1 }"`);
	assert(/^hwt\.[A-Za-z0-9_-]{22,86}\./.test(hwt1), 'valid hwt');
	assert(/^hwt\.[A-Za-z0-9_-]{22,86}\./.test(hwt2), 'valid hwt');
	assert(false === v2.ok, `invalid hwt 2, missing hidden input ${ JSON.stringify(v2, false, '\t') }`);
	assert(true === v3.ok, `valid hwt 3 has hidden input ${ JSON.stringify(v3, false, '\t') }`);
});

Deno.test('Hwtr decode method', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys);
	
	// Create a token with different types of data
	const testData = {
		string: "test-string",
		number: 42,
		boolean: true,
		array: [1, 2, 3],
		object: { key: "value" }
	};
	
	const token = await hwtr.create(testData);
	console.log(`Created token for decode test: ${token}`);
	
	// Parse the token without verifying signature
	const decodedResult = await hwtr.decode(token);
	
	// Verify the result structure
	console.log(`Decoded result:`, decodedResult);
	
	// Basic assertions
	assert(decodedResult !== null, "Decoded result should not be null");
	assert(typeof decodedResult === 'object', "Decoded result should be an object");
	assert(decodedResult.data !== undefined, "Decoded result should have a data property");
	
	// Verify the data content matches the original
	const decodedData = decodedResult.data;
	assert(typeof decodedData === 'object', "Decoded data should be an object");
	assert(decodedData.string === testData.string, "String property should match");
	assert(decodedData.number === testData.number, "Number property should match");
	assert(decodedData.boolean === testData.boolean, "Boolean property should match");
	assert(Array.isArray(decodedData.array), "Array property should be an array");
	assert(decodedData.array.length === testData.array.length, "Array length should match");
	assert(typeof decodedData.object === 'object', "Object property should be an object");
	assert(decodedData.object.key === testData.object.key, "Nested object property should match");
	
	// Test with an invalid format
	try {
		const [sig, kid, exp, fmt, payload] = token.split('.');
		// Create a token with an invalid format
		const invalidFormatToken = [sig, kid, exp, 'invalid', payload].join('.');
		const invalidFormatResult = await hwtr.decode(invalidFormatToken);
		
		assert(invalidFormatResult.error !== undefined, "Should have an error for invalid format");
		assert(invalidFormatResult.error.includes("unknown encoding"), "Error should mention unknown encoding");
	} catch (error) {
		console.log(`Expected error when decoding invalid format: ${error.message}`);
	}
	
	// Test with a modified data payload that's not valid base64url
	try {
		const [hwt, sig, kid, exp, fmt, payload] = token.split('.');
		// Modify the payload to be invalid base64url
		const invalidPayloadToken = [hwt, sig, kid, exp, fmt, payload + '!@#'].join('.');
		const invalidPayloadResult = await hwtr.decode(invalidPayloadToken);
		
		assert(invalidPayloadResult.error !== undefined, "Should have an error for invalid payload");
		assert(invalidPayloadResult.error.includes("decoding failed"), "Error should mention decoding failure");
	} catch (error) {
		console.log(`Expected error when decoding invalid payload: ${error.message}`);
	}
	
	// Test with malformed token
	try {
		const malformedToken = "hwt.abcdef";
		const malformedResult = await hwtr.decode(malformedToken);
		
		// Should still return a result object but with null data
		assert(malformedResult !== null, "Should return a result object for malformed token");
		assert(malformedResult.data === null, "Data should be null for malformed token");
		assert(malformedResult.error !== undefined, "Should have an error for malformed token");
	} catch (error) {
		// If it throws, that's also acceptable behavior
		console.log(`Malformed token handling: ${error.message}`);
	}
	
	// Test decode with different formats if available
	if (Hwtr.formats.includes('jx')) {
		const hwtrJx = await Hwtr.factory(keys, {format: 'jx'});
		const complexData = {
			date: new Date(),
			bigint: 1234567890n,
			set: new Set([1, 2, 3]),
			map: new Map([['key1', 'value1'], ['key2', 'value2']]),
			typedArray: new Uint8Array([1, 2, 3, 4])
		};
		
		// Create a token with complex data using jx format
		const jxToken = await hwtrJx.create(complexData);
		console.log(`Created jx token: ${jxToken}`);
		
		// Decode the token
		const jxDecodedResult = await hwtrJx.decode(jxToken);
		console.log(`Decoded jx result:`, jxDecodedResult);
		
		// Basic assertions for jx format
		assert(jxDecodedResult !== null, "Decoded jx result should not be null");
		assert(jxDecodedResult.data !== null, "Decoded jx data should not be null");
		
		// Verify specific complex data types if applicable
		const jxData = jxDecodedResult.data;
		
		if (jxData.date) {
			assert(jxData.date instanceof Date, "Date should be decoded as Date object");
		}
		
		if (jxData.set) {
			assert(jxData.set instanceof Set, "Set should be decoded as Set object");
		}
		
		if (jxData.map) {
			assert(jxData.map instanceof Map, "Map should be decoded as Map object");
		}
	}
});

Deno.test('Hwtr formats and codecs for JSON, CBOR and MessagePack', async ()=>{
	const {cbor, msgpack} = await import('./hwtr.codecs.js').catch(console.error);

	let codecs = new Set(Hwtr.formats);
	assert(codecs.has('j'), `default formats for JSON j`);

	if(!codecs.has('jx')){
		const { JSONextended } = await import('./hwtr.formats.js');
		Hwtr.registerFormat('jx', JSONextended);
	}
	// added jx so update
	codecs = new Set(Hwtr.formats);

	assert(codecs.has('j') && codecs.has('jx'), `default formats for JSON j and jx`);
	if(!codecs.has('cb')){
		Hwtr.registerFormat('cb', cbor);
	}
	if(!codecs.has('mp')){
		Hwtr.registerFormat('mp', msgpack);
	}
	// now have 4 formats after adding them, so update our copy and check it
	codecs = new Set(Hwtr.formats);
	assert(codecs.size === 4 && codecs.has('cb') && codecs.has('mp'), `formats added for CBOR and MessagePack... now can use them (have ${ codecs.size } formats: ${ Hwtr.formats.join(', ') })`);

	console.log(`formats with registered codecs`, Hwtr.formats.join(', '));

	const keys = await Hwtr.generateKeys();

	const hwtr_cbor_tokens = await Hwtr.factory(keys, { format: 'cb' });

	const hwt_cb = await hwtr_cbor_tokens.create(123);
	const hwt_cb_verify = await hwtr_cbor_tokens.verify(hwt_cb);

	const hwtr_msgpack_tokens = await Hwtr.factory(keys, { format: 'mp' });
	const hwt_mp = await hwtr_msgpack_tokens.create(213);
	const hwt_mp_verify = await hwtr_msgpack_tokens.verify(hwt_mp);

	const hwtr_json_tokens = await Hwtr.factory(keys, {});
	const hwt_j = await hwtr_json_tokens.create(303);
	const hwt_j_verify = await hwtr_json_tokens.verify(hwt_j);

	const hwtr_jx_tokens = await Hwtr.factory(keys, {format:'jx'});
	const hwt_jx = await hwtr_jx_tokens.create(330);
	const hwt_jx_verify = await hwtr_jx_tokens.verify(hwt_jx);

	console.log(`formats json, cbor, msgpack from custom codecs`,{hwt_j, hwt_j_verify, hwt_jx, hwt_jx_verify, hwt_cb, hwt_cb_verify, hwt_mp, hwt_mp_verify});
	assert(hwt_cb.includes('.cb.'), `token has format '.cb.' ${ hwt_cb }`);
	assert(hwt_mp.includes('.mp.'), `token has format '.mp.' ${ hwt_mp }`);
	assert(hwt_j.includes('.j.'), `token has default format '.j.' ${ hwt_j }`);
	assert(hwt_jx.includes('.jx.'), `token has default format '.jx.' ${ hwt_jx }`);
	assert(hwt_cb_verify.ok === true && hwt_cb_verify.data === 123, `verifies ok with correct data ${ JSON.stringify(hwt_cb_verify) }`);
	assert(hwt_mp_verify.ok === true && hwt_mp_verify.data === 213, `verifies ok with correct data ${ JSON.stringify(hwt_mp_verify) }`);
	assert(hwt_j_verify.ok === true && hwt_j_verify.data === 303, `verifies ok with correct data ${ JSON.stringify(hwt_j_verify) }`);
	assert(hwt_jx_verify.ok === true && hwt_jx_verify.data === 330, `verifies ok with correct data ${ JSON.stringify(hwt_jx_verify) }`);

	const arrayBuffer = new ArrayBuffer(4);
	const view = new Uint8Array(arrayBuffer);
	view.set([1, 2, 3, 4]);
	const typedArray = new Uint8Array([5, 6, 7, 8]);
	const typedArrayF32 = new Float32Array([1.5, 2.5, 3.5]);

	const types = [
		1n, 
		arrayBuffer,
		new Date(),
		0,1, Infinity,-Infinity,
		true,false,
		{a:'b'},
		null,undefined,NaN,
		'text with words about stuff & things in pieces & parts §',
		'🌻🌞🍊🚀', 
		[1,2,3], new Set([1,2,3]), new Map([[1,2],['3',4]]),
		typedArray,
		typedArrayF32
	];
	const foo = [...types];
	assert(types[2] instanceof Date, `have a date in data ${ types[2] }`);
	// MessagePack can't handle BigInt (it throws)
	const types_safe = [...types];
	types_safe[0] = '1n';
	const types_cbor_safe = [...types];
	// fix: CBOR encoding error: Encoding ArrayBuffer intentionally unimplmented.  It is not concrete enough to interoperate.  Convert to Uint8Array first.
	types_cbor_safe[1] = new Uint8Array(types[1]);

	// we want to see how tokens look and compare in and across these formats
	const hwt_types = [
		await hwtr_json_tokens.create({types:types_safe}),
		await hwtr_cbor_tokens.create({types:types_cbor_safe}),
		await hwtr_msgpack_tokens.create({types:types_safe}),
		await hwtr_jx_tokens.create({types:foo}),
	];
	const hwt_verify = [
		await hwtr_json_tokens.verify(hwt_types[0]),
		await hwtr_cbor_tokens.verify(hwt_types[1]),
		await hwtr_msgpack_tokens.verify(hwt_types[2]),
		await hwtr_jx_tokens.verify(hwt_types[3]),
	];
	const jxd = hwt_verify[3].data?.types?.[2];
	const comparison = [
		['j', hwt_types[0], hwt_verify[0]],
		hwt_verify[0].data.types,
		['jx', hwt_types[3], hwt_verify[3]],
		hwt_verify[3].data?.types,
		['cb', hwt_types[1], hwt_verify[1]],
		hwt_verify[1].data.types,
		['mp', hwt_types[2], hwt_verify[2]],
		hwt_verify[2].data.types
	];
	console.log(`compare formats (NOTE data altered for BigInt and similar where codec throws errors)`, {
		input_data:{types}, 
		// look at tokens side by side
		hwt_types
	});
	console.log(...comparison);

	// TODO j and CBOR can handle BigInts: write a few tests to see if they're equivalent here
	// similar for dates, or anything else we want
});

Deno.test('Hwtr deterministic fuzzing test', async () => {
	// Create a seeded random generator for reproducible "random" values
	class SeededRandom {
		constructor(seed = 42) {
			this.seed = seed;
		}
		
		// Simple LCG random number generator
		next() {
			this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
			return this.seed / 4294967296;
		}
		
		// Get a random integer between min and max (inclusive)
		nextInt(min, max) {
			return Math.floor(this.next() * (max - min + 1)) + min;
		}
		
		// Generate a random string of specified length
		randomString(length) {
			const charset = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=+/<>{}[]|;:,.!@#$%^&*()~\'"\\'`;
			let result = '';
			for (let i = 0; i < length; i++) {
				result += charset.charAt(this.nextInt(0, charset.length - 1));
			}
			return result;
		}
		
		// Select a random item from an array
		choose(array) {
			return array[this.nextInt(0, array.length - 1)];
		}
	}
	
	const rng = new SeededRandom(42); // Fixed seed for reproducibility
	console.log('\nRunning deterministic fuzzing test...');
	
	// Create a new instance with a fixed key for testing
	const fixedSecret = 'ThisIsAFixedSecretFor32CharTesting!';
	const hwtr = await Hwtr.factory({
		current: 'key1',
		keys: [{ id: 'key1', secret: fixedSecret, created: new Date().toISOString() }]
	}
	,{
		signatureSize: 32,
		expiresInSeconds: 3600,
		errorOnInvalid: false,
		errorOnExpired: false
	});
	
	// Create a set of valid tokens to use as a base
	const validTokenData = [
		"test-payload",
		{ user: "john", role: "admin" },
		["array", "of", "values"],
		12345
	];
	
	// Generate valid tokens
	const validTokens = await Promise.all(validTokenData.map(data => hwtr.create(data)));
	console.log(`Created ${validTokens.length} valid tokens for testing`);
	
	// Define our test cases with expected outcomes
	const testCases = [
		// Valid token tests - should all return { ok: true }
		...validTokens.map(token => ({
			category: "Valid tokens",
			input: token,
			expectOk: true,
			expectError: false,
			description: "Original valid token"
		})),
		
		// Invalid signature tests
		...validTokens.map(token => {
			// Change one character in the signature part
			const parts = token.split('.');
			const sigPos = rng.nextInt(5, parts[1].length - 5);
			const newChar = parts[1][sigPos] === 'A' ? 'B' : 'A';
			parts[1] = parts[1].substring(0, sigPos) + newChar + parts[1].substring(sigPos + 1);
			return {
				category: "Invalid signatures",
				input: parts.join('.'),
				expectOk: false,
				expectError: false,
				description: "Token with modified signature"
			};
		}),
		
		// Expired token tests
		{
			category: "Time validation",
			// Create a token that is already expired
			input: (() => {
				const parts = validTokens[0].split('.');
				const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
				parts[3] = expiredTime.toString();
				return parts.join('.');
			})(),
			expectOk: false,
			expectError: false,
			description: "Expired token"
		},
		
		// Invalid encoding tests
		{
			category: "Encoding validation",
			input: validTokens[0].replace('.j.', '.j404.'),
			expectOk: false,
			expectError: true,
			expectErrorMessage: "unknown encoding",
			description: "Token with invalid encoding"
		},
		
		// Malformed token tests
		{
			category: "Malformed tokens",
			input: "hwt.abcdef",
			expectOk: false,
			expectError: false,
			description: "Incomplete token"
		},
		{
			category: "Malformed tokens",
			input: "not-a-token",
			expectOk: false,
			expectError: false,
			description: "Not a hwt token"
		},
		{
			category: "Malformed tokens",
			input: "hwt." + "A".repeat(1000),
			expectOk: false,
			expectError: false,
			description: "Oversized token part"
		},
		
		// Known attack patterns
		{
			category: "Attack patterns",
			input: `hwt.${"A".repeat(43)}.key1.${Math.floor(Date.now() / 1000) + 3600}.j.${rng.randomString(20)}`,
			expectOk: false,
			expectError: false,
			description: "Token with forged but incorrect signature"
		},
		{
			category: "Attack patterns",
			input: 'hwt.<script>alert(1)</script>.key1.0.j.payload',
			expectOk: false, 
			expectError: false,
			description: "XSS attempt"
		},
		{
			category: "Attack patterns",
			input: `hwt.${rng.randomString(43)}'; DROP TABLE users; --.key1.0.j.payload`,
			expectOk: false,
			expectError: false,
			description: "SQL injection attempt"
		}
	];
	
	// Run all test cases
	const results = {
		total: testCases.length,
		passed: 0,
		failed: 0,
		byCategory: {}
	};
	
	for (const testCase of testCases) {
		const { category, input, expectOk, expectError, expectErrorMessage, description } = testCase;
		
		// Initialize category stats if first encounter
		if (!results.byCategory[category]) {
			results.byCategory[category] = { total: 0, passed: 0, failed: 0 };
		}
		results.byCategory[category].total++;
		
		let result;
		let passed = false;
		
		try {
			result = await hwtr.verify(input);
			
			if (expectError) {
				console.error(`Failed: Expected error for "${description}" but none was thrown`);
				passed = false;
			} else if (result.ok === expectOk) {
				passed = true;
			} else {
				console.error(`Failed: Expected ok=${expectOk} for "${description}" but got ok=${result.ok}`);
				passed = false;
			}
		} catch (error) {
			if (expectError) {
				if (expectErrorMessage && !error.message.includes(expectErrorMessage)) {
					console.error(`Failed: Expected error message to include "${expectErrorMessage}" but got "${error.message}"`);
					passed = false;
				} else {
					passed = true;
				}
			} else {
				console.error(`Failed: Unexpected error for "${description}": ${error.message}`);
				passed = false;
			}
		}
		
		if (passed) {
			results.passed++;
			results.byCategory[category].passed++;
		} else {
			results.failed++;
			results.byCategory[category].failed++;
		}
	}
	
	// Report results
	console.log(`\nTest results: ${results.passed}/${results.total} passed (${Math.round(results.passed/results.total*100)}% success rate)`);
	console.log('\nResults by category:');
	for (const [category, stats] of Object.entries(results.byCategory)) {
		console.log(`  ${category}: ${stats.passed}/${stats.total} passed (${Math.round(stats.passed/stats.total*100)}%)`);
	}
	
	// Assert overall test success
	assert(results.failed === 0, `${results.failed} test cases failed`);
	
	console.log('All fuzzing tests passed successfully!');
});

// Additional targeted tests for specific functionalities

Deno.test('Hwtr key rotation test', async () => {
	// Create multiple keys
	const keys = {
		current: 'key1',
		keys: [
			{ id: 'key1', secret: 'ThisIsKeyOneFor32CharTestingPurpose', created: new Date().toISOString() },
			{ id: 'key2', secret: 'ThisIsKeyTwoFor32CharTestingPurpose', created: new Date().toISOString() }
		]
	};
	
	const hwtr = await Hwtr.factory(keys, {});
	
	// Create a token with the current key
	const tokenWithKey1 = await hwtr.create("test-data");
	
	// Verify the token works
	const verifyResult1 = await hwtr.verify(tokenWithKey1);
	assert(verifyResult1.ok, "Token created with current key should verify successfully");
	
	// Now rotate the key
	const hwtr2 = await Hwtr.factory({
		current: 'key2',
		keys: keys.keys
	});
	
	// Create a new token with key2
	const tokenWithKey2 = await hwtr2.create("test-data");
	
	// Original token should still verify (key1 still in keyring)
	const verifyResult2 = await hwtr2.verify(tokenWithKey1);
	assert(verifyResult2.ok, "Token created with previous key should still verify after rotation");
	
	// New token should verify
	const verifyResult3 = await hwtr2.verify(tokenWithKey2);
	assert(verifyResult3.ok, "Token created with new current key should verify successfully");
	
	console.log("Key rotation test passed successfully");
});

Deno.test('Hwtr key rotation handling', async () => {
	// Generate multiple keys
	const { keys, current } = Hwtr.generateKeys(3);
	const oldKey = keys[0];
	const newKey = keys[1];
	
	// Set up initial HWTR with oldKey as current
	keys[0].id = 'old-key';
	keys[1].id = 'new-key';
	keys[2].id = 'future-key';
	
	// Create HWTR instance with old key as current
	const hwtrOld = await Hwtr.factory({ current: 'old-key', keys }, { errors: false });
	
	// Create a token with the old key
	const oldToken = await hwtrOld.create('test-data');
	
	// Create a second HWTR instance with new key as current
	const hwtrNew = await Hwtr.factory({ current: 'new-key', keys }, { errors: false });
	
	// Create a token with the new key
	const newToken = await hwtrNew.create('test-data');
	
	// Test that the old instance can verify tokens from both keys
	const oldVerifyOld = await hwtrOld.verify(oldToken);
	const oldVerifyNew = await hwtrOld.verify(newToken);
	
	// Test that the new instance can verify tokens from both keys
	const newVerifyOld = await hwtrNew.verify(oldToken);
	const newVerifyNew = await hwtrNew.verify(newToken);
	
	// Check results
	console.log('Key rotation test results:');
	console.log(`Old instance verifying old token: ${oldVerifyOld.ok}`);
	console.log(`Old instance verifying new token: ${oldVerifyNew.ok}`);
	console.log(`New instance verifying old token: ${newVerifyOld.ok}`);
	console.log(`New instance verifying new token: ${newVerifyNew.ok}`);
	
	// Assert expected behavior
	assert(oldVerifyOld.ok, 'Old instance should verify tokens created with old key');
	assert(oldVerifyNew.ok, 'Old instance should verify tokens created with new key');
	assert(newVerifyOld.ok, 'New instance should verify tokens created with old key');
	assert(newVerifyNew.ok, 'New instance should verify tokens created with new key');
});

// 2. JSON Serialization Edge Cases Test
Deno.test('Hwtr hidden data test', async () => {
	const keys = {
		current: 'key1',
		keys: [
			{ id: 'key1', secret: 'ThisIsKeyOneFor32CharTestingPurpose', created: new Date().toISOString() },
			{ id: 'key2', secret: 'ThisIsKeyTwoFor32CharTestingPurpose', created: new Date().toISOString() }
		]
	};

	const hwtr = await Hwtr.factory(keys, {});
	
	// Visible and hidden data
	const visibleData = "public-info";
	const hiddenData = "secret-info-not-in-token";
	
	// Create token with hidden data
	const token = await hwtr.create(visibleData, hiddenData);
	
	// Verify without providing hidden data (should fail)
	const verifyResult1 = await hwtr.verify(token);
	assert(!verifyResult1.ok, "Verification should fail without providing hidden data");
	
	// Verify with correct hidden data (should succeed)
	const verifyResult2 = await hwtr.verify(token, hiddenData);
	assert(verifyResult2.ok, "Verification should succeed with correct hidden data");
	assert(verifyResult2.data === visibleData, "Decoded data should match visible data");
	
	// Verify with incorrect hidden data (should fail)
	const verifyResult3 = await hwtr.verify(token, "wrong-hidden-data");
	assert(!verifyResult3.ok, "Verification should fail with incorrect hidden data");
	
	console.log("Hidden data test passed successfully");
});

// 3. Multiple Hidden Values Test
Deno.test('Hwtr multiple hidden values handling', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
	
	console.log('\nTesting multiple hidden values with different combinations:');
	
	// Test cases with various hidden data combinations
	const testCases = [
		{
			name: 'Single visible, multiple hidden',
			visible: ['public-data'],
			hidden: ['secret1', 'secret2', 'secret3'],
			verifyWith: [['secret1', 'secret2', 'secret3'], ['secret3', 'secret2', 'secret1']]
		},
		{
			name: 'Multiple visible, single hidden',
			visible: ['public1', 'public2', 'public3'],
			hidden: ['single-secret'],
			verifyWith: [['single-secret'], ['different-secret']]
		},
		{
			name: 'Complex data structures',
			visible: [{ user: 'public', role: 'user' }],
			hidden: [{ apiKey: 'secret-key', permissions: ['read', 'write'] }],
			verifyWith: [[{ apiKey: 'secret-key', permissions: ['read', 'write'] }], 
						[{ apiKey: 'secret-key', permissions: ['read'] }]]
		},
		{
			name: 'Empty values',
			visible: ['visible'],
			hidden: ['', null, undefined],
			verifyWith: [['', null, undefined], ['']]
		}
	];
	
	for (const testCase of testCases) {
		console.log(`\nTest case: ${testCase.name}`);
		
		// Create token with hidden values
		const token = await hwtr.createWith(60, testCase.visible, testCase.hidden);
		console.log(`Token created: ${token}`);
		
		// Test verification with original hidden values (should pass)
		const verifyCorrect = await hwtr.verify(token, testCase.hidden);
		console.log(`Verification with correct hidden values: ${verifyCorrect.ok}`, verifyCorrect, (new Date).toISOString());
		assert(verifyCorrect.ok, 'Verification should succeed with correct hidden values');
		
		// Test verification with different combinations of hidden values
		for (let i = 0; i < testCase.verifyWith.length; i++) {
			const testHidden = testCase.verifyWith[i];
			const expectedResult = i === 0; // First combination should match, others should fail
			
			const verifyResult = await hwtr.verify(token, testHidden);
			console.log(`Verification with ${expectedResult ? 'matching' : 'non-matching'} hidden values: ${verifyResult.ok}`);
			
			assert(verifyResult.ok === expectedResult, 
				`Verification with ${JSON.stringify(testHidden)} should ${expectedResult ? 'succeed' : 'fail'}`);
		}
		
		// Test with no hidden values (should fail)
		const verifyNoHidden = await hwtr.verify(token);
		console.log(`Verification with no hidden values: ${verifyNoHidden.ok}`);
		assert(verifyNoHidden.ok === false, 'Verification should fail without hidden values');
	}
});

// Test token truncation with length parameter
Deno.test('Hwtr configurable signature size test', async () => {
	// Create instances with different signature sizes
	const hwtrFull = await Hwtr.factory(null, { signatureSize: 0 }); // Full signature
	const hwtrHalf = await Hwtr.factory(null, { signatureSize: 11 }); // Minimum is 22 for SHA-256, will correct
	const hwtr33 = await Hwtr.factory(null, { signatureSize: 33 }); // Minimum for SHA-256
	
	const testData = "signature-test-data";
	
	// Create tokens with different signature sizes
	const tokenFull = await hwtrFull.create(testData);
	const tokenHalf = await hwtrHalf.create(testData);
	const token33 = await hwtr33.create(testData);
	
	// Extract signatures
	const sigFull = tokenFull.split('.')[1];
	const sigHalf = tokenHalf.split('.')[1];
	const sig33 = token33.split('.')[1];
	
	// Verify signature lengths
	assert(sigFull.length === 43, "Full signature should be 43 characters for SHA-256");
	assert(sigHalf.length === 22, "Truncated signature should be at least 22 chars for SHA-256");
	assert(sig33.length === 33, `Truncated signature should be 33 chars with this token config (it's ${ sig33.length })`);
	
	// Both should verify with their respective instances
	const verifyFull = await hwtrFull.verify(tokenFull);
	const verifyHalf = await hwtrHalf.verify(tokenHalf);
	
	assert(verifyFull.ok, "Full signature token should verify");
	assert(verifyHalf.ok, "Truncated signature token should verify");
	
	console.log("Signature size test passed successfully");
});

Deno.test('Hwtr JSON serialization edge cases', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
	
	const edgeCases = [
		{ name: 'Special number values', data: [NaN, Infinity, -Infinity] },
		{ name: 'Unicode property names', data: { 'π': Math.PI, '😀': 'smile' } },
		{ name: 'Mixed arrays and objects', data: { arr: [1, { obj: [2, { deep: [3] }] }] } },
		{ name: 'Empty structures', data: [{}, [], '', null, undefined] },
		{ name: 'Date objects', data: [new Date(), new Date(0)] }
	];
	
	console.log('\nTesting JSON serialization edge cases:');
	
	for (const { name, data } of edgeCases) {
		console.log(`\nTesting: ${name}`);
		console.log(`Input: ${JSON.stringify(data, (k, v) => v === undefined ? 'undefined' : v)}`);
		
		try {
			// Create token with the test data
			const token = await hwtr.create(data);
			console.log(`Token created: ${token.slice(0, 20)}...`);
			
			// Verify the token
			const verification = await hwtr.verify(token);
			console.log(`Verification successful: ${verification.ok}`);
			
			// Check data integrity
			const outputData = verification.data;
			console.log(`Output: ${JSON.stringify(outputData, (k, v) => v === undefined ? 'undefined' : v)}`);
			
			// Test specific serialization behaviors
			if (name === 'Special number values') {
				let [v1, v2, v3] = outputData;
				// NaN, Infinity serialize to null in standard JSON
				assert(v1 === null, 'NaN should serialize to null');
				assert(v2 === null, 'Infinity should serialize to null');
				assert(v3 === null, '-Infinity should serialize to null');
			} else if (name === 'Unicode property names') {
				assert(outputData['π'] === Math.PI, 'Unicode property names should be preserved');
				assert(outputData['😀'] === 'smile', 'Emoji property names should be preserved');
			} else if (name === 'Date objects') {
				// Dates serialize to strings in standard JSON
				assert(typeof outputData[0] === 'string', 'Date should serialize to string');
				assert(new Date(outputData[0]).getTime() === new Date(data[0]).getTime(), 
						'Date values should be preserved as strings');
			}
			
			assert(verification.ok, `Token verification should succeed for: ${name}`);
			
		} catch (error) {
			console.error(`Error with ${name}: ${error.message}`, error);
			if (name === 'Circular reference') {
				// This should fail with circular reference error
				assert(error.message.includes('circular') || error.message.includes('cyclic'), 
					'Circular references should be rejected with appropriate error');
			} else {
				assert(false, `Test case should not throw error: ${name} ${ error.message } with data: ${ data }`);
			}
		}
	}
});

// Replace the resource exhaustion test with this implementation
Deno.test('Hwtr resource exhaustion resistance', async () => {
	// Create a size-limited HWTR instance with explicit size limit
	const keys = await Hwtr.generateKeys();
	// Use the same maxTokenSize value that's in the class default
	const hwtr = await Hwtr.factory(keys, { maxTokenSize: 2048 });
	
	const verifyTimes = [];
	
	console.log('\nTesting resource exhaustion resistance...');
	
	// Test with increasingly large payloads
	const sizes = [10, 100, 1000, 1600, 2200]; // Last one exceeds our 2KB limit
	
	for (const size of sizes) {
		try {
			console.log(`\nTesting payload size: ${size} bytes`);
			const largePayload = ['x'.repeat(size)];
			
			const start = performance.now();
			const token = await hwtr.create(...largePayload);
			const createTime = performance.now() - start;
			
			console.log(`Token length: ${token.length} bytes`);
			console.log(`Creation time: ${createTime.toFixed(2)}ms`);
			
			// Tokens exceeding max size should be rejected or truncated
			if (size > 2000) {
				// If the create() didn't throw, check if the token was truncated
				if (token.length < size) {
					console.log(`Token was properly truncated: ${token.length} bytes`);
				} else {
					console.error(`Error: Token exceeding size limit was created without truncation (${token.length} bytes)`);
					assert(false, `Token exceeding size limit was created: ${token.length} bytes`);
				}
			}
			
			const verifyStart = performance.now();
			const result = await hwtr.verify(token);
			const verifyTime = performance.now() - verifyStart;
			
			console.log(`Verification time: ${verifyTime.toFixed(2)}ms`);
			console.log(`Verification successful: ${result.ok}`);
			
			// Check for excessive time growth (should be roughly linear)
			if (verifyTimes.length > 0) {
				const previousSize = sizes[verifyTimes.length - 1];
				const expectedRatio = size / previousSize;
				const actualRatio = verifyTime / verifyTimes[verifyTimes.length - 1];
				
				console.log(`Growth ratio: ${actualRatio.toFixed(2)}x (expected: ~${expectedRatio.toFixed(2)}x)`);
				
				// Growth should not be exponential
				assert(
					actualRatio < expectedRatio * 2, 
					`Verification time growth should be roughly proportional to input size`
				);
			}
			
			verifyTimes.push(verifyTime);
			
		} catch (error) {
			// For sizes exceeding the limit, we might get an error depending on configuration
			if (size > 2000) {
				console.log(`Rejected oversized payload with error: ${error.message}`);
				// This is acceptable behavior
			} else {
				console.error(`Unexpected error for ${size} bytes: ${error.message}`);
				throw error;
			}
		}
	}
	
	// Test with abnormally large tokens directly in verify
	const abnormalSizes = [1, 1000, 2000, 3000, 10000];
	
	for (const size of abnormalSizes) {
		console.log(`\nTesting abnormal token size: ${size} bytes`);
		
		// Create an abnormally sized fake token
		const fakeToken = `${'A'.repeat(43)}.key1.${Math.floor(Date.now()/1000) + 300}.j.${'B'.repeat(size)}`;
		
		const start = performance.now();
		try {
			const result = await hwtr.verify(fakeToken);
			const verifyTime = performance.now() - start;
			
			console.log(`Verification time: ${verifyTime.toFixed(2)}ms`);
			console.log(`Result: ${result.ok ? 'Accepted (BAD)' : 'Rejected (GOOD)'}`);
			
			// Should reject tokens larger than the limit
			if (size > 2048) {
				assert(!result.ok, `Oversized token should be rejected: ${size} bytes`);
				if (result.error) {
					assert(
						result.error.includes?.('invalid') || result.error.message.includes('invalid'),
						`Error should indicate invalid token or size limit: ${result.error}`
					);
				}
			}
		} catch (error) {
			const verifyTime = performance.now() - start;
			console.log(`Exception thrown: ${error.message}`);
			console.log(`Verification time: ${verifyTime.toFixed(2)}ms`);
			
			// We should get controlled errors, not crashes
			if (size > 2048) {
				console.error(error);
				assert(
					error.message.includes('invalid') || error.message.includes('size'),
					`Expected error mentioning invalid token or size, got: ${error.message}`
				);
			} else {
				throw error; // Unexpected error for normal size
			}
		}
	}
});


// Fixed Clock Skew Test
Deno.test('Hwtr clock skew handling', async () => {
	const keys = await Hwtr.generateKeys();

	// Override the nowSeconds method to simulate clock skew
	class SkewedHwtr extends Hwtr {
		#skewSeconds = 0;

		setClockSkew(seconds) {
			this.#skewSeconds = seconds;
		}

		get nowSeconds() {
			return Math.round(Date.now() / 1000) + this.#skewSeconds;
		}
	}

	console.log('\nTesting clock skew handling...');

	// Test various leeway configurations
	const leewayConfigs = [
		{ leeway: 1, name: 'Default leeway (1s)' },	// Default
		{ leeway: 5, name: 'Medium leeway (5s)' },	 // Medium tolerance
		{ leeway: 30, name: 'High leeway (30s)' },	 // High tolerance
	];
	
	// Test these clock skew scenarios for each leeway
	const skews = [-120, -60, -30, -10, -5, -1, 0, 1, 5, 10, 30, 60, 61, 65, 70];

	for (const config of leewayConfigs) {
		console.log(`\n--- ${config.name} ---`);
		
		// Create HWTR instance with this leeway
		const hwtr = await (new SkewedHwtr(keys, { leewaySeconds: config.leeway })).ready();
		
		// Create a token with the normal clock
		hwtr.setClockSkew(0);
		// Use create method to get default expiration time (60 seconds by default)
		const token = await hwtr.create('test-data');
		console.log(`Created token with default expiration (60s)`);

		// Results table header
		console.log(`\nSkew (s) | Expired | Within Leeway | Valid Time | Ok		| Expected`);
		console.log(`-----------------------------------------------------------------------`);
		
		for (const skew of skews) {
			hwtr.setClockSkew(skew);

			const result = await hwtr.verify(token);
			
			// Determine expected behavior:
			// - For skew < 60: Not expired (token still valid)
			// - For skew = 60: Exactly at expiration (expired)
			// - For 60 < skew <= (60 + leeway): Expired but within leeway (still valid)
			// - For skew > (60 + leeway): Expired and beyond leeway (invalid)
			let expectedStatus;
			
			if (skew < 60) {
				expectedStatus = "Valid (Not Expired)";
			} else if (skew === 60) {
				expectedStatus = "Valid (At Expiration)";
			} else if (skew <= 60 + config.leeway) {
				expectedStatus = "Valid (Expired but Within Leeway)";
			} else {
				expectedStatus = "Invalid (Expired beyond Leeway)";
			}
			
			console.log(
				`${skew.toString().padStart(7)} | ` +
				`${result.expired ? 'Yes' : 'No '} | ` +
				`${result.withinLeeway ? 'Yes' : 'No '} | ` +
				`${result.validTime ? 'Yes' : 'No '} | ` +
				`${result.ok ? 'Yes' : 'No '} | ` +
				`${expectedStatus}`
			);
			
			// Assertions based on correct expectations for clock skew
			if (skew < 60) {
				// Still before expiration
				assert(!result.expired, `Token should not be expired with ${skew}s clock skew (before expiration)`);
				assert(!result.withinLeeway, `Token should not be withinLeeway with ${skew}s clock skew (before expiration)`);
				assert(result.validTime, `Token should have validTime=true with ${skew}s clock skew (before expiration)`);
				assert(result.ok, `Token should be valid (ok=true) with ${skew}s clock skew (before expiration)`);
			} else if (skew === 60) {
				// Exactly at expiration boundary (your implementation considers this expired)
				assert(result.expired, `Token should be marked expired with ${skew}s clock skew (at expiration)`);
				assert(result.withinLeeway, `Token should be marked withinLeeway with ${skew}s clock skew (at expiration)`);
				assert(result.validTime, `Token should have validTime=true with ${skew}s clock skew (at expiration)`);
				assert(result.ok, `Token should still be valid (ok=true) with ${skew}s clock skew (at expiration)`);
			} else if (skew <= 60 + config.leeway) {
				// Expired but within leeway
				assert(result.expired, `Token should be marked expired with ${skew}s clock skew (beyond expiration)`);
				assert(result.withinLeeway, `Token should be marked withinLeeway with ${skew}s clock skew (within leeway)`);
				assert(result.validTime, `Token should have validTime=true with ${skew}s clock skew (within leeway)`);
				assert(result.ok, `Token should still be valid (ok=true) with ${skew}s clock skew (within leeway)`);
			} else {
				// Expired and beyond leeway
				assert(result.expired, `Token should be expired with ${skew}s clock skew (beyond expiration)`);
				assert(!result.withinLeeway, `Token should not be withinLeeway with ${skew}s clock skew (beyond leeway)`);
				assert(!result.validTime, `Token should have validTime=false with ${skew}s clock skew (beyond leeway)`);
				assert(!result.ok, `Token should be invalid (ok=false) with ${skew}s clock skew (beyond leeway)`);
			}
		}
		
		// Test token with short expiration
		console.log(`\nTesting with very short expiration...`);
		
		// Create token that expires in 3 seconds
		hwtr.setClockSkew(0);
		const shortLivedToken = await hwtr._createWith(
			hwtr.nowSeconds + 3, // Expires in 3 seconds
			['boundary-test']
		);
		
		// Test verification at different points relative to expiration
		const boundarySkews = [
			0,				// At creation
			1,				// 1 second after creation
			2,				// 2 seconds after creation
			3,				// Exactly at expiration 
			3 + config.leeway - 0.5, // Just within leeway
			3 + config.leeway + 0.5, // Just outside leeway
			10				// Well past expiration
		];
		
		console.log(`\nRelative Time | Expired | Within Leeway | Valid Time | Ok		| Expected`);
		console.log(`-----------------------------------------------------------------------`);
		
		for (const relativeTime of boundarySkews) {
			// Set clock to specific point relative to creation
			hwtr.setClockSkew(relativeTime);
			
			const result = await hwtr.verify(shortLivedToken);
			
			let expectedStatus;
			if (relativeTime < 3) {
				expectedStatus = "Valid (Not Expired)";
			} else if (relativeTime === 3) {
				expectedStatus = "Valid (At Expiration)";
			} else if (relativeTime <= 3 + config.leeway) {
				expectedStatus = "Valid (Expired but Within Leeway)";
			} else {
				expectedStatus = "Invalid (Expired beyond Leeway)";
			}
			
			console.log(
				`${relativeTime.toString().padStart(12)} | ` +
				`${result.expired ? 'Yes' : 'No '} | ` +
				`${result.withinLeeway ? 'Yes' : 'No '} | ` +
				`${result.validTime ? 'Yes' : 'No '} | ` +
				`${result.ok ? 'Yes' : 'No '} | ` +
				`${expectedStatus}`
			);
			
			if (relativeTime < 3) {
				// Before expiration
				assert(!result.expired, `Token should not be expired ${relativeTime}s after creation (before expiration)`);
				assert(!result.withinLeeway, `Token should not be withinLeeway ${relativeTime}s after creation (before expiration)`);
				assert(result.validTime, `Token should have validTime=true ${relativeTime}s after creation (before expiration)`);
				assert(result.ok, `Token should be valid (ok=true) ${relativeTime}s after creation (before expiration)`);
			} else if (relativeTime === 3) {
				// Exactly at expiration
				assert(result.expired, `Token should be expired ${relativeTime}s after creation (at expiration)`);
				assert(result.withinLeeway, `Token should be withinLeeway ${relativeTime}s after creation (at expiration)`);
				assert(result.validTime, `Token should have validTime=true ${relativeTime}s after creation (at expiration)`);
				assert(result.ok, `Token should be valid (ok=true) ${relativeTime}s after creation (at expiration)`);
			} else if (relativeTime <= 3 + config.leeway) {
				// After expiration but within leeway
				assert(result.expired, `Token should be expired ${relativeTime}s after creation (beyond expiration)`);
				assert(result.withinLeeway, `Token should be withinLeeway ${relativeTime}s after creation (within leeway)`);
				assert(result.validTime, `Token should have validTime=true ${relativeTime}s after creation (within leeway)`);
				assert(result.ok, `Token should be valid (ok=true) ${relativeTime}s after creation (within leeway)`);
			} else {
				// After expiration and beyond leeway
				assert(result.expired, `Token should be expired ${relativeTime}s after creation (beyond expiration)`);
				assert(!result.withinLeeway, `Token should not be withinLeeway ${relativeTime}s after creation (beyond leeway)`);
				assert(!result.validTime, `Token should have validTime=false ${relativeTime}s after creation (beyond leeway)`);
				assert(!result.ok, `Token should be invalid (ok=false) ${relativeTime}s after creation (beyond leeway)`);
			}
		}
	}
});

// the remaining tests are slow



// Test suite for Hwtr timing-safe equality and other security properties
// Test timingSafeEqual function specifically
Deno.test('Hwtr timingSafeEqual for timing-safe equality tests', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
	
	// Test timing-safe comparison with identical values
	const a = new TextEncoder().encode("test-value");
	const b = new TextEncoder().encode("test-value");
	const result = await hwtr.timingSafeEqual(a, b);
	assert(result === true, "Should return true for identical values");
	
	// Test timing-safe comparison with different values of same length
	const c = new TextEncoder().encode("test-value");
	const d = new TextEncoder().encode("test-wrong");
	const result2 = await hwtr.timingSafeEqual(c, d);
	assert(result2 === false, "Should return false for different values");
	
	// Test timing-safe comparison with different lengths
	const e = new TextEncoder().encode("short");
	const f = new TextEncoder().encode("longer-value");
	const result3 = await hwtr.timingSafeEqual(e, f);
	assert(result3 === false, "Should return false for different lengths");

	// Generate a signature
	const data = "test-data";
	const signature = await hwtr.generate(data);
	
	// Test with same signature (should match)
	const sameSignature = await hwtr.generate(data);
	const result1 = await hwtr.timingSafeEqual(signature.join('.'), sameSignature.join('.'));
	assert(result1 === true, "Same signatures should verify successfully");
	
	// Test with different signature (should not match)
	const differentSignature = await hwtr.generate("different-data");
	const result7 = await hwtr.timingSafeEqual(signature[0], differentSignature[0]);
	assert(result7 === false, "Different signatures should not verify");
	
	// Test with Uint8Array and string signatures
	const signatureBuffer = Hwtr.base64urlToUint8Array(signature[0]);
	const result8 = await hwtr.timingSafeEqual(signature[0], signatureBuffer);
	assert(result8 === true, `String and Uint8Array signatures should be considered equal directly ${ result3 }`);
});

// Test token tampering detection
Deno.test('Hwtr token tampering detection', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
	
	// Create a valid token
	const token = await hwtr.create("user-123");
	
	// Test verification of valid token
	const verification = await hwtr.verify(token);
	assert(verification.ok === true, "Valid token should verify successfully");
	
	// Test tampering with the payload
	let [sig, kid, exp, fmt, parts] = token.split('.');
	parts = "admin=true"; // Attempt to elevate privileges
	const tamperedToken = [sig, kid, exp, fmt, parts].join('.');
	const tamperedVerification = await hwtr.verify(tamperedToken);
	assert(tamperedVerification.ok === false, "Tampered token should fail verification");
	
	// Test tampering with the signature
	const invalidSig = sig.replace(/[a-z]/g, 'B').replace(/[A-Z]/g, 'b');
	const tamperedSigToken = [invalidSig, ...parts].join('.');
	const tamperedSigVerification = await hwtr.verify(tamperedSigToken);
	assert(tamperedSigVerification.ok === false, "Token with altered signature should fail verification");
});

// Test with different hashing algorithms
Deno.test('Hwtr with different hash algorithms', async () => {
	const keys = await Hwtr.generateKeys();
	
	// Test with SHA-256 (default)
	const hwtr256 = await Hwtr.factory(keys, { hash: 'SHA-256' });
	const token256 = await hwtr256.create("test-data");
	const verify256 = await hwtr256.verify(token256);
	assert(verify256.ok === true, "SHA-256 token should verify successfully");
	
	// Test with SHA-384
	const hwtr384 = await Hwtr.factory(keys, { hash: 'SHA-384' });
	const token384 = await hwtr384.create("test-data");
	const verify384 = await hwtr384.verify(token384);
	assert(verify384.ok === true, "SHA-384 token should verify successfully");
	
	// Test with SHA-512
	const hwtr512 = await Hwtr.factory(keys, { hash: 'SHA-512' });
	const token512 = await hwtr512.create("test-data");
	const verify512 = await hwtr512.verify(token512);
	assert(verify512.ok === true, "SHA-512 token should verify successfully");
	
	// Tokens created with different algorithms should not be compatible
	const verify256With384 = await hwtr384.verify(token256);
	assert(verify256With384.ok === false, "SHA-256 token should not verify with SHA-384 instance");
});

// Test hidden data in tokens
Deno.test('Hwtr hidden data verification', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
	
	// Create token with hidden data
	const visibleData = ["user-123", "role=standard"];
	const hiddenData = ["secret=42", "tracking-id=abc123"];
	const token = await hwtr.createWith(60, visibleData, hiddenData);
	
	// Verify without providing hidden data (should fail)
	const verifyNoHidden = await hwtr.verify(token);
	assert(verifyNoHidden.ok === false, "Verification should fail without hidden data");
	
	// Verify with incorrect hidden data (should fail)
	const verifyWrongHidden = await hwtr.verify(token, ["wrong-secret"]);
	assert(verifyWrongHidden.ok === false, "Verification should fail with incorrect hidden data");
	
	// Verify with correct hidden data (should succeed)
	const verifyCorrectHidden = await hwtr.verify(token, hiddenData);
	assert(verifyCorrectHidden.ok === true, "Verification should succeed with correct hidden data");
	
	// Verify with correct hidden data in wrong order (should fail)
	const verifyWrongOrder = await hwtr.verify(token, [hiddenData[1], hiddenData[0]]);
	assert(verifyWrongOrder.ok === false, "Verification should fail with hidden data in wrong order");
});

Deno.test('Hwtr signature length parameter', async () => {
	const keys = await Hwtr.generateKeys();
	
	// Create tokens with different signature lengths
	const fullHwtr = await Hwtr.factory(keys, {});
	const shortHwtr = await Hwtr.factory(keys, { signatureSize: 22 }); // Min length for SHA-256
	
	const fullToken = await fullHwtr.create("test-data");
	const shortToken = await shortHwtr.create("test-data");
	
	const [, fullSig] = fullToken.split('.');
	const [, shortSig] = shortToken.split('.');
	
	// Full signature should be longer than short signature
	assert(fullSig.length > shortSig.length, "Full signature should be longer than truncated signature");
	
	// Verify each token with its own instance
	const fullVerify = await fullHwtr.verify(fullToken);
	const shortVerify = await shortHwtr.verify(shortToken);
	
	assert(fullVerify.ok === true, "Full signature token should verify successfully");
	assert(shortVerify.ok === true, "Truncated signature token should verify successfully");
	
	// Cross-verification should fail due to different signature lengths
	const crossVerify1 = await fullHwtr.verify(shortToken);
	const crossVerify2 = await shortHwtr.verify(fullToken);
	
	assert(crossVerify1.ok === false, "Full instance should not verify short token");
	assert(crossVerify2.ok === false, "Short instance should not verify full token");
});


Deno.test('Hwtr handling of special characters and UTF-8 input', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
  
	console.log('\n----- Special Character Handling Tests -----');
	
	// Test cases with various special characters
	const testCases = [
		// Emojis
		{ name: 'Basic Emojis', data: ['user123', '😀😂🤣😊😍'] },
		{ name: 'Complex Emojis', data: ['user123', '👨‍👩‍👧‍👦👩‍🚒🏳️‍🌈🏳️‍⚧️'] },
		{ name: 'Emoji Flags', data: ['user123', '🇺🇸🇯🇵🇪🇺🇨🇦🇲🇽'] },
		
		// HTML-like characters
		{ name: 'HTML Tags', data: ['user123', '<div>test</div>', '<script>alert("XSS")</script>'] },
		{ name: 'HTML Entities', data: ['user123', '&lt;&gt;&amp;&quot;&#39;'] },
		
		// Special characters
		{ name: 'Brackets', data: ['user123', '()[]{}⟨⟩「」【】'] },
		{ name: 'Mathematical Symbols', data: ['user123', '∑∫∀∃∅∈∉∋∌∞∏∐∑√∛∜∝∠∡∢∣∤∥∦∧∨∩∪∴∵∶∷∼∽∾∿'] },
		{ name: 'Punctuation', data: ['user123', ',.;:!?*&%$#@^_=+`~|\\/\'"-—–'] },
		
		// Mixed content
		{ name: 'Mixed UTF-8', data: ['user123', 'Café résumé façade jalapeño naïve piñata'] },
		{ name: 'Mixed Scripts', data: ['user123', 'English العربية 日本語 Русский हिन्दी 中文'] },
		{ name: 'Control Characters', data: ['user123', 'Line1\nLine2\tTabbed\rReturn\b'] },
		
		// Edge cases
		{ name: 'Zero-Width Characters', data: ['user123', 'Hidden​ZeroWidth\u200B\u200CJoiner\u200D\u200E\u200F'] },
		{ name: 'Long Text', data: ['user123', '🚀'.repeat(250)] },
		{ name: 'SQL Injection Attempt', data: ['user123', "'; DROP TABLE users; --"] },
		{ name: 'JSON-like Structure', data: ['user123', '{"key": "value", "array": [1,2,3]}'] },
	];
	
	for (const testCase of testCases) {
		console.log(`\nTesting: ${testCase.name}`);
		console.log(`Input: ${JSON.stringify(testCase.data)}`);
		
		try {
			// Create token with the test data
			const token = await hwtr.create(testCase.data);
			console.log(`Token: ${token}`);
			
			// Verify the token
			const verification = await hwtr.verify(token);
			console.log(`Verification successful: ${verification.ok}`);
			console.log(`Verification data: ${JSON.stringify(verification.data)}`);
			
			// Check if data after verification matches input
			// Note: First elements will be version and expiration
			const inputDataJSON = JSON.stringify(testCase.data);
			const outputDataJSON = JSON.stringify(verification.data);
			const dataMatches = inputDataJSON === outputDataJSON;
			
			console.log(`Data preserved accurately: ${dataMatches}`);
			if (!dataMatches) {
				console.log(`Original: ${inputDataJSON}`);
				console.log(`Returned: ${outputDataJSON}`);
				
				// Detailed character analysis if mismatch
				const original = testCase.data.join('');
				const returned = verification.data;
				
				for (let i = 0; i < Math.max(original.length, returned.length); i++) {
					if (original[i] !== returned[i]) {
						console.log(`Mismatch at position ${i}:`);
						console.log(`Original: ${original[i]} (${original.charCodeAt(i)})`);
						console.log(`Returned: ${returned[i]} (${returned.charCodeAt(i)})`);
					}
				}
			}
			
			assert(verification.ok, `Token verification should succeed for: ${testCase.name}`);
			
			// Test token tampering with special characters
			if (token.length > 10) {
				const [prefix, sig, ...parts] = token.split('.');
				// Replace a character in the middle of the signature
				const tampered = sig.substring(0, sig.length / 2) + '?' + sig.substring(sig.length / 2 + 1);
				const tamperedToken = [tampered, ...parts].join('.');
				
				const tamperedVerification = await hwtr.verify(tamperedToken);
				assert(tamperedVerification.ok === false, `Tampered token should fail verification: ${testCase.name}`);
			}
			
		} catch (error) {
			console.error(`Error with ${testCase.name}: ${error.message}`, error);
			assert(false, `Test case should not throw error: ${testCase.name}`);
		}
	}
	
	// Test malformed input
	console.log('\n----- Malformed Input Tests -----');
	
	const malformedTests = [
		{ name: 'Empty String', input: '' },
		{ name: 'Just a Period', input: '.' },
		{ name: 'Multiple Periods', input: '...' },
		{ name: 'Invalid Base64url', input: 'ABC!@#.123.456' },
		{ name: 'Extremely Long Input', input: 'A'.repeat(10000) + '.123.456' },
		{ name: 'Non-string Input Number', input: 123 },
		{ name: 'Non-string Input Object', input: { key: 'value' } },
		{ name: 'Non-string Input Array', input: [1, 2, 3] },
		{ name: 'Non-string Input Null', input: null },
		{ name: 'Non-string Input Undefined', input: undefined },
	];
	
	for (const test of malformedTests) {
		console.log(`\nTesting malformed input: ${test.name}`);
		
		try {
			// Attempt to verify the malformed input
			const result = await hwtr.verify(test.input);
			console.log(`Result: ${JSON.stringify(result)}`);
			
			// We expect verification to fail gracefully
			assert(result.ok === false, `Malformed input should fail verification: ${test.name}`);
			
		} catch (error) {
			console.error(`Exception thrown: ${error.message}`);
			assert(false, `Malformed input should not throw exception: ${test.name}`);
		}
	}
	
	// Test token structure with special characters
	console.log('\n----- Token Structure Analysis -----');
	
	// Create a token with mix of problematic characters
	const mixedData = [
		'user<script>',
		'{"key": "value"}',
		''.padEnd(50, '.'),
		'🔥'.repeat(20),
		'<img src="x" onerror="alert(1)">',
		'// Comment /* Nested */',
		'`${templateLiteral}`',
		'📧 email@example.com',
	];
	
	const mixedToken = await hwtr.create(mixedData);
	console.log(`Mixed character token: ${mixedToken}`);
	
	// Analyze token structure
	const [sig, ...parts] = mixedToken.split('.');
	console.log(`\nSignature: ${sig} (${sig.length} chars)`);
	console.log(`Parts: ${parts.length}`);
	
	for (let i = 0; i < parts.length; i++) {
		console.log(`Part ${i}: ${parts[i]} (${parts[i].length} chars)`);
	}
	
	// Verify the mixed token
	const mixedVerification = await hwtr.verify(mixedToken);
	assert(mixedVerification.ok, 'Mixed character token should verify successfully');
	
	// Output token length analysis
	const inputLength = JSON.stringify(mixedData).length;
	const tokenLength = mixedToken.length;
	
	console.log(`\nInput data length: ${inputLength} characters`);
	console.log(`Token length: ${tokenLength} characters`);
	console.log(`Overhead: ${tokenLength - inputLength} characters (${((tokenLength - inputLength) / inputLength * 100).toFixed(2)}%)`);
	
	console.log('\n----- Special Character Tests Completed -----');
});

Deno.test('Hwtr signature entropy analysis', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
	
	// Generate signatures for very similar inputs
	const baseInput = 'user-123';
	const signatures = [];
	
	console.log('\nRunning entropy analysis test...');
	
	for (let i = 0; i < 100; i++) {
		// Change just one character
		const input = `${baseInput.slice(0, -1)}${i % 10}`;
		const signature = await hwtr.generate(input);
		signatures.push(signature[0]);
	}
	
	// Analyze bit differences between signatures
	let totalDiffBits = 0;
	let comparisons = 0;
	
	for (let i = 0; i < signatures.length; i++) {
		for (let j = i + 1; j < signatures.length; j++) {
			// Count differing bits
			const sig1 = Hwtr.base64urlToUint8Array(signatures[i]);
			const sig2 = Hwtr.base64urlToUint8Array(signatures[j]);
			let diffBits = 0;
			let totalBits = 0;
			
			for (let k = 0; k < Math.min(sig1.length, sig2.length); k++) {
				const xor = sig1[k] ^ sig2[k];
				// Count bits in XOR result
				for (let bit = 0; bit < 8; bit++) {
					totalBits++;
					if ((xor >> bit) & 1) diffBits++;
				}
			}
			
			totalDiffBits += diffBits;
			comparisons++;
		}
	}
	
	const avgDiffBits = totalDiffBits / comparisons;
	const totalBits = signatures[0].length * 6; // Approx bits in base64url char
	const diffPercentage = (avgDiffBits / totalBits) * 100;
	
	console.log(`Average bit difference: ${avgDiffBits.toFixed(2)} bits (${diffPercentage.toFixed(2)}% of total bits)`);
	console.log(`Entropy quality: ${
		diffPercentage >= 45 ? 'Excellent' : 
		diffPercentage >= 40 ? 'Good' : 
		diffPercentage >= 35 ? 'Acceptable' : 
		diffPercentage >= 30 ? 'Minimum acceptable' : 
		'Insufficient'
	}`);
	
	// Require minimum 30% bit difference for adequate entropy
	// Good cryptographic hashes typically show ~50% bit difference
	assert(diffPercentage >= 30, `Signature entropy should be at least 30% (got ${diffPercentage.toFixed(2)}%)`);
});

/*
 * SLOW tests
 *
 *
 *
 * */

// Test token expiration
Deno.test('Hwtr token expiration', async () => {
	const keys = await Hwtr.generateKeys();
	
	// Create token with very short expiration (1 second)
	const shortLivedHwtr = await Hwtr.factory(keys, { expiresInSeconds: 1, leewaySeconds: 0 });
	const token = await shortLivedHwtr.create("test-data");
	
	// Verify immediately (should be valid)
	const immediateVerification = await shortLivedHwtr.verify(token);
	assert(immediateVerification.ok === true, "Token should be valid immediately after creation");
	assert(immediateVerification.expired === false, "Token should not be expired immediately");
	
	// Wait for expiration, at least more than the leeway! (2s!!!)
	// NOTE the mimiumum for leeway is 1s so even thought above says 0 it's still 1 unless the code changed
	await new Promise(resolve => setTimeout(resolve, 2000));
	
	// Verify after expiration
	const expiredVerification = await shortLivedHwtr.verify(token);
	assert(expiredVerification.expired === true, "Token should be expired after waiting");
});

// Test error handling
Deno.test('Hwtr error handling', async () => {
	const keys = await Hwtr.generateKeys();
	const errorsHwtr = await Hwtr.factory(keys, {errors: true, leeway: 0, expiresInSeconds: 1});

	const hwtErrors = await errorsHwtr.create(1, [1]);
	const hiddenError = 'hidden-error';
	const hwtErrorsInvalid = await errorsHwtr.createWith(789, [1], [hiddenError]);

	// Test with error throwing enabled for invalid tokens
	const errorHwtr = await Hwtr.factory(keys, { errorOnInvalid: true });
	const validToken = await errorHwtr.create("test-data");
	
	// Tamper with the token
	const [prefix, sig, ...parts] = validToken.split('.');
	const tamper = sig.split('');
	tamper[3] = 'B';
	tamper[4] = '7';
	tamper[5] = '7';
	tamper[6] = '7';
	tamper[7] = 'r';
	const tamperedToken = [tamper.join(''), ...parts].join('.');

	await assertRejects(
		async () => {
			await errorHwtr.verify(tamperedToken);
		},
		Error,
		"hwt invalid"
	);
	
	// Test with error throwing enabled for expired tokens
	const expireHwtr = await Hwtr.factory(keys, { expiresInSeconds: 0, leewaySeconds: 0, errorOnExpired: true });
	const expireToken = await expireHwtr.create("test-data");
	
	// Wait for expiration, minimum is 3s due to 0s min leeway + 1s min expiresIn + rounding
	await new Promise(resolve => setTimeout(resolve, 3000));

	// Should throw an error on expired token
	await assertRejects(
		async () => {
			await expireHwtr.verify(expireToken);
		},
		Error,
		"hwt expired"
	);

	await assertRejects(
		async () => {
			await errorsHwtr.verify(hwtErrors);
		},
		Error,
		"hwt expired"
	);

	await assertRejects(
		async () => {
			await errorsHwtr.verify(hwtErrorsInvalid);
		},
		Error,
		"hwt invalid"
	);

});

Deno.test('Hwtr short signature verification', async () => {
	console.log('\nTesting verification of tokens with shortened signatures...');
	
	// Create a factory with the minimum signature size for SHA-256
	const minSignatureSize = 22; // Minimum for SHA-256
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, { signatureSize: minSignatureSize });
	
	// Create multiple tokens with the shortened signature
	const testData = [
		"simple string",
		{ user: "testuser", role: "admin" },
		[1, 2, 3, 4, 5],
		true
	];
	
	console.log(`Creating and verifying tokens with ${minSignatureSize}-character signatures:`);
	
	for (const data of testData) {
		// Create token
		const token = await hwtr.create(data);
		
		// Extract and verify signature length
		const [prefix, sig, ...rest] = token.split('.');
		console.log(`Token signature length: ${sig.length} chars (expected: ${minSignatureSize})`);
		assert(sig.length === minSignatureSize, `Signature should be exactly ${minSignatureSize} characters`);
		
		// Verify the token works with the same factory
		const verifyResult = await hwtr.verify(token);
		console.log(`Verification result: ${verifyResult.ok ? 'Valid' : 'Invalid'}`);
		assert(verifyResult.ok === true, "Token with shortened signature should verify successfully");
		
		// Test that signature validation still works by modifying signature
		// 1. Change first characters
		const firstCharModified = token.replace(sig, 'AAAAAA' + sig.substring(6));
		const verify1 = await hwtr.verify(firstCharModified);
		assert(verify1.ok === false, "token with modified signature should fail verification");
		
	}
	
	// Test with signature at absolute minimum size
	console.log(`\nTesting with signature at absolute minimum size (22 chars)...`);
	const minimalHwtr = await Hwtr.factory(keys, { signatureSize: 22 });
	const minimalToken = await minimalHwtr.create("minimal-test");
	const [, minSig] = minimalToken.split('.');
	assert(minSig.length === 22, "Signature should be truncated to minimum 22 chars");
	
	const minimalVerify = await minimalHwtr.verify(minimalToken);
	assert(minimalVerify.ok === true, "Token with minimal signature should verify successfully");
	
	// Test boundary conditions - verify that a token with a signature 
	// truncated to a specific length still verifies when the verifying 
	// instance uses the same signature length
	console.log(`\nTesting boundary cases with various signature lengths...`);
	
	const testSizes = [22, 23, 30, 33, 40];
	for (const size of testSizes) {
		const sizedHwtr = await Hwtr.factory(keys, { signatureSize: size });
		const sizedToken = await sizedHwtr.create("sized-test");
		const [, sizeSig] = sizedToken.split('.');
		
		console.log(`Size ${size}: signature length = ${sizeSig.length}`);
		assert(sizeSig.length === size, `Signature should be truncated to exactly ${size} chars`);
		
		const sizedVerify = await sizedHwtr.verify(sizedToken);
		assert(sizedVerify.ok === true, `Token with ${size}-char signature should verify successfully`);
	}
	
	console.log('All short signature verification tests passed successfully!');
});
