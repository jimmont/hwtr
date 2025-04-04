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
// TODO import Jwtr from './jwtr.js';
//import { calculateStats } from './hwtr.perf.js';
/*
import { msgpack, cbor } from './hwtr.formats.js';
Hwtr.registerFormat('cb', cbor);
Hwtr.registerFormat('mp', msgpack);
*/

// Utility to calculate performance metrics
function calculateStats(results) {
	const sum = results.reduce((acc, val) => acc + val, 0);
	const mean = sum / results.length;
	const squareDiffs = results.map(val => (val - mean) ** 2);
	const variance = squareDiffs.reduce((acc, val) => acc + val, 0) / results.length;
	const stdDev = Math.sqrt(variance);
	const min = Math.min(...results);
	const max = Math.max(...results);
	
	return {
		mean: mean.toFixed(3),
		stdDev: stdDev.toFixed(3),
		min: min.toFixed(3),
		max: max.toFixed(3),
		samples: results.length
	};
}

// Test a function multiple times and return timing statistics
async function benchmarkFunction(name, fn, iterations = 100) {
	console.log(`\nBenchmarking ${name}...`);
	
	const results = [];
	// Warm-up phase (results discarded)
	for (let i = 0; i < 5; i++) {
		await fn();
	}
	
	// Actual measurement
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await fn();
		const end = performance.now();
		results.push(end - start);
		
		// Show progress every 20%
		if (i % Math.max(1, Math.floor(iterations / 5)) === 0) {
			process.stdout.write('.');
		}
	}
	console.log(' Done.');
	
	return calculateStats(results);
}

// Print results table
function printResults(results) {
	console.log('\n----- HWTR Performance Results (ms) -----');
	console.log('Method                  | Mean    | StdDev  | Min     | Max     | Samples');
	console.log('----------------------------------------------------------------------------------');
	
	for (const [name, stats] of Object.entries(results)) {
		console.log(
			`${name.padEnd(24)} | ${stats.mean.padEnd(8)} | ${stats.stdDev.padEnd(8)} | ${stats.min.padEnd(8)} | ${stats.max.padEnd(8)} | ${stats.samples}`
		);
	}
	console.log('----------------------------------------------------------------------------------');
}

// Compare different configurations
async function compareConfigurations() {
	const testPayload = ['user123', 'role=admin', 'session=abc123'];
	const hiddenPayload = ['device=mobile', 'timestamp=1234567890'];
	const iterations = 7894;
	const results = {};
	
	// Generate tokens with different configurations for testing
	const tokens = {};
	
	// Initialize instances with different configurations
	console.log('\nInitializing test instances...');
	
	const keys = await Hwtr.generateKeys();
	const hwtr256 = await Hwtr.factory(keys, { hash: 'SHA-256' });
	const hwtr384 = await Hwtr.factory(keys, { hash: 'SHA-384' });
	const hwtr512 = await Hwtr.factory(keys, { hash: 'SHA-512' });
	
	const hwtrShort = await Hwtr.factory(keys, { signatureSize: 22 }); // Minimum length for SHA-256
	
	// Generate tokens for verification tests
	tokens.normal = await hwtr256.create(...testPayload);
	tokens.sha384 = await hwtr384.create(...testPayload);
	tokens.sha512 = await hwtr512.create(...testPayload);
	tokens.short = await hwtrShort.create(...testPayload);
	tokens.withHidden = await hwtr256.createWith(300, testPayload, hiddenPayload);
	
	// Test creation (basic)
	results['create (SHA-256)'] = await benchmarkFunction('create (SHA-256)', 
		() => hwtr256.create(...testPayload),
		iterations
	);
	
	results['create (SHA-384)'] = await benchmarkFunction('create (SHA-384)',
		() => hwtr384.create(...testPayload),
		iterations
	);
	
	results['create (SHA-512)'] = await benchmarkFunction('create (SHA-512)',
		() => hwtr512.create(...testPayload),
		iterations
	);
	
	results['create (short sig)'] = await benchmarkFunction('create (short signature)',
		() => hwtrShort.create(...testPayload),
		iterations
	);
	
	// Test createWith
	results['createWith (no hidden)'] = await benchmarkFunction('createWith (no hidden)',
		() => hwtr256.createWith(300, testPayload, []),
		iterations
	);
	
	results['createWith (with hidden)'] = await benchmarkFunction('createWith (with hidden)',
		() => hwtr256.createWith(300, testPayload, hiddenPayload),
		iterations
	);
	
	// Test verification
	results['verify (SHA-256)'] = await benchmarkFunction('verify (SHA-256)',
		() => hwtr256.verify(tokens.normal),
		iterations
	);
	
	results['verify (SHA-384)'] = await benchmarkFunction('verify (SHA-384)',
		() => hwtr384.verify(tokens.sha384),
		iterations
	);
	
	results['verify (SHA-512)'] = await benchmarkFunction('verify (SHA-512)',
		() => hwtr512.verify(tokens.sha512),
		iterations
	);
	
	results['verify (short sig)'] = await benchmarkFunction('verify (short signature)',
		() => hwtrShort.verify(tokens.short),
		iterations
	);
	
	results['verify (with hidden)'] = await benchmarkFunction('verify (with hidden)',
		() => hwtr256.verify(tokens.withHidden, hiddenPayload),
		iterations
	);
	
	results['verify (invalid sig)'] = await benchmarkFunction('verify (invalid signature)',
		() => {
			// Tamper with the signature
			const [sig, ...parts] = tokens.normal.split('.');
			const tamperedSig = sig.replace(/[a-z]/g, 'B').replace(/[0-9]/g, 'b');
			return hwtr256.verify([tamperedSig, ...parts].join('.'));
		},
		iterations
	);
	
	results['verify (expired)'] = await benchmarkFunction('verify (expired token)',
		async () => {
			// Create an already expired token
			const expiredToken = await hwtr256._createWith(
				Math.floor(Date.now() / 1000) - 10, // 10 seconds in the past
				testPayload
			);
			return hwtr256.verify(expiredToken);
		},
		iterations
	);
	
	// Test multiple operations in sequence (real-world scenario)
	results['scenario (create+verify)'] = await benchmarkFunction('scenario (create+verify)',
		async () => {
			const token = await hwtr256.create(...testPayload);
			return hwtr256.verify(token);
		},
		iterations
	);
	
	results['scenario (createWith+verify)'] = await benchmarkFunction('scenario (createWith+verify with hidden)',
		async () => {
			const token = await hwtr256.createWith(300, testPayload, hiddenPayload);
			return hwtr256.verify(token, hiddenPayload);
		},
		iterations
	);
	
	// Print results
	printResults(results);
	
	// Additional analysis
	console.log('\n----- Performance Analysis -----');
	
	// Compare hash algorithms
	const sha256 = parseFloat(results['create (SHA-256)'].mean);
	const sha384 = parseFloat(results['create (SHA-384)'].mean);
	const sha512 = parseFloat(results['create (SHA-512)'].mean);
	
	console.log(`\nHash Algorithm Performance Comparison (relative to SHA-256):`);
	console.log(`SHA-256: 1.00x (baseline)`);
	console.log(`SHA-384: ${(sha384 / sha256).toFixed(2)}x slower`);
	console.log(`SHA-512: ${(sha512 / sha256).toFixed(2)}x slower`);
	
	// Compare creation vs verification
	const createTime = parseFloat(results['create (SHA-256)'].mean);
	const verifyTime = parseFloat(results['verify (SHA-256)'].mean);
	
	console.log(`\nOperation Type Comparison:`);
	console.log(`Creation (SHA-256): ${createTime.toFixed(2)}ms`);
	console.log(`Verification (SHA-256): ${verifyTime.toFixed(2)}ms`);
	console.log(`Ratio (verify/create): ${(verifyTime / createTime).toFixed(2)}x`);
	
	// Compare with/without hidden data
	const createNormal = parseFloat(results['createWith (no hidden)'].mean);
	const createHidden = parseFloat(results['createWith (with hidden)'].mean);
	const verifyNormal = parseFloat(results['verify (SHA-256)'].mean);
	const verifyHidden = parseFloat(results['verify (with hidden)'].mean);
	
	console.log(`\nHidden Data Impact:`);
	console.log(`Creation overhead: ${((createHidden - createNormal) / createNormal * 100).toFixed(2)}%`);
	console.log(`Verification overhead: ${((verifyHidden - verifyNormal) / verifyNormal * 100).toFixed(2)}%`);
	
	// Compare valid vs invalid verification time (timing attack resistance)
	const validTime = parseFloat(results['verify (SHA-256)'].mean);
	const invalidTime = parseFloat(results['verify (invalid sig)'].mean);
	const expiredTime = parseFloat(results['verify (expired)'].mean);
	
	console.log(`\nTiming Analysis (Security):`);
	console.log(`Valid verification: ${validTime.toFixed(2)}ms`);
	console.log(`Invalid verification: ${invalidTime.toFixed(2)}ms`);
	console.log(`Time difference: ${Math.abs(validTime - invalidTime).toFixed(2)}ms (${(Math.abs(validTime - invalidTime) / validTime * 100).toFixed(2)}%)`);
	console.log(`Expired verification: ${expiredTime.toFixed(2)}ms`);
	console.log(`Time difference (expired vs. valid): ${Math.abs(validTime - expiredTime).toFixed(2)}ms (${(Math.abs(validTime - expiredTime) / validTime * 100).toFixed(2)}%)`);
	
	// Memory allocation estimates
	console.log(`\nEstimated Token Sizes:`);
	console.log(`SHA-256 (full): ~${tokens.normal.length} bytes`);
	console.log(`SHA-384 (full): ~${tokens.sha384.length} bytes`);
	console.log(`SHA-512 (full): ~${tokens.sha512.length} bytes`);
	console.log(`Short signature: ~${tokens.short.length} bytes`);
}

