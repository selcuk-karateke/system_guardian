import type { SshClient, SshExecResult } from "./types";

const FIXTURES: Record<string, string> = {
  uptime: " 09:00:00 up 45 days,  3:22,  2 users,  load average: 0.52, 0.48, 0.45\n",
  "cat /proc/loadavg": "0.52 0.48 0.45 2/412 12345\n",
  nproc: "4\n",
  "free -b": `               total        used        free      shared  buff/cache   available
Mem:    16777216000  8388608000  4194304000   524288000  4194304000  7549747200
Swap:    4294967296           0  4294967296
`,
  "df -h": `Filesystem      Size  Used Avail Use% Mounted on
/dev/md0        500G  200G  280G  42% /
/dev/md1        2.0T  1.2T  700G  63% /data
`,
  "cat /proc/mdstat": `Personalities : [raid1] [raid6] [raid5] [raid4] [raid0] [raid10] [linear] 
md0 : active raid1 sda1[0] sdb1[1]
      524288 blocks super 1.2 [2/2] [UU]
`,
  "docker ps -a --format '{{json .}}'": [
    '{"ID":"a1","Names":"coolify","Image":"coolifyio/coolify","Status":"Up 2 weeks (healthy)","State":"running"}',
    '{"ID":"a2","Names":"coolify-realtime","Image":"coolifyio/realtime","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"a3","Names":"coolify-db","Image":"postgres:16","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"a4","Names":"coolify-redis","Image":"redis:7","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"a5","Names":"coolify-proxy","Image":"traefik","Status":"Up 2 weeks","State":"running"}',
    '{"ID":"b1","Names":"old-backup","Image":"alpine","Status":"Exited (0) 3 days ago","State":"exited"}',
  ].join("\n"),
  "ss -tulpn": `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
tcp   LISTEN 0      128    0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=1))
tcp   LISTEN 0      128    0.0.0.0:80         0.0.0.0:*    users:(("nginx",pid=2))
tcp   LISTEN 0      128    0.0.0.0:443        0.0.0.0:*    users:(("nginx",pid=2))
`,
  "cat /root/.ssh/authorized_keys": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey user@host\n",
  "cat '/etc/ssh/sshd_config'": "Port 22\nPermitRootLogin prohibit-password\n",
  "cat '/etc/sudoers'": "Defaults env_reset\n",
  "cat /etc/passwd": `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
deploy:x:1000:1000:Deploy User:/home/deploy:/bin/bash
`,
  "last -n 20": `deploy   pts/0        203.0.113.10     Wed Jun  3 08:00   still logged in
root     pts/1        198.51.100.5     Tue Jun  2 14:00 - 14:30  (00:30)
`,
  "grep -i 'Failed password' /var/log/auth.log 2>/dev/null | tail -20": "Jun  3 07:00:00 sshd[999]: Failed password for invalid user admin from 203.0.113.99 port 22\n",
  "ls -la /etc/cron.d /var/spool/cron/crontabs 2>/dev/null": "/etc/cron.d/backup\n",
  "for period in daily": `periodic\tcron.daily\tman-db
periodic\tcron.daily\tlogrotate
periodic\tcron.daily\tdpkg
periodic\tcron.daily\taptitude
periodic\tcron.daily\tapt-compat
file\tcron.d\tbackup\t0 3 * * * root /usr/local/bin/backup.sh
crontab\troot\t0 2 * * * /usr/local/bin/backup.sh
`,
  "crontab -l 2>/dev/null": "0 2 * * * /usr/local/bin/backup.sh\n",
  "which nmap": "",
  "which masscan": "",
  "which zmap": "",
  "which rustscan": "",
  "journalctl -p err": "",
  "dmesg 2>/dev/null | tail -80": "",
  sensors: "Core 0:        +42.0°C\n",
};

function matchFixture(command: string): string {
  for (const [key, value] of Object.entries(FIXTURES)) {
    if (command.includes(key) || command === key) return value;
  }
  if (command.includes("kawai-complete-backup") || command.includes("*.tar.gz")) {
    const now = Math.floor(Date.now() / 1000) - 3600;
    return `/root/kawai-complete-backup.tar.gz\n${now} 12884901888 /root/kawai-complete-backup.tar.gz\n`;
  }
  if (command.includes("ls -1d") && command.includes("*.tar.gz")) {
    return "/root/kawai-complete-backup.tar.gz\n";
  }
  if (command.includes("/data/coolify/backups")) {
    const now = Math.floor(Date.now() / 1000) - 7200;
    return `${now} 524288000 /data/coolify/backups/db/app-2026-06-03.sql.gz\n${now - 86400} 520000000 /data/coolify/backups/db/app-2026-06-02.sql.gz\n`;
  }
  if (command.startsWith("find ") || command.includes("stat -c")) {
    const now = Math.floor(Date.now() / 1000) - 3600;
    if (command.includes("/data/coolify/backups")) {
      return `${now} 524288000 /data/coolify/backups/db/app-2026-06-03.sql.gz\n`;
    }
    if (command.includes("/root/")) {
      return `${now} 12884901888 /root/kawai-complete-backup.tar.gz\n`;
    }
    return "";
  }
  if (command.includes("psql") || command.includes("mysql")) {
    return " db_size | 104857600\n(1 row)\n";
  }
  if (command.includes("dpkg -l")) return "";
  return "";
}

export class MockSshClient implements SshClient {
  async exec(command: string): Promise<SshExecResult> {
    await new Promise((r) => setTimeout(r, 10));
    const stdout = matchFixture(command);
    return { stdout, stderr: "", code: stdout ? 0 : 0 };
  }
}
