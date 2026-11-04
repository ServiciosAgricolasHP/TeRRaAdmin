import{c as G,u as Ye,a as Sa,r as K,j as f,L as ee,b as ja,d as Ea,h as Ta,e as Ra,f as Aa}from"./index-z2VEYkt8.js";const xe=/<!--\s*preguntas:([\s\S]*?)-->/gi;function ze(n){return String(n||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")}function Pe(n){const e=[];for(const a of n.matchAll(xe))for(const o of a[1].split(";")){const t=o.trim();t&&e.push(t)}return e}const $e=n=>n.replace(xe,"").replace(/\n{3,}/g,`

`).trim();function Ke(n){return String(n||"").replace(xe," ").replace(/!\[[^\]]*\]\([^)]*\)/g," ").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/\*\*([^*]+)\*\*/g,"$1").replace(/`([^`]+)`/g,"$1").replace(/[>#|]/g," ").replace(/^\s*[-+]\s+/gm," ").replace(/^\s*\d+\.\s+/gm," ").replace(/\s+/g," ").trim()}function _a(n,e){const a=String(e||"").replace(/\r\n/g,`
`).split(`
`);let o=n;const t=[],r=[];let s=null;for(const l of a){const c=/^# (.+)$/.exec(l),d=/^## (.+)$/.exec(l);c&&!s&&t.length===0?o=c[1].trim():d?(s={title:d[1].trim(),lines:[]},r.push(s)):s?s.lines.push(l):t.push(l)}const i=t.join(`
`),u=new Set;return{id:n,title:o,intro:$e(i),questions:Pe(i),sections:r.map(l=>{const c=l.lines.join(`
`);let d=ze(l.title)||"seccion";for(let m=2;u.has(d);m++)d=`${ze(l.title)}-${m}`;return u.add(d),{id:d,title:l.title,body:$e(c),questions:Pe(c)}})}}const Ca="ENTRIES",ea="KEYS",aa="VALUES",R="";class se{constructor(e,a){const o=e._tree,t=Array.from(o.keys());this.set=e,this._type=a,this._path=t.length>0?[{node:o,keys:t}]:[]}next(){const e=this.dive();return this.backtrack(),e}dive(){if(this._path.length===0)return{done:!0,value:void 0};const{node:e,keys:a}=D(this._path);if(D(a)===R)return{done:!1,value:this.result()};const o=e.get(D(a));return this._path.push({node:o,keys:Array.from(o.keys())}),this.dive()}backtrack(){if(this._path.length===0)return;const e=D(this._path).keys;e.pop(),!(e.length>0)&&(this._path.pop(),this.backtrack())}key(){return this.set._prefix+this._path.map(({keys:e})=>D(e)).filter(e=>e!==R).join("")}value(){return D(this._path).node.get(R)}result(){switch(this._type){case aa:return this.value();case ea:return this.key();default:return[this.key(),this.value()]}}[Symbol.iterator](){return this}}const D=n=>n[n.length-1],La=(n,e,a)=>{const o=new Map;if(e===void 0)return o;const t=e.length+1,r=t+a,s=new Uint8Array(r*t).fill(a+1);for(let i=0;i<t;++i)s[i]=i;for(let i=1;i<r;++i)s[i*t]=i;return na(n,e,a,o,s,1,t,""),o},na=(n,e,a,o,t,r,s,i)=>{const u=r*s;e:for(const l of n.keys())if(l===R){const c=t[u-1];c<=a&&o.set(i,[n.get(l),c])}else{let c=r;for(let d=0;d<l.length;++d,++c){const m=l[d],p=s*c,b=p-s;let g=t[p];const h=Math.max(0,c-a-1),x=Math.min(s-1,c+a);for(let v=h;v<x;++v){const S=m!==e[v],k=t[b+v]+ +S,E=t[b+v+1]+1,q=t[p+v]+1,T=t[p+v+1]=Math.min(k,E,q);T<g&&(g=T)}if(g>a)continue e}na(n.get(l),e,a,o,t,c,s,i+l)}};class P{constructor(e=new Map,a=""){this._size=void 0,this._tree=e,this._prefix=a}atPrefix(e){if(!e.startsWith(this._prefix))throw new Error("Mismatched prefix");const[a,o]=ae(this._tree,e.slice(this._prefix.length));if(a===void 0){const[t,r]=we(o);for(const s of t.keys())if(s!==R&&s.startsWith(r)){const i=new Map;return i.set(s.slice(r.length),t.get(s)),new P(i,e)}}return new P(a,e)}clear(){this._size=void 0,this._tree.clear()}delete(e){return this._size=void 0,za(this._tree,e)}entries(){return new se(this,Ca)}forEach(e){for(const[a,o]of this)e(a,o,this)}fuzzyGet(e,a){return La(this._tree,e,a)}get(e){const a=pe(this._tree,e);return a!==void 0?a.get(R):void 0}has(e){const a=pe(this._tree,e);return a!==void 0&&a.has(R)}keys(){return new se(this,ea)}set(e,a){if(typeof e!="string")throw new Error("key must be a string");return this._size=void 0,ie(this._tree,e).set(R,a),this}get size(){if(this._size)return this._size;this._size=0;const e=this.entries();for(;!e.next().done;)this._size+=1;return this._size}update(e,a){if(typeof e!="string")throw new Error("key must be a string");this._size=void 0;const o=ie(this._tree,e);return o.set(R,a(o.get(R))),this}fetch(e,a){if(typeof e!="string")throw new Error("key must be a string");this._size=void 0;const o=ie(this._tree,e);let t=o.get(R);return t===void 0&&o.set(R,t=a()),t}values(){return new se(this,aa)}[Symbol.iterator](){return this.entries()}static from(e){const a=new P;for(const[o,t]of e)a.set(o,t);return a}static fromObject(e){return P.from(Object.entries(e))}}const ae=(n,e,a=[])=>{if(e.length===0||n==null)return[n,a];for(const o of n.keys())if(o!==R&&e.startsWith(o))return a.push([n,o]),ae(n.get(o),e.slice(o.length),a);return a.push([n,e]),ae(void 0,"",a)},pe=(n,e)=>{if(e.length===0||n==null)return n;for(const a of n.keys())if(a!==R&&e.startsWith(a))return pe(n.get(a),e.slice(a.length))},ie=(n,e)=>{const a=e.length;e:for(let o=0;n&&o<a;){for(const r of n.keys())if(r!==R&&e[o]===r[0]){const s=Math.min(a-o,r.length);let i=1;for(;i<s&&e[o+i]===r[i];)++i;const u=n.get(r);if(i===r.length)n=u;else{const l=new Map;l.set(r.slice(i),u),n.set(e.slice(o,o+i),l),n.delete(r),n=l}o+=i;continue e}const t=new Map;return n.set(e.slice(o),t),t}return n},za=(n,e)=>{const[a,o]=ae(n,e);if(a!==void 0){if(a.delete(R),a.size===0)oa(o);else if(a.size===1){const[t,r]=a.entries().next().value;ta(o,t,r)}}},oa=n=>{if(n.length===0)return;const[e,a]=we(n);if(e.delete(a),e.size===0)oa(n.slice(0,-1));else if(e.size===1){const[o,t]=e.entries().next().value;o!==R&&ta(n.slice(0,-1),o,t)}},ta=(n,e,a)=>{if(n.length===0)return;const[o,t]=we(n);o.set(t+e,a),o.delete(t)},we=n=>n[n.length-1],ke="or",ra="and",Pa="and_not";class V{constructor(e){if(e?.fields==null)throw new Error('MiniSearch: option "fields" must be provided');const a=e.autoVacuum==null||e.autoVacuum===!0?ue:e.autoVacuum;this._options={...ce,...e,autoVacuum:a,searchOptions:{...Ie,...e.searchOptions||{}},autoSuggestOptions:{...Da,...e.autoSuggestOptions||{}}},this._index=new P,this._documentCount=0,this._documentIds=new Map,this._idToShortId=new Map,this._fieldIds={},this._fieldLength=new Map,this._avgFieldLength=[],this._nextId=0,this._storedFields=new Map,this._dirtCount=0,this._currentVacuum=null,this._enqueuedVacuum=null,this._enqueuedVacuumConditions=he,this.addFields(this._options.fields)}add(e){const{extractField:a,stringifyField:o,tokenize:t,processTerm:r,fields:s,idField:i}=this._options,u=a(e,i);if(u==null)throw new Error(`MiniSearch: document does not have ID field "${i}"`);if(this._idToShortId.has(u))throw new Error(`MiniSearch: duplicate ID ${u}`);const l=this.addDocumentId(u);this.saveStoredFields(l,e);for(const c of s){const d=a(e,c);if(d==null)continue;const m=t(o(d,c),c),p=this._fieldIds[c],b=new Set(m).size;this.addFieldLength(l,p,this._documentCount-1,b);for(const g of m){const h=r(g,c);if(Array.isArray(h))for(const x of h)this.addTerm(p,l,x);else h&&this.addTerm(p,l,h)}}}addAll(e){for(const a of e)this.add(a)}addAllAsync(e,a={}){const{chunkSize:o=10}=a,t={chunk:[],promise:Promise.resolve()},{chunk:r,promise:s}=e.reduce(({chunk:i,promise:u},l,c)=>(i.push(l),(c+1)%o===0?{chunk:[],promise:u.then(()=>new Promise(d=>setTimeout(d,0))).then(()=>this.addAll(i))}:{chunk:i,promise:u}),t);return s.then(()=>this.addAll(r))}remove(e){const{tokenize:a,processTerm:o,extractField:t,stringifyField:r,fields:s,idField:i}=this._options,u=t(e,i);if(u==null)throw new Error(`MiniSearch: document does not have ID field "${i}"`);const l=this._idToShortId.get(u);if(l==null)throw new Error(`MiniSearch: cannot remove document with ID ${u}: it is not in the index`);for(const c of s){const d=t(e,c);if(d==null)continue;const m=a(r(d,c),c),p=this._fieldIds[c],b=new Set(m).size;this.removeFieldLength(l,p,this._documentCount,b);for(const g of m){const h=o(g,c);if(Array.isArray(h))for(const x of h)this.removeTerm(p,l,x);else h&&this.removeTerm(p,l,h)}}this._storedFields.delete(l),this._documentIds.delete(l),this._idToShortId.delete(u),this._fieldLength.delete(l),this._documentCount-=1}removeAll(e){if(e)for(const a of e)this.remove(a);else{if(arguments.length>0)throw new Error("Expected documents to be present. Omit the argument to remove all documents.");this._index=new P,this._documentCount=0,this._documentIds=new Map,this._idToShortId=new Map,this._fieldLength=new Map,this._avgFieldLength=[],this._storedFields=new Map,this._nextId=0}}discard(e){const a=this._idToShortId.get(e);if(a==null)throw new Error(`MiniSearch: cannot discard document with ID ${e}: it is not in the index`);this._idToShortId.delete(e),this._documentIds.delete(a),this._storedFields.delete(a),(this._fieldLength.get(a)||[]).forEach((o,t)=>{this.removeFieldLength(a,t,this._documentCount,o)}),this._fieldLength.delete(a),this._documentCount-=1,this._dirtCount+=1,this.maybeAutoVacuum()}maybeAutoVacuum(){if(this._options.autoVacuum===!1)return;const{minDirtFactor:e,minDirtCount:a,batchSize:o,batchWait:t}=this._options.autoVacuum;this.conditionalVacuum({batchSize:o,batchWait:t},{minDirtCount:a,minDirtFactor:e})}discardAll(e){const a=this._options.autoVacuum;try{this._options.autoVacuum=!1;for(const o of e)this.discard(o)}finally{this._options.autoVacuum=a}this.maybeAutoVacuum()}replace(e){const{idField:a,extractField:o}=this._options,t=o(e,a);this.discard(t),this.add(e)}vacuum(e={}){return this.conditionalVacuum(e)}conditionalVacuum(e,a){return this._currentVacuum?(this._enqueuedVacuumConditions=this._enqueuedVacuumConditions&&a,this._enqueuedVacuum!=null?this._enqueuedVacuum:(this._enqueuedVacuum=this._currentVacuum.then(()=>{const o=this._enqueuedVacuumConditions;return this._enqueuedVacuumConditions=he,this.performVacuuming(e,o)}),this._enqueuedVacuum)):this.vacuumConditionsMet(a)===!1?Promise.resolve():(this._currentVacuum=this.performVacuuming(e),this._currentVacuum)}async performVacuuming(e,a){const o=this._dirtCount;if(this.vacuumConditionsMet(a)){const t=e.batchSize||me.batchSize,r=e.batchWait||me.batchWait;let s=1;for(const[i,u]of this._index){for(const[l,c]of u)for(const[d]of c)this._documentIds.has(d)||(c.size<=1?u.delete(l):c.delete(d));this._index.get(i).size===0&&this._index.delete(i),s%t===0&&await new Promise(l=>setTimeout(l,r)),s+=1}this._dirtCount-=o}await null,this._currentVacuum=this._enqueuedVacuum,this._enqueuedVacuum=null}vacuumConditionsMet(e){if(e==null)return!0;let{minDirtCount:a,minDirtFactor:o}=e;return a=a||ue.minDirtCount,o=o||ue.minDirtFactor,this.dirtCount>=a&&this.dirtFactor>=o}get isVacuuming(){return this._currentVacuum!=null}get dirtCount(){return this._dirtCount}get dirtFactor(){return this._dirtCount/(1+this._documentCount+this._dirtCount)}has(e){return this._idToShortId.has(e)}getStoredFields(e){const a=this._idToShortId.get(e);if(a!=null)return this._storedFields.get(a)}search(e,a={}){const{searchOptions:o}=this._options,t={...o,...a},r=this.executeQuery(e,a),s=[];for(const[i,{score:u,terms:l,match:c}]of r){const d=l.length||1,m={id:this._documentIds.get(i),score:u*d,terms:Object.keys(c),queryTerms:l,match:c};Object.assign(m,this._storedFields.get(i)),(t.filter==null||t.filter(m))&&s.push(m)}return e===V.wildcard&&t.boostDocument==null||s.sort(Me),s}autoSuggest(e,a={}){a={...this._options.autoSuggestOptions,...a};const o=new Map;for(const{score:r,terms:s}of this.search(e,a)){const i=s.join(" "),u=o.get(i);u!=null?(u.score+=r,u.count+=1):o.set(i,{score:r,terms:s,count:1})}const t=[];for(const[r,{score:s,terms:i,count:u}]of o)t.push({suggestion:r,terms:i,score:s/u});return t.sort(Me),t}get documentCount(){return this._documentCount}get termCount(){return this._index.size}static loadJSON(e,a){if(a==null)throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");return this.loadJS(JSON.parse(e),a)}static async loadJSONAsync(e,a){if(a==null)throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");return this.loadJSAsync(JSON.parse(e),a)}static getDefault(e){if(ce.hasOwnProperty(e))return le(ce,e);throw new Error(`MiniSearch: unknown option "${e}"`)}static loadJS(e,a){const{index:o,documentIds:t,fieldLength:r,storedFields:s,serializationVersion:i}=e,u=this.instantiateMiniSearch(e,a);u._documentIds=J(t),u._fieldLength=J(r),u._storedFields=J(s);for(const[l,c]of u._documentIds)u._idToShortId.set(c,l);for(const[l,c]of o){const d=new Map;for(const m of Object.keys(c)){let p=c[m];i===1&&(p=p.ds),d.set(parseInt(m,10),J(p))}u._index.set(l,d)}return u}static async loadJSAsync(e,a){const{index:o,documentIds:t,fieldLength:r,storedFields:s,serializationVersion:i}=e,u=this.instantiateMiniSearch(e,a);u._documentIds=await X(t),u._fieldLength=await X(r),u._storedFields=await X(s);for(const[c,d]of u._documentIds)u._idToShortId.set(d,c);let l=0;for(const[c,d]of o){const m=new Map;for(const p of Object.keys(d)){let b=d[p];i===1&&(b=b.ds),m.set(parseInt(p,10),await X(b))}++l%1e3===0&&await sa(0),u._index.set(c,m)}return u}static instantiateMiniSearch(e,a){const{documentCount:o,nextId:t,fieldIds:r,averageFieldLength:s,dirtCount:i,serializationVersion:u}=e;if(u!==1&&u!==2)throw new Error("MiniSearch: cannot deserialize an index created with an incompatible version");const l=new V(a);return l._documentCount=o,l._nextId=t,l._idToShortId=new Map,l._fieldIds=r,l._avgFieldLength=s,l._dirtCount=i||0,l._index=new P,l}executeQuery(e,a={}){if(e===V.wildcard)return this.executeWildcardQuery(a);if(typeof e!="string"){const m={...a,...e,queries:void 0},p=e.queries.map(b=>this.executeQuery(b,m));return this.combineResults(p,m.combineWith)}const{tokenize:o,processTerm:t,searchOptions:r}=this._options,s={tokenize:o,processTerm:t,...r,...a},{tokenize:i,processTerm:u}=s,d=i(e).flatMap(m=>u(m)).filter(m=>!!m).map(Ma(s)).map(m=>this.executeQuerySpec(m,s));return this.combineResults(d,s.combineWith)}executeQuerySpec(e,a){const o={...this._options.searchOptions,...a},t=(o.fields||this._options.fields).reduce((g,h)=>({...g,[h]:le(o.boost,h)||1}),{}),{boostDocument:r,weights:s,maxFuzzy:i,bm25:u}=o,{fuzzy:l,prefix:c}={...Ie.weights,...s},d=this._index.get(e.term),m=this.termResults(e.term,e.term,1,e.termBoost,d,t,r,u);let p,b;if(e.prefix&&(p=this._index.atPrefix(e.term)),e.fuzzy){const g=e.fuzzy===!0?.2:e.fuzzy,h=g<1?Math.min(i,Math.round(e.term.length*g)):g;h&&(b=this._index.fuzzyGet(e.term,h))}if(p)for(const[g,h]of p){const x=g.length-e.term.length;if(!x)continue;b?.delete(g);const v=c*g.length/(g.length+.3*x);this.termResults(e.term,g,v,e.termBoost,h,t,r,u,m)}if(b)for(const g of b.keys()){const[h,x]=b.get(g);if(!x)continue;const v=l*g.length/(g.length+x);this.termResults(e.term,g,v,e.termBoost,h,t,r,u,m)}return m}executeWildcardQuery(e){const a=new Map,o={...this._options.searchOptions,...e};for(const[t,r]of this._documentIds){const s=o.boostDocument?o.boostDocument(r,"",this._storedFields.get(t)):1;a.set(t,{score:s,terms:[],match:{}})}return a}combineResults(e,a=ke){if(e.length===0)return new Map;const o=a.toLowerCase(),t=$a[o];if(!t)throw new Error(`Invalid combination operator: ${a}`);return e.reduce(t)||new Map}toJSON(){const e=[];for(const[a,o]of this._index){const t={};for(const[r,s]of o)t[r]=Object.fromEntries(s);e.push([a,t])}return{documentCount:this._documentCount,nextId:this._nextId,documentIds:Object.fromEntries(this._documentIds),fieldIds:this._fieldIds,fieldLength:Object.fromEntries(this._fieldLength),averageFieldLength:this._avgFieldLength,storedFields:Object.fromEntries(this._storedFields),dirtCount:this._dirtCount,index:e,serializationVersion:2}}termResults(e,a,o,t,r,s,i,u,l=new Map){if(r==null)return l;for(const c of Object.keys(s)){const d=s[c],m=this._fieldIds[c],p=r.get(m);if(p==null)continue;let b=p.size;const g=this._avgFieldLength[m];for(const h of p.keys()){if(!this._documentIds.has(h)){this.removeTerm(m,h,a),b-=1;continue}const x=i?i(this._documentIds.get(h),a,this._storedFields.get(h)):1;if(!x)continue;const v=p.get(h),S=this._fieldLength.get(h)[m],k=Na(v,b,this._documentCount,S,g,u),E=o*t*d*x*k,q=l.get(h);if(q){q.score+=E,Fa(q.terms,e);const T=le(q.match,a);T?T.push(c):q.match[a]=[c]}else l.set(h,{score:E,terms:[e],match:{[a]:[c]}})}}return l}addTerm(e,a,o){const t=this._index.fetch(o,De);let r=t.get(e);if(r==null)r=new Map,r.set(a,1),t.set(e,r);else{const s=r.get(a);r.set(a,(s||0)+1)}}removeTerm(e,a,o){if(!this._index.has(o)){this.warnDocumentChanged(a,e,o);return}const t=this._index.fetch(o,De),r=t.get(e);r==null||r.get(a)==null?this.warnDocumentChanged(a,e,o):r.get(a)<=1?r.size<=1?t.delete(e):r.delete(a):r.set(a,r.get(a)-1),this._index.get(o).size===0&&this._index.delete(o)}warnDocumentChanged(e,a,o){for(const t of Object.keys(this._fieldIds))if(this._fieldIds[t]===a){this._options.logger("warn",`MiniSearch: document with ID ${this._documentIds.get(e)} has changed before removal: term "${o}" was not present in field "${t}". Removing a document after it has changed can corrupt the index!`,"version_conflict");return}}addDocumentId(e){const a=this._nextId;return this._idToShortId.set(e,a),this._documentIds.set(a,e),this._documentCount+=1,this._nextId+=1,a}addFields(e){for(let a=0;a<e.length;a++)this._fieldIds[e[a]]=a}addFieldLength(e,a,o,t){let r=this._fieldLength.get(e);r==null&&this._fieldLength.set(e,r=[]),r[a]=t;const i=(this._avgFieldLength[a]||0)*o+t;this._avgFieldLength[a]=i/(o+1)}removeFieldLength(e,a,o,t){if(o===1){this._avgFieldLength[a]=0;return}const r=this._avgFieldLength[a]*o-t;this._avgFieldLength[a]=r/(o-1)}saveStoredFields(e,a){const{storeFields:o,extractField:t}=this._options;if(o==null||o.length===0)return;let r=this._storedFields.get(e);r==null&&this._storedFields.set(e,r={});for(const s of o){const i=t(a,s);i!==void 0&&(r[s]=i)}}}V.wildcard=Symbol("*");const le=(n,e)=>Object.prototype.hasOwnProperty.call(n,e)?n[e]:void 0,$a={[ke]:(n,e)=>{for(const a of e.keys()){const o=n.get(a);if(o==null)n.set(a,e.get(a));else{const{score:t,terms:r,match:s}=e.get(a);o.score=o.score+t,o.match=Object.assign(o.match,s),Ne(o.terms,r)}}return n},[ra]:(n,e)=>{const a=new Map;for(const o of e.keys()){const t=n.get(o);if(t==null)continue;const{score:r,terms:s,match:i}=e.get(o);Ne(t.terms,s),a.set(o,{score:t.score+r,terms:t.terms,match:Object.assign(t.match,i)})}return a},[Pa]:(n,e)=>{for(const a of e.keys())n.delete(a);return n}},Ia={k:1.2,b:.7,d:.5},Na=(n,e,a,o,t,r)=>{const{k:s,b:i,d:u}=r;return Math.log(1+(a-e+.5)/(e+.5))*(u+n*(s+1)/(n+s*(1-i+i*o/t)))},Ma=n=>(e,a,o)=>{const t=typeof n.fuzzy=="function"?n.fuzzy(e,a,o):n.fuzzy||!1,r=typeof n.prefix=="function"?n.prefix(e,a,o):n.prefix===!0,s=typeof n.boostTerm=="function"?n.boostTerm(e,a,o):1;return{term:e,fuzzy:t,prefix:r,termBoost:s}},ce={idField:"id",extractField:(n,e)=>n[e],stringifyField:(n,e)=>n.toString(),tokenize:n=>n.split(Va),processTerm:n=>n.toLowerCase(),fields:void 0,searchOptions:void 0,storeFields:[],logger:(n,e)=>{typeof console?.[n]=="function"&&console[n](e)},autoVacuum:!0},Ie={combineWith:ke,prefix:!1,fuzzy:!1,maxFuzzy:6,boost:{},weights:{fuzzy:.45,prefix:.375},bm25:Ia},Da={combineWith:ra,prefix:(n,e,a)=>e===a.length-1},me={batchSize:1e3,batchWait:10},he={minDirtFactor:.1,minDirtCount:20},ue={...me,...he},Fa=(n,e)=>{n.includes(e)||n.push(e)},Ne=(n,e)=>{for(const a of e)n.includes(a)||n.push(a)},Me=({score:n},{score:e})=>e-n,De=()=>new Map,J=n=>{const e=new Map;for(const a of Object.keys(n))e.set(parseInt(a,10),n[a]);return e},X=async n=>{const e=new Map;let a=0;for(const o of Object.keys(n))e.set(parseInt(o,10),n[o]),++a%1e3===0&&await sa(0);return e},sa=n=>new Promise(e=>setTimeout(e,n)),Va=/[\n\r\p{Z}\p{P}]+/u,Oa=new Set(["a","al","algo","algun","alguna","alguno","como","con","cual","cuando","de","del","donde","e","el","ella","en","es","esa","ese","eso","esta","este","esto","hacer","hago","hay","la","las","le","les","lo","los","me","mi","mis","muy","ni","no","o","para","pero","por","puedo","que","quiero","se","si","sin","sobre","su","sus","te","tengo","tu","un","una","uno","unos","unas","y","ya","yo"]),ia=["aciones","amiento","imiento","acion","ieron","ando","iendo","aron","aban","ados","adas","idos","idas","ado","ada","ido","ida","ar","er","ir","es","as","os","e","a","o","s"];function qe(n){return String(n||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}const Ua=n=>n.endsWith("gu")?n.slice(0,-1):n.endsWith("qu")?`${n.slice(0,-2)}c`:n,ge=(n,e)=>{const a=e.find(o=>n.endsWith(o)&&n.length-o.length>=3);return Ua(a?n.slice(0,-a.length):n)};function Fe(n){return ge(qe(n),ia)}function Ba(n){const e=qe(n);return[...new Set([ge(e,ia),ge(e,["es","s","a","e","o"])])]}const Qa=[["persona","trabajador","trabajadora","alguien","gente","empleado","empleada"],["agregar","sumar","anadir","meter","incluir"],["sacar","quitar","eliminar","borrar","remover"],["vuelta","viaje","flete"],["anticipo","adelanto"],["monto","plata","valor"],["celda","casilla","cuadro"]],la=new Map;for(const n of Qa){const e=Fe(n[0]);for(const a of n)la.set(Fe(a),e)}function be(n){const e=qe(n);return!e||Oa.has(e)?null:[...new Set(Ba(e).map(a=>la.get(a)||a))]}function Ga(n){const e=[];for(const a of n)for(const o of a.sections)e.push({id:`${a.id}#${o.id}`,guideId:a.id,sectionId:o.id,guideTitle:a.title,title:o.title,questions:o.questions.join(" · "),text:Ke(o.body),adminOnly:!!a.adminOnly});return e}function Za(n){const e=new V({fields:["title","questions","text","guideTitle"],storeFields:["guideId","sectionId","guideTitle","title","text","adminOnly"],processTerm:be});return e.addAll(Ga(n)),e}function Ha(n,e,{limit:a=5,isAdmin:o=!1}={}){if(!String(e||"").trim())return[];const r=n.search(e,{boost:{questions:4,title:3,guideTitle:1.5,text:1},fuzzy:i=>i.length>=7?2:i.length>=4?1:0,prefix:i=>i.length>2,combineWith:"OR"}).filter(i=>o||!i.adminOnly);if(r.length===0)return[];const s=r[0].score;return r.filter(i=>i.score>=s*.3).slice(0,a)}function Wa(n,e,a=160){const o=new Set(String(e||"").split(/[^\p{L}\p{N}]+/u).flatMap(l=>be(l)||[])),t=l=>(be(l)||[]).some(c=>o.has(c)),r=String(n||"").split(new RegExp("(?<=[.!?:])\\s+"));let s=r[0]||"",i=-1;for(const l of r){const c=l.split(/[^\p{L}\p{N}]+/u).filter(t).length;c>i&&(s=l,i=c)}return(s.length>a?`${s.slice(0,a).replace(/\s+\S*$/,"")}…`:s).split(/([\p{L}\p{N}]+)/u).filter(Boolean).map(l=>({text:l,hit:t(l)}))}const Ja=`# Primeros pasos

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

Sus días no entran a la nómina. Si ya tenía días con monto, TeRRa pregunta si pasarlos a asistencia en $0; los que ya están en una nómina no se tocan.

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

## Si algo no se deja editar
<!-- preguntas: no puedo editar; no me deja escribir en la celda; celda bloqueada; por qué no puedo cambiar un monto; ciclo cerrado -->

- **El ciclo está cerrado.** Un ciclo cerrado queda congelado: para corregir algo hay que reabrirlo con **Reabrir ciclo**, arriba en la pantalla del ciclo o en su fila de Faenas.
- **La persona tiene sueldo mensual.** Sus celdas son de asistencia, no reciben montos (ver "Sueldo mensual").
- **La labor está sincronizada por QR.** La cantidad la escriben los pesajes; se corrige en **Cosecha QR**.
`,Ya=`# Faenas, subfaenas y ciclos

Todo lo que se anota en TeRRa cuelga de una **faena** (el fundo o el cliente). Cada faena se divide en **subfaenas** (un cuartel, un sector), y cada subfaena tiene sus **ciclos**: el período de trabajo donde se anotan las jornadas, en su grilla. Esta guía crea una faena con su primer ciclo, y explica cómo se cierra y se reabre un ciclo.
<!-- preguntas: qué es una faena; qué es un ciclo; qué es una subfaena; cómo se organiza el trabajo -->

## Crear una faena
<!-- preguntas: cómo creo una faena; agregar un fundo nuevo; cliente nuevo; nueva faena -->

1. En **Faenas**, toca **+ Nueva faena**.

![El botón para crear una faena](help/faenas-y-ciclos/01-nueva-faena.webp)

2. Escribe el **Nombre**; la **Ubicación** y las **Notas** son opcionales. Toca **Guardar**.

![Los datos de la faena](help/faenas-y-ciclos/02-datos-faena.webp)

El nombre se guarda con mayúscula al comienzo de cada palabra: "fundo el peumo" queda "Fundo El Peumo". Para cambiar los datos después, toca **Editar** en la tarjeta de la faena.

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
- **Una subfaena**: **Eliminar** en su fila. Elimina antes sus ciclos.
- **Una faena**: **Eliminar** en su tarjeta. Solo se puede si no tiene subfaenas ni ciclos; un admin puede borrarla en cascada, con todo lo que tiene adentro, si ninguna de sus jornadas está en una nómina.

Eliminar no se puede deshacer.

## Ordenar las tarjetas de las faenas
<!-- preguntas: cómo ordeno las faenas; agrupar faenas; cambiar el color de una faena; mover una faena -->

Arrastra una tarjeta para cambiarla de lugar. **⚙ Organizar** permite además crear grupos (**+ Grupo**), mover las faenas entre ellos y elegir colores. **✓ Listo** termina.

## Si algo no funciona
<!-- preguntas: no puedo editar un ciclo; no aparece un ciclo; no encuentro un ciclo cerrado; no me deja eliminar una faena -->

- **No se puede editar nada del ciclo**: está cerrado. Reábrelo (ver "Reabrir un ciclo").
- **No aparece un ciclo cerrado**: toca **▾ Ver N ciclos cerrados** en su subfaena.
- **No se puede eliminar un ciclo**: alguna de sus jornadas está en una nómina.
- **No se puede eliminar una faena**: todavía tiene subfaenas o ciclos.
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
<!-- preguntas: precio de la cosecha; precio por kilo; precio por bandeja; agregar calidad; agregar envase; cosecha por calidad -->

Cada día tiene sus **tipos**: una calidad y un envase (por ejemplo, Exportación / bandeja), cada uno con su precio. En la grilla, cada tipo es una columna del día, donde se anota la cantidad de cada persona; el monto es cantidad × precio.

![Los tipos de cosecha de un día](help/precios-del-dia/02-cosecha.webp)

- **$/unidad** paga cada unidad al precio; **$/día** paga el precio una vez, sin importar la cantidad.
- **+ tipo** agrega otro tipo a ese día. Elige la calidad y el envase; si no están, **+ Nueva calidad** y **+ Nuevo envase** los crean.
- La **✕** de un tipo lo quita del día.

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
<!-- preguntas: qué es el piso; cómo pongo el piso; bono por día bajo; asignar el piso a todos; quitar el piso; bono de piso -->

El piso es un bono que se suma a lo que cada persona produjo un día, pensado para compensar un día de baja producción. Existe en las labores de **Cosecha** y **A trato**.

1. En la tarjeta del día, toca **+ piso**, escribe el monto y aprieta **Enter**.
2. Toca **👥 a todos (N)** para dárselo a todas las personas con producción ese día que todavía no lo tienen, y confirma.

![Un día con piso](help/precios-del-dia/05-piso.webp)

![Confirmar el piso para todos](help/precios-del-dia/06-piso-a-todos.webp)

En la grilla aparece la columna **Piso** de ese día. Cada 🪙 se puede quitar o volver a poner por persona, y el monto de abajo es el total del día con el piso.

![La columna Piso en la grilla](help/precios-del-dia/07-piso-grilla.webp)

- **✎** cambia el monto del piso.
- **✕** quita el piso del día junto con los bonos ya asignados. Los que ya están en una nómina no se quitan.

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
<!-- preguntas: ver el detalle de la nómina; cuánto efectivo tengo que sacar; billetes y monedas; resumen por subfaena; copiar el resumen de la nómina -->

![El detalle de una nómina](help/nomina/06-detalle.webp)

- **Resumen**: lo de transferencias, lo de efectivo y el total.
- **Estimar efectivo**: cuántos billetes y monedas sacar para armar los sobres, y cuánto lleva cada persona.
- La tabla del resumen, por subfaena (**Sin labores**) o por subfaena y labor (**Con labores**), con **Copiar**, **Descargar** e **Imprimir**.
- Más abajo, los ciclos de la nómina y las personas por líder, de banco y de efectivo.
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

## Si algo no funciona
<!-- preguntas: no aparece un trabajador en la nómina; falta alguien en la nómina; no puedo eliminar la nómina; no aparece el ciclo en nómina; datos faltantes en la nómina -->

- **No aparece un ciclo en Generar**: está cerrado o no tiene nada pendiente (**Sin pendientes**).
- **No aparece una persona en la vista previa**: sus días ya están en otra nómina, todavía no tiene RUT (es temporal) o tiene sueldo mensual, que no se paga por día.
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

Toca **Aplicar cambios** para guardarlo. Recalcular también trae los días que se anotaron después en las labores de la nómina, y los nombres al día de los ciclos.

## Agregar los días de una persona
<!-- preguntas: se me olvidó una persona en la nómina; agregar a alguien a una nómina ya creada; sumar un trabajador a la nómina; agregar días a la nómina -->

1. Toca **Editar contenido** y después **+ Agregar persona**.

![Editar ciclos y Agregar persona](help/corregir-nomina/03-editar-contenido.webp)

2. Busca a la persona por nombre o RUT. Aparecen sus días sin pagar, agrupados; los que ya están en una nómina se ven sin casilla.
3. Marca los días que entran (o **Todos**, en un grupo) y toca **Agregar días**.

![Los días de una persona](help/corregir-nomina/04-agregar-persona.webp)

Si tiene anticipos o bonos pendientes, se descuentan o se suman al agregarla.

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

Tócala y confirma con **Sacar**. Sus días vuelven a quedar pendientes y sus anticipos vuelven a estar por cobrar. Se puede volver a sumar con **+ Agregar persona**.

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
<!-- preguntas: el anticipo quedó parcial; qué significa parcial; anticipo aplicado; cuánto falta del anticipo -->

![Los anticipos y el bono después de la nómina](help/anticipos-y-bonos/05-despues-de-la-nomina.webp)

- **Aplicado**: se descontó (o se pagó) entero.
- **Parcial**: se descontó una parte; queda el resto (**Resta**) para las nóminas siguientes.
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
- **✕** elimina a una persona solo si no tiene días registrados.
- Los **IDs QR** se ven en la ficha, pero se asignan en **Pesajes QR**.

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
- **Alguien inscrito con el escáner no aparece**: entra al día siguiente, o al tocar **Recargar datos** en Nómina.
`,tn=`# Contratos, honorarios e imposiciones

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
<!-- preguntas: lista de contratos vigentes; quién está a honorarios; ver los contratos; cuántos tienen contrato -->

**Vigentes** lista los contratos y honorarios de hoy, con el empleador, el mandante y las fechas. Arriba se cuenta cuántos tienen contrato, cuántos están a honorarios y cuántos finiquitos faltan por cerrar.

![Los contratos vigentes, con una persona elegida](help/contratos/04-vigentes.webp)

- Se filtra por tipo, por empleador, por mandante (o **Sin mandante**, para ver a quién le falta) y por nombre o RUT.
- El nombre de una persona abre su ficha.
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
<!-- preguntas: no aparece en la lista de honorarios; faltan días en las imposiciones; no puedo contratar a alguien; no me deja eliminar la lista -->

- **Alguien quedó afuera al contratar**: ya tiene un período en esa fecha. Revisa su historial en la ficha.
- **Falta alguien en la lista de honorarios o de imposiciones**: no tenía honorarios o contrato con ese empleador (o con ese mandante) en esas fechas, o no tiene jornadas. Revisa su mandante en **Vigentes**, o súmalo con **Sumar a alguien**.
- **Los días no calzan con la grilla**: un día con jornadas en dos faenas cuenta una sola vez, en la de mayor monto. Corrige los días antes de guardar.
- **Una fila de imposiciones tiene ⚠**: lo que ganó esos días no alcanza el mínimo, como un mensual que solo tiene asistencia. El sueldo queda en el mínimo y el bono en $0; revisa sus días con **📅**.
- **No se puede eliminar una lista**: la de honorarios ya tiene boletas emitidas, o la de imposiciones ya se marcó enviada (**Marcar no enviada** lo deshace).
- **No aparece un empleador o un mandante al contratar**: está desactivado. Actívalo en **⚙ Empleadores** o **⚙ Mandantes**.
`,rn=`# El resumen del ciclo

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
`,sn=`# Transportes

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

Al tocar la tarjeta de un transportista se abre su resumen: una fila por quincena, los resúmenes sueltos (**Sin quincena**) y las **Vueltas sin resumen**, con lo pagado y lo pendiente de cada uno. Debajo, el detalle de las vueltas.

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
- **Eliminar** borra el resumen; sus vueltas vuelven a quedar sueltas. Uno que está en una quincena primero se saca de ella.
- **🖨 Imprimir varios**, en **Resúmenes**, imprime o descarga varios de una vez.

## Anotar un abono
<!-- preguntas: pagar una parte al transportista; abono al transportista; adelanto al transportista; cuánto le falta por cobrar -->

En el detalle de un resumen pendiente, **💰 Abonos** anota lo que ya se le pagó:

1. Escribe el **Monto**, la **Fecha** y una **Nota** (transferencia, efectivo, cheque…).
2. Toca **+ Abono**.

![Un abono en el resumen](help/pagar-transportes/04-abono.webp)

Arriba se ven lo **Abonado** y lo **Pendiente**, y lo que se copia o imprime cierra con el **PENDIENTE**. Cada abono se corrige con ✏️ o se quita con ✕ mientras el resumen no esté pagado.

## Armar la quincena
<!-- preguntas: crear una quincena; nueva quincena de transporte; juntar los resúmenes para pagar; quincena de los buses -->

1. En **Quincenas**, toca **+ Nueva quincena**.
2. Escribe el **Nombre** y las fechas (**Desde** y **Hasta**). Las faenas, arriba, filtran qué vueltas entran.
3. TeRRa lista a los transportistas con vueltas sueltas en esas fechas, todos marcados: para cada uno se crea un resumen.
4. En **Importar resúmenes existentes**, marca los resúmenes que ya se armaron.
5. Toca **Crear quincena**.

![Una quincena nueva](help/pagar-transportes/05-nueva-quincena.webp)

## Pagar la quincena
<!-- preguntas: marcar la quincena pagada; pagar a un solo transportista; revertir un pago de transporte; me equivoqué al marcar pagado -->

Al tocar una quincena se abre su tabla: un resumen por transportista, con sus vueltas, período, estado y total.

![El detalle de una quincena](help/pagar-transportes/06-quincena.webp)

- **💰 Marcar quincena pagada** marca pagados todos sus resúmenes y sus vueltas. Para confirmarlo, escribe **Pagada**.
- En cada fila, **👁** abre el detalle del resumen, **💰 Pagar** paga solo ese y **✕** lo saca de la quincena (vuelve a quedar suelto).
- **↶ Revertir pago** lo deshace; se confirma escribiendo **Revertir**.
- **📋 Copiar**, **📥 PNG** e **🖨 Imprimir** sacan la tabla; **🖨 Imprimir quincena + resúmenes** agrega el detalle de cada resumen, uno por hoja.
- **▸ + Agregar resumen** suma un resumen suelto. **✏️ Editar** cambia el nombre y las fechas.

![Confirmar el pago escribiendo una palabra](help/pagar-transportes/07-confirmar-pago.webp)

Un resumen o una vuelta pagados ya no se editan: para corregirlos, primero se revierte el pago.

## Ver cuánto se debe
<!-- preguntas: cuánto se le debe a los transportistas; balance de transporte; balance de quincenas; deuda de transporte -->

- **Balance de quincenas**, arriba de **Quincenas**, cruza a los transportistas con las quincenas que tienen algo pendiente. **Todos los resúmenes** muestra también a quien ya cobró lo suyo. El nombre de un transportista abre su resumen.
- **Balance general de transportes**, arriba de **Resúmenes**, suma por transportista lo que se debe en vueltas sueltas, resúmenes y quincenas, en un rango de fechas.

![El balance de quincenas](help/pagar-transportes/08-balance.webp)

## Si algo no funciona
<!-- preguntas: no aparece el transportista en la quincena; no puedo eliminar un resumen; el resumen no cuadra -->

- **Un transportista no aparece al armar la quincena**: no tiene vueltas sueltas en esas fechas o en esas faenas. Si ya tiene un resumen, impórtalo.
- **No se puede eliminar un resumen**: está en una quincena. Sácalo con **✕** en la quincena.
- **No se puede editar una vuelta o un resumen**: ya está pagado. Revierte el pago primero.
- **El total de un resumen cambió**: se corrigió una de sus vueltas. TeRRa recalcula el resumen y la quincena solo.
`,cn=[{id:"primeros-pasos",icon:"👋",source:Ja},{id:"faenas-y-ciclos",icon:"🌾",source:Ya},{id:"grilla-del-ciclo",icon:"🗓",source:Xa},{id:"precios-del-dia",icon:"💲",source:Ka},{id:"resumen-del-ciclo",icon:"📊",source:rn},{id:"nomina",icon:"💰",source:en},{id:"corregir-nomina",icon:"🛠",source:an},{id:"anticipos-y-bonos",icon:"🪙",source:nn},{id:"trabajadores",icon:"👷",source:on},{id:"contratos",icon:"📄",source:tn},{id:"transportes",icon:"🚐",source:sn},{id:"pagar-transportes",icon:"💸",source:ln}];function Se(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}var M=Se();function ca(n){M=n}var I={exec:()=>null};function F(n){let e=[];return a=>{let o=Math.max(0,Math.min(3,a-1)),t=e[o];return t||(t=n(o),e[o]=t),t}}function y(n,e=""){let a=typeof n=="string"?n:n.source,o={replace:(t,r)=>{let s=typeof r=="string"?r:r.source;return s=s.replace(j.caret,"$1"),a=a.replace(t,s),o},getRegex:()=>new RegExp(a,e)};return o}var un=((n="")=>{try{return!!new RegExp("(?<=1)(?<!1)"+n)}catch{return!1}})(),j={codeRemoveIndent:/^(?: {0,3}\t| {1,4})/gm,outputLinkReplace:/\\([\[\]])/g,indentCodeCompensation:/^(\s+)(?:```)/,beginningSpace:/^\s+/,endingHash:/#$/,startingSpaceChar:/^ /,endingSpaceChar:/ $/,endingSpaceTabChar:/[ \t]$/,nonSpaceChar:/[^ ]/,newLineCharGlobal:/\n/g,tabCharGlobal:/\t/g,leadingSpaceTab:/^[ \t]+/,multipleSpaceGlobal:/\s+/g,blankLine:/^[ \t]*$/,doubleBlankLine:/\n[ \t]*\n[ \t]*$/,blockquoteStart:/^ {0,3}>/,blockquoteSetextReplace:/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,blockquoteSetextReplace2:/^ {0,3}>[ \t]?/gm,listReplaceNesting:/^ {1,4}(?=( {4})*[^ ])/g,listIsTask:/^\[[ xX]\] +\S/,listReplaceTask:/^\[[ xX]\] +/,listTaskCheckbox:/\[[ xX]\]/,anyLine:/\n.*\n/,hrefBrackets:/^<(.*)>$/,tableDelimiter:/[:|]/,tableAlignChars:/^\||\| *$/g,tableRowBlankLine:/\n[ \t]*$/,tableAlignRight:/^ *-+: *$/,tableAlignCenter:/^ *:-+: *$/,tableAlignLeft:/^ *:-+ *$/,startATag:/^<a /i,endATag:/^<\/a>/i,startPreScriptTag:/^<(pre|code|kbd|script)(\s|>)/i,endPreScriptTag:/^<\/(pre|code|kbd|script)(\s|>)/i,startAngleBracket:/^</,endAngleBracket:/>$/,pedanticHrefTitle:/^([^'"]*[^\s])\s+(['"])(.*)\2/,unicodeAlphaNumeric:/[\p{L}\p{N}]/u,numericCharacterReference:/&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/,numericCharacterReferenceOrAmpersand:/&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,escapeTest:/[&<>"']/,escapeReplace:/[&<>"']/g,escapeTestNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,escapeReplaceNoEncode:/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,caret:/(^|[^\[])\^/g,percentDecode:/%25/g,findPipe:/\|/g,splitPipe:/ \|/,slashPipe:/\\\|/g,carriageReturn:/\r\n|\r/g,spaceLine:/^ +$/gm,notSpaceStart:/^\S*/,endingNewline:/\n$/,listItemRegex:n=>new RegExp(`^( {0,3}${n})((?:[	 ][^\\n]*)?(?:\\n|$))`),nextBulletRegex:F(n=>new RegExp(`^ {0,${n}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)),hrRegex:F(n=>new RegExp(`^ {0,${n}}((?:-[ 	]*){3,}|(?:_[ 	]*){3,}|(?:\\*[ 	]*){3,})(?:\\n+|$)`)),fencesBeginRegex:F(n=>new RegExp(`^ {0,${n}}(?:\`\`\`|~~~)`)),headingBeginRegex:F(n=>new RegExp(`^ {0,${n}}#`)),htmlBeginRegex:F(n=>new RegExp(`^ {0,${n}}(?:</?(?:${H})(?: +|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`,"i")),blockquoteBeginRegex:F(n=>new RegExp(`^ {0,${n}}>`))},dn=/^(?:[ \t]*(?:\n|$))+/,pn=/^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,mn=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,Z=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,hn=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,je=/ {0,3}(?:[*+-]|\d{1,9}[.)])/,ua=/^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |fences|blockquote|heading|hr|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,da=y(ua).replace(/bull/g,je).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}(?:\s|$)/).replace(/hr/g,/ {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/\|table/g,"").getRegex(),gn=y(ua).replace(/bull/g,je).replace(/blockCode/g,/(?: {4}| {0,3}\t)/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}(?:\s|$)/).replace(/hr/g,/ {0,3}(?:(?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).replace(/table/g,/ {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(),Ee=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/,bn=/^[^\n]+/,Te=/(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/,fn=y(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label",Te).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),vn=y(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g,je).getRegex(),H="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",Re=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,yn=y("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!(?:script|pre|style|textarea)(?![a-z0-9-]))([a-z][a-z0-9-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</[a-z][a-z0-9-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))","i").replace("comment",Re).replace("tag",H).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),pa=n=>y(Ee).replace("hr",Z).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list",n).replace("html"," {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)").replace("tag",H).getRegex(),xn=pa(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/),wn=pa(/ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|\n|$)/),kn=y(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",wn).getRegex(),Ae={blockquote:kn,code:pn,def:fn,fences:mn,heading:hn,hr:Z,html:yn,lheading:da,list:vn,newline:dn,paragraph:xn,table:I,text:bn},Ve=y("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",Z).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code","(?: {4}| {0,3}	)[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list"," {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html"," {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)").replace("tag",H).getRegex(),qn={...Ae,lheading:gn,table:Ve,paragraph:y(Ee).replace("hr",Z).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Ve).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*(?:\\n|$))|~~~)[^\\n]*(?:\\n|$)").replace("list"," {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html"," {0,3}(?:</?(?:tag)(?: +|\\n|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)").replace("tag",H).getRegex()},Sn={...Ae,html:y(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",Re).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:I,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:y(Ee).replace("hr",Z).replace("heading",` *#{1,6} *[^
]`).replace("lheading",da).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},jn=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,En=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,ma=/^( {2,}|\\)\n(?!\s*$)[ \t]*/,Tn=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,L=/[\p{P}\p{S}]/u,O=/[\s\p{P}\p{S}]/u,W=/[^\s\p{P}\p{S}]/u,Rn=y(/^((?![*_])punctSpace)/,"u").replace(/punctSpace/g,O).getRegex(),An=/[\p{Pi}\p{Ps}"']/u,ha=/(?!~)[\p{P}\p{S}]/u,_n=/(?!~)[\s\p{P}\p{S}]/u,Cn=/(?:[^\s\p{P}\p{S}]|~)/u,Ln=y(/link|precode-code|html/,"g").replace("link",/\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-",un?"(?<!`)()":"(^^|[^`])").replace("code",/(?<b>`+)[^`]+\k<b>(?!`)/).replace("html",/<(?! )[^<>]*?>/).getRegex(),ga=/^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/,zn=y(ga,"u").replace(/punct/g,L).getRegex(),Pn=y(ga,"u").replace(/punct/g,ha).getRegex(),$n=/^(?:\*+(?:((?!\*)(?!openQuote)punct)|([^\s*]))?)|^_+(?:((?!_)(?!openQuote)punct)|([^\s_]))?/,In=y($n,"u").replace(/openQuote/g,An).replace(/punct/g,L).getRegex(),ba="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)",Nn=y(ba,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,O).replace(/punct/g,L).getRegex(),Mn=y(ba,"gu").replace(/notPunctSpace/g,Cn).replace(/punctSpace/g,_n).replace(/punct/g,ha).getRegex(),Dn="^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)[\\s](\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|(?:(?!\\*)punct|notPunctSpace)(\\*+)(?!\\*)(?=notPunctSpace)",Fn=y(Dn,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,O).replace(/punct/g,L).getRegex(),Vn=y("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)","gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,O).replace(/punct/g,L).getRegex(),On="^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)[\\s](_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)|(?:(?!_)punct|notPunctSpace)(_+)(?!_)(?=notPunctSpace)",Un=y(On,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,O).replace(/punct/g,L).getRegex(),Bn=y(/^~~?(?:((?!~)punct)|[^\s~])/,"u").replace(/punct/g,L).getRegex(),Qn="^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)",Gn=y(Qn,"gu").replace(/notPunctSpace/g,W).replace(/punctSpace/g,O).replace(/punct/g,L).getRegex(),Zn=y(/\\(punct)/,"gu").replace(/punct/g,L).getRegex(),Hn=y(/(`+)(?:[^`]|[^`][\s\S]*?[^`])\1(?!`)|`+|\\(punct)/,"gu").replace(/punct/g,L).getRegex(),Wn=y(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),Jn=y(Re).replace("(?:-->|$)","-->").getRegex(),Xn=y("^comment|^</[a-zA-Z][a-zA-Z0-9-]*\\s*>|^<[a-zA-Z][a-zA-Z0-9-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",Jn).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),fa=/\[(?:\\[\s\S]|[^\[\]\\])*\]/,ne=y(/(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/).replace("brackets",fa).getRegex(),Yn=y(/^!?\[(label)\]\([ \t\n]*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?[ \t\n]*\)/).replace("label",ne).replace("href",/<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Kn=y(/^!?\[(label)\]\[(ref)\]/).replace("label",ne).replace("ref",Te).getRegex(),eo=y(/^!?\[(ref)\](?:\[\])?/).replace("ref",Te).getRegex(),Oe=/(?!\s*\])(?:\\[\s\S]|[^\[\]\\]){1,999}/,ao=y(/(?:[^\[\]\\`]*(?:\[(?:brackets|\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\]))){0,999}?[^\[\]\\`]*?/).replace("brackets",fa).getRegex(),no=y("reflink|nolink(?!\\()","g").replace("reflink",y(/^!?\[(label)\]\[(ref)\]/).replace("label",ao).replace("ref",Oe).getRegex()).replace("nolink",y(/^!?\[(ref)\](?:\[\])?/).replace("ref",Oe).getRegex()).getRegex(),Ue=/[hH][tT][tT][pP][sS]?|[fF][tT][pP]/,oo=/[A-Za-z0-9._+-]+@[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/,to=y(/(?:mailto:email|xmpp:email(?:\/[A-Za-z0-9@.]+)?)/).replace(/email/g,oo).getRegex(),_e={_backpedal:I,anyPunctuation:Zn,anyPunctuationOutsideCode:Hn,autolink:Wn,blockSkip:Ln,br:ma,code:En,del:I,delLDelim:I,delRDelim:I,emStrongLDelim:zn,emStrongRDelimAst:Nn,emStrongRDelimUnd:Vn,escape:jn,link:Yn,nolink:eo,punctuation:Rn,reflink:Kn,reflinkSearch:no,tag:Xn,text:Tn,url:I},ro={..._e,emStrongLDelim:In,emStrongRDelimAst:Fn,emStrongRDelimUnd:Un,link:y(/^!?\[(label)\]\((.*?)\)/).replace("label",ne).getRegex(),reflink:y(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",ne).getRegex()},fe={..._e,emStrongRDelimAst:Mn,emStrongLDelim:Pn,delLDelim:Bn,delRDelim:Gn,url:y(/^emailProtocol|^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("emailProtocol",to).replace("protocol",Ue).replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![\w-])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/,text:y(/^(?:[^a-zA-Z0-9](?=emailProtocol)|(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9](?=emailProtocol)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@))))/).replace("protocol",Ue).replace(/emailProtocol/g,/(?:mailto|xmpp):/).getRegex()},so={...fe,br:y(ma).replace("{2,}","*").getRegex(),text:y(fe.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},Y={normal:Ae,gfm:qn,pedantic:Sn},B={normal:_e,gfm:fe,breaks:so,pedantic:ro},io={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Be=n=>io[n];function A(n,e){if(e){if(j.escapeTest.test(n))return n.replace(j.escapeReplace,Be)}else if(j.escapeTestNoEncode.test(n))return n.replace(j.escapeReplaceNoEncode,Be);return n}function lo(n){return j.numericCharacterReference.test(n)?n.replace(j.numericCharacterReferenceOrAmpersand,(e,a,o)=>{if(a===void 0&&o===void 0)return"&amp;";let t=a===void 0?Number.parseInt(o,16):Number.parseInt(a,10);return t===0||t>1114111||t>=55296&&t<=57343?"�":t===38?"&amp;":String.fromCodePoint(t)}):n}function Qe(n){try{n=encodeURI(n).replace(j.percentDecode,"%")}catch{return null}return n}function Ge(n,e){let a=n.replace(j.findPipe,(r,s,i)=>{let u=!1,l=s;for(;--l>=0&&i[l]==="\\";)u=!u;return u?"|":" |"}),o=a.split(j.splitPipe),t=0;if(o[0].trim()||o.shift(),o.length>0&&!o.at(-1)?.trim()&&o.pop(),e)if(o.length>e)o.splice(e);else for(;o.length<e;)o.push("");for(;t<o.length;t++)o[t]=o[t].trim().replace(j.slashPipe,"|");return o}function z(n,e,a){let o=n.length;if(o===0)return"";let t=0;for(;t<o&&n.charAt(o-t-1)===e;)t++;return n.slice(0,o-t)}function Ze(n){let e=n.split(`
`),a=e.length-1;for(;a>=0&&j.blankLine.test(e[a]);)a--;return e.length-a<=2?n:e.slice(0,a+1).join(`
`)}function oe(n){return n.trim().toLowerCase().toUpperCase().toLowerCase()}function He(n,e){if(n.indexOf(e[0])===-1&&n.indexOf(e[1])===-1)return-1;let a=0;for(let o=0;o<n.length;o++)if(n[o]==="\\")o++;else if(n[o]===e[0])a++;else if(n[o]===e[1]&&(a--,a<0))return o;return a>0?-2:-1}function de(n,e=0){let a=e,o="";for(let t of n)if(t==="	"){let r=4-a%4;o+=" ".repeat(r),a+=r}else o+=t,a++;return o}function We(n,e,a,o,t){let r=e.href,s=e.title||null,i=n[1].replace(t.other.outputLinkReplace,"$1"),u=n[0].charAt(0)==="!",l=o.state.inLink,c=o.state.linkEmitted,d=o.state.inRawBlock;o.state.inLink=!0,o.state.linkEmitted=!1;let m=o.inlineTokens(i),p=o.state.linkEmitted;if(o.state.linkEmitted=c,o.state.inLink=l,!u){if(p){o.state.inRawBlock=d;return}o.state.linkEmitted=!0}return{type:u?"image":"link",raw:a,href:r,title:s,text:i,tokens:m}}function co(n,e,a){let o=n.match(a.other.indentCodeCompensation);if(o===null)return e;let t=o[1];return e.split(`
`).map(r=>{let s=r.match(a.other.beginningSpace);if(s===null)return r;let[i]=s;return r.slice(Math.min(i.length,t.length))}).join(`
`)}function Je(n,e,a,o){if(!e.includes("<"))return!1;for(let t=0;t<e.length;t++){if(e[t]==="\\"){t++;continue}if(e[t]==="`"){let i=o.inline.code.exec(e.slice(t));if(i){t+=i[0].length-1;continue}}if(e[t]!=="<")continue;let r=n.slice(a+t),s=o.inline.tag.exec(r)||o.inline.autolink.exec(r);if(s){if(s[0].length>e.length-t)return!0;t+=s[0].length-1}}return!1}var te=class{options;rules;lexer;constructor(n){this.options=n||M}space(n){let e=this.rules.block.newline.exec(n);if(e&&e[0].length>0)return{type:"space",raw:e[0]}}code(n){let e=this.rules.block.code.exec(n);if(e){let a=this.options.pedantic?e[0]:Ze(e[0]),o=a.replace(this.rules.other.codeRemoveIndent,"");return{type:"code",raw:a,codeBlockStyle:"indented",text:o}}}fences(n){let e=this.rules.block.fences.exec(n);if(e){let a=e[0],o=co(a,e[3]||"",this.rules);return{type:"code",raw:a,lang:e[2]?e[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):e[2],text:o}}}heading(n){let e=this.rules.block.heading.exec(n);if(e){let a=e[2].trim();if(this.rules.other.endingHash.test(a)){let o=z(a,"#");(this.options.pedantic||!o||this.rules.other.endingSpaceTabChar.test(o))&&(a=o.trim())}return{type:"heading",raw:z(e[0],`
`),depth:e[1].length,text:a,tokens:this.lexer.inline(a)}}}hr(n){let e=this.rules.block.hr.exec(n);if(e)return{type:"hr",raw:z(e[0],`
`)}}blockquote(n){let e=this.rules.block.blockquote.exec(n);if(e){let a=z(e[0],`
`).split(`
`),o="",t="",r=[];for(;a.length>0;){let s=!1,i=[],u;for(u=0;u<a.length;u++)if(this.rules.other.blockquoteStart.test(a[u]))i.push(a[u]),s=!0;else if(!s)i.push(a[u]);else break;a=a.slice(u);let l=i.join(`
`),c=l.replace(this.rules.other.blockquoteSetextReplace,`
    $1`).replace(this.rules.other.blockquoteSetextReplace2,"");o=o?`${o}
${l}`:l,t=t?`${t}
${c}`:c;let d=this.lexer.state.top;if(this.lexer.state.top=!0,this.lexer.blockTokens(c,r,!0),this.lexer.state.top=d,a.length===0)break;let m=r.at(-1);if(m?.type==="code"||m?.type==="heading"||m?.type==="hr"||m?.type==="html")break;if(m?.type==="blockquote"){let p=m,b=a.join(`
`),g=p.raw+`
`+b.replace(this.rules.other.blockquoteSetextReplace2,""),h=this.blockquote(g);r[r.length-1]=h;let x=g.substring(h.raw.length).replace(/^\n/,""),v=x?x.split(`
`).length:0,S=v?a.slice(0,-v):a;S.length>0&&(o=`${o}
${S.join(`
`)}`),t=t.substring(0,t.length-p.text.length)+h.text;break}else if(m?.type==="list"){let p=m,b=p.raw+`
`+a.join(`
`),g=this.list(b);r[r.length-1]=g,o=o.substring(0,o.length-m.raw.length)+g.raw,t=t.substring(0,t.length-p.raw.length)+g.raw,a=b.substring(r.at(-1).raw.length).split(`
`);continue}}return{type:"blockquote",raw:o,tokens:r,text:t}}}list(n){let e=this.rules.block.list.exec(n);if(e){let a=n,o=()=>a.length-n.length,t=e[1].trim(),r=t.length>1,s={type:"list",raw:"",ordered:r,start:r?+t.slice(0,-1):"",loose:!1,items:[]};t=r?`\\d{1,9}\\${t.slice(-1)}`:`\\${t}`,this.options.pedantic&&(t=r?t:"[*+-]");let i=this.rules.other.listItemRegex(t),u=!1;for(;n;){let c=!1,d="";if(!(e=i.exec(n))||this.rules.block.hr.test(n))break;let m=o();n=n.substring(e[0].length);let p=e[2].split(`
`,1)[0],b=e[1].length,g=this.options.pedantic?de(p,b):p.replace(this.rules.other.leadingSpaceTab,k=>de(k,b)),h=n.split(`
`,1)[0],x=!g.trim(),v=0;if(this.options.pedantic?(v=2,d=g.trimStart()):x?v=b+1:(v=g.search(this.rules.other.nonSpaceChar),v=v>4?1:v,d=g.slice(v),v+=b),x&&this.rules.other.blankLine.test(h)&&(n=n.substring(h.length+1),c=!0),!c){let k=this.rules.other.nextBulletRegex(v),E=this.rules.other.hrRegex(v),q=this.rules.other.fencesBeginRegex(v),T=this.rules.other.headingBeginRegex(v),wa=this.rules.other.htmlBeginRegex(v),ka=this.rules.other.blockquoteBeginRegex(v);for(;n;){let Le=n.split(`
`,1)[0],U;if(h=Le,this.options.pedantic?(h=h.replace(this.rules.other.listReplaceNesting,"  "),U=h):U=h.replace(this.rules.other.leadingSpaceTab,qa=>de(qa)),q.test(h)||T.test(h)||wa.test(h)||ka.test(h)||k.test(h)||E.test(h))break;if(U.search(this.rules.other.nonSpaceChar)>=v||!h.trim())d+=`
`+U.slice(v);else{if(x||g.replace(this.rules.other.tabCharGlobal,"    ").search(this.rules.other.nonSpaceChar)>=4||q.test(g)||T.test(g)||E.test(g))break;d+=`
`+h}x=!h.trim(),n=n.substring(Le.length+1),g=U.slice(v)}}let S=a.slice(m,o());s.loose||(u?s.loose=!0:this.rules.other.doubleBlankLine.test(S)&&(u=!0)),s.items.push({type:"list_item",raw:S,task:!!this.options.gfm&&this.rules.other.listIsTask.test(d),loose:!1,text:d,tokens:[]})}let l=s.items.at(-1);if(l)l.raw=l.raw.trimEnd(),l.text=l.text.trimEnd();else return;s.raw=a.slice(0,o()).trimEnd();for(let c of s.items)if(this.lexer.state.top=!1,c.tokens=this.lexer.blockTokens(c.text,[]),!s.loose){let d=c.tokens.filter(p=>p.type==="space"),m=d.length>0&&d.some(p=>this.rules.other.anyLine.test(p.raw));s.loose=m}for(let c of s.items){let d=c.tokens[0];if(c.task&&(d?.type==="text"||d?.type==="paragraph")){c.text=c.text.replace(this.rules.other.listReplaceTask,""),d.raw=d.raw.replace(this.rules.other.listReplaceTask,""),d.text=d.text.replace(this.rules.other.listReplaceTask,"");for(let p=this.lexer.inlineQueue.length-1;p>=0;p--)if(this.rules.other.listIsTask.test(this.lexer.inlineQueue[p].src)){this.lexer.inlineQueue[p].src=this.lexer.inlineQueue[p].src.replace(this.rules.other.listReplaceTask,"");break}let m=this.rules.other.listTaskCheckbox.exec(c.raw);if(m){let p={type:"checkbox",raw:m[0]+" ",checked:m[0]!=="[ ]"};c.checked=p.checked,s.loose?c.tokens[0]&&["paragraph","text"].includes(c.tokens[0].type)&&"tokens"in c.tokens[0]&&c.tokens[0].tokens?(c.tokens[0].raw=p.raw+c.tokens[0].raw,c.tokens[0].text=p.raw+c.tokens[0].text,c.tokens[0].tokens.unshift(p)):c.tokens.unshift({type:"paragraph",raw:p.raw,text:p.raw,tokens:[p]}):c.tokens.unshift(p)}}else c.task&&(c.task=!1)}if(s.loose)for(let c of s.items){c.loose=!0;for(let d of c.tokens)d.type==="text"&&(d.type="paragraph")}return s}}html(n){let e=this.rules.block.html.exec(n);if(e){let a=Ze(e[0]);return{type:"html",block:!0,raw:a,pre:e[1]==="pre"||e[1]==="script"||e[1]==="style",text:a}}}def(n){let e=this.rules.block.def.exec(n);if(e){if(!this.rules.other.startAngleBracket.test(e[2])&&He(e[2],"()")!==-1)return;let a=oe(e[1]).replace(this.rules.other.multipleSpaceGlobal," "),o=e[2]?e[2].replace(this.rules.other.hrefBrackets,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",t=e[3]?e[3].substring(1,e[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):e[3];return{type:"def",tag:a,raw:z(e[0],`
`),href:o,title:t}}}table(n){let e=this.rules.block.table.exec(n);if(!e||!this.rules.other.tableDelimiter.test(e[2]))return;let a=Ge(e[1]),o=e[2].replace(this.rules.other.tableAlignChars,"").split("|"),t=e[3]?.trim()?e[3].replace(this.rules.other.tableRowBlankLine,"").split(`
`):[],r={type:"table",raw:z(e[0],`
`),header:[],align:[],rows:[]};if(a.length===o.length){for(let s of o)this.rules.other.tableAlignRight.test(s)?r.align.push("right"):this.rules.other.tableAlignCenter.test(s)?r.align.push("center"):this.rules.other.tableAlignLeft.test(s)?r.align.push("left"):r.align.push(null);for(let s=0;s<a.length;s++)r.header.push({text:a[s],tokens:this.lexer.inline(a[s]),header:!0,align:r.align[s]});for(let s of t)r.rows.push(Ge(s,r.header.length).map((i,u)=>({text:i,tokens:this.lexer.inline(i),header:!1,align:r.align[u]})));return r}}lheading(n){let e=this.rules.block.lheading.exec(n);if(e){let a=e[1].trim();return{type:"heading",raw:z(e[0],`
`),depth:e[2].charAt(0)==="="?1:2,text:a,tokens:this.lexer.inline(a)}}}paragraph(n){let e=this.rules.block.paragraph.exec(n);if(e){let a=e[1].charAt(e[1].length-1)===`
`?e[1].slice(0,-1):e[1];return{type:"paragraph",raw:e[0],text:a,tokens:this.lexer.inline(a)}}}text(n){let e=this.rules.block.text.exec(n);if(e)return{type:"text",raw:e[0],text:e[0],tokens:this.lexer.inline(e[0])}}escape(n){let e=this.rules.inline.escape.exec(n);if(e)return{type:"escape",raw:e[0],text:e[1]}}tag(n){let e=this.rules.inline.tag.exec(n);if(e)return!this.lexer.state.inLink&&this.rules.other.startATag.test(e[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&this.rules.other.endATag.test(e[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&this.rules.other.startPreScriptTag.test(e[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&this.rules.other.endPreScriptTag.test(e[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:e[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:e[0]}}link(n){if(this.lexer.state.linkParenPossible===!1)return;let e=this.rules.inline.link.exec(n);if(e){let a=e[0].charAt(0)==="!"?2:1;if(!this.options.pedantic&&Je(n,e[1],a,this.rules))return;let o=e[2].trim();if(!this.options.pedantic&&this.rules.other.startAngleBracket.test(o)){if(!this.rules.other.endAngleBracket.test(o))return;let s=z(o.slice(0,-1),"\\");if((o.length-s.length)%2===0)return}else{let s=He(e[2],"()");if(s===-2)return;if(s>-1){let i=(e[0].indexOf("!")===0?5:4)+e[1].length+s;e[2]=e[2].substring(0,s),e[0]=e[0].substring(0,i).trim(),e[3]=""}}let t=e[2],r="";if(this.options.pedantic){let s=this.rules.other.pedanticHrefTitle.exec(t);s&&(t=s[1],r=s[3])}else r=e[3]?e[3].slice(1,-1):"";return t=t.trim(),this.rules.other.startAngleBracket.test(t)&&(this.options.pedantic&&!this.rules.other.endAngleBracket.test(o)?t=t.slice(1):t=t.slice(1,-1)),We(e,{href:t&&t.replace(this.rules.inline.anyPunctuation,"$1"),title:r&&r.replace(this.rules.inline.anyPunctuation,"$1")},e[0],this.lexer,this.rules)}}reflink(n,e){let a;if((a=this.rules.inline.reflink.exec(n))||(a=this.rules.inline.nolink.exec(n))){let o=a[0].charAt(0)==="!"?2:1;if(!this.options.pedantic&&Je(n,a[1],o,this.rules))return;let t=(a[2]||a[1]).replace(this.rules.other.multipleSpaceGlobal," "),r=e[oe(t)];if(!r){let s=a[0].charAt(0);return{type:"text",raw:s,text:s}}return We(a,r,a[0],this.lexer,this.rules)}}emStrong(n,e,a=""){let o=this.rules.inline.emStrongLDelim.exec(n);if(!(!o||!o[1]&&!o[2]&&!o[3]&&!o[4]||o[4]&&a.match(this.rules.other.unicodeAlphaNumeric))&&(!(o[1]||o[3])||!a||this.rules.inline.punctuation.exec(a))){let t=[...o[0]].length-1,r,s,i=t,u=0,l=o[0][0],c=a===l,d=l==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(d.lastIndex=0,e=e.slice(-1*n.length+t);(o=d.exec(e))!==null;){if(r=o[1]||o[2]||o[3]||o[4]||o[5]||o[6],!r)continue;if(s=[...r].length,o[3]||o[4]){i+=s;continue}else if(o[5]||o[6]){if(t%3&&!((t+s)%3)){u+=s;continue}if(c)break}if(i-=s,i>0)continue;s=Math.min(s,s+i+u);let m=[...o[0]][0].length,p=n.slice(0,t+o.index+m+s);if(Math.min(t,s)%2){let g=p.slice(1,-1);return{type:"em",raw:p,text:g,tokens:this.lexer.inlineTokens(g)}}let b=p.slice(2,-2);return{type:"strong",raw:p,text:b,tokens:this.lexer.inlineTokens(b)}}}}codespan(n){let e=this.rules.inline.code.exec(n);if(e){let a=e[2].replace(this.rules.other.newLineCharGlobal," "),o=this.rules.other.nonSpaceChar.test(a),t=this.rules.other.startingSpaceChar.test(a)&&this.rules.other.endingSpaceChar.test(a);return o&&t&&(a=a.substring(1,a.length-1)),{type:"codespan",raw:e[0],text:a}}}br(n){let e=this.rules.inline.br.exec(n);if(e)return{type:"br",raw:e[0]}}del(n,e,a=""){let o=this.rules.inline.delLDelim.exec(n);if(o&&(!o[1]||!a||this.rules.inline.punctuation.exec(a))){let t=[...o[0]].length-1,r,s,i=t,u=this.rules.inline.delRDelim;for(u.lastIndex=0,e=e.slice(-1*n.length+t);(o=u.exec(e))!==null;){if(r=o[1]||o[2]||o[3]||o[4]||o[5]||o[6],!r||(s=[...r].length,s!==t))continue;if(o[3]||o[4]){i+=s;continue}if(i-=s,i>0)continue;s=Math.min(s,s+i);let l=[...o[0]][0].length,c=n.slice(0,t+o.index+l+s),d=c.slice(t,-t);return{type:"del",raw:c,text:d,tokens:this.lexer.inlineTokens(d)}}}}autolink(n){let e=this.rules.inline.autolink.exec(n);if(e){let a,o;return e[2]==="@"?(a=e[1],o="mailto:"+a):(a=e[1],o=a),{type:"link",raw:e[0],text:a,href:o,autolink:!0,tokens:[{type:"text",raw:a,text:a}]}}}url(n){let e;if(e=this.rules.inline.url.exec(n)){let a,o;if(e[2]==="@")a=e[0],o="mailto:"+a;else{let t;do t=e[0],e[0]=this.rules.inline._backpedal.exec(e[0])?.[0]??"";while(t!==e[0]);a=e[0],e[1]==="www."?o="http://"+e[0]:o=e[0]}return{type:"link",raw:e[0],text:a,href:o,autolink:!0,tokens:[{type:"text",raw:a,text:a}]}}}inlineText(n){let e=this.rules.inline.text.exec(n);if(e){let a=this.lexer.state.inRawBlock;return{type:"text",raw:e[0],text:a?e[0]:lo(e[0]),escaped:a}}}},_=class ve{tokens;options;state;inlineQueue;tokenizer;constructor(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||M,this.options.tokenizer=this.options.tokenizer||new te,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,linkEmitted:!1,linkParenPossible:!0,top:!0};let a={other:j,block:Y.normal,inline:B.normal};this.options.pedantic?(a.block=Y.pedantic,a.inline=B.pedantic):this.options.gfm&&(a.block=Y.gfm,this.options.breaks?a.inline=B.breaks:a.inline=B.gfm),this.tokenizer.rules=a}static get rules(){return{block:Y,inline:B}}static lex(e,a){return new ve(a).lex(e)}static lexInline(e,a){return new ve(a).inlineTokens(e)}lex(e){e=e.replace(j.carriageReturn,`
`),this.blockTokens(e,this.tokens);for(let a=0;a<this.inlineQueue.length;a++){let o=this.inlineQueue[a];this.inlineTokens(o.src,o.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(e,a=[],o=!1){this.tokenizer.lexer=this,this.options.pedantic&&(e=e.replace(j.tabCharGlobal,"    ").replace(j.spaceLine,""));let t=1/0;for(;e;){if(e.length<t)t=e.length;else{this.infiniteLoopError(e.charCodeAt(0));break}let r;if(this.options.extensions?.block?.some(i=>(r=i.call({lexer:this},e,a))?(e=e.substring(r.raw.length),a.push(r),!0):!1))continue;if(r=this.tokenizer.space(e)){e=e.substring(r.raw.length);let i=a.at(-1);r.raw.length===1&&i!==void 0?i.raw+=`
`:a.push(r);continue}if(r=this.tokenizer.code(e)){e=e.substring(r.raw.length);let i=a.at(-1);i?.type==="paragraph"||i?.type==="text"?(i.raw+=(i.raw.endsWith(`
`)?"":`
`)+r.raw,i.text+=`
`+r.text,this.inlineQueue.at(-1).src=i.text):a.push(r);continue}if(r=this.tokenizer.fences(e)){e=e.substring(r.raw.length),a.push(r);continue}if(r=this.tokenizer.heading(e)){e=e.substring(r.raw.length),a.push(r);continue}if(r=this.tokenizer.hr(e)){e=e.substring(r.raw.length),a.push(r);continue}if(r=this.tokenizer.blockquote(e)){e=e.substring(r.raw.length),a.push(r);continue}if(r=this.tokenizer.list(e)){e=e.substring(r.raw.length),a.push(r);continue}if(r=this.tokenizer.html(e)){e=e.substring(r.raw.length),a.push(r);continue}if(r=this.tokenizer.def(e)){e=e.substring(r.raw.length);let i=a.at(-1);i?.type==="paragraph"||i?.type==="text"?(i.raw+=(i.raw.endsWith(`
`)?"":`
`)+r.raw,i.text+=`
`+r.raw,this.inlineQueue.at(-1).src=i.text):this.tokens.links[r.tag]||(this.tokens.links[r.tag]={href:r.href,title:r.title},a.push(r));continue}if(r=this.tokenizer.table(e)){e=e.substring(r.raw.length),a.push(r);continue}if(r=this.tokenizer.lheading(e)){e=e.substring(r.raw.length),a.push(r);continue}let s=e;if(this.options.extensions?.startBlock){let i=1/0,u=e.slice(1),l;this.options.extensions.startBlock.forEach(c=>{l=c.call({lexer:this},u),typeof l=="number"&&l>=0&&(i=Math.min(i,l))}),i<1/0&&i>=0&&(s=e.substring(0,i+1))}if(this.state.top&&(r=this.tokenizer.paragraph(s))){let i=a.at(-1);o&&i?.type==="paragraph"?(i.raw+=(i.raw.endsWith(`
`)?"":`
`)+r.raw,i.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=i.text):a.push(r),o=s.length!==e.length,e=e.substring(r.raw.length);continue}if(r=this.tokenizer.text(e)){e=e.substring(r.raw.length);let i=a.at(-1);i?.type==="text"?(i.raw+=(i.raw.endsWith(`
`)?"":`
`)+r.raw,i.text+=`
`+r.text,this.inlineQueue.pop(),this.inlineQueue.at(-1).src=i.text):a.push(r);continue}if(e){this.infiniteLoopError(e.charCodeAt(0));break}}return this.state.top=!0,a}inline(e,a=[]){return this.inlineQueue.push({src:e,tokens:a}),a}linkInText(e){if(!e.includes("["))return!1;let a=this.tokenizer.rules.inline.link;for(let o of e.matchAll(this.tokenizer.rules.inline.blockSkip))if(a.test(o[0])&&e.charAt(o.index-1)!=="!")return!0;for(let o of e.matchAll(this.tokenizer.rules.inline.reflinkSearch)){let t=o[0],r=t.lastIndexOf("[");if(!(t.charAt(0)==="!"||!Object.hasOwn(this.tokens.links,oe(t.slice(r+1,-1))))&&!(r>1&&this.linkInText(t.slice(1,r-1))))return!0}return!1}inlineTokens(e,a=[]){this.tokenizer.lexer=this;let o=this.state.linkParenPossible;this.state.linkParenPossible=o&&e.includes(")");try{return this.#e(e,a)}finally{this.state.linkParenPossible=o}}#e(e,a){let o=e;if(this.tokens.links&&e.includes("[")){let i=this.tokenizer.rules.inline.reflinkSearch,u=l=>{let c=l.lastIndexOf("[");if(!Object.hasOwn(this.tokens.links,oe(l.slice(c+1,-1))))return l;if(c>1&&l.charAt(0)!=="!"){let d=l.slice(1,c-1);if(this.linkInText(d))return"["+d.replace(i,u)+"]["+"a".repeat(l.length-c-2)+"]"}return"["+"a".repeat(l.length-2)+"]"};o=o.replace(i,u)}o=o.replace(this.tokenizer.rules.inline.anyPunctuationOutsideCode,(i,u,l)=>l?"+".repeat(i.length):u?u+i.slice(u.length,-u.length).replace(/`/g,"+")+u:i),o=o.replace(this.tokenizer.rules.inline.blockSkip,(i,u,l)=>{let c=l?l.length:0;return i.slice(0,c)+"["+"a".repeat(i.length-c-2)+"]"}),o=this.options.hooks?.emStrongMask?.call({lexer:this},o)??o;let t=!1,r="",s=1/0;for(;e;){if(e.length<s)s=e.length;else{this.infiniteLoopError(e.charCodeAt(0));break}t||(r=""),t=!1;let i;if(this.options.extensions?.inline?.some(l=>(i=l.call({lexer:this},e,a))?(e=e.substring(i.raw.length),a.push(i),!0):!1))continue;if(i=this.tokenizer.escape(e)){e=e.substring(i.raw.length),a.push(i);continue}if(i=this.tokenizer.tag(e)){e=e.substring(i.raw.length),a.push(i);continue}if(i=this.tokenizer.link(e)){e=e.substring(i.raw.length),a.push(i);continue}if(i=this.tokenizer.reflink(e,this.tokens.links)){e=e.substring(i.raw.length);let l=a.at(-1);i.type==="text"&&l?.type==="text"?(l.raw+=i.raw,l.text+=i.text):a.push(i);continue}if(i=this.tokenizer.emStrong(e,o,r)){e=e.substring(i.raw.length),a.push(i);continue}if(i=this.tokenizer.codespan(e)){e=e.substring(i.raw.length),a.push(i);continue}if(i=this.tokenizer.br(e)){e=e.substring(i.raw.length),a.push(i);continue}if(i=this.tokenizer.del(e,o,r)){e=e.substring(i.raw.length),a.push(i);continue}if(i=this.tokenizer.autolink(e)){e=e.substring(i.raw.length),a.push(i);continue}if(!this.state.inLink&&(i=this.tokenizer.url(e))){e=e.substring(i.raw.length),a.push(i);continue}let u=e;if(this.options.extensions?.startInline){let l=1/0,c=e.slice(1),d;this.options.extensions.startInline.forEach(m=>{d=m.call({lexer:this},c),typeof d=="number"&&d>=0&&(l=Math.min(l,d))}),l<1/0&&l>=0&&(u=e.substring(0,l+1))}if(i=this.tokenizer.inlineText(u)){e=e.substring(i.raw.length),i.raw.slice(-1)!=="_"&&(r=i.raw.slice(-1)),t=!0;let l=a.at(-1);l?.type==="text"?(l.raw+=i.raw,l.text+=i.text):a.push(i);continue}if(e){this.infiniteLoopError(e.charCodeAt(0));break}}return a}infiniteLoopError(e){let a="Infinite loop on byte: "+e;if(this.options.silent)console.error(a);else throw new Error(a)}},re=class{options;parser;constructor(n){this.options=n||M}space(n){return""}code({text:n,lang:e,escaped:a}){let o=(e||"").match(j.notSpaceStart)?.[0],t=n?n.replace(j.endingNewline,"")+`
`:"";return o?'<pre><code class="language-'+A(o)+'">'+(a?t:A(t,!0))+`</code></pre>
`:"<pre><code>"+(a?t:A(t,!0))+`</code></pre>
`}blockquote({tokens:n}){return`<blockquote>
${this.parser.parse(n)}</blockquote>
`}html({text:n}){return n}def(n){return""}heading({tokens:n,depth:e}){return`<h${e}>${this.parser.parseInline(n)}</h${e}>
`}hr(n){return`<hr>
`}list(n){let e=n.ordered,a=n.start,o="";for(let s=0;s<n.items.length;s++){let i=n.items[s];o+=this.listitem(i)}let t=e?"ol":"ul",r=e&&a!==1?' start="'+a+'"':"";return"<"+t+r+`>
`+o+"</"+t+`>
`}listitem(n){return`<li>${this.parser.parse(n.tokens)}</li>
`}checkbox({checked:n}){return"<input "+(n?'checked="" ':"")+'disabled="" type="checkbox"> '}paragraph({tokens:n}){return`<p>${this.parser.parseInline(n)}</p>
`}table(n){let e="",a="";for(let t=0;t<n.header.length;t++)a+=this.tablecell(n.header[t]);e+=this.tablerow({text:a});let o="";for(let t=0;t<n.rows.length;t++){let r=n.rows[t];a="";for(let s=0;s<r.length;s++)a+=this.tablecell(r[s]);o+=this.tablerow({text:a})}return o&&(o=`<tbody>${o}</tbody>`),`<table>
<thead>
`+e+`</thead>
`+o+`</table>
`}tablerow({text:n}){return`<tr>
${n}</tr>
`}tablecell(n){let e=this.parser.parseInline(n.tokens),a=n.header?"th":"td";return(n.align?`<${a} align="${n.align}">`:`<${a}>`)+e+`</${a}>
`}strong({tokens:n}){return`<strong>${this.parser.parseInline(n)}</strong>`}em({tokens:n}){return`<em>${this.parser.parseInline(n)}</em>`}codespan({text:n}){return`<code>${A(n,!0)}</code>`}br(n){return"<br>"}del({tokens:n}){return`<del>${this.parser.parseInline(n)}</del>`}link({href:n,title:e,text:a,tokens:o,autolink:t}){let r=t?A(a,!0):this.parser.parseInline(o),s=Qe(n);if(s===null)return r;n=A(s,t);let i='<a href="'+n+'"';return e&&(i+=' title="'+A(e)+'"'),i+=">"+r+"</a>",i}image({href:n,title:e,text:a,tokens:o}){o&&(a=this.parser.parseInline(o,this.parser.textRenderer));let t=Qe(n);if(t===null)return A(a);n=t;let r=`<img src="${A(n)}" alt="${A(a)}"`;return e&&(r+=` title="${A(e)}"`),r+=">",r}text(n){return"tokens"in n&&n.tokens?this.parser.parseInline(n.tokens):"escaped"in n&&n.escaped?n.text:A(n.text)}},Ce=class{strong({text:n}){return n}em({text:n}){return n}codespan({text:n}){return n}del({text:n}){return n}html({text:n}){return n}text({text:n}){return n}link({text:n}){return""+n}image({text:n}){return""+n}br(){return""}checkbox({raw:n}){return n}},C=class ye{options;renderer;textRenderer;constructor(e){this.options=e||M,this.options.renderer=this.options.renderer||new re,this.renderer=this.options.renderer,this.renderer.options=this.options,this.renderer.parser=this,this.textRenderer=new Ce}static parse(e,a){return new ye(a).parse(e)}static parseInline(e,a){return new ye(a).parseInline(e)}parse(e){this.renderer.parser=this;let a="";for(let o=0;o<e.length;o++){let t=e[o];if(this.options.extensions?.renderers?.[t.type]){let s=t,i=this.options.extensions.renderers[s.type].call({parser:this},s);if(i!==!1||!["space","hr","heading","code","table","blockquote","list","checkbox","html","def","paragraph","text"].includes(s.type)){a+=i||"";continue}}let r=t;switch(r.type){case"space":{a+=this.renderer.space(r);break}case"hr":{a+=this.renderer.hr(r);break}case"heading":{a+=this.renderer.heading(r);break}case"code":{a+=this.renderer.code(r);break}case"table":{a+=this.renderer.table(r);break}case"blockquote":{a+=this.renderer.blockquote(r);break}case"list":{a+=this.renderer.list(r);break}case"checkbox":{a+=this.renderer.checkbox(r);break}case"html":{a+=this.renderer.html(r);break}case"def":{a+=this.renderer.def(r);break}case"paragraph":{a+=this.renderer.paragraph(r);break}case"text":{a+=this.renderer.text(r);break}default:{let s='Token with "'+r.type+'" type was not found.';if(this.options.silent)return console.error(s),"";throw new Error(s)}}}return a}parseInline(e,a=this.renderer){this.renderer.parser=this;let o="";for(let t=0;t<e.length;t++){let r=e[t];if(this.options.extensions?.renderers?.[r.type]){let i=this.options.extensions.renderers[r.type].call({parser:this},r);if(i!==!1||!["escape","html","link","image","checkbox","strong","em","codespan","br","del","text"].includes(r.type)){o+=i||"";continue}}let s=r;switch(s.type){case"escape":{o+=a.text(s);break}case"html":{o+=a.html(s);break}case"link":{o+=a.link(s);break}case"image":{o+=a.image(s);break}case"checkbox":{o+=a.checkbox(s);break}case"strong":{o+=a.strong(s);break}case"em":{o+=a.em(s);break}case"codespan":{o+=a.codespan(s);break}case"br":{o+=a.br(s);break}case"del":{o+=a.del(s);break}case"text":{o+=a.text(s);break}default:{let i='Token with "'+s.type+'" type was not found.';if(this.options.silent)return console.error(i),"";throw new Error(i)}}}return o}},Q=class{options;block;constructor(n){this.options=n||M}static passThroughHooks=new Set(["preprocess","postprocess","processAllTokens","emStrongMask"]);static passThroughHooksRespectAsync=new Set(["preprocess","postprocess","processAllTokens"]);preprocess(n){return n}postprocess(n){return n}processAllTokens(n){return n}emStrongMask(n){return n}provideLexer(n=this.block){return n?_.lex:_.lexInline}provideParser(n=this.block){return n?C.parse:C.parseInline}};function $(n,e){if(Array.isArray(e))for(let a=0;a<e.length;a++)n.push(e[a]);else n.push(e)}var va=class{defaults=Se();options=this.setOptions;parse=this.parseMarkdown(!0);parseInline=this.parseMarkdown(!1);Parser=C;Renderer=re;TextRenderer=Ce;Lexer=_;Tokenizer=te;Hooks=Q;constructor(...n){this.use(...n)}walkTokens(n,e){let a=[];for(let o of n)switch($(a,e.call(this,o)),o.type){case"table":{let t=o;for(let r of t.header)$(a,this.walkTokens(r.tokens,e));for(let r of t.rows)for(let s of r)$(a,this.walkTokens(s.tokens,e));break}case"list":{let t=o;$(a,this.walkTokens(t.items,e));break}default:{let t=o;this.defaults.extensions?.childTokens?.[t.type]?this.defaults.extensions.childTokens[t.type].forEach(r=>{let s=t[r].flat(1/0);$(a,this.walkTokens(s,e))}):t.tokens&&$(a,this.walkTokens(t.tokens,e))}}return a}use(...n){let e=this.defaults.extensions||{renderers:{},childTokens:{}};return n.forEach(a=>{let o={...a};if(o.async=this.defaults.async||o.async||!1,a.extensions&&(a.extensions.forEach(t=>{if(!t.name)throw new Error("extension name required");if("renderer"in t){let r=e.renderers[t.name];r?e.renderers[t.name]=function(...s){let i=t.renderer.apply(this,s);return i===!1&&(i=r.apply(this,s)),i}:e.renderers[t.name]=t.renderer}if("tokenizer"in t){if(!t.level||t.level!=="block"&&t.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");let r=e[t.level];r?r.unshift(t.tokenizer):e[t.level]=[t.tokenizer],t.start&&(t.level==="block"?e.startBlock?e.startBlock.push(t.start):e.startBlock=[t.start]:t.level==="inline"&&(e.startInline?e.startInline.push(t.start):e.startInline=[t.start]))}"childTokens"in t&&t.childTokens&&(e.childTokens[t.name]=t.childTokens)}),o.extensions=e),a.renderer){let t=this.defaults.renderer||new re(this.defaults);for(let r in a.renderer){if(!(r in t))throw new Error(`renderer '${r}' does not exist`);if(["options","parser"].includes(r))continue;let s=r,i=a.renderer[s],u=t[s];t[s]=(...l)=>{let c=i.apply(t,l);return c===!1&&(c=u.apply(t,l)),c||""}}o.renderer=t}if(a.tokenizer){let t=this.defaults.tokenizer||new te(this.defaults);for(let r in a.tokenizer){if(!(r in t))throw new Error(`tokenizer '${r}' does not exist`);if(["options","rules","lexer"].includes(r))continue;let s=r,i=a.tokenizer[s],u=t[s];t[s]=(...l)=>{let c=i.apply(t,l);return c===!1&&(c=u.apply(t,l)),c}}o.tokenizer=t}if(a.hooks){let t=this.defaults.hooks||new Q;for(let r in a.hooks){if(!(r in t))throw new Error(`hook '${r}' does not exist`);if(["options","block"].includes(r))continue;let s=r,i=a.hooks[s],u=t[s];Q.passThroughHooks.has(r)?t[s]=l=>{if(this.defaults.async&&Q.passThroughHooksRespectAsync.has(r))return(async()=>{let d=await i.call(t,l);return u.call(t,d)})();let c=i.call(t,l);return u.call(t,c)}:t[s]=(...l)=>{if(this.defaults.async)return(async()=>{let d=await i.apply(t,l);return d===!1&&(d=await u.apply(t,l)),d})();let c=i.apply(t,l);return c===!1&&(c=u.apply(t,l)),c}}o.hooks=t}if(a.walkTokens){let t=this.defaults.walkTokens,r=a.walkTokens;o.walkTokens=function(s){let i=[];return i.push(r.call(this,s)),t&&$(i,t.call(this,s)),i}}this.defaults={...this.defaults,...o}}),this}setOptions(n){return this.defaults={...this.defaults,...n},this}lexer(n,e){return _.lex(n,e??this.defaults)}parser(n,e){return C.parse(n,e??this.defaults)}parseMarkdown(n){return(e,a)=>{let o={...a},t={...this.defaults,...o},r=this.onError(!!t.silent,!!t.async);if(this.defaults.async===!0&&o.async===!1)return r(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));if(typeof e>"u"||e===null)return r(new Error("marked(): input parameter is undefined or null"));if(typeof e!="string")return r(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(e)+", string expected"));if(t.hooks&&(t.hooks.options=t,t.hooks.block=n),t.async)return(async()=>{let s=t.hooks?await t.hooks.preprocess(e):e,i=await(t.hooks?await t.hooks.provideLexer(n):n?_.lex:_.lexInline)(s,t),u=t.hooks?await t.hooks.processAllTokens(i):i;t.walkTokens&&await Promise.all(this.walkTokens(u,t.walkTokens));let l=await(t.hooks?await t.hooks.provideParser(n):n?C.parse:C.parseInline)(u,t);return t.hooks?await t.hooks.postprocess(l):l})().catch(r);try{t.hooks&&(e=t.hooks.preprocess(e));let s=(t.hooks?t.hooks.provideLexer(n):n?_.lex:_.lexInline)(e,t);t.hooks&&(s=t.hooks.processAllTokens(s)),t.walkTokens&&this.walkTokens(s,t.walkTokens);let i=(t.hooks?t.hooks.provideParser(n):n?C.parse:C.parseInline)(s,t);return t.hooks&&(i=t.hooks.postprocess(i)),i}catch(s){return r(s)}}}onError(n,e){return a=>{if(a.message+=`
Please report this to https://github.com/markedjs/marked.`,n){let o="<p>An error occurred:</p><pre>"+A(a.message+"",!0)+"</pre>";return e?Promise.resolve(o):o}if(e)return Promise.reject(a);throw a}}},N=new va;function w(n,e){return N.parse(n,e)}w.options=w.setOptions=function(n){return N.setOptions(n),w.defaults=N.defaults,ca(w.defaults),w};w.getDefaults=Se;w.defaults=M;function uo(...n){return N.use(...n),w.defaults=N.defaults,ca(w.defaults),w}w.use=uo;w.walkTokens=function(n,e){return N.walkTokens(n,e)};w.parseInline=N.parseInline;w.Parser=C;w.parser=C.parse;w.Renderer=re;w.TextRenderer=Ce;w.Lexer=_;w.lexer=_.lex;w.Tokenizer=te;w.Hooks=Q;w.parse=w;w.options;w.setOptions;w.walkTokens;w.parseInline;C.parse;_.lex;const po={"help/anticipos-y-bonos/01-lista.webp":[1168,314],"help/anticipos-y-bonos/02-nuevo-anticipo.webp":[448,564],"help/anticipos-y-bonos/03-vista-previa.webp":[1158,247],"help/anticipos-y-bonos/04-confirmar-cuotas.webp":[448,274],"help/anticipos-y-bonos/05-despues-de-la-nomina.webp":[1158,196],"help/contratos/01-empleadores.webp":[448,334],"help/contratos/02-mandantes.webp":[448,334],"help/contratos/03-contratar.webp":[672,514],"help/contratos/04-vigentes.webp":[1167,520],"help/contratos/05-mandante-en-bloque.webp":[448,242],"help/contratos/06-terminar.webp":[448,296],"help/contratos/07-finiquitos.webp":[1167,308],"help/contratos/08-historial.webp":[642,186],"help/contratos/09-grilla-por-contrato.webp":[1168,374],"help/contratos/10-generar-honorarios.webp":[896,810],"help/contratos/11-direccion.webp":[448,298],"help/contratos/12-boletas.webp":[896,540],"help/contratos/13-generar-imposiciones.webp":[896,810],"help/contratos/14-dias-trabajados.webp":[868,395],"help/contratos/15-enviar-imposiciones.webp":[896,540],"help/contratos/16-telefono.webp":[412,900],"help/corregir-nomina/01-botones.webp":[1126,42],"help/corregir-nomina/02-recalcular.webp":[672,222],"help/corregir-nomina/03-editar-contenido.webp":[1126,48],"help/corregir-nomina/04-agregar-persona.webp":[896,810],"help/corregir-nomina/05-editar-ciclos.webp":[896,640],"help/corregir-nomina/06-revisar-cambios.webp":[672,578],"help/corregir-nomina/07-sacar-persona.webp":[1116,39],"help/corregir-nomina/08-confirmar-sacar.webp":[384,242],"help/faenas-y-ciclos/01-nueva-faena.webp":[256,58],"help/faenas-y-ciclos/02-datos-faena.webp":[448,364],"help/faenas-y-ciclos/03-faena-sin-subfaenas.webp":[1148,226],"help/faenas-y-ciclos/04-primer-ciclo.webp":[448,202],"help/faenas-y-ciclos/05-nuevo-ciclo.webp":[448,642],"help/faenas-y-ciclos/06-fila-del-ciclo.webp":[1116,65],"help/faenas-y-ciclos/07-cerrar-ciclo.webp":[448,162],"help/faenas-y-ciclos/08-ciclo-siguiente.webp":[448,194],"help/faenas-y-ciclos/09-reabrir.webp":[1116,65],"help/grilla-del-ciclo/01-abrir-ciclo.webp":[1200,844],"help/grilla-del-ciclo/02-pantalla.webp":[1200,844],"help/grilla-del-ciclo/03-precio-sugerido.webp":[922,153],"help/grilla-del-ciclo/04-precios-del-dia.webp":[617,121],"help/grilla-del-ciclo/05-varias-celdas.webp":[812,187],"help/grilla-del-ciclo/06-agregar-persona.webp":[448,266],"help/grilla-del-ciclo/07-agregar-dia.webp":[386,54],"help/grilla-del-ciclo/07-quitar-dia.webp":[519,42],"help/grilla-del-ciclo/08-nota-del-dia.webp":[672,292],"help/grilla-del-ciclo/09-mensual.webp":[1160,222],"help/grilla-del-ciclo/10-por-grupo.webp":[1168,374],"help/grilla-del-ciclo/11-telefono.webp":[412,900],"help/nomina/01-elegir-ciclos.webp":[1164,174],"help/nomina/02-continuar.webp":[1152,64],"help/nomina/03-vista-previa.webp":[1168,668],"help/nomina/04-historial.webp":[1150,89],"help/nomina/05-mas-acciones.webp":[248,235],"help/nomina/06-detalle.webp":[1152,810],"help/nomina/07-descargar.webp":[248,247],"help/nomina/08-imprimir.webp":[249,122],"help/nomina/09-marcar-pagada.webp":[448,352],"help/nomina/10-cerrar-ciclos.webp":[672,298],"help/pagar-transportes/01-pago-por-faena.webp":[1200,844],"help/pagar-transportes/02-vista-previa.webp":[1200,844],"help/pagar-transportes/03-resumenes.webp":[1200,844],"help/pagar-transportes/04-abono.webp":[896,674],"help/pagar-transportes/05-nueva-quincena.webp":[896,662],"help/pagar-transportes/06-quincena.webp":[896,510],"help/pagar-transportes/07-confirmar-pago.webp":[448,252],"help/pagar-transportes/08-balance.webp":[1164,397],"help/precios-del-dia/01-nueva-labor.webp":[448,570],"help/precios-del-dia/02-cosecha.webp":[222,318],"help/precios-del-dia/03-agregar-tipo.webp":[448,336],"help/precios-del-dia/04-trato.webp":[414,190],"help/precios-del-dia/05-piso.webp":[403,190],"help/precios-del-dia/06-piso-a-todos.webp":[384,242],"help/precios-del-dia/07-piso-grilla.webp":[1156,263],"help/precios-del-dia/08-etapas.webp":[237,179],"help/precios-del-dia/09-etapas-editar.webp":[448,628],"help/precios-del-dia/10-horas-extras.webp":[1146,90],"help/precios-del-dia/11-configurar-dia.webp":[448,402],"help/primeros-pasos/01-entrar.webp":[432,406],"help/primeros-pasos/02-menu.webp":[287,900],"help/primeros-pasos/03-boton-ayuda.webp":[237,61],"help/primeros-pasos/04-buscar.webp":[784,534],"help/primeros-pasos/05-tema.webp":[217,279],"help/primeros-pasos/06-indicadores.webp":[780,47],"help/primeros-pasos/07-menu-telefono.webp":[412,900],"help/resumen-del-ciclo/01-abrir.webp":[564,50],"help/resumen-del-ciclo/02-pagar.webp":[896,810],"help/resumen-del-ciclo/03-tarifas.webp":[866,210],"help/resumen-del-ciclo/04-ajustar.webp":[830,229],"help/resumen-del-ciclo/05-total.webp":[830,111],"help/resumen-del-ciclo/06-bloquear.webp":[384,262],"help/trabajadores/01-lista.webp":[1168,324],"help/trabajadores/02-nuevo.webp":[672,810],"help/trabajadores/03-forma-de-pago.webp":[642,344],"help/trabajadores/04-datos-personales.webp":[642,375],"help/trabajadores/05-resumen.webp":[896,564],"help/trabajadores/06-telefono.webp":[412,900],"help/transportes/01-transportistas.webp":[1168,444],"help/transportes/02-transportista.webp":[672,452],"help/transportes/03-vueltas-del-ciclo.webp":[896,476],"help/transportes/04-agregar-vuelta.webp":[672,576],"help/transportes/05-vueltas.webp":[1200,844],"help/transportes/06-sin-precio.webp":[672,278],"help/transportes/07-resumen-transportista.webp":[896,640],"help/transportes/08-telefono.webp":[412,900]},Xe=n=>String(n??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),mo=new va({renderer:{image({href:n,text:e}){const a=n.startsWith("help/")?`/TeRRaAdmin/${n}`:n,o=po[n],t=o?` width="${o[0]}" height="${o[1]}"`:"";return`<img src="${Xe(a)}" alt="${Xe(e)}"${t} loading="lazy" decoding="async">`}}}),ya=n=>mo.parse(n||"");function ho(n){const e=G.c(24),{guide:a}=n,{hash:o}=Ye(),t=Sa(),r=a.sections.map(bo);let s;e[0]!==a.intro?(s=ya(a.intro),e[0]=a.intro,e[1]=s):s=e[1];const i=s;let u;e[2]!==o?(u=()=>{const k=decodeURIComponent(o.replace(/^#/,""));if(!k)return;const E=document.getElementById(`help-${k}`);if(!E)return;E.scrollIntoView({behavior:"smooth",block:"start"}),E.classList.add("help-section-hit");const q=setTimeout(()=>E.classList.remove("help-section-hit"),2500);return()=>clearTimeout(q)},e[2]=o,e[3]=u):u=e[3];let l;e[4]!==a.id||e[5]!==o?(l=[o,a.id],e[4]=a.id,e[5]=o,e[6]=l):l=e[6],K.useEffect(u,l);let c;e[7]!==t?(c=k=>{const q=k.target.closest("a")?.getAttribute("href")||"";q.startsWith("/ayuda")&&(k.preventDefault(),t(q))},e[7]=t,e[8]=c):c=e[8];const d=c,m="space-y-4";let p;e[9]===Symbol.for("react.memo_cache_sentinel")?(p=f.jsx(ee,{to:"/ayuda",className:"text-sm text-[var(--color-muted)] hover:text-[var(--color-accent)]",children:"← Todas las guías"}),e[9]=p):p=e[9];let b;e[10]!==a.icon||e[11]!==a.title?(b=f.jsxs("h1",{className:"mt-1 text-xl font-semibold sm:text-2xl",children:[a.icon," ",a.title]}),e[10]=a.icon,e[11]=a.title,e[12]=b):b=e[12];let g;e[13]!==a.intro||e[14]!==i?(g=a.intro&&f.jsx("div",{className:"help-prose mt-1",dangerouslySetInnerHTML:{__html:i}}),e[13]=a.intro,e[14]=i,e[15]=g):g=e[15];let h;e[16]!==b||e[17]!==g?(h=f.jsxs("div",{children:[p,b,g]}),e[16]=b,e[17]=g,e[18]=h):h=e[18];const x=r.length>1&&f.jsxs("nav",{className:"rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3","aria-label":"En esta guía",children:[f.jsx("div",{className:"mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]",children:"En esta guía"}),f.jsx("ol",{className:"list-decimal space-y-0.5 pl-5 text-sm",children:r.map(k=>f.jsx("li",{children:f.jsx(ee,{to:`/ayuda/${a.id}#${k.id}`,className:"hover:text-[var(--color-accent)]",children:k.title})},k.id))})]}),v=r.map(go);let S;return e[19]!==d||e[20]!==x||e[21]!==v||e[22]!==h?(S=f.jsxs("article",{className:m,onClick:d,children:[h,x,v]}),e[19]=d,e[20]=x,e[21]=v,e[22]=h,e[23]=S):S=e[23],S}function go(n){return f.jsxs("section",{id:`help-${n.id}`,className:"scroll-mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-shadow sm:p-5",children:[f.jsx("h2",{className:"mb-2 text-lg font-semibold",children:n.title}),f.jsx("div",{className:"help-prose",dangerouslySetInnerHTML:{__html:n.html}})]},n.id)}function bo(n){return{...n,html:ya(n.body)}}function fo(n){const e=G.c(5),{guides:a}=n;let o;e[0]===Symbol.for("react.memo_cache_sentinel")?(o=f.jsxs("div",{children:[f.jsx("h1",{className:"text-xl font-semibold sm:text-2xl",children:"❓ Ayuda"}),f.jsx("p",{className:"text-sm text-[var(--color-muted)]",children:"Cómo hacer cada tarea en TeRRa, paso a paso. Escribe arriba lo que quieres hacer, o elige una guía."})]}),e[0]=o):o=e[0];let t;e[1]!==a?(t=a.map(vo),e[1]=a,e[2]=t):t=e[2];let r;return e[3]!==t?(r=f.jsxs("div",{className:"space-y-3",children:[o,f.jsx("div",{className:"grid gap-3 sm:grid-cols-2",children:t})]}),e[3]=t,e[4]=r):r=e[4],r}function vo(n){return f.jsxs(ee,{to:`/ayuda/${n.id}`,className:"block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)]",children:[f.jsxs("div",{className:"font-semibold",children:[n.icon," ",n.title]}),f.jsx("p",{className:"mt-1 text-sm text-[var(--color-muted)]",children:Ke(n.intro)}),f.jsxs("div",{className:"mt-2 text-xs text-[var(--color-muted)]",children:[n.sections.length," secciones"]})]},n.id)}function yo(n){const e=G.c(10),{query:a,guideId:o,fromPath:t}=n,r=ja();let s;e[0]===Symbol.for("react.memo_cache_sentinel")?(s={query:null,status:"idle"},e[0]=s):s=e[0];const[i,u]=K.useState(s),l=i.query===a?i.status:"idle";let c;e[1]!==t||e[2]!==o||e[3]!==a||e[4]!==l||e[5]!==r?(c=async()=>{const p=a.trim();if(!p||l!=="idle")return;u({query:a,status:"sending"});const{error:b}=await Ea(()=>Ta.create({question:p,guideId:o||null,fromPath:t||null}));if(b){console.error("[ayuda] guardar la pregunta:",b),r.error("No se pudo guardar la pregunta. Intenta de nuevo."),u({query:a,status:"idle"});return}u({query:a,status:"sent"})},e[1]=t,e[2]=o,e[3]=a,e[4]=l,e[5]=r,e[6]=c):c=e[6];const d=c;let m;return e[7]!==d||e[8]!==l?(m={status:l,report:d},e[7]=d,e[8]=l,e[9]=m):m=e[9],m}function xo(n){const e=G.c(15),{index:a,isAdmin:o,guideId:t,fromPath:r}=n,[s,i]=K.useState(""),[u,l]=K.useState(!0),c=Ha(a,s,{isAdmin:o});let d;e[0]!==s?(d=s.trim(),e[0]=s,e[1]=d):d=e[1];const m=d.length>=3;let p;e[2]!==r||e[3]!==t||e[4]!==s?(p={query:s,guideId:t,fromPath:r},e[2]=r,e[3]=t,e[4]=s,e[5]=p):p=e[5];const{status:b,report:g}=yo(p),h="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4";let x;e[6]===Symbol.for("react.memo_cache_sentinel")?(x=f.jsx("label",{htmlFor:"help-search",className:"mb-1.5 block text-sm font-semibold",children:"¿Qué quieres hacer?"}),e[6]=x):x=e[6];let v,S;e[7]===Symbol.for("react.memo_cache_sentinel")?(v=T=>{i(T.target.value),l(!0)},S=()=>l(!0),e[7]=v,e[8]=S):(v=e[7],S=e[8]);let k;e[9]!==s?(k=f.jsx("input",{id:"help-search",type:"search",value:s,onChange:v,onFocus:S,placeholder:"Por ejemplo: cómo agrego a una persona a la nómina",autoComplete:"off",className:"w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"}),e[9]=s,e[10]=k):k=e[10];const E=u&&m&&f.jsxs("div",{className:"mt-2",children:[c.length>0?f.jsx("ul",{className:"divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]",children:c.map(T=>f.jsx("li",{children:f.jsxs(ee,{to:`/ayuda/${T.guideId}#${T.sectionId}`,onClick:()=>l(!1),className:"block px-3 py-2 hover:bg-[var(--color-accent-soft)]",children:[f.jsx("div",{className:"text-xs text-[var(--color-muted)]",children:T.guideTitle}),f.jsx("div",{className:"text-sm font-medium",children:T.title}),f.jsx("div",{className:"mt-0.5 text-xs text-[var(--color-muted)]",children:Wa(T.text,s).map(wo)})]})},T.id))}):f.jsx("p",{className:"text-sm text-[var(--color-muted)]",children:"No encontré eso en la ayuda."}),f.jsx("div",{className:"mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]",children:b==="sent"?f.jsx("span",{children:"Gracias, quedó anotado para sumar esa respuesta a la ayuda."}):f.jsxs(f.Fragment,{children:[f.jsx("span",{children:c.length>0?"¿No es lo que buscabas?":"Si te falta esta respuesta,"}),f.jsx("button",{type:"button",onClick:g,disabled:b==="sending",className:"min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-soft)] disabled:opacity-60",children:b==="sending"?"Enviando…":"Avisar que falta"})]})})]});let q;return e[11]!==x||e[12]!==k||e[13]!==E?(q=f.jsxs("div",{className:h,children:[x,k,E]}),e[11]=x,e[12]=k,e[13]=E,e[14]=q):q=e[14],q}function wo(n,e){return n.hit?f.jsx("mark",{className:"rounded-sm bg-[var(--color-accent-soft)] px-0.5 text-[var(--color-text)]",children:n.text},e):f.jsx("span",{children:n.text},e)}const xa=cn.map(n=>({..._a(n.id,n.source),icon:n.icon,adminOnly:!!n.adminOnly})),ko=Za(xa);function So(){const n=G.c(19),{guideId:e}=Ra(),{isAdmin:a}=Aa(),o=Ye();let t,r;if(n[0]!==e||n[1]!==a){let m;n[4]!==a?(m=b=>a||!b.adminOnly,n[4]=a,n[5]=m):m=n[5],t=xa.filter(m);let p;n[6]!==e?(p=b=>b.id===e,n[6]=e,n[7]=p):p=n[7],r=t.find(p),n[0]=e,n[1]=a,n[2]=t,n[3]=r}else t=n[2],r=n[3];const s=r,i=s?.id,u=o.state?.from;let l;n[8]!==a||n[9]!==i||n[10]!==u?(l=f.jsx(xo,{index:ko,isAdmin:a,guideId:i,fromPath:u}),n[8]=a,n[9]=i,n[10]=u,n[11]=l):l=n[11];let c;n[12]!==s||n[13]!==e||n[14]!==t?(c=s?f.jsx(ho,{guide:s}):e?f.jsx("p",{className:"rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]",children:"No existe esa guía. Busca arriba lo que quieres hacer."}):f.jsx(fo,{guides:t}),n[12]=s,n[13]=e,n[14]=t,n[15]=c):c=n[15];let d;return n[16]!==l||n[17]!==c?(d=f.jsxs("div",{className:"mx-auto max-w-3xl space-y-4",children:[l,c]}),n[16]=l,n[17]=c,n[18]=d):d=n[18],d}export{So as default};