Deno.test('hwtr-perf.js - Performance benchmarks for HWTR', async ()=>{

	// Run the tests
	console.log('Starting HWTR performance tests...');
	await compareConfigurations().catch(console.error);

});

// Test performance with different token sizes
Deno.test('Hwtr token size performance analysis', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys);
	const iterations = 321;
	
	// Test data sizes in bytes
	const testSizes = [100, 300, 700, 1200];
	const results = {};
	
	// Generate test data payloads for different sizes
	function generatePayload(targetSize) {
		const elements = [];
		let totalBytes = 0;
		while (totalBytes < targetSize) {
			const element = `data-${Math.random().toString(36).substring(2, 10)}`;
			elements.push(element);
			totalBytes += element.length;
		}
		return { elements, actualSize: JSON.stringify(elements).length };
	}
	
	console.log('\nPerforming token size performance analysis...');
	
	// Test each size
	for (const size of testSizes) {
		const { elements: payload, actualSize } = generatePayload(size);
		console.log(`\nTesting with payload size ~${actualSize} bytes (target: ${size} bytes)`);
		
		// Test token creation
		console.log(`Benchmarking token creation...`);
		const createResults = [];
		let testToken;
		
		// Warm-up
		for (let i = 0; i < 5; i++) {
			await hwtr.create(...payload);
		}
		
		// Measurement
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			const token = await hwtr.create(...payload);
			const end = performance.now();
			createResults.push(end - start);
			
			// Save last token for verification tests
			if (i === iterations - 1) {
				testToken = token;
			}
			
			// Show progress
			if (i % Math.floor(iterations / 5) === 0) {
				process.stdout.write('.');
			}
		}
		console.log(' Done.');
		
		// Test token verification
		console.log(`Benchmarking token verification...`);
		const verifyResults = [];
		
		// Warm-up
		for (let i = 0; i < 5; i++) {
			await hwtr.verify(testToken);
		}
		
		// Measurement
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			await hwtr.verify(testToken);
			const end = performance.now();
			verifyResults.push(end - start);
			
			// Show progress
			if (i % Math.floor(iterations / 5) === 0) {
				process.stdout.write('.');
			}
		}
		console.log(' Done.');
		
		// Save results
		results[`create_${size}`] = calculateStats(createResults);
		results[`verify_${size}`] = calculateStats(verifyResults);
		results[`token_${size}`] = testToken;
		results[`actual_size_${size}`] = actualSize;
	}
	
	// Print results table
	console.log('\n----- HWTR Token Size Performance Results (ms) -----');
	console.log('Operation (Bytes)			 | Mean		| StdDev	| Min		 | Max		 | Samples');
	console.log('----------------------------------------------------------------------------------');
	
	for (const size of testSizes) {
		const actualSize = results[`actual_size_${size}`];
		const createStats = results[`create_${size}`];
		const verifyStats = results[`verify_${size}`];
		
		console.log(
			`Create (~${actualSize})`.padEnd(24) + 
			`| ${createStats.mean.padEnd(8)} | ${createStats.stdDev.padEnd(8)} | ${createStats.min.padEnd(8)} | ${createStats.max.padEnd(8)} | ${createStats.samples}`
		);
		
		console.log(
			`Verify (~${actualSize})`.padEnd(24) + 
			`| ${verifyStats.mean.padEnd(8)} | ${verifyStats.stdDev.padEnd(8)} | ${verifyStats.min.padEnd(8)} | ${verifyStats.max.padEnd(8)} | ${verifyStats.samples}`
		);
	}
	console.log('----------------------------------------------------------------------------------');
	
	// Performance scaling analysis
	console.log('\n----- Token Size Impact Analysis -----');
	
	const baseSize = testSizes[0];
	const baseCreateTime = parseFloat(results[`create_${baseSize}`].mean);
	const baseVerifyTime = parseFloat(results[`verify_${baseSize}`].mean);
	
	console.log(`\nRelative Performance (compared to ${baseSize} bytes):`);
	console.log(`Size (bytes) | Create Time Ratio | Verify Time Ratio`);
	console.log(`--------------------------------------------------`);
	console.log(`${results[`actual_size_${baseSize}`]} | 1.00x | 1.00x`);
	
	for (const size of testSizes.slice(1)) {
		const actualSize = results[`actual_size_${size}`];
		const createTime = parseFloat(results[`create_${size}`].mean);
		const verifyTime = parseFloat(results[`verify_${size}`].mean);
		
		console.log(
			`${actualSize} | ${(createTime / baseCreateTime).toFixed(2)}x | ${(verifyTime / baseVerifyTime).toFixed(2)}x`
		);
	}
	
	// Token size analysis
	console.log('\n----- Token Size Analysis -----');
	
	for (const size of testSizes) {
		const actualSize = results[`actual_size_${size}`];
		const token = results[`token_${size}`];
		console.log(`Input size: ~${actualSize} bytes -> Token size: ${token.length} bytes`);
		console.log(`Token overhead: ${token.length - actualSize} bytes (${((token.length - actualSize) / actualSize * 100).toFixed(2)}%)`);
	}
});

