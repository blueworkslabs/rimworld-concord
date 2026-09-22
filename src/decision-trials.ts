/** Immutable policy identities: old ledgers must retain their original ceilings. */
export const decisionTrials={
 'legacy':{calls:3,reservedEquivalentUSD:0.30,policy:'legacy'},
 'reliability-v1':{calls:4,reservedEquivalentUSD:0.40,policy:'claude-reliability-v1'},
 'negotiation-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-negotiation-v1'},
 'hauling-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-hauling-v1'},
 'work-v1':{calls:12,reservedEquivalentUSD:1.20,policy:'claude-work-v1'},
 'reconsider-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-reconsider-v1'},
 'interruption-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-interruption-v1'},
 'intent-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-intent-v1'},
 'alternative-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-alternative-v1'},
 'observer-v1':{calls:12,reservedEquivalentUSD:1.20,policy:'claude-observer-v1'},
 'goal-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-goal-v1'},
 'paced-v1':{calls:12,reservedEquivalentUSD:1.20,policy:'claude-paced-v1'},
 'outlook-v1':{calls:6,reservedEquivalentUSD:0.60,policy:'claude-outlook-v1'},
 'needs-v1':{calls:4,reservedEquivalentUSD:0.40,policy:'claude-needs-v1'},
 'perspective-v1':{calls:12,reservedEquivalentUSD:1.20,policy:'claude-perspective-v1'}
} as const;
export type DecisionTrial=Exclude<keyof typeof decisionTrials,'legacy'>;
