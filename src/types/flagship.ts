import type { FlagType, RuleNode, EvaluationReason } from '../shared/engine.ts';

export type UserRole = 'VIEWER' | 'EDITOR' | 'APPROVER' | 'ADMIN';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active?: number;
  created_at?: string;
}

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string;
  owner_id: number;
  owner_name?: string;
  flag_count?: number;
  env_count?: number;
  created_at: string;
}

export interface Environment {
  id: number;
  project_id: number;
  project_key?: string;
  project_name?: string;
  key: string;
  name: string;
  sdk_key: string;
  require_approval: number;
  sort_order: number;
}

export interface FlagVariation {
  id?: number;
  key: string;
  name: string;
  value: unknown;
}

export interface TargetingRuleRecord {
  id: number;
  flag_configuration_id: number;
  name: string;
  priority: number;
  variation_key: string;
  rootRule: RuleNode;
}

export interface FlagTargetRecord {
  id: number;
  flag_configuration_id: number;
  user_key: string;
  variation_key: string;
}

export interface FlagConfiguration {
  id: number;
  flag_id: number;
  environment_id: number;
  env_key: string;
  env_name: string;
  require_approval: number;
  enabled: number;
  kill_switch_active: number;
  default_variation_key: string;
  off_variation_key: string;
  rollout_percentage: number;
  rollout_variation_key: string | null;
  rolloutAllocations?: Array<{ variationKey: string; weight: number }> | null;
  version: number;
  full_rollout_since: string | null;
  updated_at: string;
  rules?: TargetingRuleRecord[];
  targets?: FlagTargetRecord[];
}

export interface FeatureFlag {
  id: number;
  project_id: number;
  project_key?: string;
  project_name?: string;
  key: string;
  name: string;
  description: string;
  type: FlagType;
  owner_id: number;
  owner_name?: string;
  default_variation_key: string;
  off_variation_key: string;
  archived: number;
  experiment_active: number;
  experiment_id: string | null;
  conversion_event_name: string | null;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
  variations: FlagVariation[];
  configurations: FlagConfiguration[];
}

export interface UserSegment {
  id: number;
  project_id: number;
  key: string;
  name: string;
  description: string;
  rootRule: RuleNode;
  updated_at: string;
}

export interface ChangeRequest {
  id: number;
  flag_id: number;
  flag_key: string;
  flag_name: string;
  project_id: number;
  project_name: string;
  environment_id: number;
  env_key: string;
  env_name: string;
  author_id: number;
  author_name: string;
  author_email: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  title: string;
  reason: string;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  approval: {
    approver_name: string;
    approver_email: string;
    decision: string;
    comment: string;
    created_at: string;
  } | null;
  created_at: string;
  resolved_at: string | null;
}

export interface FlagVersion {
  id: number;
  flag_id: number;
  flag_key: string;
  flag_name: string;
  environment_id: number;
  env_key: string;
  env_name: string;
  version: number;
  snapshot: Record<string, unknown>;
  author_name: string;
  reason: string;
  created_at: string;
}

export interface ScheduledChange {
  id: number;
  flag_id: number;
  flag_key: string;
  flag_name: string;
  environment_id: number;
  env_name: string;
  author_name: string;
  scheduled_for: string;
  payload: Record<string, unknown>;
  status: 'SCHEDULED' | 'EXECUTED' | 'CANCELLED';
  reason: string;
}

export interface AuditLog {
  id: number;
  project_id: number | null;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  diff_json: string | null;
  created_at: string;
}

export interface SdkInstance {
  id: number;
  instance_id: string;
  environment_id: number;
  env_key: string;
  env_name: string;
  project_name: string;
  app_name: string;
  sdk_version: string;
  transport: 'SSE' | 'POLLING';
  status: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  last_sync_latency_ms: number;
  last_heartbeat_at: string;
}

export interface ExperimentSummary {
  id: number;
  project_id: number;
  project_key: string;
  project_name: string;
  key: string;
  name: string;
  experiment_id: string;
  conversion_event_name: string;
  totalExposures: number;
  totalConversions: number;
  conversionRate: number;
}

export interface ExperimentAnalyticsDetail {
  flagKey: string;
  flagName: string;
  experimentId: string;
  conversionEventName: string;
  totalExposures: number;
  totalConversions: number;
  variations: Array<{
    key: string;
    name: string;
    exposures: number;
    conversions: number;
    conversionRate: number;
    expectedWeight: number;
  }>;
  srm: {
    chiSquare: number;
    pValue: number;
    mismatchDetected: boolean;
  };
  significance: {
    zScore: number;
    pValue: number;
    significant: boolean;
    upliftPercent: number;
  };
  dailySeries: Array<{ day: string; exposures: number }>;
}

export interface StaleFlagItem {
  flagId: number;
  flagKey: string;
  flagName: string;
  projectName: string;
  ownerName: string;
  lastEvaluatedAt: string;
  daysSinceEval: number;
  rolloutPercentage: number;
  daysAtFullRollout: number;
  staleReason: string;
  recommendation: string;
}

export interface EvaluationPreviewResponse {
  flagKey: string;
  variationKey: string;
  value: unknown;
  reason: EvaluationReason;
  matchedRuleName?: string;
  bucket?: number;
  version: number;
  evaluatedAtMicros?: number;
}
