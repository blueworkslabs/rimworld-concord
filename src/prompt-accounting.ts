/** Application-authored request sizes, not token counts or hidden client overhead. */
export function promptAccounting(instructions:string,prompt:string,schema:unknown){
 const sizes={instructionsBytes:Buffer.byteLength(instructions),promptBytes:Buffer.byteLength(prompt),schemaBytes:Buffer.byteLength(JSON.stringify(schema))};
 return {...sizes,totalAuthoredBytes:sizes.instructionsBytes+sizes.promptBytes+sizes.schemaBytes};
}
