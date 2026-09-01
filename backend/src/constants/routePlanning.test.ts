import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateRoutes, fallbackEstimatedRoute, parseGoogleTollInfo, rankRouteMetrics } from './routePlanning';

afterEach(()=>{
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('parseGoogleTollInfo',()=>{
  it('parses INR units and nanos without fixed toll multipliers',()=>{
    expect(parseGoogleTollInfo({estimatedPrice:[{currencyCode:'INR',units:'1240',nanos:500000000}]})).toEqual({estimatedToll:1240.5,tollEstimateStatus:'ESTIMATED'});
  });
  it('reports no expected toll when Google omits toll info',()=>{
    expect(parseGoogleTollInfo()).toEqual({estimatedToll:0,tollEstimateStatus:'NO_TOLLS_EXPECTED'});
  });
  it('keeps tolls unknown when a toll exists without an INR price',()=>{
    expect(parseGoogleTollInfo({estimatedPrice:[{currencyCode:'USD',units:'4'}]})).toEqual({estimatedToll:null,tollEstimateStatus:'TOLLS_PRESENT_PRICE_UNKNOWN'});
  });
});

describe('rankRouteMetrics',()=>{
  it('labels candidates from their returned metrics instead of their requested strategy',()=>{
    const requestedShortest={name:'requested-shortest',distanceKm:786,durationMinutes:907};
    const requestedFastest={name:'requested-fastest',distanceKm:1029,durationMinutes:1224};
    const requestedTollSaver={name:'requested-toll-saver',distanceKm:795,durationMinutes:917};
    expect(rankRouteMetrics([requestedShortest,requestedFastest,requestedTollSaver])).toEqual({
      shortest:requestedShortest,
      fastest:requestedShortest
    });
  });
});

describe('fallbackEstimatedRoute',()=>{
  it('returns a usable estimated route when verified providers are unavailable',()=>{
    const source={id:'built:bhopal',name:'Bhopal',label:'Bhopal, Madhya Pradesh',state:'Madhya Pradesh',latitude:23.2599,longitude:77.4126,provider:'BUILT_IN' as const};
    const destination={id:'built:ahmedabad',name:'Ahmedabad',label:'Ahmedabad, Gujarat',state:'Gujarat',latitude:23.0225,longitude:72.5714,provider:'BUILT_IN' as const};
    const route=fallbackEstimatedRoute(source,destination);
    expect(route.provider).toBe('ESTIMATED');
    expect(route.tollEstimateStatus).toBe('UNAVAILABLE');
    expect(route.estimatedToll).toBeNull();
    expect(route.distanceKm).toBeGreaterThan(500);
    expect(route.durationMinutes).toBeGreaterThan(600);
  });
});

describe('estimateRoutes',()=>{
  it('falls back to coordinate estimates when external route providers return 503',async()=>{
    vi.stubEnv('GOOGLE_MAPS_API_KEY','test-key');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})));
    const source={id:'built:bhopal',name:'Bhopal',label:'Bhopal, Madhya Pradesh',state:'Madhya Pradesh',latitude:23.2599,longitude:77.4126,provider:'BUILT_IN' as const};
    const destination={id:'built:ahmedabad',name:'Ahmedabad',label:'Ahmedabad, Gujarat',state:'Gujarat',latitude:23.0225,longitude:72.5714,provider:'BUILT_IN' as const};

    const result=await estimateRoutes(source,destination);

    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({
      provider:'ESTIMATED',
      tollEstimateStatus:'UNAVAILABLE',
      estimatedToll:null,
      recommended:true
    });
  });
});
