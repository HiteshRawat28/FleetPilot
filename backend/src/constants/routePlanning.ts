export type RouteStrategy = 'SHORTEST' | 'FASTEST' | 'TOLL_SAVER';

export type Place = {
  id: string;
  name: string;
  label: string;
  city?: string;
  state: string;
  latitude: number;
  longitude: number;
  provider: 'GOOGLE' | 'PHOTON' | 'BUILT_IN';
};

export type RouteOption = {
  id: RouteStrategy;
  label: string;
  strategy: RouteStrategy;
  distanceKm: number;
  durationMinutes: number;
  estimatedToll: number;
  via: string;
  provider: 'GOOGLE' | 'VALHALLA' | 'ESTIMATED';
  recommended: boolean;
};

type BuiltInCity = Omit<Place, 'label' | 'provider'>;
export const INDIAN_CITIES: BuiltInCity[] = [
  {id:'ahmedabad',name:'Ahmedabad',state:'Gujarat',latitude:23.0225,longitude:72.5714},
  {id:'surat',name:'Surat',state:'Gujarat',latitude:21.1702,longitude:72.8311},
  {id:'vadodara',name:'Vadodara',state:'Gujarat',latitude:22.3072,longitude:73.1812},
  {id:'rajkot',name:'Rajkot',state:'Gujarat',latitude:22.3039,longitude:70.8022},
  {id:'mumbai',name:'Mumbai',state:'Maharashtra',latitude:19.076,longitude:72.8777},
  {id:'pune',name:'Pune',state:'Maharashtra',latitude:18.5204,longitude:73.8567},
  {id:'nagpur',name:'Nagpur',state:'Maharashtra',latitude:21.1458,longitude:79.0882},
  {id:'nashik',name:'Nashik',state:'Maharashtra',latitude:19.9975,longitude:73.7898},
  {id:'delhi',name:'Delhi',state:'Delhi',latitude:28.6139,longitude:77.209},
  {id:'gurugram',name:'Gurugram',state:'Haryana',latitude:28.4595,longitude:77.0266},
  {id:'jaipur',name:'Jaipur',state:'Rajasthan',latitude:26.9124,longitude:75.7873},
  {id:'udaipur',name:'Udaipur',state:'Rajasthan',latitude:24.5854,longitude:73.7125},
  {id:'jodhpur',name:'Jodhpur',state:'Rajasthan',latitude:26.2389,longitude:73.0243},
  {id:'chandigarh',name:'Chandigarh',state:'Chandigarh',latitude:30.7333,longitude:76.7794},
  {id:'lucknow',name:'Lucknow',state:'Uttar Pradesh',latitude:26.8467,longitude:80.9462},
  {id:'kanpur',name:'Kanpur',state:'Uttar Pradesh',latitude:26.4499,longitude:80.3319},
  {id:'agra',name:'Agra',state:'Uttar Pradesh',latitude:27.1767,longitude:78.0081},
  {id:'varanasi',name:'Varanasi',state:'Uttar Pradesh',latitude:25.3176,longitude:82.9739},
  {id:'indore',name:'Indore',state:'Madhya Pradesh',latitude:22.7196,longitude:75.8577},
  {id:'bhopal',name:'Bhopal',state:'Madhya Pradesh',latitude:23.2599,longitude:77.4126},
  {id:'hyderabad',name:'Hyderabad',state:'Telangana',latitude:17.385,longitude:78.4867},
  {id:'bengaluru',name:'Bengaluru',state:'Karnataka',latitude:12.9716,longitude:77.5946},
  {id:'mysuru',name:'Mysuru',state:'Karnataka',latitude:12.2958,longitude:76.6394},
  {id:'chennai',name:'Chennai',state:'Tamil Nadu',latitude:13.0827,longitude:80.2707},
  {id:'coimbatore',name:'Coimbatore',state:'Tamil Nadu',latitude:11.0168,longitude:76.9558},
  {id:'kochi',name:'Kochi',state:'Kerala',latitude:9.9312,longitude:76.2673},
  {id:'thiruvananthapuram',name:'Thiruvananthapuram',state:'Kerala',latitude:8.5241,longitude:76.9366},
  {id:'kolkata',name:'Kolkata',state:'West Bengal',latitude:22.5726,longitude:88.3639},
  {id:'patna',name:'Patna',state:'Bihar',latitude:25.5941,longitude:85.1376},
  {id:'ranchi',name:'Ranchi',state:'Jharkhand',latitude:23.3441,longitude:85.3096},
  {id:'bhubaneswar',name:'Bhubaneswar',state:'Odisha',latitude:20.2961,longitude:85.8245},
  {id:'guwahati',name:'Guwahati',state:'Assam',latitude:26.1445,longitude:91.7362}
];

const placeCache = new Map<string,{expires:number;places:Place[]}>();
const mapsKey = () => process.env.GOOGLE_MAPS_API_KEY?.trim();
const builtInPlace = (city:BuiltInCity):Place => ({...city,label:`${city.name}, ${city.state}`,provider:'BUILT_IN'});