Deno.test('Hwtr typical payload performance benchmark', async () => {
	console.log('\n===== TYPICAL PAYLOAD PERFORMANCE BENCHMARK =====');
	
	// Define typical payload sizes for different use cases
	const payloads = {
		// Small payload: User ID + simple permissions
		small: {
			userId: 'user_123456',
			role: 'standard',
			permissions: ['read', 'comment']
		},
		
		// Medium payload: Session info with user details
		medium: {
			userId: 'user_123456',
			email: 'user@example.com',
			name: 'John Doe',
			role: 'admin',
			permissions: ['read', 'write', 'delete', 'admin'],
			metadata: {
				lastLogin: '2025-03-25T12:34:56Z',
				deviceId: 'device_7890',
				ipAddress: '192.168.1.100',
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		},
		
		// Large payload: Full user profile with extended data
		large: {
			userId: 'user_123456',
			email: 'user@example.com',
			name: 'John Doe',
			role: 'admin',
			organization: 'Acme Corp',
			subscriptionTier: 'enterprise',
			permissions: ['read', 'write', 'delete', 'admin', 'billing', 'user_management'],
			preferences: {
				theme: 'dark',
				notifications: {
					email: true,
					push: true,
					sms: false
				},
				language: 'en-US',
				timezone: 'America/New_York',
				currency: 'USD'
			},
			metadata: {
				lastLogin: '2025-03-25T12:34:56Z',
				previousLogins: [
					'2025-03-20T10:23:45Z',
					'2025-03-15T08:12:34Z',
					'2025-03-10T14:45:12Z'
				],
				devices: [
					{ id: 'device_7890', name: 'Windows Laptop', lastUsed: '2025-03-25T12:34:56Z' },
					{ id: 'device_5678', name: 'iPhone', lastUsed: '2025-03-24T18:22:33Z' },
					{ id: 'device_9012', name: 'iPad', lastUsed: '2025-03-22T09:11:22Z' }
				],
				activitySummary: {
					totalLogins: 127,
					documentsCreated: 45,
					lastActivity: '2025-03-25T16:30:45Z'
				}
			}
		}
	};
	
	// Hidden data examples
	const hiddenData = {
		small: { secretKey: 'sk_test_12345' },
		medium: { 
			secretKey: 'sk_test_12345',
			trackingId: 'tr_7890abc',
			internalFlags: ['beta_user', 'early_access']
		}
	};
	
	// Test iterations
	const iterations = 1000;
	
	// Test all hash algorithms
	const hashAlgorithms = ['SHA-256', 'SHA-384', 'SHA-512'];
	
	// Results table
	const results = {};
	
	for (const hashAlgo of hashAlgorithms) {
		console.log(`\nTesting with ${hashAlgo}`);
		
		// Generate a key for this test
		const keys = await Hwtr.generateKeys();
		const hwtr = await Hwtr.factory(keys, { hash: hashAlgo });
		
		for (const [payloadSize, payload] of Object.entries(payloads)) {
			// Convert object size to approximate bytes
			const payloadJson = JSON.stringify(payload);
			const payloadBytes = new TextEncoder().encode(payloadJson).length;
			
			console.log(`\n${payloadSize.toUpperCase()} payload (${payloadBytes} bytes):`);
			
			// Test regular token creation
			const createTimes = [];
			let token;
			
			console.log(`	- Running ${iterations} iterations for create()`);
			for (let i = 0; i < iterations; i++) {
				const start = performance.now();
				token = await hwtr.create(payload);
				const end = performance.now();
				createTimes.push(end - start);
			}
			
			// Test token verification
			const verifyTimes = [];
			console.log(`	- Running ${iterations} iterations for verify()`);
			for (let i = 0; i < iterations; i++) {
				const start = performance.now();
				await hwtr.verify(token);
				const end = performance.now();
				verifyTimes.push(end - start);
			}
			
			// Test with hidden data if available
			const createWithHiddenTimes = [];
			const verifyWithHiddenTimes = [];
			let tokenWithHidden;
			
			if (hiddenData[payloadSize]) {
				console.log(`	- Running ${iterations} iterations for createWith() + hidden data`);
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					tokenWithHidden = await hwtr.createWith(300, payload, hiddenData[payloadSize]);
					const end = performance.now();
					createWithHiddenTimes.push(end - start);
				}
				
				console.log(`	- Running ${iterations} iterations for verify() + hidden data`);
				for (let i = 0; i < iterations; i++) {
					const start = performance.now();
					await hwtr.verify(tokenWithHidden, hiddenData[payloadSize]);
					const end = performance.now();
					verifyWithHiddenTimes.push(end - start);
				}
			}
			
			// Calculate statistics
			function calcStats(times) {
				const sum = times.reduce((acc, val) => acc + val, 0);
				const mean = sum / times.length;
				const squaredDiffs = times.map(val => (val - mean) ** 2);
				const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / times.length;
				const stdDev = Math.sqrt(variance);
				
				return {
					mean: mean.toFixed(3),
					stdDev: stdDev.toFixed(3),
					min: Math.min(...times).toFixed(3),
					max: Math.max(...times).toFixed(3),
					tokenSize: token.length
				};
			}
			
			// Store results
			const key = `${hashAlgo}_${payloadSize}`;
			results[`${key}_create`] = calcStats(createTimes);
			results[`${key}_verify`] = calcStats(verifyTimes);
			
			if (hiddenData[payloadSize]) {
				results[`${key}_createWithHidden`] = calcStats(createWithHiddenTimes);
				results[`${key}_verifyWithHidden`] = calcStats(verifyWithHiddenTimes);
			}
			
			// Report token size
			console.log(`	- Token size: ${token.length} bytes`);
			if (tokenWithHidden) {
				console.log(`	- Token with hidden data size: ${tokenWithHidden.length} bytes`);
			}
		}
	}
	
	// Print formatted results table
	console.log('\n===== RESULTS SUMMARY (milliseconds) =====');
	console.log('Operation		| Hash		| Payload | Mean		| StdDev	| Min		 | Max		 | Token Size');
	console.log('-------------------------------------------------------------------------------------------');
	
	Object.entries(results).forEach(([key, stats]) => {
		const [hash, size, operation] = key.split('_');
		let opDisplay = operation;
		if (operation === 'createWithHidden') opDisplay = 'create+hidden';
		if (operation === 'verifyWithHidden') opDisplay = 'verify+hidden';
		
		console.log(
			`${opDisplay.padEnd(24)} | ${hash.replace('SHA-', '').padEnd(7)} | ${size.padEnd(7)} | ${stats.mean.padEnd(7)} | ${stats.stdDev.padEnd(7)} | ${stats.min.padEnd(7)} | ${stats.max.padEnd(7)} | ${stats.tokenSize}`
		);
	});
	
	// Calculate overhead percentages
	console.log('\n===== OVERHEAD ANALYSIS =====');
	
	for (const hash of hashAlgorithms) {
		const hashKey = hash.replace('SHA-', '');
		console.log(`\n${hash} Performance:`);
		
		console.log('Payload Size | Create vs Create+Hidden | Verify vs Verify+Hidden | Create vs Verify');
		console.log('---------------------------------------------------------------------------------');
		
		for (const size of ['small', 'medium', 'large']) {
			if (!hiddenData[size]) continue;
			
			const createTime = parseFloat(results[`${hash}_${size}_create`].mean);
			const verifyTime = parseFloat(results[`${hash}_${size}_verify`].mean);
			const createHiddenTime = parseFloat(results[`${hash}_${size}_createWithHidden`]?.mean || 0);
			const verifyHiddenTime = parseFloat(results[`${hash}_${size}_verifyWithHidden`]?.mean || 0);
			
			if (createHiddenTime && verifyHiddenTime) {
				const createOverhead = ((createHiddenTime - createTime) / createTime * 100).toFixed(2);
				const verifyOverhead = ((verifyHiddenTime - verifyTime) / verifyTime * 100).toFixed(2);
				const verifyCreateRatio = ((verifyTime - createTime) / createTime * 100).toFixed(2);
				
				console.log(
					`${size.padEnd(12)} | ${createOverhead.padEnd(22)}% | ${verifyOverhead.padEnd(22)}% | ${verifyCreateRatio.padEnd(8)}%`
				);
			}
		}
	}
	
	console.log('\n===== END OF BENCHMARK =====');
});

