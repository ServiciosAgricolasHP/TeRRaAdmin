import{c as G,u as Ye,a as ja,r as K,j as f,L as ee,b as Sa,d as Ea,h as Ta,e as Ra,f as Aa}from"./index-CwUBbyS8.js";const qe=/<!--\s*preguntas:([\s\S]*?)-->/gi;function _e(n){return String(n||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")}function Pe(n){const e=[];for(const a of n.matchAll(qe))for(const o of a[1].split(";")){const r=o.trim();r&&e.push(r)}return e}const Ie=n=>n.replace(qe,"").replace(/\n{3,}/g,`

`).trim();function Ke(n){return String(n||"").replace(qe," ").replace(/!\[[^\]]*\]\([^)]*\)/g," ").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/\*\*([^*]+)\*\*/g,"$1").replace(/`([^`]+)`/g,"$1").replace(/[>#|]/g," ").replace(/^\s*[-+]\s+/gm," ").replace(/^\s*\d+\.\s+/gm," ").replace(/\s+/g," ").trim()}function La(n,e){const a=String(e||"").replace(/\r\n/g,`
`).split(`
`);let o=n;const r=[],s=[];let t=null;for(const i of a){const c=/^# (.+)$/.exec(i),d=/^## (.+)$/.exec(i);c&&!t&&r.length===0?o=c[1].trim():d?(t={title:d[1].trim(),lines:[]},s.push(t)):t?t.lines.push(i):r.push(i)}const l=r.join(`
`),u=new Set;return{id:n,title:o,intro:Ie(l),questions:Pe(l),sections:s.map(i=>{const c=i.lines.join(`
`);let d=_e(i.title)||"seccion";for(let m=2;u.has(d);m++)d=`${_e(i.title)}-${m}`;return u.add(d),{id:d,title:i.title,body:Ie(c),questions:Pe(c)}})}}const Ca="ENTRIES",ea="KEYS",aa="VALUES",R="";class te{constructor(e,a){const o=e._tree,r=Array.from(o.keys());this.set=e,this._type=a,this._path=r.length>0?[{node:o,keys:r}]:[]}next(){const e=this.dive();return this.backtrack(),e}dive(){if(this._path.length===0)return{done:!0,value:void 0};const{node:e,keys:a}=M(this._path);if(M(a)===R)return{done:!1,value:this.result()};const o=e.get(M(a));return this._path.push({node:o,keys:Array.from(o.keys())}),this.dive()}backtrack(){if(this._path.length===0)return;const e=M(this._path).keys;e.pop(),!(e.length>0)&&(this._path.pop(),this.backtrack())}key(){return this.set._prefix+this._path.map(({keys:e})=>M(e)).filter(e=>e!==R).join("")}value(){return M(this._path).node.get(R)}result(){switch(this._type){case aa:return this.value();case ea:return this.key();default:return[this.key(),this.value()]}}[Symbol.iterator](){return this}}const M=n=>n[n.length-1],za=(n,e,a)=>{const o=new Map;if(e===void 0)return o;const r=e.length+1,s=r+a,t=new Uint8Array(s*r).fill(a+1);for(let l=0;l<r;++l)t[l]=l;for(let l=1;l<s;++l)t[l*r]=l;return na(n,e,a,o,t,1,r,""),o},na=(n,e,a,o,r,s,t,l)=>{const u=s*t;e:for(const i of n.keys())if(i===R){const c=r[u-1];c<=a&&o.set(l,[n.get(i),c])}else{let c=s;for(let d=0;d<i.length;++d,++c){const m=i[d],p=t*c,b=p-t;let h=r[p];const g=Math.max(0,c-a-1),q=Math.min(t-1,c+a);for(let v=g;v<q;++v){const j=m!==e[v],x=r[b+v]+ +j,E=r[b+v+1]+1,k=r[p+v]+1,T=r[p+v+1]=Math.min(x,E,k);T<h&&(h=T)}if(h>a)continue e}na(n.get(i),e,a,o,r,c,t,l+i)}};class P{constructor(e=new Map,a=""){this._size=void 0,this._tree=e,this._prefix=a}atPrefix(e){if(!e.startsWith(this._prefix))throw new Error("Mismatched prefix");const[a,o]=ae(this._tree,e.slice(this._prefix.length));if(a===void 0){const[r,s]=we(o);for(const t of r.keys())if(t!==R&&t.startsWith(s)){const l=new Map;return l.set(t.slice(s.length),r.get(t)),new P(l,e)}}return new P(a,e)}clear(){this._size=void 0,this._tree.clear()}delete(e){return this._size=void 0,_a(this._tree,e)}entries(){return new te(this,Ca)}forEach(e){for(const[a,o]of this)e(a,o,this)}fuzzyGet(e,a){return za(this._tree,e,a)}get(e){const a=pe(this._tree,e);return a!==void 0?a.get(R):void 0}has(e){const a=pe(this._tree,e);return a!==void 0&&a.has(R)}keys(){return new te(this,ea)}set(e,a){if(typeof e!="string")throw new Error("key must be a string");return this._size=void 0,le(this._tree,e).set(R,a),this}get size(){if(this._size)return this._size;this._size=0;const e=this.entries();for(;!e.next().done;)this._size+=1;return this._size}update(e,a){if(typeof e!="string")throw new Error("key must be a string");this._size=void 0;const o=le(this._tree,e);return o.set(R,a(o.get(R))),this}fetch(e,a){if(typeof e!="string")throw new Error("key must be a string");this._size=void 0;const o=le(this._tree,e);let r=o.get(R);return r===void 0&&o.set(R,r=a()),r}values(){return new te(this,aa)}[Symbol.iterator](){return this.entries()}static from(e){const a=new P;for(const[o,r]of e)a.set(o,r);return a}static fromObject(e){return P.from(Object.entries(e))}}const ae=(n,e,a=[])=>{if(e.length===0||n==null)return[n,a];for(const o of n.keys())if(o!==R&&e.startsWith(o))return a.push([n,o]),ae(n.get(o),e.slice(o.length),a);return a.push([n,e]),ae(void 0,"",a)},pe=(n,e)=>{if(e.length===0||n==null)return n;for(const a of n.keys())if(a!==R&&e.startsWith(a))return pe(n.get(a),e.slice(a.length))},le=(n,e)=>{const a=e.length;e:for(let o=0;n&&o<a;){for(const s of n.keys())if(s!==R&&e[o]===s[0]){const t=Math.min(a-o,s.length);let l=1;for(;l<t&&e[o+l]===s[l];)++l;const u=n.get(s);if(l===s.length)n=u;else{const i=new Map;i.set(s.slice(l),u),n.set(e.slice(o,o+l),i),n.delete(s),n=i}o+=l;continue e}const r=new Map;return n.set(e.slice(o),r),r}return n},_a=(n,e)=>{const[a,o]=ae(n,e);if(a!==void 0){if(a.delete(R),a.size===0)oa(o);else if(a.size===1){const[r,s]=a.entries().next().value;ra(o,r,s)}}},oa=n=>{if(n.length===0)return;const[e,a]=we(n);if(e.delete(a),e.size===0)oa(n.slice(0,-1));else if(e.size===1){const[o,r]=e.entries().next().value;o!==R&&ra(n.slice(0,-1),o,r)}},ra=(n,e,a)=>{if(n.length===0)return;const[o,r]=we(n);o.set(r+e,a),o.delete(r)},we=n=>n[n.length-1],xe="or",sa="and",Pa="and_not";class D{constructor(e){if(e?.fields==null)throw new Error('MiniSearch: option "fields" must be provided');const a=e.autoVacuum==null||e.autoVacuum===!0?ue:e.autoVacuum;this._options={...ce,...e,autoVacuum:a,searchOptions:{...$e,...e.searchOptions||{}},autoSuggestOptions:{...Ma,...e.autoSuggestOptions||{}}},this._index=new P,this._documentCount=0,this._documentIds=new Map,this._idToShortId=new Map,this._fieldIds={},this._fieldLength=new Map,this._avgFieldLength=[],this._nextId=0,this._storedFields=new Map,this._dirtCount=0,this._currentVacuum=null,this._enqueuedVacuum=null,this._enqueuedVacuumConditions=ge,this.addFields(this._options.fields)}add(e){const{extractField:a,stringifyField:o,tokenize:r,processTerm:s,fields:t,idField:l}=this._options,u=a(e,l);if(u==null)throw new Error(`MiniSearch: document does not have ID field "${l}"`);if(this._idToShortId.has(u))throw new Error(`MiniSearch: duplicate ID ${u}`);const i=this.addDocumentId(u);this.saveStoredFields(i,e);for(const c of t){const d=a(e,c);if(d==null)continue;const m=r(o(d,c),c),p=this._fieldIds[c],b=new Set(m).size;this.addFieldLength(i,p,this._documentCount-1,b);for(const h of m){const g=s(h,c);if(Array.isArray(g))for(const q of g)this.addTerm(p,i,q);else g&&this.addTerm(p,i,g)}}}addAll(e){for(const a of e)this.add(a)}addAllAsync(e,a={}){const{chunkSize:o=10}=a,r={chunk:[],promise:Promise.resolve()},{chunk:s,promise:t}=e.reduce(({chunk:l,promise:u},i,c)=>(l.push(i),(c+1)%o===0?{chunk:[],promise:u.then(()=>new Promise(d=>setTimeout(d,0))).then(()=>this.addAll(l))}:{chunk:l,promise:u}),r);return t.then(()=>this.addAll(s))}remove(e){const{tokenize:a,processTerm:o,extractField:r,stringifyField:s,fields:t,idField:l}=this._options,u=r(e,l);if(u==null)throw new Error(`MiniSearch: document does not have ID field "${l}"`);const i=this._idToShortId.get(u);if(i==null)throw new Error(`MiniSearch: cannot remove document with ID ${u}: it is not in the index`);for(const c of t){const d=r(e,c);if(d==null)continue;const m=a(s(d,c),c),p=this._fieldIds[c],b=new Set(m).size;this.removeFieldLength(i,p,this._documentCount,b);for(const h of m){const g=o(h,c);if(Array.isArray(g))for(const q of g)this.removeTerm(p,i,q);else g&&this.removeTerm(p,i,g)}}this._storedFields.delete(i),this._documentIds.delete(i),this._idToShortId.delete(u),this._fieldLength.delete(i),this._documentCount-=1}removeAll(e){if(e)for(const a of e)this.remove(a);else{if(arguments.length>0)throw new Error("Expected documents to be present. Omit the argument to remove all documents.");this._index=new P,this._documentCount=0,this._documentIds=new Map,this._idToShortId=new Map,this._fieldLength=new Map,this._avgFieldLength=[],this._storedFields=new Map,this._nextId=0}}discard(e){const a=this._idToShortId.get(e);if(a==null)throw new Error(`MiniSearch: cannot discard document with ID ${e}: it is not in the index`);this._idToShortId.delete(e),this._documentIds.delete(a),this._storedFields.delete(a),(this._fieldLength.get(a)||[]).forEach((o,r)=>{this.removeFieldLength(a,r,this._documentCount,o)}),this._fieldLength.delete(a),this._documentCount-=1,this._dirtCount+=1,this.maybeAutoVacuum()}maybeAutoVacuum(){if(this._options.autoVacuum===!1)return;const{minDirtFactor:e,minDirtCount:a,batchSize:o,batchWait:r}=this._options.autoVacuum;this.conditionalVacuum({batchSize:o,batchWait:r},{minDirtCount:a,minDirtFactor:e})}discardAll(e){const a=this._options.autoVacuum;try{this._options.autoVacuum=!1;for(const o of e)this.discard(o)}finally{this._options.autoVacuum=a}this.maybeAutoVacuum()}replace(e){const{idField:a,extractField:o}=this._options,r=o(e,a);this.discard(r),this.add(e)}vacuum(e={}){return this.conditionalVacuum(e)}conditionalVacuum(e,a){return this._currentVacuum?(this._enqueuedVacuumConditions=this._enqueuedVacuumConditions&&a,this._enqueuedVacuum!=null?this._enqueuedVacuum:(this._enqueuedVacuum=this._currentVacuum.then(()=>{const o=this._enqueuedVacuumConditions;return this._enqueuedVacuumConditions=ge,this.performVacuuming(e,o)}),this._enqueuedVacuum)):this.vacuumConditionsMet(a)===!1?Promise.resolve():(this._currentVacuum=this.performVacuuming(e),this._currentVacuum)}async performVacuuming(e,a){const o=this._dirtCount;if(this.vacuumConditionsMet(a)){const r=e.batchSize||me.batchSize,s=e.batchWait||me.batchWait;let t=1;for(const[l,u]of this._index){for(const[i,c]of u)for(const[d]of c)this._documentIds.has(d)||(c.size<=1?u.delete(i):c.delete(d));this._index.get(l).size===0&&this._index.delete(l),t%r===0&&await new Promise(i=>setTimeout(i,s)),t+=1}this._dirtCount-=o}await null,this._currentVacuum=this._enqueuedVacuum,this._enqueuedVacuum=null}vacuumConditionsMet(e){if(e==null)return!0;let{minDirtCount:a,minDirtFactor:o}=e;return a=a||ue.minDirtCount,o=o||ue.minDirtFactor,this.dirtCount>=a&&this.dirtFactor>=o}get isVacuuming(){return this._currentVacuum!=null}get dirtCount(){return this._dirtCount}get dirtFactor(){return this._dirtCount/(1+this._documentCount+this._dirtCount)}has(e){return this._idToShortId.has(e)}getStoredFields(e){const a=this._idToShortId.get(e);if(a!=null)return this._storedFields.get(a)}search(e,a={}){const{searchOptions:o}=this._options,r={...o,...a},s=this.executeQuery(e,a),t=[];for(const[l,{score:u,terms:i,match:c}]of s){const d=i.length||1,m={id:this._documentIds.get(l),score:u*d,terms:Object.keys(c),queryTerms:i,match:c};Object.assign(m,this._storedFields.get(l)),(r.filter==null||r.filter(m))&&t.push(m)}return e===D.wildcard&&r.boostDocument==null||t.sort(Ue),t}autoSuggest(e,a={}){a={...this._options.autoSuggestOptions,...a};const o=new Map;for(const{score:s,terms:t}of this.search(e,a)){const l=t.join(" "),u=o.get(l);u!=null?(u.score+=s,u.count+=1):o.set(l,{score:s,terms:t,count:1})}const r=[];for(const[s,{score:t,terms:l,count:u}]of o)r.push({suggestion:s,terms:l,score:t/u});return r.sort(Ue),r}get documentCount(){return this._documentCount}get termCount(){return this._index.size}static loadJSON(e,a){if(a==null)throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");return this.loadJS(JSON.parse(e),a)}static async loadJSONAsync(e,a){if(a==null)throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");return this.loadJSAsync(JSON.parse(e),a)}static getDefault(e){if(ce.hasOwnProperty(e))return ie(ce,e);throw new Error(`MiniSearch: unknown option "${e}"`)}static loadJS(e,a){const{index:o,documentIds:r,fieldLength:s,storedFields:t,serializationVersion:l}=e,u=this.instantiateMiniSearch(e,a);u._documentIds=J(r),u._fieldLength=J(s),u._storedFields=J(t);for(const[i,c]of u._documentIds)u._idToShortId.set(c,i);for(const[i,c]of o){const d=new Map;for(const m of Object.keys(c)){let p=c[m];l===1&&(p=p.ds),d.set(parseInt(m,10),J(p))}u._index.set(i,d)}return u}static async loadJSAsync(e,a){const{index:o,documentIds:r,fieldLength:s,storedFields:t,serializationVersion:l}=e,u=this.instantiateMiniSearch(e,a);u._documentIds=await X(r),u._fieldLength=await X(s),u._storedFields=await X(t);for(const[c,d]of u._documentIds)u._idToShortId.set(d,c);let i=0;for(const[c,d]of o){const m=new Map;for(const p of Object.keys(d)){let b=d[p];l===1&&(b=b.ds),m.set(parseInt(p,10),await X(b))}++i%1e3===0&&await ta(0),u._index.set(c,m)}return u}static instantiateMiniSearch(e,a){const{documentCount:o,nextId:r,fieldIds:s,averageFieldLength:t,dirtCount:l,serializationVersion:u}=e;if(u!==1&&u!==2)throw new Error("MiniSearch: cannot deserialize an index created with an incompatible version");const i=new D(a);return i._documentCount=o,i._nextId=r,i._idToShortId=new Map,i._fieldIds=s,i._avgFieldLength=t,i._dirtCount=l||0,i._index=new P,i}executeQuery(e,a={}){if(e===D.wildcard)return this.executeWildcardQuery(a);if(typeof e!="string"){const m={...a,...e,queries:void 0},p=e.queries.map(b=>this.executeQuery(b,m));return this.combineResults(p,m.combineWith)}const{tokenize:o,processTerm:r,searchOptions:s}=this._options,t={tokenize:o,processTerm:r,...s,...a},{tokenize:l,processTerm:u}=t,d=l(e).flatMap(m=>u(m)).filter(m=>!!m).map(Ua(t)).map(m=>this.executeQuerySpec(m,t));return this.combineResults(d,t.combineWith)}executeQuerySpec(e,a){const o={...this._options.searchOptions,...a},r=(o.fields||this._options.fields).reduce((h,g)=>({...h,[g]:ie(o.boost,g)||1}),{}),{boostDocument:s,weights:t,maxFuzzy:l,bm25:u}=o,{fuzzy:i,prefix:c}={...$e.weights,...t},d=this._index.get(e.term),m=this.termResults(e.term,e.term,1,e.termBoost,d,r,s,u);let p,b;if(e.prefix&&(p=this._index.atPrefix(e.term)),e.fuzzy){const h=e.fuzzy===!0?.2:e.fuzzy,g=h<1?Math.min(l,Math.round(e.term.length*h)):h;g&&(b=this._index.fuzzyGet(e.term,g))}if(p)for(const[h,g]of p){const q=h.length-e.term.length;if(!q)continue;b?.delete(h);const v=c*h.length/(h.length+.3*q);this.termResults(e.term,h,v,e.termBoost,g,r,s,u,m)}if(b)for(const h of b.keys()){const[g,q]=b.get(h);if(!q)continue;const v=i*h.length/(h.length+q);this.termResults(e.term,h,v,e.termBoost,g,r,s,u,m)}return m}executeWildcardQuery(e){const a=new Map,o={...this._options.searchOptions,...e};for(const[r,s]of this._documentIds){const t=o.boostDocument?o.boostDocument(s,"",this._storedFields.get(r)):1;a.set(r,{score:t,terms:[],match:{}})}return a}combineResults(e,a=xe){if(e.length===0)return new Map;const o=a.toLowerCase(),r=Ia[o];if(!r)throw new Error(`Invalid combination operator: ${a}`);return e.reduce(r)||new Map}toJSON(){const e=[];for(const[a,o]of this._index){const r={};for(const[s,t]of o)r[s]=Object.fromEntries(t);e.push([a,r])}return{documentCount:this._documentCount,nextId:this._nextId,documentIds:Object.fromEntries(this._documentIds),fieldIds:this._fieldIds,fieldLength:Object.fromEntries(this._fieldLength),averageFieldLength:this._avgFieldLength,storedFields:Object.fromEntries(this._storedFields),dirtCount:this._dirtCount,index:e,serializationVersion:2}}termResults(e,a,o,r,s,t,l,u,i=new Map){if(s==null)return i;for(const c of Object.keys(t)){const d=t[c],m=this._fieldIds[c],p=s.get(m);if(p==null)continue;let b=p.size;const h=this._avgFieldLength[m];for(const g of p.keys()){if(!this._documentIds.has(g)){this.removeTerm(m,g,a),b-=1;continue}const q=l?l(this._documentIds.get(g),a,this._storedFields.get(g)):1;if(!q)continue;const v=p.get(g),j=this._fieldLength.get(g)[m],x=Na(v,b,this._documentCount,j,h,u),E=o*r*d*q*x,k=i.get(g);if(k){k.score+=E,Va(k.terms,e);const T=ie(k.match,a);T?T.push(c):k.match[a]=[c]}else i.set(g,{score:E,terms:[e],match:{[a]:[c]}})}}return i}addTerm(e,a,o){const r=this._index.fetch(o,Me);let s=r.get(e);if(s==null)s=new Map,s.set(a,1),r.set(e,s);else{const t=s.get(a);s.set(a,(t||0)+1)}}removeTerm(e,a,o){if(!this._index.has(o)){this.warnDocumentChanged(a,e,o);return}const r=this._index.fetch(o,Me),s=r.get(e);s==null||s.get(a)==null?this.warnDocumentChanged(a,e,o):s.get(a)<=1?s.size<=1?r.delete(e):s.delete(a):s.set(a,s.get(a)-1),this._index.get(o).size===0&&this._index.delete(o)}warnDocumentChanged(e,a,o){for(const r of Object.keys(this._fieldIds))if(this._fieldIds[r]===a){this._options.logger("warn",`MiniSearch: document with ID ${this._documentIds.get(e)} has changed before removal: term "${o}" was not present in field "${r}". Removing a document after it has changed can corrupt the index!`,"version_conflict");return}}addDocumentId(e){const a=this._nextId;return this._idToShortId.set(e,a),this._documentIds.set(a,e),this._documentCount+=1,this._nextId+=1,a}addFields(e){for(let a=0;a<e.length;a++)this._fieldIds[e[a]]=a}addFieldLength(e,a,o,r){let s=this._fieldLength.get(e);s==null&&this._fieldLength.set(e,s=[]),s[a]=r;const l=(this._avgFieldLength[a]||0)*o+r;this._avgFieldLength[a]=l/(o+1)}removeFieldLength(e,a,o,r){if(o===1){this._avgFieldLength[a]=0;return}const s=this._avgFieldLength[a]*o-r;this._avgFieldLength[a]=s/(o-1)}saveStoredFields(e,a){const{storeFields:o,extractField:r}=this._options;if(o==null||o.length===0)return;let s=this._storedFields.get(e);s==null&&this._storedFields.set(e,s={});for(const t of o){const l=r(a,t);l!==void 0&&(s[t]=l)}}}D.wildcard=Symbol("*");const ie=(n,e)=>Object.prototype.hasOwnProperty.call(n,e)?n[e]:void 0,Ia={[xe]:(n,e)=>{for(const a of e.keys()){const o=n.get(a);if(o==null)n.set(a,e.get(a));else{const{score:r,terms:s,match:t}=e.get(a);o.score=o.score+r,o.match=Object.assign(o.match,t),Ne(o.terms,s)}}return n},[sa]:(n,e)=>{const a=new Map;for(const o of e.keys()){const r=n.get(o);if(r==null)continue;const{score:s,terms:t,match:l}=e.get(o);Ne(r.terms,t),a.set(o,{score:r.score+s,terms:r.terms,match:Object.assign(r.match,l)})}return a},[Pa]:(n,e)=>{for(const a of e.keys())n.delete(a);return n}},$a={k:1.2,b:.7,d:.5},Na=(n,e,a,o,r,s)=>{const{k:t,b:l,d:u}=s;return Math.log(1+(a-e+.5)/(e+.5))*(u+n*(t+1)/(n+t*(1-l+l*o/r)))},Ua=n=>(e,a,o)=>{const r=typeof n.fuzzy=="function"?n.fuzzy(e,a,o):n.fuzzy||!1,s=typeof n.prefix=="function"?n.prefix(e,a,o):n.prefix===!0,t=typeof n.boostTerm=="function"?n.boostTerm(e,a,o):1;return{term:e,fuzzy:r,prefix:s,termBoost:t}},ce={idField:"id",extractField:(n,e)=>n[e],stringifyField:(n,e)=>n.toString(),tokenize:n=>n.split(Da),processTerm:n=>n.toLowerCase(),fields:void 0,searchOptions:void 0,storeFields:[],logger:(n,e)=>{typeof console?.[n]=="function"&&console[n](e)},autoVacuum:!0},$e={combineWith:xe,prefix:!1,fuzzy:!1,maxFuzzy:6,boost:{},weights:{fuzzy:.45,prefix:.375},bm25:$a},Ma={combineWith:sa,prefix:(n,e,a)=>e===a.length-1},me={batchSize:1e3,batchWait:10},ge={minDirtFactor:.1,minDirtCount:20},ue={...me,...ge},Va=(n,e)=>{n.includes(e)||n.push(e)},Ne=(n,e)=>{for(const a of e)n.includes(a)||n.push(a)},Ue=({score:n},{score:e})=>e-n,Me=()=>new Map,J=n=>{const e=new Map;for(const a of Object.keys(n))e.set(parseInt(a,10),n[a]);return e},X=async n=>{const e=new Map;let a=0;for(const o of Object.keys(n))e.set(parseInt(o,10),n[o]),++a%1e3===0&&await ta(0);return e},ta=n=>new Promise(e=>setTimeout(e,n)),Da=/[\n\r\p{Z}\p{P}]+/u,Fa=new Set(["a","al","algo","algun","alguna","alguno","como","con","cual","cuando","de","del","donde","e","el","ella","en","es","esa","ese","eso","esta","este","esto","hacer","hago","hay","la","las","le","les","lo","los","me","mi","mis","muy","ni","no","o","para","pero","por","puedo","que","quiero","se","si","sin","sobre","su","sus","te","tengo","tu","un","una","uno","unos","unas","y","ya","yo"]),la=["aciones","amiento","imiento","acion","ieron","ando","iendo","aron","aban","ados","adas","idos","idas","ado","ada","ido","ida","ar","er","ir","es","as","os","e","a","o","s"];function ke(n){return String(n||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}const Oa=n=>n.endsWith("gu")?n.slice(0,-1):n.endsWith("qu")?`${n.slice(0,-2)}c`:n,he=(n,e)=>{const a=e.find(o=>n.endsWith(o)&&n.length-o.length>=3);return Oa(a?n.slice(0,-a.length):n)};function Ve(n){return he(ke(n),la)}function Ba(n){const e=ke(n);return[...new Set([he(e,la),he(e,["es","s","a","e","o"])])]}const Qa=[["persona","trabajador","trabajadora","alguien","gente","empleado","empleada"],["agregar","sumar","anadir","meter","incluir"],["sacar","quitar","eliminar","borrar","remover"],["vuelta","viaje","flete"],["anticipo","adelanto"],["monto","plata","valor"],["celda","casilla","cuadro"]],ia=new Map;for(const n of Qa){const e=Ve(n[0]);for(const a of n)ia.set(Ve(a),e)}function be(n){const e=ke(n);return!e||Fa.has(e)?null:[...new Set(Ba(e).map(a=>ia.get(a)||a))]}function Ga(n){const e=[];for(const a of n)for(const o of a.sections)e.push({id:`${a.id}#${o.id}`,guideId:a.id,sectionId:o.id,guideTitle:a.title,title:o.title,questions:o.questions.join(" · "),text:Ke(o.body),adminOnly:!!a.adminOnly});return e}function Ha(n){const e=new D({fields:["title","questions","text","guideTitle"],storeFields:["guideId","sectionId","guideTitle","title","text","adminOnly"],processTerm:be});return e.addAll(Ga(n)),e}function Za(n,e,{limit:a=5,isAdmin:o=!1}={}){if(!String(e||"").trim())return[];const s=n.search(e,{boost:{questions:4,title:3,guideTitle:1.5,text:1},fuzzy:l=>l.length>=7?2:l.length>=4?1:0,prefix:l=>l.length>2,combineWith:"OR"}).filter(l=>o||!l.adminOnly);if(s.length===0)return[];const t=s[0].score;return s.filter(l=>l.score>=t*.3).slice(0,a)}function Wa(n,e,a=160){const o=new Set(String(e||"").split(/[^\p{L}\p{N}]+/u).flatMap(i=>be(i)||[])),r=i=>(be(i)||[]).some(c=>o.has(c)),s=String(n||"").split(new RegExp("(?<=[.!?:])\\s+"));let t=s[0]||"",l=-1;for(const i of s){const c=i.split(/[^\p{L}\p{N}]+/u).filter(r).length;c>l&&(t=i,l=c)}return(t.length>a?`${t.slice(0,a).replace(/\s+\S*$/,"")}…`:t).split(/([\p{L}\p{N}]+)/u).filter(Boolean).map(i=>({text:i,hit:r(i)}))}const Ja=`# Primeros pasos

Cómo entrar a TeRRa, moverte entre las pantallas y pedir ayuda desde cualquier parte.
<!-- preguntas: cómo se usa TeRRa; por dónde empiezo; qué es TeRRa -->

## Entrar a TeRRa
<!-- preguntas: cómo entro; cómo inicio sesión; no puedo entrar; olvidé mi contraseña; me dice que no tengo acceso; cómo me conecto -->

1. Abre la dirección de TeRRa en el navegador.
2. Escribe tu correo y tu contraseña, y toca **Entrar**.

![La pantalla para entrar](help/primeros-pasos/01-entrar.webp)

- **Si dice que no tienes acceso**, tu cuenta existe pero todavía no tiene permiso. La pantalla muestra tu correo: mándaselo a un administrador para que te dé acceso desde **Usuarios**.
- **Si olvidaste la contraseña**, pídele a un administrador que te envíe el correo para elegir una nueva (Usuarios → **Contraseña**).

## Moverte entre las pantallas
<!-- preguntas: dónde está el menú; cómo cambio de pantalla; cómo oculto la barra lateral; no veo el menú; dónde están las opciones de administrador -->

El menú de la izquierda lleva a cada pantalla. La que está abierta se ve marcada.

![El menú de la izquierda](help/primeros-pasos/02-menu.webp)

- **☰**, arriba a la izquierda, oculta el menú para que la pantalla use todo el ancho, y lo vuelve a mostrar.
- **Admin**, al final del menú, junta las pantallas de administración. Solo la ve un administrador.

## Pedir ayuda desde cualquier pantalla
<!-- preguntas: dónde está la ayuda; cómo busco en la ayuda; no sé cómo hacer algo; para qué sirve el signo de pregunta; cómo aviso que falta una explicación -->

El botón **?** de la barra de arriba abre la guía de la pantalla en que estás. Si esa pantalla todavía no tiene guía, abre la lista de guías.

![El botón de ayuda](help/primeros-pasos/03-boton-ayuda.webp)

Arriba de la ayuda, en **¿Qué quieres hacer?**, escribe tu pregunta como se la harías a alguien: por ejemplo, "cómo anoto el monto de un día". Mientras escribes, aparecen las partes de las guías que la responden; toca una para ir directo ahí.

![Buscar escribiendo una pregunta](help/primeros-pasos/04-buscar.webp)

Si ninguna sirve, toca **Avisar que falta**: tu pregunta queda anotada para sumar esa respuesta a la ayuda.

## Cambiar los colores
<!-- preguntas: cómo pongo el modo oscuro; cómo cambio los colores; cambiar el tema; la pantalla se ve muy clara -->

El selector de colores está arriba a la derecha, al lado de **Salir**. Hay temas claros y oscuros; el que elijas queda guardado en ese navegador.

![El selector de colores](help/primeros-pasos/05-tema.webp)

## Los valores de referencia
<!-- preguntas: dónde cambio el sueldo base; valor del día; valor de la hora extra; qué son los números de arriba; indicadores -->

En la barra de arriba están el **sueldo base**, el valor del **día** y el de la **hora extra**, para tenerlos a mano. Con **✎** se cambian. En el teléfono van en una barra que se abre debajo de la de arriba.

![Los valores de referencia](help/primeros-pasos/06-indicadores.webp)

## La versión de la app
<!-- preguntas: qué versión tengo; cómo actualizo la app; no veo los cambios nuevos; la app está desactualizada -->

Arriba a la izquierda dice **TeRRA** y su versión, por ejemplo \`v1.3.0\`. Cuando sale una versión nueva, la app se actualiza sola la próxima vez que recargas la página. Si a otra persona le aparece un número menor que el tuyo, tiene una versión anterior: que recargue la página.

## Usar TeRRa en el teléfono
<!-- preguntas: cómo uso TeRRa en el celular; cómo instalo la app; dónde está el menú en el teléfono; usar en el teléfono -->

TeRRa funciona igual en el teléfono. El menú se abre con **☰**, arriba a la izquierda, y se cierra al elegir una pantalla.

![El menú en el teléfono](help/primeros-pasos/07-menu-telefono.webp)

Para tenerla como una app más, ábrela en Chrome (Android) o Safari (iPhone) y elige **Instalar app** o **Agregar a pantalla de inicio** en el menú del navegador. Queda un ícono que la abre sin la barra de direcciones.
`,Xa=`# Anotar jornadas en la grilla del ciclo

La grilla del ciclo es donde se anota lo que trabajó cada persona cada día. Esta guía usa una labor al día (Principal, Supervisión o Adicional); en cosecha, trato y horas extras las celdas se anotan igual, pero con sus propias columnas.
<!-- preguntas: cómo anoto lo que trabajó la gente; dónde se anotan las jornadas; cómo uso la grilla -->

## Abrir un ciclo
<!-- preguntas: dónde están los ciclos; cómo entro a un ciclo; cómo abro la grilla; dónde anoto los días trabajados -->

1. En **Faenas**, toca la tarjeta de la faena.
2. Debajo aparecen sus subfaenas con sus ciclos. En la fila del ciclo, toca **Abrir**.

![Una faena abierta, con su subfaena y su ciclo](help/grilla-del-ciclo/01-abrir-ciclo.webp)

## Lo que hay en la pantalla del ciclo
<!-- preguntas: qué es cada parte de la grilla; dónde veo el total del ciclo; para qué sirven las pestañas -->

![La pantalla del ciclo](help/grilla-del-ciclo/02-pantalla.webp)

1. **Las labores del ciclo**, una pestaña por labor. **+ Labor** agrega otra.
2. **Precios por día**: el monto sugerido de cada día.
3. **La grilla**: una fila por persona y una columna por día, con el total de cada persona a la derecha.

Arriba, las **métricas** muestran cuánto suma cada labor y el ciclo entero. **▼** pliega las métricas y los precios para darle más espacio a la grilla.

En la barra del ciclo, **🚐 Transportes** anota las vueltas de los buses (ver [Anotar las vueltas del ciclo](/ayuda/transportes#anotar-las-vueltas-del-ciclo)) y **📊 Resumen ciclo** abre el resumen para pagar y para cobrar (ver [El resumen del ciclo](/ayuda/resumen-del-ciclo)).

## Anotar el monto de un día
<!-- preguntas: cómo anoto el monto de un día; cómo pongo lo que ganó una persona; cómo escribo en una celda; cómo cambio un monto; cómo uso fórmulas -->

Una celda vacía muestra en gris el precio del día (por ejemplo, **+ $30.000**). **Un clic** lo anota tal cual.

![El precio sugerido en una celda vacía](help/grilla-del-ciclo/03-precio-sugerido.webp)

Para escribir otro monto, o cambiar uno que ya está:

1. **Doble clic** en la celda, o elígela con las flechas y aprieta **Enter**.
2. Escribe el monto y aprieta **Enter**. Se guarda solo y el cursor baja a la persona siguiente.

En una celda también se puede escribir una cuenta que empiece con \`=\`, por ejemplo \`=350*54\`, y queda el resultado.

## Cambiar el precio de un día
<!-- preguntas: cómo cambio el precio del día; el valor del día está mal; precio sugerido; cuánto se paga el día -->

En **Precios por día**, escribe el monto en la tarjeta del día. Es el que aparece sugerido en las celdas vacías de ese día. Cada tarjeta dice además cuántas personas trabajaron ese día.

![Los precios por día](help/grilla-del-ciclo/04-precios-del-dia.webp)

## Anotar o borrar varias celdas de una vez
<!-- preguntas: cómo pego desde Excel; cómo copio una columna; cómo selecciono varias celdas; cómo borro varias celdas; atajos de teclado -->

- **Elegir varias celdas** de un mismo día: haz clic en la primera y **Shift+clic** en la última (o Shift+↑/↓).
- **Ctrl+C** copia las elegidas, listas para pegar en Excel.
- **Ctrl+V** pega:
  - un solo valor llena todas las elegidas;
  - una columna copiada de Excel baja una línea por persona, desde la primera elegida.
- **Supr** deja las elegidas en cero.

![Varias celdas elegidas con Shift](help/grilla-del-ciclo/05-varias-celdas.webp)

Los atajos están siempre a mano: pasa el mouse sobre **⌨ Atajos**, arriba a la derecha.

## Deshacer un cambio
<!-- preguntas: me equivoqué; cómo deshago; cómo vuelvo atrás; borré algo sin querer; recuperar un monto -->

**Ctrl+Z** deshace la última edición. Un pegado o un borrado de varias celdas se deshace entero de una vez. Lo que cambiaste en otra labor se deshace desde esa labor.

## Agregar a una persona a la labor
<!-- preguntas: cómo agrego un trabajador al ciclo; sumar una persona a la grilla; falta alguien en la grilla; la persona no aparece; trabajador sin rut; trabajador nuevo -->

1. Toca **+ Trabajador**.
2. Escribe al menos 3 letras del nombre, el apellido o el RUT, y toca a la persona.

![Buscar a la persona para agregarla](help/grilla-del-ciclo/06-agregar-persona.webp)

- **Si no existe**, toca **+ Crear nuevo trabajador** para darla de alta ahí mismo.
- **Si todavía no tienes su RUT**, toca **+ Crear trabajador temporal**: queda en la grilla con una **T** y con **Asignar RUT** para completarla cuando llegue el dato, sin perder sus días.

## Agregar un día al ciclo
<!-- preguntas: cómo agrego un día; falta un día en la grilla; cómo quito un día; agregar fecha al ciclo -->

Toca **+ Día** y elige la fecha en el calendario.

![El botón para agregar un día](help/grilla-del-ciclo/07-agregar-dia.webp)

Para quitar un día, toca la **✕** de su fecha, sobre la grilla. Solo se puede si ninguna labor tiene producción ese día ni hay vueltas de transporte.

![Las fechas del ciclo, cada una con su ✕](help/grilla-del-ciclo/07-quitar-dia.webp)

## Anotar algo de un día
<!-- preguntas: cómo anoto que llovió; nota del día; observación de un día; comentario en una fecha -->

Toca la fecha en el encabezado de la grilla (la que tiene **📝**) y escribe la nota. La nota es de la labor en que estás, y se lee al pasar el mouse sobre la fecha; el 📝 se marca en color cuando el día tiene una. Se puede anotar en los días que ya tienen algo anotado en esa labor.

![Una nota del día](help/grilla-del-ciclo/08-nota-del-dia.webp)

## Sueldo mensual: solo asistencia
<!-- preguntas: sueldo mensual; cómo marco la asistencia; trabajador mensual; no le pago por día; para qué sirve la M; contratado con sueldo -->

A quien tiene sueldo mensual no se le anotan montos, solo los días que vino:

1. Toca la **M** de su fila, a la derecha. La M queda verde.
2. Sus celdas pasan a ser casillas de asistencia: un clic marca ✓ y otro lo quita.

![Una persona con sueldo mensual](help/grilla-del-ciclo/09-mensual.webp)

Sus días entran a la nómina en $0: quedan pagados con ella y, si tiene un bono pendiente, lo cobra ahí. Si ya tenía días con monto, TeRRa pregunta si pasarlos a asistencia en $0; los que ya están en una nómina no se tocan.

## Ver la grilla por grupo
<!-- preguntas: ver por grupo; ver por líder; ocultar a los que no trabajaron; filtrar la grilla; ver solo los que tienen producción -->

- **Por grupo** junta a las personas según su líder de grupo, con un salto a cada grupo.
- **Por contrato** las junta en con contrato, a honorarios y sin nada: ver [Ver en la grilla quién tiene contrato](/ayuda/contratos#ver-en-la-grilla-quien-tiene-contrato).
- **Con producción** oculta a quien no tiene nada anotado en esta labor.

![Las vistas de la grilla](help/grilla-del-ciclo/10-por-grupo.webp)

## En el teléfono
<!-- preguntas: cómo anoto desde el celular; la grilla en el teléfono; usar la grilla en el teléfono -->

En el teléfono, la grilla pasa a ser una lista de personas con su total del ciclo, con un buscador arriba. Toca a una para abrir su ficha del ciclo, con una tarjeta por día; cada campo se guarda al salir de él. **🗂 Ver grilla completa** muestra la grilla de escritorio, y **📋 Ver por trabajador** vuelve a la lista.

![La lista de personas en el teléfono](help/grilla-del-ciclo/11-telefono.webp)

## Importar la cosecha de la empresa
<!-- preguntas: importar la cosecha; cargar el archivo de la empresa; importar el json de cosecha; la empresa manda lo cosechado; cosecha de otro contratista; extranjero con otro rut en la cosecha; la empresa cambió el rut; la persona viene con otro nombre; no aparece la ficha al importar -->

Cuando la empresa entrega lo que cosechó cada persona, se importa en una labor de **Cosecha** en vez de anotarlo a mano. El archivo es el JSON de cosecha de la empresa (hoy, el que genera el script de las planillas de Laguada). Los montos salen de los precios del ciclo: ponlos en **Precios** antes o después de importar, y se recalculan solos.

1. En la labor de cosecha, toca **📥 Importar cosecha** y elige el archivo.
2. Marca los contratistas que importas. Viene marcado el que trae más personas; si también le pagas a gente de otro, márcalo.
3. Revisa con qué calidad y envase del catálogo calza cada combo del archivo, y si se paga **por unidad del envase** o **por kilo**. Lo que elijas se recuerda para la próxima vez. Toca **Siguiente**.

![El archivo, los contratistas y los combos](help/grilla-del-ciclo/12-importar-archivo.webp)

4. Quien tiene el RUT y el nombre de una ficha calza solo. En **Por revisar** está el resto:
   - **Hay una ficha con el mismo nombre y otro RUT**: elige esa ficha.
   - **Su RUT es de una ficha con otro nombre**: la empresa pudo reasignar el RUT. Elige la ficha que corresponde o déjala fuera.
   - **Si la ficha no está en la lista** (por ejemplo, le dicen Patricio y la empresa lo trae como José), toca **🔍 Buscar otra ficha** y búscala por nombre o RUT.

   Cuando eliges a mano una ficha que no calzaba, el RUT y el nombre del archivo quedan guardados en ella, y la próxima vez calza sola. En **Nuevas** está quien no tiene ficha: se le crea una con el RUT del archivo. Con un RUT bajo 22 millones queda en el grupo **CHILENOS**; sobre 30 millones, en **EXTRANJEROS** y con pago en efectivo. Entre medio queda sin grupo ni forma de pago: complétala después en **Trabajadores**. Toca **Siguiente**.

![Las personas por revisar](help/grilla-del-ciclo/13-importar-personas.webp)

5. Revisa lo que se importa, día por día y comparado con lo que dice el archivo, y toca **Importar**. Las cantidades van por envase, y los kilos aparte. Mientras importa, la barra muestra en qué va.

![La revisión antes de importar](help/grilla-del-ciclo/14-importar-revisar.webp)

- Los pisos van con el mismo monto de la planilla. Si la empresa cuenta el piso por envase, cada envase lleva el suyo (ver [Piso](/ayuda/precios-del-dia#piso-un-bono-del-dia)).
- Volver a importar la misma semana reemplaza lo importado antes. Lo que ya está en una nómina no se toca.
- Los pisos escritos a mano en la planilla, sin fecha, no se importan: hay que anotarlos en la grilla.
- Si TeRRa dice que el archivo no es de un formato que conoce, o que su versión es otra, vuelve a generarlo con el script de las planillas y elígelo de nuevo.
- Para empezar de nuevo, por ejemplo después de una importación de prueba, usa **🧹 Limpiar labor** (ver "Limpiar una labor").

## Limpiar una labor
<!-- preguntas: limpiar la labor; borrar todas las jornadas de una labor; deshacer una importación; empezar la labor de nuevo; borrar la cosecha importada; vaciar el ciclo -->

**🧹 Limpiar labor**, en la barra de cualquier labor, borra todas sus jornadas (producción, pisos y asistencia), saca a sus personas y quita del ciclo los días que quedan vacíos. Sirve para volver a cargar una labor, por ejemplo una cosecha importada de prueba.

1. Abre la labor y toca **🧹 Limpiar labor**.
2. Lee lo que se borra y lo que queda, escribe **limpiar** y toca **Limpiar**.

![Limpiar una labor](help/grilla-del-ciclo/15-limpiar-labor.webp)

- Las jornadas que ya están en una nómina no se tocan, y su persona y su día quedan.
- Un día que usa otra labor, o que tiene vueltas de transporte, queda. Las vueltas no se borran: si hay vueltas sin pagar en los días de la labor, el diálogo lo avisa, para revisarlas en **🚐 Transportes**.
- Los precios y la labor quedan.
- No se puede con el ciclo cerrado ni en una labor sincronizada por QR.

## Si algo no se deja editar
<!-- preguntas: no puedo editar; no me deja escribir en la celda; celda bloqueada; por qué no puedo cambiar un monto; ciclo cerrado -->

- **El ciclo está cerrado.** Un ciclo cerrado queda congelado: para corregir algo hay que reabrirlo con **Reabrir ciclo**, arriba en la pantalla del ciclo o en su fila de Faenas.
- **La persona tiene sueldo mensual.** Sus celdas son de asistencia, no reciben montos (ver "Sueldo mensual").
- **La labor está sincronizada por QR.** La cantidad la escriben los pesajes; se corrige en **Cosecha QR**. Por lo mismo, en esa labor no se puede usar **📥 Importar cosecha**.
`,Ya=`# Faenas, subfaenas y ciclos

Todo lo que se anota en TeRRa cuelga de una **faena** (el fundo o el cliente). Cada faena se divide en **subfaenas** (un cuartel, un sector), y cada subfaena tiene sus **ciclos**: el período de trabajo donde se anotan las jornadas, en su grilla. Esta guía crea una faena con su primer ciclo, y explica cómo se cierra y se reabre un ciclo.
<!-- preguntas: qué es una faena; qué es un ciclo; qué es una subfaena; cómo se organiza el trabajo -->

## Crear una faena
<!-- preguntas: cómo creo una faena; agregar un fundo nuevo; cliente nuevo; nueva faena -->

1. En **Faenas**, toca **+ Nueva faena**.

![El botón para crear una faena](help/faenas-y-ciclos/01-nueva-faena.webp)

2. Escribe el **Nombre**; la **Ubicación** y las **Notas** son opcionales. Toca **Guardar**.

![Los datos de la faena](help/faenas-y-ciclos/02-datos-faena.webp)

El nombre se guarda con mayúscula al comienzo de cada palabra: "fundo el peumo" queda "Fundo El Peumo", y "SANTA ANGELA" queda "Santa Angela". Una sigla en mayúsculas entre palabras en minúscula se respeta: "Ensayo INIA". Para cambiar los datos después, toca **Editar** en la tarjeta de la faena.

## Crear una subfaena
<!-- preguntas: cómo creo una subfaena; agregar un cuartel; nuevo sector; dividir una faena -->

1. Toca la tarjeta de la faena. Abajo aparece su detalle.
2. Toca **+ Subfaena** (o **Crear subfaena**, si todavía no tiene ninguna).

![Una faena sin subfaenas](help/faenas-y-ciclos/03-faena-sin-subfaenas.webp)

3. Escribe el nombre y toca **Guardar**.

## Crear el primer ciclo
<!-- preguntas: cómo creo un ciclo; dónde anoto las jornadas de una subfaena nueva; empezar un ciclo; primer ciclo -->

Al guardar una subfaena, TeRRa ofrece crear su primer ciclo, porque las jornadas se anotan dentro de un ciclo. Toca **Crear ciclo** (con **Después** lo creas más tarde, con **+ Ciclo**).

![La oferta de crear el primer ciclo](help/faenas-y-ciclos/04-primer-ciclo.webp)

En el formulario:

- **Etiqueta**: el comienzo, "Faena/Subfaena/", es fijo; escribe el resto, por ejemplo "Ciclo 1".
- **Fecha inicio**: es el primer día de la grilla. Los demás días se agregan en el ciclo con **+ Día**.
- **Primera labor**: el tipo de pago (Pago al día, Supervisión, Adicional, Cosecha, A trato, A trato por etapas o Jornadas con horas extras). Marca **Agregar también una labor de Supervisión** si el ciclo lleva supervisores.

![El formulario de un ciclo nuevo](help/faenas-y-ciclos/05-nuevo-ciclo.webp)

Toca **Guardar**. El ciclo aparece en la subfaena; con **Abrir** se entra a su grilla (ver la guía [Anotar jornadas en la grilla del ciclo](/ayuda/grilla-del-ciclo)).

## Agregar otro ciclo a una subfaena
<!-- preguntas: cómo creo otro ciclo; segundo ciclo; nuevo ciclo en la misma subfaena; importar labores de otro ciclo; mover jornadas a otro ciclo -->

Toca **+ Ciclo** en la fila de la subfaena. Una subfaena puede tener varios ciclos abiertos a la vez.

Si la subfaena ya tiene un ciclo abierto, el formulario ofrece **Importar desde un ciclo abierto del mismo ámbito**:

- **Labores a clonar**: el ciclo nuevo arranca con esas labores, con su configuración.
- **Días a importar**: las fechas del ciclo nuevo.
- **Copiar precios por día** de esas labores y días.
- **Mover** las jornadas de esas labores y días al ciclo nuevo. Desaparecen del ciclo de origen; las que ya están en una nómina se quedan donde estaban.

## Lo que se puede hacer con un ciclo
<!-- preguntas: cómo renombro un ciclo; cambiar la fecha de un ciclo; ver la producción de un ciclo; botones del ciclo -->

![La fila de un ciclo](help/faenas-y-ciclos/06-fila-del-ciclo.webp)

- **📊 Resumen**: la producción día por día, con precios, unidades y rendimiento.
- **Abrir**: entra a la grilla del ciclo.
- **✏ Renombrar**: cambia la etiqueta, la fecha de inicio y las notas.
- **Cerrar**: ver "Cerrar un ciclo".
- **Eliminar**: ver "Eliminar un ciclo, una subfaena o una faena".

## Cerrar un ciclo
<!-- preguntas: cómo cierro un ciclo; terminar un ciclo; dar por terminado un ciclo; congelar un ciclo; cerrar los ciclos pagados -->

Un ciclo se cierra cuando ya está pagado y revisado.

1. Toca **Cerrar** en la fila del ciclo, y **Cerrar ciclo** para confirmar.

![Confirmar el cierre](help/faenas-y-ciclos/07-cerrar-ciclo.webp)

2. TeRRa ofrece crear el ciclo siguiente, con las mismas labores y, si dejas marcada la casilla, la misma gente en cada labor. Toca **Crear ciclo** o **No, gracias**.

![La oferta del ciclo siguiente](help/faenas-y-ciclos/08-ciclo-siguiente.webp)

**Qué pasa al cerrarlo:** el ciclo queda congelado para todos, también para un admin. Su grilla, sus precios y sus labores no se pueden cambiar, y Nómina deja de ofrecerlo para generar.

También se cierra desde la pantalla del ciclo (**Cerrar ciclo**, arriba) y desde Nómina, que ofrece cerrar de una vez los ciclos que ya quedaron pagados enteros.

En la subfaena, los ciclos cerrados quedan ocultos mientras haya alguno abierto: **▾ Ver N ciclos cerrados** los muestra.

## Reabrir un ciclo
<!-- preguntas: cómo reabro un ciclo; corregir un ciclo cerrado; abrir un ciclo cerrado; me equivoqué en un ciclo cerrado -->

Para corregir algo en un ciclo cerrado, toca **↻ Reabrir** en su fila (o **Reabrir ciclo** en la pantalla del ciclo). Corrige lo que haga falta y vuelve a cerrarlo.

![Un ciclo cerrado, con Reabrir](help/faenas-y-ciclos/09-reabrir.webp)

## Eliminar un ciclo, una subfaena o una faena
<!-- preguntas: cómo elimino un ciclo; borrar un ciclo; eliminar una faena; borrar una subfaena; no me deja eliminar -->

- **Un ciclo**: **Eliminar** en su fila. Se borra con sus jornadas. Si alguna de sus jornadas ya está en una nómina, TeRRa no lo deja: primero hay que eliminar esa nómina.
- **Una subfaena**: **Eliminar** en su fila. Si tiene ciclos, solo un admin puede borrarla, en cascada con sus ciclos y sus jornadas, y solo si ninguna de esas jornadas está en una nómina.
- **Una faena**: **Eliminar** en su tarjeta. Solo se puede si no tiene subfaenas ni ciclos; un admin puede borrarla en cascada, con todo lo que tiene adentro, si ninguna de sus jornadas está en una nómina.

Eliminar no se puede deshacer.

## Ordenar las tarjetas de las faenas
<!-- preguntas: cómo ordeno las faenas; agrupar faenas; cambiar el color de una faena; mover una faena -->

Arrastra una tarjeta para cambiarla de lugar. **⚙ Organizar** permite además crear grupos (**+ Grupo**), mover las faenas entre ellos y elegir colores. **✓ Listo** termina.

## Si algo no funciona
<!-- preguntas: no puedo editar un ciclo; no aparece un ciclo; no encuentro un ciclo cerrado; no me deja eliminar una faena; no me deja eliminar una subfaena -->

- **No se puede editar nada del ciclo**: está cerrado. Reábrelo (ver "Reabrir un ciclo").
- **No aparece un ciclo cerrado**: toca **▾ Ver N ciclos cerrados** en su subfaena.
- **No se puede eliminar un ciclo**: alguna de sus jornadas está en una nómina.
- **No se puede eliminar una faena o una subfaena**: todavía tiene subfaenas o ciclos. Un admin puede borrarla en cascada.
`,Ka=`# Precios del día y piso

Cada labor de un ciclo tiene un **tipo**, y el tipo decide cómo se paga: qué precios se anotan cada día y qué columnas tiene la grilla. Los precios van en el panel que está sobre la grilla, con una tarjeta por día. Esta guía recorre cada tipo y el **piso**, el bono del día de las labores de cosecha y a trato.
<!-- preguntas: cómo se paga cada labor; dónde pongo los precios; tipos de labor; precios por día -->

## Agregar una labor al ciclo
<!-- preguntas: cómo agrego una labor; nueva labor; cambiar el tipo de una labor; editar una labor; agregar cosecha a un ciclo -->

1. En la pantalla del ciclo, toca **+ Labor**, al lado de las pestañas de las labores.
2. Escribe el **Nombre** y elige el **Tipo**: Pago al día, Supervisión, Adicional, Cosecha, A trato, A trato por etapas o Jornadas con horas extras. Según el tipo aparecen sus propios datos, como la base diaria y la tarifa de la hora extra.
3. Toca **Guardar**. La labor queda como una pestaña más.

![El formulario de una labor nueva](help/precios-del-dia/01-nueva-labor.webp)

**Grupo de labor** une esta labor con la del mismo nombre en otros ciclos de la subfaena, para ver su historia junta. Para cambiar los datos después, toca **Editar labor** con la labor elegida.

## Pago al día, Supervisión y Adicional
<!-- preguntas: precio del día en pago al día; cuánto se paga el día; labor al día; supervisión; adicional -->

Se paga un monto por día. En **Precios por día** se anota el precio de cada día, que es el que aparece sugerido en las celdas vacías (ver [Cambiar el precio de un día](/ayuda/grilla-del-ciclo#cambiar-el-precio-de-un-dia)). Cambiarlo no toca los montos que ya están anotados.

## Cosecha: un precio por calidad y envase
<!-- preguntas: precio de la cosecha; precio por kilo; precio por bandeja; agregar calidad; agregar envase; cosecha por calidad; día nuevo sin tipos de cosecha; exportación kilo que no se quita -->

Cada día tiene sus **tipos**: una calidad y un envase (por ejemplo, Exportación / bandeja), cada uno con su precio. En la grilla, cada tipo es una columna del día, donde se anota la cantidad de cada persona; el monto es cantidad × precio.

![Los tipos de cosecha de un día](help/precios-del-dia/02-cosecha.webp)

- **$/unidad** paga cada unidad al precio; **$/día** paga el precio una vez, sin importar la cantidad.
- **+ tipo** agrega otro tipo a ese día. Elige la calidad y el envase; si no están, **+ Nueva calidad** y **+ Nuevo envase** los crean.
- La **✕** de un tipo lo quita del día. Un día no queda sin tipos: para quitar el último, agrega otro antes o quita el día.
- Un día nuevo trae los tipos del día más cercano que los tenga, sin precio. Al ponerle precio a uno, o al agregar o quitar uno, quedan guardados los de ese día.
- Mientras la labor no tiene ningún tipo, cada día muestra **Exportación / kilo** para empezar. No se guarda ni tiene **✕**: al agregar el primer tipo, desaparece.

![Agregar un tipo de cosecha](help/precios-del-dia/03-agregar-tipo.webp)

Las calidades y los envases se editan en **⚙ Catálogos**, arriba en la pantalla del ciclo.

## A trato: uno o varios precios por día
<!-- preguntas: precio del trato; trato por planta; pagar por metro; varios precios en un día; trato con precio fijo; unidad del trato -->

Cada día tiene uno o más precios (P1, P2…). Para cada uno se elige la **unidad** (Planta, Metro, Polín…) y si se paga **/unid** (cantidad × precio) o **/día** (el precio una vez). Arriba a la derecha de la tarjeta, lo producido ese día, cuántas personas y el promedio por persona.

![Los precios de un día de trato](help/precios-del-dia/04-trato.webp)

**+ Agregar precio** suma otro precio a ese día, que en la grilla es otra columna. El **Tipo de trato** de la labor (Poda, Amarre…) es el nombre con que se muestran las cantidades.

## A trato por etapas
<!-- preguntas: trato por etapas; etapas de una labor; precio por etapa; qué significa cuenta; agregar una etapa -->

La labor tiene **etapas** (por ejemplo, Armado y Embalado), y cada día tiene un precio por etapa, por unidad (**u**) o por día (**d**). En la grilla, cada día tiene una columna por etapa.

![Los precios por etapa de un día](help/precios-del-dia/08-etapas.webp)

Las etapas se definen en **Editar labor**: **+ Agregar etapa**, su nombre y si **cuenta**. Todas las etapas se pagan; la marca **cuenta** (✓) dice cuáles suman unidades terminadas para el cliente, así una misma unidad no se cuenta dos veces.

![Las etapas de una labor](help/precios-del-dia/09-etapas-editar.webp)

## Jornadas con horas extras
<!-- preguntas: horas extras; cómo pago las horas extras; tarifa hora extra; bono de manejo; bono de supervisión; día feriado; solo horas extras; base diaria -->

Cada día se paga una **base**, más las **horas extras** a su tarifa y los **bonos** de manejo y de supervisión. Los valores por defecto (base diaria, tarifa de la hora extra y los dos bonos) son de la labor y se cambian en **Editar labor**.

En **Configuración por día** cada día muestra su base y su modo. Toca un día para cambiarlo:

![La configuración de cada día](help/precios-del-dia/10-horas-extras.webp)

- **Base diaria**: la base de ese día, si no es la de siempre.
- **Jornada normal**: base, horas extras y bonos.
- **Solo horas extras**: ese día no se paga la base.
- **Marcar como feriado**: el día se ve en rojo. No cambia los montos.

![Configurar un día](help/precios-del-dia/11-configurar-dia.webp)

En la grilla, cada día tiene la **Base** y las horas extras (**HE**) de cada persona. Debajo de la base van los bonos y el total del día: tócalos para marcar el bono de manejo, el de supervisión o un monto adicional. **⚑ Líderes / Manejo** deja marcados de antemano a quienes manejan o lideran.

## Piso: un bono del día
<!-- preguntas: qué es el piso; cómo pongo el piso; bono por día bajo; asignar el piso a todos; quitar el piso; bono de piso; piso por envase; dos pisos el mismo día; piso de capacho y de totem -->

El piso es un bono que se suma a lo que cada persona produjo un día, pensado para compensar un día de baja producción. Existe en las labores de **Cosecha** y **A trato**.

1. En la tarjeta del día, toca **+ piso**, escribe el monto y aprieta **Enter**.
2. Toca **👥 a todos (N)** para dárselo a todas las personas con producción ese día que todavía no lo tienen, y confirma.

![Un día con piso](help/precios-del-dia/05-piso.webp)

![Confirmar el piso para todos](help/precios-del-dia/06-piso-a-todos.webp)

En la grilla aparece la columna **Piso** de ese día. Cada 🪙 se puede quitar o volver a poner por persona, y el monto de abajo es el total del día con el piso.

![La columna Piso en la grilla](help/precios-del-dia/07-piso-grilla.webp)

- **✎** cambia el monto del piso.
- **✕** quita el piso del día junto con los bonos ya asignados. Los que ya están en una nómina no se quitan.

En cosecha, si la empresa cuenta el piso por envase (por ejemplo, más de 9 capachos y más de 9 totems), un día con dos o más envases ofrece también **+ piso** de cada envase. Cada uno tiene su monto, su **👥 a todos** (para quienes cosecharon en ese envase) y su columna en la grilla. Una persona puede tener los dos el mismo día, y se suman.

![Un día con el piso del día y el de un envase](help/precios-del-dia/07-piso-por-envase.webp)

## Cambiar un precio que ya se usó
<!-- preguntas: cambié el precio y qué pasa con los montos; corregir un precio; precio mal puesto; se recalculan los montos -->

- **Cosecha, a trato, por etapas y horas extras**: al cambiar el precio, la unidad o el modo de un día, TeRRa recalcula los montos de ese día con las cantidades ya anotadas.
- **Pago al día, Supervisión y Adicional**: cambia solo el precio sugerido; los montos anotados quedan como están.
- Una nómina ya generada guarda sus propios montos y no cambia sola. Para traer los nuevos montos, ver [Traer los cambios de la grilla](/ayuda/corregir-nomina#traer-los-cambios-de-la-grilla-recalcular).

## Si algo no funciona
<!-- preguntas: no aparece el piso; no puedo cambiar el precio; no me deja escribir el precio; precio en gris -->

- **No aparece + piso**: la labor no es de cosecha ni a trato.
- **No se puede escribir un precio**: el ciclo está cerrado (dice "solo lectura"). Reábrelo para corregirlo.
- **El precio cambió pero el monto no**: en las labores al día el precio es solo el sugerido; corrige el monto en la celda.
`,en=`# Generar y pagar una nómina

Una nómina junta lo que se le debe a cada persona por los días anotados en uno o más ciclos, y lo separa en lo que va por transferencia y lo que se paga en efectivo. Esta guía arma una nómina, la revisa, descarga el archivo del banco, imprime los comprobantes y la marca pagada.
<!-- preguntas: cómo hago la nómina; cómo le pago a los trabajadores; pagar la semana; generar nómina -->

## Antes de empezar
<!-- preguntas: qué necesito para hacer la nómina; trabajador sin cuenta; cómo marco que alguien cobra en efectivo; formato del archivo del banco -->

- Los días de cada persona tienen que estar anotados en la grilla de sus ciclos.
- Cada persona necesita su cuenta en la ficha (en **Trabajadores**). Quien cobra en efectivo lleva **Efectivo** como banco; su efectivo se reparte en un sobre por **líder de grupo**.
- Los anticipos y bonos pendientes se descuentan solos al armar la nómina (ver la guía [Anticipos y bonos](/ayuda/anticipos-y-bonos)).
- El formato del archivo del banco se elige en **⚙ Configuración**, arriba en Nómina.

## Elegir los ciclos
<!-- preguntas: cómo hago la nómina; armar la nómina de la semana; generar una nómina nueva; cómo elijo los ciclos a pagar; qué ciclos entran en la nómina; pagar solo una labor -->

En la pestaña **Generar** están los ciclos abiertos, por faena, con lo que tienen pendiente de pago. Marca los que entran en esta nómina.

![Los ciclos con su pendiente](help/nomina/01-elegir-ciclos.webp)

- Si un ciclo tiene varias labores, debajo aparece **Labores a pagar**: desmarca las que no se pagan ahora. Quedan pendientes para la próxima.
- Los ciclos sin nada pendiente están ocultos (**Sin pendientes**).
- **+ Agregar persona** suma días puntuales de alguien, de cualquier ciclo abierto: sirve para pagarle a una persona sin pagar el ciclo entero.

Abajo se ve cuánto suma lo elegido. Toca **Continuar →**.

![Lo elegido y el botón para seguir](help/nomina/02-continuar.webp)

## Revisar la vista previa
<!-- preguntas: cómo reviso la nómina antes de guardar; cambiar a efectivo; cambiar a efectivo solo en esta nómina; pagar en efectivo solo esta vez; cambiar a transferencia; sacar a alguien de la nómina; cambiar el monto a pagar; datos faltantes; cuenta sospechosa; qué es una diferencia -->

La vista previa muestra a cada persona con lo que se le paga.

![La vista previa de la nómina](help/nomina/03-vista-previa.webp)

- **Nombre**: TeRRa propone uno con el año, el mes y la semana; se puede cambiar. **Tipo**: **Nómina**, o **Diferencia** para una nómina chica de ajuste, que se lista aparte.
- **Bruto** es lo producido; **Anticipo** y **Bono** lo que se descuenta o se suma; **A pagar** es el resultado, y se puede corregir a mano.
- **Pago**: toca **Banco** o **Efec.** para cambiar cómo cobra esa persona en esta nómina.
- La casilla de la izquierda deja a alguien fuera de esta nómina; sus días quedan pendientes.
- El filtro de arriba muestra solo banco, solo efectivo, los **⚠ Datos faltantes**, las **⚠ Cuenta sospechosa** o un grupo. Los botones de la derecha (**✓ Incluir**, **✗ Excluir**, **→ Efectivo**, **→ Banco**) se aplican a todos los que se ven.
- **Efectivo agrupado por líder**: un sobre por líder, con quiénes van en él.

**← Volver** regresa a los ciclos.

## Guardar la nómina
<!-- preguntas: cómo guardo la nómina; qué pasa al guardar la nómina; los días ya pagados no vuelven a salir -->

Toca **Guardar nómina**. Si hay anticipos en cuotas o cuentas con problemas, TeRRa pide confirmarlos.

**Qué pasa al guardarla:** los días quedan dentro de esta nómina y ya no aparecen como pendientes, así no se pagan dos veces. Los anticipos y bonos quedan aplicados. La nómina aparece en **Historial Nómina**, pendiente de pago.

## El historial de nóminas
<!-- preguntas: dónde están las nóminas; ver nóminas anteriores; renombrar una nómina; eliminar una nómina; buscar una nómina -->

![Una nómina pendiente en el historial](help/nomina/04-historial.webp)

Cada fila muestra el estado, cuántas personas, lo de banco, lo de efectivo y el total. Arriba se filtra por estado, por mes o por nombre, y las **Diferencias** van en su propia pestaña. Toca la fila para abrir el detalle.

**⋯** tiene las demás acciones:

![Las demás acciones de una nómina](help/nomina/05-mas-acciones.webp)

- **Solo transferencias**: ver "Pagar en dos tiempos".
- **Mover a Diferencias** (o a Nóminas) y **Renombrar**.
- **Eliminar**: borra la nómina, libera sus días (vuelven a quedar pendientes) y devuelve los anticipos. Si no se puede, dice qué hacer antes.

## El detalle de una nómina
<!-- preguntas: ver el detalle de la nómina; cuánto efectivo tengo que sacar; billetes y monedas; resumen por subfaena; copiar el resumen de la nómina; total bruto de la nómina; cuánto se produjo antes de anticipos; quién editó la nómina; cuándo se modificó la nómina -->

![El detalle de una nómina](help/nomina/06-detalle.webp)

- **Resumen**: lo de transferencias, lo de efectivo y el total. Si la nómina aplicó anticipos o bonos, también el **Bruto** (lo producido, antes de descontarlos y sumarlos) y **📋 Ver anticipos y bonos**, que los lista uno por uno (ver la guía [Anticipos y bonos](/ayuda/anticipos-y-bonos#despues-de-la-nomina)).
- **Estimar efectivo**: cuántos billetes y monedas sacar para armar los sobres, y cuánto lleva cada persona.
- La tabla del resumen, por subfaena (**Sin labores**) o por subfaena y labor (**Con labores**), con **Copiar**, **Descargar** e **Imprimir**.
- Más abajo, los ciclos de la nómina y las personas por líder, de banco y de efectivo.
- Arriba, bajo el nombre, cuándo se editó por última vez y quién.
- Arriba, **Editar contenido** y **Recalcular** sirven para corregirla (ver la guía [Corregir una nómina](/ayuda/corregir-nomina)).

## Descargar el archivo del banco
<!-- preguntas: cómo descargo el archivo del banco; subir la nómina al banco; descargar el excel de la nómina; archivo para transferencias -->

Al pie del detalle, toca **Descargar**:

![Las descargas de la nómina](help/nomina/07-descargar.webp)

- **Sólo Nómina**: la hoja que se sube al banco para hacer las transferencias.
- **XLSX completo**: la hoja del banco, el resumen, las transferencias y el efectivo.
- **JSON**: toda la información de la nómina, como respaldo.

## Imprimir los comprobantes
<!-- preguntas: imprimir comprobantes de efectivo; hoja para firmar; detalle de pago para el trabajador; imprimir la nómina -->

Al pie del detalle, toca **Imprimir**:

![Lo que se imprime](help/nomina/08-imprimir.webp)

- **Comprobantes efectivo**: una hoja por líder, con lo de cada persona y espacio para la firma.
- **Detalle de pago**: el resumen y lo que produjo cada persona, por grupo.

## Marcar la nómina pagada
<!-- preguntas: cómo marco la nómina pagada; ya pagué la nómina; cerrar la nómina; terminar la nómina -->

1. En el historial, toca **✓ Marcar pagada**.
2. Escribe **Pagado** para confirmar y toca **Confirmar**.

![Confirmar el pago](help/nomina/09-marcar-pagada.webp)

Los días quedan sellados con la fecha de pago. Si algún ciclo quedó pagado entero, TeRRa ofrece cerrarlo (ver "Cerrar un ciclo" en la guía [Faenas, subfaenas y ciclos](/ayuda/faenas-y-ciclos#cerrar-un-ciclo)):

![La oferta de cerrar los ciclos pagados](help/nomina/10-cerrar-ciclos.webp)

Para volver atrás, **⋯ → Marcar como no pagada**.

## Pagar en dos tiempos: primero las transferencias
<!-- preguntas: pagar las transferencias y el efectivo después; quedó debiendo el efectivo; solo transferencias; pagar el efectivo después; alguien ya cobró su efectivo -->

Cuando salen las transferencias pero el efectivo se entrega después:

1. **⋯ → Solo transferencias**, y escribe **Transferencias** para confirmar. La nómina sigue pendiente y su efectivo queda como deuda (**💵 Debiendo**).
2. Si alguien cobra antes que el resto, márcalo en el detalle: deja de contar como deuda.
3. Cuando se entrega el efectivo, toca **💵 Pagar efectivo** en el historial.

Mientras se debe, el efectivo aparece en **Generar** (**💵 Efectivo pendiente de antes**) y se puede sumar en **Estimar efectivo**, para llevar todo junto. Con las transferencias selladas la nómina no se puede editar ni eliminar; **⋯ → Revertir transferencias** lo deshace.

## La nómina en el portal de trabajadores
<!-- preguntas: portal de trabajadores; publicar la nómina en el portal; los trabajadores ven su pago; cuál nómina está en el portal; qué es el ícono del portal -->

En el portal de trabajadores, cada persona escribe su RUT y ve el detalle de su pago. El portal muestra una nómina a la vez: la que lleva **🌐 Portal** en el historial y en su detalle.

Publicar una nómina, o cambiar cuál se ve, lo hace un administrador. Si se corrige una nómina ya publicada, pídele que la vuelva a publicar: el portal sigue mostrando la versión de antes.

## Si algo no funciona
<!-- preguntas: no aparece un trabajador en la nómina; falta alguien en la nómina; no puedo eliminar la nómina; no aparece el ciclo en nómina; datos faltantes en la nómina -->

- **No aparece un ciclo en Generar**: está cerrado o no tiene nada pendiente (**Sin pendientes**).
- **No aparece una persona en la vista previa**: sus días ya están en otra nómina o todavía no tiene RUT (es temporal).
- **⚠ Datos faltantes**: a la persona le falta la cuenta o el banco. Complétalo en su ficha, en **Trabajadores**, y vuelve a armar la nómina, o pásala a efectivo.
- **No se puede eliminar ni editar la nómina**: tiene las transferencias selladas o está pagada. Revierte eso primero desde **⋯**.
`,an=`# Corregir una nómina

Una nómina pendiente se puede corregir antes de pagarla: traer un monto que se cambió en la grilla, agregarle un ciclo o los días de una persona, o sacarle un ciclo, una labor o a alguien. La nómina queda igual que si se hubiera armado así desde el principio, también en los anticipos que descuenta. Para armar una nómina, ver la guía [Generar y pagar una nómina](/ayuda/nomina).
<!-- preguntas: cómo corrijo una nómina; me equivoqué en la nómina; cambiar una nómina ya hecha; modificar la nómina -->

## Antes de empezar
<!-- preguntas: no puedo corregir la nómina; nómina pagada no se puede editar; cuándo se puede corregir una nómina -->

Solo se corrige una nómina **pendiente** y sin las transferencias selladas. Si ya se marcó pagada, o se marcaron las transferencias, primero hay que revertirlo desde **⋯** en el historial.

Todo se hace en el detalle de la nómina: toca su fila en **Historial Nómina**. Arriba están **Editar contenido** y **Recalcular**.

![Los botones para corregir una nómina](help/corregir-nomina/01-botones.webp)

## Traer los cambios de la grilla (Recalcular)
<!-- preguntas: cambié un monto en la grilla después de hacer la nómina; recalcular la nómina; actualizar la nómina; la nómina no tiene el monto nuevo -->

Una nómina guarda los montos que tenía cada día al generarla. Si después se corrige algo en la grilla, toca **Recalcular**: TeRRa muestra a quién le cambia el monto, antes y ahora.

![Lo que cambia al recalcular](help/corregir-nomina/02-recalcular.webp)

Toca **Aplicar cambios** para guardarlo. Mientras compara y mientras guarda, una barra muestra en qué va. Recalcular también trae los días que se anotaron después en las labores de la nómina, y los nombres al día de los ciclos y de sus labores.

## Agregar los días de una persona
<!-- preguntas: se me olvidó una persona en la nómina; agregar a alguien a una nómina ya creada; sumar un trabajador a la nómina; agregar días a la nómina -->

1. Toca **Editar contenido** y después **+ Agregar persona**.

![Editar ciclos y Agregar persona](help/corregir-nomina/03-editar-contenido.webp)

2. Busca a la persona por nombre o RUT. Aparecen sus días sin pagar, agrupados; los que ya están en una nómina se ven sin casilla.
3. Marca los días que entran (o **Todos**, en un grupo) y toca **Agregar días**.

![Los días de una persona](help/corregir-nomina/04-agregar-persona.webp)

Si tiene anticipos o bonos pendientes, se descuentan o se suman al agregarla. Mientras guarda, una barra muestra en qué va.

## Agregar o sacar ciclos y labores
<!-- preguntas: agregar un ciclo a la nómina; sumar otro ciclo a una nómina hecha; agregar una labor a la nómina; faltó un ciclo en la nómina; sacar un ciclo de la nómina; quitar una labor de la nómina; un ciclo no debía ir en la nómina; sacar días de la nómina; cambiar los ciclos de la nómina; cambiar una labor por otra -->

1. Toca **Editar contenido** y después **Editar ciclos**. Aparecen los ciclos abiertos, como al generar la nómina. Los de esta nómina vienen marcados, con sus labores y lo que paga cada una.
2. Marca lo que entra y desmarca lo que sale: ciclos enteros o labores sueltas, todo de una vez. Abajo se ve cuánto entra y cuánto sale; **Deshacer** vuelve a como estaba.

![Un ciclo que sale y otro que entra sin una de sus labores](help/corregir-nomina/05-editar-ciclos.webp)

3. Toca **Revisar cambios**. TeRRa muestra lo que entra y lo que sale, quién sale de la nómina, a quién le cambia el monto y quién entra. Toca **Aplicar cambios**.

![Cómo queda la nómina con los cambios](help/corregir-nomina/06-revisar-cambios.webp)

Quien ya estaba en la nómina suma lo que entra, y quien no estaba, entra. Los días de lo que sale vuelven a quedar pendientes, para otra nómina, y quien se queda sin nada sale de la nómina. Una nómina no puede quedar sin ciclos: para eso, se elimina.

## Sacar a una persona
<!-- preguntas: sacar a un trabajador de la nómina; quitar a alguien de la nómina; una persona no debía cobrar en esta nómina -->

Con **Editar contenido** activo, cada persona tiene una **✕** al final de su fila.

![La ✕ para sacar a una persona](help/corregir-nomina/07-sacar-persona.webp)

Tócala y confirma con **Sacar**. Mientras la saca, una barra muestra en qué va. Sus días vuelven a quedar pendientes y sus anticipos vuelven a estar por cobrar. Se puede volver a sumar con **+ Agregar persona**.

![Confirmar que sale de la nómina](help/corregir-nomina/08-confirmar-sacar.webp)

## Qué pasa con los anticipos y bonos
<!-- preguntas: qué pasa con los anticipos si corrijo la nómina; el anticipo no se descontó entero; anticipo vuelve a quedar pendiente -->

- Si a alguien le baja lo que cobra y su anticipo ya no cabe entero, la parte que no cabe vuelve al mismo anticipo, con sus cuotas, para descontarse en la próxima nómina.
- Al agregarle días a alguien, se le descuentan los anticipos pendientes que esta nómina todavía no le tocaba. Lo que ya descuenta de un anticipo no crece.
- Quien entra a la nómina con un ciclo o una labor trae sus anticipos y bonos pendientes, como al generarla.
- Quien sale de la nómina recupera todos sus anticipos y bonos de esta nómina.

## Cambiar los nombres de los ciclos en el resumen
<!-- preguntas: cambiar el nombre del ciclo en la nómina; encabezados del resumen; renombrar el ciclo solo en la nómina -->

**Editar encabezados** cambia cómo se llama cada ciclo en el resumen, el Excel y lo que se imprime de esta nómina, sin tocar el ciclo. Recalcular no cambia esos nombres.

## Si algo no funciona
<!-- preguntas: no aparece editar contenido; no puedo sacar el ciclo; no aparece el ciclo para agregar -->

- **No se puede editar**: la nómina está pagada o tiene las transferencias selladas. Reviértelo desde **⋯** en el historial.
- **No se puede sacar el último ciclo**: una nómina no queda vacía. Elimínala desde **⋯**.
- **No aparece un ciclo en Editar ciclos**: está cerrado, o no tiene nada pendiente y queda detrás de **Sin pendientes**. Los ciclos de la nómina aparecen siempre.
`,nn=`# Anticipos y bonos

Un **anticipo** es plata que se le pasa a alguien por adelantado y que se le descuenta en la nómina; un **bono** es plata que se le suma. Los dos se anotan en **Anticipos / Bonos** y la nómina siguiente los aplica sola. Esta guía anota un anticipo, explica las cuotas y muestra cómo los descuenta la nómina.
<!-- preguntas: qué es un anticipo; qué es un bono; adelanto de sueldo; descontar plata en la nómina -->

## La lista de anticipos y bonos
<!-- preguntas: dónde veo los anticipos; cuánto debe una persona; anticipos pendientes; ver todos los anticipos de una persona -->

![La lista de anticipos y bonos](help/anticipos-y-bonos/01-lista.webp)

- Arriba se filtra por tipo (**Anticipo** o **Bono**), se busca por nombre, RUT o nota, y se elige el estado: **Pendientes** (lo que falta aplicar), **Aplicados**, **Cancelados** o **Todos**. A la derecha, el total pendiente de anticipos y de bonos.
- Un anticipo en cuotas muestra cuántas lleva (por ejemplo, **0/2 · Por pago**).
- El nombre de la persona abre todos sus anticipos y bonos.

## Anotar un anticipo
<!-- preguntas: cómo anoto un anticipo; dar un adelanto; prestar plata a un trabajador; registrar un anticipo -->

1. Toca **🪙 + Anticipo**.
2. Busca a la persona (al menos 2 letras del nombre o del RUT) y elígela.
3. Escribe el **Monto** y la **Fecha**. La **Nota** es opcional (el motivo, una referencia).
4. Toca **Guardar**.

![El formulario de un anticipo](help/anticipos-y-bonos/02-nuevo-anticipo.webp)

Si la persona ya tiene otro pendiente por el mismo monto, TeRRa avisa que puede estar duplicado.

## Descontar un anticipo en cuotas
<!-- preguntas: anticipo en cuotas; descontar de a poco; pagar el anticipo en varias nóminas; cuotas de un préstamo -->

En el formulario, marca **Descontar en cuotas** y elige el **N° de cuotas**: TeRRa calcula el monto de cada una. La **Frecuencia** (por pago, quincenal o mensual) es solo una referencia: TeRRa no se salta nóminas solo.

Cada nómina descuenta una cuota, y al guardarla pide confirmar las cuotas que entran:

![Confirmar las cuotas al guardar la nómina](help/anticipos-y-bonos/04-confirmar-cuotas.webp)

Vienen todas marcadas; desmarca la de quien no debe pagar cuota esta vez. El plan de cuotas no se cambia después: para cambiarlo, se elimina el anticipo (mientras siga pendiente) y se anota de nuevo.

## Anotar un bono
<!-- preguntas: cómo anoto un bono; pagar un bono; premio a un trabajador; bono de asistencia -->

Toca **🎁 + Bono** y sigue los mismos pasos que un anticipo (un bono no tiene cuotas). La nómina siguiente lo suma a lo que cobra la persona.

## Cómo los aplica la nómina
<!-- preguntas: cómo se descuenta el anticipo en la nómina; el anticipo es más grande que lo que gana; cambiar el anticipo en la nómina; no descontar el anticipo esta vez -->

Al armar una nómina, TeRRa busca los anticipos y bonos pendientes de cada persona:

![La vista previa con anticipos y un bono](help/anticipos-y-bonos/03-vista-previa.webp)

- Primero suma los **bonos**, y después descuenta los **anticipos**, del más viejo al más nuevo. Así un bono ayuda a saldar un anticipo.
- Nunca descuenta más de lo que la persona cobra (lo producido más los bonos): lo que no alcanza queda pendiente para la próxima.
- De un anticipo en cuotas descuenta una cuota.
- En la vista previa se puede cambiar el **Anticipo** (hasta lo que se debe) y el **Bono** (hasta su monto). Lo que no se aplica queda pendiente.

## Después de la nómina
<!-- preguntas: el anticipo quedó parcial; qué significa parcial; anticipo aplicado; cuánto falta del anticipo; qué anticipos descontó la nómina; ver los bonos de una nómina; bruto de la nómina -->

![Los anticipos y el bono después de la nómina](help/anticipos-y-bonos/05-despues-de-la-nomina.webp)

- **Aplicado**: se descontó (o se pagó) entero.
- **Parcial**: se descontó una parte; queda el resto (**Resta**) para las nóminas siguientes.
- En el detalle de la nómina, el **Resumen** muestra el **Bruto** (lo producido, antes de los anticipos y los bonos) y **📋 Ver anticipos y bonos** lista cada uno, por persona, con su fecha, su nota y lo que se aplicó en esa nómina.

![Los anticipos y bonos de una nómina](help/anticipos-y-bonos/06-en-la-nomina.webp)

- Si la nómina se elimina, o se saca a la persona, el anticipo vuelve a quedar pendiente como estaba. Ver la guía [Corregir una nómina](/ayuda/corregir-nomina#que-pasa-con-los-anticipos-y-bonos).

## Corregir o eliminar un anticipo
<!-- preguntas: cómo corrijo un anticipo; eliminar un anticipo; perdonar el saldo de un anticipo; me equivoqué de monto en el anticipo -->

- **Pendiente**: se edita y se elimina con **Editar** y **Eliminar**.
- **Parcial**: no se elimina, porque ya tiene pagos. Con **Editar** se puede bajar el monto hasta lo ya pagado, para dar por cerrado el resto.
- **Aplicado**: ya no se edita ni se elimina.

## Si algo no funciona
<!-- preguntas: la nómina no descontó el anticipo; no aparece el anticipo en la nómina; no puedo eliminar un anticipo -->

- **La nómina no lo descontó**: la persona no cobró nada en esa nómina, o la cuota se desmarcó al guardarla. Sigue pendiente para la próxima.
- **No se puede eliminar**: tiene pagos aplicados (está parcial). Usa **Editar** para cerrar el saldo.
`,on=`# Trabajadores

En **Trabajadores** está la ficha de cada persona: su RUT, su líder de grupo, cómo cobra y sus datos personales. La nómina, el archivo del banco y las boletas de honorarios sacan de aquí lo que necesitan. Esta guía busca a alguien, revisa su ficha y agrega a una persona nueva. Los contratos, los honorarios y las imposiciones tienen su propia guía: [Contratos, honorarios e imposiciones](/ayuda/contratos).
<!-- preguntas: dónde están los trabajadores; ficha de un trabajador; datos de un trabajador; lista de trabajadores -->

## Buscar a alguien
<!-- preguntas: cómo busco a un trabajador; buscar por rut; encontrar a una persona; ver los trabajadores de un grupo; quiénes cobran en efectivo -->

La lista aparece al buscar o al elegir un filtro. Escribe parte del nombre, en cualquier orden ("perez ana" encuentra a Ana Pérez), o parte del RUT, con o sin puntos.

![La lista de trabajadores](help/trabajadores/01-lista.webp)

- Los filtros se combinan con la búsqueda: **👥 Líder**, **💵 Efectivo** o **🏦 Transferencia**, **📄 Contrato** (con contrato, a honorarios o sin nada, el empleador y el mandante) y **⚠ Sin titular**. **✕ Limpiar filtros** los quita todos.
- Toca un RUT para copiarlo sin puntos y con guion, listo para pegar.
- Cada fila dice si la persona cobra por **🏦 Transferencia** o en **💵 Efectivo**, y tiene **📊** (su resumen), **Editar** (su ficha) y **✕** (eliminarla).

## Agregar un trabajador
<!-- preguntas: cómo agrego un trabajador nuevo; crear un trabajador; inscribir a una persona; registrar a alguien nuevo -->

1. Toca **+ Nuevo trabajador**.
2. Escribe el **RUT** y el **Nombre**. Si ya hay alguien con un nombre muy parecido, TeRRa lo muestra en **Posibles duplicados**: revisa que no sea la misma persona. Si de verdad es otra, marca la casilla para confirmarlo.
3. Elige su **Líder de grupo**. **+ Crear nuevo líder...** es solo para un grupo que todavía no existe.
4. Completa cómo cobra (ver la sección siguiente) y toca **Guardar**.

![Un trabajador nuevo con un posible duplicado](help/trabajadores/02-nuevo.webp)

También se puede agregar a alguien desde la grilla, al sumarlo a una labor: ver [Agregar a una persona a la labor](/ayuda/grilla-del-ciclo#agregar-a-una-persona-a-la-labor).

## Cómo cobra: banco o efectivo
<!-- preguntas: cambiar la cuenta de un trabajador; cuenta rut; pagar en efectivo; cambiar el banco; datos bancarios -->

En la ficha, **Forma de pago** dice cómo le llega la plata:

![La forma de pago en la ficha](help/trabajadores/03-forma-de-pago.webp)

- **🏦 Banco**: el **RUT de pago**, el **Tipo de cuenta**, el **Número de cuenta** y el **Banco**. Con Cuenta RUT, TeRRa pone el Banco Estado y el número (el RUT sin el dígito verificador).
- **🆔 Asignar Cuenta RUT** deja la Cuenta RUT del propio trabajador en un toque.
- **💵 Efectivo**: no va en el archivo del banco; la nómina lo junta en el efectivo. Si después vuelve a **🏦 Banco**, recupera la cuenta que tenía.
- Para cambiarlo en una sola nómina, sin tocar la ficha, se usa su vista previa: ver [Revisar la vista previa](/ayuda/nomina#revisar-la-vista-previa).

## Cobrar en la cuenta de otra persona
<!-- preguntas: el trabajador cobra en la cuenta de otro; cuenta de un familiar; titular de la cuenta; falta el titular; pagar a otra persona -->

Si el **RUT de pago** no es el del trabajador, la ficha pide el **Nombre del titular** (o **Nombre de quien cobra**, en efectivo). Va en el archivo del banco, así queda claro a quién se le pagó.

- En la lista, la columna **Titular** muestra ese nombre; en el teléfono, **Cuenta de**.
- Si falta, la lista dice **⚠ Falta el titular**, y el filtro **⚠ Sin titular** junta a todos a los que les falta. Escribe el nombre en la ficha y toca **Guardar**.

## Datos personales
<!-- preguntas: dirección del trabajador; afp del trabajador; fecha de nacimiento; nacionalidad; estado civil; previsión de salud -->

**Datos personales**, en la ficha, guarda la dirección, la comuna, la nacionalidad, el estado civil, la fecha de nacimiento, la AFP y la salud: lo que piden los contratos y las boletas de honorarios. Viene plegado y dice cuántos de los 7 están completos; tócalo para abrirlo.

![Los datos personales de la ficha](help/trabajadores/04-datos-personales.webp)

## Ver lo que trabajó una persona
<!-- preguntas: cuánto ha ganado un trabajador; días trabajados de una persona; resumen del trabajador; detalle de jornadas de un trabajador -->

**📊**, en la fila de la persona, muestra lo que trabajó en los ciclos abiertos, día por día y con el total.

![El resumen de un trabajador](help/trabajadores/05-resumen.webp)

- **📂 Por ciclo** separa cada ciclo; **📜 Cronológico** junta todos los días en orden.
- **📂 Incluir ciclos cerrados** suma también los cerrados, dentro de las fechas que elijas.
- **📋 Copiar imagen**, **📥 Descargar PNG** e **🖨 Imprimir** lo comparten tal como se ve.
- **📊 Resúmenes por grupo**, arriba de la lista, arma lo mismo para varias personas a la vez.

## Corregir el RUT o eliminar a alguien
<!-- preguntas: corregir el rut; cambiar rut provisorio; cédula extranjera; eliminar un trabajador; borrar un trabajador duplicado -->

- El **RUT** se corrige en la ficha, por ejemplo de una cédula provisoria al RUT definitivo. Lo ya registrado con el RUT anterior sigue siendo de la misma persona.
- **✕** elimina a una persona solo si no tiene días registrados. Una ficha duplicada con días se une a la otra con **🔀** (ver "Unir una ficha duplicada").
- Los **IDs QR** se ven en la ficha, pero se asignan en **Pesajes QR**.

## Unir una ficha duplicada
<!-- preguntas: trabajador duplicado; dos fichas de la misma persona; unir fichas; pasar las jornadas a otra ficha; rut provisorio de otra empresa; juntar dos trabajadores -->

Si una persona quedó con dos fichas, por ejemplo porque la importación de cosecha la creó con el RUT provisorio que le dio otra empresa, une la duplicada a la que se queda:

1. En la fila de la ficha duplicada, toca **🔀**.
2. Busca la ficha que se queda y toca **Unir con esta**.
3. Revisa lo que pasa. Si las dos tienen jornada el mismo día, en la misma labor y el mismo tipo, elige cuál queda; en cosecha también se pueden sumar.
4. Escribe **unir** y toca **Unir fichas**.

![Unir una ficha duplicada](help/trabajadores/07-unir-fichas.webp)

- Las jornadas sin nómina pasan a la ficha que se queda. Las que ya están en una nómina no se tocan.
- La ficha duplicada deja de aparecer en Trabajadores y en los buscadores. Sus pagos anteriores se ven en el historial de Nómina de la que se queda, y sus pesajes, en Cosecha QR con los de ella.
- Su RUT queda apuntando a la que se queda: la próxima importación calza con ella, y no se puede crear otra ficha con ese RUT.
- No se puede unir una ficha con QR, con anticipos o bonos con saldo, con contratos, o con jornadas sin nómina en un ciclo cerrado: el aviso dice qué resolver antes.

## En el teléfono
<!-- preguntas: trabajadores en el celular; buscar un trabajador desde el teléfono -->

En el teléfono la lista pasa a tarjetas, con los mismos datos y botones. Toca el RUT (📋) para copiarlo.

![La lista en el teléfono](help/trabajadores/06-telefono.webp)

## Si algo no funciona
<!-- preguntas: no aparece el trabajador; no me deja guardar la ficha; ya existe un trabajador con ese rut; no puedo eliminar un trabajador -->

- **La lista está vacía**: escribe al menos 2 letras o números, o elige un filtro.
- **"Ya existe un trabajador con ese RUT"**: búscalo por el RUT; puede estar con otro nombre.
- **"El RUT de pago es de otra persona"**: falta el **Nombre del titular**.
- **No se puede eliminar**: la persona tiene días registrados.
- **Alguien inscrito con el escáner no aparece**: aparece solo en menos de un minuto, o al tiro con **Recargar datos** en Nómina.
`,rn=`# Contratos, honorarios e imposiciones

En **Trabajadores** se lleva quién tiene contrato, quién trabaja a honorarios y quién no tiene nada, con qué empleador, para qué mandante y desde cuándo. Con eso TeRRa arma la lista de boletas de honorarios y la de imposiciones del mes para el contador, con los días que trabajó cada persona. Todo está en las pestañas **📄 Contratos**, **🧾 Honorarios** y **🏛 Imposiciones**.
<!-- preguntas: contratos de los trabajadores; quién tiene contrato; trabajadores a honorarios; imposiciones; boletas de honorarios -->

## Antes de empezar: los empleadores
<!-- preguntas: agregar un empleador; empresa empleadora; cambiar el nombre de la empresa; desactivar un empleador -->

Cada contrato y cada período a honorarios es con un empleador. En **📄 Contratos**, toca **⚙ Empleadores**:

![Los empleadores](help/contratos/01-empleadores.webp)

- Escribe el nombre y el RUT, y toca **+ Agregar**.
- **✏️ Editar** corrige uno.
- **Desactivar** deja de ofrecerlo al contratar; sus períodos se conservan.

## Los mandantes
<!-- preguntas: empresa mandante; agregar un mandante; para qué empresa trabaja; separar los contratos por mandante; cliente del contrato -->

El mandante es la empresa para la que se presta el servicio. Cada contrato o período a honorarios puede llevar uno, y con eso se filtran los contratos y se arman las listas de honorarios o de imposiciones de un solo mandante. En **📄 Contratos**, toca **⚙ Mandantes**: se agregan, corrigen y desactivan igual que los empleadores.

![Los mandantes](help/contratos/02-mandantes.webp)

- Al contratar se elige el **Mandante**. Se puede dejar en **Sin mandante**.
- Para ponérselo a contratos que ya existen, márcalos en **Vigentes** (o en **Finiquitos**), toca **🤝 Mandante (N)**, elige el mandante y toca **Guardar**. Ahí mismo, **Sin mandante** se lo quita.

![El mandante para los contratos elegidos](help/contratos/05-mandante-en-bloque.webp)

- En la ficha del trabajador, **✏️** en un período lo cambia.

## Contratar a varias personas de una vez
<!-- preguntas: cómo contrato a un trabajador; hacer un contrato; contratar a todos los del ciclo; pasar a honorarios; registrar un contrato -->

1. En **📄 Contratos**, toca **+ Contratar**.
2. Elige el **Tipo** (**📄 Contrato** o **🧾 Honorarios**), el **Empleador**, la fecha **Desde** y, si corresponde, el **Mandante**.
3. Suma a las personas una por una con el buscador, o elige un ciclo en **O desde un ciclo abierto**: TeRRa suma a quienes están en sus labores y no tienen contrato ni honorarios en esa fecha. Quita con **✕** a quien no va.
4. Toca **Contratar (N)** (o **Pasar a honorarios (N)**). TeRRa revisa que nadie tenga ya un período en esa fecha y guarda. Si alguien lo tiene, lo muestra con el motivo y espera: **Contratar a N** guarda a los demás.

![Contratar a la gente de un ciclo](help/contratos/03-contratar.webp)

## Ver quién tiene contrato
<!-- preguntas: lista de contratos vigentes; quién está a honorarios; ver los contratos; cuántos tienen contrato; ver los contratos que hizo otra persona -->

**Vigentes** lista los contratos y honorarios de hoy, con el empleador, el mandante y las fechas. Arriba se cuenta cuántos tienen contrato, cuántos están a honorarios y cuántos finiquitos faltan por cerrar.

![Los contratos vigentes, con una persona elegida](help/contratos/04-vigentes.webp)

- Se filtra por tipo, por empleador, por mandante (o **Sin mandante**, para ver a quién le falta) y por nombre o RUT.
- El nombre de una persona abre su ficha.
- Lo que otra persona contrata o termina en su computador aparece al entrar a la pestaña, como mucho un minuto después. Para verlo al tiro, toca **↻**, al lado de los totales.
- En **👷 Trabajadores**, el filtro **📄 Contrato** muestra a quienes tienen contrato, están a honorarios o no tienen nada, y se puede afinar por empleador y por mandante.

## Terminar contratos
<!-- preguntas: terminar un contrato; despedir a un trabajador; fin de faena; renuncia; dar de baja a un trabajador; terminar honorarios -->

1. En **Vigentes**, marca a las personas (la casilla de arriba las marca todas).
2. Toca **Terminar (N)**.
3. Elige la **Fecha de término** y el **Motivo**: término de faena, necesidad de la empresa, renuncia, mutuo acuerdo u otro.
4. Toca **Terminar N**.

![Terminar un contrato](help/contratos/06-terminar.webp)

El contrato terminado queda con el finiquito pendiente. Los honorarios no tienen finiquito.

## Seguir los finiquitos
<!-- preguntas: finiquitos pendientes; pedir el finiquito al contador; finiquito listo; estado del finiquito -->

**Finiquitos** muestra los contratos terminados, con el motivo y el estado del finiquito: **Pendiente**, **Solicitado** (al contador) o **Listo**. Marca a varios y toca **Marcar solicitado** o **Marcar listo**: queda con la fecha del día. Los listos se siguen viendo por 90 días.

![Los finiquitos](help/contratos/07-finiquitos.webp)

## El historial de una persona
<!-- preguntas: historial de contratos de un trabajador; corregir la fecha de un contrato; eliminar un contrato mal hecho; contrato anterior -->

En la ficha del trabajador (**Editar** en **👷 Trabajadores**, o su nombre en **📄 Contratos**), **Contrato u honorarios** muestra su situación de hoy y todos sus períodos.

![El historial en la ficha](help/contratos/08-historial.webp)

- **+ Período** agrega uno, por ejemplo uno anterior.
- **✏️** corrige un período y **🗑️** elimina uno cargado por error. Para cerrar el de hoy, usa **Terminar**.
- Dos períodos de una persona no pueden cruzarse: TeRRa avisa con cuál choca.

## Ver en la grilla quién tiene contrato
<!-- preguntas: grilla por contrato; ver en el ciclo quién tiene contrato; separar a los de honorarios en la grilla -->

En la grilla del ciclo, **Por contrato** junta a las personas en **Con contrato**, **A honorarios** y **Sin contrato ni honorarios**, según lo que tuvieron en algún día del ciclo. Quien tuvo contrato y honorarios en el mismo ciclo va con contrato. Se ve en la grilla, no en la lista del teléfono.

![La grilla por contrato](help/contratos/09-grilla-por-contrato.webp)

## Generar la lista de honorarios
<!-- preguntas: cómo hago las boletas de honorarios; lista de boletas; cuánto pagar a honorarios; calcular los honorarios; nómina de honorarios; honorarios de una sola faena; falta la dirección de la boleta; días trabajados de honorarios -->

1. En **🧾 Honorarios**, toca **+ Generar lista**.
2. Elige el **Empleador**, el **Mandante** (o **Todos los mandantes**) y las fechas (**Desde** y **Hasta**; vienen del primero del mes a hoy), y toca **Calcular días**.
3. TeRRa arma una fila por persona y faena con los días que trabajó a honorarios con ese empleador y, si elegiste uno, para ese mandante. Un día cuenta si tiene al menos una jornada, y un día con jornadas en dos faenas cuenta una sola vez.
4. Corrige los **Días**, quita a alguien con **✕** o súmalo en **Sumar a alguien**. **📅**, al lado de los días, muestra un calendario con los días que trabajó y lo ganado cada uno: aparece al pasar el mouse, y con un clic (o un toque, en el teléfono) queda abierto. Si hay varias faenas, en **Faenas** toca las que no van para sacarlas de la lista (otro toque las vuelve a poner). Para quedarte con unas pocas, toca **Ninguna** y después las que sí.
5. Revisa el aviso **Sin dirección**: la boleta la pide. Toca **Falta la dirección · agregar** en la fila, escribe la dirección y la comuna, y toca **Guardar**: queda en la ficha de la persona.
6. Toca **Guardar lista**.

![Una lista de honorarios recién calculada, con sus dos faenas](help/contratos/10-generar-honorarios.webp)

![La dirección que falta, desde la lista](help/contratos/11-direccion.webp)

**Los montos**: cada día se paga un **Líquido por día** fijo, y la boleta retiene un porcentaje (**Retención**). El bruto es lo que va en la boleta. Por ejemplo, 3 días a $18.452 son $55.356 líquidos y $65.316 brutos. La tarifa se puede cambiar para una lista; la de siempre la cambia un admin en **⚙ Tarifa**.

## Anotar las boletas emitidas
<!-- preguntas: anotar el folio de la boleta; boleta emitida; cuántas boletas faltan; excel de honorarios -->

Al guardarla, la lista se abre. Escribe el **Folio** de cada boleta emitida (queda marcada, con la fecha del día) y toca **Guardar**.

![Las boletas de una lista](help/contratos/12-boletas.webp)

- En **🧾 Honorarios**, cada lista dice cuántas boletas lleva emitidas.
- **📊 Excel** baja la lista por faena, con el RUT, los días, el bruto, la retención, el líquido y la dirección.
- Una lista sin boletas emitidas se puede eliminar con **🗑 Eliminar lista**.

## Generar la lista de imposiciones del mes
<!-- preguntas: cómo hago las imposiciones; lista para el contador; días imponibles; imposiciones del mes; pedir las liquidaciones; imposiciones de una sola faena; sueldo base y bono de las imposiciones; qué días trabajó -->

1. En **🏛 Imposiciones**, toca **+ Generar lista**.
2. Elige el **Empleador**, el **Mandante** (o **Todos los mandantes**) y el **Mes** (viene el mes anterior). Revisa el **Mínimo por día**, que viene del indicador **Día**, y toca **Calcular días**.
3. TeRRa arma una fila por persona y faena con los días que trabajó dentro de su contrato, lo que ganó esos días, el **Sueldo base** y el **Bono**. Con un mandante, entran solo los contratos de ese mandante. **📅** muestra el calendario de los días que trabajó, con lo ganado cada día. Si el contrato terminó ese mes, la fila pide **Liquidación + finiquito**, con la fecha y el motivo; si no, **Liquidación**. Quien tuvo contrato y no trabajó va en **Sin días trabajados**.
4. Corrige los días, quita o suma a alguien, y deja en **Faenas** solo las que van, igual que en honorarios. Toca **Guardar lista**.

![Una lista de imposiciones, con el sueldo y el bono](help/contratos/13-generar-imposiciones.webp)

![Los días que trabajó una persona, al pasar por 📅](help/contratos/14-dias-trabajados.webp)

**El sueldo y el bono**: se declara el mínimo por cada día trabajado, y lo que ganó por sobre eso va como bono. Por ejemplo, 10 días a $17.967 son $179.670 de sueldo base; si ganó $250.000, el bono es $70.330. Si ganó menos que el mínimo, el sueldo queda en el mínimo, el bono en $0 y la fila se marca con **⚠** para que la revises. Al corregir los días, el sueldo y el bono se recalculan.

## Enviar las imposiciones al contador
<!-- preguntas: mandar las imposiciones al contador; excel de imposiciones; lista enviada al contador -->

En la lista guardada, **📊 Excel** la baja con una sección por faena, con los días, lo ganado, el sueldo y el bono. Después de mandarla, toca **Marcar enviada al contador**: queda con la fecha del día. Mientras no se envíe, se puede eliminar.

![La lista guardada, lista para enviar](help/contratos/15-enviar-imposiciones.webp)

## En el teléfono
<!-- preguntas: contratos en el celular; terminar contratos desde el teléfono -->

En el teléfono, los contratos y los finiquitos pasan a tarjetas, cada una con su casilla para elegirla.

![Los contratos en el teléfono](help/contratos/16-telefono.webp)

## Si algo no funciona
<!-- preguntas: no aparece en la lista de honorarios; faltan días en las imposiciones; no puedo contratar a alguien; no me deja eliminar la lista; no veo el contrato que hizo otra persona -->

- **No ves un contrato que otra persona acaba de hacer**: la lista se pone al día al entrar a la pestaña, como mucho una vez por minuto. Toca **↻**, al lado de los totales, para traerlo al tiro.
- **Alguien quedó afuera al contratar**: ya tiene un período en esa fecha. Revisa su historial en la ficha.
- **Falta alguien en la lista de honorarios o de imposiciones**: no tenía honorarios o contrato con ese empleador (o con ese mandante) en esas fechas, o no tiene jornadas. Revisa su mandante en **Vigentes**, o súmalo con **Sumar a alguien**.
- **Los días no calzan con la grilla**: un día con jornadas en dos faenas cuenta una sola vez, en la de mayor monto. Corrige los días antes de guardar.
- **Una fila de imposiciones tiene ⚠**: lo que ganó esos días no alcanza el mínimo, como un mensual que solo tiene asistencia. El sueldo queda en el mínimo y el bono en $0; revisa sus días con **📅**.
- **No se puede eliminar una lista**: la de honorarios ya tiene boletas emitidas, o la de imposiciones ya se marcó enviada (**Marcar no enviada** lo deshace).
- **No aparece un empleador o un mandante al contratar**: está desactivado. Actívalo en **⚙ Empleadores** o **⚙ Mandantes**.
`,sn=`# El resumen del ciclo

**📊 Resumen ciclo**, arriba de la grilla, junta lo que se produjo en el ciclo, día por día y por labor, listo para mandar. **Para pagar** muestra lo que se le paga a la gente, y **Para cobrar** lo que se le cobra al cliente, con las tarifas acordadas. Se copia como imagen, se descarga, se imprime o se baja en Excel.
<!-- preguntas: resumen del ciclo; cuánto se produjo en el ciclo; informe del ciclo; mandar el resumen al cliente -->

## Abrir el resumen
<!-- preguntas: dónde está el resumen del ciclo; ver el resumen; abrir el resumen -->

En la grilla del ciclo, toca **📊 Resumen ciclo**. Arriba se elige **Para pagar** o **Para cobrar**, y a la derecha se ve el total.

![El botón del resumen](help/resumen-del-ciclo/01-abrir.webp)

**📊 Resumen**, en la fila del ciclo en **Faenas**, es otro: muestra la producción con su rendimiento, sin montos para pagar ni cobrar.

## Para pagar
<!-- preguntas: cuánto hay que pagar del ciclo; resumen para pagar; detalle por trabajador y día; observaciones del día en el resumen -->

![El resumen para pagar](help/resumen-del-ciclo/02-pagar.webp)

- Una tabla por labor, día por día, con lo producido y lo que se paga; el transporte, por transportista; y el **TOTAL GENERAL**.
- Debajo, las **observaciones** de cada día: las notas que en la grilla se ven en el encabezado de la fecha.
- Al final, una grilla por labor con cada persona y lo que hizo cada día. Cada una tiene sus propios botones para copiarla, descargarla, imprimirla o bajarla en Excel.

## Para cobrar: las tarifas
<!-- preguntas: cuánto le cobro al cliente; tarifa de cobro; resumen para cobrar; cambiar la tarifa del cliente -->

1. Toca **Para cobrar** y después **✏️ Editando**.
2. Se abre el panel de tarifas (**Editar tarifas cobro**, que se pliega tocándolo). Cada labor y cada transportista traen una **Tarifa cobro** sugerida: el precio más común del día (**Pago tipo**). Cámbiala por la que se acordó con el cliente.
3. **Incluir** deja una labor fuera del cobro.
4. Al terminar, vuelve a **🔒 Bloqueado**.

![Las tarifas de cobro](help/resumen-del-ciclo/03-tarifas.webp)

Lo que se cambia en el cobro se guarda para todo el equipo: quien abra el resumen después lo ve igual, y **Última edición** dice quién lo cambió y cuándo. No cambia lo que se paga.

## Ajustar un día o agregar uno
<!-- preguntas: corregir la cantidad a cobrar; agregar un día al cobro; ajuste manual; cobrar un día que no está; cambiar el valor de un día -->

Con **✏️ Editando**, cada fila del cobro se puede cambiar: la cantidad, el valor o el total. Vaciar un campo vuelve al valor de la grilla.

![Un día ajustado, en edición](help/resumen-del-ciclo/04-ajustar.webp)

- **+ Agregar día / ajuste manual** suma una fila, marcada **(ajuste)**, que se quita con **✕**.
- En una jornada con horas extras, **Cobrar horas extras** decide si las horas se cobran o solo las jornadas.
- Mientras se edita, el resumen lleva la marca **EDITANDO — NO ENVIAR**.

## Juntar labores o traer las de otro ciclo
<!-- preguntas: juntar dos labores en una tabla; importar ciclos anteriores; cobrar varios ciclos juntos; sumar otro ciclo al cobro -->

- En el panel de tarifas, **Juntar con** muestra una labor dentro de la tabla de otra, con un solo subtotal. El total no cambia.
- **📥 Importar ciclos anteriores** trae labores de otros ciclos de la misma subfaena: primero se eligen los ciclos y después sus labores. Cada una entra con su propia tabla, y se le pueden poner tarifas y ajustes.
- Lo importado es una copia: si después cambia el ciclo de origen, quítalo (**✕ Quitar**, en el panel de tarifas) y vuelve a importarlo.

## IVA, descuento y columnas
<!-- preguntas: cobrar con iva; cobrar sin iva; total a facturar; descuento al cliente; saldo pendiente; ocultar una columna; personas por día -->

- **💰 Con IVA** o **🚫 Sin IVA**. Con IVA, el total sale como **TOTAL A FACTURAR**, con el **Valor IVA (19%)** y el **IVA incluido** debajo.
- Con **✏️ Editando**, al pie se anota un **Descuento** (antes del IVA) y un **Saldo pendiente** de cobros anteriores (después del IVA), cada uno con su motivo. Con alguno de los dos, el total queda en **TOTAL FINAL**.
- **👁 Columnas** muestra u oculta columnas. **Personas** (cuántos trabajaron cada día) viene oculta.

![El total a facturar con IVA](help/resumen-del-ciclo/05-total.webp)

## Cambiar los títulos
<!-- preguntas: cambiar el título del resumen; nombre del cliente en el resumen; cambiar el nombre de la labor en el resumen; encabezado del resumen -->

**▸ Personalizar títulos** cambia el **Título principal**, el **Subtítulo** (la razón social o el cliente) y el nombre con que sale cada labor y cada transportista. Solo cambia el resumen, no el ciclo. En **Para cobrar**, se abre con **✏️ Editando**.

## Copiar, descargar, imprimir y Excel
<!-- preguntas: copiar el resumen como imagen; descargar el resumen; imprimir el resumen; excel del resumen; mandar el resumen por whatsapp -->

- **📋 Copiar imagen** lo deja listo para pegar en WhatsApp o en un correo; **📥 Descargar PNG** lo guarda; **🖨 Imprimir** lo imprime. Salen siempre en colores claros.
- **📊 Excel** trae una hoja por tabla, igual que en pantalla, y la hoja **Total**.
- En **✏️ Editando**, copiar, descargar e imprimir piden bloquear antes (**Bloquear y copiar**): así nunca sale un resumen a medio editar. El Excel sale limpio aunque se esté editando.

![El aviso para bloquear antes de copiar](help/resumen-del-ciclo/06-bloquear.webp)

## Si algo no funciona
<!-- preguntas: no puedo copiar el resumen; no aparece editar tarifas; el resumen no tiene los cambios de otro ciclo; el cobro no cambia -->

- **Copiar o imprimir pide bloquear**: el resumen está en **✏️ Editando**. Toca **Bloquear y copiar**, o **🔒 Bloqueado**.
- **No aparecen Editar tarifas cobro ni Importar ciclos anteriores**: están en **Para cobrar** y con **✏️ Editando**.
- **Una labor importada no tiene lo último de su ciclo**: es una copia. Quítala y vuelve a importarla.
- **Un monto de la grilla no se ve en el cobro**: el día tiene un ajuste. Vacía el campo en **✏️ Editando** para volver al valor de la grilla.
`,tn=`# Transportes

En **Transportes** están los transportistas que llevan a la gente a las faenas, con sus vehículos y su tarifa, y las vueltas que hace cada uno. Las vueltas se anotan desde el ciclo y se le pagan al transportista con los resúmenes y las quincenas: ver [Pagar a los transportistas](/ayuda/pagar-transportes).
<!-- preguntas: transportistas; quién lleva a la gente; vueltas de los buses; transporte de los trabajadores -->

## Los transportistas
<!-- preguntas: ver los transportistas; transportista propio o contratado; desactivar un transportista -->

La pestaña **Transportistas** muestra una tarjeta por cada uno, con lo que se le debe (**Adeudado**), sus resúmenes pendientes y sus vueltas sueltas. Arriba se ve el total.

![Los transportistas](help/transportes/01-transportistas.webp)

- **🏠 Propios** son los vehículos de la empresa: sus vueltas van en $0. **🚚 Contratados** cobran por vuelta.
- Toca una tarjeta para ver el resumen del transportista (ver más abajo).
- **🚚 Vueltas** abre sus vueltas, **Editar** cambia sus datos y **Desactivar** lo saca de las listas sin borrar lo que ya hizo. **Mostrar inactivos** los vuelve a mostrar, con **Restaurar**.

## Agregar un transportista
<!-- preguntas: cómo agrego un transportista; nuevo transportista; agregar un bus; agregar un vehículo; tarifa por vuelta -->

1. Toca **+ Transportista**.
2. Escribe el **Alias** (como se le dice) y el **Nombre**, y elige el **Tipo**: propio o contratado.
3. La **Tarifa por defecto** es lo que cobra por vuelta; se propone al anotar una vuelta.
4. En **Vehículos**, toca **+ Vehículo** por cada uno y escribe su alias en el aviso que aparece. Después completa la patente y la capacidad.
5. Toca **Guardar**.

![Un transportista nuevo](help/transportes/02-transportista.webp)

También se puede crear al anotar una vuelta, con **+ Nuevo transportista** en la lista de transportistas.

## Anotar las vueltas del ciclo
<!-- preguntas: cómo anoto una vuelta; registrar el viaje del bus; anotar transporte en el ciclo; agregar una vuelta -->

1. En la grilla del ciclo, toca **🚐 Transportes**.
2. Elige el día a la izquierda: a la derecha se ven sus vueltas.
3. Toca **+ Agregar vuelta**.

![Las vueltas de un día del ciclo](help/transportes/03-vueltas-del-ciclo.webp)

4. Busca al transportista por su alias, su nombre o su vehículo: arriba salen los **RECIENTES** de este ciclo. Elige el **Vehículo**.
5. Completa el **Tipo** (vuelta o acercamiento), la **Labor** si el ciclo tiene varias y la vuelta es de una sola, el **Lugar (origen)** y el **Destino**, el **N° personas** y la **Cantidad de vueltas**. La **Tarifa por vuelta** viene del transportista; el **Monto** es vueltas × tarifa.
6. Toca **Guardar**.

![Una vuelta nueva](help/transportes/04-agregar-vuelta.webp)

## Ver y corregir las vueltas
<!-- preguntas: ver todas las vueltas; corregir una vuelta; eliminar una vuelta; vueltas de un transportista; buscar una vuelta -->

La pestaña **Vueltas** lista las de todos los ciclos, por transportista, con el **Total filtrado**. **Expandir todos** abre las vueltas de cada uno.

![La lista de vueltas](help/transportes/05-vueltas.webp)

- Se filtra por **Transportista**, **Estado**, **Faena** y **Ciclo**. Por defecto muestra los últimos 90 días: cambia la fecha de **Mostrar**, o marca **ver histórico completo**.
- Cada vuelta se corrige con **Editar** y se elimina con **✕**, mientras no esté pagada.

## Poner el precio a las vueltas que no lo tienen
<!-- preguntas: vueltas sin precio; vuelta en cero; falta la tarifa de una vuelta; corregir la tarifa de varias vueltas -->

Cuando hay vueltas de transportistas contratados sin tarifa, en **Transportistas** aparece **⚠ Vueltas sin precio (N)**.

1. Tócalo: salen agrupadas por transportista, con su fecha, vehículo, vueltas y destino.
2. Escribe la tarifa de cada una, o toca **Usar $X en todas** para ponerles la tarifa por defecto del transportista.
3. Toca **Guardar**: se recalculan el monto de cada vuelta y el total de su resumen y su quincena.

![Las vueltas sin precio](help/transportes/06-sin-precio.webp)

Las vueltas de un transportista propio no aparecen: van en $0 a propósito.

## El resumen de un transportista
<!-- preguntas: cuánto se le debe a un transportista; resumen del transportista; deuda con el transportista; mandarle el detalle al transportista -->

Al tocar la tarjeta de un transportista se abre su resumen: una fila por quincena, los resúmenes sueltos (**Sin quincena**) y las **Vueltas sin resumen**, con lo pagado y lo pendiente de cada uno. Debajo, el detalle de las vueltas, con los abonos de cada resumen y, en uno pagado, su liquidación.

![El resumen de un transportista](help/transportes/07-resumen-transportista.webp)

- **Incluir pagados** suma lo ya pagado en un rango de fechas; **🚚 Detalle de quincenas** muestra también las vueltas de cada quincena.
- **📋 Copiar imagen**, **📥 Descargar PNG** e **🖨 Imprimir** lo comparten tal como se ve.

## Si algo no funciona
<!-- preguntas: no aparece el transportista; no puedo editar una vuelta; no aparece el vehículo -->

- **No aparece el transportista al anotar una vuelta**: está desactivado. Actívalo con **Mostrar inactivos** → **Restaurar**.
- **No aparece el vehículo**: agrégalo en **Editar** → **+ Vehículo**.
- **No se puede editar ni eliminar una vuelta**: ya está pagada. Para cambiarla hay que revertir el pago de su quincena.
- **Una vuelta no aparece en la lista**: es de hace más de 90 días; marca **ver histórico completo**.
`,ln=`# Pagar a los transportistas

Las vueltas de un transportista se le pagan en dos pasos. Primero se juntan en un **resumen**, el detalle que se le manda para cobrar. Después los resúmenes se agrupan en una **quincena**, que se marca pagada de una vez. Para anotar las vueltas, ver la guía [Transportes](/ayuda/transportes).
<!-- preguntas: cómo le pago a un transportista; pagar el transporte; pagar las vueltas; resumen de transporte; quincena de transporte -->

## Armar los resúmenes de una faena
<!-- preguntas: generar los resúmenes de transporte; pago por faena; juntar las vueltas de un ciclo; resumen de pago de los buses -->

1. En **Pago por faena**, marca los ciclos y, si quieres, las fechas (**Desde** y **Hasta**).
2. Toca **Continuar →**.

![Elegir los ciclos](help/pagar-transportes/01-pago-por-faena.webp)

3. TeRRa muestra un resumen por transportista con sus vueltas pendientes de esos ciclos. Desmarca al que no va, o quita una vuelta con **✕**.
4. Toca **Generar N resumen(es)**.

![Los resúmenes por transportista, antes de generarlos](help/pagar-transportes/02-vista-previa.webp)

Para un solo transportista, **+ Generar resumen** en **Resúmenes** arma uno con sus vueltas pendientes en un rango de fechas.

## Revisar y mandar un resumen
<!-- preguntas: ver un resumen de transporte; mandar el detalle al transportista; corregir un resumen; agregar una vuelta al resumen; quitar una vuelta del resumen -->

La pestaña **Resúmenes** lista los pendientes y los pagados de cada transportista, con su período, su quincena y su monto. Se busca por transportista y se filtra por período o quincena.

![Los resúmenes](help/pagar-transportes/03-resumenes.webp)

Al tocar un resumen se abre su detalle, con sus vueltas:

- **📋 Copiar imagen**, **📥 Descargar PNG** e **🖨 Imprimir** lo dejan listo para mandárselo al transportista.
- **✏️ Editar resumen** permite corregir una vuelta (vueltas y tarifa) o quitarla. **+ Vuelta suelta** suma una pendiente que quedó afuera.
- **💰 Marcar pagado** paga un resumen que no está en ninguna quincena (ver [Pagar un resumen suelto](/ayuda/pagar-transportes#pagar-un-resumen-suelto)).
- **Eliminar** borra el resumen; sus vueltas vuelven a quedar sueltas. Uno que está en una quincena primero se saca de ella.
- **🖨 Imprimir varios**, en **Resúmenes**, imprime o descarga varios de una vez.

## Pagar un resumen suelto
<!-- preguntas: pagar un resumen suelto; pagar un resumen sin quincena; pagar un resumen que no está en una quincena; marcar pagado un resumen -->

Lo habitual es pagar los resúmenes en una quincena. Uno que quedó suelto se paga desde su detalle:

1. En **Resúmenes**, toca el resumen.
2. Toca **💰 Marcar pagado**. La confirmación dice cuánto falta pagar, descontados los abonos.
3. Escribe **Pagada** y toca **Confirmar pago**.

![Pagar un resumen suelto desde su detalle](help/pagar-transportes/04-pagar-suelto.webp)

El resumen y sus vueltas quedan pagados. **↶ Revertir pago**, en el mismo detalle, lo deshace. Un resumen que está en una quincena no tiene esos botones: se paga desde la quincena.

## Anotar un abono
<!-- preguntas: pagar una parte al transportista; abono al transportista; adelanto al transportista; cuánto le falta por cobrar -->

En el detalle de un resumen pendiente, **💰 Abonos** anota lo que ya se le pagó:

1. Escribe el **Monto**, la **Fecha** y una **Nota** (transferencia, efectivo, cheque…).
2. Toca **+ Abono**.

![Un abono en el resumen](help/pagar-transportes/05-abono.webp)

Arriba se ven lo **Abonado** y lo **Pendiente**, y lo que se copia o imprime cierra con el **PENDIENTE**. Cada abono se corrige con ✏️ o se quita con ✕ mientras el resumen no esté pagado.

## Armar la quincena
<!-- preguntas: crear una quincena; nueva quincena de transporte; juntar los resúmenes para pagar; quincena de los buses -->

1. En **Quincenas**, toca **+ Nueva quincena**.
2. Escribe el **Nombre** y las fechas (**Desde** y **Hasta**). Las faenas, arriba, filtran qué vueltas entran.
3. TeRRa lista a los transportistas con vueltas sueltas en esas fechas, todos marcados: para cada uno se crea un resumen.
4. En **Importar resúmenes existentes**, marca los resúmenes que ya se armaron.
5. Toca **Crear quincena**.

![Una quincena nueva](help/pagar-transportes/06-nueva-quincena.webp)

## Pagar la quincena
<!-- preguntas: marcar la quincena pagada; pagar a un solo transportista; revertir un pago de transporte; me equivoqué al marcar pagado; cuánto se le debe a cada transportista en la quincena; cuánto se le abonó a un transportista -->

Al tocar una quincena se abre su tabla: un resumen por transportista, con sus vueltas, período, estado y total, y lo que se le ha **Abonado** y lo **Pendiente** de cada uno (en el teléfono, bajo el total). Un resumen con abonos que todavía no se paga aparece **Con abonos**.

![El detalle de una quincena](help/pagar-transportes/07-quincena.webp)

- **💰 Marcar quincena pagada** marca pagados todos sus resúmenes y sus vueltas. La confirmación dice cuánto falta pagar, descontados los abonos; escribe **Pagada** para confirmarlo.
- En cada fila, **👁** abre el detalle del resumen, **💰 Pagar** paga solo ese y **✕** lo saca de la quincena (vuelve a quedar suelto).
- **↶ Revertir pago** lo deshace; se confirma escribiendo **Revertir**.
- **📋 Copiar**, **📥 PNG** e **🖨 Imprimir** sacan la tabla; **🖨 Imprimir quincena + resúmenes** agrega el detalle de cada resumen, uno por hoja.
- **▸ + Agregar resumen** suma un resumen suelto. **✏️ Editar** cambia el nombre y las fechas.

![Confirmar el pago escribiendo una palabra](help/pagar-transportes/08-confirmar-pago.webp)

Un resumen o una vuelta pagados ya no se editan: para corregirlos, primero se revierte el pago.

## Liquidar un resumen
<!-- preguntas: liquidar un resumen con abonos; pagar el saldo del resumen; terminar de pagar un resumen; cerrar un resumen abonado; pagar lo que falta de un resumen; qué es la liquidación; cuánto se pagó al liquidar -->

Un resumen con abonos sigue **Pendiente** hasta que se marca pagado, aunque lo abonado ya cubra todo. Para liquidarlo:

1. Paga lo que falta: es el **Pendiente** que muestra el detalle del resumen.
2. Si está en una quincena, toca **💰 Pagar** en su fila de la quincena. Si está suelto, toca **💰 Marcar pagado** en su detalle (ver [Pagar un resumen suelto](/ayuda/pagar-transportes#pagar-un-resumen-suelto)).
3. La confirmación dice cuánto falta pagar. Escribe **Pagada** y toca **Confirmar pago**.

![Liquidar un resumen en su quincena](help/pagar-transportes/09-liquidar.webp)

El resumen y sus vueltas quedan pagados, y lo abonado queda como está, ya sin editar. En **💰 Abonos**, al final, aparece la **Liquidación**: lo que faltaba, con el día en que se marcó pagado. El pendiente queda en $0, y lo que se copia o imprime cierra igual.

![Un resumen liquidado](help/pagar-transportes/11-liquidacion.webp)

**↶ Revertir pago**, en la quincena o en el detalle del resumen suelto, lo vuelve a pendiente con lo mismo abonado, y la liquidación desaparece.

## Ver cuánto se debe
<!-- preguntas: cuánto se le debe a los transportistas; balance de transporte; balance de quincenas; deuda de transporte -->

- **Balance de quincenas**, arriba de **Quincenas**, cruza a los transportistas con las quincenas que tienen algo pendiente. **Todos los resúmenes** muestra también a quien ya cobró lo suyo. El nombre de un transportista abre su resumen.
- **Balance general de transportes**, arriba de **Resúmenes**, suma por transportista lo que se debe en vueltas sueltas, resúmenes y quincenas, en un rango de fechas.

![El balance de quincenas](help/pagar-transportes/10-balance.webp)

## Si algo no funciona
<!-- preguntas: no aparece el transportista en la quincena; no puedo eliminar un resumen; el resumen no cuadra; el resumen quedó en cero pero sigue pendiente; no puedo pagar un resumen; no aparece el botón para pagar el resumen -->

- **Un transportista no aparece al armar la quincena**: no tiene vueltas sueltas en esas fechas o en esas faenas. Si ya tiene un resumen, impórtalo.
- **No se puede eliminar un resumen**: está en una quincena. Sácalo con **✕** en la quincena.
- **El pendiente de un resumen está en $0, pero sigue Pendiente**: los abonos no lo cierran solos. Márcalo pagado (ver [Liquidar un resumen](/ayuda/pagar-transportes#liquidar-un-resumen)).
- **El detalle del resumen no tiene 💰 Marcar pagado**: está en una quincena, y se paga desde ella, con **💰 Pagar** en su fila.
- **No se puede editar una vuelta o un resumen**: ya está pagado. Revierte el pago primero.
- **El total de un resumen cambió**: se corrigió una de sus vueltas. TeRRa recalcula el resumen y la quincena solo.
`,cn=`# Facturación

Facturación lleva el libro de compras y ventas de cada empresa, con lo que se baja del Registro de Compras y Ventas (RCV) del SII. Las facturas se emiten en el portal del SII; acá se importan, se marca si están pagadas y se ve cuánto falta por cobrar.
<!-- preguntas: facturas; libro de compras y ventas; registro de compras y ventas; para qué sirve facturación -->

## Las empresas
<!-- preguntas: agregar una empresa; cambiar de empresa; facturas de otra empresa; empresa nueva en facturación -->

Cada empresa tiene su propio libro, y la que se ve se elige en el selector **🏢**, junto a las pestañas. En **⏳ Pendientes**, el selector también ofrece **Todas las empresas**.

Para agregar una, toca **🏢 Empresas** y **+ Nueva empresa**. Escribe el **RUT**, la **Razón Social** y un **Alias**, el nombre corto que se ve en la pantalla, y toca **Guardar**.

![Las empresas](help/facturacion/01-empresas.webp)

## Importar el registro del SII
<!-- preguntas: cómo importo las facturas; cargar el RCV; subir el csv del SII; importar compras y ventas; actualizar las facturas del mes -->

1. En el portal del SII, baja en CSV el registro de ventas o de compras del mes.
2. Toca **📥 Importar CSV del SII**, elige la empresa y toca **📥 Elegir archivos...**. Puedes elegir varios a la vez: de ventas y de compras, y de varios meses.
3. Revisa la vista previa: cuántos documentos trae, cuántos son **Nuevos** y cuántos **Sobreescriben** a los que ya estaban. Si el RUT del nombre del archivo no es el de la empresa, avisa. Para dejar un archivo afuera, desmárcalo.
4. Toca **Confirmar**.

![La vista previa de un archivo de ventas](help/facturacion/02-importar.webp)

**Qué pasa por detrás:** importar un mes que ya estaba lo reemplaza entero. Los documentos que ya no vienen en el archivo se borran, y los que siguen conservan su estado de pago, sus abonos y sus notas. Por eso un mes se puede volver a importar las veces que haga falta.

## Ver las facturas y las compras
<!-- preguntas: ver las facturas del mes; buscar una factura; ver las compras; facturas de un cliente; buscar por folio; facturas de otro mes -->

**📤 Facturas** son las ventas y **📥 Compras**, las compras. Las dos abren en el mes actual.

- El selector de período cambia de mes, y **Todos los períodos** los junta.
- El buscador encuentra por cliente o proveedor, RUT o folio, en todos los meses.
- Se filtra por tipo de documento y, en Facturas, por estado de pago.
- Al tocar un encabezado (**Fecha**, **Total**…) se ordena por esa columna.
- Arriba están los totales del período. Las notas de crédito restan.

![Las facturas del mes](help/facturacion/03-facturas.webp)

## Marcar si una factura está pagada
<!-- preguntas: marcar una factura pagada; estado de pago de una factura; factura anulada; solo neto; factura cedida; factoring; nota de crédito -->

En **📤 Facturas**, la columna **Estado** de cada fila dice cómo está:

- **No pagado**: falta cobrarla. Así llega al importarla.
- **Pagado**.
- **Solo neto**: el cliente pagó el neto y retuvo el IVA. Sale en **📑 Retenciones**.
- **Solo IVA**: la factura se cedió por factoring, y el neto ya lo pagó la empresa de factoring.
- **Anulada**: una nota de crédito la anuló.

Cuando una nota de crédito tiene el mismo cliente y el mismo total que una factura, la fila muestra **⚠ NC?**. Tócalo: el detalle muestra la nota, y **Marcar como Anulada** cambia el estado y lo anota en las notas de la factura.

![Una nota de crédito que podría anular una factura](help/facturacion/04-nota-de-credito.webp)

## Anotar un pago o un abono
<!-- preguntas: registrar un pago de una factura; abono a una factura; pago parcial; cuánto falta por cobrar de una factura; agregar una nota a una factura -->

1. Toca **ℹ** en la fila de la factura.
2. En el detalle, toca **+ Registrar pago / abono**.
3. Elige la fecha, el tipo y el monto. Con **Total**, el monto es lo que falta; con **Solo neto** o **Solo IVA**, el neto o el IVA de la factura.
4. Toca **Registrar pago**.

![Un abono en el detalle de una factura](help/facturacion/05-abono.webp)

La columna **Abonos** muestra lo pagado y el saldo. Un pago no cambia el estado: cuando la factura quede pagada, márcala **Pagado**. En el mismo detalle se escriben notas internas, en **Notas / glosa (interno)**.

## Ver lo que falta por cobrar
<!-- preguntas: facturas pendientes; cuánto nos deben; facturas sin pagar; pendientes de cobro; quién nos debe; iva pendiente por cliente; iva retenido por mes; marcar pagada una factura; pendientes de todas las empresas -->

La pestaña **⏳ Pendientes**, la última, junta las facturas de venta que tienen saldo, de cualquier mes. Muestra las de la empresa del selector **🏢** o, con **Todas las empresas**, las de todas, y su número dice cuántas son. Los botones **Factura completa**, **Abono parcial** e **IVA pendiente** filtran, el buscador encuentra por cliente, RUT o folio, y los cuadros dicen cuánto suma cada uno.

- **Facturas por cobrar**: las que se deben completas y las que tienen abonos, por cliente, con el total de cada uno. Con todas las empresas, cada factura dice de cuál es, y el total de un cliente que les debe a dos dice cuánto a cada una.
- **IVA pendiente**: las facturas **Solo neto**, por cliente y por mes, del más viejo al más nuevo, con el IVA pendiente de cada mes y el total del cliente.

![Lo que falta por cobrar, de todas las empresas](help/facturacion/06-pendientes.webp)

El estado de cada factura se cambia en su fila, en la columna **Estado**, igual que en **📤 Facturas**. Cuando el cliente paga el IVA retenido, elige **Pagado** en su fila del IVA pendiente. Lo que cambias queda a la vista, atenuado y con el estado nuevo, hasta que sales de la pestaña; si te equivocaste, vuelve a elegir el estado en la misma fila. **ℹ** abre el detalle, donde se anotan los abonos; al cerrarlo, sigues en el mismo lugar.

![El IVA pendiente de un cliente, mes a mes](help/facturacion/07-iva-pendiente.webp)

Para marcar varias de una vez, **✓ Septiembre pagado**, en el subtotal de un mes del IVA, o **✓ Todo el IVA pagado** y **✓ Todas pagadas**, en el total de un cliente: TeRRa pregunta antes, con cuántas son y cuánto suman. Lo que se ve se copia, se descarga, se imprime o se baja en Excel.

## Las retenciones de IVA
<!-- preguntas: iva retenido; retenciones; facturas solo neto; cuánto iva nos retuvieron -->

**📑 Retenciones** lista las facturas marcadas **Solo neto**, agrupadas por cliente, con el IVA que retuvo cada uno. **▸** abre un cliente, y cada uno tiene sus botones para copiar, imprimir o bajar su detalle en Excel.

## Centros de costo y gastos informales
<!-- preguntas: centro de costo; agrupar gastos; gastos de arriendo; gasto sin factura; gasto informal; combustibles -->

- En la columna **C. Costo** de una fila se elige su centro de costo (Arriendo, Mantención…). Los combustibles se reconocen solos y llevan **⛽**.
- **🏷 Gestionar centros de costo** crea, edita y elimina centros (**🗂 Gestión de centros**), y muestra todos los documentos de un centro, de todas las empresas y meses.
- Ahí mismo, **+ Gasto informal** anota un gasto sin factura. Se suma al centro, pero no entra a las facturas ni al IVA.
- **🗂 Agrupar tabla por centro** agrupa la lista, y lo que se exporta, por centro de costo: los combustibles juntos y el resto por proveedor.

![Los documentos de un centro de costo](help/facturacion/08-centros-de-costo.webp)

## El resumen del año y el IVA
<!-- preguntas: iva a pagar; resumen anual; iva débito y crédito; ventas del año; iva del mes -->

**📊 Resumen** cruza los 12 meses del año elegido: las ventas y compras netas, el IVA débito (de las ventas), el IVA crédito (de las compras) y el **IVA a pagar** de cada mes y del año. Si da negativo, es IVA a favor.

![El resumen del año](help/facturacion/09-resumen.webp)

Un administrador ve además **📈 Proyección**, que estima los ingresos de 12 meses a partir de las ventas de los mismos meses del año anterior.

## Copiar, imprimir o bajar en Excel
<!-- preguntas: exportar las facturas a excel; imprimir las compras; copiar la tabla de facturas; bajar el libro de ventas -->

Arriba de la lista, **📋 Copiar**, **📥 PNG**, **🖨 Imprimir** y **📊 XLSX** sacan la lista tal como se ve, con sus filtros y su orden. Las demás pestañas y ventanas tienen los mismos botones.

## Si algo no funciona
<!-- preguntas: no aparece una factura; se borró una factura al importar; el rut del archivo no coincide; no puedo registrar el pago; no puedo importar -->

- **No aparece una factura**: revisa la empresa y el mes, o búscala, que la búsqueda mira todos los meses. Si es de este mes, puede que el SII todavía no la tuviera al bajar el archivo: vuelve a importarlo.
- **Una factura desapareció al importar**: ya no venía en el archivo de ese mes, y el mes se reemplaza entero.
- **La vista previa avisa que el RUT es otro**: el archivo parece de otra empresa. Revisa la empresa elegida antes de confirmar.
- **No deja registrar un pago**: los pagos de una factura no pueden pasar su total.
- **📥 Importar CSV del SII está apagado**: primero hay que agregar una empresa.
`,un=`# Cheques y pagos

Cheques y pagos lleva los vencimientos: los cheques que se emiten y los que se reciben, los pagos comprometidos, las cuotas de los créditos y las deudas. Cada mañana TeRRa manda un correo con lo que está por vencer.
<!-- preguntas: cheques; vencimientos; pagos pendientes; para qué sirve cheques y pagos -->

## Lo que viene
<!-- preguntas: qué vence esta semana; cheques por cobrar; pagos vencidos; próximos vencimientos; qué hay que pagar; buscar un cheque -->

Arriba, las tarjetas suman lo que hay **Por pagar**, lo **Vencido sin marcar**, lo que **Vence en 7 días**, lo que hay **Por cobrar** (los cheques recibidos), lo **Pagado este mes** y lo **Anulado**. Lo aplazado y lo protestado tienen su tarjeta cuando hay alguno.

- **⏳ Próximos** agrupa los **Vencidos sin marcar**, los **Cheques protestados**, los **Próximos 7 días**, el **Próximo mes** y lo que viene **Más adelante**, hasta la fecha de su título. Vacía esa fecha para verlo todo.
- **👥 Por contraparte** junta lo de cada contraparte, con la más atrasada arriba.
- **📋 Todos** es la lista completa, con un buscador, filtros por estado, tipo, empresa y fechas, y **📊 Excel**.

![Los próximos vencimientos](help/cheques-y-pagos/01-proximos.webp)

## Anotar un cheque o un pago
<!-- preguntas: anotar un cheque; agregar un cheque emitido; registrar un cheque recibido; agregar un pago; anotar una deuda -->

1. Toca **+ Agregar documento**.
2. Elige el tipo: **Cheque emitido**, **Cheque recibido**, **Pago comprometido** o **Deuda personal**.
3. Completa a quién se paga (o quién entrega el cheque), el monto, la empresa y la fecha. Un cheque lleva además el banco y su número, y su fecha es la del día en que se cobra.
4. Toca **Guardar**.

![Un cheque emitido](help/cheques-y-pagos/02-cheque.webp)

Si el nombre se parece a uno ya anotado ("Bancoestado" y "Banco Estado"), TeRRa ofrece **Usar ese nombre**: así el informe no lo cuenta como dos deudas.

## Un crédito en cuotas o un pago recurrente
<!-- preguntas: crédito en cuotas; anotar un crédito; cuotas del banco; pago todos los meses; pago recurrente; deuda en cuotas; detener un pago recurrente -->

En **+ Agregar documento**:

- **Crédito en cuotas**: el acreedor, el monto de cada cuota, la fecha de la primera y el número de cuotas. Se crea una cuota por mes, el mismo día.
- **Pago recurrente**: se repite cada mes, sin término. Para terminarlo, edita uno de sus vencimientos y toca **⏹ Detener pago recurrente**.
- Una **Deuda personal** con más de una cuota se arma igual que un crédito.

El formulario muestra los vencimientos que va a crear. Toca **Crear N vencimiento(s)**.

![Un crédito de doce cuotas](help/cheques-y-pagos/03-credito.webp)

## Marcar un pago o un cheque cobrado
<!-- preguntas: marcar un cheque cobrado; marcar pagado; pagué con intereses; pagar una cuota; cobrar un cheque -->

1. Toca **Marcar como pagado** en la fila, o **Marcar como cobrado** si es un cheque.
2. Elige la fecha y revisa el monto. Si se pagó más que el original, por intereses o un recargo, escribe lo que se pagó: la diferencia queda como interés.
3. Toca **Confirmar**.

![Marcar pagado un pago vencido](help/cheques-y-pagos/04-pagar.webp)

Si fue un error, **⋯** y **↶ Volver a pendiente** lo deshace.

## Aplazar, protestar, reprogramar o anular
<!-- preguntas: aplazar un pago; cheque protestado; cheque rechazado; cambiar la fecha de un pago; anular un cheque; reprogramar un pago -->

En el menú **⋯** de cada fila:

- **⏸ Aplazar**: ya venció, se sigue debiendo y todavía no hay fecha de pago. Deja de repetirse a diario como vencido, pero sigue con los próximos 7 días, también en el correo.
- **⚠️ Protestado**: el banco rechazó el cheque. Se sigue debiendo, o cobrando.
- **📅 Reprogramar**: le pone una fecha nueva a uno aplazado o protestado, y lo vuelve a pendiente.
- **🚫 Anular**: ya no se va a pagar.
- **✏️ Editar** y **🗑️ Eliminar**. Para cambiar la fecha de uno pendiente, edítalo.

![El menú de un pago](help/cheques-y-pagos/05-menu.webp)

## Abonar a una deuda personal
<!-- preguntas: abonar a una deuda; pagar una parte de una deuda; abono a un préstamo; cuánto falta de la deuda -->

1. En la fila de la deuda, toca **⋯** y **💵 Abonos**.
2. Elige si el abono va a esa cuota o a **Toda la deuda (desde la cuota más antigua)**.
3. Escribe el monto, la fecha y una nota, y toca **Registrar abono**.

![Un abono a una deuda personal](help/cheques-y-pagos/06-abono.webp)

Lo que falta pagar baja con cada abono, y la cuota que queda cubierta se marca pagada sola. Un abono se quita con **✕**.

## Cambiar las fechas o los montos de un crédito
<!-- preguntas: cambiar la fecha de las cuotas; correr las cuotas un mes; cambiar el monto de las cuotas; ajustar un crédito; cambiar el día de pago -->

En cualquier cuota, **⋯** y **🗂 Ajustar todas las cuotas** (en un pago recurrente, **Ajustar todos los vencimientos**) muestra los vencimientos abiertos de la serie:

- Cambia la fecha o el monto de cada uno a mano.
- O desde uno en adelante: elige **Aplicar desde** y usa **Correr meses**, **Cambiar día** o **Poner monto**.

Nada se guarda hasta **Guardar**, y lo pagado no se toca.

## El informe de deudas
<!-- preguntas: informe de deudas; cuánto debemos; pdf de las deudas; cuándo terminamos de pagar el crédito; resumen de deudas -->

**📄 Informe de deudas** arma un documento con lo que se paga, sin los cheques recibidos: el resumen, los próximos vencimientos, los vencimientos por mes y el balance de cada deuda, con su próximo pago y la fecha en que queda pagada.

- **Empresa** filtra por empresa, y **Vencimientos hasta** corta el informe en una fecha: lo de después va en una sola fila.
- **Detalle de cada pago pendiente** suma la lista de lo pendiente, que puede ir **Agrupado por contraparte**. **Incluir pagos realizados** suma lo pagado en un rango.
- Sale con **📄 Descargar PDF** o **📊 Excel**, o se imprime con **🖨 Imprimir**.

![El informe de deudas](help/cheques-y-pagos/07-informe.webp)

## Los avisos por correo
<!-- preguntas: correo de avisos; no me llegan los avisos; aviso de vencimientos; a quién le llega el correo -->

Cada mañana, a las 8:00, TeRRa manda un correo con lo que vence en los próximos días (por defecto, en 3 días, en 1 y el mismo día), lo vencido sin marcar y los próximos 7 días. Si no hay nada que avisar, no manda nada. A quién le llega y con cuántos días de anticipación lo decide un administrador.

## Si algo no funciona
<!-- preguntas: me sigue avisando un pago que ya pagué; el vencido aparece todos los días; la misma contraparte sale dos veces; no puedo quitar un abono -->

- **Sigue avisando algo que ya se pagó**: márcalo pagado. Todo lo pendiente con la fecha pasada cuenta como vencido.
- **Un vencido que no se va a pagar todavía aparece todos los días**: aplázalo.
- **La misma contraparte sale dos veces en el informe**: está escrita distinto. Edita una y usa el mismo nombre.
- **No deja quitar un abono**: la deuda se marcó pagada a mano. Vuélvela a pendiente primero.
- **Un vencimiento eliminado de un pago recurrente no vuelve**: así es, para que no reaparezca. Si hacía falta, agrégalo a mano.
`,dn=`# Cosecha QR

En la cosecha, cada trabajador lleva un QR, y la app de escaneo anota cada pesaje con su QR, su calidad, su envase y sus kilos. **📷 Cosecha QR** lleva esos pesajes al ciclo: dice a qué ciclo y labor van los de cada cosecha, los pasa a jornadas en la grilla y reparte los QR entre los trabajadores.
<!-- preguntas: cosecha qr; pesajes; qr de cosecha; app de escaneo; para qué sirve cosecha qr -->

## Apuntar un prefijo al ciclo
<!-- preguntas: nuevo prefijo; apuntar el qr al ciclo nuevo; cambiar el ciclo del prefijo; abrí un ciclo nuevo de cosecha; prefijo en rojo -->

Cada QR empieza con un prefijo (**SE-101** es del prefijo **SE**), y cada prefijo es una cosecha. En **🔄 Sincronizar cosechas**, cada prefijo dice a qué faena, ciclo y labor van sus pesajes.

1. Toca **+ Nuevo prefijo**, o **Editar** en uno que ya existe.
2. Escribe el prefijo y un nombre, y elige la **Faena**, el **Ciclo vigente** y la **Labor de cosecha vigente**.
3. Deja marcado **Activo**, para que la app de escaneo lo ofrezca, y toca **Guardar**.

![Un prefijo apuntado al ciclo de la cosecha](help/cosecha-qr/01-prefijo.webp)

**Cada vez que se abre un ciclo nuevo de esa cosecha, hay que volver a apuntar el prefijo:** TeRRa no adivina a qué ciclo van los pesajes. Un prefijo con 🔴 está mal apuntado (el ciclo se cerró, ya no existe o la labor no es de cosecha) y no deja sincronizar.

## Pasar los pesajes a la grilla
<!-- preguntas: sincronizar pesajes; pasar la cosecha a la grilla; sincronizar cosechas; los kilos no aparecen en la grilla -->

1. En la fila del prefijo, toca **🔄 Sincronizar**.
2. Revisa las fechas, que parten desde la última sincronización, y toca **Sincronizar**.

![El resultado de sincronizar](help/cosecha-qr/02-sincronizar.webp)

TeRRa suma los pesajes de cada persona por día, calidad y envase, y escribe sus jornadas en la labor con los precios del día. Si en el ciclo falta el día o la persona, los agrega. Se puede repetir las veces que haga falta: cada vez calcula desde cero.

El resultado avisa lo que no pudo hacer: un RUT sin ficha en Trabajadores, las jornadas que ya estaban en una nómina (esas no se tocan) y los días sin precio para esa calidad y envase (quedan en $0).

**En la grilla**, la labor que recibe pesajes lleva el chip **📱 SE**, y sus celdas de producción no se escriben a mano, porque la sincronización las pisaría. El piso sí se edita.

## Ver los pesajes
<!-- preguntas: ver los pesajes de un trabajador; cuántos kilos cosechó; buscar un qr; pesajes del día -->

**⚖️ Pesajes** muestra los pesajes de un rango de fechas **Por trabajador**, **Por día** o en **Detalle**, con los totales por calidad y envase. Se filtra por prefijo y se busca por RUT, nombre o QR. Los pesajes quedan guardados en el navegador un rato: **🔄 Refrescar** los vuelve a leer.

![Los pesajes por trabajador](help/cosecha-qr/03-pesajes.webp)

## Corregir o agregar un pesaje
<!-- preguntas: agregar un pesaje a mano; corregir un pesaje; se escaneó mal; pesaje que no se alcanzó a escanear -->

En **⚖️ Pesajes**:

- **+ Nuevo pesaje** los carga a mano: el trabajador, la fecha y el prefijo van una vez, y cada envase es una fila (**+ Otro pesaje** suma otra).
- **Editar** corrige uno.

Al guardar, TeRRa recalcula la jornada del ciclo de ese día; no hace falta volver a sincronizar.

## Asignar un QR a un trabajador
<!-- preguntas: asignar un qr; darle un qr a un trabajador; perdió su qr; cambiar el qr de un trabajador; quitar un qr; liberar los qr de la temporada -->

En **📱 Gestión QRs**:

1. Toca **+ Asignar QR**.
2. Escribe el **Código** (como SE-105) y el RUT de la persona, y toca **Asignar**.

![Asignar un QR](help/cosecha-qr/04-asignar.webp)

Cada persona tiene un QR por cosecha: si ya tenía uno de ese prefijo, se le quita y queda libre. Si el código era de otra persona, TeRRa avisa antes de quitárselo. En la lista, **Reasignar** y **Quitar** cambian o sueltan un código. Los pesajes anteriores siguen siendo de la misma persona.

Al terminar la temporada, **Limpiar todos** libera los QR para volver a usarlos.

## Si algo no funciona
<!-- preguntas: no puedo sincronizar; no aparecen los pesajes de alguien; la jornada quedó en cero; no puedo escribir en la cosecha; la app no reconoce el qr -->

- **🔄 Sincronizar está apagado**: el prefijo está en 🔴. Edítalo y apúntalo al ciclo abierto y a su labor de cosecha.
- **No aparecen los pesajes de alguien en la grilla**: su RUT no tiene ficha en Trabajadores. Créala y vuelve a sincronizar.
- **Una jornada quedó en $0**: ese día no tiene precio para esa calidad y envase. Ponle el precio en la grilla y vuelve a sincronizar.
- **No deja escribir en las celdas de la cosecha**: la labor recibe pesajes por QR. Corrige el pesaje en **⚖️ Pesajes**.
- **Cambió un pesaje que ya se pagó**: la sincronización no toca jornadas de una nómina. La diferencia se corrige en la nómina (ver [Corregir una nómina](/ayuda/corregir-nomina)).
- **La app de escaneo no reconoce un QR sin señal**: **Reconstruir padrones**, en **📱 Gestión QRs**, rehace la lista que lee la app.
`,pn=`# Calendario y Dashboard

El **Calendario** muestra qué se trabajó cada día del mes, en qué faena y con cuánta gente. El **Dashboard** junta los números del mes o del año: lo pagado a los trabajadores, la operación, el transporte, los cheques y pagos, y las compras y ventas.
<!-- preguntas: calendario; dashboard; resumen del mes; qué se trabajó; tablero -->

## El mes en el Calendario
<!-- preguntas: qué se trabajó cada día; ver el mes; dónde se trabajó; calendario del mes; imprimir el mes -->

Cada día del mes lista, en barras de colores, las subfaenas que trabajaron ese día. Cada subfaena tiene siempre el mismo color.

- **◀** y **▶** cambian de mes, y **Hoy** vuelve al actual.
- **↻** trae lo último, sin esperar.
- **🖨️** imprime el mes completo, con todas las faenas de cada día.

![El calendario del mes](help/calendario-y-dashboard/01-calendario.webp)

## Lo que se hizo en un día
<!-- preguntas: detalle de un día; quién trabajó ese día; cuántos kilos se cosecharon ese día; transportes del día; cuánta gente trabajó -->

- **Al tocar una barra** se abre el detalle de esa subfaena en ese día: las personas, las jornadas, la producción y el monto, **Por labor**, y los **Transportes** del día con sus vueltas.
- **Al tocar una labor** se abren sus trabajadores, del que ganó más al que ganó menos, y en la cosecha los kilos por calidad y envase.
- **Al tocar la parte blanca del día** se ven todas las subfaenas de ese día; tocar una abre su detalle.

![El detalle de un día](help/calendario-y-dashboard/02-dia.webp)

Los sábados y domingos van en rojo.

## Los números en el Dashboard
<!-- preguntas: cuánto se pagó este mes; cuánto se debe a los transportistas; ciclos sin movimiento; dashboard del año; gráficos -->

Arriba se elige el período: **Mes actual**, **3 meses** o **12 meses**. Las tarjetas se ordenan en tres bloques:

- **Plata pagada a trabajadores**: lo pagado en el período, la parte en efectivo, los anticipos descontados, las nóminas pendientes y la última nómina.
- **Operación**: los ciclos abiertos, las faenas con actividad, los registros de jornada del mes, los ciclos estancados (sin movimiento hace más de 14 días) y el margen de los ciclos.
- **Transporte**: el gasto, lo pendiente de pago, las quincenas pendientes y cuánto se llevan los tres transportistas más grandes.

![Las tarjetas del Dashboard](help/calendario-y-dashboard/03-dashboard.webp)

Más abajo están los **Cheques y pagos** atrasados o por vencer en la semana, que llevan a esa pantalla, los gráficos (lo pagado por mes, la deuda con los transportistas, la actividad, las compras contra las ventas de una empresa…) y las tablas de los **Ciclos abiertos sin movimiento** y del **Margen por ciclo**. Un punto del gráfico de la deuda con los transportistas abre los movimientos de ese mes.

## Si algo no funciona
<!-- preguntas: no aparece un día en el calendario; el dashboard no cuadra con nómina; falta algo de hoy en el calendario -->

- **Falta algo recién anotado en el Calendario**: toca **↻**.
- **Un día no muestra una faena**: ese día no tiene jornadas anotadas en su grilla.
- **Lo pagado del Dashboard no calza con un mes**: cada nómina cuenta en el mes en que se pagó.
- **El margen de un ciclo no aparece**: el ciclo todavía no tiene configurado su resumen para cobrar (ver [El resumen del ciclo](/ayuda/resumen-del-ciclo#para-cobrar-las-tarifas)).
`,mn=`# Agenda, precios y links

Tres pantallas para tener a mano lo que se consulta seguido: **Agenda y Cuentas** guarda los datos bancarios para transferir y los teléfonos de clientes, proveedores y transportistas; el **Libro de Precios**, lo que se pagó y se cobró por cada labor; y **Links útiles**, los atajos a otras páginas.
<!-- preguntas: agenda y cuentas; libro de precios; links útiles; datos de transferencia -->

## Las fichas con datos bancarios
<!-- preguntas: datos para transferir; cuenta de un proveedor; agregar una ficha; guardar una cuenta bancaria; datos bancarios de una empresa -->

En **Agenda y Cuentas**, **🏦 Información y cuentas** guarda una ficha por persona o empresa, con sus cuentas bancarias, listas para copiar.

1. Toca **+ Nueva ficha**.
2. Elige si es persona o empresa y escribe el nombre, el RUT y los datos de contacto.
3. Con **+ Agregar cuenta**, suma sus cuentas: el titular, su RUT, el banco, el tipo y el número.
4. Toca **Guardar**.

![Una ficha con su cuenta](help/agenda-precios-y-links/01-ficha.webp)

**Para copiar**, toca un dato y se copia solo ese; el RUT se copia sin puntos. **📋** copia la cuenta entera, **📋 Texto** la ficha completa y **🖼 Imagen** la ficha como imagen, para pegarla en un chat. **☆** la deja arriba, como favorita. El buscador encuentra por nombre, RUT, titular o número de cuenta.

Estas fichas no son las de Trabajadores: una persona puede estar en las dos.

## Buscar un teléfono en la agenda
<!-- preguntas: buscar un teléfono; número de un cliente; agenda telefónica; teléfono de un proveedor; contactos de una empresa -->

**📞 Agenda telefónica** es la agenda de la oficina, la misma para todos.

- Busca por nombre, empresa, cargo o número. Se filtra por tipo de contacto y por departamento, y **🏢 Por empresa** junta los contactos de cada empresa.
- **Toca el nombre** para copiar el contacto entero, o **un número o un correo** para copiar solo ese dato.
- En el teléfono, **📤** lo manda por WhatsApp o correo.
- **⋯** lo descarga como tarjeta (.vcf), que al abrirla en el teléfono se guarda en sus contactos, o lo edita o elimina.

![La agenda telefónica](help/agenda-precios-y-links/02-agenda.webp)

## Agregar o importar contactos
<!-- preguntas: agregar un contacto; importar la agenda; importar contactos de google; subir la planilla de contactos; contactos duplicados -->

- **+ Contacto** agrega uno a mano.
- **📥 Importar** suma de una vez la planilla de la agenda (.xlsx), los contactos de Google u Outlook (.csv) o tarjetas .vcf. La vista previa dice cuántos son **Nuevos**, cuántos **Se actualizan** y cuántos quedan **Sin cambios**, y nada se guarda hasta confirmar.

Un número es un contacto: lo que comparte un teléfono queda junto, así importar dos veces lo mismo no duplica. La planilla de la agenda manda sobre lo que ya está; Google, Outlook y las tarjetas solo llenan lo que falta.

**⬇ Descargar** baja la agenda filtrada en **Excel**, en el mismo formato de la planilla, para corregirla y volver a importarla, o en **Contactos (.vcf)**.

## El Libro de Precios
<!-- preguntas: cuánto se pagó por la cosecha; cuánto se cobró por una labor; precios de otras temporadas; agregar un precio; libro de precios -->

El **Libro de Precios** guarda lo que se pagó y lo que se cobró por cada labor, en cada faena y temporada. No toca los ciclos ni la nómina: es un registro para consultar.

1. Toca **+ Agregar entrada**.
2. Elige una **Faena existente** o una **Faena histórica (sin registro)**, que se escribe a mano, y la **Labor**.
3. En **Precios**, una línea por unidad (kilo, jornada…) con lo **Pagado** y lo **Cobrado**, y en las jornadas, la hora extra. **+ Agregar otra unidad de pago** suma otra.
4. En **Transporte**, marca si iba incluido en el precio o anota dónde y cuánto se cobró aparte.
5. En **Vigencia**, desde cuándo y hasta cuándo valió (vacío = vigente), y toca **Guardar**.

![El Libro de Precios](help/agenda-precios-y-links/03-libro-de-precios.webp)

El buscador encuentra por faena o labor, y **⬇ Exportar Excel** lo baja entero. **⚙ Faenas visibles** esconde del selector las faenas que no se usan.

## Los links útiles
<!-- preguntas: agregar un link; atajos; páginas que usamos; ordenar los links -->

**Links útiles** son atajos a las páginas que se usan seguido, los mismos para todos.

- **+ Nuevo link** pide el texto y la dirección.
- Para ordenarlos, arrástralos desde **⋮⋮ arrastrar**.

![Los links útiles](help/agenda-precios-y-links/04-links.webp)

## Si algo no funciona
<!-- preguntas: no aparece un contacto nuevo; contacto repetido en la agenda; no se comparte el contacto en el teléfono; falta una faena en el libro de precios -->

- **No aparece un contacto que agregaron en otro equipo**: llega solo al abrir la agenda; si no, toca **↻**.
- **Un contacto quedó repetido**: tienen números distintos. Edita uno, copia lo que falte y elimina el otro.
- **📤 no comparte la tarjeta en el teléfono**: algunos teléfonos no la aceptan. TeRRa copia el contacto como texto, y desde el siguiente toque comparte el texto.
- **Falta una faena al agregar un precio**: puede estar escondida en **⚙ Faenas visibles**, o anotarse como **Faena histórica (sin registro)**.
`,gn=`# Administración

Lo que hace un administrador: las cuentas de quienes usan TeRRa, la auditoría de los cambios, la consola y los ajustes que solo un admin ve en otras pantallas. Las pantallas de admin están en el grupo **🛡️ Admin**, al final del menú.
<!-- preguntas: administrador; qué hace un admin; menú admin; pantallas de admin -->

## Dar acceso a una persona
<!-- preguntas: crear una cuenta; dar acceso a alguien; nuevo usuario; agregar un usuario; invitar a alguien a terra -->

En **👥 Usuarios**:

1. Toca **+ Nueva cuenta**.
2. Escribe su correo, elige el rol y, si quieres, un alias, el nombre que se ve en la app.
3. Deja marcado el envío del correo para que elija su contraseña, y toca **Crear cuenta**.

![Las cuentas](help/administracion/01-usuarios.webp)

Si el correo ya tenía una cuenta (de otra app de la empresa), TeRRa lo avisa y pide confirmar antes de darle acceso: quien conozca esa contraseña va a poder entrar.

Sin perfil en Usuarios, una cuenta no entra: ve una pantalla que muestra su correo, para que se lo mande a un admin.

## Hacer admin o suspender a alguien
<!-- preguntas: hacer admin a alguien; quitar admin; suspender a un usuario; bloquear a un usuario; mandar el correo de contraseña a un usuario; cumpleaños de un usuario -->

En la tarjeta de cada cuenta:

- **Hacer admin** o **Quitar admin**. Un admin ve las pantallas de este grupo y los ajustes de las otras; los datos los ven todos igual.
- **Suspender** le corta la entrada, y **Reactivar** se la devuelve. Un admin no se suspende: primero se le quita el rol.
- **Contraseña** le manda el correo para elegir una nueva.
- **Cumpleaños** y **Saludos** personalizan la pantalla de carga y algunos mensajes de esa persona.

Nadie cambia su propio rol ni suspende su propia cuenta, así siempre queda al menos un admin. Cada tarjeta muestra cuándo se vio a la persona por última vez y su último cambio.

## Ver quién cambió algo
<!-- preguntas: quién cambió esto; auditoría; historial de cambios; quién borró; qué hizo un usuario; historial de un trabajador -->

**🛡️ Auditoría** guarda cada cambio: quién, cuándo y qué cambió.

- **🕒 Sesiones**: elige las fechas y toca **▶ Cargar**. Los cambios salen agrupados por persona, en sesiones de trabajo. **Gap sesión (min)** decide cuántos minutos sin cambios cortan una sesión.
- **🔍 Buscar por registro**: elige el **Tipo de registro** (un trabajador, un ciclo, un transportista…), toca **▶ Cargar** y elige uno. Sale todo su historial, de cualquier fecha; un trabajador trae también sus jornadas, y un transportista sus vueltas y resúmenes.

![Las sesiones de la auditoría](help/administracion/02-auditoria.webp)

Una edición guarda solo lo que cambió, con el antes y el después. Si una fila muestra un id en vez de un nombre, **🔎 Buscar nombres** los trae.

## La consola
<!-- preguntas: consola admin; respaldo de la base; cuántas lecturas hace la app; registro de lecturas; probar el backend; respaldo -->

**📟 Consola** reúne las herramientas de mantenimiento. Cada tarjeta lee recién al abrirla:

- **🧪 Ping al backend** prueba que las funciones del servidor respondan: las que crean cuentas, mandan los avisos y publican el portal.
- **💾 Respaldos en JSON**: se genera uno solo cada domingo, y **💾 Generar respaldo ahora** hace otro. **⬇ Bajar** baja uno.
- **📈 Registro de lecturas** enciende el registro de cuánto lee cada pantalla, hasta una fecha, y **📊 Informe de lecturas** lo muestra por pantalla, persona y hora.
- Los conteos por colección y de jornadas, para ver el tamaño de la base.

![La consola](help/administracion/03-consola.webp)

## Publicar una nómina en el portal
<!-- preguntas: publicar la nómina en el portal; actualizar el portal de trabajadores; cambiar la nómina del portal -->

1. Abre la nómina en **Nómina** y toca **🌐 Publicar en portal**, en su encabezado.
2. Confirma: reemplaza a la que estaba publicada.

El historial marca con **🌐 Portal** la publicada, para todos. Si la corriges después, el botón dice **🌐 Actualizar en portal**: vuelve a publicarla para que el portal muestre lo corregido.

## Ajustes de admin en otras pantallas
<!-- preguntas: formato del archivo del banco; destinatarios de los avisos; correo de avisos de cheques; importar la planilla de cheques; proyección de ingresos; importar trabajadores -->

- **Nómina**, **⚙ Configuración**: el formato del archivo del banco.
- **Cheques y pagos**: **⚙ Avisos** elige a quién le llega el correo de avisos, con cuántos días de anticipación y desde qué cuenta; **📧 Enviar prueba** lo manda ya. **📥 Importar Excel** suma la planilla de control de cheques, sin repetir los que ya están.
- **Facturación**: la pestaña **📈 Proyección** estima los ingresos de 12 meses a partir de los del año anterior.
- **📥 Migrar CSV** importa trabajadores desde un archivo: actualiza el nombre y el correo de los que ya están y crea los nuevos con su cuenta. **🧹 Limpiar pagados** suelta las jornadas de un ciclo que quedaron marcadas como pagadas por una nómina que ya no existe.

## Si algo no funciona
<!-- preguntas: una persona no puede entrar; no llega el correo de contraseña; no se publica el portal; no llegan los avisos -->

- **Alguien no puede entrar**: revisa en Usuarios que tenga su cuenta y que no esté suspendida. Si dice "Sin correo todavía", nunca ha entrado.
- **No le llega el correo para la contraseña**: que revise la carpeta de spam, o mándalo de nuevo con **Contraseña**.
- **Crear una cuenta, publicar el portal o enviar la prueba de avisos no responde**: prueba el **🧪 Ping al backend** en la consola. Si falla, el problema es del servidor, no de la pantalla.
`,hn=[{id:"primeros-pasos",icon:"👋",source:Ja},{id:"faenas-y-ciclos",icon:"🌾",source:Ya},{id:"grilla-del-ciclo",icon:"🗓",source:Xa},{id:"precios-del-dia",icon:"💲",source:Ka},{id:"resumen-del-ciclo",icon:"📊",source:sn},{id:"nomina",icon:"💰",source:en},{id:"corregir-nomina",icon:"🛠",source:an},{id:"anticipos-y-bonos",icon:"🪙",source:nn},{id:"trabajadores",icon:"👷",source:on},{id:"contratos",icon:"📄",source:rn},{id:"transportes",icon:"🚐",source:tn},{id:"pagar-transportes",icon:"💸",source:ln},{id:"facturacion",icon:"🧾",source:cn},{id:"cheques-y-pagos",icon:"📆",source:un},{id:"cosecha-qr",icon:"📷",source:dn},{id:"calendario-y-dashboard",icon:"📅",source:pn},{id:"agenda-precios-y-links",icon:"📇",source:mn},{id:"administracion",icon:"🛡️",source:gn,adminOnly:!0}];function je(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var U=je();function ca(n){U=n}var $={exec:()=>null};function V(n){let e=[];return a=>{let o=Math.max(0,Math.min(3,a-1)),r=e[o];return r||(r=n(o),e[o]=r),r}}function y(n,e=""){let a=typeof n=="string"?n:n.source,o={replace:(r,s)=>{let t=typeof s=="string"?s:s.source;return t=t.replace(S.caret,"$1"),a=a.replace(r,t),o},getRegex:()=>new RegExp(a,e)};return o}var bn=((n="")=>{try{return!!new RegExp("(?<=1)(?<!1)"+n)}catch{return!1}})(),S={codeRemoveIndent:/^(?: {0,3}\t| {1,4})/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,endingSpaceTabChar:/[ \t]$/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,leadingSpaceTab:/^[ \t]+/,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] +\S/,listReplaceTask:/^\[[ xX]\] +/,listTaskCheckbox:/\[[ xX]\]/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,numericCharacterReference:/&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/,numericCharacterReferenceOrAmpersand:/&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:n=>new RegExp(`^( {0,3}${n})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:V(n=>new RegExp(`^ {0,${n}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)),hrRegex:V(n=>new RegExp(`^ {0,${n}}((?:-[ 	]*){3,}|(?:_[ 	]*){3,}|(?:\\*[ 	]*){3,})(?:\\n+|$)`)),fencesBeginRegex:V(n=>new RegExp(`^ {0,${n}}(?:\`\`\`|~~~)`)),headingBeginRegex:V(n=>new RegExp(`^ {0,${n}}#`)),htmlBeginRegex:V(n=>new RegExp(`^ {0,${n}}(?:</?(?:${Z})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`,"i")),blockquoteBeginRegex:V(n=>new RegExp(`^ {0,${n}}>`))},fn=/^(?:[ \t]*(?:\n|$))+/,vn=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,yn=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,H=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,qn=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,Se=/ {0,3}(?:[*+-]|\d{1,9}[.)])/,ua=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,da=y(ua).replace(/bull/g,Se).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}(?:\s|$)/).replace(/hr/g,/ {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),wn=y(ua).replace(/bull/g,Se).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}(?:\s|$)/).replace(/hr/g,/ {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Ee=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/,xn=/^[^\n]+/,Te=/(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/,kn=y(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Te).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),jn=y(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g,Se).getRegex(),Z="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Re=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,Sn=y("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Re).replace("tag",Z).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),pa=n=>y(Ee).replace("hr",H).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list",n).replace("html"," {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)").replace("tag",Z).getRegex(),En=pa(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/),Tn=pa(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/),Rn=y(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Tn).getRegex(),Ae={blockquote:Rn,code:vn,def:kn,fences:yn,heading:qn,hr:H,html:Sn,lheading:da,list:jn,newline:fn,paragraph:En,table:$,text:xn},De=y("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",H).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list"," {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html"," {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)").replace("tag",Z).getRegex(),An={...Ae,lheading:wn,table:De,paragraph:y(Ee).replace("hr",H).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",De).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list"," {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html"," {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)").replace("tag",Z).getRegex()},Ln={...Ae,html:y(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Re).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:$,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:y(Ee).replace("hr",H).replace("heading",` *#{1,6} *[^
]`).replace("lheading",da).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Cn=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,zn=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,ma=/^( {2,}|\\)\n(?!\s*$)[ \t]*/,_n=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,z=/[\p{P}\p{S}]/u,F=/[\s\p{P}\p{S}]/u,W=/[^\s\p{P}\p{S}]/u,Pn=y(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,F).getRegex(),In=/[\p{Pi}\p{Ps}"']/u,ga=/(?!~)[\p{P}\p{S}]/u,$n=/(?!~)[\s\p{P}\p{S}]/u,Nn=/(?:[^\s\p{P}\p{S}]|~)/u,Un=y(/link|precode-code|html/,"g").replace("link",/\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-",bn?"(?<!`)()":"(^^|[^`])").replace("code",/(?<b>`+)[^`]+\k<b>(?!`)/).replace("html",/<(?! )[^<>]*?>/).getRegex(),ha=/^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/,Mn=y(ha,"u").replace(/punct/g,z).getRegex(),Vn=y(ha,"u").replace(/punct/g,ga).getRegex(),Dn=/^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/,Fn=y(Dn,"u").replace(/openQuote/g,In).replace(/punct/g,z).getRegex(),ba="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",On=y(ba,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,F).replace(/punct/g,z).getRegex(),Bn=y(ba,"gu").replace(/notPunctSpace/g,Nn).replace(/punctSpace/g,$n).replace(/punct/g,ga).getRegex(),Qn="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)",Gn=y(Qn,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,F).replace(/punct/g,z).getRegex(),Hn=y("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,F).replace(/punct/g,z).getRegex(),Zn="^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)",Wn=y(Zn,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,F).replace(/punct/g,z).getRegex(),Jn=y(/^~~?(?:((?!~)punct)|[^\s~])/,"u").replace(/punct/g,z).getRegex(),Xn="^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)",Yn=y(Xn,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,F).replace(/punct/g,z).getRegex(),Kn=y(/\\(punct)/,"gu").replace(/punct/g,z).getRegex(),eo=y(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/,"gu").replace(/punct/g,z).getRegex(),ao=y(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),no=y(Re).replace("(?:-->|$)","-->").getRegex(),oo=y("^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",no).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),fa=/\[(?:\\[\s\S]|[^\[\]\\])*\]/,ne=y(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace("brackets",fa).getRegex(),ro=y(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/).replace("label",ne).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),so=y(/^!?\[(label)\]\[(ref)\]/).replace("label",ne).replace("ref",Te).getRegex(),to=y(/^!?\[(ref)\](?:\[\])?/).replace("ref",Te).getRegex(),Fe=/(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/,lo=y(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace("brackets",fa).getRegex(),io=y("reflink|nolink(?!\\()","g").replace("reflink",y(/^!?\[(label)\]\[(ref)\]/).replace("label",lo).replace("ref",Fe).getRegex()).replace("nolink",y(/^!?\[(ref)\](?:\[\])?/).replace("ref",Fe).getRegex()).getRegex(),Oe=/[hH][tT][tT][pP][sS]?|[fF][tT][pP]/,co=/[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/,uo=y(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g,co).getRegex(),Le={_backpedal:$,anyPunctuation:Kn,anyPunctuationOutsideCode:eo,autolink:ao,blockSkip:Un,br:ma,code:zn,del:$,delLDelim:$,delRDelim:$,emStrongLDelim:Mn,emStrongRDelimAst:On,emStrongRDelimUnd:Hn,escape:Cn,link:ro,nolink:to,punctuation:Pn,reflink:so,reflinkSearch:io,tag:oo,text:_n,url:$},po={...Le,emStrongLDelim:Fn,emStrongRDelimAst:Gn,emStrongRDelimUnd:Wn,link:y(/^!?\[(label)\]\((.*?)\)/).replace("label",ne).getRegex(),reflink:y(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",ne).getRegex()},fe={...Le,emStrongRDelimAst:Bn,emStrongLDelim:Vn,delLDelim:Jn,delRDelim:Yn,url:y(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("emailProtocol",uo).replace("protocol",Oe).replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/,text:y(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/).replace("protocol",Oe).replace(/emailProtocol/g,/(?:mailto|xmpp):/).getRegex()},mo={...fe,br:y(ma).replace("{2,}","*").getRegex(),text:y(fe.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Y={normal:Ae,gfm:An,pedantic:Ln},B={normal:Le,gfm:fe,breaks:mo,pedantic:po},go={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Be=n=>go[n];function A(n,e){if(e){if(S.escapeTest.test(n))return n.replace(S.escapeReplace,Be)}else if(S.escapeTestNoEncode.test(n))return n.replace(S.escapeReplaceNoEncode,Be);return n}function ho(n){return S.numericCharacterReference.test(n)?n.replace(S.numericCharacterReferenceOrAmpersand,(e,a,o)=>{if(a===void 0&&o===void 0)return"&amp;";let r=a===void 0?Number.parseInt(o,16):Number.parseInt(a,10);return r===0||r>1114111||r>=55296&&r<=57343?"�":r===38?"&amp;":String.fromCodePoint(r)}):n}function Qe(n){try{n=encodeURI(n).replace(S.percentDecode,"%")}catch{return null}return n}function Ge(n,e){let a=n.replace(S.findPipe,(s,t,l)=>{let u=!1,i=t;for(;--i>=0&&l[i]==="\\";)u=!u;return u?"|":" |"}),o=a.split(S.splitPipe),r=0;if(o[0].trim()||o.shift(),o.length>0&&!o.at(-1)?.trim()&&o.pop(),e)if(o.length>e)o.splice(e);else for(;o.length<e;)o.push("");for(;r<o.length;r++)o[r]=o[r].trim().replace(S.slashPipe,"|");return o}function _(n,e,a){let o=n.length;if(o===0)return"";let r=0;for(;r<o&&n.charAt(o-r-1)===e;)r++;return n.slice(0,o-r)}function He(n){let e=n.split(`
`),a=e.length-1;for(;a>=0&&S.blankLine.test(e[a]);)a--;return e.length-a<=2?n:e.slice(0,a+1).join(`
`)}function oe(n){return n.trim().toLowerCase().toUpperCase().toLowerCase()}function Ze(n,e){if(n.indexOf(e[0])===-1&&n.indexOf(e[1])===-1)return-1;let a=0;for(let o=0;o<n.length;o++)if(n[o]==="\\")o++;else if(n[o]===e[0])a++;else if(n[o]===e[1]&&(a--,a<0))return o;return a>0?-2:-1}function de(n,e=0){let a=e,o="";for(let r of n)if(r==="	"){let s=4-a%4;o+=" ".repeat(s),a+=s}else o+=r,a++;return o}function We(n,e,a,o,r){let s=e.href,t=e.title||null,l=n[1].replace(r.other.outputLinkReplace,"$1"),u=n[0].charAt(0)==="!",i=o.state.inLink,c=o.state.linkEmitted,d=o.state.inRawBlock;o.state.inLink=!0,o.state.linkEmitted=!1;let m=o.inlineTokens(l),p=o.state.linkEmitted;if(o.state.linkEmitted=c,o.state.inLink=i,!u){if(p){o.state.inRawBlock=d;return}o.state.linkEmitted=!0}return{type:u?"image":"link",raw:a,href:s,title:t,text:l,tokens:m}}function bo(n,e,a){let o=n.match(a.other.indentCodeCompensation);if(o===null)return e;let r=o[1];return e.split(`
`).map(s=>{let t=s.match(a.other.beginningSpace);if(t===null)return s;let[l]=t;return s.slice(Math.min(l.length,r.length))}).join(`
`)}function Je(n,e,a,o){if(!e.includes("<"))return!1;for(let r=0;r<e.length;r++){if(e[r]==="\\"){r++;continue}if(e[r]==="`"){let l=o.inline.code.exec(e.slice(r));if(l){r+=l[0].length-1;continue}}if(e[r]!=="<")continue;let s=n.slice(a+r),t=o.inline.tag.exec(s)||o.inline.autolink.exec(s);if(t){if(t[0].length>e.length-r)return!0;r+=t[0].length-1}}return!1}var re=class{options;rules;lexer;constructor(n){this.options=n||U}space(n){let e=this.rules.block.newline.exec(n);if(e&&e[0].length>0)return{type:"space",raw:e[0]}}code(n){let e=this.rules.block.code.exec(n);if(e){let a=this.options.pedantic?e[0]:He(e[0]),o=a.replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:a,codeBlockStyle:"indented",text:o}}}fences(n){let e=this.rules.block.fences.exec(n);if(e){let a=e[0],o=bo(a,e[3]||"",this.rules);return{type:"code",raw:a,lang:e[2]?e[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):e[2],text:o}}}heading(n){let e=this.rules.block.heading.exec(n);if(e){let a=e[2].trim();if(this.rules.other.endingHash.test(a)){let o=_(a,"#");(this.options.pedantic||!o||this.rules.other.endingSpaceTabChar.test(o))&&(a=o.trim())}return{type:"heading",raw:_(e[0],`
`),depth:e[1].length,text:a,tokens:this.lexer.inline(a)}}}hr(n){let e=this.rules.block.hr.exec(n);if(e)return{type:"hr",raw:_(e[0],`
`)}}blockquote(n){let e=this.rules.block.blockquote.exec(n);if(e){let a=_(e[0],`
`).split(`
`),o="",r="",s=[];for(;a.length>0;){let t=!1,l=[],u;for(u=0;u<a.length;u++)if(this.rules.other.blockquoteStart.test(a[u]))l.push(a[u]),t=!0;else if(!t)l.push(a[u]);else break;a=a.slice(u);let i=l.join(`
`),c=i.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");o=o?`${o}
${i}`:i,r=r?`${r}
${c}`:c;let d=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(c,s,!0),this.lexer.state.top=d,a.length===0)break;let m=s.at(-1);if(m?.type==="code"||m?.type==="heading"||m?.type==="hr"||m?.type==="html")break;if(m?.type==="blockquote"){let p=m,b=a.join(`
`),h=p.raw+`
`+b.replace(this.rules.other.blockquoteSetextReplace2,""),g=this.blockquote(h);s[s.length-1]=g;let q=h.substring(g.raw.length).replace(/^\n/,""),v=q?q.split(`
`).length:0,j=v?a.slice(0,-v):a;j.length>0&&(o=`${o}
${j.join(`
`)}`),r=r.substring(0,r.length-p.text.length)+g.text;break}else if(m?.type==="list"){let p=m,b=p.raw+`
`+a.join(`
`),h=this.list(b);s[s.length-1]=h,o=o.substring(0,o.length-m.raw.length)+h.raw,r=r.substring(0,r.length-p.raw.length)+h.raw,a=b.substring(s.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:o,tokens:s,text:r}}}list(n){let e=this.rules.block.list.exec(n);if(e){let a=n,o=()=>a.length-n.length,r=e[1].trim(),s=r.length>1,t={type:"list",raw:"",ordered:s,start:s?+r.slice(0,-1):"",loose:!1,items:[]};r=s?`\\d{1,9}\\${r.slice(-1)}`:`\\${r}`,this.options.pedantic&&(r=s?r:"[*+-]");let l=this.rules.other.listItemRegex(r),u=!1;for(;n;){let c=!1,d="";if(!(e=l.exec(n))||this.rules.block.hr.test(n))break;let m=o();n=n.substring(e[0].length);let p=e[2].split(`
`,1)[0],b=e[1].length,h=this.options.pedantic?de(p,b):p.replace(this.rules.other.leadingSpaceTab,x=>de(x,b)),g=n.split(`
`,1)[0],q=!h.trim(),v=0;if(this.options.pedantic?(v=2,d=h.trimStart()):q?v=b+1:(v=h.search(this.rules.other.nonSpaceChar),v=v>4?1:v,d=h.slice(v),v+=b),q&&this.rules.other.blankLine.test(g)&&(n=n.substring(g.length+1),c=!0),!c){let x=this.rules.other.nextBulletRegex(v),E=this.rules.other.hrRegex(v),k=this.rules.other.fencesBeginRegex(v),T=this.rules.other.headingBeginRegex(v),wa=this.rules.other.htmlBeginRegex(v),xa=this.rules.other.blockquoteBeginRegex(v);for(;n;){let ze=n.split(`
`,1)[0],O;if(g=ze,this.options.pedantic?(g=g.replace(this.rules.other.listReplaceNesting,"  "),O=g):O=g.replace(this.rules.other.leadingSpaceTab,ka=>de(ka)),k.test(g)||T.test(g)||wa.test(g)||xa.test(g)||x.test(g)||E.test(g))break;if(O.search(this.rules.other.nonSpaceChar)>=v||!g.trim())d+=`
`+O.slice(v);else{if(q||h.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||k.test(h)||T.test(h)||E.test(h))break;d+=`
`+g}q=!g.trim(),n=n.substring(ze.length+1),h=O.slice(v)}}let j=a.slice(m,o());t.loose||(u?t.loose=!0:this.rules.other.doubleBlankLine.test(j)&&(u=!0)),t.items.push({type:"list_item",raw:j,task:!!this.options.gfm&&this.rules.other.listIsTask.test(d),loose:!1,text:d,tokens:[]})}let i=t.items.at(-1);if(i)i.raw=i.raw.trimEnd(),i.text=i.text.trimEnd();else return;t.raw=a.slice(0,o()).trimEnd();for(let c of t.items)if(this.lexer.state.top=!1,c.tokens=this.lexer.blockTokens(c.text,[]),!t.loose){let d=c.tokens.filter(p=>p.type==="space"),m=d.length>0&&d.some(p=>this.rules.other.anyLine.test(p.raw));t.loose=m}for(let c of t.items){let d=c.tokens[0];if(c.task&&(d?.type==="text"||d?.type==="paragraph")){c.text=c.text.replace(this.rules.other.listReplaceTask,""),d.raw=d.raw.replace(this.rules.other.listReplaceTask,""),d.text=d.text.replace(this.rules.other.listReplaceTask,"");for(let p=this.lexer.inlineQueue.length-1;p>=0;p--)if(this.rules.other.listIsTask.test(this.lexer.inlineQueue[p].src)){this.lexer.inlineQueue[p].src=this.lexer.inlineQueue[p].src.replace(this.rules.other.listReplaceTask,"");break}let m=this.rules.other.listTaskCheckbox.exec(c.raw);if(m){let p={type:"checkbox",raw:m[0]+" ",checked:m[0]!=="[ ]"};c.checked=p.checked,t.loose?c.tokens[0]&&["paragraph","text"].includes(c.tokens[0].type)&&"tokens"in c.tokens[0]&&c.tokens[0].tokens?(c.tokens[0].raw=p.raw+c.tokens[0].raw,c.tokens[0].text=p.raw+c.tokens[0].text,c.tokens[0].tokens.unshift(p)):c.tokens.unshift({type:"paragraph",raw:p.raw,text:p.raw,tokens:[p]}):c.tokens.unshift(p)}}else c.task&&(c.task=!1)}if(t.loose)for(let c of t.items){c.loose=!0;for(let d of c.tokens)d.type==="text"&&(d.type="paragraph")}return t}}html(n){let e=this.rules.block.html.exec(n);if(e){let a=He(e[0]);return{type:"html",block:!0,raw:a,pre:e[1]==="pre"||e[1]==="script"||e[1]==="style",text:a}}}def(n){let e=this.rules.block.def.exec(n);if(e){if(!this.rules.other.startAngleBracket.test(e[2])&&Ze(e[2],"()")!==-1)return;let a=oe(e[1]).replace(this.rules.other.multipleSpaceGlobal," "),o=e[2]?e[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",r=e[3]?e[3].substring(1,e[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):e[3];return{type:"def",tag:a,raw:_(e[0],`
`),href:o,title:r}}}table(n){let e=this.rules.block.table.exec(n);if(!e||!this.rules.other.tableDelimiter.test(e[2]))return;let a=Ge(e[1]),o=e[2].replace(this.rules.other.tableAlignChars,"").split("|"),r=e[3]?.trim()?e[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],s={type:"table",raw:_(e[0],`
`),header:[],align:[],rows:[]};if(a.length===o.length){for(let t of o)this.rules.other.tableAlignRight.test(t)?s.align.push("right"):this.rules.other.tableAlignCenter.test(t)?s.align.push("center"):this.rules.other.tableAlignLeft.test(t)?s.align.push("left"):s.align.push(null);for(let t=0;t<a.length;t++)s.header.push({text:a[t],tokens:this.lexer.inline(a[t]),header:!0,align:s.align[t]});for(let t of r)s.rows.push(Ge(t,s.header.length).map((l,u)=>({text:l,tokens:this.lexer.inline(l),header:!1,align:s.align[u]})));return s}}lheading(n){let e=this.rules.block.lheading.exec(n);if(e){let a=e[1].trim();return{type:"heading",raw:_(e[0],`
`),depth:e[2].charAt(0)==="="?1:2,text:a,tokens:this.lexer.inline(a)}}}paragraph(n){let e=this.rules.block.paragraph.exec(n);if(e){let a=e[1].charAt(e[1].length-1)===`
`?e[1].slice(0,-1):e[1];return{type:"paragraph",raw:e[0],text:a,tokens:this.lexer.inline(a)}}}text(n){let e=this.rules.block.text.exec(n);if(e)return{type:"text",raw:e[0],text:e[0],tokens:this.lexer.inline(e[0])}}escape(n){let e=this.rules.inline.escape.exec(n);if(e)return{type:"escape",raw:e[0],text:e[1]}}tag(n){let e=this.rules.inline.tag.exec(n);if(e)return!this.lexer.state.inLink&&this.rules.other.startATag.test(e[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(e[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(e[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(e[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:e[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:e[0]}}link(n){if(this.lexer.state.linkParenPossible===!1)return;let e=this.rules.inline.link.exec(n);if(e){let a=e[0].charAt(0)==="!"?2:1;if(!this.options.pedantic&&Je(n,e[1],a,this.rules))return;let o=e[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(o)){if(!this.rules.other.endAngleBracket.test(o))return;let t=_(o.slice(0,-1),"\\");if((o.length-t.length)%2===0)return}else{let t=Ze(e[2],"()");if(t===-2)return;if(t>-1){let l=(e[0].indexOf("!")===0?5:4)+e[1].length+t;e[2]=e[2].substring(0,t),e[0]=e[0].substring(0,l).trim(),e[3]=""}}let r=e[2],s="";if(this.options.pedantic){let t=this.rules.other.pedanticHrefTitle.exec(r);t&&(r=t[1],s=t[3])}else s=e[3]?e[3].slice(1,-1):"";return r=r.trim(),this.rules.other.startAngleBracket.test(r)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(o)?r=r.slice(1):r=r.slice(1,-1)),We(e,{href:r&&r.replace(this.rules.inline.anyPunctuation,"$1"),title:s&&s.replace(this.rules.inline.anyPunctuation,"$1")},e[0],this.lexer,this.rules)}}reflink(n,e){let a;if((a=this.rules.inline.reflink.exec(n))||(a=this.rules.inline.nolink.exec(n))){let o=a[0].charAt(0)==="!"?2:1;if(!this.options.pedantic&&Je(n,a[1],o,this.rules))return;let r=(a[2]||a[1]).replace(this.rules.other.multipleSpaceGlobal," "),s=e[oe(r)];if(!s){let t=a[0].charAt(0);return{type:"text",raw:t,text:t}}return We(a,s,a[0],this.lexer,this.rules)}}emStrong(n,e,a=""){let o=this.rules.inline.emStrongLDelim.exec(n);if(!(!o||!o[1]&&!o[2]&&!o[3]&&!o[4]||o[4]&&a.match(this.rules.other.unicodeAlphaNumeric))&&(!(o[1]||o[3])||!a||this.rules.inline.punctuation.exec(a))){let r=[...o[0]].length-1,s,t,l=r,u=0,i=o[0][0],c=a===i,d=i==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,e=e.slice(-1*n.length+r);(o=d.exec(e))!==null;){if(s=o[1]||o[2]||o[3]||o[4]||o[5]||o[6],!s)continue;if(t=[...s].length,o[3]||o[4]){l+=t;continue}else if(o[5]||o[6]){if(r%3&&!((r+t)%3)){u+=t;continue}if(c)break}if(l-=t,l>0)continue;t=Math.min(t,t+l+u);let m=[...o[0]][0].length,p=n.slice(0,r+o.index+m+t);if(Math.min(r,t)%2){let h=p.slice(1,-1);return{type:"em",raw:p,text:h,tokens:this.lexer.inlineTokens(h)}}let b=p.slice(2,-2);return{type:"strong",raw:p,text:b,tokens:this.lexer.inlineTokens(b)}}}}codespan(n){let e=this.rules.inline.code.exec(n);if(e){let a=e[2].replace(this.rules.other.newLineCharGlobal," "),o=this.rules.other.nonSpaceChar.test(a),r=this.rules.other.startingSpaceChar.test(a)&&this.rules.other.endingSpaceChar.test(a);return o&&r&&(a=a.substring(1,a.length-1)),{type:"codespan",raw:e[0],text:a}}}br(n){let e=this.rules.inline.br.exec(n);if(e)return{type:"br",raw:e[0]}}del(n,e,a=""){let o=this.rules.inline.delLDelim.exec(n);if(o&&(!o[1]||!a||this.rules.inline.punctuation.exec(a))){let r=[...o[0]].length-1,s,t,l=r,u=this.rules.inline.delRDelim;for(u.lastIndex=0,e=e.slice(-1*n.length+r);(o=u.exec(e))!==null;){if(s=o[1]||o[2]||o[3]||o[4]||o[5]||o[6],!s||(t=[...s].length,t!==r))continue;if(o[3]||o[4]){l+=t;continue}if(l-=t,l>0)continue;t=Math.min(t,t+l);let i=[...o[0]][0].length,c=n.slice(0,r+o.index+i+t),d=c.slice(r,-r);return{type:"del",raw:c,text:d,tokens:this.lexer.inlineTokens(d)}}}}autolink(n){let e=this.rules.inline.autolink.exec(n);if(e){let a,o;return e[2]==="@"?(a=e[1],o="mailto:"+a):(a=e[1],o=a),{type:"link",raw:e[0],text:a,href:o,autolink:!0,tokens:[{type:"text",raw:a,text:a}]}}}url(n){let e;if(e=this.rules.inline.url.exec(n)){let a,o;if(e[2]==="@")a=e[0],o="mailto:"+a;else{let r;do r=e[0],e[0]=this.rules.inline._backpedal.exec(e[0])?.[0]??"";while(r!==e[0]);a=e[0],e[1]==="www."?o="http://"+e[0]:o=e[0]}return{type:"link",raw:e[0],text:a,href:o,autolink:!0,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(n){let e=this.rules.inline.text.exec(n);if(e){let a=this.lexer.state.inRawBlock;return{type:"text",raw:e[0],text:a?e[0]:ho(e[0]),escaped:a}}}},L=class ve{tokens;options;state;inlineQueue;tokenizer;constructor(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||U,this.options.tokenizer=this.options.tokenizer||new re,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,linkEmitted:!1,linkParenPossible:!0,top:!0};let a={other:S,block:Y.normal,inline:B.normal};this.options.pedantic?(a.block=Y.pedantic,a.inline=B.pedantic):this.options.gfm&&(a.block=Y.gfm,this.options.breaks?a.inline=B.breaks:a.inline=B.gfm),this.tokenizer.rules=a}static get rules(){return{block:Y,inline:B}}static lex(e,a){return new ve(a).lex(e)}static lexInline(e,a){return new ve(a).inlineTokens(e)}lex(e){e=e.replace(S.carriageReturn,`
`),this.blockTokens(e,this.tokens);for(let a=0;a<this.inlineQueue.length;a++){let o=this.inlineQueue[a];this.inlineTokens(o.src,o.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(e,a=[],o=!1){this.tokenizer.lexer=this,this.options.pedantic&&(e=e.replace(S.tabCharGlobal,"    ").replace(S.spaceLine,""));let r=1/0;for(;e;){if(e.length<r)r=e.length;else{this.infiniteLoopError(e.charCodeAt(0));break}let s;if(this.options.extensions?.block?.some(l=>(s=l.call({lexer:this},e,a))?(e=e.substring(s.raw.length),a.push(s),!0):!1))continue;if(s=this.tokenizer.space(e)){e=e.substring(s.raw.length);let l=a.at(-1);s.raw.length===1&&l!==void 0?l.raw+=`
`:a.push(s);continue}if(s=this.tokenizer.code(e)){e=e.substring(s.raw.length);let l=a.at(-1);l?.type==="paragraph"||l?.type==="text"?(l.raw+=(l.raw.endsWith(`
`)?"":`
`)+s.raw,l.text+=`
`+s.text,this.inlineQueue.at(-1).src=l.text):a.push(s);continue}if(s=this.tokenizer.fences(e)){e=e.substring(s.raw.length),a.push(s);continue}if(s=this.tokenizer.heading(e)){e=e.substring(s.raw.length),a.push(s);continue}if(s=this.tokenizer.hr(e)){e=e.substring(s.raw.length),a.push(s);continue}if(s=this.tokenizer.blockquote(e)){e=e.substring(s.raw.length),a.push(s);continue}if(s=this.tokenizer.list(e)){e=e.substring(s.raw.length),a.push(s);continue}if(s=this.tokenizer.html(e)){e=e.substring(s.raw.length),a.push(s);continue}if(s=this.tokenizer.def(e)){e=e.substring(s.raw.length);let l=a.at(-1);l?.type==="paragraph"||l?.type==="text"?(l.raw+=(l.raw.endsWith(`
`)?"":`
`)+s.raw,l.text+=`
`+s.raw,this.inlineQueue.at(-1).src=l.text):this.tokens.links[s.tag]||(this.tokens.links[s.tag]={href:s.href,title:s.title},a.push(s));continue}if(s=this.tokenizer.table(e)){e=e.substring(s.raw.length),a.push(s);continue}if(s=this.tokenizer.lheading(e)){e=e.substring(s.raw.length),a.push(s);continue}let t=e;if(this.options.extensions?.startBlock){let l=1/0,u=e.slice(1),i;this.options.extensions.startBlock.forEach(c=>{i=c.call({lexer:this},u),typeof i=="number"&&i>=0&&(l=Math.min(l,i))}),l<1/0&&l>=0&&(t=e.substring(0,l+1))}if(this.state.top&&(s=this.tokenizer.paragraph(t))){let l=a.at(-1);o&&l?.type==="paragraph"?(l.raw+=(l.raw.endsWith(`
`)?"":`
`)+s.raw,l.text+=`
`+s.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=l.text):a.push(s),o=t.length!==e.length,e=e.substring(s.raw.length);continue}if(s=this.tokenizer.text(e)){e=e.substring(s.raw.length);let l=a.at(-1);l?.type==="text"?(l.raw+=(l.raw.endsWith(`
`)?"":`
`)+s.raw,l.text+=`
`+s.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=l.text):a.push(s);continue}if(e){this.infiniteLoopError(e.charCodeAt(0));break}}return this.state.top=!0,a}inline(e,a=[]){return this.inlineQueue.push({src:e,tokens:a}),a}linkInText(e){if(!e.includes("["))return!1;let a=this.tokenizer.rules.inline.link;for(let o of e.matchAll(this.tokenizer.rules.inline.blockSkip))if(a.test(o[0])&&e.charAt(o.index-1)!=="!")return!0;for(let o of e.matchAll(this.tokenizer.rules.inline.reflinkSearch)){let r=o[0],s=r.lastIndexOf("[");if(!(r.charAt(0)==="!"||!Object.hasOwn(this.tokens.links,oe(r.slice(s+1,-1))))&&!(s>1&&this.linkInText(r.slice(1,s-1))))return!0}return!1}inlineTokens(e,a=[]){this.tokenizer.lexer=this;let o=this.state.linkParenPossible;this.state.linkParenPossible=o&&e.includes(")");try{return this.#e(e,a)}finally{this.state.linkParenPossible=o}}#e(e,a){let o=e;if(this.tokens.links&&e.includes("[")){let l=this.tokenizer.rules.inline.reflinkSearch,u=i=>{let c=i.lastIndexOf("[");if(!Object.hasOwn(this.tokens.links,oe(i.slice(c+1,-1))))return i;if(c>1&&i.charAt(0)!=="!"){let d=i.slice(1,c-1);if(this.linkInText(d))return"["+d.replace(l,u)+"]["+"a".repeat(i.length-c-2)+"]"}return"["+"a".repeat(i.length-2)+"]"};o=o.replace(l,u)}o=o.replace(this.tokenizer.rules.inline.anyPunctuationOutsideCode,(l,u,i)=>i?"+".repeat(l.length):u?u+l.slice(u.length,-u.length).replace(/`/g,"+")+u:l),o=o.replace(this.tokenizer.rules.inline.blockSkip,(l,u,i)=>{let c=i?i.length:0;return l.slice(0,c)+"["+"a".repeat(l.length-c-2)+"]"}),o=this.options.hooks?.emStrongMask?.call({lexer:this},o)??o;let r=!1,s="",t=1/0;for(;e;){if(e.length<t)t=e.length;else{this.infiniteLoopError(e.charCodeAt(0));break}r||(s=""),r=!1;let l;if(this.options.extensions?.inline?.some(i=>(l=i.call({lexer:this},e,a))?(e=e.substring(l.raw.length),a.push(l),!0):!1))continue;if(l=this.tokenizer.escape(e)){e=e.substring(l.raw.length),a.push(l);continue}if(l=this.tokenizer.tag(e)){e=e.substring(l.raw.length),a.push(l);continue}if(l=this.tokenizer.link(e)){e=e.substring(l.raw.length),a.push(l);continue}if(l=this.tokenizer.reflink(e,this.tokens.links)){e=e.substring(l.raw.length);let i=a.at(-1);l.type==="text"&&i?.type==="text"?(i.raw+=l.raw,i.text+=l.text):a.push(l);continue}if(l=this.tokenizer.emStrong(e,o,s)){e=e.substring(l.raw.length),a.push(l);continue}if(l=this.tokenizer.codespan(e)){e=e.substring(l.raw.length),a.push(l);continue}if(l=this.tokenizer.br(e)){e=e.substring(l.raw.length),a.push(l);continue}if(l=this.tokenizer.del(e,o,s)){e=e.substring(l.raw.length),a.push(l);continue}if(l=this.tokenizer.autolink(e)){e=e.substring(l.raw.length),a.push(l);continue}if(!this.state.inLink&&(l=this.tokenizer.url(e))){e=e.substring(l.raw.length),a.push(l);continue}let u=e;if(this.options.extensions?.startInline){let i=1/0,c=e.slice(1),d;this.options.extensions.startInline.forEach(m=>{d=m.call({lexer:this},c),typeof d=="number"&&d>=0&&(i=Math.min(i,d))}),i<1/0&&i>=0&&(u=e.substring(0,i+1))}if(l=this.tokenizer.inlineText(u)){e=e.substring(l.raw.length),l.raw.slice(-1)!=="_"&&(s=l.raw.slice(-1)),r=!0;let i=a.at(-1);i?.type==="text"?(i.raw+=l.raw,i.text+=l.text):a.push(l);continue}if(e){this.infiniteLoopError(e.charCodeAt(0));break}}return a}infiniteLoopError(e){let a="Infinite loop on byte: "+e;if(this.options.silent)console.error(a);else throw new Error(a)}},se=class{options;parser;constructor(n){this.options=n||U}space(n){return""}code({text:n,lang:e,escaped:a}){let o=(e||"").match(S.notSpaceStart)?.[0],r=n?n.replace(S.endingNewline,"")+`
`:"";return o?'<pre><code class="language-'+A(o)+'">'+(a?r:A(r,!0))+`</code></pre>
`:"<pre><code>"+(a?r:A(r,!0))+`</code></pre>
`}blockquote({tokens:n}){return`<blockquote>
${this.parser.parse(n)}</blockquote>
`}html({text:n}){return n}def(n){return""}heading({tokens:n,depth:e}){return`<h${e}>${this.parser.parseInline(n)}</h${e}>
`}hr(n){return`<hr>
`}list(n){let e=n.ordered,a=n.start,o="";for(let t=0;t<n.items.length;t++){let l=n.items[t];o+=this.listitem(l)}let r=e?"ol":"ul",s=e&&a!==1?' start="'+a+'"':"";return"<"+r+s+`>
`+o+"</"+r+`>
`}listitem(n){return`<li>${this.parser.parse(n.tokens)}</li>
`}checkbox({checked:n}){return"<input "+(n?'checked="" ':"")+'disabled="" type="checkbox"> '}paragraph({tokens:n}){return`<p>${this.parser.parseInline(n)}</p>
`}table(n){let e="",a="";for(let r=0;r<n.header.length;r++)a+=this.tablecell(n.header[r]);e+=this.tablerow({text:a});let o="";for(let r=0;r<n.rows.length;r++){let s=n.rows[r];a="";for(let t=0;t<s.length;t++)a+=this.tablecell(s[t]);o+=this.tablerow({text:a})}return o&&(o=`<tbody>${o}</tbody>`),`<table>
<thead>
`+e+`</thead>
`+o+`</table>
`}tablerow({text:n}){return`<tr>
${n}</tr>
`}tablecell(n){let e=this.parser.parseInline(n.tokens),a=n.header?"th":"td";return(n.align?`<${a} align="${n.align}">`:`<${a}>`)+e+`</${a}>
`}strong({tokens:n}){return`<strong>${this.parser.parseInline(n)}</strong>`}em({tokens:n}){return`<em>${this.parser.parseInline(n)}</em>`}codespan({text:n}){return`<code>${A(n,!0)}</code>`}br(n){return"<br>"}del({tokens:n}){return`<del>${this.parser.parseInline(n)}</del>`}link({href:n,title:e,text:a,tokens:o,autolink:r}){let s=r?A(a,!0):this.parser.parseInline(o),t=Qe(n);if(t===null)return s;n=A(t,r);let l='<a href="'+n+'"';return e&&(l+=' title="'+A(e)+'"'),l+=">"+s+"</a>",l}image({href:n,title:e,text:a,tokens:o}){o&&(a=this.parser.parseInline(o,this.parser.textRenderer));let r=Qe(n);if(r===null)return A(a);n=r;let s=`<img src="${A(n)}" alt="${A(a)}"`;return e&&(s+=` title="${A(e)}"`),s+=">",s}text(n){return"tokens"in n&&n.tokens?this.parser.parseInline(n.tokens):"escaped"in n&&n.escaped?n.text:A(n.text)}},Ce=class{strong({text:n}){return n}em({text:n}){return n}codespan({text:n}){return n}del({text:n}){return n}html({text:n}){return n}text({text:n}){return n}link({text:n}){return""+n}image({text:n}){return""+n}br(){return""}checkbox({raw:n}){return n}},C=class ye{options;renderer;textRenderer;constructor(e){this.options=e||U,this.options.renderer=this.options.renderer||new se,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Ce}static parse(e,a){return new ye(a).parse(e)}static parseInline(e,a){return new ye(a).parseInline(e)}parse(e){this.renderer.parser=this;let a="";for(let o=0;o<e.length;o++){let r=e[o];if(this.options.extensions?.renderers?.[r.type]){let t=r,l=this.options.extensions.renderers[t.type].call({parser:this},t);if(l!==!1||!["space","hr","heading","code","table","blockquote","list","checkbox","html","def","paragraph","text"].includes(t.type)){a+=l||"";continue}}let s=r;switch(s.type){case"space":{a+=this.renderer.space(s);break}case"hr":{a+=this.renderer.hr(s);break}case"heading":{a+=this.renderer.heading(s);break}case"code":{a+=this.renderer.code(s);break}case"table":{a+=this.renderer.table(s);break}case"blockquote":{a+=this.renderer.blockquote(s);break}case"list":{a+=this.renderer.list(s);break}case"checkbox":{a+=this.renderer.checkbox(s);break}case"html":{a+=this.renderer.html(s);break}case"def":{a+=this.renderer.def(s);break}case"paragraph":{a+=this.renderer.paragraph(s);break}case"text":{a+=this.renderer.text(s);break}default:{let t='Token with "'+s.type+'" type was not found.';if(this.options.silent)return console.error(t),"";throw new Error(t)}}}return a}parseInline(e,a=this.renderer){this.renderer.parser=this;let o="";for(let r=0;r<e.length;r++){let s=e[r];if(this.options.extensions?.renderers?.[s.type]){let l=this.options.extensions.renderers[s.type].call({parser:this},s);if(l!==!1||!["escape","html","link","image","checkbox","strong","em","codespan","br","del","text"].includes(s.type)){o+=l||"";continue}}let t=s;switch(t.type){case"escape":{o+=a.text(t);break}case"html":{o+=a.html(t);break}case"link":{o+=a.link(t);break}case"image":{o+=a.image(t);break}case"checkbox":{o+=a.checkbox(t);break}case"strong":{o+=a.strong(t);break}case"em":{o+=a.em(t);break}case"codespan":{o+=a.codespan(t);break}case"br":{o+=a.br(t);break}case"del":{o+=a.del(t);break}case"text":{o+=a.text(t);break}default:{let l='Token with "'+t.type+'" type was not found.';if(this.options.silent)return console.error(l),"";throw new Error(l)}}}return o}},Q=class{options;block;constructor(n){this.options=n||U}static passThroughHooks=new Set(["preprocess","postprocess","processAllTokens","emStrongMask"]);static passThroughHooksRespectAsync=new Set(["preprocess","postprocess","processAllTokens"]);preprocess(n){return n}postprocess(n){return n}processAllTokens(n){return n}emStrongMask(n){return n}provideLexer(n=this.block){return n?L.lex:L.lexInline}provideParser(n=this.block){return n?C.parse:C.parseInline}};function I(n,e){if(Array.isArray(e))for(let a=0;a<e.length;a++)n.push(e[a]);else n.push(e)}var va=class{defaults=je();options=this.setOptions;parse=this.parseMarkdown(!0);parseInline=this.parseMarkdown(!1);Parser=C;Renderer=se;TextRenderer=Ce;Lexer=L;Tokenizer=re;Hooks=Q;constructor(...n){this.use(...n)}walkTokens(n,e){let a=[];for(let o of n)switch(I(a,e.call(this,o)),o.type){case"table":{let r=o;for(let s of r.header)I(a,this.walkTokens(s.tokens,e));for(let s of r.rows)for(let t of s)I(a,this.walkTokens(t.tokens,e));break}case"list":{let r=o;I(a,this.walkTokens(r.items,e));break}default:{let r=o;this.defaults.extensions?.childTokens?.[r.type]?this.defaults.extensions.childTokens[r.type].forEach(s=>{let t=r[s].flat(1/0);I(a,this.walkTokens(t,e))}):r.tokens&&I(a,this.walkTokens(r.tokens,e))}}return a}use(...n){let e=this.defaults.extensions||{renderers:{},childTokens:{}};return n.forEach(a=>{let o={...a};if(o.async=this.defaults.async||o.async||!1,a.extensions&&(a.extensions.forEach(r=>{if(!r.name)throw new Error("extension name required");if("renderer"in r){let s=e.renderers[r.name];s?e.renderers[r.name]=function(...t){let l=r.renderer.apply(this,t);return l===!1&&(l=s.apply(this,t)),l}:e.renderers[r.name]=r.renderer}if("tokenizer"in r){if(!r.level||r.level!=="block"&&r.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");let s=e[r.level];s?s.unshift(r.tokenizer):e[r.level]=[r.tokenizer],r.start&&(r.level==="block"?e.startBlock?e.startBlock.push(r.start):e.startBlock=[r.start]:r.level==="inline"&&(e.startInline?e.startInline.push(r.start):e.startInline=[r.start]))}"childTokens"in r&&r.childTokens&&(e.childTokens[r.name]=r.childTokens)}),o.extensions=e),a.renderer){let r=this.defaults.renderer||new se(this.defaults);for(let s in a.renderer){if(!(s in r))throw new Error(`renderer '${s}' does not exist`);if(["options","parser"].includes(s))continue;let t=s,l=a.renderer[t],u=r[t];r[t]=(...i)=>{let c=l.apply(r,i);return c===!1&&(c=u.apply(r,i)),c||""}}o.renderer=r}if(a.tokenizer){let r=this.defaults.tokenizer||new re(this.defaults);for(let s in a.tokenizer){if(!(s in r))throw new Error(`tokenizer '${s}' does not exist`);if(["options","rules","lexer"].includes(s))continue;let t=s,l=a.tokenizer[t],u=r[t];r[t]=(...i)=>{let c=l.apply(r,i);return c===!1&&(c=u.apply(r,i)),c}}o.tokenizer=r}if(a.hooks){let r=this.defaults.hooks||new Q;for(let s in a.hooks){if(!(s in r))throw new Error(`hook '${s}' does not exist`);if(["options","block"].includes(s))continue;let t=s,l=a.hooks[t],u=r[t];Q.passThroughHooks.has(s)?r[t]=i=>{if(this.defaults.async&&Q.passThroughHooksRespectAsync.has(s))return(async()=>{let d=await l.call(r,i);return u.call(r,d)})();let c=l.call(r,i);return u.call(r,c)}:r[t]=(...i)=>{if(this.defaults.async)return(async()=>{let d=await l.apply(r,i);return d===!1&&(d=await u.apply(r,i)),d})();let c=l.apply(r,i);return c===!1&&(c=u.apply(r,i)),c}}o.hooks=r}if(a.walkTokens){let r=this.defaults.walkTokens,s=a.walkTokens;o.walkTokens=function(t){let l=[];return l.push(s.call(this,t)),r&&I(l,r.call(this,t)),l}}this.defaults={...this.defaults,...o}}),this}setOptions(n){return this.defaults={...this.defaults,...n},this}lexer(n,e){return L.lex(n,e??this.defaults)}parser(n,e){return C.parse(n,e??this.defaults)}parseMarkdown(n){return(e,a)=>{let o={...a},r={...this.defaults,...o},s=this.onError(!!r.silent,!!r.async);if(this.defaults.async===!0&&o.async===!1)return s(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof e>"u"||e===null)return s(new Error("marked(): input parameter is undefined or null"));if(typeof e!="string")return s(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(e)+", string expected"));if(r.hooks&&(r.hooks.options=r,r.hooks.block=n),r.async)return(async()=>{let t=r.hooks?await r.hooks.preprocess(e):e,l=await(r.hooks?await r.hooks.provideLexer(n):n?L.lex:L.lexInline)(t,r),u=r.hooks?await r.hooks.processAllTokens(l):l;r.walkTokens&&await Promise.all(this.walkTokens(u,r.walkTokens));let i=await(r.hooks?await r.hooks.provideParser(n):n?C.parse:C.parseInline)(u,r);return r.hooks?await r.hooks.postprocess(i):i})().catch(s);try{r.hooks&&(e=r.hooks.preprocess(e));let t=(r.hooks?r.hooks.provideLexer(n):n?L.lex:L.lexInline)(e,r);r.hooks&&(t=r.hooks.processAllTokens(t)),r.walkTokens&&this.walkTokens(t,r.walkTokens);let l=(r.hooks?r.hooks.provideParser(n):n?C.parse:C.parseInline)(t,r);return r.hooks&&(l=r.hooks.postprocess(l)),l}catch(t){return s(t)}}}onError(n,e){return a=>{if(a.message+=`
Please report this to https://github.com/markedjs/marked.`,n){let o="<p>An error occurred:</p><pre>"+A(a.message+"",!0)+"</pre>";return e?Promise.resolve(o):o}if(e)return Promise.reject(a);throw a}}},N=new va;function w(n,e){return N.parse(n,e)}w.options=w.setOptions=function(n){return N.setOptions(n),w.defaults=N.defaults,ca(w.defaults),w};w.getDefaults=je;w.defaults=U;function fo(...n){return N.use(...n),w.defaults=N.defaults,ca(w.defaults),w}w.use=fo;w.walkTokens=function(n,e){return N.walkTokens(n,e)};w.parseInline=N.parseInline;w.Parser=C;w.parser=C.parse;w.Renderer=se;w.TextRenderer=Ce;w.Lexer=L;w.lexer=L.lex;w.Tokenizer=re;w.Hooks=Q;w.parse=w;w.options;w.setOptions;w.walkTokens;w.parseInline;C.parse;L.lex;const vo={"help/administracion/01-usuarios.webp":[1200,844],"help/administracion/02-auditoria.webp":[1200,844],"help/administracion/03-consola.webp":[1200,844],"help/agenda-precios-y-links/01-ficha.webp":[1200,844],"help/agenda-precios-y-links/02-agenda.webp":[1200,844],"help/agenda-precios-y-links/03-libro-de-precios.webp":[1200,844],"help/agenda-precios-y-links/04-links.webp":[1200,844],"help/anticipos-y-bonos/01-lista.webp":[1168,314],"help/anticipos-y-bonos/02-nuevo-anticipo.webp":[448,564],"help/anticipos-y-bonos/03-vista-previa.webp":[1158,247],"help/anticipos-y-bonos/04-confirmar-cuotas.webp":[448,274],"help/anticipos-y-bonos/05-despues-de-la-nomina.webp":[1158,196],"help/anticipos-y-bonos/06-en-la-nomina.webp":[672,434],"help/calendario-y-dashboard/01-calendario.webp":[1200,844],"help/calendario-y-dashboard/02-dia.webp":[1440,900],"help/calendario-y-dashboard/03-dashboard.webp":[1200,844],"help/cheques-y-pagos/01-proximos.webp":[1200,844],"help/cheques-y-pagos/02-cheque.webp":[672,698],"help/cheques-y-pagos/03-credito.webp":[672,744],"help/cheques-y-pagos/04-pagar.webp":[384,326],"help/cheques-y-pagos/05-menu.webp":[1162,254],"help/cheques-y-pagos/06-abono.webp":[672,442],"help/cheques-y-pagos/07-informe.webp":[1152,810],"help/contratos/01-empleadores.webp":[448,334],"help/contratos/02-mandantes.webp":[448,334],"help/contratos/03-contratar.webp":[672,514],"help/contratos/04-vigentes.webp":[1167,526],"help/contratos/05-mandante-en-bloque.webp":[448,242],"help/contratos/06-terminar.webp":[448,296],"help/contratos/07-finiquitos.webp":[1167,314],"help/contratos/08-historial.webp":[642,186],"help/contratos/09-grilla-por-contrato.webp":[1168,374],"help/contratos/10-generar-honorarios.webp":[896,810],"help/contratos/11-direccion.webp":[448,298],"help/contratos/12-boletas.webp":[896,540],"help/contratos/13-generar-imposiciones.webp":[896,810],"help/contratos/14-dias-trabajados.webp":[868,395],"help/contratos/15-enviar-imposiciones.webp":[896,540],"help/contratos/16-telefono.webp":[412,900],"help/corregir-nomina/01-botones.webp":[1126,42],"help/corregir-nomina/02-recalcular.webp":[672,222],"help/corregir-nomina/03-editar-contenido.webp":[1126,48],"help/corregir-nomina/04-agregar-persona.webp":[896,810],"help/corregir-nomina/05-editar-ciclos.webp":[896,640],"help/corregir-nomina/06-revisar-cambios.webp":[672,578],"help/corregir-nomina/07-sacar-persona.webp":[1116,39],"help/corregir-nomina/08-confirmar-sacar.webp":[384,242],"help/cosecha-qr/01-prefijo.webp":[384,536],"help/cosecha-qr/02-sincronizar.webp":[384,504],"help/cosecha-qr/03-pesajes.webp":[1200,844],"help/cosecha-qr/04-asignar.webp":[384,298],"help/facturacion/01-empresas.webp":[672,298],"help/facturacion/02-importar.webp":[1280,554],"help/facturacion/03-facturas.webp":[1200,844],"help/facturacion/04-nota-de-credito.webp":[672,802],"help/facturacion/05-abono.webp":[672,780],"help/facturacion/06-pendientes.webp":[1200,844],"help/facturacion/07-iva-pendiente.webp":[1200,844],"help/facturacion/08-centros-de-costo.webp":[1384,484],"help/facturacion/09-resumen.webp":[1200,844],"help/faenas-y-ciclos/01-nueva-faena.webp":[256,58],"help/faenas-y-ciclos/02-datos-faena.webp":[448,364],"help/faenas-y-ciclos/03-faena-sin-subfaenas.webp":[1148,226],"help/faenas-y-ciclos/04-primer-ciclo.webp":[448,202],"help/faenas-y-ciclos/05-nuevo-ciclo.webp":[448,642],"help/faenas-y-ciclos/06-fila-del-ciclo.webp":[1116,65],"help/faenas-y-ciclos/07-cerrar-ciclo.webp":[448,162],"help/faenas-y-ciclos/08-ciclo-siguiente.webp":[448,194],"help/faenas-y-ciclos/09-reabrir.webp":[1116,65],"help/grilla-del-ciclo/01-abrir-ciclo.webp":[1200,844],"help/grilla-del-ciclo/02-pantalla.webp":[1200,844],"help/grilla-del-ciclo/03-precio-sugerido.webp":[922,153],"help/grilla-del-ciclo/04-precios-del-dia.webp":[617,121],"help/grilla-del-ciclo/05-varias-celdas.webp":[812,187],"help/grilla-del-ciclo/06-agregar-persona.webp":[448,266],"help/grilla-del-ciclo/07-agregar-dia.webp":[509,54],"help/grilla-del-ciclo/07-quitar-dia.webp":[519,42],"help/grilla-del-ciclo/08-nota-del-dia.webp":[672,292],"help/grilla-del-ciclo/09-mensual.webp":[1160,222],"help/grilla-del-ciclo/10-por-grupo.webp":[1168,374],"help/grilla-del-ciclo/11-telefono.webp":[412,900],"help/grilla-del-ciclo/12-importar-archivo.webp":[896,698],"help/grilla-del-ciclo/13-importar-personas.webp":[896,560],"help/grilla-del-ciclo/14-importar-revisar.webp":[896,476],"help/grilla-del-ciclo/15-limpiar-labor.webp":[384,370],"help/nomina/01-elegir-ciclos.webp":[1164,174],"help/nomina/02-continuar.webp":[1152,64],"help/nomina/03-vista-previa.webp":[1168,668],"help/nomina/04-historial.webp":[1150,89],"help/nomina/05-mas-acciones.webp":[248,235],"help/nomina/06-detalle.webp":[1152,810],"help/nomina/07-descargar.webp":[248,247],"help/nomina/08-imprimir.webp":[249,122],"help/nomina/09-marcar-pagada.webp":[448,352],"help/nomina/10-cerrar-ciclos.webp":[672,298],"help/pagar-transportes/01-pago-por-faena.webp":[1200,844],"help/pagar-transportes/02-vista-previa.webp":[1200,844],"help/pagar-transportes/03-resumenes.webp":[1200,844],"help/pagar-transportes/04-pagar-suelto.webp":[896,612],"help/pagar-transportes/05-abono.webp":[896,716],"help/pagar-transportes/06-nueva-quincena.webp":[896,662],"help/pagar-transportes/07-quincena.webp":[1152,446],"help/pagar-transportes/08-confirmar-pago.webp":[448,272],"help/pagar-transportes/09-liquidar.webp":[448,252],"help/pagar-transportes/10-balance.webp":[1164,397],"help/pagar-transportes/11-liquidacion.webp":[866,127],"help/precios-del-dia/01-nueva-labor.webp":[448,570],"help/precios-del-dia/02-cosecha.webp":[222,350],"help/precios-del-dia/03-agregar-tipo.webp":[448,336],"help/precios-del-dia/04-trato.webp":[414,190],"help/precios-del-dia/05-piso.webp":[403,190],"help/precios-del-dia/06-piso-a-todos.webp":[384,242],"help/precios-del-dia/07-piso-grilla.webp":[1156,263],"help/precios-del-dia/07-piso-por-envase.webp":[236,371],"help/precios-del-dia/08-etapas.webp":[237,179],"help/precios-del-dia/09-etapas-editar.webp":[448,628],"help/precios-del-dia/10-horas-extras.webp":[1146,90],"help/precios-del-dia/11-configurar-dia.webp":[448,402],"help/primeros-pasos/01-entrar.webp":[432,406],"help/primeros-pasos/02-menu.webp":[287,900],"help/primeros-pasos/03-boton-ayuda.webp":[237,61],"help/primeros-pasos/04-buscar.webp":[784,534],"help/primeros-pasos/05-tema.webp":[217,279],"help/primeros-pasos/06-indicadores.webp":[780,47],"help/primeros-pasos/07-menu-telefono.webp":[412,900],"help/resumen-del-ciclo/01-abrir.webp":[564,50],"help/resumen-del-ciclo/02-pagar.webp":[896,810],"help/resumen-del-ciclo/03-tarifas.webp":[866,210],"help/resumen-del-ciclo/04-ajustar.webp":[830,229],"help/resumen-del-ciclo/05-total.webp":[830,111],"help/resumen-del-ciclo/06-bloquear.webp":[384,262],"help/trabajadores/01-lista.webp":[1168,324],"help/trabajadores/02-nuevo.webp":[672,810],"help/trabajadores/03-forma-de-pago.webp":[642,344],"help/trabajadores/04-datos-personales.webp":[642,375],"help/trabajadores/05-resumen.webp":[896,564],"help/trabajadores/06-telefono.webp":[412,900],"help/trabajadores/07-unir-fichas.webp":[672,692],"help/transportes/01-transportistas.webp":[1168,444],"help/transportes/02-transportista.webp":[672,452],"help/transportes/03-vueltas-del-ciclo.webp":[896,476],"help/transportes/04-agregar-vuelta.webp":[672,576],"help/transportes/05-vueltas.webp":[1200,844],"help/transportes/06-sin-precio.webp":[672,278],"help/transportes/07-resumen-transportista.webp":[896,640],"help/transportes/08-telefono.webp":[412,900]},Xe=n=>String(n??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),yo=new va({renderer:{image({href:n,text:e}){const a=n.startsWith("help/")?`/TeRRaAdmin/${n}`:n,o=vo[n],r=o?` width="${o[0]}" height="${o[1]}"`:"";return`<img src="${Xe(a)}" alt="${Xe(e)}"${r} loading="lazy" decoding="async">`}}}),ya=n=>yo.parse(n||"");function qo(n){const e=G.c(24),{guide:a}=n,{hash:o}=Ye(),r=ja(),s=a.sections.map(xo);let t;e[0]!==a.intro?(t=ya(a.intro),e[0]=a.intro,e[1]=t):t=e[1];const l=t;let u;e[2]!==o?(u=()=>{const x=decodeURIComponent(o.replace(/^#/,""));if(!x)return;const E=document.getElementById(`help-${x}`);if(!E)return;E.scrollIntoView({behavior:"smooth",block:"start"}),E.classList.add("help-section-hit");const k=setTimeout(()=>E.classList.remove("help-section-hit"),2500);return()=>clearTimeout(k)},e[2]=o,e[3]=u):u=e[3];let i;e[4]!==a.id||e[5]!==o?(i=[o,a.id],e[4]=a.id,e[5]=o,e[6]=i):i=e[6],K.useEffect(u,i);let c;e[7]!==r?(c=x=>{const k=x.target.closest("a")?.getAttribute("href")||"";k.startsWith("/ayuda")&&(x.preventDefault(),r(k))},e[7]=r,e[8]=c):c=e[8];const d=c,m="space-y-4";let p;e[9]===Symbol.for("react.memo_cache_sentinel")?(p=f.jsx(ee,{to:"/ayuda",className:"text-sm text-[var(--color-muted)] hover:text-[var(--color-accent)]",children:"← Todas las guías"}),e[9]=p):p=e[9];let b;e[10]!==a.icon||e[11]!==a.title?(b=f.jsxs("h1",{className:"mt-1 text-xl font-semibold sm:text-2xl",children:[a.icon," ",a.title]}),e[10]=a.icon,e[11]=a.title,e[12]=b):b=e[12];let h;e[13]!==a.intro||e[14]!==l?(h=a.intro&&f.jsx("div",{className:"help-prose mt-1",dangerouslySetInnerHTML:{__html:l}}),e[13]=a.intro,e[14]=l,e[15]=h):h=e[15];let g;e[16]!==b||e[17]!==h?(g=f.jsxs("div",{children:[p,b,h]}),e[16]=b,e[17]=h,e[18]=g):g=e[18];const q=s.length>1&&f.jsxs("nav",{className:"rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3","aria-label":"En esta guía",children:[f.jsx("div",{className:"mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]",children:"En esta guía"}),f.jsx("ol",{className:"list-decimal space-y-0.5 pl-5 text-sm",children:s.map(x=>f.jsx("li",{children:f.jsx(ee,{to:`/ayuda/${a.id}#${x.id}`,className:"hover:text-[var(--color-accent)]",children:x.title})},x.id))})]}),v=s.map(wo);let j;return e[19]!==d||e[20]!==q||e[21]!==v||e[22]!==g?(j=f.jsxs("article",{className:m,onClick:d,children:[g,q,v]}),e[19]=d,e[20]=q,e[21]=v,e[22]=g,e[23]=j):j=e[23],j}function wo(n){return f.jsxs("section",{id:`help-${n.id}`,className:"scroll-mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-shadow sm:p-5",children:[f.jsx("h2",{className:"mb-2 text-lg font-semibold",children:n.title}),f.jsx("div",{className:"help-prose",dangerouslySetInnerHTML:{__html:n.html}})]},n.id)}function xo(n){return{...n,html:ya(n.body)}}function ko(n){const e=G.c(5),{guides:a}=n;let o;e[0]===Symbol.for("react.memo_cache_sentinel")?(o=f.jsxs("div",{children:[f.jsx("h1",{className:"text-xl font-semibold sm:text-2xl",children:"❓ Ayuda"}),f.jsx("p",{className:"text-sm text-[var(--color-muted)]",children:"Cómo hacer cada tarea en TeRRa, paso a paso. Escribe arriba lo que quieres hacer, o elige una guía."})]}),e[0]=o):o=e[0];let r;e[1]!==a?(r=a.map(jo),e[1]=a,e[2]=r):r=e[2];let s;return e[3]!==r?(s=f.jsxs("div",{className:"space-y-3",children:[o,f.jsx("div",{className:"grid gap-3 sm:grid-cols-2",children:r})]}),e[3]=r,e[4]=s):s=e[4],s}function jo(n){return f.jsxs(ee,{to:`/ayuda/${n.id}`,className:"block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)]",children:[f.jsxs("div",{className:"font-semibold",children:[n.icon," ",n.title]}),f.jsx("p",{className:"mt-1 text-sm text-[var(--color-muted)]",children:Ke(n.intro)}),f.jsxs("div",{className:"mt-2 text-xs text-[var(--color-muted)]",children:[n.sections.length," secciones"]})]},n.id)}function So(n){const e=G.c(10),{query:a,guideId:o,fromPath:r}=n,s=Sa();let t;e[0]===Symbol.for("react.memo_cache_sentinel")?(t={query:null,status:"idle"},e[0]=t):t=e[0];const[l,u]=K.useState(t),i=l.query===a?l.status:"idle";let c;e[1]!==r||e[2]!==o||e[3]!==a||e[4]!==i||e[5]!==s?(c=async()=>{const p=a.trim();if(!p||i!=="idle")return;u({query:a,status:"sending"});const{error:b}=await Ea(()=>Ta.create({question:p,guideId:o||null,fromPath:r||null}));if(b){console.error("[ayuda] guardar la pregunta:",b),s.error("No se pudo guardar la pregunta. Intenta de nuevo."),u({query:a,status:"idle"});return}u({query:a,status:"sent"})},e[1]=r,e[2]=o,e[3]=a,e[4]=i,e[5]=s,e[6]=c):c=e[6];const d=c;let m;return e[7]!==d||e[8]!==i?(m={status:i,report:d},e[7]=d,e[8]=i,e[9]=m):m=e[9],m}function Eo(n){const e=G.c(15),{index:a,isAdmin:o,guideId:r,fromPath:s}=n,[t,l]=K.useState(""),[u,i]=K.useState(!0),c=Za(a,t,{isAdmin:o});let d;e[0]!==t?(d=t.trim(),e[0]=t,e[1]=d):d=e[1];const m=d.length>=3;let p;e[2]!==s||e[3]!==r||e[4]!==t?(p={query:t,guideId:r,fromPath:s},e[2]=s,e[3]=r,e[4]=t,e[5]=p):p=e[5];const{status:b,report:h}=So(p),g="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4";let q;e[6]===Symbol.for("react.memo_cache_sentinel")?(q=f.jsx("label",{htmlFor:"help-search",className:"mb-1.5 block text-sm font-semibold",children:"¿Qué quieres hacer?"}),e[6]=q):q=e[6];let v,j;e[7]===Symbol.for("react.memo_cache_sentinel")?(v=T=>{l(T.target.value),i(!0)},j=()=>i(!0),e[7]=v,e[8]=j):(v=e[7],j=e[8]);let x;e[9]!==t?(x=f.jsx("input",{id:"help-search",type:"search",value:t,onChange:v,onFocus:j,placeholder:"Por ejemplo: cómo agrego a una persona a la nómina",autoComplete:"off",className:"w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"}),e[9]=t,e[10]=x):x=e[10];const E=u&&m&&f.jsxs("div",{className:"mt-2",children:[c.length>0?f.jsx("ul",{className:"divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]",children:c.map(T=>f.jsx("li",{children:f.jsxs(ee,{to:`/ayuda/${T.guideId}#${T.sectionId}`,onClick:()=>i(!1),className:"block px-3 py-2 hover:bg-[var(--color-accent-soft)]",children:[f.jsx("div",{className:"text-xs text-[var(--color-muted)]",children:T.guideTitle}),f.jsx("div",{className:"text-sm font-medium",children:T.title}),f.jsx("div",{className:"mt-0.5 text-xs text-[var(--color-muted)]",children:Wa(T.text,t).map(To)})]})},T.id))}):f.jsx("p",{className:"text-sm text-[var(--color-muted)]",children:"No encontré eso en la ayuda."}),f.jsx("div",{className:"mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]",children:b==="sent"?f.jsx("span",{children:"Gracias, quedó anotado para sumar esa respuesta a la ayuda."}):f.jsxs(f.Fragment,{children:[f.jsx("span",{children:c.length>0?"¿No es lo que buscabas?":"Si te falta esta respuesta,"}),f.jsx("button",{type:"button",onClick:h,disabled:b==="sending",className:"min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-soft)] disabled:opacity-60",children:b==="sending"?"Enviando…":"Avisar que falta"})]})})]});let k;return e[11]!==q||e[12]!==x||e[13]!==E?(k=f.jsxs("div",{className:g,children:[q,x,E]}),e[11]=q,e[12]=x,e[13]=E,e[14]=k):k=e[14],k}function To(n,e){return n.hit?f.jsx("mark",{className:"rounded-sm bg-[var(--color-accent-soft)] px-0.5 text-[var(--color-text)]",children:n.text},e):f.jsx("span",{children:n.text},e)}const qa=hn.map(n=>({...La(n.id,n.source),icon:n.icon,adminOnly:!!n.adminOnly})),Ro=Ha(qa);function Lo(){const n=G.c(19),{guideId:e}=Ra(),{isAdmin:a}=Aa(),o=Ye();let r,s;if(n[0]!==e||n[1]!==a){let m;n[4]!==a?(m=b=>a||!b.adminOnly,n[4]=a,n[5]=m):m=n[5],r=qa.filter(m);let p;n[6]!==e?(p=b=>b.id===e,n[6]=e,n[7]=p):p=n[7],s=r.find(p),n[0]=e,n[1]=a,n[2]=r,n[3]=s}else r=n[2],s=n[3];const t=s,l=t?.id,u=o.state?.from;let i;n[8]!==a||n[9]!==l||n[10]!==u?(i=f.jsx(Eo,{index:Ro,isAdmin:a,guideId:l,fromPath:u}),n[8]=a,n[9]=l,n[10]=u,n[11]=i):i=n[11];let c;n[12]!==t||n[13]!==e||n[14]!==r?(c=t?f.jsx(qo,{guide:t}):e?f.jsx("p",{className:"rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]",children:"No existe esa guía. Busca arriba lo que quieres hacer."}):f.jsx(ko,{guides:r}),n[12]=t,n[13]=e,n[14]=r,n[15]=c):c=n[15];let d;return n[16]!==i||n[17]!==c?(d=f.jsxs("div",{className:"mx-auto max-w-3xl space-y-4",children:[i,c]}),n[16]=i,n[17]=c,n[18]=d):d=n[18],d}export{Lo as default};
