import { PassportApp } from '../../src/app.js';
import '../../src/styles.css';
import { fixture } from '../map-fixture.js';
const { p } = await fixture();
const app = new PassportApp({ program: {
  id: new URLSearchParams(location.search).get('program') || 'independent-core',
  name: 'Independent fixture', shortName: 'Fixture', description: 'Synthetic airports', dataNotice: 'Test data',
  branding: { accent: '#256b53', eyebrow: 'Independent core' },
  map: { center: {latitude:47,longitude:-120}, zoom:7, package:p },
  regions: [{id:'r',name:'Region',color:'#256b53',completion:{type:'all'}}],
  airports: ['AAA','BBB'].map((id,i)=>({id,name:`Airport ${id}`,regionId:'r',location:{latitude:47+i/10,longitude:-120+i/10},description:'Synthetic fixture',participation:{participating:true}})),
} });
await app.mount('#app');
Object.assign(window, { fixtureApp: app });
