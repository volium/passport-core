import type * as GL from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import type { AirportDefinition, RegionDefinition } from '../models.js';
import type { OfflineMapManager } from './offline/manager.js';
import type { InstalledMap } from './offline/storage.js';

type LatLon = [number, number];

// MapLibre's custom image protocol accepts HTMLImageElement directly. Decode
// local sprites without Blob URLs, which WebKit can reject while offline.
async function localImage(bytes: Uint8Array, signal: AbortSignal): Promise<HTMLImageElement> {
  signal.throwIfAborted();
  const image = new Image();
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.src = ''; reject(signal.reason); };
    image.onload = () => { cleanup(); resolve(); };
    image.onerror = () => { cleanup(); reject(new Error('Offline sprite could not be decoded')); };
    signal.addEventListener('abort', abort, { once: true });
    image.src = `data:image/png;base64,${btoa(binary)}`;
  });
  return image;
}

export class PassportMap {
  private map: GL.Map;
  private protocol = new Protocol();
  private styleRequest = 0;
  private buttons = new Map<string, { button: HTMLButtonElement; airport: AirportDefinition; label: HTMLElement }>();
  private overlay: HTMLElement;
  private data: GeoJSON.FeatureCollection = {type:'FeatureCollection',features:[]};
  private styleKey = '';
  private pendingStyleKey?: string;
  private styleFailed = false;
  private installedStyle?: InstalledMap;
  private installedVersions = new Map<string, InstalledMap>();
  private assetProtocol = `passport${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('')}`;
  private constructor(private gl: typeof GL, private container: HTMLElement, center: LatLon, zoom: number, private manager: OfflineMapManager, private select: (airport: AirportDefinition) => void, private error: (message: string) => void) {
    container.tabIndex = 0;
    gl.addProtocol('pmtiles',this.protocol.tile);
    gl.addProtocol(this.assetProtocol,async (params, controller)=>{
      const active=this.installedVersions.get(params.url.split('/')[3]);if(!active)throw Error('Offline map is no longer present');
      const id=decodeURIComponent(params.url.split('/').pop()!);
      const bytes=await manager.resource(active,id);
      return { data: params.type==='json'?JSON.parse(new TextDecoder().decode(bytes)):params.type==='image'?await localImage(bytes, controller.signal):bytes.buffer as ArrayBuffer };
    });
    this.map=new gl.Map({container,center:[center[1],center[0]],zoom,style:{version:8,sources:{},layers:[]},attributionControl:{compact:false},renderWorldCopies:false,dragRotate:false,touchPitch:false,pitchWithRotate:false,localIdeographFontFamily:false,transformRequest:(url,type)=>{
      const active=this.installedStyle;
      if(active) {const resource=active.package.resources.find(r=>new URL(r.url,document.baseURI).href===new URL(url,document.baseURI).href);if(resource)return {url:`${this.assetProtocol}://asset/${active.generation}/${encodeURIComponent(resource.id)}`};}
      if (active && type && ['Glyphs','SpriteJSON','SpriteImage'].includes(type)) throw Error('Offline style requested an undeclared resource');
      return {url};
    }});
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new gl.NavigationControl({showCompass:false}),'top-right');
    this.overlay=document.createElement('div');this.overlay.className='passport-map-overlays';container.append(this.overlay);
    this.map.on('move',()=>this.position());
    this.map.on('style.load',()=>this.layers());
    this.map.on('idle',()=>{ if (this.styleKey && !this.styleFailed) container.dataset.basemapState = 'ready'; });
    this.map.on('error',()=>{ this.styleFailed = true; container.dataset.basemapState = 'unavailable'; error('Basemap unavailable. Airport markers, list, and passport remain usable.'); });
  }
  static async create(container:HTMLElement,center:LatLon,zoom:number,manager:OfflineMapManager,select:(airport:AirportDefinition)=>void,error:(message:string)=>void) {
    try {
      const gl = await import('maplibre-gl');
      gl.setWorkerUrl(new URL('./worker.js', import.meta.url).href);
      return new PassportMap(gl,container,center,zoom,manager,select,error);
    } catch {
      container.textContent = 'Interactive maps are unavailable in this browser. Use the airport list and passport.';
      container.setAttribute('role', 'status');
      error(container.textContent);
      return new UnavailableMap(container);
    }
  }
  async basemap(theme:'light'|'dark') {
    if (this.manager.status.state === 'checking' && !this.manager.status.active) return;
    const active=this.manager.status.active;const p=active?.package??this.manager.advertised;
    const key=`${active?.generation??'online'}:${p.version}:${theme}`;
    if(key===this.styleKey || key===this.pendingStyleKey)return;const request=++this.styleRequest;
    this.pendingStyleKey = key;
    try {
      const id=theme==='dark'?p.darkStyleResourceId:p.lightStyleResourceId;
      const resource=p.resources.find(r=>r.id===id)!;
      const style:GL.StyleSpecification=active?JSON.parse(new TextDecoder().decode(await this.manager.resource(active,id))):await fetch(resource.url).then(r=>{if(!r.ok)throw Error('Style unavailable');return r.json();});
      if(request!==this.styleRequest)return;
      this.installedStyle = active;
      if (active) this.installedVersions.set(active.generation, active);
      if(active) {const archive=new PMTiles(this.manager.source(active));this.protocol.add(archive);style.sources.basemap={type:'vector',url:`pmtiles://${archive.source.getKey()}`,attribution:p.attribution};}
      else style.sources.basemap={type:'vector',url:`pmtiles://${new URL(p.url,document.baseURI).href}`,attribution:p.attribution};
      if(style.glyphs)style.glyphs=new URL(style.glyphs,document.baseURI).href.replaceAll('%7B','{').replaceAll('%7D','}');
      if(typeof style.sprite==='string')style.sprite=new URL(style.sprite,document.baseURI).href;
      this.container.dataset.basemapState = 'loading';
      this.container.dataset.basemapTheme = theme;
      this.container.dataset.basemapVersion = p.version;
      this.container.dataset.basemapMode = active ? 'offline' : 'online';
      this.styleFailed = false;
      this.styleKey=key;this.map.setStyle(style,{diff:false});
    } catch { this.container.dataset.basemapState = 'unavailable'; this.error('Basemap resources are unavailable. Download the map when connected; airport and passport functions remain available.'); }
    finally { if (request === this.styleRequest) this.pendingStyleKey = undefined; }
  }
  private layers() {
    if(!this.map.getSource('passport-airports'))this.map.addSource('passport-airports',{type:'geojson',data:this.data});
    const stroke=matchMedia('(max-width: 760px)').matches?1.5:3;
    for(const selected of [false,true]) {
      const id=selected?'passport-selected':'passport-airports';
      if(!this.map.getLayer(id))this.map.addLayer({id,type:'circle',source:'passport-airports',filter:['==',['get','selected'],selected],paint:{'circle-radius':['case',['get','compact'],8-stroke,12-stroke],'circle-color':['case',['get','visited'],['get','color'],getComputedStyle(this.container).getPropertyValue('--surface').trim() || '#ffffff'],'circle-opacity':1,'circle-stroke-color':['get','color'],'circle-stroke-width':stroke}});
      else {
        this.map.setPaintProperty(id,'circle-stroke-width',stroke);
        this.map.setPaintProperty(id,'circle-radius',['case',['get','compact'],8-stroke,12-stroke]);
      }
    }
    if(!this.map.getLayer('passport-selection-outline'))this.map.addLayer({id:'passport-selection-outline',type:'circle',source:'passport-airports',filter:['==',['get','selected'],true],paint:{'circle-radius':16,'circle-opacity':0,'circle-stroke-width':3,'circle-stroke-color':'#c78424'}});
    (this.map.getSource('passport-airports') as GL.GeoJSONSource).setData(this.data);
  }
  airports(airports:AirportDefinition[],regions:RegionDefinition[],visited:Set<string>,selected:string|undefined,compact:boolean,labels:Set<string>) {
    this.data={type:'FeatureCollection',features:airports.map(a=>({type:'Feature',id:a.id,geometry:{type:'Point',coordinates:[a.location.longitude,a.location.latitude]},properties:{color:regions.find(r=>r.id===a.regionId)!.color,visited:visited.has(a.id),selected:a.id===selected,compact:compact&&a.id!==selected}}))};
    if(this.map.getSource('passport-airports') || this.map.isStyleLoaded())this.layers();
    for(const [id,entry] of this.buttons)if(!airports.some(a=>a.id===id)){entry.button.remove();this.buttons.delete(id);}
    for(const airport of airports){
      let entry=this.buttons.get(airport.id);
      if(!entry){const button=document.createElement('button');button.type='button';button.className='airport-map-hit';button.dataset.airportId=airport.id;const label=document.createElement('span');label.className='airport-tooltip airport-map-label';button.append(label);button.addEventListener('click',event=>{event.stopPropagation();this.select(airport)});this.overlay.append(button);entry={button,label,airport};this.buttons.set(airport.id,entry);}
      entry.button.setAttribute('aria-label',`${airport.identifiers?.faa?.trim()||airport.id} ${airport.name}, ${visited.has(airport.id)?'visited':'not visited'}`);
      entry.button.setAttribute('aria-pressed',String(airport.id===selected));entry.button.classList.toggle('is-selected',airport.id===selected);
      entry.button.classList.toggle('is-visited',visited.has(airport.id));
      entry.button.title = `${airport.identifiers?.faa?.trim()||airport.id} ${airport.name}`;
      entry.label.textContent=airport.identifiers?.faa?.trim()||airport.id;entry.label.hidden=airport.id!==selected&&!labels.has(airport.id);
    }
    this.position();
  }
  private position(){for(const entry of this.buttons.values()){const point=this.latLngToContainerPoint([entry.airport.location.latitude,entry.airport.location.longitude]);entry.button.style.transform=`translate(${point.x-20}px,${point.y-20}px)`;entry.button.hidden=point.x<0||point.y<0||point.x>this.container.clientWidth||point.y>this.container.clientHeight;}}
  getZoom(){return this.map.getZoom()}
  getSize(){return {x:this.container.clientWidth,y:this.container.clientHeight}}
  latLngToContainerPoint(point:LatLon){return this.map.project([point[1],point[0]])}
  project(point:LatLon){return this.latLngToContainerPoint(point)}
  unproject(point:{x:number;y:number}):LatLon{const p=this.map.unproject([point.x,point.y]);return [p.lat,p.lng]}
  panTo(point:LatLon){this.map.panTo([point[1],point[0]],{duration:0})}
  invalidateSize(){this.map.resize();if(this.map.getSource('passport-airports'))this.layers();this.position()}
  fitBounds(points:LatLon[],options:{paddingTopLeft:[number,number];paddingBottomRight:[number,number];maxZoom:number;animate:boolean}){
    const bounds=new this.gl.LngLatBounds();points.forEach(p=>bounds.extend([p[1],p[0]]));
    const camera=this.map.cameraForBounds(bounds,{padding:{left:options.paddingTopLeft[0],top:options.paddingTopLeft[1],right:options.paddingBottomRight[0],bottom:options.paddingBottomRight[1]},maxZoom:options.maxZoom});
    if(camera)this.map.jumpTo({...camera,zoom:Math.floor((camera.zoom??this.getZoom())*4)/4});
  }
  on(event:string,callback:()=>void){for(const name of event.split(' '))this.map.on(name as 'click',callback)}
  remove(){this.map.remove();this.gl.removeProtocol(this.assetProtocol);this.gl.removeProtocol('pmtiles')}
}

/** Keep passport workflows operational when WebGL or worker initialization fails. */
class UnavailableMap {
  constructor(private container: HTMLElement) {}
  async basemap() {}
  airports() {}
  getZoom() { return 0; }
  getSize() { return { x: this.container.clientWidth, y: this.container.clientHeight }; }
  latLngToContainerPoint(_point: LatLon) { void _point; return { x: 0, y: 0 }; }
  project(point: LatLon) { return this.latLngToContainerPoint(point); }
  unproject(_point: {x:number;y:number}): LatLon { void _point; return [0,0]; }
  panTo(_point: LatLon) { void _point; }
  invalidateSize() {}
  fitBounds(_points: LatLon[], _options: unknown) { void _points; void _options; }
  on(_event: string, _callback: () => void) { void _event; void _callback; }
  remove() {}
}
