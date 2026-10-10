const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createFirewallAccess } = require('../electron/firewall');

const executable = "C:\\Users\\O'Brien\\Temp\\TorrasLiveInteractionPortable\\Torras Live Interaction.exe";
const defaults = { platform: 'win32', packaged: true, executable, firstPort: 3000, lastPort: 3020 };

for (const [name, results, elevated, success] of [
  ['already authorized: no UAC', [true], [false], true],
  ['first authorization: provision and verify', [false, true, true], [false, true, false], true],
  ['UAC cancelled: fail without opening LAN', [false, false], [false, true], false],
  ['policy still blocks after approval: fail', [false, true, false], [false, true, false], false]
]) {
  test(name, async () => {
    const calls = [];
    const ensure = createFirewallAccess({ ...defaults, runPowerShell: async (command, admin = false) => {
      calls.push({ command, admin });
      return results[calls.length - 1];
    } });
    assert.equal(await ensure(), success);
    assert.deepEqual(calls.map((call) => call.admin), elevated);
    if (calls.some((call) => call.admin)) {
      const command = calls.find((call) => call.admin).command;
      assert.ok(command.includes("$rule.LocalPorts = '3000-3020'"));
      assert.ok(command.includes('LocalSubnet,10.0.0.0/255.0.0.0,172.16.0.0/255.240.0.0,192.168.0.0/255.255.0.0'));
      assert.ok(command.includes("O''Brien"));
      assert.ok(!command.includes('Set-NetFirewallProfile'));
      assert.ok(!command.includes('Get-NetFirewallRule'));
    }
  });
}

test('development and non-Windows never request UAC', async () => {
  for (const options of [{ packaged: false }, { platform: 'darwin' }]) {
    const ensure = createFirewallAccess({ ...defaults, ...options, runPowerShell: () => { throw new Error('Unexpected authorization'); } });
    assert.equal(await ensure(), true);
  }
});

