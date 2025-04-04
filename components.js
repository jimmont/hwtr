const css = `
:host {
	display: block;
	font-family: var(--ff);
	--input-corner: 0.25rem;
}
header{display:flex;justify-content:space-between;align-items:center;}
header [icon="toggle"]{display:none;margin:1em;padding:1em;font-size:larger;font-weight:bold;transform: rotate(45deg);}
:host([collapsible]) header [icon="toggle"]{display:inline-block;}
:host([collapsed]) [icon="toggle"]{transform: rotate(0deg);}
form{
	display:flex;
	flex-direction:column;
}
:host([collapsed]) form{display:none;}
h1, h2, h3, h4, h5, h6{
	color: var(--text-color);
	font-size: 1rem;
	margin: 0.5em 0 0.5em 0;
	font-weight:bold;
	line-height: 1;
}
h5, h6{
	font-size: 0.7rem;
}

button{
	background-color: var(--primary-color);
	color: var(--warm-gray-900);
	padding: 0.5em 1em;
	border-radius: 0.4em;
	margin-block: 0.2em;
}

textarea {
	padding: 0.5em;
	box-sizing: border-box;
	border: 1px solid var(--border-color, #ccc);
	background-color: var(--input-bg, #fff);
	color: var(--text-color, #333);
	font-family: monospace;
	resize: vertical;
	min-height: 3em;
	width: 100%;
}

textarea.error {
	border-color: var(--error-color, #b91c1c);
}

textarea:focus {
	outline: 2px solid var(--primary-color, #FFCC00);
	border-color: transparent;
}

select {
	padding: 0.4em;
	border-radius: var(--input-corner);
	border: 1px solid var(--border-color, #ccc);
	background-color: var(--input-bg, #fff);
	color: var(--text-color, #333);
	margin-inline-end: 0.5rem;
}

input[type="number"] {
	width: 100px;
	padding: 0.5rem;
	border-radius: var(--input-corner);
	border: 1px solid var(--border-color, #ccc);
	background-color: var(--input-bg, #fff);
	color: var(--text-color, #333);
}

table{
	inline-size: clamp(320px, 35rem, calc(100vw - 2.5rem));
	margin-block: 0 1rem;
	table-layout: fixed;
	border-collapse: collapse;
}
tr{
	vertical-align: baseline;
}
th{
	color: var(--secondary-color);
}
th, td{ 
	text-align: end; 
	font-weight:normal;
}
:is(td,th):is(:nth-child(n):nth-child(-n+3)){
	text-align: start;
}
code[token]{
	display: inline-block;
	max-width: 98vw;
	line-break: anywhere;
}

`;

class HTMLShared extends HTMLElement {

	_toggleCollapse(){
		if(this.hasAttribute('collapsible')){
			this.toggleAttribute('collapsed');
		}
	}

	get collapsed(){
		return this.hasAttribute('collapsed');
	}

	set collapsed(val=false){
		if(val){
			this.setAttribute('collapsed', '');
		}else{
			this.removeAttribute('collapsed');
		}
	}

	prepare(data){
		let json;
		try{
			json = JSON.stringify(data);
			return data;
		}catch(error){
			const safe = this.convertBigIntsToStrings(data);
			return safe;
		}
	}

	convertBigIntsToStrings(obj){
		if (obj === null || typeof obj !== 'object') {
			return typeof obj === 'bigint' ? obj.toString() : obj;
		}
		if (Array.isArray(obj)) {
			return obj.map(item => this.convertBigIntsToStrings(item));
		}
		const result = {};
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				const value = obj[key];
				
				if (typeof value === 'bigint') {
					// Convert BigInt to string with 'n' suffix
					result[key] = value.toString() + 'n';
				} else if (typeof value === 'object' && value !== null) {
					// Recursively process nested objects and arrays
					result[key] = this.convertBigIntsToStrings(value);
				} else {
					// Copy other values as is
					result[key] = value;
				}
			}
		}
		
		return result;
	}


// Test function

	set data(value=null){
		this._data = value;
		this.view?.();
	}
	get data(){
		return this._data;
	}

	attributeChangedCallback(name, old, value){
		console.log(`attributeChangedCallback`,{name, old, value});
	}

	view(){
		cancelAnimationFrame(this._view);
		this._view = requestAnimationFrame(()=>{
			this.viewUpdate();
		});
	}

};

