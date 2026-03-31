// fix-estimator-buyer-modal.js
// Fixes 3 hardcoded System 1 calls in EstimatorBuyerModal for WALLiam routing
const fs = require('fs')
const path = require('path')

const filePath = path.join(process.cwd(), 'app', 'estimator', 'components', 'EstimatorBuyerModal.tsx')
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')

// ── Fix 1: Poll URL (GET vip-request) ─────────────────────────────────────────
// Old: always polls /api/chat/vip-request
// New: polls WALLiam route when tenantId present
const OLD_POLL = `        const response = await fetch(\`/api/chat/vip-request?requestId=\${session.vipRequestId}\`)`
const NEW_POLL = `        const pollUrl = tenantId
          ? \`/api/walliam/estimator/vip-request?requestId=\${session.vipRequestId}\`
          : \`/api/chat/vip-request?requestId=\${session.vipRequestId}\`
        const response = await fetch(pollUrl)`

if (!content.includes(OLD_POLL)) {
  console.error('❌ Fix 1 target not found — check file manually')
  process.exit(1)
}
content = content.replace(OLD_POLL, NEW_POLL)
console.log('✅ Fix 1 applied — poll URL conditional')

// ── Fix 2: handleVipAccept — POST vip-request + post-accept routing ───────────
// Old: always posts to /api/chat/vip-request, always shows VipForm after
// New: posts to WALLiam route when tenantId; no form for WALLiam (skip to estimate or waiting)
const OLD_VIP_ACCEPT = `    try {
      const response = await fetch('/api/chat/vip-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          phone,
          fullName: '',
          email: '',
          budgetRange: '',
          timeline: '',
          buyerType: '',
          requirements: '',
          pageUrl: window.location.href,
          buildingName,
          requestSource: 'estimator'
        })
      })

      const result = await response.json()

      if (result.success) {
        setSession(prev => ({
          ...prev,
          vipRequestId: result.requestId,
          vipRequestStatus: result.status === 'approved' ? 'approved' : 'pending'
        }))
        setShowVipPrompt(false)
        setShowVipForm(true)
      } else {
        setError(result.error || 'Failed to submit request')
      }`

const NEW_VIP_ACCEPT = `    try {
      const vipUrl = tenantId
        ? '/api/walliam/estimator/vip-request'
        : '/api/chat/vip-request'
      const vipBody = tenantId
        ? { sessionId: session.sessionId, phone, pageUrl: window.location.href, buildingName }
        : {
            sessionId: session.sessionId,
            phone,
            fullName: '',
            email: '',
            budgetRange: '',
            timeline: '',
            buyerType: '',
            requirements: '',
            pageUrl: window.location.href,
            buildingName,
            requestSource: 'estimator'
          }
      const response = await fetch(vipUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vipBody)
      })

      const result = await response.json()

      if (result.success) {
        const newStatus = result.status === 'approved' ? 'approved' : 'pending'
        setSession(prev => ({
          ...prev,
          vipRequestId: result.requestId,
          vipRequestStatus: newStatus
        }))
        setShowVipPrompt(false)
        if (tenantId) {
          // WALLiam: no questionnaire — go straight to estimate or waiting
          if (newStatus === 'approved') {
            checkAndEstimate()
          } else {
            setShowWaiting(true)
          }
        } else {
          setShowVipForm(true)
        }
      } else {
        setError(result.error || 'Failed to submit request')
      }`

if (!content.includes(OLD_VIP_ACCEPT)) {
  console.error('❌ Fix 2 target not found — check file manually')
  process.exit(1)
}
content = content.replace(OLD_VIP_ACCEPT, NEW_VIP_ACCEPT)
console.log('✅ Fix 2 applied — handleVipAccept conditional routing + no-form for WALLiam')

// ── Fix 3: handleQuestionnaireSubmit — guard for WALLiam (should never run) ───
// WALLiam session always returns questionnaireCompleted: true so VipForm never shows.
// Guard added defensively so if it somehow fires, it's a no-op for WALLiam.
const OLD_QUESTIONNAIRE = `  const handleQuestionnaireSubmit = async (data: VipRequestData) => {
    setVipLoading(true)
    try {
      const response = await fetch('/api/chat/vip-questionnaire', {`

const NEW_QUESTIONNAIRE = `  const handleQuestionnaireSubmit = async (data: VipRequestData) => {
    // WALLiam: questionnaireCompleted is always true — this should never be called
    if (tenantId) {
      checkAndEstimate()
      return
    }
    setVipLoading(true)
    try {
      const response = await fetch('/api/chat/vip-questionnaire', {`

if (!content.includes(OLD_QUESTIONNAIRE)) {
  console.error('❌ Fix 3 target not found — check file manually')
  process.exit(1)
}
content = content.replace(OLD_QUESTIONNAIRE, NEW_QUESTIONNAIRE)
console.log('✅ Fix 3 applied — handleQuestionnaireSubmit guarded for WALLiam')

// Write back
fs.writeFileSync(filePath, content, 'utf8')
console.log('✅ EstimatorBuyerModal.tsx updated successfully')