function placeLabel(properties:Record<string,string|undefined>){
  const parts=[properties.name,properties.locality,properties.district,properties.city,properties.state].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

async function googlePlaces(query:string):Promise<Place[]>{
  const key=mapsKey();if(!key)return [];
  const response=await fetch('https://places.googleapis.com/v1/places:autocomplete',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'suggestions.placePrediction.placeId'},body:JSON.stringify({input:query,includedRegionCodes:['in'],languageCode:'en'}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return [];
  const result=await response.json() as {suggestions?:Array<{placePrediction?:{placeId?:string}}>};
  const ids=(result.suggestions||[]).map(item=>item.placePrediction?.placeId).filter((id):id is string=>Boolean(id)).slice(0,7);
  const places=await Promise.all(ids.map(async id=>{
    const detail=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`,{headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'id,displayName,formattedAddress,location,addressComponents'},signal:AbortSignal.timeout(5000)});if(!detail.ok)return null;
    const value=await detail.json() as {id:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude?:number;longitude?:number};addressComponents?:Array<{longText?:string;types?:string[]}>};
    const component=(type:string)=>value.addressComponents?.find(c=>c.types?.includes(type))?.longText||'';
    if(value.location?.latitude==null||value.location.longitude==null)return null;
    return {id:`google:${value.id}`,name:value.displayName?.text||component('locality')||query,label:value.formattedAddress||value.displayName?.text||query,city:component('locality')||component('administrative_area_level_3'),state:component('administrative_area_level_1'),latitude:value.location.latitude,longitude:value.location.longitude,provider:'GOOGLE'} satisfies Place;
  }));
  return places.filter((place):place is NonNullable<typeof place>=>place!==null);
}

async function photonPlaces(query:string):Promise<Place[]>{
  const expanded=INDIAN_CITIES.find(city=>city.name.toLowerCase().startsWith(query.toLowerCase()))?.name||query;
  const base=(process.env.GEOCODING_API_BASE_URL||'https://photon.komoot.io').replace(/\/$/,'');
  const response=await fetch(`${base}/api/?q=${encodeURIComponent(expanded)}&limit=12&lang=en&lat=22.5&lon=79`,{headers:{'User-Agent':'FleetPilot/1.0'},signal:AbortSignal.timeout(5000)});if(!response.ok)return [];
  const result=await response.json() as {features?:Array<{properties?:Record<string,string>;geometry?:{coordinates?:number[]}}>};
  return (result.features||[]).flatMap((feature,index)=>{const p=feature.properties||{},coordinates=feature.geometry?.coordinates;if(p.countrycode?.toUpperCase()!=='IN'||!coordinates||coordinates.length<2)return [];const name=p.name||p.city||p.district;if(!name)return [];return [{id:`photon:${p.osm_type||'x'}:${p.osm_id||index}`,name,label:placeLabel(p),city:p.city||p.district,state:p.state||'',longitude:coordinates[0],latitude:coordinates[1],provider:'PHOTON'} as Place]}).slice(0,8);
}

export async function searchPlaces(query:string):Promise<Place[]>{
  const normalized=query.trim().replace(/\s+/g,' ');if(normalized.length<2)return [];
  const key=normalized.toLowerCase(),cached=placeCache.get(key);if(cached&&cached.expires>Date.now())return cached.places;
  let places=await googlePlaces(normalized);
  if(!places.length){const local=INDIAN_CITIES.filter(city=>city.name.toLowerCase().startsWith(key)).slice(0,4).map(builtInPlace);const remote=await photonPlaces(normalized);places=[...local,...remote].filter((place,index,list)=>list.findIndex(other=>other.label.toLowerCase()===place.label.toLowerCase())===index).slice(0,8)}
  placeCache.set(key,{expires:Date.now()+5*60_000,places});return places;
}

function haversineKm(from:Place,to:Place){const radians=(value:number)=>value*Math.PI/180,earthRadiusKm=6371,dLat=radians(to.latitude-from.latitude),dLon=radians(to.longitude-from.longitude);const a=Math.sin(dLat/2)**2+Math.cos(radians(from.latitude))*Math.cos(radians(to.latitude))*Math.sin(dLon/2)**2;return earthRadiusKm*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
function tollFactor(vehicleType:string){const value=vehicleType.toLowerCase();if(value.includes('bus')||value.includes('truck')||value.includes('hcv'))return 2.15;if(value.includes('van')||value.includes('lcv'))return 1.45;return 1}
function roundToll(value:number){return Math.max(0,Math.round(value/10)*10)}
type RoadRoute={distanceKm:number;durationMinutes:number;via:string;provider:'GOOGLE'|'VALHALLA'};
function saneDuration(distanceKm:number,reportedMinutes:number){
  const averageKph=distanceKm/(reportedMinutes/60);
  // Some open routing profiles apply local-road speeds to long intercity routes,
  // producing ETAs such as 16h for a ~580 km journey. Preserve credible traffic
  // times, but normalize obviously slow long-haul estimates to a conservative
  // 52 km/h operational average.
  return distanceKm>150&&averageKph<45?distanceKm/52*60:reportedMinutes;
}

async function googleRoutes(from:Place,to:Place,avoidTolls=false):Promise<RoadRoute[]>{
  const key=mapsKey();if(!key)return [];
  const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration,routes.description'},body:JSON.stringify({origin:{location:{latLng:{latitude:from.latitude,longitude:from.longitude}}},destination:{location:{latLng:{latitude:to.latitude,longitude:to.longitude}}},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:!avoidTolls,routeModifiers:{avoidTolls}}),signal:AbortSignal.timeout(6500)});if(!response.ok)return [];
  const result=await response.json() as {routes?:Array<{distanceMeters?:number;duration?:string;description?:string}>};
  return (result.routes||[]).flatMap(route=>route.distanceMeters&&route.duration?[{distanceKm:route.distanceMeters/1000,durationMinutes:Number.parseFloat(route.duration)/60,via:route.description||'Google recommended roads',provider:'GOOGLE' as const}]:[]);
}

async function valhallaRoute(from:Place,to:Place,mode:'shortest'|'fastest'|'toll-saver'):Promise<RoadRoute|null>{
  const costingOptions=mode==='shortest'?{shortest:true}:mode==='toll-saver'?{use_tolls:0.1,use_highways:0.65}:{};
  const request={locations:[{lat:from.latitude,lon:from.longitude},{lat:to.latitude,lon:to.longitude}],costing:'auto',units:'kilometers',directions_options:{units:'kilometers',directions_type:'none'},costing_options:{auto:costingOptions}};
  const base=(process.env.ROUTING_API_BASE_URL||'https://valhalla1.openstreetmap.de').replace(/\/$/,'');
  try{const response=await fetch(`${base}/route?json=${encodeURIComponent(JSON.stringify(request))}`,{headers:{'User-Agent':'FleetPilot/1.0'},signal:AbortSignal.timeout(6500)});if(!response.ok)return null;const result=await response.json() as {trip?:{summary?:{length?:number;time?:number};legs?:Array<{maneuvers?:Array<{street_names?:string[]}>}>}};const summary=result.trip?.summary;if(!summary?.length||!summary.time)return null;const roads=(result.trip?.legs||[]).flatMap(leg=>leg.maneuvers||[]).flatMap(step=>step.street_names||[]).filter(Boolean);const via=[...new Set(roads)].filter(name=>/NH|SH|Express|Highway/i.test(name)).slice(0,2).join(' / ');return {distanceKm:summary.length,durationMinutes:saneDuration(summary.length,summary.time/60),via:via||'Mapped road network',provider:'VALHALLA'}}catch{return null}
}

export async function estimateRoutes(source:Place,destination:Place,vehicleType='vehicle'){
  if(source.id===destination.id||haversineKm(source,destination)<.1)throw Object.assign(new Error('Source and destination must be different places'),{status:400});
  const normalGoogle=await googleRoutes(source,destination);let shortest:RoadRoute|undefined,fastest:RoadRoute|undefined,tollSaver:RoadRoute|undefined;
  if(normalGoogle.length){shortest=normalGoogle.slice().sort((a,b)=>a.distanceKm-b.distanceKm)[0];fastest=normalGoogle.slice().sort((a,b)=>a.durationMinutes-b.durationMinutes)[0];tollSaver=(await googleRoutes(source,destination,true))[0]||shortest}else{const routes=await Promise.all([valhallaRoute(source,destination,'shortest'),valhallaRoute(source,destination,'fastest'),valhallaRoute(source,destination,'toll-saver')]);[shortest,fastest,tollSaver]=routes.map(route=>route||undefined)}
  const available=[shortest,fastest,tollSaver].filter((route):route is RoadRoute=>Boolean(route));
  if(!available.length)throw Object.assign(new Error('A verified road route is temporarily unavailable. Please try again instead of using an unverified estimate.'),{status:503});
  shortest=shortest||available.slice().sort((a,b)=>a.distanceKm-b.distanceKm)[0];fastest=fastest||available.slice().sort((a,b)=>a.durationMinutes-b.durationMinutes)[0];tollSaver=tollSaver||shortest;
  const factor=tollFactor(vehicleType),option=(strategy:RouteStrategy,label:string,route:RoadRoute,tollRate:number,recommended=false):RouteOption=>({id:strategy,label,strategy,recommended,distanceKm:Math.round(route.distanceKm),durationMinutes:Math.max(15,Math.round(route.durationMinutes)),estimatedToll:roundToll(route.distanceKm*tollRate*factor),via:route.via,provider:route.provider});
  return {source,destination,options:[option('SHORTEST','Shortest route',shortest,1.12,true),option('FASTEST','Fastest route',fastest,1.35),option('TOLL_SAVER','Lower toll route',tollSaver,.52)]};
}
