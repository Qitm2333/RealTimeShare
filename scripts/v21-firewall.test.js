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
      assert.ok(command.includes("-LocalPort '3000-3020' -RemoteAddress LocalSubnet"));
      assert.ok(command.includes("O''Brien"));
      assert.ok(!command.includes('Set-NetFirewallProfile'));
    }
  });
}

test('development and non-Windows never request UAC', async () => {
  for (const options of [{ packaged: false }, { platform: 'darwin' }]) {
    const ensure = createFirewallAccess({ ...defaults, ...options, runPowerShell: () => { throw new Error('Unexpected authorization'); } });
    assert.equal(await ensure(), true);
  }
});

// Execute the exact generated status script against simulated NetSecurity
// cmdlets. These processes only read fixtures; no firewall rules are modified.
test('Windows effective-policy status scenarios', { skip: process.platform !== 'win32' }, async (t) => {
  let statusCommand;
  await createFirewallAccess({ ...defaults, runPowerShell: async (command) => { statusCommand = command; return true; } })();
  const allow = { Enabled: 'True', Direction: 'Inbound', Action: 'Allow', Profile: 'Any', Program: executable, Protocol: 'TCP', LocalPort: ['3000-3020'], RemoteAddress: ['LocalSubnet'] };
  const profile = { Name: 'Private', Enabled: 'True', AllowInboundRules: 'True', AllowLocalFirewallRules: 'True' };
  const scenarios = [
    ['valid persistent range', {}, 0],
    ['missing authorization', { rule: null }, 2],
    ['old executable path', { rule: { ...allow, Program: 'C:\\old.exe' } }, 2],
    ['wrong port', { rule: { ...allow, LocalPort: ['3000'] } }, 2],
    ['disabled rule', { rule: { ...allow, Enabled: 'False' } }, 2],
    ['current application blocked', { blocks: [{ ...allow, Profile: 2, Action: 'Block', LocalPort: ['Any'] }] }, 2],
    ['global TCP block', { blocks: [{ ...allow, Profile: 2, Action: 'Block', Program: 'Any', Protocol: 'Any' }] }, 2],
    ['unrelated port block', { blocks: [{ ...allow, Profile: 2, Action: 'Block', LocalPort: ['80'] }] }, 0],
    ['unrelated application block', { blocks: [{ ...allow, Profile: 2, Action: 'Block', Program: 'C:\\other.exe' }] }, 0],
    ['inactive profile block', { blocks: [{ ...allow, Profile: 4, Action: 'Block' }] }, 0],
    ['active profile refuses local rules', { profiles: [{ ...profile, AllowLocalFirewallRules: 'False' }] }, 2],
    ['inactive profile refuses local rules', { profiles: [profile, { ...profile, Name: 'Public', AllowLocalFirewallRules: 'False' }] }, 0],
    ['firewall disabled', { profiles: [{ ...profile, Enabled: 'False' }], rule: null }, 0]
  ];
  for (const [name, overrides, expectedCode] of scenarios) {
    await t.test(name, () => {
      const fixture = Buffer.from(JSON.stringify({ rule: allow, blocks: [], profiles: [profile], ...overrides }), 'utf8').toString('base64');
      const mocks = `
$fixture = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${fixture}')) | ConvertFrom-Json
function Get-NetConnectionProfile { [pscustomobject]@{ NetworkCategory = 'Private' } }
function Get-NetFirewallProfile { param($PolicyStore) $fixture.profiles }
function Get-NetFirewallRule { param($PolicyStore, $Name, $Direction, $Action, $Enabled) if ($Name) { $fixture.rule } else { $fixture.blocks } }
function Get-NetFirewallApplicationFilter { param([Parameter(ValueFromPipeline=$true)]$InputObject) process { $InputObject } }
function Get-NetFirewallPortFilter { param([Parameter(ValueFromPipeline=$true)]$InputObject) process { $InputObject } }
function Get-NetFirewallAddressFilter { param([Parameter(ValueFromPipeline=$true)]$InputObject) process { $InputObject } }
`;
      const command = Buffer.from(mocks + statusCommand, 'utf16le').toString('base64');
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.equal(result.status, expectedCode, result.stderr || String(result.error || ''));
    });
  }
});
