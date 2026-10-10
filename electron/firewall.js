const RULE_NAME = 'TorrasLiveInteraction-LAN';
const RULE_DISPLAY_NAME = 'Torras Live Interaction 局域网互动';
// Company Wi-Fi can route phones and PCs between different private subnets.
// Keep the exception scoped to this executable and its interaction ports.
const REMOTE_ADDRESSES = 'LocalSubnet,10.0.0.0/255.0.0.0,172.16.0.0/255.240.0.0,192.168.0.0/255.255.0.0';

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function createFirewallAccess({ platform, packaged, executable, firstPort, lastPort, runPowerShell }) {
  const ports = firstPort === lastPort ? String(firstPort) : `${firstPort}-${lastPort}`;
  const statusCommand = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    '$policy = New-Object -ComObject HNetCfg.FwPolicy2',
    '$activeProfiles = [int]$policy.CurrentProfileTypes',
    '$enabledProfiles = 0; foreach ($profile in @(1,2,4)) { if (($activeProfiles -band $profile) -and $policy.FirewallEnabled($profile)) { if ($policy.BlockAllInboundTraffic($profile)) { exit 2 }; $enabledProfiles = $enabledProfiles -bor $profile } }',
    'if (-not $enabledProfiles) { exit 0 }',
    'if ($policy.LocalPolicyModifyState -ne 0) { exit 2 }',
    // The COM API reads the same effective Windows firewall policy without
    // repeatedly loading/querying NetSecurity CIM providers for each rule.
    '$authorized = $false',
    `$expectedAddresses = @(${literal(REMOTE_ADDRESSES)}.Split(',') | Sort-Object)`,
    'foreach ($rule in $policy.Rules) {',
    '$profileMatches = ([int]$rule.Profiles -band $enabledProfiles) -ne 0;',
    `$applicationMatches = -not $rule.ApplicationName -or $rule.ApplicationName -eq 'Any' -or $rule.ApplicationName -ieq ${literal(executable)};`,
    'if ($rule.Enabled -and $rule.Direction -eq 1 -and $rule.Action -eq 0 -and $profileMatches -and $applicationMatches -and ($rule.Protocol -eq 6 -or $rule.Protocol -eq 256)) {',
    '$portMatches = -not $rule.LocalPorts -or $rule.LocalPorts -eq "*";',
    `foreach ($entry in ([string]$rule.LocalPorts).Split(',')) { if ($entry.Trim() -match '^([0-9]+)(?:-([0-9]+))?$') { $low = [int]$Matches[1]; $high = $low; if ($Matches[2]) { $high = [int]$Matches[2] }; if ($low -le ${lastPort} -and $high -ge ${firstPort}) { $portMatches = $true } } };`,
    'if ($portMatches) { exit 2 }',
    '}',
    `$managed = $rule.Name -eq ${literal(RULE_DISPLAY_NAME)} -or $rule.Name -eq ${literal(RULE_NAME)};`,
    '$addresses = @(([string]$rule.RemoteAddresses).Split(",") | ForEach-Object { $_.Trim().Replace("/8", "/255.0.0.0").Replace("/12", "/255.240.0.0").Replace("/16", "/255.255.0.0") } | Sort-Object);',
    `if ($managed -and $rule.Enabled -and $rule.Direction -eq 1 -and $rule.Action -eq 1 -and ($rule.Profiles -band 7) -eq 7 -and $rule.ApplicationName -ieq ${literal(executable)} -and $rule.Protocol -eq 6 -and $rule.LocalPorts -eq ${literal(ports)} -and -not $rule.ServiceName -and $rule.InterfaceTypes -eq 'All' -and -not (Compare-Object $expectedAddresses $addresses)) { $authorized = $true }`,
    '}',
    'if (-not $authorized) { exit 2 }',
    'exit 0'
  ].join('\n');

  const provisionCommand = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    '$policy = New-Object -ComObject HNetCfg.FwPolicy2',
    // Windows can create blocks with duplicate display names. Disable only
    // the matching rule object; removing by name could affect another EXE.
    `foreach ($existing in $policy.Rules) { if ($existing.Direction -eq 1 -and $existing.Action -eq 0 -and $existing.ApplicationName -ieq ${literal(executable)}) { $existing.Enabled = $false } }`,
    `$remove = @($policy.Rules | Where-Object { ($_.Name -eq ${literal(RULE_DISPLAY_NAME)} -or $_.Name -eq ${literal(RULE_NAME)}) -and $_.ApplicationName -ieq ${literal(executable)} } | ForEach-Object { $_.Name } | Select-Object -Unique)`,
    'foreach ($name in $remove) { $policy.Rules.Remove($name) }',
    '$rule = New-Object -ComObject HNetCfg.FWRule',
    `$rule.Name = ${literal(RULE_DISPLAY_NAME)}`,
    `$rule.ApplicationName = ${literal(executable)}`,
    '$rule.Protocol = 6',
    `$rule.LocalPorts = ${literal(ports)}`,
    `$rule.RemoteAddresses = ${literal(REMOTE_ADDRESSES)}`,
    '$rule.Direction = 1; $rule.Action = 1; $rule.Profiles = 2147483647; $rule.Enabled = $true',
    '$policy.Rules.Add($rule)',
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
