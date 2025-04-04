// codec_benchmark.js
import { formats } from './hwtr.formats.js';

const codecs = formats;

// Complex test object with all special types
const testObj = {
	str: "Hello world",
	num: 42,
	date: new Date(),
	bigint: BigInt("9007199254740991"),
	set: new Set([1, 2, 3, new Date()]),
	map: new Map([["a", 1], ["b", new Date()]]),
	typedArray: new Uint8Array([1, 2, 3, 4, 5]),
	buffer: (() => {
		const b = new ArrayBuffer(10);
		new Uint8Array(b).set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		return b;
	})()
};

// Test datasets with different types of data
const testCases = {
	basic: testObj,
	"simple": {
		string: "Hello, world!",
		number: 42,
		boolean: true,
		null: null,
		array: [1, 2, 3, 4, 5],
		object: { a: 1, b: 2, c: 3 }
	},
	"dates": {
		singleDate: new Date(),
		multipleDates: [new Date(), new Date(2000, 0, 1), new Date(1980, 5, 12)]
	},
	"collections": {
		set: new Set([1, 2, 3, 4, 5]),
		map: new Map([["a", 1], ["b", 2], ["c", 3]]),
		nestedCollections: new Map([
			["set", new Set([1, 2, 3])],
			["dates", new Set([new Date(), new Date(2000, 0, 1)])],
		])
	},
	"typedArrays": {
		int8Array: new Int8Array([2, 1, 1, 3, 2]),
		uint8Array: new Uint8Array([1, 3, 3, 3, 3]),
		int32Array: new Int32Array([1, 4, 4, 4, 5]),
		float64Array: new Float64Array([1.1, 2.2, 3.3, 4.4, 5.5])
	},
	"bigInts": {
		singleBigInt: BigInt("9007199254740991"),
		multipleBigInts: [BigInt("1"), BigInt("9007199254740991"), BigInt("2")]
	},
	"arrayBuffers": {
		small: (() => {
			const buffer = new ArrayBuffer(10);
			const view = new Uint8Array(buffer);
			for (let i = 0; i < view.length; i++) view[i] = i;
			return buffer;
		})(),
		medium: (() => {
			const buffer = new ArrayBuffer(100);
			const view = new Uint8Array(buffer);
			for (let i = 0; i < view.length; i++) view[i] = i % 256;
			return buffer;
		})()
	},
	"mixed": {
		everything: {
			string: "test",
			number: 42,
			date: new Date(),
			set: new Set([1, 2, 3]),
			map: new Map([["a", 1], ["b", new Date()], ["c", new Set([1, 2, 3])]]),
			typedArray: new Uint8Array([1, 2, 3, 4, 5]),
			bigInt: BigInt("9007199254740991"),
			arrayBuffer: (() => {
				const buffer = new ArrayBuffer(20);
				const view = new Uint8Array(buffer);
				for (let i = 0; i < view.length; i++) view[i] = i;
				return buffer;
			})()
		}
	},
	"largeData": {
		// Create a large object with many properties
		largeObject: (() => {
			const obj = {};
			for (let i = 0; i < 100; i++) {
				obj[`prop${i}`] = i % 5 === 0 ? new Date() :
								i % 7 === 0 ? new Set([i, i+1, i+2]) :
								i % 11 === 0 ? new Map([["key", i]]) :
								i % 13 === 0 ? BigInt(i) :
								i % 17 === 0 ? new Uint8Array([i % 256]) :
								i;
			}
			return obj;
		})()
	}
};

const SAFE_testCases = Object.entries(testCases).reduce((data, [key, val])=>{
	data[key] = convertBigIntsToStrings(val);
	return data;
}, {});

/**
 * Recursively converts BigInt values to strings in an object
 * @param {Object|Array} obj - The object to process
 * @return {Object|Array} A new object with BigInt values converted to strings
 */