customElements.define('token-input', class TokenInput extends HTMLShared{
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.render();
		const { shadowRoot } = this;
		const list = shadowRoot.querySelectorAll('header, select, input, textarea');
		Array.from(list).forEach(node=>{
			const { name, localName } = node;
			if(localName==='header'){
				node.addEventListener('click', this._toggleCollapse.bind(this));
				return;
			}
			node.addEventListener('change', this._change.bind(this));
		});
	}

	viewUpdate(){
		const { data, shadowRoot } = this;
		const hiddenJSON = JSON.stringify( this.prepare(data?.hidden) );
		const visibleJSON = JSON.stringify( this.prepare(data?.visible) );

		if(hiddenJSON){
			shadowRoot.querySelector('[name="hidden"]').value = hiddenJSON;
		}
		if(visibleJSON){
			shadowRoot.querySelector('[name="visible"]').value = visibleJSON;
		}
		this._update();
	}

	_change(event){
		const { localName, name, value, form } = event.target;
		if(name === 'times'){
			form.elements.expires.value = value;
		}
		this._update();
	}

	_update(){
		const { expires, visible, hidden } = this.shadowRoot.querySelector('form').elements;
		const detail = {expires: Number(expires.value)};
		try{
			let val = visible.value.trim();
			detail.visible = val ? JSON.parse(val) : undefined;
			val = hidden.value.trim();
			detail.hidden =  val ? JSON.parse(val) : undefined;
			this.dispatchEvent(new CustomEvent('token-input', {detail, cancelable: true, composed: true, bubbles: true}));
		}catch(error){
			console.warn({error, detail});
		}
	}
	
	render() {
		this.shadowRoot.innerHTML = `
<style>${ css }</style>
<header><slot></slot> <span icon=toggle>+</span></header>
<form>
<div>
<label>Expiration:
<select name=times>
	<option value="1">1 second</option>
	<option value="5">5 seconds</option>
	<option value="30">30 seconds</option>
	<option value="60" selected>1 minute</option>
	<option value="300">5 minutes</option>
	<option value="3600">1 hour</option>
	<option value="28800">8 hours</option>
	<option value="86400">1 day</option>
	<option value="604800">7 days</option>
	<option value="2592000">30 days</option>
</select>
</label>
<label>
<input type="number" name=expires value="60" min="0">
<span>seconds</span>
</label>
</div>
<label>Visible Data (JSON) <span>This data goes in the token payload</span>
	<textarea name="visible" placeholder="Enter JSON data to be included in the token"></textarea>
</label>
<label>Hidden Data (JSON) <span>Optional data used for signing but not in the token</span>
	<textarea name="hidden" placeholder="Enter JSON data used for signing (not included in token)"></textarea>
</label>
</form>
		`;
	}
// {user: 'Norman Borlaugh', id: '1234'}
// {"deviceId": "abc123", "ip": "192.168.1.1"}	
	connectedCallback() {
		const { shadowRoot } = this;
		//globalThis.addEventListener('', this.h);
		if(this.hasOwnProperty('data')){
			console.warn(`data`,this.localName,this.data);
			debugger;
		}
		
	}
});

customElements.define('token-output', class TokenOutput extends HTMLShared {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.render();
		const { shadowRoot } = this;
		const list = shadowRoot.querySelectorAll('form, header, select, input, textarea');
		Array.from(list).forEach(node=>{
			const { name, localName } = node;
			switch(localName){
			case 'header':
				node.addEventListener('click', this._toggleCollapse.bind(this));
				return;
			case 'form':
				node.addEventListener('submit', this._submit.bind(this));
				return;
			}
			node.addEventListener('change', this._change.bind(this));
		});

		this._token = this._token.bind(this);
	}

	_submit(event){
		event.preventDefault();
		this._verify(this.data);
	}

	async _verify(data){
		const {expires, hwt,hwtr,hidden} = data;
		try{
			data.verify = await hwtr.verify(hwt, hidden);
			data.verifyText = JSON.stringify( this.prepare(data.verify) );
		}catch(error){
			console.error({error, hwt, hwtr, hidden});
			data.error = error;
		}
		this.data = data;
	}

	_token({detail, type}){
		this._verify(detail);
	}

	viewUpdate(){
		const { data = {}, shadowRoot } = this;
		const { hwt, hwtr, verify, verifyText, expires } = data;
		const format = hwtr.format;
		shadowRoot.querySelector('[name="token"]').value = hwt;
		shadowRoot.querySelector('[name="verify"]').value = verifyText;
		shadowRoot.querySelector('[format]').innerHTML = `format <b>${ format }</b>`;
		const exp = new Date(verify.expires * 1000);
		const iso = exp.toISOString();
		let node = shadowRoot.querySelector('[time]');
		node.title = iso;
		node.innerHTML = `expires (${ expires ?? '?' } seconds) <time datetime=${ iso }>${ exp.toLocaleString() }</time> 
		`;
	}

	_change(event){
		const { localName, name, value, form } = event.target;
		this._update();
	}

	_update(){
		const { token, verify } = this.shadowRoot.querySelector('form').elements;
		try{
			// TODO re-validate
		}catch(error){
			console.warn({error});
		}
	}
	
	render() {
		this.shadowRoot.innerHTML = `
<style>${ css }</style>
<header><slot></slot> <span icon=toggle>+</span></header>
<form>
<label>
	<textarea name="token" placeholder="token"></textarea>
</label>
<div> <span format></span> <span time></span> </div>
<div>
	<button>verify token</button> <span valid></span>
</div>
<label>
	<textarea readonly name="verify" placeholder="verified output"></textarea>
</label>
</form>
		`;
	}
	connectedCallback() {
		globalThis.addEventListener('token', this._token);
		if(this.hasOwnProperty('data')){
			console.warn(`data`,this.localName,this.data);
		}
	}
	disconnectedCallback(){
		globalThis.removeEventListener('token', this._token);
	}
});

