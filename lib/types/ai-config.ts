// lib/types/ai-config.ts

/**
 * Agent AI/Estimator configuration from database
 */
export interface AIConfig {
  // Feature toggles
  ai_chat_enabled: boolean
  ai_estimator_enabled: boolean
  vip_auto_approve: boolean
  
  // Shared AI limits (when AI chat OR AI estimator enabled)
  ai_free_messages: number
  ai_auto_approve_limit: number
  ai_manual_approve_limit: number
  ai_hard_cap: number
  
  // Estimator-only limits (when BOTH AI features disabled)
  estimator_free_attempts: number
  estimator_auto_approve_attempts: number
  estimator_manual_approve_attempts: number
  estimator_hard_cap: number
  
  // Other settings
  ai_welcome_message?: string
  ai_system_prompt?: string | null
  anthropic_api_key?: string | null
}

/**
 * Session usage tracking
 * - totalAiUsage: Shared pool when ANY AI feature is enabled (chat + AI estimator)
 * - estimatorCount: Used only when AI Estimator is DISABLED (basic mode)
 */
export interface SessionUsage {
  messageCount: number      // Chat messages sent (for reference)
  estimatorCount: number    // Basic estimator uses (when AI disabled)
  totalAiUsage: number      // Shared AI pool (chat + AI estimator combined)
  vipMessagesGranted: number
  manualApprovalsCount: number
  questionnaireCompleted: boolean
  status: 'active' | 'vip' | 'closed'
}

/**
 * Result of usage check
 */
export interface UsageCheckResult {
  allowed: boolean
  reason?: string
  action: 'allow' | 'show_questionnaire' | 'request_approval' | 'blocked'
  currentUsage: number
  totalAllowed: number
  remaining: number
}

/**
 * Effective limits based on source and AI enablement
 * - useSharedPool=true: AI enabled, uses totalAiUsage counter
 * - useSharedPool=false: AI disabled (basic estimator), uses estimatorCount
 */
export interface EffectiveLimits {
  free: number
  autoApprove: number
  manualApprove: number
  hardCap: number
  useSharedPool: boolean // true = AI mode (shared), false = basic mode (separate)
}

/**
 * Default values
 */
export const DEFAULT_LIMITS = {
  ai_free_messages: 1,
  ai_auto_approve_limit: 10,
  ai_manual_approve_limit: 10,
  ai_hard_cap: 25,
  estimator_free_attempts: 3,
  estimator_auto_approve_attempts: 10,
  estimator_manual_approve_attempts: 10,
  estimator_hard_cap: 25,
}

/**
 * Branding form data interface (for admin UI)
 */
export interface BrandingFormData {
  custom_domain: string
  site_title: string
  site_tagline: string
  og_image_url: string
  google_analytics_id: string
  google_ads_id: string
  google_conversion_label: string
  facebook_pixel_id: string
  anthropic_api_key: string
  ai_chat_enabled: boolean
  ai_estimator_enabled: boolean
  vip_auto_approve: boolean
  // AI limits
  ai_free_messages: number
  ai_auto_approve_limit: number
  ai_manual_approve_limit: number
  ai_hard_cap: number
  // Estimator limits
  estimator_free_attempts: number
  estimator_auto_approve_attempts: number
  estimator_manual_approve_attempts: number
  estimator_hard_cap: number
}