function convertBigIntsToStrings(obj){
	// Return the value directly if it's not an object or is null
	if (obj === null || typeof obj !== 'object') {
		return typeof obj === 'bigint' ? obj.toString() : obj;
	}

	// Handle arrays
	if (Array.isArray(obj)) {
		return obj.map(item => convertBigIntsToStrings(item));
	}

	// Handle objects
	const result = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const value = obj[key];
			
			if (typeof value === 'bigint') {
				// Convert BigInt to string with 'n' suffix
				result[key] = value.toString() + 'n';
			} else if (typeof value === 'object' && value !== null) {
				// Recursively process nested objects and arrays
				result[key] = convertBigIntsToStrings(value);
			} else {
				// Copy other values as is
				result[key] = value;
			}
		}
	}
	
	return result;
};

// Test function
function testCodec(name, codec) {
	console.log(`\nTesting codec: ${name}`);
	
	const testObj = name === 'j' ? SAFE_testCases.basic :  testCases.basic;

	// Measure encoding
	const start1 = performance.now();
	const encoded = codec.encode(testObj);
	const end1 = performance.now();
	
	console.log(`Encode time: ${(end1 - start1).toFixed(3)} ms`);
	console.log(`Encoded size: ${encoded.byteLength} bytes`);
	
	// Measure decoding
	const start2 = performance.now();
	const decoded = codec.decode(encoded);
	const end2 = performance.now();
	
	console.log(`Decode time: ${(end2 - start2).toFixed(3)} ms`);
	
	// Check if all properties are present
	const props = Object.keys(testObj);
	const decodedProps = Object.keys(decoded);
	console.log(`Properties preserved: ${props.length === decodedProps.length}`);
	
	// Print a sample of the encoded data
	const jsonStr = new TextDecoder().decode(encoded);
	console.log(`Sample of encoded data: ${jsonStr}`);
	
	return {
		encodeTime: end1 - start1,
		decodeTime: end2 - start2,
		size: encoded.byteLength
	};
}

function makeSafe(key, value){

}

// Benchmark function
async function runBenchmark(_codecs_=codecs, iterations=7) {
	
	const results = {};
	
	console.log(`Running benchmark... ${ iterations } iterations`);
	
	for (const [fmt, codec] of Object.entries(_codecs_)) {
		console.log(`Testing codec: ${fmt}`);
		results[fmt] = {
			encoding: { time: {}, size: {} },
			decoding: { time: {} },
			roundTrip: {}
		};

		const _testCases_ = fmt === 'j' ? SAFE_testCases : testCases;
		
		for (const [caseName, testData] of Object.entries(_testCases_)) {
			console.log(`  Case: ${caseName}`);
			
			// Measure encoding time (average of 5 runs)
			let totalEncodeTime = 0;
			let encoded;

			for (let i = 0; i < iterations; i++) {
				const encodeStart = performance.now();
				encoded = codec.encode(testData);
				const encodeEnd = performance.now();
				totalEncodeTime += (encodeEnd - encodeStart);
			}
			
			// Measure encoded size
			const encodedSize = encoded.byteLength;
			
			// Measure decoding time (average of 5 runs)
			let totalDecodeTime = 0;
			let decoded;
			
			for (let i = 0; i < iterations; i++) {
				const decodeStart = performance.now();
				decoded = codec.decode(encoded);
				const decodeEnd = performance.now();
				totalDecodeTime += (decodeEnd - decodeStart);
			}
			
			// Verify round-trip integrity
			let roundTripOk = false;
			try {
				// For complex objects, we need to check structure equivalence
				// This is a simplified check - you might need more thorough testing
				const json1 = JSON.stringify(testData, (k, v) => 
					typeof v === 'bigint' ? v.toString() : 
					v instanceof ArrayBuffer ? 'ArrayBuffer' : 
					ArrayBuffer.isView(v) ? v.constructor.name : v);
				
				const json2 = JSON.stringify(decoded, (k, v) => 
					typeof v === 'bigint' ? v.toString() : 
					v instanceof ArrayBuffer ? 'ArrayBuffer' : 
					ArrayBuffer.isView(v) ? v.constructor.name : v);
				
				roundTripOk = json1 === json2;
				if(!roundTripOk){
					console.warn(`NOTE mismatch:`,json1.length, json2.length, {roundTripOk, json1, json2});
				}
			} catch (e) {
				roundTripOk = false;
				console.error(`Error checking round-trip for ${fmt}, ${caseName}:`, e);
			}
			
			// Store results
			results[fmt].encoding.time[caseName] = totalEncodeTime / iterations;
			results[fmt].encoding.size[caseName] = encodedSize;
			results[fmt].decoding.time[caseName] = totalDecodeTime / iterations;
			results[fmt].roundTrip[caseName] = roundTripOk;
		}
	}
	
	return results;
}

