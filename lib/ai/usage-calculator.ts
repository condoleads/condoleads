// lib/ai/usage-calculator.ts

import { AIConfig, SessionUsage, UsageCheckResult, EffectiveLimits, DEFAULT_LIMITS } from '@/lib/types/ai-config'

/**
 * Determine which limits to use based on configuration and source
 * 
 * SHARED POOL LOGIC:
 * - Chat: Uses ai_* limits (only available when ai_chat_enabled)
 * - Estimator: Uses ai_* limits IF ai_estimator_enabled, otherwise estimator_* limits
 * 
 * When AI is enabled, usage is tracked in totalAiUsage (shared pool)
 * When AI is disabled for estimator, usage is tracked in estimatorCount (separate)
 */
export function getEffectiveLimits(
  config: Partial<AIConfig>,
  source: 'chat' | 'estimator'
): EffectiveLimits {
  // Chat always uses AI limits (only called when ai_chat_enabled)
  if (source === 'chat') {
    return {
      free: config.ai_free_messages ?? DEFAULT_LIMITS.ai_free_messages,
      autoApprove: config.ai_auto_approve_limit ?? DEFAULT_LIMITS.ai_auto_approve_limit,
      manualApprove: config.ai_manual_approve_limit ?? DEFAULT_LIMITS.ai_manual_approve_limit,
      hardCap: config.ai_hard_cap ?? DEFAULT_LIMITS.ai_hard_cap,
      useSharedPool: true, // Chat always uses shared AI pool
    }
  }
  
  // Estimator: Check if AI-enhanced mode is enabled
  if (config.ai_estimator_enabled) {
    // AI Estimator enabled → use shared AI pool
    return {
      free: config.ai_free_messages ?? DEFAULT_LIMITS.ai_free_messages,
      autoApprove: config.ai_auto_approve_limit ?? DEFAULT_LIMITS.ai_auto_approve_limit,
      manualApprove: config.ai_manual_approve_limit ?? DEFAULT_LIMITS.ai_manual_approve_limit,
      hardCap: config.ai_hard_cap ?? DEFAULT_LIMITS.ai_hard_cap,
      useSharedPool: true, // Shares pool with AI Chat
    }
  }
  
  // AI Estimator disabled → use separate estimator limits (basic mode)
  return {
    free: config.estimator_free_attempts ?? DEFAULT_LIMITS.estimator_free_attempts,
    autoApprove: config.estimator_auto_approve_attempts ?? DEFAULT_LIMITS.estimator_auto_approve_attempts,
    manualApprove: config.estimator_manual_approve_attempts ?? DEFAULT_LIMITS.estimator_manual_approve_attempts,
    hardCap: config.estimator_hard_cap ?? DEFAULT_LIMITS.estimator_hard_cap,
    useSharedPool: false, // Separate from AI pool
  }
}

/**
 * Get current usage count based on pool type
 * - Shared pool (AI enabled): uses totalAiUsage (chat + estimator combined)
 * - Separate pool (AI disabled): uses estimatorCount only
 */
export function getCurrentUsage(
  session: SessionUsage,
  limits: EffectiveLimits
): number {
  if (limits.useSharedPool) {
    return session.totalAiUsage // Combined chat + AI estimator usage
  }
  return session.estimatorCount // Basic estimator only
}

/**
 * Calculate total allowed messages based on approvals
 * 
 * Formula:
 * - Free messages (always available)
 * - + auto_approve_limit (if questionnaire completed)
 * - + (manual_approve_limit × manual_approvals_count)
 * - Capped at hard_cap
 */
export function calculateTotalAllowed(
  limits: EffectiveLimits,
  questionnaireCompleted: boolean,
  manualApprovalsCount: number
): number {
  let total = limits.free
  
  if (questionnaireCompleted) {
    total += limits.autoApprove
    total += (limits.manualApprove * manualApprovalsCount)
  }
  
  return Math.min(total, limits.hardCap)
}

/**
 * Check if user can perform an action (send message or use estimator)
 * 
 * Returns what action should be taken:
 * - 'allow': User can proceed
 * - 'show_questionnaire': Need to show VIP questionnaire
 * - 'request_approval': Need manual approval from agent
 * - 'blocked': Hit hard cap, cannot proceed
 */
export function checkUsage(
  config: Partial<AIConfig>,
  session: SessionUsage,
  source: 'chat' | 'estimator'
): UsageCheckResult {
  const limits = getEffectiveLimits(config, source)
  const currentUsage = getCurrentUsage(session, limits)
  const totalAllowed = calculateTotalAllowed(
    limits,
    session.questionnaireCompleted,
    session.manualApprovalsCount
  )
  const remaining = totalAllowed - currentUsage
  
  // Check hard cap first
  if (currentUsage >= limits.hardCap) {
    return {
      allowed: false,
      reason: 'You have reached the maximum usage limit. Please contact the agent directly for further assistance.',
      action: 'blocked',
      currentUsage,
      totalAllowed: limits.hardCap,
      remaining: 0,
    }
  }
  
  // User has remaining allowance
  if (remaining > 0) {
    return {
      allowed: true,
      action: 'allow',
      currentUsage,
      totalAllowed,
      remaining,
    }
  }
  
  // No remaining allowance - determine next action
  
  // If questionnaire not completed, show it (triggers auto-approve)
  if (!session.questionnaireCompleted) {
    return {
      allowed: false,
      reason: 'Please complete a quick questionnaire to continue.',
      action: 'show_questionnaire',
      currentUsage,
      totalAllowed,
      remaining: 0,
    }
  }
  
  // Questionnaire completed but still no remaining - need manual approval
  const potentialWithApproval = calculateTotalAllowed(
    limits,
    true,
    session.manualApprovalsCount + 1
  )
  
  // Check if another approval would help (not at hard cap)
  if (potentialWithApproval > totalAllowed && potentialWithApproval <= limits.hardCap) {
    return {
      allowed: false,
      reason: 'You have used all available messages. A request has been sent for additional access.',
      action: 'request_approval',
      currentUsage,
      totalAllowed,
      remaining: 0,
    }
  }
  
  // At hard cap
  return {
    allowed: false,
    reason: 'You have reached the maximum usage limit. Please contact the agent directly.',
    action: 'blocked',
    currentUsage,
    totalAllowed: limits.hardCap,
    remaining: 0,
  }
}

/**
 * Calculate how many messages to grant on approval
 */
export function getMessagesToGrant(
  config: Partial<AIConfig>,
  source: 'chat' | 'estimator'
): number {
  const limits = getEffectiveLimits(config, source)
  return limits.manualApprove
}