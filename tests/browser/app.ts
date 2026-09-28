import { PassportApp } from '../../src/app.js';
import '../../src/styles.css';
import { fixture } from '../map-fixture.js';
const { p } = await fixture();
const app = new PassportApp({ program: {
  id: new URLSearchParams(location.search).get('program') || 'independent-core',
  name: 'Independent fixture', shortName: 'Fixture', description: 'Synthetic airports', dataNotice: 'Test data',
  branding: { accent: '#256b53', eyebrow: 'Independent core', ...(new URLSearchParams(location.search).has('theme-colors') ? { themes: { light: { accent: '#304f80', onAccent: '#ffffff' }, dark: { accent: '#accbfa', onAccent: '#192436' } } } : {}) },
  map: { center: {latitude:47,longitude:-120}, zoom:7, package:p },
  regions: [{id:'r',name:'Region',color:'#256b53',completion:new URLSearchParams(location.search).get('completion') === 'count' ? {type:'count',required:2} : new URLSearchParams(location.search).get('completion') === 'percentage' ? {type:'percentage',required:50} : {type:'all'}}],
  airports: (new URLSearchParams(location.search).has('collection') ? ['AAA','BBB','CCC','DDD'] : ['AAA','BBB']).map((id,i)=>({id,name:`Airport ${id}`,regionId:'r',location:{latitude:47+i/10,longitude:-120+i/10},description:'Synthetic fixture',participation:{participating:!(new URLSearchParams(location.search).has('retired') && id==='DDD')}})),
} });
await app.mount('#app');
Object.assign(window, { fixtureApp: app });