customElements.define('token-profile', class TokenProfile extends HTMLShared {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.render();
		const { shadowRoot } = this;
		const list = shadowRoot.querySelectorAll('form, header, select, input, textarea');
		Array.from(list).forEach(node=>{
			const { name, localName } = node;
			switch(localName){
			case 'form':
				node.addEventListener('submit', this._submit.bind(this));
				return;
			}
			node.addEventListener('change', this._change.bind(this));
		});

		this._token = this._token.bind(this);
	}

	_submit(event){
		event.preventDefault();
		requestAnimationFrame(()=>{
			this.profile();
		});
	}

	get iterations(){
		return Number(this.shadowRoot.querySelector('form').elements.iterations.value);
	}
	get payload(){
		let index = this.shadowRoot.querySelector('form').elements.payload.selectedIndex;
		if(index < 0){
			this.shadowRoot.querySelector('form').elements.payload.selectedIndex = 0;
			return 0;
		}
		return index;
	}
	set payload(index=0){
		return this.shadowRoot.querySelector('form').elements.payload.selectedIndex = index;
	}

	payloads = [
		{visible: {user: 'Norman Borlaugh', id: 1234}}
		,{visible: {user: 'Norman Borlaugh', id: 1234}, hidden: {"deviceId": "abc123", "ip": "192.168.1.1"}}
		,{visible: {user: 'Norman Borlaugh', id: 1234, "deviceId": "abc123", "ip": "192.168.1.1", list: ['abc','def','hij','klm','nop','qrs','tuv','wxy','z'], claims:{first:'first claim', second: 'second claim', third: 'third claim', fourth: crypto.randomUUID(), fifth: crypto.randomUUID(), sixth: crypto.randomUUID(), seventh: crypto.randomUUID()}, n: Date.now(), m: Date.now()}}
		,{visible: {user: 'Norman Borlaugh', id: 1234, now: new Date(), bigint: 1n, set: new Set([1,2,3]), map: new Map([[4,'5'],['6',7]]), uint8: new Uint8Array([7,8,9])}}
		,{visible: {user: 'Norman Borlaugh', id: 1234}, hidden: {now: new Date(), bigint: 7n, set: new Set([1,2,3]), uint8: new Uint8Array([7,8,9]), bigint: 1n, map: new Map([[4,'5'],['6',7]]), uint8: new Uint8Array([8,1,0])}}
	];

	async profile(data={}, iterations=this.iterations, warmup=1234){
		if(this.busy) return;
		this.busy = true;
		let {expires, expiresAt, visible, hidden, hwt, hwtr, tokenFactory=this.tokenFactory} = data;
		if(!tokenFactory){
			return;
		}
		if(!this.tokenFactory){
			this.tokenFactory = tokenFactory;
		}
		const sample = this.payloads[this.payload];
		visible = sample.visible;
		hidden = sample.hidden;
		expires = 10;
		expiresAt = Date.now() / 1000 + 10;

		const safeVisible = this.prepare(visible);
		const safeHidden = this.prepare(hidden);

		if(isNaN(iterations)){
			iterations = 5;
		}
		const perf = await Promise.all(Object.entries(tokenFactory).map(async ([format,factory])=>{
			let item = {format, factory};
			let vis = visible;
			let hid = hidden;
			let exp = expires;
			if(/^(j|jwt|mp)$/.test(format)){
				if(format === 'jwt'){
					exp = expiresAt;
				}
				vis = safeVisible;
				hid = safeHidden;
			}
			item.input = {visible: vis, hidden: hid, expires: exp};
			try{
				item.both = await this.benchmark(async ()=>{
						let token;
						token = await factory.createWith(exp, vis, hid);
						await factory.verify(token, hid);
						token = await factory.createWith(exp, vis, hid);
						await factory.verify(token, hid);
						token = await factory.createWith(exp, vis, hid);
						return factory.verify(token, hid);
					}, warmup);
				item.create = await this.benchmark(async ()=>{
						return factory.createWith(exp, vis, hid);
					}, iterations);
				const token = item.create.lastResult;
				item.verify = await this.benchmark(async ()=>{
						return factory.verify(token, hid);
					}, iterations);
				item.both = await this.benchmark(async ()=>{
						const token = await factory.createWith(exp, vis, hid);
						return factory.verify(token, hid);
					}, iterations);
			}catch(error){
				item.error = error;
			}
			return item;
		}));
		this.busy = false;
		this.data = {perf};
	}

	_token({detail, type}){
		requestAnimationFrame(()=>{
			this.profile(detail);
		});
	}

	viewUpdate(){
		const { data = {}, shadowRoot } = this;
		const perf = data?.perf;
		let node;
		if(!perf?.length){
			shadowRoot.querySelector('[perf-token-format]').innerHTML = ``;
			shadowRoot.querySelector('[perf-hwt-jwt]').innerHTML = ``;
		}else{
			const dict = perf.reduce((dict, perf)=>{
				dict[perf.format] = perf;
				return dict;
			}, {});
			shadowRoot.querySelector('[perf-token-format]').innerHTML = [dict.j, dict.jx, dict.mp, dict.cb].map(this._result).join(' ');
			shadowRoot.querySelector('[perf-hwt-jwt]').innerHTML = [dict.j, dict.jwt].map(this._result).join(' ');
		}
	}

	_result(perf){
			const { format, input, create, verify, both, error } = perf;

			const result = verify?.lastResult ?? null;

			console.log(`performance result for "${ format }"`, result, {input, format, create, verify, both, error});

			if(error){
				return `<tr><td>${ format }</td><td colspan=5>${ error.message }</td></tr>`;
			}
			const token = create.lastResult;
			const sigfig = 3;
			return `<tr>
			<td>${ format }</td>
			<td>${ result?.ok !== false && !token?.error ? '+':'-' }</td>
			<td>${ token.length }</td>
			<td>${ create.averageTime.toFixed(sigfig) }</td>
			<td>${ verify.averageTime.toFixed(sigfig) }</td>
			<td>${ both.averageTime.toFixed(sigfig) }</td>
			</tr><tr>
			<td title="${ format } token" colspan=6><code token>${ token }</code></td>
			</tr>`;
	}

	_change(event){
		const { localName, name, value, form } = event.target;
		this._update();
	}

	_update(){
		const { token, verify } = this.shadowRoot.querySelector('form').elements;
		try{
			// TODO re-validate
		}catch(error){
			console.warn({error});
		}
	}

	async benchmark(fn, iterations){
		let lastResult;
		
		const start = performance.now();
		for (let i = 0; i < iterations; i++) {
			lastResult = await fn();
		}
		const end = performance.now();
		
		const totalTime = end - start;
		
		return {
			averageTime: totalTime / iterations,
			totalTime,
			iterations,
			lastResult
		};
	};
	
	render() {
		this.shadowRoot.innerHTML = `
<style>${ css } </style>
<slot></slot>
<form>
<div>
<label>iterations
<select name=iterations>
	<option value="5" selected>5</option>
	<option value="100">100</option>
	<option value="500">500</option>
	<option value="1000">1000</option>
	<option value="5000">5000</option>
</select>
</label>
<label>
<select name=payload>
	<option value="0" selected title="payload from above demo">payload</option>
	<option value="1" title="payload with hidden data used for signing">payload+hidden</option>
	<option value="2" title="payload with no hidden data">payload midsize</option>
	<option value="3" title="payload of complex data types (Set, Map, etc)">complex types</option>
	<option value="4" title="payload of complex data types (Set, Map, etc)">complex types+hidden</option>
</select>
<span tip></span>
</label>

<button>run</button>
</div>
</form>

<slot name=format></slot>
<h6>times in milliseconds</h6>
<table>
<colgroup>
	<col style="width: 4em">
	<col style="width: 3em">
	<col style="width: auto">
	<col style="width: 4em">
	<col style="width: 4em">
	<col style="width: 4em">
</colgroup>
<thead>
	<tr> <th>format</th> <th>valid</th> <th>size</th> <th>create</th> <th>verify</th> <th>both</th> </tr>
</thead>
<tbody perf-token-format> </tbody>
</table>

<slot name=hwt-jwt></slot>
<h6>times in milliseconds</h6>
<table>
<colgroup>
	<col style="width: 4em">
	<col style="width: 3em">
	<col style="width: auto">
	<col style="width: 4em">
	<col style="width: 4em">
	<col style="width: 4em">
</colgroup>

<thead>
	<tr> <th>format</th> <th>valid</th> <th>size</th> <th>create</th> <th>verify</th> <th>both</th> </tr>
</thead>
<tbody perf-hwt-jwt> </tbody>
</table>

		`;
	}
	connectedCallback() {
		globalThis.addEventListener('token', this._token);
	}
	disconnectedCallback(){
		globalThis.removeEventListener('token', this._token);
	}
});