Deno.test('Hwtr performance comparison test', async () => {
	const keys = await Hwtr.generateKeys();
	const hwtr = await Hwtr.factory(keys, {});
	const testData = { id: 123, name: "Test User", role: "admin" };
	
	// Measure token creation time
	const tokenCount = 100;
	const tokens = [];
	
	console.log(`Measuring performance for ${tokenCount} token operations...`);
	
	const createStart = performance.now();
	for (let i = 0; i < tokenCount; i++) {
		tokens.push(await hwtr.create(testData));
	}
	const createEnd = performance.now();
	const createTime = createEnd - createStart;
	
	// Measure token verification time
	const verifyStart = performance.now();
	for (let i = 0; i < tokenCount; i++) {
		await hwtr.verify(tokens[i]);
	}
	const verifyEnd = performance.now();
	const verifyTime = verifyEnd - verifyStart;
	
	console.log(`Creation time: ${createTime.toFixed(2)}ms (${(createTime/tokenCount).toFixed(2)}ms per token)`);
	console.log(`Verification time: ${verifyTime.toFixed(2)}ms (${(verifyTime/tokenCount).toFixed(2)}ms per token)`);
	
	// No strict assertions here, just reporting performance metrics
	console.log("Performance test completed");
});

///////// 

Deno.test('Hwtr JX format performance comparison', async () => {
	console.log('\n===== JX FORMAT PERFORMANCE COMPARISON =====');
	
	// Test hash algorithms
	const hashAlgorithms = ['SHA-256', 'SHA-384', 'SHA-512'];
	
	// Generate complex payloads that benefit from JX format
	const payloads = {
		small: {
			userId: 'user_123456',
			sessionData: {
				startTime: new Date(),
				features: new Set(['basic', 'premium']),
				deviceInfo: new Uint8Array([1, 2, 3, 4, 5])
			}
		},
		medium: {
			userId: 'user_123456',
			email: 'user@example.com',
			name: 'John Doe',
			role: 'admin',
			permissions: ['read', 'write', 'delete', 'admin'],
			preferences: {
				lastLogin: new Date(),
				favoriteCategories: new Set(['tech', 'science', 'art']),
				settings: new Map([
					['theme', 'dark'],
					['notifications', true],
					['autoSave', 300]
				])
			},
			metadata: {
				lastLogin: new Date(),
				deviceIds: new Set(['device_7890', 'device_1234']),
				profileImage: new Uint8Array(new Array(50).fill(1))
			}
		},
		large: {
			userId: 'user_123456',
			email: 'user@example.com',
			name: 'John Doe',
			organization: 'Acme Corp',
			role: 'admin',
			subscriptionTier: 'enterprise',
			permissions: ['read', 'write', 'delete', 'admin', 'billing', 'user_management'],
			preferences: {
				theme: 'dark',
				notifications: {
					email: true,
					push: true,
					sms: false
				},
				language: 'en-US',
				timezone: 'America/New_York',
				currency: 'USD',
				favoriteItems: new Set(['item1', 'item2', 'item3', 'item4', 'item5']),
				savedSearches: new Map([
					['recent', {query: 'status:open', timestamp: new Date()}],
					['important', {query: 'priority:high', timestamp: new Date()}],
					['assigned', {query: 'assignee:me', timestamp: new Date()}]
				])
			},
			metadata: {
				created: new Date(),
				lastModified: new Date(),
				history: [
					{
						action: 'login',
						timestamp: new Date(Date.now() - 86400000),
						device: 'mobile',
						ipAddress: '192.168.1.1',
						location: {
							country: 'USA',
							city: 'New York',
							coordinates: new Float32Array([40.7128, -74.0060])
						}
					},
					{
						action: 'profile_update',
						timestamp: new Date(Date.now() - 43200000),
						changes: new Map([
							['name', {old: 'Johnny', new: 'John'}],
							['email', {old: 'johnny@example.com', new: 'user@example.com'}]
						]),
						device: 'desktop'
					}
				],
				devices: [
					{
						id: 'device_7890',
						name: 'iPhone',
						lastSeen: new Date(),
						capabilities: new Set(['push', 'location', 'camera']),
						signature: new Uint8Array(new Array(100).fill(2))
					},
					{
						id: 'device_1234',
						name: 'MacBook',
						lastSeen: new Date(Date.now() - 3600000),
						capabilities: new Set(['push', 'webcam', 'microphone']),
						signature: new Uint8Array(new Array(100).fill(3))
					}
				]
			}
		}
	};
	
	// Iterations for testing
	const iterations = 300;
	
	// Results storage
	const results = {};
	
	// Test both formats
	for (const fmt of ['j', 'jx']) {
		console.log(`\nTesting format: ${fmt}`);
		
		for (const hashAlgo of hashAlgorithms) {
			console.log(`\n  Hash algorithm: ${hashAlgo}`);
			
			// Generate a key for this test
			const keys = await Hwtr.generateKeys();
			const hwtr = await Hwtr.factory(keys, { hash: hashAlgo, format: fmt });
			
			for (const [size, payload] of Object.entries(payloads)) {
				console.log(`\n    Payload size: ${size}`);
				
				try {
					// Test token creation
					const createTimes = [];
					let token;
					let tokenSuccess = true;
					
					// Warm-up
					try {
						for (let i = 0; i < 5; i++) {
							await hwtr.create(payload);
						}
					} catch (error) {
						console.error(`      Error during warm-up: ${error.message}`);
						tokenSuccess = false;
					}
					
					if (tokenSuccess) {
						console.log(`      Running ${iterations} iterations for create()`);
						for (let i = 0; i < iterations; i++) {
							const start = performance.now();
							token = await hwtr.create(payload);
							const end = performance.now();
							createTimes.push(end - start);
							
							// Show progress
							if (i % Math.floor(iterations / 5) === 0) {
								process.stdout.write('.');
							}
						}
						console.log(' Done.');
						
						// Test token verification
						const verifyTimes = [];
						
						// Warm-up for verification
						for (let i = 0; i < 5; i++) {
							await hwtr.verify(token);
						}
						
						console.log(`      Running ${iterations} iterations for verify()`);
						for (let i = 0; i < iterations; i++) {
							const start = performance.now();
							await hwtr.verify(token);
							const end = performance.now();
							verifyTimes.push(end - start);
							
							// Show progress
							if (i % Math.floor(iterations / 5) === 0) {
								process.stdout.write('.');
							}
						}
						console.log(' Done.');
						
						// Calculate statistics
						const createStats = calculateStats(createTimes);
						const verifyStats = calculateStats(verifyTimes);
						
						// Store results
						const resultKey = `${fmt}_${hashAlgo}_${size}`;
						results[resultKey] = {
							format: fmt,
							hash: hashAlgo,
							payloadSize: size,
							createStats,
							verifyStats,
							tokenSize: token.length,
							tokenByteLength: new TextEncoder().encode(token).length
						};
						
						console.log(`      Token size: ${token.length} chars / ${new TextEncoder().encode(token).length} bytes`);
					}
				} catch (error) {
					console.error(`      Error with ${fmt}/${hashAlgo}/${size}: ${error.message}`);
				}
			}
		}
	}
	
	// Print results table
	console.log('\n===== JX FORMAT COMPARISON RESULTS =====');
	console.log('Format | Hash    | Payload | Create Mean (ms) | Verify Mean (ms) | Token Size (chars) | Token Size (bytes)');
	console.log('--------------------------------------------------------------------------------------------------------');
	
	Object.values(results).forEach(result => {
		console.log(
			`${result.format.padEnd(6)} | ${result.hash.replace('SHA-', '').padEnd(8)} | ${result.payloadSize.padEnd(7)} | ${result.createStats.mean.padEnd(15)} | ${result.verifyStats.mean.padEnd(15)} | ${String(result.tokenSize).padEnd(17)} | ${result.tokenByteLength}`
		);
	});
	
	// Comparative analysis
	console.log('\n===== JX vs J COMPARATIVE ANALYSIS =====');
	
	// Token size comparison
	console.log('\nToken Size Comparison (JX relative to J):');
	console.log('Hash    | Payload | J size (bytes) | JX size (bytes) | Size ratio (JX/J)');
	console.log('----------------------------------------------------------------------');
	
	for (const hashAlgo of hashAlgorithms) {
		for (const size of Object.keys(payloads)) {
			const jKey = `j_${hashAlgo}_${size}`;
			const jxKey = `jx_${hashAlgo}_${size}`;
			
			if (results[jKey] && results[jxKey]) {
				const jSize = results[jKey].tokenByteLength;
				const jxSize = results[jxKey].tokenByteLength;
				const ratio = (jxSize / jSize).toFixed(2);
				
				console.log(
					`${hashAlgo.replace('SHA-', '').padEnd(8)} | ${size.padEnd(7)} | ${jSize.toString().padEnd(14)} | ${jxSize.toString().padEnd(15)} | ${ratio}x`
				);
			}
		}
	}
	
	// Performance comparison
	console.log('\nCreate Performance Comparison (JX relative to J):');
	console.log('Hash    | Payload | J time (ms) | JX time (ms) | Performance ratio (JX/J)');
	console.log('------------------------------------------------------------------------');
	
	for (const hashAlgo of hashAlgorithms) {
		for (const size of Object.keys(payloads)) {
			const jKey = `j_${hashAlgo}_${size}`;
			const jxKey = `jx_${hashAlgo}_${size}`;
			
			if (results[jKey] && results[jxKey]) {
				const jTime = parseFloat(results[jKey].createStats.mean);
				const jxTime = parseFloat(results[jxKey].createStats.mean);
				const ratio = (jxTime / jTime).toFixed(2);
				
				console.log(
					`${hashAlgo.replace('SHA-', '').padEnd(8)} | ${size.padEnd(7)} | ${jTime.toFixed(3).padEnd(11)} | ${jxTime.toFixed(3).padEnd(12)} | ${ratio}x`
				);
			}
		}
	}
	
	console.log('\nVerify Performance Comparison (JX relative to J):');
	console.log('Hash    | Payload | J time (ms) | JX time (ms) | Performance ratio (JX/J)');
	console.log('------------------------------------------------------------------------');
	
	for (const hashAlgo of hashAlgorithms) {
		for (const size of Object.keys(payloads)) {
			const jKey = `j_${hashAlgo}_${size}`;
			const jxKey = `jx_${hashAlgo}_${size}`;
			
			if (results[jKey] && results[jxKey]) {
				const jTime = parseFloat(results[jKey].verifyStats.mean);
				const jxTime = parseFloat(results[jxKey].verifyStats.mean);
				const ratio = (jxTime / jTime).toFixed(2);
				
				console.log(
					`${hashAlgo.replace('SHA-', '').padEnd(8)} | ${size.padEnd(7)} | ${jTime.toFixed(3).padEnd(11)} | ${jxTime.toFixed(3).padEnd(12)} | ${ratio}x`
				);
			}
		}
	}
	
	// Success rate analysis for complex data structures
	console.log('\nComplex Data Structure Handling Analysis:');
	console.log('Format | Successfully handled complex types?');
	console.log('------------------------------------------');
	
	const complexTypesHandled = {
		j: {
			set: false,
			map: false,
			date: false,
			typedArray: false,
			success: false
		},
		jx: {
			set: false,
			map: false,
			date: false,
			typedArray: false,
			success: false
		}
	};
	
	// Check if the large payload was successfully processed
	for (const fmt of ['j', 'jx']) {
		let anySuccess = false;
		
		for (const hashAlgo of hashAlgorithms) {
			const key = `${fmt}_${hashAlgo}_large`;
			if (results[key]) {
				anySuccess = true;
				complexTypesHandled[fmt].success = true;
				break;
			}
		}
		
		// If we had at least one success, verify the data was properly encoded/decoded
		if (anySuccess) {
			// Check all complex types that the format was able to handle
			const keys = await Hwtr.generateKeys();
			const hwtr = await Hwtr.factory(keys, { format: fmt });
			
			try {
				// Test with individual complex types
				const testSet = new Set(['test']);
				const testToken1 = await hwtr.create({ testSet });
				const result1 = await hwtr.verify(testToken1);
				complexTypesHandled[fmt].set = (result1.ok && result1.data.testSet instanceof Set);
				
				const testMap = new Map([['key', 'value']]);
				const testToken2 = await hwtr.create({ testMap });
				const result2 = await hwtr.verify(testToken2);
				complexTypesHandled[fmt].map = (result2.ok && result2.data.testMap instanceof Map);
				
				const testDate = new Date();
				const testToken3 = await hwtr.create({ testDate });
				const result3 = await hwtr.verify(testToken3);
				complexTypesHandled[fmt].date = (result3.ok && result3.data.testDate instanceof Date);
				
				const testArray = new Uint8Array([1, 2, 3]);
				const testToken4 = await hwtr.create({ testArray });
				const result4 = await hwtr.verify(testToken4);
				complexTypesHandled[fmt].typedArray = (result4.ok && result4.data.testArray instanceof Uint8Array);
				
			} catch (error) {
				console.error(`      Error testing complex types for ${fmt}: ${error.message}`);
			}
		}
		
		console.log(`${fmt.padEnd(6)} | Set: ${complexTypesHandled[fmt].set ? 'Yes' : 'No'}, Map: ${complexTypesHandled[fmt].map ? 'Yes' : 'No'}, Date: ${complexTypesHandled[fmt].date ? 'Yes' : 'No'}, TypedArray: ${complexTypesHandled[fmt].typedArray ? 'Yes' : 'No'}`);
	}
	
	console.log('\n===== END OF JX FORMAT COMPARISON =====');
});

