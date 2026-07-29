import { create } from 'zustand';

// Mirror backend types for the frontend
export interface Session {
  id: string;
  status: string;
  currentStage: string;
  repository: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    visibility: string;
    description: string | null;
    url: string;
  };
  issue: {
    number: number;
    title: string;
    body: string | null;
    labels: string[];
    state: string;
    url: string;
  };
  repositoryProfile: any | null;
  environmentReport: any | null;
  planningReport: any | null;
  implementationReport: any | null;
  validationReport: any | null;
  reviewReport: any | null;
  supervisorDecision?: any | null;
  supervisorDecisionLog?: Array<{
    iteration: number;
    timestamp: string;
    decisionSummary: string;
    next_agent: string;
    workflow_status: string;
  }>;
  supervisorIterations?: number;
  workflowPhase?: string;
  approvalStatus: string;
  pullRequestUrl: string | null;
  executionHistory: Array<{
    timestamp: string;
    component: string;
    action: string;
    result: string;
    details?: string;
  }>;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SessionState {
  currentSession: Session | null;
  sessions: Session[];
  isLoading: boolean;
  error: string | null;

  setCurrentSession: (session: Session | null) => void;
  updateCurrentSession: (updates: Partial<Session>) => void;
  setSessions: (sessions: Session[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  currentSession: null,
  sessions: [],
  isLoading: false,
  error: null,

  setCurrentSession: (session) => set({ currentSession: session }),

  updateCurrentSession: (updates) =>
    set((state) => ({
      currentSession: state.currentSession
        ? { ...state.currentSession, ...updates }
        : null,
    })),

  setSessions: (sessions) => set({ sessions }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
