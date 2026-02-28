export type AgentId = 'scout' | 'critic' | 'synthesizer'

export interface Agent {
  id: AgentId
  name: string
  role: string
  colorHex: string
  pan: number
}

export const agents: Record<AgentId, Agent> = {
  scout:       { id: 'scout',       name: 'Scout',       role: 'Analyst', colorHex: '#5865f2', pan: -0.7 },
  critic:      { id: 'critic',      name: 'Critic',      role: 'Skeptic', colorHex: '#ed4245', pan:  0.0 },
  synthesizer: { id: 'synthesizer', name: 'Synthesizer', role: 'Arbiter', colorHex: '#57f287', pan:  0.7 },
}

export const agentList: Agent[] = Object.values(agents)