Deno.test('Hwtr format comparison with special data types', async () => {
	console.log('\n===== FORMAT COMPARISON WITH SPECIAL DATA TYPES =====');
	
	// Test formats
	let formats = ['j', 'jx'];
	
	// Try to import and register additional formats
	try {
		const { cbor, msgpack } = await import('./hwtr.codecs.js');
		Hwtr.registerFormat('cb', cbor);
		Hwtr.registerFormat('mp', msgpack);
		formats = ['j', 'jx', 'cb', 'mp'];
	} catch (error) {
		console.warn(`CBOR and MessagePack formats could not be registered: ${error.message}`);
	}
	
	// Test hash algorithms
	const hashAlgorithms = ['SHA-256', 'SHA-384', 'SHA-512'];
	
	// Special data types
	const specialSet = new Set(['apple', 'banana', 'cherry']);
	const specialMap = new Map([
		['user', 'john123'], 
		['role', 'admin'], 
		['permissions', ['read', 'write', 'delete']]
	]);
	const specialDate = new Date();
	const specialUint8Array = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	
	// Payloads with different sizes
	const payloads = {
		verySmall: {
			id: 'vs123',
			type: 'test'
		},
		small: {
			id: 'sm456',
			type: 'test',
			set: specialSet,
			map: specialMap, 
			date: specialDate,
			binary: specialUint8Array
		},
		medium: {
			id: 'md789',
			type: 'test',
			sets: [specialSet, new Set(['x', 'y', 'z'])],
			maps: [
				specialMap, 
				new Map([['key3', 'value3'], ['key4', 'value4']])
			],
			dates: [specialDate, new Date(specialDate.getTime() - 86400000)],
			binaries: [specialUint8Array, new Uint8Array([10, 20, 30, 40, 50])],
			metadata: {
				created: specialDate,
				tags: specialSet,
				properties: specialMap,
				thumbnail: specialUint8Array
			}
		}
	};
	
	// Test iterations (reduced to speed up tests while still getting meaningful results)
	const iterations = 500;
	
	// Results storage
	const results = {};
	
	// Iterate through formats and test
	for (const fmt of formats) {
		console.log(`\nTesting format: ${fmt}`);
		
		for (const hashAlgo of hashAlgorithms) {
			console.log(`\n  Hash algorithm: ${hashAlgo}`);
			
			// Generate a key for this test
			const keys = await Hwtr.generateKeys();
			const hwtr = await Hwtr.factory(keys, { hash: hashAlgo, format: fmt });
			
			for (const [size, payload] of Object.entries(payloads)) {
				console.log(`\n    Payload size: ${size}`);
				
				try {
					// Test token creation
					const createTimes = [];
					let token;
					
					// Warm-up
					for (let i = 0; i < 5; i++) {
						await hwtr.create(payload);
					}
					
					console.log(`      Running ${iterations} iterations for create()`);
					for (let i = 0; i < iterations; i++) {
						const start = performance.now();
						token = await hwtr.create(payload);
						const end = performance.now();
						createTimes.push(end - start);
						
						// Show progress
						if (i % Math.floor(iterations / 5) === 0) {
							process.stdout.write('.');
						}
					}
					console.log(' Done.');
					
					// Test token verification
					const verifyTimes = [];
					
					// Warm-up
					for (let i = 0; i < 5; i++) {
						await hwtr.verify(token);
					}
					
					console.log(`      Running ${iterations} iterations for verify()`);
					for (let i = 0; i < iterations; i++) {
						const start = performance.now();
						await hwtr.verify(token);
						const end = performance.now();
						verifyTimes.push(end - start);
						
						// Show progress
						if (i % Math.floor(iterations / 5) === 0) {
							process.stdout.write('.');
						}
					}
					console.log(' Done.');
					
					// Calculate statistics
					const createStats = calculateStats(createTimes);
					const verifyStats = calculateStats(verifyTimes);
					
					// Store results
					const resultKey = `${fmt}_${hashAlgo}_${size}`;
					results[resultKey] = {
						format: fmt,
						hash: hashAlgo,
						payloadSize: size,
						createStats,
						verifyStats,
						tokenSize: token.length,
						tokenByteLength: new TextEncoder().encode(token).length
					};
					
					console.log(`      Token size: ${token.length} chars / ${new TextEncoder().encode(token).length} bytes`);
					
				} catch (error) {
					console.error(`      Error with ${fmt}/${hashAlgo}/${size}: ${error.message}`);
				}
			}
		}
	}
	
	// Print formatted results table
	console.log('\n===== FORMAT COMPARISON RESULTS =====');
	console.log('Format | Hash    | Payload   | Create Mean (ms) | Verify Mean (ms) | Token Size (chars) | Token Size (bytes)');
	console.log('----------------------------------------------------------------------------------------------------------');
	
	Object.values(results).forEach(result => {
		console.log(
			`${result.format.padEnd(6)} | ${result.hash.replace('SHA-', '').padEnd(8)} | ${result.payloadSize.padEnd(9)} | ${result.createStats.mean.padEnd(15)} | ${result.verifyStats.mean.padEnd(15)} | ${String(result.tokenSize).padEnd(17)} | ${result.tokenByteLength}`
		);
	});
	
	// Comparative analysis
	console.log('\n===== COMPARATIVE ANALYSIS =====');
	
	// Format comparison
	console.log('\nFormat Size Comparison (relative to default "j" format):');
	console.log('Hash    | Payload   | j size (bytes) | jx ratio | cb ratio | mp ratio');
	console.log('----------------------------------------------------------------------');
	
	for (const hashAlgo of hashAlgorithms) {
		for (const size of Object.keys(payloads)) {
			const baseKey = `j_${hashAlgo}_${size}`;
			if (!results[baseKey]) continue;
			
			const baseSize = results[baseKey].tokenByteLength;
			let output = `${hashAlgo.replace('SHA-', '').padEnd(8)} | ${size.padEnd(9)} | ${baseSize.toString().padEnd(14)}`;
			
			for (const fmt of formats) {
				if (fmt === 'j') continue;
				
				const compareKey = `${fmt}_${hashAlgo}_${size}`;
				if (results[compareKey]) {
					const ratio = (results[compareKey].tokenByteLength / baseSize).toFixed(2);
					output += ` | ${ratio}x`;
				} else {
					output += ` | N/A`;
				}
			}
			
			console.log(output);
		}
	}
	
	// Performance comparison - creation
	console.log('\nFormat Creation Performance Comparison (relative to "j"):');
	console.log('Hash    | Payload   | j time (ms) | jx ratio | cb ratio | mp ratio');
	console.log('------------------------------------------------------------------');
	
	for (const hashAlgo of hashAlgorithms) {
		for (const size of Object.keys(payloads)) {
			const baseKey = `j_${hashAlgo}_${size}`;
			if (!results[baseKey]) continue;
			
			const baseTime = parseFloat(results[baseKey].createStats.mean);
			let output = `${hashAlgo.replace('SHA-', '').padEnd(8)} | ${size.padEnd(9)} | ${baseTime.toFixed(3).padEnd(12)}`;
			
			for (const fmt of formats) {
				if (fmt === 'j') continue;
				
				const compareKey = `${fmt}_${hashAlgo}_${size}`;
				if (results[compareKey]) {
					const ratio = (parseFloat(results[compareKey].createStats.mean) / baseTime).toFixed(2);
					output += ` | ${ratio}x`;
				} else {
					output += ` | N/A`;
				}
			}
			
			console.log(output);
		}
	}
	
	// Performance comparison - verification
	console.log('\nFormat Verification Performance Comparison (relative to "j"):');
	console.log('Hash    | Payload   | j time (ms) | jx ratio | cb ratio | mp ratio');
	console.log('------------------------------------------------------------------');
	
	for (const hashAlgo of hashAlgorithms) {
		for (const size of Object.keys(payloads)) {
			const baseKey = `j_${hashAlgo}_${size}`;
			if (!results[baseKey]) continue;
			
			const baseTime = parseFloat(results[baseKey].verifyStats.mean);
			let output = `${hashAlgo.replace('SHA-', '').padEnd(8)} | ${size.padEnd(9)} | ${baseTime.toFixed(3).padEnd(12)}`;
			
			for (const fmt of formats) {
				if (fmt === 'j') continue;
				
				const compareKey = `${fmt}_${hashAlgo}_${size}`;
				if (results[compareKey]) {
					const ratio = (parseFloat(results[compareKey].verifyStats.mean) / baseTime).toFixed(2);
					output += ` | ${ratio}x`;
				} else {
					output += ` | N/A`;
				}
			}
			
			console.log(output);
		}
	}
	
	console.log('\n===== END OF FORMAT COMPARISON =====');
});

