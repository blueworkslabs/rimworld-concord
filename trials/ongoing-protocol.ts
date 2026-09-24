/** Frozen operator observation modes; historical three-minute protocol remains unchanged. */
export function ongoingProtocol(recorded:boolean,scripted:boolean){
 return {policy:recorded?'luna-recorded-scene-v1':'luna-ongoing-v1',turnCap:null,
  cooldownTicks:300,nativeMs:scripted?45000:recorded?600000:180000,
  pausedInference:false,wallMs:recorded?960000:600000,jevCalls:0,model:'gpt-5.6-luna'};
}
