/** Capability projection only: preserve model/provider/instructions; remove privileged tools.
 * Pinned to inspected Codex 0.153.4. This is source-reviewed, not provider-schema proof. */
export function controllerCatalog(raw:{models:any[]},slug:string){
 const chosen=raw.models.find(m=>m.slug===slug);if(!chosen)throw Error('Model absent from bundled catalog: '+slug);
 return {models:[{...chosen,apply_patch_tool_type:null,experimental_supported_tools:[],supports_search_tool:false,tool_mode:'direct',multi_agent_version:'disabled',node_repl_disabled:true}]};
}
export const isolationConfig:Record<string,unknown>={
 'agents.enabled':false,'skills.include_instructions':false,'orchestrator.skills.enabled':false,'orchestrator.mcp.enabled':false,
 ...Object.fromEntries(['shell_tool','apps','plugins','hooks','multi_agent','multi_agent_v2','memories','skill_search','image_generation','browser_use','browser_use_external','computer_use','in_app_browser','code_mode','code_mode_host','tool_suggest','view_image','sleep_tool','unified_exec','goals','skill_mcp_dependency_install','deferred_executor','request_permissions_tool','token_budget','current_time_reminder','js_repl','code_mode_only'].map(f=>['features.'+f,false]))
};
