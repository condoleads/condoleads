$p = "app\api\charlie\plan-email\route.ts"
$content = [System.IO.File]::ReadAllText($p)

$find = @"
    if (!userId || !planType) {
      return NextResponse.json({ error: 'userId and planType required' }, { status: 400 })
    }
"@ -replace "`r`n", "`n"

$replace = @"
    if (!sessionId || !userId || !planType) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // W-RECOVERY A1.5 auth gate — verify session belongs to userId before any email fires
    const _gateSupabase = createServiceClient()
    const { data: validSession } = await _gateSupabase
      .from('chat_sessions')
      .select('id, tenant_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('source', 'walliam')
      .maybeSingle()
    if (!validSession) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    // END W-RECOVERY A1.5 auth gate
"@ -replace "`r`n", "`n"

$normalized = $content -replace "`r`n", "`n"
$count = ([regex]::Matches($normalized, [regex]::Escape($find))).Count

if ($count -ne 1) {
  Write-Host "FAIL: anchor matched $count times, expected 1"
  return
}

$patched = $normalized.Replace($find, $replace) -replace "`n", "`r`n"
[System.IO.File]::WriteAllText($p, $patched, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: plan-email auth gate inserted"