Deno.test('JWT vs HWTR Performance Comparison', async () => {

console.warn(`TODO improve JWT vs Hwtr performance comparison`);
return;

	console.log('\n===== JWT vs HWTR PERFORMANCE COMPARISON =====');
	
	// Generate a consistent secret for both token systems
	const secretBytes = crypto.getRandomValues(new Uint8Array(32));
	const secretBase64 = Hwtr.bufferToBase64Url(secretBytes);
	
	// Initialize both token systems
	const keys = {
		current: 'key1',
		keys: [{
			id: 'key1',
			secret: secretBytes,
			created: new Date().toISOString()
		}]
	};
	
	// Initialize HWTR instances
	const hwtrJ = await Hwtr.factory(keys, { hash: 'SHA-256', format: 'j' });
	const hwtrJX = await Hwtr.factory(keys, { hash: 'SHA-256', format: 'jx' });
	
	// Initialize JWT instance
	const jwtr = await (new Jwtr(secretBase64, {
		expiresInSeconds: 300 // 5 minutes, same as we'll use for HWTR
	})).ready();
	
	// Define payloads of different sizes
	const payloads = {
		verySmall: {
			id: 'vs123',
			role: 'user'
		},
		small: {
			id: 'sm456',
			role: 'admin',
			name: 'John Doe',
			email: 'john.doe@example.com'
		},
		medium: {
			id: 'md789',
			role: 'admin',
			name: 'John Doe',
			email: 'john.doe@example.com',
			permissions: ['read', 'write', 'delete', 'admin'],
			metadata: {
				lastLogin: new Date().toISOString(),
				deviceId: 'device_7890',
				ipAddress: '192.168.1.100',
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		}
	};
	
	// Define special payloads with data types that might be handled differently
	const specialPayloads = {
		withDate: {
			id: 'date123',
			loginTime: new Date()
		},
		withSet: {
			id: 'set456',
			permissions: new Set(['read', 'write', 'admin'])
		},
		withMap: {
			id: 'map789',
			settings: new Map([
				['theme', 'dark'],
				['notifications', true]
			])
		},
		withTypedArray: {
			id: 'array012',
			signature: new Uint8Array([1, 2, 3, 4, 5])
		}
	};
	
	// Test iterations for statistical significance
	const iterations = 1000;
	
	// Results storage
	const results = {};
	const expiresInSeconds = 300; // 5 minutes for all tokens
	
	// Benchmark function
	async function benchmarkTokenSystem(name, createFn, verifyFn, payload) {
		console.log(`\n  Benchmarking ${name} with ${payload} payload...`);
		
		// Create token timing
		const createTimes = [];
		let token;
		
		// Warm-up
		for (let i = 0; i < 5; i++) {
			await createFn(payload);
		}
		
		// Measure creation time
		console.log(`    Running ${iterations} iterations for token creation...`);
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			token = await createFn(payload);
			const end = performance.now();
			createTimes.push(end - start);
			
			// Show progress
			if (i % Math.floor(iterations / 5) === 0) {
				process.stdout.write('.');
			}
		}
		console.log(' Done.');
		
		// Verify token timing
		const verifyTimes = [];
		
		// Warm-up
		for (let i = 0; i < 5; i++) {
			await verifyFn(token);
		}
		
		// Measure verification time
		console.log(`    Running ${iterations} iterations for token verification...`);
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			await verifyFn(token);
			const end = performance.now();
			verifyTimes.push(end - start);
			
			// Show progress
			if (i % Math.floor(iterations / 5) === 0) {
				process.stdout.write('.');
			}
		}
		console.log(' Done.');
		
		// Calculate statistics
		const createStats = calculateStats(createTimes);
		const verifyStats = calculateStats(verifyTimes);
		const tokenSize = new TextEncoder().encode(token).length;
		
		return {
			createStats,
			verifyStats,
			tokenSize,
			token
		};
	}
	
	// Run benchmarks for standard payloads
	for (const [size, payload] of Object.entries(payloads)) {
		console.log(`\nTesting with ${size} payload:`);
		
		// JWT benchmark
		results[`jwt_${size}`] = await benchmarkTokenSystem(
			'JWT',
			(data) => jwtr.create(data),
			(token) => jwtr.verify(token, { ignoreExp: true }),
			payload
		);
		
		// HWTR with 'j' format benchmark
		results[`hwtr_j_${size}`] = await benchmarkTokenSystem(
			'HWTR (j format)',
			(data) => hwtrJ.createWith(expiresInSeconds, data),
			(token) => hwtrJ.verify(token),
			payload
		);
		
		// HWTR with 'jx' format benchmark
		results[`hwtr_jx_${size}`] = await benchmarkTokenSystem(
			'HWTR (jx format)',
			(data) => hwtrJX.createWith(expiresInSeconds, data),
			(token) => hwtrJX.verify(token),
			payload
		);
	}
	
	// Run benchmarks for special payloads that test type handling
	console.log('\nTesting with special data types:');
	for (const [type, payload] of Object.entries(specialPayloads)) {
		console.log(`\nTesting with ${type}:`);
		
		try {
			// JWT benchmark
			results[`jwt_${type}`] = await benchmarkTokenSystem(
				'JWT',
				(data) => jwtr.create(data),
				(token) => jwtr.verify(token, { ignoreExp: true }),
				payload
			);
		} catch (error) {
			console.error(`  Error with JWT and ${type}: ${error.message}`);
		}
		
		try {
			// HWTR with 'jx' format benchmark (which should handle special types)
			results[`hwtr_jx_${type}`] = await benchmarkTokenSystem(
				'HWTR (jx format)',
				(data) => hwtrJX.createWith(expiresInSeconds, data),
				(token) => hwtrJX.verify(token),
				payload
			);
		} catch (error) {
			console.error(`  Error with HWTR (jx) and ${type}: ${error.message}`);
		}
	}
	
	// Print formatted results table
	console.log('\n===== PERFORMANCE RESULTS (milliseconds) =====');
	console.log('System | Payload    | Create Mean | Create StdDev | Verify Mean | Verify StdDev | Token Size (bytes)');
	console.log('--------------------------------------------------------------------------------------------------');
	
	for (const [key, result] of Object.entries(results)) {
		// Parse the key to get token system and payload size
		const [system, size] = key.includes('hwtr') 
			? [key.substring(0, 7), key.substring(8)]
			: [key.substring(0, 3), key.substring(4)];
		
		console.log(
			`${system.padEnd(7)} | ${size.padEnd(11)} | ${result.createStats.mean.padEnd(11)} | ${result.createStats.stdDev.padEnd(13)} | ${result.verifyStats.mean.padEnd(11)} | ${result.verifyStats.stdDev.padEnd(13)} | ${result.tokenSize}`
		);
	}
	
	// Comparative analysis
	console.log('\n===== COMPARATIVE ANALYSIS =====');
	
	// Token size comparison
	console.log('\nToken Size Comparison (relative to JWT):');
	console.log('Payload    | JWT (bytes) | HWTR-j ratio | HWTR-jx ratio');
	console.log('--------------------------------------------------------');
	
	for (const size of [...Object.keys(payloads), ...Object.keys(specialPayloads)]) {
		const jwtKey = `jwt_${size}`;
		const hwtrJKey = `hwtr_j_${size}`;
		const hwtrJXKey = `hwtr_jx_${size}`;
		
		if (results[jwtKey]) {
			const jwtSize = results[jwtKey].tokenSize;
			let output = `${size.padEnd(11)} | ${jwtSize.toString().padEnd(11)}`;
			
			if (results[hwtrJKey]) {
				const ratio = (results[hwtrJKey].tokenSize / jwtSize).toFixed(2);
				output += ` | ${ratio}x`;
			} else {
				output += ` | N/A`;
			}
			
			if (results[hwtrJXKey]) {
				const ratio = (results[hwtrJXKey].tokenSize / jwtSize).toFixed(2);
				output += ` | ${ratio}x`;
			} else {
				output += ` | N/A`;
			}
			
			console.log(output);
		}
	}
	
	// Performance comparison - creation
	console.log('\nToken Creation Performance (relative to JWT):');
	console.log('Payload    | JWT (ms) | HWTR-j ratio | HWTR-jx ratio');
	console.log('---------------------------------------------------');
	
	for (const size of [...Object.keys(payloads), ...Object.keys(specialPayloads)]) {
		const jwtKey = `jwt_${size}`;
		const hwtrJKey = `hwtr_j_${size}`;
		const hwtrJXKey = `hwtr_jx_${size}`;
		
		if (results[jwtKey]) {
			const jwtTime = parseFloat(results[jwtKey].createStats.mean);
			let output = `${size.padEnd(11)} | ${jwtTime.toFixed(3).padEnd(8)}`;
			
			if (results[hwtrJKey]) {
				const ratio = (parseFloat(results[hwtrJKey].createStats.mean) / jwtTime).toFixed(2);
				output += ` | ${ratio}x`;
			} else {
				output += ` | N/A`;
			}
			
			if (results[hwtrJXKey]) {
				const ratio = (parseFloat(results[hwtrJXKey].createStats.mean) / jwtTime).toFixed(2);
				output += ` | ${ratio}x`;
			} else {
				output += ` | N/A`;
			}
			
			console.log(output);
		}
	}
	
	// Performance comparison - verification
	console.log('\nToken Verification Performance (relative to JWT):');
	console.log('Payload    | JWT (ms) | HWTR-j ratio | HWTR-jx ratio');
	console.log('---------------------------------------------------');
	
	for (const size of [...Object.keys(payloads), ...Object.keys(specialPayloads)]) {
		const jwtKey = `jwt_${size}`;
		const hwtrJKey = `hwtr_j_${size}`;
		const hwtrJXKey = `hwtr_jx_${size}`;
		
		if (results[jwtKey]) {
			const jwtTime = parseFloat(results[jwtKey].verifyStats.mean);
			let output = `${size.padEnd(11)} | ${jwtTime.toFixed(3).padEnd(8)}`;
			
			if (results[hwtrJKey]) {
				const ratio = (parseFloat(results[hwtrJKey].verifyStats.mean) / jwtTime).toFixed(2);
				output += ` | ${ratio}x`;
			} else {
				output += ` | N/A`;
			}
			
			if (results[hwtrJXKey]) {
				const ratio = (parseFloat(results[hwtrJXKey].verifyStats.mean) / jwtTime).toFixed(2);
				output += ` | ${ratio}x`;
			} else {
				output += ` | N/A`;
			}
			
			console.log(output);
		}
	}
	
	// Token format analysis
	console.log('\n===== TOKEN FORMAT ANALYSIS =====');
	for (const [size, result] of Object.entries({
		verySmall: results.jwt_verySmall,
		small: results.jwt_small,
		medium: results.jwt_medium
	})) {
		console.log(`\nJWT (${size}):`);
		console.log(result.token);
		
		console.log(`\nHWTR-j (${size}):`);
		console.log(results[`hwtr_j_${size}`].token);
		
		console.log(`\nHWTR-jx (${size}):`);
		console.log(results[`hwtr_jx_${size}`].token);
	}
	
	console.log('\n===== END OF COMPARISON =====');
});
