/* run this:
 * node --import ./node-esm.js hwtr.test.node.js
 */
class TestRunner {
	#queue = [];
	#runPromise = null;
	#results = [];
	test(name, fn) {
		this.#queue.push({ name, fn });
		return this;
	}
	run() {
		if (this.#runPromise) {
			return this.#runPromise;
		}
		this.#runPromise = this.#executeTests().finally(() => {
			this.#runPromise = null;
		});
		return this.#runPromise;
	}
	async #executeTests() {
		this.#results = [];
		console.log(`Running ${this.#queue.length} tests sequentially...\n`);
		const startTime = performance.now();
		for (const test of this.#queue) {
			await this.#runTest(test);
		}
		const duration = performance.now() - startTime;
		return this.#summarizeResults(duration);
	}
	async #runTest(test) {
		const result = {
			name: test.name,
			status: "running",
			error: null,
			duration: 0
		};
		console.log(`• Running: ${test.name}`);
		const startTime = performance.now();
		try {
			await Promise.resolve(test.fn());
			result.status = "passed";
		} catch (error) {
			result.status = "failed";
			result.error = error;
			console.error(`  ✗ ${error.message}`);
		}
		result.duration = performance.now() - startTime;
		this.#results.push(result);
		console.log(`  ${result.status === "passed" ? "✓" : "✗"} ${test.name} (${result.duration.toFixed(2)}ms)\n`);
	}
	#summarizeResults(duration) {
		const total = this.#results.length;
		const results = this.#results;
		const summary = results.reduce((res, r)=>{
			res[r.status]?.push?.(r);
			return res;
		}, {passed:[], failed:[], duration, total: results.length});
		const pass = summary.passed.length;
		const fail = summary.failed.length;
		console.log("Test Summary:");
		console.log(`Total: ${total}, Passed: ${pass}, Failed: ${fail}`);

		if (fail > 0) {
			console.log("\nFailed Tests:");
			summary.failed.forEach(r => {
				console.log(`  ✗ ${r.name}`);
				console.log(`    ${r.error.message}`);
			});
		}

		return summary;
	}
};

async function run() {

	const testRunnder = new TestRunner();

	const Deno = {test: testRunnder.test.bind(testRunnder)};
	// console.log(typeof Deno.test, {Deno});

	globalThis.Deno = Deno;
	globalThis.assert = (truthy, expl)=>{
		console.assert(truthy, expl);
		if(!truthy){
			throw new Error(expl);
		}
	}
	globalThis.assertRejects = async function assertRejects(fn, Cls, msg){
		try{
			const result = await fn();
			assert(false, `expected rejection error ${ Cls } (${ msg }), got ${ result }`);
		}catch(error){
			const instance = error instanceof Cls;
			const expectedMessage = error.message.indexOf( msg ) > -1;
			assert(instance && expectedMessage, `instanceof ${ Cls } and error.message "${ error.message }" expected to be "${ msg }"`);
		};
	}


	Deno.test('testing in Nodejs... ', ()=>{
		assert(true, 'true');
	});

	await import('./hwtr.test.js');
	await import('./hwtr.test.formats.js');
	await import('./hwtr.test.perf.js');
	//await import('./hwtr.comparison.js');

	return await testRunnder.run()
	.then(results=>{
		const {duration, passed, failed, total} = results;
		const time = (duration/1000).toFixed(1) * 1;
		console.log(`
ok ${ total } tests: ${ passed.length } passed; ${ failed.length } failed (${time}s)
`);
		return results;
	})
	.catch(res=>{
		console.error(res);
		return res;
	})
	.finally(()=>{
		console.log(`
... 🚀 
`);
	});
}

run();
