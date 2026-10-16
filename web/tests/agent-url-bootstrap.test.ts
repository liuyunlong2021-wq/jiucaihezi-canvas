import { expect, test } from 'bun:test';
import { readAgentUrlBootstrap, agentSessionMode } from '../src/lib/agent/agent-url-bootstrap';

test('tools bootstrap decodes credentials and removes only connection parameters', () => {
    const value = readAgentUrlBootstrap('#agentUrl=http%3A%2F%2F127.0.0.1%3A17371&agentToken=a%2Bb%26c&agentMode=tools&keep=yes');
    expect(value).toEqual({ url: 'http://127.0.0.1:17371', token: 'a+b&c', mode: 'tools', remainingHash: '#keep=yes' });
});

test('tools mode survives fragment removal and reload, while manual Codex mode stays available', () => {
    expect(agentSessionMode('', 'tools')).toBe('tools');
    expect(agentSessionMode('#agentMode=codex', 'tools')).toBe('codex');
    expect(agentSessionMode('', null)).toBe('codex');
    expect(readAgentUrlBootstrap('#keep=yes')).toBe(null);
    expect(readAgentUrlBootstrap('#agentUrl=http://127.0.0.1:17371&agentToken=t')?.mode).toBe('codex');
});
