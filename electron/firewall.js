const RULE_NAME = 'TorrasLiveInteraction-LAN';

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function createFirewallAccess({ platform, packaged, executable, firstPort, lastPort, runPowerShell }) {
  const ports = firstPort === lastPort ? String(firstPort) : `${firstPort}-${lastPort}`;
  const statusCommand = [
    "$ErrorActionPreference = 'Stop'",
    '$activeProfiles = @(Get-NetConnectionProfile | ForEach-Object { if ($_.NetworkCategory -eq "DomainAuthenticated") { "Domain" } else { [string]$_.NetworkCategory } } | Select-Object -Unique)',
    'if (-not $activeProfiles.Count) { $activeProfiles = @("Domain", "Private", "Public") }',
    '$profiles = @(Get-NetFirewallProfile -PolicyStore ActiveStore | Where-Object { $_.Name -in $activeProfiles -and $_.Enabled -eq "True" })',
    'if (-not $profiles.Count) { exit 0 }',
    'if ($profiles | Where-Object { $_.AllowInboundRules -eq "False" -or $_.AllowLocalFirewallRules -eq "False" }) { exit 2 }',
    `$rule = Get-NetFirewallRule -PolicyStore ActiveStore -Name ${literal(RULE_NAME)} -ErrorAction SilentlyContinue`,
    'if (-not $rule -or @($rule).Count -ne 1) { exit 2 }',
    '$appFilter = $rule | Get-NetFirewallApplicationFilter',
    '$portFilter = $rule | Get-NetFirewallPortFilter',
    '$addressFilter = $rule | Get-NetFirewallAddressFilter',
    `if ($rule.Enabled -ne 'True' -or $rule.Direction -ne 'Inbound' -or $rule.Action -ne 'Allow' -or $rule.Profile -ne 'Any' -or $appFilter.Program -ine ${literal(executable)} -or $portFilter.Protocol -ne 'TCP' -or [string]$portFilter.LocalPort -ne ${literal(ports)} -or [string]$addressFilter.RemoteAddress -ne 'LocalSubnet') { exit 2 }`,
    // Block rules take precedence over Allow. Check effective policy, including
    // global rules, but only protocols/ports/profiles relevant to this app.
    '$profileBits = @{ Domain = 1; Private = 2; Public = 4 }',
    '$blocked = @(Get-NetFirewallRule -PolicyStore ActiveStore -Direction Inbound -Action Block -Enabled True | Where-Object {',
    '$candidate = $_; $profileMatches = $candidate.Profile -eq "Any"; foreach ($profile in $profiles) { if (([int]$candidate.Profile -band $profileBits[[string]$profile.Name]) -ne 0) { $profileMatches = $true } };',
    '$application = ($candidate | Get-NetFirewallApplicationFilter).Program;',
    `$applicationMatches = $application -eq 'Any' -or $application -ieq ${literal(executable)};`,
    '$filter = $candidate | Get-NetFirewallPortFilter; $portMatches = $false;',
    `foreach ($entry in $filter.LocalPort) { if ($entry -eq 'Any') { $portMatches = $true } elseif ($entry -match '^([0-9]+)(?:-([0-9]+))?$') { $low = [int]$Matches[1]; $high = $low; if ($Matches[2]) { $high = [int]$Matches[2] }; if ($low -le ${lastPort} -and $high -ge ${firstPort}) { $portMatches = $true } } };`,
    '$profileMatches -and $applicationMatches -and $portMatches -and ($filter.Protocol -eq "TCP" -or $filter.Protocol -eq "Any")',
    '})',
    'if ($blocked.Count) { exit 2 }',
    'exit 0'
  ].join('\n');

  const provisionCommand = [
    "$ErrorActionPreference = 'Stop'",
    `$existing = Get-NetFirewallRule -Name ${literal(RULE_NAME)} -ErrorAction SilentlyContinue`,
    'if ($existing) { $existing | Remove-NetFirewallRule }',
    `Get-NetFirewallRule -Direction Inbound -Action Block -ErrorAction SilentlyContinue | Where-Object { ($_ | Get-NetFirewallApplicationFilter).Program -ieq ${literal(executable)} } | Remove-NetFirewallRule`,
    `New-NetFirewallRule -Name ${literal(RULE_NAME)} -DisplayName 'Torras Live Interaction 局域网互动' -Direction Inbound -Action Allow -Enabled True -Profile Any -Program ${literal(executable)} -Protocol TCP -LocalPort ${literal(ports)} -RemoteAddress LocalSubnet | Out-Null`,
    'exit 0'
  ].join('\n');

  return async function ensureFirewallAccess() {
    if (platform !== 'win32' || !packaged) return true;
    if (await runPowerShell(statusCommand)) return true;
    if (!await runPowerShell(provisionCommand, true)) return false;
    return runPowerShell(statusCommand);
  };
}

module.exports = { createFirewallAccess };