// Format and display results
function formatResults(results) {
	// Create tables for encoding time
	console.log("\n=== ENCODING TIME (ms) ===");
	console.table(Object.entries(results).reduce((table, [codecName, data]) => {
		table[codecName] = data.encoding.time;
		return table;
	}, {}));
	
	// Create tables for decoding time
	console.log("\n=== DECODING TIME (ms) ===");
	console.table(Object.entries(results).reduce((table, [codecName, data]) => {
		table[codecName] = data.decoding.time;
		return table;
	}, {}));
	
	// Create tables for encoded size
	console.log("\n=== ENCODED SIZE (bytes) ===");
	console.table(Object.entries(results).reduce((table, [codecName, data]) => {
		table[codecName] = data.encoding.size;
		return table;
	}, {}));
	
	// Report on round-trip integrity
	console.log("\n=== ROUND-TRIP INTEGRITY ===");
	console.table(Object.entries(results).reduce((table, [codecName, data]) => {
		table[codecName] = data.roundTrip;
		return table;
	}, {}));
	
	// Calculate total metrics
	const totalMetrics = Object.entries(results).reduce((summary, [codecName, data]) => {
		// Calculate totals
		summary[codecName] = {
			encodeTime: Object.values(data.encoding.time).reduce((sum, t) => sum + t, 0),
			decodeTime: Object.values(data.decoding.time).reduce((sum, t) => sum + t, 0),
			size: Object.values(data.encoding.size).reduce((sum, s) => sum + s, 0),
			roundTripSuccess: Object.values(data.roundTrip).every(Boolean)
		};
		return summary;
	}, {});
	
	console.log("\n=== SUMMARY ===");
	console.table(totalMetrics);
	
	// Calculate relative performance
	const baseline = "j"; // Compare against standard JSON
	const relativePerformance = Object.entries(totalMetrics).reduce((summary, [codecName, metrics]) => {
		if (codecName === baseline) {
			summary[codecName] = {
				encodeTime: "100%",
				decodeTime: "100%",
				size: "100%"
			};
		} else {
			summary[codecName] = {
				encodeTime: `${(metrics.encodeTime / totalMetrics[baseline].encodeTime * 100).toFixed(1)}%`,
				decodeTime: `${(metrics.decodeTime / totalMetrics[baseline].decodeTime * 100).toFixed(1)}%`,
				size: `${(metrics.size / totalMetrics[baseline].size * 100).toFixed(1)}%`
			};
		}
		return summary;
	}, {});
	
	console.log("\n=== RELATIVE PERFORMANCE (compared to 'j') ===");
	console.table(relativePerformance);
}


Deno.test("Quick Codec Performance Test", async () => {
	// Run tests
	console.log("=== Quick Codec Performance Test ===");
	const results = {};

	for (const [name, codec] of Object.entries(codecs)) {
		results[name] = testCodec(name, codec);
	}

	// Print comparison
	console.log("\n=== COMPARISON (relative to standard JSON) ===");
	const baseline = results.j;

	for (const [name, metrics] of Object.entries(results)) {
		if (name === "j") continue;
		
		console.log(`\n${name} vs j (standard JSON):`);
		console.log(`Encoding: ${(metrics.encodeTime / baseline.encodeTime * 100).toFixed(1)}%`);
		console.log(`Decoding: ${(metrics.decodeTime / baseline.decodeTime * 100).toFixed(1)}%`);
		console.log(`Size: ${(metrics.size / baseline.size * 100).toFixed(1)}%`);
	}

	console.log("\nTest complete!");

});

// Run as Deno test
Deno.test("Codec Performance Benchmark", async () => {

	const results = await runBenchmark(codecs, 747);
	formatResults(results);
});

