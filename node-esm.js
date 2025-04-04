/*
 * support ES Modules in Nodejs, 
 * running modules like we might in browsers and Deno
 *
 * works in Nodejs 23
 * Nodejs 20.6 and up use --import and older use --experimental-loader:

	node --import './node-esm.mjs' ./your-script.js

	node --experimental-loader './node-esm.mjs' ./your-script.js

 * 
 * adapted from
 * https://nodejs.org/api/module.html#import-from-https
 *
 * */

import { request } from 'node:https';
import { register } from 'node:module';
import { URL } from 'node:url';

// Cache for loaded modules to avoid duplicate fetches
const moduleCache = new Map();

// Helper function to fetch URL with redirect support
function fetchWithRedirects(url, maxRedirects = 10) {
	// Return cached response if available
	if (moduleCache.has(url)) {
		return Promise.resolve(moduleCache.get(url));
	}
	
	return new Promise((resolve, reject) => {
		let redirectCount = 0;
		let finalUrl = url; // Keep track of the final URL after redirects
		
		const fetchUrl = (currentUrl) => {
			const parsedUrl = new URL(currentUrl);
			
			const options = {
				hostname: parsedUrl.hostname,
				path: parsedUrl.pathname + parsedUrl.search,
				method: 'GET',
				headers: {
					'User-Agent': 'Node.js ESM Loader',
					'Accept': '*/*'
				}
			};
			
			const req = request(options, (res) => {
				// Handle redirects
				if ([301, 302, 303, 307, 308].includes(res.statusCode) && 
					res.headers.location && redirectCount < maxRedirects) {
					
					redirectCount++;
					// Make the redirect URL absolute if it's relative
					const redirectUrl = new URL(res.headers.location, currentUrl).toString();
					
					// Add ?module parameter to unpkg.com URLs if not already present
					let enhancedRedirectUrl = redirectUrl;
					if (enhancedRedirectUrl.includes('unpkg.com') && !enhancedRedirectUrl.includes('module')) {
						enhancedRedirectUrl += (enhancedRedirectUrl.includes('?') ? '&' : '?') + 'module';
					}
					
					//console.log(`Redirecting (${redirectCount}): ${currentUrl} -> ${enhancedRedirectUrl}`);
					
					finalUrl = enhancedRedirectUrl; // Update final URL
					res.resume(); // Consume response data to free up memory
					fetchUrl(enhancedRedirectUrl);
					return;
				}
				
				// Handle successful response
				if (res.statusCode >= 200 && res.statusCode < 300) {
					let data = '';
					res.setEncoding('utf8');
					res.on('data', (chunk) => data += chunk);
					res.on('end', () => {
						// Store both the requested URL and final URL in cache
						const result = { source: data, finalUrl: finalUrl };
						moduleCache.set(url, result);
						moduleCache.set(finalUrl, result);
						resolve(result);
					});
					return;
				}
				
				// Handle errors
				res.resume(); // Consume response data to free up memory
				reject(new Error(`HTTP error ${res.statusCode} for ${currentUrl}`));
			});
			
			req.on('error', (err) => {
				reject(new Error(`Request error for ${currentUrl}: ${err.message}`));
			});
			
			req.end();
		};
		
		fetchUrl(url);
	});
}

// Fix relative imports in the source code
function resolveImports(source, baseUrl) {
	// Extract the directory part of the URL to use as base for relative imports
	const urlObj = new URL(baseUrl);
	const basePath = urlObj.href.substring(0, urlObj.href.lastIndexOf('/') + 1);
	
	// Replace import statements with resolved URLs
	return source.replace(/import\s+(?:(?:{[^}]*}|\*\s+as\s+[^;]*|[^;{]*)\s+from\s+)?['"]([^'"]+)['"]/g, 
		(match, importPath) => {
			// Already absolute URL
			if (importPath.startsWith('http://') || importPath.startsWith('https://')) {
				let enhancedUrl = importPath;
				// Add ?module parameter to unpkg.com URLs if not already present
				if (enhancedUrl.includes('unpkg.com') && !enhancedUrl.includes('?module')) {
					enhancedUrl += (enhancedUrl.includes('?') ? '&' : '?') + 'module';
				}
				return match.replace(importPath, enhancedUrl);
			}
			
			// Any relative path (including bare modules) are resolved against the base URL
			let resolvedUrl = new URL(importPath, basePath).toString();
			
			// Add ?module parameter to unpkg.com URLs if not already present
			if (resolvedUrl.includes('unpkg.com') && !resolvedUrl.includes('?module')) {
				resolvedUrl += (resolvedUrl.includes('?') ? '&' : '?') + 'module';
			}
			
			return match.replace(importPath, resolvedUrl);
		});
}

// Define the load hook function
export function load(url, context, nextLoad) {
	if (url.startsWith('https://')) {
		// Add ?module to unpkg URLs if not present
		let enhancedUrl = url;
		if (enhancedUrl.includes('unpkg.com') && !enhancedUrl.includes('?module')) {
			enhancedUrl += (enhancedUrl.includes('?') ? '&' : '?') + 'module';
		}
		
		return fetchWithRedirects(enhancedUrl)
			.then(result => {
				// Fix relative imports using the final URL after redirects
				const fixedSource = resolveImports(result.source, result.finalUrl);
				return {
					format: 'module',
					shortCircuit: true,
					source: fixedSource,
				};
			})
			.catch(error => {
				console.error(`Error loading ${url}:`, error.message);
				throw error;
			});
	}
	return nextLoad(url);
}

// Register the hook
register(import.meta.url, {
	load,
	// Simplified resolve hook - assume all specifiers are unpkg modules
	resolve(specifier, context, nextResolve) {
	
		// If it's already an https URL, just ensure it has ?module if it's unpkg
		if (specifier.startsWith('https://')) {
			if (specifier.includes('unpkg.com') && !specifier.includes('?module')) {
				specifier += (specifier.includes('?') ? '&' : '?') + 'module';
			}
			return {
				shortCircuit: true,
				url: specifier,
			};
		}
		
		// For built-in modules, use the default resolver
		if (specifier.startsWith('node:')) {
			return nextResolve(specifier, context);
		}
		
		// If parentURL exists and is an https URL, resolve relative to it
		if (context.parentURL && context.parentURL.startsWith('https://')) {
			const parentUrlObj = new URL(context.parentURL);
			const parentPath = parentUrlObj.href.substring(0, parentUrlObj.href.lastIndexOf('/') + 1);
			const resolvedUrl = new URL(specifier, parentPath).toString();
			
			// Add ?module parameter to unpkg.com URLs if not already present
			let enhancedUrl = resolvedUrl;
			if (enhancedUrl.includes('unpkg.com') && !enhancedUrl.includes('?module')) {
				enhancedUrl += (enhancedUrl.includes('?') ? '&' : '?') + 'module';
			}
			
			return {
				shortCircuit: true,
				url: enhancedUrl,
			};
		}
		
		// For the main entry point, convert to an unpkg URL
		return {
			shortCircuit: true,
			url: `https://unpkg.com/${specifier}?module`,
		};
	}
});
