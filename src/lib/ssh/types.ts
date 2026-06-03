export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SshClient {
  exec(command: string, timeoutMs?: number): Promise<SshExecResult>;
}