// Run the generated PowerShell with fixture COM objects, without changing
// the computer's firewall. This catches PowerShell syntax/coercion mistakes.
test('Windows effective firewall policy scenarios', { skip: process.platform !== 'win32' }, async (t) => {
  let command;
  await createFirewallAccess({ ...defaults, runPowerShell: async (script) => { command = script; return true; } })();
  const allow = {
    Name: 'Torras Live Interaction 局域网互动', ApplicationName: executable,
    Enabled: true, Direction: 1, Action: 1, Profiles: 2147483647, Protocol: 6,
    LocalPorts: '3000-3020', ServiceName: '', InterfaceTypes: 'All',
    RemoteAddresses: '192.168.0.0/16,LocalSubnet,172.16.0.0/12,10.0.0.0/8'
  };
  const scenarios = [
    ['valid rule including canonical CIDR addresses', {}, 0],
    ['missing rule', { rules: [] }, 2],
    ['old subnet-only authorization needs migration', { rules: [{ ...allow, RemoteAddresses: 'LocalSubnet' }] }, 2],
    ['old executable path', { rules: [{ ...allow, ApplicationName: 'C:\\old.exe' }] }, 2],
    ['wrong ports', { rules: [{ ...allow, LocalPorts: '3000' }] }, 2],
    ['disabled authorization', { rules: [{ ...allow, Enabled: false }] }, 2],
    ['matching application blocked', { rules: [allow, { ...allow, Name: 'block', Action: 0, LocalPorts: '*' }] }, 2],
    ['global TCP block', { rules: [allow, { ...allow, Name: 'block', Action: 0, ApplicationName: '', Protocol: 256 }] }, 2],
    ['unrelated port block', { rules: [allow, { ...allow, Name: 'block', Action: 0, LocalPorts: '80' }] }, 0],
    ['unrelated program block', { rules: [allow, { ...allow, Name: 'block', Action: 0, ApplicationName: 'C:\\other.exe' }] }, 0],
    ['inactive profile block', { rules: [allow, { ...allow, Name: 'block', Action: 0, Profiles: 4 }] }, 0],
    ['local rules refused by policy', { modifyState: 2 }, 2],
    ['all inbound blocked', { blockAll: true }, 2],
    ['firewall disabled', { enabled: false, rules: [] }, 0]
  ];
  for (const [name, overrides, expected] of scenarios) {
    await t.test(name, () => {
      const fixture = Buffer.from(JSON.stringify({ rules: [allow], enabled: true, blockAll: false, modifyState: 0, ...overrides }), 'utf8').toString('base64');
      const mocks = `
$fixture = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${fixture}')) | ConvertFrom-Json
$fixturePolicy = [pscustomobject]@{ CurrentProfileTypes = 2; LocalPolicyModifyState = $fixture.modifyState; Rules = $fixture.rules }
$fixturePolicy | Add-Member -MemberType ScriptMethod -Name FirewallEnabled -Value { param($profile) $fixture.enabled }
$fixturePolicy | Add-Member -MemberType ScriptMethod -Name BlockAllInboundTraffic -Value { param($profile) $fixture.blockAll }
function New-Object { param($ComObject) if ($ComObject -ne 'HNetCfg.FwPolicy2') { throw 'Unexpected COM object' }; $fixturePolicy }
`;
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(mocks + command, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
      assert.equal(result.status, expected, result.stderr || String(result.error || ''));
    });
  }
});

test('status check uses the fast firewall policy API and validates the full rule', async () => {
  let statusCommand;
  await createFirewallAccess({ ...defaults, runPowerShell: async (command) => { statusCommand = command; return true; } })();
  assert.ok(statusCommand.includes('HNetCfg.FwPolicy2'));
  assert.ok(statusCommand.includes('$policy.CurrentProfileTypes'));
  assert.ok(statusCommand.includes('$policy.BlockAllInboundTraffic'));
  assert.ok(statusCommand.includes('$policy.LocalPolicyModifyState'));
  assert.ok(statusCommand.includes("$rule.LocalPorts -eq '3000-3020'"));
  assert.ok(statusCommand.includes("$rule.ApplicationName -ieq 'C:\\Users\\O''Brien"));
  assert.ok(statusCommand.includes('Compare-Object $expectedAddresses $addresses'));
  assert.ok(!statusCommand.includes('Get-NetFirewallRule'));
  assert.ok(!statusCommand.includes('Get-NetConnectionProfile'));
});

test('provision uses a real Windows rule object without modifying live policy', { skip: process.platform !== 'win32' }, async () => {
  let command;
  await createFirewallAccess({ ...defaults, runPowerShell: async (script, elevated) => {
    if (elevated) command = script;
    return false;
  } })();
  const encodedPath = Buffer.from(executable, 'utf8').toString('base64');
  const mocks = `
$appPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))
$currentBlock = [pscustomobject]@{ Name = 'duplicate block name'; ApplicationName = $appPath; Direction = 1; Action = 0; Enabled = $true }
$otherBlock = [pscustomobject]@{ Name = 'duplicate block name'; ApplicationName = 'C:\\other.exe'; Direction = 1; Action = 0; Enabled = $true }
$rules = [System.Collections.ArrayList]@($currentBlock, $otherBlock)
$fixturePolicy = [pscustomobject]@{ Rules = $rules }
function New-Object { param($ComObject) if ($ComObject -eq 'HNetCfg.FwPolicy2') { $fixturePolicy } else { Microsoft.PowerShell.Utility\\New-Object -ComObject $ComObject } }
`;
  const report = `
$created = $rules[$rules.Count - 1]
[pscustomobject]@{ currentBlockEnabled = $currentBlock.Enabled; otherBlockEnabled = $otherBlock.Enabled; application = $created.ApplicationName; ports = $created.LocalPorts; addresses = $created.RemoteAddresses; enabled = $created.Enabled; action = $created.Action; protocol = $created.Protocol; profiles = $created.Profiles } | ConvertTo-Json -Compress
`;
  const script = mocks + command.replace(/exit 0$/, '') + report;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || String(result.error || ''));
  const data = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(data.currentBlockEnabled, false);
  assert.equal(data.otherBlockEnabled, true);
  assert.equal(data.application, executable);
  assert.equal(data.ports, '3000-3020');
  assert.ok(data.addresses.includes('10.0.0.0/'));
  assert.ok(data.addresses.includes('172.16.0.0/'));
  assert.ok(data.addresses.includes('192.168.0.0/'));
  assert.equal(data.enabled, true);
  assert.equal(data.action, 1);
  assert.equal(data.protocol, 6);
  assert.equal(data.profiles, 2147483647);
});
