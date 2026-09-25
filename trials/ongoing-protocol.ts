/** Frozen operator observation modes; historical three-minute protocol remains unchanged. */
export function ongoingProtocol(recorded:boolean,scripted:boolean,nativeHaul=false,migration=false,annotate=false){
 // The native-intent spike's live run (docs/SPIKE_NATIVE_HAUL.md) is always recorded.
 if(nativeHaul&&migration)throw Error('Choose one hauling protocol');
 if((nativeHaul||migration)&&!recorded)throw Error('The native-haul live run is recorded');
 if(annotate&&scripted)throw Error('Annotate-only grounding rides live model runs only');
 return {policy:migration?'luna-hauling-migration-v1':nativeHaul?'luna-native-haul-v1':recorded?'luna-recorded-scene-v1':'luna-ongoing-v1',turnCap:null,
  cooldownTicks:300,nativeMs:scripted?45000:recorded?600000:180000,
  pausedInference:false,wallMs:recorded?960000:600000,jevCalls:annotate?'annotate-only grounding; gates nothing':0,model:'gpt-5.6-luna'};
}
