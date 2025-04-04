/*
 * deno test --allow-import ./hwtr.test.deno.js
 *
 * */
import { assert, assertRejects } from "https://jsr.io/@std/assert/1.0.12/mod.ts";
//"jsr:@std/assert";
import Hwtr from './hwtr.js';
import { formats, codecJSON, codecJSONextended } from './hwtr.formats.js';
//import Jwtr from './jwtr.js';

for(const fmt in formats){
	Hwtr.registerFormat(fmt, formats[fmt]);
}
// for simple payloads use the default JSON
// Hwtr.registerFormat('j', codecJSON);
// recommended for complex types BigInt, Date, Map, Set, TypedArray, ArrayBuffer and should result in smaller tokens for this
// Hwtr.registerFormat('jx', codecJSONextended);
globalThis.assert = assert;
globalThis.assertRejects = assertRejects;
/*
const keys = await Hwtr.generateKeys();
console.log(keys);
*/

// fast
import('./hwtr.test.js');
import('./hwtr.test.formats.js');
// slow
import('./hwtr.test.perf.js');
//import('./hwtr.comparison.js');
